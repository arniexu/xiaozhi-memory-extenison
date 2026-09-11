import * as vscode from 'vscode';
import { KnowledgeEdge, KnowledgeNode } from './model';
import { extractJson, extractedKnowledge } from './organizer';
import { DocumentChunk, ExtractedDocument } from './pdf-documents';
import { redact } from './transcript-parser';

/**
 * Document-side semantic layer.
 *
 * The service links imported chunks to entities it already knows about, which is
 * deterministic but cannot invent anything new. This module supplies the other
 * half: it asks the active chat model to read document excerpts and propose
 * canonical entities plus the relationships between them. Those entities are what
 * later make cross-document discovery possible, because two documents only become
 * related once they mention the same node.
 *
 * Every proposal is anchored to the chunk ids it came from, so the resulting graph
 * never loses provenance.
 */

const CHUNKS_PER_REQUEST = 4;
const MAX_REQUESTS_PER_DOCUMENT = 8;
const MAX_NODES = 24;
const MAX_EDGES = 32;
const EXCERPT_CHARACTERS = 4_000;

interface Batch {
	chunks: DocumentChunk[];
	text: string;
}

function batches(document: ExtractedDocument): Batch[] {
	const groups: Batch[] = [];
	for (let index = 0; index < document.chunks.length; index += CHUNKS_PER_REQUEST) {
		groups.push({ chunks: document.chunks.slice(index, index + CHUNKS_PER_REQUEST), text: '' });
	}
	// Keep the spread even rather than truncating to the first N chunks.
	if (groups.length > MAX_REQUESTS_PER_DOCUMENT) {
		const stride = groups.length / MAX_REQUESTS_PER_DOCUMENT;
		return Array.from({ length: MAX_REQUESTS_PER_DOCUMENT }, (_unused, index) => groups[Math.floor(index * stride)]);
	}
	return groups;
}

function excerpt(batch: Batch, filename: string): string {
	return batch.chunks
		.map((chunk) => `[page ${chunk.page}, chunk ${chunk.index}] ${redact(chunk.text)}`)
		.join('\n\n')
		.slice(0, EXCERPT_CHARACTERS);
}

function promptFor(document: ExtractedDocument, batch: Batch): string {
	return `You extract durable engineering knowledge from one excerpt of the document "${document.filename}".
Return JSON only, with this shape:
{"nodes":[{"kind":"fact|decision|concept|person|project|tool|workflow","label":"canonical entity name","summary":"one durable claim stated by this excerpt","confidence":"low|medium|high","tags":["tag"],"aliases":["alternate name or abbreviation"]}],"edges":[{"from":"exact node label","to":"exact node label","type":"UPPER_SNAKE_CASE","confidence":"low|medium|high"}]}

Rules:
- Extract only what this excerpt states. Do not add outside knowledge and do not guess.
- Use canonical, reusable entity names so the same entity in another document collapses to one node (for example prefer "BMC" over "the management controller").
- "aliases" must list the other surface forms this excerpt actually uses for the same entity, such as abbreviations, full names, or command names. Leave it empty when there are none.
- Prefer relations between the entities you extracted; a relation must be explicitly supported by the excerpt.
- Skip boilerplate: tables of contents, page headers, license text, revision history, and acknowledgements.
- Return at most 8 nodes and 12 edges. Return {"nodes":[],"edges":[]} when the excerpt holds no durable knowledge.

DOCUMENT EXCERPT:
${excerpt(batch, document.filename)}`;
}

function mergeNodes(target: Map<string, KnowledgeNode>, nodes: KnowledgeNode[]): void {
	for (const node of nodes) {
		const existing = target.get(node.id);
		if (!existing) {
			target.set(node.id, node);
			continue;
		}
		target.set(node.id, {
			...existing,
			evidenceTurnIds: [...new Set([...existing.evidenceTurnIds, ...node.evidenceTurnIds])],
			tags: [...new Set([...existing.tags, ...node.tags])],
			aliases: [...new Set([...(existing.aliases ?? []), ...(node.aliases ?? [])])],
			confidence: existing.confidence === 'high' || node.confidence === 'high'
				? 'high'
				: existing.confidence === 'medium' || node.confidence === 'medium' ? 'medium' : 'low',
		});
	}
}

export interface DocumentOrganization {
	nodes: KnowledgeNode[];
	edges: KnowledgeEdge[];
	requests: number;
}

export async function organizeDocument(
	model: vscode.LanguageModelChat,
	document: ExtractedDocument,
	token: vscode.CancellationToken,
	onProgress?: (message: string) => void,
): Promise<DocumentOrganization> {
	const nodes = new Map<string, KnowledgeNode>();
	const edges = new Map<string, KnowledgeEdge>();
	const groups = batches(document);
	let requests = 0;

	for (const [index, batch] of groups.entries()) {
		if (token.isCancellationRequested) {
			break;
		}
		onProgress?.(`Reading ${document.filename} (${index + 1}/${groups.length})`);
		const evidence = batch.chunks.map((chunk) => chunk.id);
		try {
			const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(promptFor(document, batch))], {}, token);
			let raw = '';
			for await (const fragment of response.text) {
				raw += fragment;
			}
			requests += 1;
			const extracted = extractedKnowledge(extractJson(raw), evidence, 8, 12);
			mergeNodes(nodes, extracted.nodes);
			for (const edge of extracted.edges) {
				if (!edges.has(edge.id)) {
					edges.set(edge.id, edge);
				}
			}
		} catch (error) {
			// A single unreadable excerpt must not discard the rest of the document.
			console.warn(`Knowledge extraction failed for ${document.filename} batch ${index + 1}.`, error);
		}
	}

	return {
		nodes: [...nodes.values()].slice(0, MAX_NODES),
		edges: [...edges.values()].slice(0, MAX_EDGES),
		requests,
	};
}
