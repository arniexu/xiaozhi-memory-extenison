#!/usr/bin/env node
// fixture 映射自检：金标 expect[].docPrefix ↔ 线上语料文档名（归一化后）必须 100% 映射。
// 作为 npm run test:retrieval 的前置门禁：任一期望文档在语料中找不到同名（归一化后）文档即 exit 1，
// 避免把「文档改名漂移」误判成「检索质量下降」（见 evals/quality-audit-2026-09-29/report.md §3）。
//
//   node scripts/check-fixtures.mjs
//   node scripts/check-fixtures.mjs --json /tmp/fixtures.json
//
// 依赖 out/vector.js（先 npm run compile-tests），与 evaluate-retrieval.mjs 同款 vscode shim。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import Module from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const originalLoad = Module._load;
Module._load = (request, parent, isMain) => request === 'vscode' ? {} : originalLoad(request, parent, isMain);

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

let embed;
try {
	({ embed } = await import(join(root, 'out', 'vector.js')));
} catch {
	console.error('缺少 out/vector.js，请先运行 npm run compile-tests');
	process.exit(2);
}

const args = process.argv.slice(2);
const jsonIndex = args.indexOf('--json');
const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : undefined;
const golden = JSON.parse(await readFile(join(root, 'evals', 'retrieval-golden.json'), 'utf8'));
const serviceUrl = process.env.CONTEXT_RECALL_EVAL_SERVICE || golden.service.url;
const LIMIT = 8;

// 与 evaluate-retrieval.mjs 相同的归一化规则（金标与返回文档两侧都归一）。
function canonicalDoc(name) {
	if (name === undefined || name === null) {
		return '';
	}
	return String(name).replace(/ \(\d+\)\.pdf$/, '.pdf');
}

function parseDoc(summary = '') {
	const match = /^(?<doc>.+?\.pdf)(?: - page (?<page>\d+))?$/.exec(String(summary).trim());
	if (!match) {
		return { doc: '', page: null };
	}
	return { doc: match.groups.doc, page: match.groups.page ? Number(match.groups.page) : null };
}

// 去重按归一化后的名字（"(1)" 副本与正本算同一 fixture）；查询仍用金标原文。
const fixtures = [];
const seen = new Set();
for (const testCase of golden.cases ?? []) {
	for (const expectation of testCase.expect ?? []) {
		if (!expectation.docPrefix) {
			continue;
		}
		const canonical = canonicalDoc(expectation.docPrefix);
		if (seen.has(canonical)) {
			continue;
		}
		seen.add(canonical);
		fixtures.push({ prefix: expectation.docPrefix, canonical });
	}
}

async function search(query) {
	const response = await fetch(new URL('/v1/search', serviceUrl), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query,
			embedding: embed(query),
			workspace_id: '',
			session_id: '',
			limit: LIMIT,
		}),
	});
	if (!response.ok) {
		throw new Error(`service returned HTTP ${response.status}`);
	}
	return response.json();
}

function channelItems(result) {
	return [
		['lexical', result.lexical ?? []],
		['semantic', result.semantic_memories ?? []],
		['graph', result.graph ?? []],
	];
}

console.log(`\n=== fixture 映射自检 (service=${serviceUrl}, limit=${LIMIT}, golden capturedAt=${golden.capturedAt}) ===`);
const expected = [];
for (const fixture of fixtures) {
	const row = {
		prefix: fixture.prefix,
		canonical: fixture.canonical,
		mapped: false,
		channel: null,
		sample: null,
		error: null,
		returned: {},
	};
	try {
		const result = await search(fixture.prefix);
		for (const [channel, items] of channelItems(result)) {
			row.returned[channel] = items.length;
			if (row.mapped) {
				continue;
			}
			for (const item of items) {
				const { doc, page } = parseDoc(item.summary || '');
				if (doc && canonicalDoc(doc).startsWith(fixture.canonical)) {
					row.mapped = true;
					row.channel = channel;
					row.sample = { doc, page, summary: String(item.summary ?? '').slice(0, 120) };
					break;
				}
			}
		}
	} catch (error) {
		row.error = error instanceof Error ? error.message : String(error);
	}
	expected.push(row);
	if (row.mapped) {
		console.log(`  OK      ${row.prefix} -> [${row.channel}] ${row.sample.summary}`);
	} else if (row.error) {
		console.log(`  MISSING ${row.prefix} (search error: ${row.error})`);
	} else {
		console.log(`  MISSING ${row.prefix} (lexical=${row.returned.lexical ?? 0} semantic=${row.returned.semantic ?? 0} graph=${row.returned.graph ?? 0}，无归一化文档名匹配)`);
	}
}

const mappedCount = expected.filter((item) => item.mapped).length;
const completeRate = expected.length === 0 ? 0 : mappedCount / expected.length;
console.log(`\nfixtures mapped ${mappedCount}/${expected.length}`);

if (jsonPath) {
	const report = {
		capturedAt: new Date().toISOString(),
		service: serviceUrl,
		goldenCapturedAt: golden.capturedAt,
		limit: LIMIT,
		expected,
		mapped: {
			count: mappedCount,
			total: expected.length,
			completeRate,
			complete: expected.length > 0 && mappedCount === expected.length,
		},
	};
	await mkdir(dirname(jsonPath), { recursive: true });
	await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`报告: ${jsonPath}`);
}

process.exit(expected.length > 0 && mappedCount === expected.length ? 0 : 1);
