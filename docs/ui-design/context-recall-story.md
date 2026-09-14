# Context Recall - Product Story UI Design

Status: design prototype only. No production UI is implemented by this work.

## 1. Purpose

This document specifies a single coherent product story for Context Recall and a
self-contained interactive prototype under `docs/ui-design/`. The story turns the
real lifecycle (immutable evidence -> raw -> candidate -> active -> evidence-grounded
recall) into one narrative an engineering customer can follow without knowing
SQLite, vectors, FTS5, or Neo4j.

The previous overview presented the lifecycle as a small hourglass isolated among
infrastructure cards. This design makes the hourglass the dominant first-viewport
visual and connects it, layer by layer, to a concrete evidence-to-recall journey.

## 2. Artifacts

| File | Role |
| --- | --- |
| `context-recall-story.html` | Semantic, self-contained prototype. Opens directly as a local file; no build step, no network assets. |
| `context-recall-story.css` | Complete visual system, responsive behavior, reduced-motion support. |
| `context-recall-story.js` | Minimal interactions: switch representative states and trace one recall journey. |
| `context-recall-story.md` | This document. |

## 3. Screen narrative (in order)

1. **Evidence enters.** Engineering work - conversations, documents, decisions,
   investigation results - creates scattered but immutable evidence. The story
   opens on "Work becomes evidence."
2. **Capture without replacement.** Context Recall captures that evidence as-is;
   it never replaces or silently promotes the source.
3. **Knowledge settles in stages.** Records rest at explicit lifecycle stages:
   raw evidence, candidate knowledge, active reusable knowledge. The hourglass
   shows the current inventory at each stage.
4. **Active knowledge stays linked.** Active knowledge retains evidence, confidence,
   scope, and relationships.
5. **A grounded answer returns.** A future engineer asks a real question and receives
   an answer with citations, historical rationale, and a next action.
6. **Customer outcome.** The next engineer can continue instead of re-investigating,
   with auditable engineering judgment. This is stated as intent, never as a
   measured metric.

## 4. Information hierarchy

1. Header: product identity, backend trust state, refresh timestamp, prototype
   state switcher.
2. First viewport: headline, outcome statement, primary customer actions, the
   hourglass (dominant), and the vertically aligned journey rail.
3. Example journey: one record traced from source turn to grounded answer, with
   Prev/Next controls.
4. Current inventory: labeled counts for captured, raw, candidate, active,
   evidence-backed, contested, and linked relationships.
5. System details: expandable, kept secondary.

## 5. Real data-field mapping

All counts in the prototype map to fields that exist in the current code. The
prototype uses representative demo values, not production data.

| Prototype label | Real field | Source | Availability |
| --- | --- | --- | --- |
| Captured | `ServiceHealth.memory.total` | `src/service-client.ts` | Service online only |
| Raw evidence | `ServiceHealth.memory.raw` | `src/service-client.ts` | Service online only |
| Candidate | `ServiceHealth.memory.candidate` | `src/service-client.ts` | Service online only |
| Active knowledge | `ServiceHealth.memory.active` | `src/service-client.ts` | Service online only |
| Imported decisions | `ServiceHealth.memory.continuity` | `src/service-client.ts` | Service online only |
| Evidence-backed | `DashboardStats.evidenceBackedKnowledge` | `src/store.ts` | Always (local snapshot) |
| Contested | `DashboardStats.contestedKnowledge` | `src/store.ts` | Always (local snapshot) |
| Linked relationships | `ServiceHealth.neo4j.relationships`, falls back to `DashboardStats.edges` | `src/service-client.ts`, `src/store.ts` | Neo4j when ready, else local edges |
| Trust state | `ServiceHealth.available`, `ServiceHealth.mode`, `ServiceHealth.url` | `src/service-client.ts` | Always |
| Knowledge kind / status / confidence | `KnowledgeNode.kind / status / confidence`, `KnowledgeEdge.type` | `src/model.ts` | Always |

The local snapshot has a different lifecycle vocabulary than the service: local
`KnowledgeNode.status` is `active | contested | superseded`; the `raw | candidate |
active` staged lifecycle is a service-side concept. The prototype reflects this by
relabeling the hourglass in local-fallback state instead of fabricating raw/candidate
counts locally.

