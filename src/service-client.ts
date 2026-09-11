import * as http from 'node:http';
import * as https from 'node:https';
import * as vscode from 'vscode';
import { ContinuityDecision } from './data-import';
import { KnowledgeSnapshot } from './model';
import { ExtractedDocument } from './pdf-documents';
import { rankRetrievalResults } from './retrieval';
import { resolveServiceUrlCached } from './service-resolver';

type BackendMode = 'auto' | 'local' | 'service';

export interface KnowledgeServiceConfiguration {
	mode: BackendMode;
	url: string;
}

export function getKnowledgeServiceConfiguration(): KnowledgeServiceConfiguration {
	const primary = vscode.workspace.getConfiguration('contextRecall');
	const legacy = vscode.workspace.getConfiguration('knowledgeAgent');
	// 命名迁移（单名制）：新键优先，旧键回退，保证既有用户设置继续生效。
	const mode = primary.get<BackendMode>('backend') ?? legacy.get<BackendMode>('backend') ?? 'auto';
	const url = primary.get<string>('serviceUrl') ?? legacy.get<string>('serviceUrl') ?? 'http://127.0.0.1:8765';
	return {
		mode,
		url: url.replace(/\/+$/, ''),
	};
}

export interface ServiceMemory {
	id: string;
	type: string;
	summary: string;
	resolution: string;
	status: string;
	source?: 'graph' | 'semantic' | 'lexical';
	evidence?: Array<{ kind?: string; id?: string }>;
	source_refs?: string[];
	confidence?: string;
	updated_at?: string;
	retrievalScore?: number;
	semanticScore?: number;
	connections?: ServiceConnection[];
}

export interface ServiceConnection {
	edge_id?: string;
	type: string;
	direction: 'incoming' | 'outgoing';
	neighbor_id?: string;
	neighbor_title: string;
	neighbor_type?: string;
	confidence?: string;
	evidence?: string[];
}

interface ServiceSearchResponse {
	lexical: ServiceMemory[];
	semantic?: Array<{ source_id: string; score: number }>;
	semantic_memories: ServiceMemory[];
	graph: ServiceMemory[];
	graph_error?: string;
}

export function rankServiceSearchResults(query: string, result: ServiceSearchResponse, limit: number): ServiceMemory[] {
	const semanticScores = new Map((result.semantic ?? []).map((item) => [item.source_id, item.score]));
	const semanticMemories = (result.semantic_memories ?? []).map((memory) => ({
		...memory,
		semanticScore: semanticScores.get(memory.id),
	}));
	return rankRetrievalResults(query, [
		{ items: semanticMemories, name: 'semantic', weight: 1.4, relevanceScore: (item) => item.semanticScore },
		{ items: result.lexical ?? [], name: 'lexical', weight: 1.2 },
		{ items: result.graph ?? [], name: 'graph', weight: 0.8, requireTermOverlap: true },
	], limit);
}

export interface ServiceHealth {
	available: boolean;
	mode: BackendMode;
	url: string;
	memory?: { total: number; active: number; candidate: number; raw: number; continuity: number };
	vectors?: { total: number; dimensions: number };
	databases?: {
		memory?: { engine: string; path: string; size_bytes: number; features: string[] };
		vectors?: { engine: string; path: string; size_bytes: number; features: string[] };
	};
	neo4j?: {
		configured: boolean;
		ready: boolean;
		endpoint: string;
		database: string;
		nodes?: number;
		relationships?: number;
		error?: string;
	};
}

