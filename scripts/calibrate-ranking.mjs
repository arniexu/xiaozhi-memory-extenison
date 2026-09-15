#!/usr/bin/env node
// 标定 page_boost：跑一组候选值，硬不变量过滤后排序，记录全表与优胜者。
//
//   node scripts/calibrate-ranking.mjs
//   CONTEXT_RECALL_CALIBRATION_VALUES=0.35,2,6,12 node scripts/calibrate-ranking.mjs
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const values = (process.env.CONTEXT_RECALL_CALIBRATION_VALUES ?? '0.35,1.5,3,6,12').split(',').map(Number).filter(Number.isFinite);
const workdir = await mkdtemp(join(tmpdir(), 'recall-calib-'));

const rows = [];
for (const value of values) {
	const report = join(workdir, `boost-${value}.json`);
	try {
		await run(process.execPath, [join(root, 'scripts', 'evaluate-retrieval.mjs'), '--json', report], {
			cwd: root,
			env: { ...process.env, CONTEXT_RECALL_EVAL_PAGE_BOOST: String(value) },
		});
	} catch {
		// 指标未达标时评测脚本非 0 退出，属常态；只要报告写出来就继续。
	}
	try {
		const data = JSON.parse(await readFile(report, 'utf8'));
		rows.push({ pageBoost: value, ...data.metrics });
	} catch {
		rows.push({ pageBoost: value, error: 'no-report' });
	}
}

const viable = rows.filter((row) => !row.error && row.noResultAccuracy === 1 && row.supersededLeakage === 0);
viable.sort((a, b) => b.hitAt1 - a.hitAt1 || b.recallAtK - a.recallAtK || b.precisionAtK - a.precisionAtK || b.technicalTop3PageCoverage - a.technicalTop3PageCoverage);

console.log('\n=== page_boost 标定（硬不变量：noResultAccuracy=1 且 supersededLeakage=0）===');
console.log('  boost   hit@1   P@K    R@K    top3Page  noRes  leak');
for (const row of rows) {
	const f = (v) => (typeof v === 'number' ? v.toFixed(3) : String(v ?? '-'));
	console.log(`  ${String(row.pageBoost).padEnd(7)} ${f(row.hitAt1)}  ${f(row.precisionAtK)}  ${f(row.recallAtK)}  ${f(row.technicalTop3PageCoverage)}     ${row.noResultAccuracy ?? '-'}      ${row.supersededLeakage ?? '-'}`);
}
const winner = viable[0]?.pageBoost ?? null;
console.log(`\n  合格组合 ${viable.length}/${rows.length}，优胜 page_boost = ${winner}`);
const output = { capturedAt: new Date().toISOString(), values, rows, winner, viableCount: viable.length };
const path = join(root, 'evals', 'reports', `calibration-${new Date().toISOString().slice(0, 10)}.json`);
await mkdir(dirname(path), { recursive: true });
await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
console.log(`  报告: ${path}`);
