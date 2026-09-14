#!/usr/bin/env node
// Phase 0 评测台：检索质量（golden set）与可达率（probe）。
//
//   npm run test:retrieval                     # 跑 golden set
//   node scripts/evaluate-retrieval.mjs --reachability
//   node scripts/evaluate-retrieval.mjs --json evals/reports/xxx.json
//
// 依赖 out/vector.js（先 npm run compile-tests），与既有 evaluate-session-continuity.mjs 同款 shim。
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
const reachabilityMode = args.includes('--reachability');
const jsonIndex = args.indexOf('--json');
const golden = JSON.parse(await readFile(join(root, 'evals', 'retrieval-golden.json'), 'utf8'));
const serviceUrl = process.env.CONTEXT_RECALL_EVAL_SERVICE || golden.service.url;
const today = new Date().toISOString().slice(0, 10);
const reportPath = jsonIndex >= 0
	? args[jsonIndex + 1]
	: join(root, 'evals', 'reports', `${reachabilityMode ? 'reachability' : 'retrieval'}-${today}.json`);

const LIMIT = 8;

async function search(query, caller, limit = LIMIT) {
	const response = await fetch(new URL('/v1/search', serviceUrl), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query,
			embedding: embed(query),
			workspace_id: caller.workspaceId ?? '',
			session_id: caller.sessionId ?? '',
			limit,
		}),
	});
	if (!response.ok) {
		throw new Error(`service returned HTTP ${response.status}`);
	}
	return response.json();
}

async function health() {
	const response = await fetch(new URL('/health', serviceUrl));
	if (!response.ok) {
		throw new Error(`health returned HTTP ${response.status}`);
	}
	return response.json();
}

function parseDoc(summary = '') {
	const match = /^(?<doc>.+?\.pdf)(?: - page (?<page>\d+))?$/.exec(summary.trim());
	if (!match) {
		return { doc: '', page: null };
	}
	return { doc: match.groups.doc, page: match.groups.page ? Number(match.groups.page) : null };
}

function matches(item, expectation) {
	const { doc, page } = parseDoc(item.summary || '');
	if (expectation.docPrefix && doc.startsWith(expectation.docPrefix)) {
		if (!expectation.page || page === expectation.page) {
			return true;
		}
	}
	if (expectation.summaryContains && (item.summary || '').includes(expectation.summaryContains)) {
		return true;
	}
	if (expectation.resolutionContains && (item.resolution || '').includes(expectation.resolutionContains)) {
		return true;
	}
	return false;
}

function allChannels(result) {
	return [...(result.lexical ?? []), ...(result.semantic_memories ?? []), ...(result.graph ?? [])];
}

function retireLeakage(result) {
	return allChannels(result).filter((item) => item.status && item.status !== 'active').length;
}

function ratio(numerator, denominator) {
	return denominator === 0 ? 0 : numerator / denominator;
}

function pad(value, width) {
	return String(value).padEnd(width);
}

function fmt(value) {
	return typeof value === 'number' ? value.toFixed(3) : String(value);
}

const callerNames = Object.keys(golden.callers);
const corpus = await health().catch(() => undefined);

if (reachabilityMode) {
	const probe = JSON.parse(await readFile(join(root, 'evals', 'reachability-probe.json'), 'utf8'));
	const rows = [];
	for (const callerName of callerNames) {
		const caller = golden.callers[callerName];
		let reachable = 0;
		const misses = [];
		for (const sample of probe.samples) {
			try {
				const result = await search(sample.query, caller, LIMIT);
				const ids = (result.lexical ?? []).map((item) => item.id);
				if (ids.includes(sample.id)) {
					reachable += 1;
				} else if (misses.length < 3) {
					misses.push(sample.id.slice(0, 40));
				}
			} catch (error) {
				console.error(`  ${callerName}: ${error instanceof Error ? error.message : String(error)}`);
				break;
			}
		}
		rows.push({ caller: callerName, workspaceId: caller.workspaceId ?? '', reachable, total: probe.samples.length, misses });
	}
	console.log(`\n=== 可达率探针 (${probe.samples.length} 条抽样, probe capturedAt=${probe.capturedAt}) ===`);
	for (const row of rows) {
		const rate = ratio(row.reachable, row.total);
		console.log(`  ${pad(row.caller, 16)} ws=${pad(row.workspaceId || '(empty)', 40)} ${row.reachable}/${row.total} = ${(rate * 100).toFixed(1)}%`);
	}
	const report = { capturedAt: new Date().toISOString(), service: serviceUrl, corpusAtRun: corpus?.memory, probeCapturedAt: probe.capturedAt, rows };
	await mkdir(dirname(reportPath), { recursive: true });
	await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`\n报告: ${reportPath}`);
	process.exit(0);
}

const caseResults = [];
let leakage = 0;
let evidenceItems = 0;
let evidenceWithPage = 0;
let diversityChecked = 0;
let diversityPassed = 0;

