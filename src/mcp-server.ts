import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { KnowledgeSnapshot } from './model';
import { connectServiceSearchResults, SearchConnection } from './search-connections';
import { rankRetrievalResults } from './retrieval';
import { cosineSimilarity, embed } from './vector';

type BackendMode = 'auto' | 'local' | 'service';

interface ServiceMemory {
	id: string;
	type: string;
	summary: string;
	resolution: string;
	status: string;
	evidence?: Array<{ kind?: string; id?: string }>;
	source_refs?: string[];
	connections?: Array<{
		edge_id?: string;
		type: string;
		direction: 'incoming' | 'outgoing';
		neighbor_id?: string;
		neighbor_title: string;
		neighbor_type?: string;
		confidence?: string;
		evidence?: string[];
	}>;
	semanticScore?: number;
}

interface SearchItem extends ServiceMemory {
	source: 'graph' | 'semantic' | 'lexical' | 'local';
	score?: number;
}

interface ServiceSearchResponse {
	lexical: ServiceMemory[];
	semantic?: Array<{ source_id: string; score: number }>;
	semantic_memories: ServiceMemory[];
	graph: ServiceMemory[];
	graph_error?: string;
}

const backend = (process.env.CONTEXT_RECALL_BACKEND ?? process.env.KNOWLEDGE_AGENT_BACKEND ?? 'auto') as BackendMode;
const serviceUrl = (process.env.CONTEXT_RECALL_SERVICE_URL ?? process.env.KNOWLEDGE_AGENT_SERVICE_URL ?? 'http://127.0.0.1:8765').replace(/\/+$/, '');
const snapshotPath = process.env.CONTEXT_RECALL_SNAPSHOT ?? process.env.KNOWLEDGE_AGENT_SNAPSHOT ?? '';
const workspaceId = process.env.CONTEXT_RECALL_WORKSPACE_ID ?? process.env.KNOWLEDGE_AGENT_WORKSPACE_ID ?? '';

