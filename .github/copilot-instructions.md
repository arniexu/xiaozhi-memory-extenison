# OpenBMC 知识助手 Extension Instructions

## Scope

- This repository owns the VS Code user experience, local fallback storage, transcript discovery, model-assisted organization, and the embedded read-only MCP server.
- Keep the extension usable without Python, Neo4j, the companion service, or an OpenBMC checkout.
- Treat the companion service API as a cross-repository contract. Preserve backward compatibility unless the extension and service are updated and validated together.

## Data And Safety Boundaries

- Sessions and turns are immutable evidence. Derived vectors, summaries, entities, and relationships must retain evidence references and must not be presented as verified source facts.
- Preserve lifecycle distinctions between `raw`, `candidate`, and active memory. Retrieval must not silently promote non-active records.
- Keep synchronization additive and idempotent. Never delete source transcripts or local fallback data as part of synchronization or migration.
- Keep MCP tools read-only. Do not expose import, synchronization, relink, or graph-write operations through MCP.
- Redact credentials before persisting transcript excerpts or sending them to a model. Do not log secrets, database credentials, or full private transcripts.
- Do not claim that returned session context was injected into a model request without host-level evidence.

## Implementation

- Follow the existing TypeScript style and VS Code APIs. Avoid private VS Code APIs.
- Preserve `contextRecall.*` as the canonical configuration namespace and retain `knowledgeAgent.*` only for compatibility where already supported.
- In `auto` mode, service failures must fall back to local storage without corrupting or replacing either data source. In `service` mode, surface failures clearly.
- Keep UI and retrieval work cancellable and bounded; do not block extension activation on service availability or model calls.

## Validation

- Run `npm run check-types` after TypeScript changes.
- Run `npm run lint` for source changes.
- Run `npm test` for behavior changes, and `npm run test:mcp` when MCP tools or service integration changes.
- Run `npm run package` before release-oriented changes are considered complete.

## vexp <!-- vexp v3.1.3 -->

### Context strategy: call run_pipeline ONCE at task start
If the task already names the files/symbols to touch, SKIP vexp. Otherwise one
`run_pipeline({ "task": "..." })` returns ranked pivot files with line ranges and
blast radius. Do NOT open files one by one to find your way around - every extra
tool call costs a turn. Call it again ONLY when the task moves to a new area.
`get_skeleton` for files to understand, not edit. `verify_done` before calling a
multi-file task complete, then RUN the tests it names.

### Query shape (do this)
Anchor the task on real identifiers (ClassName, functionName) or file paths:
`run_pipeline({ "task": "fix JWT expiry in AuthService.validateToken" })`

vexp runs entirely on this machine, index in `.vexp/`;
`run_pipeline` transmits nothing to any external service.
On `status: "degraded"` or 0 pivots the index is still building - use your own tools.
For literal string sweeps use your native search - do NOT route text sweeps through vexp.
Repo SOURCE only: logs, dist/, node_modules/ and files outside the repo are NOT indexed.
<!-- /vexp -->