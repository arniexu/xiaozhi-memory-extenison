import { VECTOR_DIMENSIONS } from './model';

function hashTerm(term: string): number {
	let hash = 2166136261;
	for (let index = 0; index < term.length; index += 1) {
		hash ^= term.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function terms(text: string): string[] {
	const normalized = text.normalize('NFKC').toLocaleLowerCase();
	const words = normalized.match(/[\p{L}\p{N}_-]+/gu) ?? [];
	const cjk = [...normalized].filter((character) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character));
	const pairs = cjk.slice(0, -1).map((character, index) => character + cjk[index + 1]);
	return [...words, ...cjk, ...pairs];
}

export function embed(text: string): number[] {
	const vector = new Array<number>(VECTOR_DIMENSIONS).fill(0);
	for (const term of terms(text)) {
		const hash = hashTerm(term);
		const index = hash % VECTOR_DIMENSIONS;
		vector[index] += (hash & 0x100) === 0 ? 1 : -1;
	}

	const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
	return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

export function cosineSimilarity(left: number[], right: number[]): number {
	if (left.length !== right.length || left.length === 0) {
		return 0;
	}
	return left.reduce((score, value, index) => score + value * right[index], 0);
}