## 6. Hourglass metaphor

The hourglass is the central lifecycle metaphor and is not decorative:

- **Top (raw)**: widest chamber. Evidence enters and has not yet been promoted.
- **Neck (candidate)**: the narrowest point. Knowledge under human review before
  it can become active.
- **Bottom (active -> recall)**: widens again into reusable knowledge that returns
  as grounded answers.

The journey rail is vertically aligned to the four hourglass layers. Selecting a
journey step highlights the matching hourglass layer and shows the step detail,
making the spatial and conceptual connection explicit.

Counts are current inventory. The prototype never labels inventory as conversion,
throughput, time saved, ROI, or quality improvement.

## 7. Representative states

| State | Backend | Hourglass | Banner | Journey |
| --- | --- | --- | --- | --- |
| Loading | transient | counts "--" | none | placeholder |
| Online service | `auto` + service reachable | service lifecycle counts | none | full story |
| Local fallback | `auto` + service unreachable | relabeled to local snapshot vocabulary | info: service unreachable | full story with note |
| Service unavailable | `service` + service unreachable | service counts "--", local counts visible | error: retrieval blocked | placeholder |
| Empty | first run | all zeros | info: nothing captured | placeholder |
| Contested | service online + contested nodes | service lifecycle counts | warn: N items need review | full story, review emphasized |

## 8. Interaction specification

- **Prototype state switcher** (header select): switches among the six states.
  Selecting "Loading" auto-settles to "Online service" after a short delay.
- **Refresh**: re-enters the loading state briefly, then returns to the current
  state, updating the refresh timestamp.
- **Journey steps** (1-4): set the active step, highlight the corresponding
  hourglass layer, and show that step's panel. Steps are keyboard-focusable buttons
  with `aria-current="step"`.
- **Prev / Next**: step through the journey.
- **Ask history** (select in the recall panel): chooses a canned question and
  renders the matching grounded answer with citations.
- **Primary actions**:
  - *Continue work*: jumps to the grounded-answer step.
  - *Ask history*: jumps to the answer step and focuses the question control.
  - *Inspect evidence*: jumps to the answer step and scrolls to the evidence list.
  - *Review candidates*: jumps to the candidate step and, in the contested state,
    also surfaces the review banner.
- **System details**: native `<details>` toggle.

## 9. Accessibility notes

- Semantic landmarks: `header`, `main`, `section` with `aria-labelledby`,
  `nav`, `article`, `footer`.
- Skip link to main content.
- All interactive elements are native `button`, `select`, or `details`; keyboard
  reachable with visible focus via `:focus-visible`.
- Live regions (`aria-live="polite"`) on the trust pill, step counter, and banner.
- Color is never the only channel: every hourglass layer and journey step carries
  a text label and count.
- `prefers-reduced-motion` disables transitions and animations.
- Responsive: single implementation covers desktop and narrow layouts; the journey
  rail reflows from vertical (aligned to the hourglass) to horizontal under the
  hourglass at narrow widths.
- ASCII only in source files.

## 10. Implementation boundaries

- Only files under `docs/ui-design/` are created. `src/`, `media/`, `package.json`,
  service code, VSIX files, and production data are untouched.
- No external network assets; CSS and JS are local and linked relatively.
- No claimed Host injection. The recall answer carries an explicit disclaimer that
  returning context does not prove a model request injected it.
- Unsupported metrics are deliberately excluded: time saved, ROI, avoided incidents,
  historical conversion/throughput, and quality scores. None of these exist as
  real event data in the current code.

## 11. Open acceptance questions

1. Should "evidence-backed" and "contested" continue to be sourced from the local
   snapshot stats, or should the service expose equivalent aggregate counts so the
   story is consistent when only the service is online?
2. Should the staged raw/candidate/active vocabulary be mirrored into the local
   snapshot, or is the local fallback relabeling in this design the right honest
   presentation?
3. Should "linked relationships" prefer `neo4j.relationships` or `DashboardStats.edges`
   when both are present but differ?
4. Does the header trust pill need the resolved service URL shown to customers, or
   is mode plus reachability enough?
5. Is a demo-state switcher acceptable inside the final product, or should the
   six states be exercised only through environment setup during acceptance?
