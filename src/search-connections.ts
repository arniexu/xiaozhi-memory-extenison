import type { ServiceConnection } from './service-client';

interface ConnectableSearchItem {
	id: string;
	type: string;
	summary: string;
	resolution: string;
	status: string;
	evidence?: Array<{ kind?: string; id?: string }>;
	source_refs?: string[];
	connections?: ServiceConnection[];
}

export interface SearchConnection {
	fromId: string;
	fromTitle: string;
	relation: string;
	toId: string;
	toTitle: string;
	evidence: string[];
	confidence?: string;
	source: 'graph' | 'shared-evidence';
}

function normalizeReference(reference: string): string {
	return reference.replace(/^turn:turn:/, 'turn:');
}

function evidenceReferences(result: ConnectableSearchItem): Set<string> {
	return new Set([
		...(result.evidence ?? []).flatMap((item) => item.id ? [item.id] : []),
		...(result.source_refs ?? []),
		...(result.connections ?? []).flatMap((connection) => connection.evidence ?? []),
	].map(normalizeReference));
}

export function connectServiceSearchResults(results: ConnectableSearchItem[], limit = 12): SearchConnection[] {
	const connections = new Map<string, SearchConnection>();
	for (const result of results) {
		for (const connection of result.connections ?? []) {
			const outgoing = connection.direction !== 'incoming';
			const item: SearchConnection = {
				fromId: outgoing ? result.id : (connection.neighbor_id ?? connection.neighbor_title),
				fromTitle: outgoing ? result.summary : connection.neighbor_title,
				relation: connection.type,
				toId: outgoing ? (connection.neighbor_id ?? connection.neighbor_title) : result.id,
				toTitle: outgoing ? connection.neighbor_title : result.summary,
				evidence: (connection.evidence ?? []).map(normalizeReference),
				confidence: connection.confidence || undefined,
				source: 'graph',
			};
			connections.set(connection.edge_id || `${item.fromId}|${item.relation}|${item.toId}`, item);
		}
	}

	for (let leftIndex = 0; leftIndex < results.length; leftIndex += 1) {
		const left = results[leftIndex];
		const leftEvidence = evidenceReferences(left);
		for (let rightIndex = leftIndex + 1; rightIndex < results.length; rightIndex += 1) {
			const right = results[rightIndex];
			const shared = [...evidenceReferences(right)].filter((reference) => leftEvidence.has(reference));
			if (!shared.length) {
				continue;
			}
			const key = `shared|${left.id}|${right.id}`;
			connections.set(key, {
				fromId: left.id,
				fromTitle: left.summary,
				relation: 'SHARES_EVIDENCE',
				toId: right.id,
				toTitle: right.summary,
				evidence: shared,
				source: 'shared-evidence',
			});
		}
	}

	return [...connections.values()].slice(0, limit);
}

export function formatSearchConnection(connection: SearchConnection): string {
	const metadata = [
		connection.confidence ? `confidence=${connection.confidence}` : '',
		connection.evidence.length ? `evidence=${connection.evidence.slice(0, 3).join(', ')}` : '',
	].filter(Boolean);
	return `${connection.fromTitle} --${connection.relation}--> ${connection.toTitle}${metadata.length ? ` [${metadata.join('; ')}]` : ''}`;
}

export function formatConnectedSearchContext(results: ConnectableSearchItem[]): string {
	const items = results.map((result, index) => `${index + 1}. [${result.type}, ${result.status}] ${result.summary}: ${result.resolution}`);
	const connections = connectServiceSearchResults(results).map((connection) => `- ${formatSearchConnection(connection)}`);
	return connections.length
		? `RETRIEVED ITEMS:\n${items.join('\n')}\n\nVERIFIED CONNECTIONS:\n${connections.join('\n')}`
		: `RETRIEVED ITEMS:\n${items.join('\n')}\n\nNo explicit graph or shared-evidence connections were found among these items.`;
}