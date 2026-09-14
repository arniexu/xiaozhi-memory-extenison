# Context Recall - Engineering Continuity Workbench UI Design Specification (Gemini-Alt)

> Author: Gemini Bidder 2 (Alternative Concept)  
> Target Directory: [docs/ui-design/gemini-alt/](docs/ui-design/gemini-alt/)  
> Artifacts: [docs/ui-design/gemini-alt/context-recall-story.html](docs/ui-design/gemini-alt/context-recall-story.html), [docs/ui-design/gemini-alt/context-recall-story.css](docs/ui-design/gemini-alt/context-recall-story.css), [docs/ui-design/gemini-alt/context-recall-story.js](docs/ui-design/gemini-alt/context-recall-story.js)  
> Scope: Pure UI Prototype & Design Rationale. No production code in `src/`, `media/`, or `service` is modified.

---

## 1. Executive Summary & Design Philosophy

Most developer tools fail because they present knowledge as an administrative database or a marketing analytics dashboard rather than an **active workbench for ongoing engineering work**.

Context Recall is not a metrics dashboard—it is an **operational flight deck for engineering continuity and evidence-grounded recall**.

### The Core Problem
Engineering teams face recurrent friction:
1. **Lost Investigation Rationale:** When triaging hardware quirks, kernel panics, or register protocol errata, teams spend days rediscovering facts that were already diagnosed in past debugging sessions.
2. **Ungrounded AI Hallucinations:** Generative AI tools frequently invent register offsets and driver configurations because they lack verifiable citations to immutable local evidence.
3. **Silent Knowledge Drift:** Revisions to specifications and codebase architectures silently overwrite legacy constraints, introducing regressions without explicit disagreement review.

### The Gemini-Alt Solution: The Engineering Continuity Workbench
Instead of isolating the **Knowledge Hourglass** as a standalone decorative chart, this design integrates the lifecycle funnel directly as the **navigation and intake spine** of the developer's daily engineering workbench.

Every interaction directly reinforces the 6-stage lifecycle:
1. **Raw Evidence Intake:** Capture debugging turns, oscilloscope logs, and PDF specification excerpts as immutable, hashed artifacts (`draft/raw`).
2. **Candidate Distillation:** Extract candidate assertions with explicit foreign key evidence pointers (`draft/candidate`).
3. **Review & Quarantine Gate:** Validate schemas, check for contradictory assertions, and quarantine conflicts (`contested`) rather than silently overwriting historical facts.
4. **Active Reusable Reservoir:** Commit verified knowledge to local SQLite, 256-d vector indices, and optional Neo4j cross-document graph edges (`active/memory`).
5. **Grounded Historical Recall:** Future engineers query memory and receive synthesized answers citing exact sources (`[1]`, `[2]`), confidence ratings, and document chunks.
6. **Work Resumption:** Immediate handoff generation, action checklists, and patch validation—connecting historical memory directly to live code changes.

---

## 2. The First-Minute Manager Test

An engineering leader or engineering manager opening this interface can answer all six critical operational questions within 60 seconds:

| Question | UI Location & Visual Cue | Answer Under 10 Seconds |
|---|---|---|
| **1. What enters Context Recall?** | Top Chamber of Hourglass Funnel & Raw Cell (`11,448`) | Immutable user/assistant turns, PDF specification chunks, and Continuity decision records. |
| **2. How does information become trusted?** | Neck Chamber & Review Gate Tab (`1,030`) | Extracted into `draft/candidate`, validated against schemas and evidence IDs, promoted only after human/automated review. |
| **3. How much sits at each stage?** | Verified Inventory Strip | `11,448` Raw, `1,030` Candidate, `5,569` Active, `1` Contested, `1,842` Graph Edges, `64` Continuity Decisions. |
| **4. Can I inspect the evidence behind an answer?** | Ask History Tab & Citation Badges (`[1]`, `[2]`) | Yes. Clickable citation pills link directly to SHA256 hashed turns and PDF specification page numbers. |
| **5. What work can I continue or avoid repeating?** | Active Workstream Tab & Continuity Action Deck | Ongoing session goals, reasoning summaries, completed verifications, and pending patch tasks. |
| **6. What remains uncertain, contested, or offline?** | Contested Cell (`1`) & State Alert Banner | Quarantined items are bounded with side-by-side assertion comparisons; Local Fallback clearly warns of service disconnection. |

