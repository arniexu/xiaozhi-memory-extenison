import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	ActivityEvent,
	DashboardStats,
	KnowledgeEdge,
	KnowledgeNode,
	KnowledgeSnapshot,
	SearchResult,
	SessionContext,
	SessionRecord,
	SNAPSHOT_SCHEMA_VERSION,
	TurnRecord,
	TurnRole,
	VectorRecord,
	VECTOR_DIMENSIONS,
} from './model';
import { cosineSimilarity, embed } from './vector';

function emptySnapshot(): KnowledgeSnapshot {
	return {
		schemaVersion: SNAPSHOT_SCHEMA_VERSION,
		sessions: [],
		turns: [],
		vectors: [],
		nodes: [],
		edges: [],
		events: [],
	};
}

function now(): string {
	return new Date().toISOString();
}

function titleFrom(text: string): string {
	const title = text.replace(/\s+/g, ' ').trim();
	return title.length > 72 ? `${title.slice(0, 69)}...` : title || 'Untitled session';
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}

function assertSnapshot(value: unknown): asserts value is KnowledgeSnapshot {
	if (!value || typeof value !== 'object') {
		throw new Error('Snapshot must be a JSON object');
	}
	const snapshot = value as Partial<KnowledgeSnapshot>;
	if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
		throw new Error(`Unsupported snapshot schema ${String(snapshot.schemaVersion)}`);
	}
	for (const key of ['sessions', 'turns', 'vectors', 'nodes', 'edges', 'events'] as const) {
		if (!Array.isArray(snapshot[key])) {
			throw new Error(`Snapshot field ${key} must be an array`);
		}
	}
	const vectors = snapshot.vectors as VectorRecord[];
	for (const vector of vectors) {
		if (!vector || vector.dimensions !== VECTOR_DIMENSIONS || !Array.isArray(vector.values)
			|| vector.values.length !== VECTOR_DIMENSIONS || vector.values.some((item) => !Number.isFinite(item))) {
			throw new Error(`Vector ${vector?.id ?? '<unknown>'} must contain ${VECTOR_DIMENSIONS} finite values`);
		}
	}
}

export class KnowledgeStore {
	private readonly snapshotPath: string;
	private snapshot: KnowledgeSnapshot = emptySnapshot();
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(private readonly storageDirectory: string) {
		this.snapshotPath = join(storageDirectory, 'knowledge-agent.json');
	}

