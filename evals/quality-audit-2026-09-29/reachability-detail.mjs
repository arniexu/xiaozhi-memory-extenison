import Module from 'node:module';
const originalLoad = Module._load;
Module._load = (request, parent, isMain) => (request === 'vscode' ? {} : originalLoad(request, parent, isMain));
import { readFile } from 'node:fs/promises';
const repoRoot = new URL('../../', import.meta.url);
const { embed } = await import(new URL('out/vector.js', repoRoot).href);
const SERVICE = 'http://10.112.229.254:8765';
const golden = JSON.parse(await readFile(new URL('evals/retrieval-golden.json', repoRoot), 'utf8'));
const probe = JSON.parse(await readFile(new URL('evals/reachability-probe.json', repoRoot), 'utf8'));
async function search(query, caller, limit = 8) {
  const res = await fetch(new URL('/v1/search', SERVICE), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, embedding: embed(query), workspace_id: caller.workspaceId ?? '', session_id: caller.sessionId ?? '', limit }),
  });
  return res.json();
}
const out = { capturedAt: new Date().toISOString(), note: 'full miss list variant of evaluate-retrieval.mjs --reachability (diagnostic only)', callers: {} };
for (const name of ['chat-multiroot', 'mcp']) {
  const caller = golden.callers[name]; const misses = []; let ok = 0;
  for (const s of probe.samples) {
    const r = await search(s.query, caller);
    const ids = (r.lexical ?? []).map((i) => i.id);
    if (ids.includes(s.id)) ok += 1; else misses.push(s.id);
  }
  out.callers[name] = { reachable: ok, total: probe.samples.length, misses };
}
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
