import Module from 'node:module';
const originalLoad = Module._load;
Module._load = (request, parent, isMain) => (request === 'vscode' ? {} : originalLoad(request, parent, isMain));
import { readFile } from 'node:fs/promises';
const repoRoot = new URL('../../', import.meta.url);
const { embed } = await import(new URL('out/vector.js', repoRoot).href);
const SERVICE = 'http://10.112.229.254:8765';
const golden = JSON.parse(await readFile(new URL('evals/retrieval-golden.json', repoRoot), 'utf8'));
async function search(query, caller, limit = 8) {
  const t0 = Date.now();
  const res = await fetch(new URL('/v1/search', SERVICE), { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, embedding: embed(query), workspace_id: caller.workspaceId ?? '', session_id: caller.sessionId ?? '', limit }) });
  return { latencyMs: Date.now() - t0, http: res.status, data: await res.json() };
}
const cases = [];
for (const c of golden.cases) {
  const caller = golden.callers[c.caller];
  try { const r = await search(c.query, caller); cases.push({ id: c.id, caller: c.caller, query: c.query, ...r }); }
  catch (e) { cases.push({ id: c.id, error: String(e) }); }
}
process.stdout.write(JSON.stringify({ capturedAt: new Date().toISOString(), service: SERVICE, note: 'full raw responses for golden replay (intermediate results; enables offline re-scoring)', cases }, null, 2) + '\n');