	async initialize(): Promise<void> {
		await mkdir(this.storageDirectory, { recursive: true });
		try {
			const parsed: unknown = JSON.parse(await readFile(this.snapshotPath, 'utf8'));
			assertSnapshot(parsed);
			this.snapshot = parsed;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw error;
			}
			await this.persist();
		}
	}

	getSnapshot(): KnowledgeSnapshot {
		return structuredClone(this.snapshot);
	}

	getSessionTurns(sessionId: string, limit = 16): TurnRecord[] {
		return this.snapshot.turns.filter((turn) => turn.sessionId === sessionId).slice(-limit);
	}

	getSessionContext(sessionId: string): SessionContext | undefined {
		const context = this.snapshot.sessions.find((session) => session.id === sessionId)?.context;
		return context ? structuredClone(context) : undefined;
	}

	isSessionOrganized(sessionId: string): boolean {
		return Boolean(this.snapshot.sessions.find((session) => session.id === sessionId)?.knowledgeOrganizedAt);
	}

	getStats(): DashboardStats {
		const indexable = this.snapshot.turns.length + this.snapshot.nodes.length;
		const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
		return {
			sessions: this.snapshot.sessions.length,
			organizedSessions: this.snapshot.sessions.filter((session) => session.knowledgeOrganizedAt).length,
			turns: this.snapshot.turns.length,
			vectors: this.snapshot.vectors.length,
			nodes: this.snapshot.nodes.length,
			edges: this.snapshot.edges.length,
			vectorCoverage: indexable === 0 ? 0 : Math.round((this.snapshot.vectors.length / indexable) * 100),
			activeKnowledge: this.snapshot.nodes.filter((node) => node.status === 'active').length,
			evidenceBackedKnowledge: this.snapshot.nodes.filter((node) => node.evidenceTurnIds.length > 0).length,
			recentKnowledge: this.snapshot.nodes.filter((node) => Date.parse(node.createdAt) >= sevenDaysAgo).length,
			contestedKnowledge: this.snapshot.nodes.filter((node) => node.status === 'contested').length,
		};
	}

	async ensureSession(sessionId: string, workspaceId: string, initialPrompt: string): Promise<SessionRecord> {
		const existing = this.snapshot.sessions.find((session) => session.id === sessionId);
		if (existing) {
			return existing;
		}

		const createdAt = now();
		const session: SessionRecord = {
			id: sessionId,
			title: titleFrom(initialPrompt),
			workspaceId,
			createdAt,
			updatedAt: createdAt,
			turnIds: [],
		};
		this.snapshot.sessions.push(session);
		this.addEvent('session-created', `Created ${session.title}`);
		await this.persist();
		return session;
	}

	async recordTurn(sessionId: string, role: TurnRole, text: string): Promise<TurnRecord> {
		const session = this.snapshot.sessions.find((item) => item.id === sessionId);
		if (!session) {
			throw new Error(`Session ${sessionId} does not exist`);
		}

		const createdAt = now();
		const turn: TurnRecord = { id: randomUUID(), sessionId, role, text, createdAt };
		this.snapshot.turns.push(turn);
		session.turnIds.push(turn.id);
		session.updatedAt = createdAt;
		this.upsertVector(turn.id, 'turn', text, createdAt);
		this.addEvent('turn-recorded', `${role} turn added to ${session.title}`);
		await this.persist();
		return turn;
	}

	async updateSessionContext(sessionId: string, context: SessionContext): Promise<void> {
		const session = this.snapshot.sessions.find((item) => item.id === sessionId);
		if (!session) {
			throw new Error(`Session ${sessionId} does not exist`);
		}
		session.context = structuredClone(context);
		session.updatedAt = context.updatedAt;
		await this.persist();
	}

	async importSessionEvidence(session: SessionRecord, turn: TurnRecord): Promise<TurnRecord> {
		const existingTurn = this.snapshot.turns.find((item) => item.id === turn.id);
		if (existingTurn) {
			return existingTurn;
		}
		if (!this.snapshot.sessions.some((item) => item.id === session.id)) {
			this.snapshot.sessions.push(session);
			this.addEvent('session-created', `Imported ${session.title}`);
		}
		this.snapshot.turns.push(turn);
		const storedSession = this.snapshot.sessions.find((item) => item.id === session.id)!;
		storedSession.turnIds = unique([...storedSession.turnIds, turn.id]);
		storedSession.updatedAt = turn.createdAt > storedSession.updatedAt ? turn.createdAt : storedSession.updatedAt;
		this.upsertVector(turn.id, 'turn', turn.text, turn.createdAt);
		this.addEvent('turn-recorded', `Imported evidence for ${storedSession.title}`);
		await this.persist();
		return turn;
	}

	async markSessionOrganized(sessionId: string): Promise<void> {
		const session = this.snapshot.sessions.find((item) => item.id === sessionId);
		if (!session) {
			throw new Error(`Session ${sessionId} does not exist`);
		}
		session.knowledgeOrganizedAt = now();
		await this.persist();
	}

	async upsertKnowledge(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): Promise<void> {
		for (const node of nodes) {
			const index = this.snapshot.nodes.findIndex((item) => item.id === node.id);
			if (index >= 0) {
				const existing = this.snapshot.nodes[index];
				this.snapshot.nodes[index] = {
					...node,
					createdAt: existing.createdAt,
					evidenceTurnIds: unique([...existing.evidenceTurnIds, ...node.evidenceTurnIds]),
					tags: unique([...existing.tags, ...node.tags]),
					aliases: unique([...(existing.aliases ?? []), ...(node.aliases ?? [])]),
				};
			} else {
				this.snapshot.nodes.push(node);
			}
			const stored = this.snapshot.nodes.find((item) => item.id === node.id)!;
			this.upsertVector(stored.id, 'knowledge', `${stored.label} ${stored.summary} ${stored.tags.join(' ')}`, stored.updatedAt);
		}
		for (const edge of edges) {
			const index = this.snapshot.edges.findIndex((item) => item.id === edge.id);
			if (index >= 0) {
				const existing = this.snapshot.edges[index];
				this.snapshot.edges[index] = {
					...edge,
					createdAt: existing.createdAt,
					evidenceTurnIds: unique([...existing.evidenceTurnIds, ...edge.evidenceTurnIds]),
				};
			} else {
				this.snapshot.edges.push(edge);
			}
		}
		this.addEvent('knowledge-organized', `Organized ${nodes.length} nodes and ${edges.length} relationships`);
		await this.persist();
	}

	search(query: string, limit = 8): SearchResult[] {
		const queryVector = embed(query);
		return this.snapshot.vectors
			.map((record) => ({ record, score: cosineSimilarity(queryVector, record.values) }))
			.filter(({ score }) => score > 0)
			.sort((left, right) => right.score - left.score)
			.slice(0, limit)
			.map(({ record, score }) => ({
				sourceId: record.sourceId,
				sourceKind: record.sourceKind,
				score,
				text: this.textFor(record),
			}));
	}

	async importSnapshot(imported: unknown): Promise<void> {
		assertSnapshot(imported);
		this.snapshot = imported;
		this.addEvent('data-imported', `Imported ${imported.sessions.length} sessions and ${imported.nodes.length} knowledge nodes`);
		await this.persist();
	}

	private textFor(record: VectorRecord): string {
		if (record.sourceKind === 'turn') {
			return this.snapshot.turns.find((turn) => turn.id === record.sourceId)?.text ?? '';
		}
		const node = this.snapshot.nodes.find((item) => item.id === record.sourceId);
		return node ? `${node.label}: ${node.summary}` : '';
	}

	private upsertVector(sourceId: string, sourceKind: VectorRecord['sourceKind'], text: string, createdAt: string): void {
		const record: VectorRecord = {
			id: `vector:${sourceKind}:${sourceId}`,
			sourceId,
			sourceKind,
			dimensions: VECTOR_DIMENSIONS,
			values: embed(text),
			createdAt,
		};
		const index = this.snapshot.vectors.findIndex((item) => item.id === record.id);
		if (index >= 0) {
			this.snapshot.vectors[index] = record;
		} else {
			this.snapshot.vectors.push(record);
		}
	}

	private addEvent(type: ActivityEvent['type'], detail: string): void {
		this.snapshot.events.unshift({ id: randomUUID(), type, detail, createdAt: now() });
		this.snapshot.events = this.snapshot.events.slice(0, 200);
	}

	private async persist(): Promise<void> {
		this.writeQueue = this.writeQueue.then(async () => {
			const temporaryPath = `${this.snapshotPath}.tmp`;
			await writeFile(temporaryPath, JSON.stringify(this.snapshot), 'utf8');
			await rename(temporaryPath, this.snapshotPath);
		});
		await this.writeQueue;
	}
}