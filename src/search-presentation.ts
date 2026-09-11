import { KnowledgeSnapshot, SearchResult } from './model';
import { ServiceMemory } from './service-client';

export interface PresentedSearchResult {
	id: string;
	title: string;
	answer: string;
	kind: string;
	sourceLabel: string;
	evidenceCount: number;
	confidence?: string;
	updatedAt?: string;
	matchSources: string[];
}

function clean(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function mergeResult(target: PresentedSearchResult, incoming: PresentedSearchResult): void {
	target.evidenceCount = Math.max(target.evidenceCount, incoming.evidenceCount);
	target.matchSources = [...new Set([...target.matchSources, ...incoming.matchSources])];
	if (!target.confidence && incoming.confidence) {
		target.confidence = incoming.confidence;
	}
	if (!target.updatedAt && incoming.updatedAt) {
		target.updatedAt = incoming.updatedAt;
	}
}

export function presentSearchResults(
	serviceResults: ServiceMemory[],
	localResults: SearchResult[],
	snapshot: KnowledgeSnapshot,
	limit: number,
): PresentedSearchResult[] {
	const presented = new Map<string, PresentedSearchResult>();
	for (const result of serviceResults) {
		const answer = clean(result.resolution || result.summary);
		const item: PresentedSearchResult = {
			id: result.id,
			title: clean(result.summary) || 'Related content',
			answer,
			kind: result.type,
			sourceLabel: result.source_refs?.[0] ?? 'Shared knowledge base',
			evidenceCount: result.evidence?.length ?? result.source_refs?.length ?? 0,
			confidence: result.confidence,
			updatedAt: result.updated_at,
			matchSources: [result.source ?? 'service'],
		};
		presented.set(item.id, item);
	}

	for (const result of localResults) {
		const node = result.sourceKind === 'knowledge'
			? snapshot.nodes.find((item) => item.id === result.sourceId)
			: undefined;
		const turn = result.sourceKind === 'turn'
			? snapshot.turns.find((item) => item.id === result.sourceId)
			: undefined;
		const session = turn ? snapshot.sessions.find((item) => item.id === turn.sessionId) : undefined;
		const evidenceSessions = node ? [...new Set(node.evidenceTurnIds.flatMap((turnId) => {
			const evidenceTurn = snapshot.turns.find((item) => item.id === turnId);
			const evidenceSession = evidenceTurn ? snapshot.sessions.find((item) => item.id === evidenceTurn.sessionId) : undefined;
			return evidenceSession ? [evidenceSession.title] : [];
		}))] : [];
		const item: PresentedSearchResult = node ? {
			id: node.id,
			title: clean(node.label),
			answer: clean(node.summary),
			kind: node.kind,
			sourceLabel: evidenceSessions.length ? `Sessions: ${evidenceSessions.slice(0, 2).join(', ')}` : 'Local knowledge base',
			evidenceCount: node.evidenceTurnIds.length,
			confidence: node.confidence,
			updatedAt: node.updatedAt,
			matchSources: ['local'],
		} : {
			id: result.sourceId,
			title: session?.title ?? 'Historical session',
			answer: clean(turn?.text ?? result.text),
			kind: 'turn',
			sourceLabel: session ? `Session: ${session.title}` : 'Local session history',
			evidenceCount: 1,
			updatedAt: turn?.createdAt,
			matchSources: ['local'],
		};
		const existing = presented.get(item.id);
		if (existing) {
			mergeResult(existing, item);
		} else {
			presented.set(item.id, item);
		}
	}

	return [...presented.values()]
		.sort((left, right) => right.evidenceCount - left.evidenceCount || (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''))
		.slice(0, limit);
}