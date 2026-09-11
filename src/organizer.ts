import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import { Confidence, KnowledgeEdge, KnowledgeKind, KnowledgeNode, SessionContext } from './model';
import { normalizeSessionContext } from './session-context';

interface ExtractedNode {
	kind?: string;
	label?: string;
	summary?: string;
	confidence?: string;
	tags?: unknown;
	aliases?: unknown;
}

interface ExtractedEdge {
	from?: string;
	to?: string;
	type?: string;
	confidence?: string;
}

interface ExtractionPayload {
	summary?: unknown;
	nodes?: unknown;
	edges?: unknown;
	sessionContext?: unknown;
}

const kinds = new Set<KnowledgeKind>(['fact', 'decision', 'concept', 'person', 'project', 'tool', 'workflow']);
const confidences = new Set<Confidence>(['low', 'medium', 'high']);

function stableId(prefix: string, value: string): string {
	return `${prefix}:${createHash('sha256').update(value.trim().toLocaleLowerCase()).digest('hex').slice(0, 20)}`;
}

function nodeId(nodeKind: KnowledgeKind, label: string, summary: string): string {
	const identity = nodeKind === 'fact' || nodeKind === 'decision'
		? `${nodeKind}|${label}|${summary}`
		: `${nodeKind}|${label}`;
	return stableId('knowledge', identity);
}

export function extractJson(text: string): ExtractionPayload | undefined {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	const candidate = fenced ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
	try {
		return JSON.parse(candidate) as ExtractionPayload;
	} catch {
		return undefined;
	}
}

function confidence(value: string | undefined): Confidence {
	return confidences.has(value as Confidence) ? value as Confidence : 'medium';
}

function kind(value: string | undefined): KnowledgeKind {
	return kinds.has(value as KnowledgeKind) ? value as KnowledgeKind : 'concept';
}

function cleanTags(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().toLocaleLowerCase()).filter(Boolean).slice(0, 12)
		: [];
}

export function cleanAliases(value: unknown): string[] {
	return Array.isArray(value)
		? value
			.filter((item): item is string => typeof item === 'string')
			.map((item) => item.trim())
			.filter((item) => item.length > 1 && item.length <= 80)
			.slice(0, 8)
		: [];
}

export async function organizeConversation(
	model: vscode.LanguageModelChat,
	userText: string,
	assistantText: string,
	evidenceTurnIds: string[],
	currentContext: SessionContext,
	token: vscode.CancellationToken,
): Promise<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[]; sessionContext: SessionContext }> {
	const prompt = `You organize durable knowledge from a conversation turn.
Return JSON only, with this shape:
{"nodes":[{"kind":"fact|decision|concept|person|project|tool|workflow","label":"canonical entity name","summary":"one durable claim","confidence":"low|medium|high","tags":["tag"]}],"edges":[{"from":"exact node label","to":"exact node label","type":"UPPER_SNAKE_CASE","confidence":"low|medium|high"}],"sessionContext":{"goal":"","currentTopic":"","currentPhase":"","completedActions":[],"verifiedResults":[],"reasoningSummary":"","intermediateConclusions":[],"decisions":[],"openIssues":[],"nextSteps":[],"changedFiles":[],"evidenceRefs":[]}}

Rules:
- Extract only durable, specific knowledge. Do not store greetings or transient chatter.
- Preserve uncertainty. User assertions without independent evidence are low confidence.
- A decision and the object it concerns should be separate nodes connected by an edge.
- Reuse canonical labels within this response.
- Return at most 8 nodes and 12 edges.
- Update sessionContext from CURRENT CONTEXT and this exchange.
- Move an issue out of openIssues only when the assistant answer or cited evidence resolves it.
- Treat proposals as nextSteps, not completedActions or verifiedResults.
- Preserve prior state that this exchange does not change.

CURRENT CONTEXT:
${JSON.stringify(currentContext)}

USER:
${userText}

ASSISTANT:
${assistantText}`;

	const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, token);
	let raw = '';
	for await (const fragment of response.text) {
		raw += fragment;
	}

	const payload = extractJson(raw);
	return {
		...extractedKnowledge(payload, evidenceTurnIds, 8, 12),
		sessionContext: normalizeSessionContext(payload?.sessionContext, currentContext),
	};
}