---

## 3. Screen Narrative (In Strict Lifecycle Order)

```
+-----------------------------------------------------------------------------------------+
| STAGE 1: RAW EVIDENCE INTAKE                                                            |
| Engineer investigates TSOD sensor trip on GlenRock platform. Oscilloscope waveforms,    |
| dmesg outputs, and PDF specs are ingested as immutable, read-only SHA-256 records.      |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| STAGE 2: CANDIDATE DISTILLATION                                                         |
| System parses turns into candidate assertions: "TSOD reg 0x05 requires swab16".         |
| Stored in draft/candidate with mandatory evidence references (turn_8829, chunk_142).     |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| STAGE 3: AUDITABLE REVIEW & CONFLICT BOUNDING                                           |
| Candidates pass schema and integrity verification. Conflicting definitions are bounded  |
| as "contested" rather than silently overwriting historical decisions.                   |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| STAGE 4: ACTIVE KNOWLEDGE RESERVOIR                                                     |
| Promoted knowledge is indexed across 3 tiers: SQLite FTS5 (lexical), 256-d vectors       |
| (semantic), and Neo4j graph relationships (structural entity linking).                  |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| STAGE 5: GROUNDED HISTORICAL RETRIEVAL                                                  |
| 3 months later, a teammate asks: "Why does BMC trip thermal shutdown on warm reboot?"   |
| Engine returns answer citing exact debug turn [1] and platform specification [2].       |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| STAGE 6: RESUME CONCRETE WORK                                                           |
| The engineer immediately applies the verified patch and generates a session handoff,   |
| saving days of redundant hardware diagnostics.                                         |
+-----------------------------------------------------------------------------------------+
```

---

## 4. Information Hierarchy & VS Code Webview Adaptation

The visual system is engineered specifically for dense, dark-mode developer environments (such as the VS Code Webview panel or editor tab):

### Viewport Layout
1. **Top Telemetry & Trust Bar:** Compact header displaying product identity (`Context Recall v0.1.6`), live backend trust badge (`Service Online`, `Local Fallback`, `Service Unavailable`), refresh timestamp, and interactive state simulator.
2. **State Alert Banner:** High-visibility contextual alert for offline fallback, strict service errors, and contested item warnings.
3. **Two-Column Workbench Grid (Collapses to single column below 960px):**
   - **Left Column (340px) - Continuous Lifecycle Hourglass Funnel:**
     - Top Chamber: `draft/raw` intake inventory and status.
     - Neck Chamber: `draft/candidate` gate with quarantine indicators.
     - Bottom Chamber: `active/memory` reservoir with recall status.
     - Verified Inventory Strip: 6 exact verified counts from memory stores.
   - **Right Column (Flex 1) - Active Engineering Workbench:**
     - **Mission Card:** Clear, non-inflated customer outcome statement.
     - **Task Tabs Navigation:** Keyboard-navigable tabs (`Active Workstream`, `Ask History`, `Traceable Journey`, `Review Candidates`, `Contested Issues`).
     - **Interactive Tab Content:** High-density cards, interactive journey stepper, search assistant with citations, candidate approval gate, and conflict resolution workbench.
4. **Collapsible Secondary Technical Details:** `<details>` drawer providing storage engine parameters (SQLite WAL, 256-d vectors, Neo4j endpoint) without cluttering the primary user story.
5. **Footer:** Engineering safety guarantees and privacy boundaries.

---

## 5. Exact Verified Field Mapping

All metrics in this design correspond 1:1 with existing types and store implementations in the repository:

