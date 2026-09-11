export interface PdfTextItem {
	str: string;
	transform: readonly number[];
	width: number;
}

interface PositionedItem {
	text: string;
	x: number;
	y: number;
	width: number;
}

const ROW_TOLERANCE = 6;
const CELL_GAP = 12;

/**
 * Rebuild readable page text from positioned PDF text items.
 *
 * Items are clustered into visual rows by Y coordinate and ordered by X so
 * table cells stay on their row instead of following the PDF content stream.
 * Large horizontal gaps become ` | ` cell separators, which keeps register
 * tables meaningful when chunked and searched.
 */
export function buildPageText(items: readonly PdfTextItem[]): string {
	const positioned: PositionedItem[] = [];
	for (const item of items) {
		if (!item.str.trim()) {
			continue;
		}
		const x = item.transform[4];
		const y = item.transform[5];
		if (!Number.isFinite(x) || !Number.isFinite(y)) {
			continue;
		}
		positioned.push({ text: item.str, x, y, width: Number.isFinite(item.width) ? item.width : 0 });
	}
	positioned.sort((a, b) => b.y - a.y || a.x - b.x);

	const rows: PositionedItem[][] = [];
	for (const item of positioned) {
		const row = rows[rows.length - 1];
		if (row && Math.abs(row[0].y - item.y) <= ROW_TOLERANCE) {
			row.push(item);
		} else {
			rows.push([item]);
		}
	}

	return rows
		.map(joinRow)
		.filter((line) => line.length > 0)
		.join('\n');
}

function joinRow(row: PositionedItem[]): string {
	row.sort((a, b) => a.x - b.x);
	let line = '';
	let previousEnd = Number.NEGATIVE_INFINITY;
	for (const item of row) {
		const text = item.text.trim();
		if (!text) {
			continue;
		}
		if (line.length > 0) {
			line += item.x - previousEnd > CELL_GAP ? ' | ' : ' ';
		}
		line += text;
		previousEnd = item.x + item.width;
	}
	return line.trim();
}
