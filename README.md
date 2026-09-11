# Context Recall

A cross-project engineering memory and context retrieval assistant for VS Code, with an optional independent layered-memory service.

## Architecture

The extension provides chat, organization, visualization, and a portable local fallback. In the default `auto` backend mode it uses the independent companion service when available and falls back to local extension storage when the service is offline.

The service owns the production multi-layer path:

1. SQLite stores scoped lifecycle records as `raw`, `candidate`, or active memory with FTS5 and audit events.
2. A separate SQLite vector database provides semantic recall.
3. Neo4j stores normalized entities and relationships through additive operations only.
4. Hybrid retrieval combines lexical and vector results while preserving evidence references.

## Data Model

Context Recall deliberately keeps three data layers separate:

1. **Sessions** are immutable evidence: complete user and assistant turns owned by `@recall`.
2. **Vectors** are derived 256-dimensional local indexes used for recall. They are reproducible search data, not evidence or verified facts.
3. **Knowledge graph** nodes and relationships are model-organized claims linked back to evidence turn IDs, confidence, and lifecycle status.

Each `@recall` session also maintains bounded working context: its goal, current topic and phase, completed and verified work, intermediate conclusions, decisions, open issues, next steps, changed files, and evidence references. Short follow-up prompts are rewritten against this state before retrieval. If context resolution is unavailable, search falls back to the original prompt or a conservative current-topic expansion.

Fallback data is persisted under the extension's VS Code `globalStorageUri`. Service data defaults to `~/.local/share/knowledge-agent-service`. No project repository files are modified.

## Use

1. Start `knowledge-agent-service serve` when layered persistence is required.
2. Click `Context Recall` in the status bar, or run `Context Recall: Start Chat` from the Command Palette.
3. Type the first prompt in the focused Chat input. The launcher preselects `@recall` without sending a message.
4. Continue the conversation normally. The participant is sticky, so `@recall` does not need to be repeated. Every completed turn is stored and indexed.
5. Run `Context Recall: Open Data Overview` from the Command Palette, or use `@recall /overview`.

Use `knowledgeAgent.backend` to select `auto`, `service`, or `local`, and `knowledgeAgent.serviceUrl` to change the default `http://127.0.0.1:8765` endpoint. Run `Context Recall: Sync Local Data To Layered Service` for an explicit additive synchronization. Existing local data remains available as a fallback. The `knowledgeAgent.*` identifiers are retained for compatibility with existing settings, shortcuts, and stored data.

The Activity Bar view includes a hybrid search box and result panel for graph, semantic, lexical, and local evidence. The full overview shows sessions, turns, vector coverage, knowledge nodes, relationships, confidence state, recent organization activity, vector search, and a graph view.

Layered-service synchronization uses an extended operation timeout for full local snapshots while health and search requests retain short interactive timeouts.

### GitHub Copilot MCP Tools

The extension registers an embedded `Context Recall` MCP server directly with VS Code. GitHub Copilot Chat can discover and invoke these read-only tools in Agent mode without a separate `.vscode/mcp.json` entry:

- `knowledge_search` searches Neo4j relationships, SQLite FTS5 records, and semantic vectors, then falls back to the extension snapshot when the service is unavailable in `auto` mode.
- `knowledge_status` reports the active backend and safe record counts without returning credentials or database paths.
- `session_context` returns bounded structured state, recent turns, and evidence-linked knowledge for a requested session or the latest workspace session.

Tool execution remains controlled by VS Code and GitHub Copilot Chat. Returning `session_context` does not prove that the Host injected it into a model request. The MCP server does not expose synchronization, import, or graph-write operations.

### Organize Existing Copilot Sessions

Open the Context Recall Activity Bar view and select **Organize Copilot sessions**, or run **Context Recall: Organize All Copilot Sessions** from the Command Palette. Context Recall discovers local Copilot Chat transcripts, keeps a bounded evidence excerpt for each session, and uses an available VS Code Copilot model to create session summaries, durable knowledge nodes, and evidence-linked relationships.

The operation is incremental and cancellable. Running it again skips sessions that were already organized and resumes sessions that previously failed. Original transcripts remain in VS Code storage and are not modified.

## Import And Export

The overview has one **Import data** entry. It automatically recognizes a compatible Context Recall snapshot, a Continuity decisions JSON array, or a Continuity JSONL file.

Context Recall snapshots replace the local fallback snapshot after validation. A snapshot contains:

- `sessions` and `turns`
- `vectors`
- knowledge `nodes` and `edges`
- organization `events`

Imports are validated before replacing local data. Imported vectors must contain exactly 256 finite values and use the snapshot schema declared by this extension. Raw files from an unrelated vector database require a converter into this portable format; session turns and evidence references must travel with their vectors so provenance is not lost.

Continuity decisions are imported into the layered service rather than copied into the local session snapshot. The import preserves stable decision IDs, lifecycle status, tags, source references, embeddings, and explicit relationships. Repeating the same import updates matching IDs without creating duplicates. The layered service must be online for a Continuity import.

Repeated knowledge organization preserves the original creation time and merges evidence turn IDs and tags. Facts and decisions are identified by their complete claim, so two different claims about the same subject do not overwrite one another.

### Import PDF Evidence

The overview also has an **Import documents** entry. It extracts each PDF page, splits it into overlapping page chunks, and imports chunk text, provenance, and vectors into the layered service. The service then links every chunk against the entities it already knows, which is deterministic, model-free, and reproducible.

After a document is indexed, Context Recall asks the active chat model to read a bounded set of evenly sampled excerpts and propose canonical entities, their alternate surface forms, and the relationships this document states. Extraction is anchored to the originating chunk IDs, so every resulting node and relationship keeps its evidence. Proposals are merged into the local snapshot and synced additively to the layered service once per import.

This is what makes cross-document discovery work. A document that only produced `Document` and `DocumentChunk` nodes stays isolated; once documents contribute entities, two documents that mention the same entity are related, and later imports link into that shared vocabulary automatically. Extraction is best-effort: an unreadable excerpt is skipped, a cancelled import keeps whatever was already indexed, and if no chat model is available the import still completes with structure, provenance, and vectors intact.

## Independence And Preservation

The extension and service live outside source repositories such as OpenBMC. The extension can still run in local fallback mode without:

- OpenBMC or another source repository
- Python or external MCP configuration
- workspace tasks
- Docker or Neo4j
- a listening service

The layered service never clears source snapshots, existing SQLite stores, vector stores, or Neo4j. Migration is explicit, additive, idempotent, and verifies that source files remain unchanged. Neo4j synchronization is opt-in and uses `MERGE` without reset or delete operations.

The extension uses the language model selected in the VS Code Chat UI for answering and asynchronous knowledge organization.

## Privacy Boundary

The extension stores conversations directed to its own `@recall` participant. Historical organization is an explicit user action that reads local Copilot transcript files, copies only a bounded evidence excerpt, and applies common credential redaction before model processing or persistence. It does not modify the source transcripts.

VS Code's default-participant API is private to approved extensions. Context Recall therefore uses a one-click launcher plus the stable sticky-participant behavior instead of relying on private APIs or silently intercepting other chats.
---
