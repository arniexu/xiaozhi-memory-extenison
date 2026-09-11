export const VECTOR_DIMENSIONS = 256;
export const SNAPSHOT_SCHEMA_VERSION = 1;

export type TurnRole = 'user' | 'assistant';
export type KnowledgeKind = 'fact' | 'decision' | 'concept' | 'person' | 'project' | 'tool' | 'workflow';
export type KnowledgeStatus = 'active' | 'contested' | 'superseded';
export type Confidence = 'low' | 'medium' | 'high';

export interface SessionContext {
	goal: string;
	currentTopic: string;
	currentPhase: string;
	completedActions: string[];
	verifiedResults: string[];
	reasoningSummary: string;
	intermediateConclusions: string[];
	decisions: string[];
	openIssues: string[];
	nextSteps: string[];
	changedFiles: string[];
	evidenceRefs: string[];
	updatedAt: string;
}

export interface SessionRecord {
	id: string;
	title: string;
	workspaceId: string;
	createdAt: string;
	updatedAt: string;
	turnIds: string[];
	knowledgeOrganizedAt?: string;
	context?: SessionContext;
}

export interface TurnRecord {
	id: string;
	sessionId: string;
	role: TurnRole;
	text: string;
	createdAt: string;
}

export interface VectorRecord {
	id: string;
	sourceId: string;
	sourceKind: 'turn' | 'knowledge';
	dimensions: number;
	values: number[];
	createdAt: string;
}

export interface KnowledgeNode {
	id: string;
	kind: KnowledgeKind;
	label: string;
	summary: string;
	status: KnowledgeStatus;
	confidence: Confidence;
	evidenceTurnIds: string[];
	tags: string[];
	/** Alternate surface forms (synonyms, abbreviations) used for deterministic alias linking. */
	aliases?: string[];
	createdAt: string;
	updatedAt: string;
}

export interface KnowledgeEdge {
	id: string;
	from: string;
	to: string;
	type: string;
	confidence: Confidence;
	evidenceTurnIds: string[];
	createdAt: string;
}

export interface ActivityEvent {
	id: string;
	type: 'session-created' | 'turn-recorded' | 'knowledge-organized' | 'data-imported';
	detail: string;
	createdAt: string;
}

export interface KnowledgeSnapshot {
	schemaVersion: number;
	sessions: SessionRecord[];
	turns: TurnRecord[];
	vectors: VectorRecord[];
	nodes: KnowledgeNode[];
	edges: KnowledgeEdge[];
	events: ActivityEvent[];
}

export interface SearchResult {
	sourceId: string;
	sourceKind: VectorRecord['sourceKind'];
	score: number;
	text: string;
}

export interface DashboardStats {
	sessions: number;
	organizedSessions: number;
	turns: number;
	vectors: number;
	nodes: number;
	edges: number;
	vectorCoverage: number;
	activeKnowledge: number;
	evidenceBackedKnowledge: number;
	recentKnowledge: number;
	contestedKnowledge: number;
}