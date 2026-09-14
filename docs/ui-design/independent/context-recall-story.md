# Context Recall - Independent Product-Story Direction

Status: design prototype only. No production UI is implemented by this work.

## 1. Direction

This concept is a third direction for Context Recall: an IDE-native continuity workbench.
It is intentionally neither a generic dashboard nor a marketing hero. The screen behaves like a daily-use engineering surface where the user can:

1. See what entered the system.
2. Understand how evidence settles through raw, candidate, and active stages.
3. Review what is trusted, contested, offline, or still pending.
4. Ask a grounded historical question and continue work.

The hourglass is the primary navigation model for the lifecycle, not an ornament. The right side acts as a continuity workspace, and the ledger keeps evidence visible at the moment of recall.

## 2. Deliverables

The prototype consists of four files under docs/ui-design/independent:

1. context-recall-story.html
2. context-recall-story.css
3. context-recall-story.js
4. context-recall-story.md

## 3. Screen Narrative

The interface tells the required story in this order:

1. Engineering work generates immutable evidence: conversation turns, imported decisions, document excerpts, and investigation results.
2. Context Recall captures that evidence without replacing it.
3. Knowledge settles through explicit stages: raw evidence, candidate knowledge, and active knowledge.
4. Review and contested states establish trust before active reuse.
5. A future engineer asks a real question and receives a grounded answer with rationale, evidence, and a next action.
6. The practical outcome is continuity and less repeated reconstruction, without claiming ROI, time savings, avoided incidents, or model injection.

## 4. Information Hierarchy

1. Compact header: product identity, backend trust state, refresh time, and state switcher.
2. First viewport story strip: concise explanation of the product story and one outcome statement.
3. Workbench shell with three panes:
   - customer task pane
   - hourglass lifecycle pane
   - continuity workspace with recall journey and evidence ledger
4. Inventory ledger showing the current system counts.
5. Expandable details that separate current capabilities from proposed workflow additions.

## 5. Verified Data Mapping

Only fields verified in the current extension types and service-health contract are used for numeric claims.

| Prototype label | Verified field | Source |
| --- | --- | --- |
| Captured | `ServiceHealth.memory.total` | src/service-client.ts |
| Raw | `ServiceHealth.memory.raw` | src/service-client.ts |
| Candidate | `ServiceHealth.memory.candidate` | src/service-client.ts |
| Active | `ServiceHealth.memory.active` | src/service-client.ts |
| Evidence-backed | `DashboardStats.evidenceBackedKnowledge` | src/model.ts, src/store.ts |
| Contested | `DashboardStats.contestedKnowledge` | src/model.ts, src/store.ts |
| Linked relationships | `ServiceHealth.neo4j.relationships` or `DashboardStats.edges` | src/service-client.ts, src/model.ts, src/store.ts |
| Backend trust state | `ServiceHealth.available`, `ServiceHealth.mode`, `ServiceHealth.url` | src/service-client.ts |

Important boundary:

1. The service lifecycle exposes raw, candidate, and active counts.
2. The local snapshot does not expose raw or candidate counts.
3. In offline fallback, the prototype shows those stage counts as unavailable instead of inventing them.

## 6. Current Capability vs Proposed Workflow

The prototype explicitly labels what exists today versus what this design proposes.

Currently implemented capabilities reflected in the design:

1. Service health and safe counts.
2. Local fallback retrieval.
3. Search against service and local snapshot.
4. Session context structures with goals, open issues, next steps, and evidence references.
5. Evidence-linked knowledge nodes and relationships.

Proposed workflow additions in this design:

1. One integrated continuity workbench combining lifecycle navigation and retrieval.
2. Candidate review inside the extension UI.
3. A persistent evidence ledger that follows the current answer.
4. State-specific guidance for contested and first-run experiences.

## 7. Interaction Specification