export async function organizeSession(
	model: vscode.LanguageModelChat,
	title: string,
	transcript: string,
	evidenceTurnIds: string[],
	token: vscode.CancellationToken,
): Promise<{ summary: string; nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }> {
	const prompt = `You are Context Recall organizing one historical coding session into durable local knowledge.
Return JSON only, with this shape:
{"summary":"2-4 sentence outcome-focused session summary","nodes":[{"kind":"fact|decision|concept|person|project|tool|workflow","label":"canonical entity name","summary":"one durable claim","confidence":"low|medium|high","tags":["tag"]}],"edges":[{"from":"exact node label","to":"exact node label","type":"UPPER_SNAKE_CASE","confidence":"low|medium|high"}]}

Rules:
- Summarize the actual outcome, decisions, verified results, remaining gaps, and reusable technical knowledge.
- Do not store greetings, planning narration, tool chatter, secrets, credentials, or unsupported claims.
- Preserve uncertainty and distinguish completed work from proposed or unvalidated work.
- Reuse canonical labels within this response.
- Return at most 8 nodes and 12 edges.

SESSION TITLE:
${title}

TRANSCRIPT EVIDENCE:
${transcript}`;

	const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, token);
	let raw = '';
	for await (const fragment of response.text) {
		raw += fragment;
	}
	const payload = extractJson(raw);
	const summary = typeof payload?.summary === 'string' ? payload.summary.trim() : '';
	const result = extractedKnowledge(payload, evidenceTurnIds, 8, 12);
	return { summary, ...result };
}

export function extractedKnowledge(
	payload: ExtractionPayload | undefined,
	evidenceTurnIds: string[],
	maxNodes: number,
	maxEdges: number,
): { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } {
	const extractedNodes = Array.isArray(payload?.nodes) ? payload.nodes as ExtractedNode[] : [];
	const createdAt = new Date().toISOString();
	const labels = new Map<string, string>();
	const nodes = extractedNodes
		.filter((node) => typeof node.label === 'string' && typeof node.summary === 'string')
		.slice(0, maxNodes)
		.map((node): KnowledgeNode => {
			const label = node.label!.trim();
			const nodeKind = kind(node.kind);
			const summary = node.summary!.trim();
			const id = nodeId(nodeKind, label, summary);
			labels.set(label.toLocaleLowerCase(), id);
			return {
				id,
				kind: nodeKind,
				label,
				summary,
				status: 'active',
				confidence: confidence(node.confidence),
				evidenceTurnIds,
				tags: cleanTags(node.tags),
				aliases: cleanAliases(node.aliases),
				createdAt,
				updatedAt: createdAt,
			};
		});
	const extractedEdges = Array.isArray(payload?.edges) ? payload.edges as ExtractedEdge[] : [];
	const edges = extractedEdges
		.filter((edge) => typeof edge.from === 'string' && typeof edge.to === 'string' && typeof edge.type === 'string')
		.slice(0, maxEdges)
		.flatMap((edge): KnowledgeEdge[] => {
			const from = labels.get(edge.from!.trim().toLocaleLowerCase());
			const to = labels.get(edge.to!.trim().toLocaleLowerCase());
			if (!from || !to || from === to) {
				return [];
			}
			const type = edge.type!.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
			return type ? [{
				id: stableId('edge', `${from}|${type}|${to}`),
				from,
				to,
				type,
				confidence: confidence(edge.confidence),
				evidenceTurnIds,
				createdAt,
			}] : [];
		});
	return { nodes, edges };
}