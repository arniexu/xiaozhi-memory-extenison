import Module from 'node:module';
const originalLoad = Module._load;
Module._load = (request, parent, isMain) => (request === 'vscode' ? {} : originalLoad(request, parent, isMain));
import { readFile } from 'node:fs/promises';
const repoRoot = new URL('../../', import.meta.url);
const { embed } = await import(new URL('out/vector.js', repoRoot).href);
const SERVICE = 'http://10.112.229.254:8765';
const golden = JSON.parse(await readFile(new URL('evals/retrieval-golden.json', repoRoot), 'utf8'));
const probe = JSON.parse(await readFile(new URL('evals/reachability-probe.json', repoRoot), 'utf8'));
const detail = JSON.parse(await readFile(new URL('evals/quality-audit-2026-09-29/raw/reachability-detail-2026-09-29.json', repoRoot), 'utf8'));
async function search(query, caller, limit = 8) {
  const res = await fetch(new URL('/v1/search', SERVICE), { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, embedding: embed(query), workspace_id: caller.workspaceId ?? '', session_id: caller.sessionId ?? '', limit }) });
  return res.json();
}
const caller = golden.callers['chat-multiroot'];
const byId = new Map(probe.samples.map((s) => [s.id, s]));
const out = [];
for (const id of detail.callers['chat-multiroot'].misses) {
  const s = byId.get(id);
  const r = await search(s.query, caller);
  const found = { lexical: false, semantic: false, semantic_memories: false, graph: false };
  for (const it of (r.lexical ?? [])) if (it.id === id) found.lexical = true;
  for (const it of (r.semantic ?? [])) if (it.source_id === id) found.semantic = true;
  for (const it of (r.semantic_memories ?? [])) if (it.id === id) found.semantic_memories = true;
  for (const it of (r.graph ?? [])) if (it.id === id) found.graph = true;
  out.push({ id, query: s.query.slice(0, 80), found });
}
process.stdout.write(JSON.stringify({ capturedAt: new Date().toISOString(), caller: 'chat-multiroot', checked: out }, null, 2) + '\n');