function requestJson<T>(url: URL, method: 'GET' | 'POST', body?: unknown, timeoutMs = 2500): Promise<T> {
	return new Promise((resolve, reject) => {
		const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
		const transport = url.protocol === 'https:' ? https : http;
		const request = transport.request(url, {
			method,
			headers: payload ? { 'content-type': 'application/json', 'content-length': payload.length } : undefined,
			timeout: timeoutMs,
		}, (response) => {
			const chunks: Buffer[] = [];
			response.on('data', (chunk: Buffer) => chunks.push(chunk));
			response.on('end', () => {
				const responseText = Buffer.concat(chunks).toString('utf8');
				if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
					const detail = responseText.trim().slice(0, 240);
					reject(new Error(`service returned HTTP ${response.statusCode ?? 'unknown'}${detail ? `: ${detail}` : ''}`));
					return;
				}
				try {
					resolve(JSON.parse(responseText) as T);
				} catch (error) {
					reject(error);
				}
			});
		});
		request.on('timeout', () => request.destroy(new Error(`service request timed out after ${Math.round(timeoutMs / 1000)} seconds`)));
		request.on('error', reject);
		if (payload) {
			request.write(payload);
		}
		request.end();
	});
}

export class KnowledgeServiceClient {
	async health(): Promise<ServiceHealth> {
		const { mode, url } = getKnowledgeServiceConfiguration();
		if (mode === 'local') {
			return { available: false, mode, url };
		}
		// 服务常绑定在具体网卡地址而非回环地址，配置不可达时逐个探测候选地址。
		const resolution = await resolveServiceUrlCached(url);
		try {
			const result = await requestJson<Omit<ServiceHealth, 'available' | 'mode' | 'url'>>(new URL(`${resolution.url}/health`), 'GET');
			return { ...result, available: true, mode, url: resolution.url };
		} catch {
			return { available: false, mode, url: resolution.url };
		}
	}

	async search(query: string, embedding: number[], scope: { workspaceId: string; sessionId: string }, limit = 6): Promise<ServiceMemory[] | undefined> {
		const health = await this.health();
		if (!health.available) {
			if (health.mode === 'service') {
				throw new Error(`Context Recall service is unavailable at ${health.url}`);
			}
			return undefined;
		}
		const result = await requestJson<ServiceSearchResponse>(new URL(`${health.url}/v1/search`), 'POST', {
			query,
			embedding,
			workspace_id: scope.workspaceId,
			session_id: scope.sessionId,
			limit,
		});
		return rankServiceSearchResults(query, result, limit);
	}

	async sync(snapshot: KnowledgeSnapshot): Promise<Record<string, unknown>> {
		const health = await this.health();
		if (!health.available) {
			throw new Error(`Context Recall service is unavailable at ${health.url}`);
		}
		return requestJson<Record<string, unknown>>(new URL(`${health.url}/v1/import/extension`), 'POST', snapshot, 120_000);
	}

	async importContinuity(input: {
		decisions: ContinuityDecision[];
		embeddings: Array<{ decisionId: string; values: number[] }>;
		source: string;
		workspaceId: string;
		repoId: string;
	}): Promise<Record<string, unknown>> {
		const health = await this.health();
		if (!health.available) {
			throw new Error(`Context Recall service is unavailable at ${health.url}`);
		}
		return requestJson<Record<string, unknown>>(new URL(`${health.url}/v1/import/continuity`), 'POST', {
			decisions: input.decisions,
			embeddings: input.embeddings,
			source: input.source,
			workspace_id: input.workspaceId,
			repo_id: input.repoId,
		}, 120_000);
	}

	async importDocuments(input: {
		documents: ExtractedDocument[];
		embeddings: Array<{ chunkId: string; values: number[] }>;
		workspaceId: string;
		repoId: string;
	}): Promise<Record<string, unknown>> {
		const health = await this.health();
		if (!health.available) {
			throw new Error(`Context Recall service is unavailable at ${health.url}`);
		}
		return requestJson<Record<string, unknown>>(new URL(`${health.url}/v1/import/documents`), 'POST', {
			documents: input.documents,
			embeddings: input.embeddings.map((item) => ({ chunkId: item.chunkId, values: item.values })),
			workspace_id: input.workspaceId,
			repo_id: input.repoId,
		}, 600_000);
	}
}