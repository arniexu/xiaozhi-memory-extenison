export interface RankedMemory {
	id: string;
	summary: string;
	resolution?: string;
}

export type RetrievalSource<T extends RankedMemory> = {
	items: T[];
	name: string;
	weight: number;
	requireTermOverlap?: boolean;
	relevanceScore?: (item: T) => number | undefined;
};

const GENERIC_TERMS = new Set([
	'agent', 'and', 'capabilities', 'current', 'extension', 'for', 'limitations',
	'of', 'service', 'the', 'validation', 'with',
]);

function terms(text: string): Set<string> {
	return new Set((text.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])
		.filter((term) => term.length > 1 && !GENERIC_TERMS.has(term)));
}

function termOverlap(queryTerms: Set<string>, itemTerms: Set<string>): number {
	return [...queryTerms].filter((queryTerm) => [...itemTerms].some((itemTerm) =>
		itemTerm === queryTerm || itemTerm.includes(queryTerm) || queryTerm.includes(itemTerm),
	)).length;
}

export function rankRetrievalResults<T extends RankedMemory>(
	query: string,
	sources: RetrievalSource<T>[],
	limit: number,
): Array<T & { source: string; retrievalScore: number }> {
	const queryTerms = terms(query);
	const ranked = new Map<string, { item: T; source: string; score: number; overlap: number }>();
	for (const source of sources) {
		for (const [index, item] of source.items.entries()) {
			const itemTerms = terms(`${item.summary} ${item.resolution ?? ''}`);
			const overlap = termOverlap(queryTerms, itemTerms);
			if (source.requireTermOverlap && queryTerms.size > 0 && overlap === 0) {
				continue;
			}
			const nativeRelevance = Math.max(0, Math.min(1, source.relevanceScore?.(item) ?? 0));
			const score = source.weight / (60 + index + 1)
				+ overlap / Math.max(queryTerms.size, 1)
				+ nativeRelevance * 0.75;
			const existing = ranked.get(item.id);
			if (existing) {
				existing.score += score;
				existing.overlap = Math.max(existing.overlap, overlap);
			} else {
				ranked.set(item.id, { item, source: source.name, score, overlap });
			}
		}
	}
	return [...ranked.values()]
		.sort((left, right) => right.score - left.score || right.overlap - left.overlap || left.item.id.localeCompare(right.item.id))
		.slice(0, limit)
		.map(({ item, source, score }) => ({ ...item, source, retrievalScore: score }));
}