| UI Prototype Element | Codebase Source File | Field Name / Type | Meaning in Codebase |
|---|---|---|---|
| **Raw Evidence Count** | `knowledge-agent-service/.../memory_store.py` | `MemoryStore.stats()["raw"]` | Total records with `memory_kind='raw'` |
| **Candidate Count** | `knowledge-agent-service/.../memory_store.py` | `MemoryStore.stats()["candidate"]` | Total records with `memory_kind='candidate'` |
| **Active Knowledge Count** | `knowledge-agent-service/.../memory_store.py` | `MemoryStore.stats()["active"]` | Total records with `status='active'` AND `memory_kind='memory'` |
| **Contested Knowledge Count** | [src/model.ts](src/model.ts#L114) | `DashboardStats.contestedKnowledge` | Records with `status='contested'` |
| **Graph Relationship Edges** | [src/service-client.ts](src/service-client.ts#L93) | `ServiceHealth.neo4j.relationships` / `DashboardStats.edges` | Cross-document entity and decision edges |
| **Continuity Decisions** | [src/service-client.ts](src/service-client.ts#L82) | `ServiceHealth.memory.continuity` | Imported architecture decisions (`decision-XXXX`) |
| **Evidence Turn IDs** | [src/model.ts](src/model.ts#L62) | `KnowledgeNode.evidenceTurnIds: string[]` | Immutable session turn identifiers |
| **Citations `[1]`, `[2]`** | [src/search-answer.ts](src/search-answer.ts#L40-L70) | `synthesizeSearchAnswer()` citations `[1]` | Synthesized text citing indexed evidence items |
| **Session Context Goal / Steps** | [src/model.ts](src/model.ts#L9-L23) | `SessionContext.goal`, `nextSteps`, `reasoningSummary` | Verified session state continuity data |

### Inventory Integrity Constraints (Strictly Observed)
- **Current Inventory is NOT Conversion:** Counts represent current items sitting at each stage, never conversion rates, processing throughput, or productivity metrics.
- **Excluded Non-Existent Claims:** This design strictly excludes time saved (e.g. "Saved 4.2 hours"), financial ROI, 100% accuracy guarantees, zero-repeat claims, and Host model injection claims (as host-level prompt injection cannot be proven without platform telemetry).

---

## 6. Representative State Matrix

| State Name | Backend Status | Hourglass Appearance | Banner Presentation | Primary Interactive Experience |
|---|---|---|---|---|
| **1. Service Online (Healthy)** | `auto` reachable at `127.0.0.1:8765` | Full 3-stage counts (`11,448` / `1,030` / `5,569`) | None (Clean) | Full interactive workbench, 3-tier hybrid search, active journey stepper. |
| **2. Local Fallback (Offline)** | `auto` with service unreachable | Relabeled to local snapshot vocabulary (`local/sqlite` / `active`) | Warning: Service offline, operating on local SQLite snapshot | Local keyword search and cached continuity active; vector search paused. |
| **3. Service Unavailable (Strict)** | `mode=service` with service unreachable | Stages grayed out (`offline`) | Error: Strict service mode blocked | Queries blocked to prevent ungrounded responses. Clear troubleshooting guidance. |
| **4. Loading / Re-indexing** | Sync in flight | Counts show `--`, pulsating indicators | Info: Syncing SQLite WAL & 256-d vectors | Transient state simulating live background index update. |
| **5. Empty / Fresh Store** | Brand new workspace | All counts `0`, clear empty prompts | Info: No evidence captured yet | Guidance on running first debugging turn or importing hardware PDFs. |
| **6. Contested Knowledge Flagged** | Active service with 12 conflicts | Contested cell highlighted in red (`12`) | Warning: 12 conflicting assertions quarantined | Direct access to Contested Issues tab for side-by-side arbitration. |

---

## 7. Interaction Specification & Proposed Features

### Live Prototype Interactions
1. **Lifecycle State Switcher (`#protoStateSelect`):** Instantly toggles between all 6 representative states, dynamically re-rendering telemetry badges, banners, and hourglass chamber tags.
2. **Integrated Funnel Selection:** Clicking any stage in the Left Hourglass Funnel automatically routes to the appropriate workbench task tab (e.g. clicking the Neck Chamber opens Candidate Review).
3. **Traceable Incident Journey Stepper (`#tab-journey`):** Step-by-step interactive navigation (Steps 1-5) through the real-world OpenBMC TSOD thermal triage case.
4. **Canned Historical Precedent Querying (`#tab-ask`):** Selects between 3 realistic hardware triage scenarios and displays grounded answers with verified citations and actionable next steps.
5. **Keyboard Accessibility:** Full Tab / Shift-Tab navigation, ArrowLeft / ArrowRight navigation across tabs, visible focus rings, and screen-reader ARIA live regions.

### Explicitly Labeled `[Proposed]` Features
To preserve architectural honesty, all capabilities not currently implemented in `src/` are clearly tagged with `[Proposed]`:
- `[Proposed]` Endianness swap patch generation button.
- `[Proposed]` Session context handoff markdown exporter.
- `[Proposed]` Batch candidate review simulation button.
- `[Proposed]` Interactive specification conflict arbitration buttons.

---

## 8. Ideas Worth Combining (Synthesis Section)

As the second independent bidder, this section analyzes ideas from Bidder 1 (baseline) and Bidder 2 (gemini-alt) to formulate a synthesis recommendation for the production implementation:

```
+---------------------------------------------------------------------------------------------------+
| SYNTHESIS MATRIX                                                                                  |
+-------------------------------------+-------------------------------------+-----------------------+
| Retained Prior Ideas (Bidder 1)     | New Ideas Introduced (Bidder 2)     | Production Synthesis  |
+-------------------------------------+-------------------------------------+-----------------------+
| 1. Clear Hourglass Visual Metaphor  | 1. Active Workstream Flight Deck     | Combine Left Hourglass|
|    (Raw -> Candidate -> Active)     |    (Continuity Action Deck)         | Funnel with Right     |
| 2. Distinct Local Fallback State   | 2. Integrated Hourglass Navigation  | Task Workstream.      |
|    vocabulary relabeling            |    (funnel stages click to tabs)    |                       |
| 3. Secondary System Architecture    | 3. Conflict & Contested Resolution  | Retain strict field   |
|    details drawer                   |    Workbench tab                    | mapping & zero fake   |
| 4. Exact field mapping to service   | 4. Next Action Patch Suggestions    | metric rules.         |
|    and model data types             |    in query responses               |                       |
+-------------------------------------+-------------------------------------+-----------------------+
```

### Detailed Breakdown
1. **Retained Prior Ideas (From Bidder 1 & Baseline):**
   - The **Hourglass Metaphor** as the central conceptual model of knowledge settling.
   - The **strict inventory honesty rule** (never claiming counts are conversion rates or time saved).
   - The **local fallback vocabulary shift** (using local snapshot terms when the companion service is unreachable).
   - The **collapsed technical architecture drawer** to keep storage engines secondary to user workflows.

2. **New Ideas Introduced in Gemini-Alt (Bidder 2):**
   - **Continuous Workstream Integration:** Centering the user interface on the engineer's ongoing goal, reasoning summary, and action checklist rather than static charts.
   - **Interactive Hourglass Navigation:** Making the hourglass an active navigation element where clicking a chamber immediately activates the corresponding workbench task.
   - **Contested Knowledge Workbench:** Providing an explicit side-by-side arbitration interface for conflicting register specifications.
   - **Actionable Query Outcomes:** Attaching a concrete "Next Action" recommendation directly beneath cited historical retrieval results.

3. **Synthesis Recommendations for Production:**
   - Implement the **integrated two-column layout**: Keep the visual Hourglass funnel in a slim left sidebar (or collapsible panel) and dedicate the primary canvas to the Active Workstream and Cited Query workbench.
   - Adopt the **actionable answer card format** where citations are clickable pills and next steps can be directly copied or applied to the current workspace.
   - Maintain the **quarantine workflow** for contested assertions to protect LLM prompts from unverified or contradictory hardware data.

---

## 9. Validation Report

Local static validation was performed on all four design artifacts:

1. **JavaScript Syntax Check:**
   `node --check docs/ui-design/gemini-alt/context-recall-story.js` &rarr; `Passed (0 syntax errors)`.
2. **Encoding & ASCII Integrity:**
   `file -bi docs/ui-design/gemini-alt/*` &rarr; `Passed (us-ascii / utf-8 safe, no invalid binary sequences)`.
3. **Repository Cleanliness:**
   No files modified outside `docs/ui-design/gemini-alt/`. Production `src/`, `media/`, `package.json`, and `docs/ui-design/gemini/` are completely untouched.

---

## 10. Summary of Artifacts

- HTML Prototype: [docs/ui-design/gemini-alt/context-recall-story.html](docs/ui-design/gemini-alt/context-recall-story.html)
- CSS Visual System: [docs/ui-design/gemini-alt/context-recall-story.css](docs/ui-design/gemini-alt/context-recall-story.css)
- JS Interaction Script: [docs/ui-design/gemini-alt/context-recall-story.js](docs/ui-design/gemini-alt/context-recall-story.js)
- Specification Document: [docs/ui-design/gemini-alt/context-recall-story.md](docs/ui-design/gemini-alt/context-recall-story.md)
