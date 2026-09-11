import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { buildPageText, PdfTextItem } from './pdf-layout';

interface PdfWorkerInput {
	path: string;
}

async function extractPages(path: string): Promise<string[]> {
	const bytes = new Uint8Array(await readFile(path));
	const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs');
	GlobalWorkerOptions.workerSrc = pathToFileURL(join(__dirname, 'pdf.worker.mjs')).href;
	const loadingTask = getDocument({
		data: bytes,
		useWorkerFetch: false,
		useSystemFonts: true,
	});
	const pdf = await loadingTask.promise;
	const pages: string[] = [];
	for (let page = 1; page <= pdf.numPages; page += 1) {
		const pdfPage = await pdf.getPage(page);
		const content = await pdfPage.getTextContent();
		const items: PdfTextItem[] = [];
		for (const item of content.items) {
			if ('str' in item) {
				items.push({ str: item.str, transform: item.transform, width: item.width });
			}
		}
		pages.push(buildPageText(items));
	}
	await loadingTask.destroy();
	return pages;
}

const input = workerData as PdfWorkerInput;
extractPages(input.path)
	.then((pages) => parentPort?.postMessage({ pages }))
	.catch((error: unknown) => parentPort?.postMessage({
		error: error instanceof Error ? error.message : String(error),
	}));