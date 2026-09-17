import { KnowledgeSnapshot } from './model';

export interface ContinuityDecision {
	id: string;
	question: string;
	answer?: string;
	timestamp?: string;
	tags?: string[];
	status?: string;
	priority?: string;
	relationships?: Record<string, string[]>;
	history?: Array<{ timestamp?: string; action?: string }>;
}

export type ParsedImport =
	| { kind: 'snapshot'; snapshot: KnowledgeSnapshot }
	| { kind: 'continuity'; decisions: ContinuityDecision[] };

function isObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSnapshot(value: unknown): value is KnowledgeSnapshot {
	if (!isObject(value) || typeof value.schemaVersion !== 'number') {
		return false;
	}
	return ['sessions', 'turns', 'vectors', 'nodes', 'edges', 'events'].every((key) => Array.isArray(value[key]));
}

function decisionsFrom(value: unknown): ContinuityDecision[] | undefined {
	const records = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.decisions) ? value.decisions : undefined;
	if (!records || !records.every((item) => isObject(item))) {
		return undefined;
	}
	return records as unknown as ContinuityDecision[];
}

export function parseImportData(text: string): ParsedImport {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		try {
			parsed = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
		} catch {
			throw new Error('The selected file is neither valid JSON nor JSON Lines');
		}
	}

	if (isSnapshot(parsed)) {
		return { kind: 'snapshot', snapshot: parsed };
	}
	const decisions = decisionsFrom(parsed);
	if (!decisions) {
		throw new Error('Unsupported import format. Select an OpenBMC 知识助手 snapshot or Continuity decisions JSON/JSONL file.');
	}
	if (!decisions.length) {
		throw new Error('The Continuity import contains no decisions');
	}
	return { kind: 'continuity', decisions };
}