for (const testCase of golden.cases) {
	const caller = golden.callers[testCase.caller];
	let result;
	try {
		result = await search(testCase.query, caller, LIMIT);
	} catch (error) {
		console.error(`  ${testCase.id}: ${error instanceof Error ? error.message : String(error)}`);
		caseResults.push({ id: testCase.id, caller: testCase.caller, error: String(error) });
		continue;
	}
	const returned = result.lexical ?? [];
	leakage += retireLeakage(result);
	for (const item of returned) {
		evidenceItems += 1;
		if (parseDoc(item.summary).page !== null) {
			evidenceWithPage += 1;
		}
	}
	const hit = testCase.expect.length === 0
		? false
		: testCase.expect.some((expectation) => matches(returned[0] ?? {}, expectation));
	const matchedExpectations = testCase.expect.filter((expectation) => returned.some((item) => matches(item, expectation))).length;
	const relevant = returned.filter((item) => testCase.expect.some((expectation) => matches(item, expectation))).length;
	let diversity = null;
	if (!testCase.unrelated && !testCase.smoke && returned.length >= 5) {
		const counts = new Map();
		for (const item of returned) {
			const key = parseDoc(item.summary).doc || item.id;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		diversityChecked += 1;
		diversity = Math.max(...counts.values()) <= 2;
		if (diversity) {
			diversityPassed += 1;
		}
	}
	caseResults.push({
		id: testCase.id,
		intent: testCase.intent,
		caller: testCase.caller,
		query: testCase.query,
		returned: returned.length,
		smoke: Boolean(testCase.smoke),
		unrelated: Boolean(testCase.unrelated),
		hitAt1: hit,
		precision: ratio(relevant, returned.length),
		recall: ratio(matchedExpectations, testCase.expect.length),
		smokePass: testCase.smoke ? returned.length > 0 : null,
		unrelatedPass: testCase.unrelated ? returned.length === 0 : null,
		diversity,
		top1: returned[0]?.summary ?? '',
	});
}

const primary = caseResults.filter((item) => !item.error && !item.smoke && !item.unrelated);
const smokes = caseResults.filter((item) => !item.error && item.smoke);
const unrelated = caseResults.filter((item) => !item.error && item.unrelated);

const metrics = {
	hitAt1: ratio(primary.filter((item) => item.hitAt1).length, primary.length),
	precisionAtK: ratio(primary.reduce((sum, item) => sum + item.precision, 0), primary.length),
	recallAtK: ratio(primary.reduce((sum, item) => sum + item.recall, 0), primary.length),
	smokeRate: ratio(smokes.filter((item) => item.smokePass).length, smokes.length),
	noResultAccuracy: ratio(unrelated.filter((item) => item.unrelatedPass).length, unrelated.length),
	supersededLeakage: leakage,
	diversityRate: ratio(diversityPassed, diversityChecked),
	pageEvidenceCoverage: ratio(evidenceWithPage, evidenceItems),
	casesScored: primary.length + smokes.length + unrelated.length,
	casesTotal: golden.cases.length,
};

const targets = golden.thresholds;
const checks = [
	['hitAt1', metrics.hitAt1 >= targets.hitAt1, `${fmt(metrics.hitAt1)} / >= ${targets.hitAt1}`],
	['precisionAtK', metrics.precisionAtK >= targets.precisionAtK, `${fmt(metrics.precisionAtK)} / >= ${targets.precisionAtK}`],
	['recallAtK', metrics.recallAtK >= targets.recallAtK, `${fmt(metrics.recallAtK)} / >= ${targets.recallAtK}`],
	['smokeRate', metrics.smokeRate >= targets.smokeRate, `${fmt(metrics.smokeRate)} / >= ${targets.smokeRate}`],
	['noResultAccuracy', metrics.noResultAccuracy >= targets.noResultAccuracy, `${fmt(metrics.noResultAccuracy)} / >= ${targets.noResultAccuracy}`],
	['supersededLeakage', metrics.supersededLeakage <= targets.supersededLeakageMax, `${metrics.supersededLeakage} / <= ${targets.supersededLeakageMax}`],
	['diversityRate', metrics.diversityRate >= targets.diversityRate, `${fmt(metrics.diversityRate)} / >= ${targets.diversityRate}`],
	['pageEvidenceCoverage', metrics.pageEvidenceCoverage >= targets.pageEvidenceCoverage, `${fmt(metrics.pageEvidenceCoverage)} / >= ${targets.pageEvidenceCoverage}`],
];

console.log(`\n=== 检索评测 (service=${serviceUrl}) ===`);
console.log(`  语料: total=${corpus?.memory?.total ?? '?'} active=${corpus?.memory?.active ?? '?'} (golden capturedAt=${golden.capturedAt})`);
console.log('');
console.log(`  ${pad('case', 30)} ${pad('caller', 15)} ${pad('n', 3)} ${pad('hit@1', 6)} ${pad('P@K', 6)} ${pad('R@K', 6)} top1`);
for (const item of caseResults) {
	if (item.error) {
		console.log(`  ${pad(item.id, 30)} ${pad(item.caller, 15)} ERROR ${item.error}`);
		continue;
	}
	const flags = [item.smoke ? `smoke=${item.smokePass}` : '', item.unrelated ? `noresult=${item.unrelatedPass}` : '', item.diversity === null ? '' : `div=${item.diversity}`].filter(Boolean).join(' ');
	console.log(`  ${pad(item.id, 30)} ${pad(item.caller, 15)} ${pad(item.returned, 3)} ${pad(item.hitAt1 ? 'Y' : '-', 6)} ${pad(fmt(item.precision), 6)} ${pad(fmt(item.recall), 6)} ${item.top1.slice(0, 40)} ${flags}`);
}
console.log('\n--- 聚合 ---');
for (const [name, passed, detail] of checks) {
	console.log(`  ${passed ? 'PASS' : 'FAIL'} ${pad(name, 22)} ${detail}`);
}
const failed = checks.filter(([, passed]) => !passed).length;
const report = {
	capturedAt: new Date().toISOString(),
	service: serviceUrl,
	corpusAtRun: corpus?.memory,
	goldenCapturedAt: golden.capturedAt,
	metrics,
	targets,
	checks: checks.map(([name, passed, detail]) => ({ name, passed, detail })),
	cases: caseResults,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nSUMMARY | ${failed === 0 ? 'PASS' : 'FAIL'} | ${checks.length - failed}/${checks.length} 指标达标 | 报告: ${reportPath}`);
process.exit(failed === 0 ? 0 : 1);