1. State selector: switches among online, local fallback, service unavailable, empty, loading, and contested states.
2. Refresh: briefly re-enters the loading state and updates the timestamp.
3. Hourglass stage buttons: select raw, candidate, active, or recall and update the right-side explanation.
4. Prev and Next: step through the evidence-to-answer journey.
5. Customer task buttons: route directly to the relevant lifecycle stage.
6. Question selector: updates the example grounded answer and evidence ledger.
7. Expandable details: keep implementation details secondary.

## 8. State Matrix

| State | Trust state | Hourglass behavior | Inventory behavior | Notes |
| --- | --- | --- | --- | --- |
| Online service | service reachable | all four stages visible with counts | service and local-backed fields shown | default representative state |
| Local fallback | service unavailable in auto mode | raw and candidate remain part of the model but counts are unavailable | active, evidence-backed, contested, and relationships remain visible | offline is valid, not an error |
| Service unavailable | service mode failure | lifecycle still shown but service-backed counts blocked | local snapshot values shown only as reference where noted | failure is explicit |
| Empty | zero records | all stages visible at zero | all inventory shows zero | useful first-run explanation |
| Loading | refresh in progress | shape remains stable, counts pending | values show pending | avoids layout thrash |
| Contested | service online with disagreement | candidate and review language emphasized | contested count increases and active may decrease | trust is bounded, not hidden |

## 9. Accessibility Notes

1. Semantic landmarks: header, main, section, aside, article, details.
2. Keyboard navigation uses native buttons, select elements, and details.
3. Visible focus styles are present on all controls.
4. The trust pill, banner, and step counter use polite live regions.
5. Reduced-motion support removes animation and smooth scrolling.
6. Responsive behavior uses one implementation for desktop and narrow layouts.
7. Source files remain ASCII-only.

## 10. Unsupported Metrics Deliberately Excluded

The prototype intentionally does not claim:

1. ROI
2. time saved
3. avoided incidents
4. zero repeated work
5. accuracy percentages
6. Host injection of retrieved context into a model request
7. historical conversion rates or throughput from current inventory counts

## 11. Original Contributions

This independent direction contributes three ideas that are distinct from the existing concepts:

1. The workbench model: the interface behaves like an operational surface inside VS Code, not a presentation page.
2. The evidence ledger: the supporting evidence stays adjacent to the answer rather than becoming a separate destination.
3. Honest offline semantics: raw and candidate counts disappear when the local fallback cannot verify them, while active and contested local data remain usable.

## 12. Ideas Worth Combining

Comparison to the existing root concept:

1. Worth keeping: the root concept is disciplined about verified field mapping, lifecycle honesty, and keeping system details secondary.
2. Limitation to avoid: it still reads as a structured overview page more than a surface for repeated in-editor work.

Comparison to the Gemini concept:

1. Worth keeping: the Gemini concept pushes traceability and a stronger sense of engineering instrumentation.
2. Limitation to avoid: it over-claims with unsupported value language, leans too heavily on infrastructure internals, and visually drifts toward a product showcase.

Original synthesis proposal:

1. Keep the root concept's honesty about data availability and lifecycle semantics.
2. Keep Gemini's bias toward explicit traceability and stage clarity.
3. Use this independent workbench pattern as the structural frame for daily extension use.
4. Land a production UI only after candidate-review scope and offline count semantics are confirmed.

## 13. Implementation Boundaries

1. Only docs/ui-design/independent is modified.
2. No production extension code, service code, package metadata, or media assets are touched.
3. No external fonts, network dependencies, or build steps are required.
4. Storage engines remain secondary explanatory detail.

## 14. Validation

Local validation target for this prototype:

1. JavaScript syntax check.
2. ASCII and MIME sanity check for the four artifacts.
3. Diff whitespace check for the independent design directory.
4. Small static accessibility-oriented check for required landmarks and reduced-motion support.

## 15. Open Questions For Acceptance

1. Should offline fallback continue to hide raw and candidate counts, or should the extension eventually persist matching lifecycle aggregates locally?
2. Is a dedicated candidate-review surface in scope for the extension, or should it remain a command-driven workflow?
3. When both service and local relationship counts exist, which one should the production UI present as authoritative?