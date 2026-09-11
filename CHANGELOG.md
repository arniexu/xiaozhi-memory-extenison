# Change Log

## 0.3.19

- Rebuild page text from PDF text-item coordinates so table rows survive extraction: items are clustered by Y into rows, ordered by X, and large column gaps become ` | ` cell separators.
- Fix register/field tables whose values previously followed the PDF content stream instead of their row, such as the GMM register map.

## 0.3.18

- Split PDF pages into smaller, sentence-aware chunks with Chinese punctuation, paragraph, and list boundaries.
- Preserve PDF.js line endings so document structure survives extraction and chunks avoid mid-word cuts where layout evidence is available.

## 0.3.17

- Prevent the offline query-rewrite fallback from attaching explicit short topic changes to the previous topic.
- Add a repeatable continuity evaluation covering pronouns, elliptical follow-ups, topic changes, and open-issue lifecycle behavior.

## 0.3.16

- Restore persistent working session context with goals, current topic and phase, verified results, open issues, next steps, changed files, and evidence references.
- Rewrite short or referential follow-up prompts into self-contained retrieval queries, with a bounded local fallback when the model is unavailable.
- Update session state after each completed answer and generate follow-ups from unresolved issues and next steps.
- Restore the read-only `session_context` MCP tool while explicitly distinguishing returned context from Host-confirmed injection.

## 0.3.15

- Rank graph, semantic, and lexical results by combined term overlap, source rank, and native semantic similarity.
- Preserve graph relationship direction, stable IDs, confidence, and evidence in search responses.
- Connect retrieved items through explicit graph edges or shared evidence in Chat, MCP, sidebar, and dashboard results.

## 0.3.14

- Isolate PDF.js extraction from the VS Code Extension Host to support its getter-only global navigator.

## 0.3.13

- Package and configure the PDF.js worker so PDF evidence uploads work from the bundled Extension Host.

## 0.3.12

- Add multi-file PDF evidence upload with page-aware chunking, stable hashes, semantic vectors, and WIP/draft isolation.

## 0.3.11

- Add one Data Overview import entry that automatically recognizes Context Recall snapshots and Continuity JSON or JSONL files.
- Import Continuity decisions incrementally into the layered service with stable IDs, lifecycle status, provenance, vectors, and relationships.
- Show the imported Continuity decision count in the sidebar and dashboard service metrics.

## 0.3.10

- Temporarily use a known-good PNG Activity Bar asset to distinguish SVG rendering from container resource loading failures.

## 0.3.9

- Move the Activity Bar contribution to a new `contextRecall` container ID so VS Code does not reuse the removed legacy icon URI cached under `knowledgeAgent`.

## 0.3.8

- Replace the Activity Bar icon with an explicit 24 by 24 solid monochrome SVG for reliable workbench rendering.

## 0.3.7

- Fix the Activity Bar icon by using a concrete monochrome SVG stroke that remains visible when loaded as a CSS mask.

## 0.3.6

- Rename the product and all user-facing surfaces to Context Recall.
- Change the sticky chat participant from `@memory` to `@recall`.
- Preserve existing command, configuration, storage, and environment identifiers for compatibility.

## 0.3.3

- Allow layered-service synchronization enough time to upload and process full snapshots.
- Include bounded service response details in synchronization errors.

## 0.3.2

- Add hybrid knowledge search directly to the Activity Bar sidebar.
- Show graph, semantic, lexical, and local fallback results in a bounded result panel.
- Keep local results available with an explicit warning when the layered service cannot be reached.

## 0.3.1

- Activate on startup so the MCP server definition provider is registered before Copilot Chat discovers tools.
- Add provider registration and discovery diagnostics to the Extension Host log.

## 0.3.0

- Register an embedded MCP server directly with GitHub Copilot Chat.
- Add read-only `knowledge_search` and `knowledge_status` tools for Agent mode.
- Search Neo4j, FTS5, and semantic vectors through the layered service, with local snapshot fallback.

## 0.2.4

- Include read-only Neo4j node and one-hop relationship matches in hybrid search.
- Merge graph, semantic, lexical, and local evidence results in chat and Data Overview.
- Preserve SQLite/vector results when Neo4j search is temporarily unavailable.

## 0.2.3

- Add detailed memory SQLite, vector SQLite, and Neo4j information to Data Overview.
- Show database files, sizes, features, dimensions, graph database, endpoint, nodes, and relationships without exposing credentials.

## 0.2.2

- Add live layered-service health and lifecycle metrics to Data Overview.
- Separate service records from the portable local evidence snapshot throughout the dashboard.
- Add service synchronization and automatic health refresh to the full overview.

## 0.2.1

- Add a live layered-service section to the Activity Bar view with backend mode, endpoint, memory, vector, and Neo4j status.
- Distinguish service data from the portable local fallback snapshot.
- Refresh service health automatically and disable synchronization while the service is unavailable.

## 0.2.0

- Add optional connection to the independent layered Context Recall service.
- Prefer hybrid SQLite FTS/vector retrieval when the service is available, with an explicit local fallback mode.
- Add non-destructive synchronization of existing local sessions, vectors, nodes, and edges into the layered service.
- Show backend and Neo4j readiness in the Activity Bar view.

## 0.1.4

- Add an in-extension workflow to discover and organize all local Copilot Chat transcripts.
- Preserve bounded transcript excerpts as session evidence and link generated summaries, knowledge, and relationships to that evidence.
- Make historical organization incremental, resumable, cancellable, and available from the Activity Bar.

## 0.1.3

- Add a proper Context Recall Activity Bar container and monochrome theme-aware icon.
- Add a compact sidebar overview with metrics, recent sessions, activity, and direct actions.

## 0.1.2

- Preserve evidence and tags when knowledge is encountered repeatedly.
- Keep distinct facts and decisions about the same subject as separate claims.
- Validate imported snapshot structure and vector dimensions before replacing local data.

## 0.1.1

- Added a one-click Knowledge Chat launcher to the status bar and Command Palette.
- The launcher preselects the sticky `@knowledge` participant so it does not need to be typed on every turn.

## 0.1.0

- Added the `@knowledge` persistent chat participant.
- Added local session capture and a 256-dimensional embedded vector index.
- Added model-driven, evidence-linked knowledge graph organization.
- Added the data overview with graph, session, vector, quality, search, import, and export views.
- Packaged all runtime behavior inside the extension with no external database or service.