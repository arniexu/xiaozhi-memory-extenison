// 只读探针 D1/E1/E2/E3/F3/F4。用法: node evals/quality-audit-2026-09-29/probe.mjs > .../raw/probes-2026-09-29.json
import Module from 'node:module';
const originalLoad = Module._load;
Module._load = (request, parent, isMain) => (request === 'vscode' ? {} : originalLoad(request, parent, isMain));
const repoRoot = new URL('../../', import.meta.url);
const { embed } = await import(new URL('out/vector.js', repoRoot).href);
const SERVICE = process.env.CONTEXT_RECALL_EVAL_SERVICE || 'http://10.112.229.254:8765';

async function search(query, extra = {}) {
  const t0 = Date.now();
  const res = await fetch(new URL('/v1/search', SERVICE), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, embedding: embed(query), workspace_id: '', session_id: '', limit: 8, ...extra }),
  });
  const ms = Date.now() - t0;
  const data = await res.json();
  return { query, http: res.status, latencyMs: ms, data };
}

const probes = [];
async function run(id, query, extra) {
  try { probes.push({ id, ...(await search(query, extra)) }); }
  catch (e) { probes.push({ id, query, error: String(e) }); }
}

await run('pollution-baking', '如何烤面包');
await run('pollution-baking-flow', '烤面包通用流程');
await run('unrelated-gibberish', 'zzz qqq 无意义');
await run('links-tsod', 'TSOD 温度阈值');
await run('links-crashdump', 'crashdump');
await run('links-gibberish', 'qqq zzz 无意义');
await run('alias-peci-abbrev', 'PECI');
await run('alias-peci-full', 'Platform Environment Control Interface');
await run('evidence-cpld', 'CPLD register');
await run('evidence-redfish', 'Redfish EventService 订阅');
await run('decision-coverity', 'coverity triage');
await run('latency-1', 'TSOD 温度阈值');
await run('latency-2', 'crashdump');

process.stdout.write(JSON.stringify({ capturedAt: new Date().toISOString(), service: SERVICE, via: 'probe.mjs /v1/search (workspace_id="", limit=8)', probes }, null, 2) + '\n');
