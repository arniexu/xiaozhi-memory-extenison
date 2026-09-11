import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Worker } from 'node:worker_threads';

export interface DocumentChunk {
	id: string;
	index: number;
	page: number;
	text: string;
	contentHash: string;
}

export interface ExtractedDocument {
	id: string;
	filename: string;
	sourcePath: string;
	contentHash: string;
	pageCount: number;
	status: 'active' | 'draft';
	chunks: DocumentChunk[];
}

const CHUNK_CHARACTERS = 900;
const CHUNK_OVERLAP = 120;
const MIN_CHUNK_CHARACTERS = Math.floor(CHUNK_CHARACTERS * 0.55);

interface PdfWorkerResponse {
	pages?: string[];
	error?: string;
}

function extractPdfPages(path: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(join(__dirname, 'pdf-extractor-worker.js'), { workerData: { path } });
		worker.once('message', (response: PdfWorkerResponse) => {
			if (response.error) {
				reject(new Error(response.error));
				return;
			}
			resolve(response.pages ?? []);
		});
		worker.once('error', reject);
		worker.once('exit', (code) => {
			if (code !== 0) {
				reject(new Error(`PDF extraction worker exited with code ${code}`));
			}
		});
	});
}

function hash(text: string | Uint8Array): string {
	return createHash('sha256').update(text).digest('hex');
}

function isBoundary(text: string, index: number): boolean {
	const previous = text[index - 1];
	const current = text[index];
	return previous === '\n'
		|| current === '•'
		|| /[。！？；]/u.test(previous)
		|| /[.!?;]/u.test(previous) && (current === undefined || /\s/u.test(current));
}

function preferredBoundary(text: string, start: number, end: number): number {
	const minimum = start + MIN_CHUNK_CHARACTERS;
	for (let index = end; index >= minimum; index -= 1) {
		if (isBoundary(text, index)) {
			return index;
		}
	}
	return end;
}

function overlapStart(text: string, start: number, end: number): number {
	const target = Math.max(start + 1, end - CHUNK_OVERLAP);
	for (let index = target; index < end; index += 1) {
		if (index > start && isBoundary(text, index)) {
			return index;
		}
	}
	return target;
}

export function chunkPage(documentId: string, page: number, text: string): DocumentChunk[] {
	const normalized = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
	if (!normalized) {
		return [];
	}
	const chunks: DocumentChunk[] = [];
	let start = 0;
	while (start < normalized.length) {
		let end = Math.min(start + CHUNK_CHARACTERS, normalized.length);
		if (end < normalized.length) {
			end = preferredBoundary(normalized, start, end);
		}
		const chunkText = normalized.slice(start, end).trim();
		const index = chunks.length;
		chunks.push({
			id: `${documentId}:page:${page}:chunk:${index}`,
			index,
			page,
			text: chunkText,
			contentHash: hash(chunkText),
		});
		if (end >= normalized.length) {
			break;
		}
		start = overlapStart(normalized, start, end);
	}
	return chunks;
}

export async function extractPdfDocument(path: string): Promise<ExtractedDocument> {
	const bytes = new Uint8Array(await readFile(path));
	const contentHash = hash(bytes);
	const documentId = `document:${contentHash}`;
	const pages = await extractPdfPages(path);
	const chunks: DocumentChunk[] = [];
	for (const [index, text] of pages.entries()) {
		chunks.push(...chunkPage(documentId, index + 1, text));
	}
	const filename = basename(path);
	return {
		id: documentId,
		filename,
		sourcePath: path,
		contentHash,
		pageCount: pages.length,
		status: /(?:^|[^a-z0-9])(?:wip|draft)(?:[^a-z0-9]|$)/i.test(filename) ? 'draft' : 'active',
		chunks,
	};
}