async function requestJson<T>(path: string, body?: unknown): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2500);
	try {
		const response = await fetch(new URL(path, `${serviceUrl}/`), {
			method: body === undefined ? 'GET' : 'POST',
			headers: body === undefined ? undefined : { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(`service returned HTTP ${response.status}`);
		}
		return await response.json() as T;
	} finally {
		clearTimeout(timeout);
	}
}

function mergeServiceResults(result: ServiceSearchResponse, query: string, limit: number): SearchItem[] {
	const semanticScores = new Map((result.semantic ?? []).map((item) => [item.source_id, item.score]));
	const semanticMemories = (result.semantic_memories ?? []).map((memory) => ({
		...memory,
		semanticScore: semanticScores.get(memory.id),
	}));
	return rankRetrievalResults(query, [
		{ items: semanticMemories, name: 'semantic', weight: 1.4, relevanceScore: (item) => item.semanticScore },
		{ items: result.lexical ?? [], name: 'lexical', weight: 1.2 },
		{ items: result.graph ?? [], name: 'graph', weight: 0.8, requireTermOverlap: true },
	], limit) as SearchItem[];
}

async function readSnapshot(): Promise<KnowledgeSnapshot | undefined> {
	if (!snapshotPath) {
		return undefined;
	}
	try {
		return JSON.parse(await readFile(snapshotPath, 'utf8')) as KnowledgeSnapshot;
	} catch {
		return undefined;
	}
}

function searchSnapshot(snapshot: KnowledgeSnapshot, query: string, limit: number): SearchItem[] {
	const queryVector = embed(query);
	return snapshot.vectors
		.map((record) => ({ record, score: cosineSimilarity(queryVector, record.values) }))
		.filter(({ score }) => score > 0)
		.sort((left, right) => right.score - left.score)
		.slice(0, limit)
		.map(({ record, score }) => {
			const turn = record.sourceKind === 'turn' ? snapshot.turns.find((item) => item.id === record.sourceId) : undefined;
			const node = record.sourceKind === 'knowledge' ? snapshot.nodes.find((item) => item.id === record.sourceId) : undefined;
			return {
				id: record.sourceId,
				type: record.sourceKind,
				summary: turn?.text ?? (node ? `${node.label}: ${node.summary}` : ''),
				resolution: node ? `confidence=${node.confidence}; evidence=${node.evidenceTurnIds.join(', ') || 'none'}` : '',
				status: node?.status ?? 'evidence',
				source: 'local' as const,
				score,
			};
		})
		.filter((item) => item.summary);
}

async function searchKnowledge(query: string, limit: number): Promise<{ backend: string; results: SearchItem[]; relationships: SearchConnection[]; graphError?: string }> {
	if (backend !== 'local') {
		try {
			const response = await requestJson<ServiceSearchResponse>('v1/search', {
				query,
				embedding: embed(query),
				workspace_id: workspaceId,
				session_id: '',
				limit,
			});
			const results = mergeServiceResults(response, query, limit);
			return {
				backend: 'service',
				results,
				relationships: connectServiceSearchResults(results),
				graphError: response.graph_error || undefined,
			};
		} catch (error) {
			if (backend === 'service') {
				throw error;
			}
		}
	}
	const snapshot = await readSnapshot();
	return { backend: 'local', results: snapshot ? searchSnapshot(snapshot, query, limit) : [], relationships: [] };
}

async function knowledgeStatus(): Promise<Record<string, unknown>> {
	const snapshot = await readSnapshot();
	const local = snapshot ? {
		sessions: snapshot.sessions.length,
		turns: snapshot.turns.length,
		vectors: snapshot.vectors.length,
		nodes: snapshot.nodes.length,
		edges: snapshot.edges.length,
	} : { available: false };
	if (backend === 'local') {
		return { configuredBackend: backend, activeBackend: 'local', local };
	}
	try {
		const health = await requestJson<{
			status?: string;
			memory?: unknown;
			vectors?: unknown;
			neo4j?: { configured?: boolean; ready?: boolean; database?: string; nodes?: number; relationships?: number; error?: string };
		}>('health');
		return {
			configuredBackend: backend,
			activeBackend: 'service',
			service: {
				status: health.status,
				memory: health.memory,
				vectors: health.vectors,
				neo4j: health.neo4j,
			},
			local,
		};
	} catch (error) {
		return {
			configuredBackend: backend,
			activeBackend: backend === 'service' ? 'unavailable' : 'local',
			serviceError: error instanceof Error ? error.name : 'Error',
			local,
		};
	}
}

async function sessionContext(requestedSessionId?: string): Promise<Record<string, unknown>> {
	const snapshot = await readSnapshot();
	if (!snapshot) {
		return { available: false, contextReturned: false, hostInjected: false };
	}
	const candidates = snapshot.sessions
		.filter((session) => !workspaceId || !session.workspaceId || session.workspaceId === workspaceId)
		.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
	const session = requestedSessionId
		? snapshot.sessions.find((item) => item.id === requestedSessionId)
		: candidates[0];
	if (!session) {
		return {
			available: false,
			contextReturned: false,
			hostInjected: false,
			reason: requestedSessionId ? 'session-not-found' : 'no-session-in-workspace',
		};
	}
	const turnIds = new Set(session.turnIds);
	const recentTurns = snapshot.turns
		.filter((turn) => turn.sessionId === session.id)
		.slice(-12)
		.map(({ id, role, text, createdAt }) => ({ id, role, text: text.slice(0, 1200), createdAt }));
	const relatedKnowledge = snapshot.nodes
		.filter((node) => node.evidenceTurnIds.some((turnId) => turnIds.has(turnId)))
		.slice(0, 8)
		.map(({ id, kind, label, summary, status, confidence, evidenceTurnIds }) => ({
			id, kind, label, summary, status, confidence, evidenceTurnIds,
		}));
	return {
		available: true,
		contextReturned: true,
		hostInjected: false,
		sessionId: session.id,
		title: session.title,
		workspaceId: session.workspaceId,
		updatedAt: session.updatedAt,
		context: session.context ?? null,
		recentTurns,
		relatedKnowledge,
	};
}

function textResult(value: unknown) {
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
		structuredContent: value as Record<string, unknown>,
	};
}

const server = new McpServer({ name: 'context-recall', version: '0.3.0' });

server.registerTool('knowledge_search', {
	title: 'Search Context Recall',
	description: 'Search persistent technical knowledge before answering. Combines Neo4j relationships, SQLite FTS5, and semantic vectors, with the extension snapshot as an offline fallback.',
	inputSchema: {
		query: z.string().min(1).describe('Natural-language technical search query'),
		limit: z.number().int().min(1).max(20).default(8).describe('Maximum combined results'),
	},
	annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ query, limit }) => textResult(await searchKnowledge(query, limit)));

server.registerTool('knowledge_status', {
	title: 'Inspect Context Recall Status',
	description: 'Report the active Context Recall backend and safe record counts without exposing credentials.',
	annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => textResult(await knowledgeStatus()));

server.registerTool('session_context', {
	title: 'Restore Context Recall Session Context',
	description: 'Return bounded structured state, recent turns, and evidence-linked knowledge for one session. A returned context is not proof that the Host injected it into a model request.',
	inputSchema: {
		sessionId: z.string().min(1).optional().describe('Session ID; defaults to the most recently updated session in the current workspace'),
	},
	annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ sessionId }) => textResult(await sessionContext(sessionId)));

server.connect(new StdioServerTransport()).catch((error: unknown) => {
	console.error('Context Recall MCP server failed:', error);
	process.exitCode = 1;
});