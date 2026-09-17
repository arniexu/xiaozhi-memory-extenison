# Historical Decision Reference Design

Status: proposed; the routing, ranking, and presentation behavior in this document is not yet fully implemented.

## Goal

OpenBMC 知识助手 should help an engineer answer two different questions without treating them as the same source of truth:

1. What do technical sources say about this subject?
2. What did this project previously decide, under which constraints, and is that decision still applicable?

Technical documents and source-linked facts provide evidence. Continuity provides project decisions and constraints. OpenBMC 知识助手 retrieves and relates both, but it does not silently promote a historical decision into the current decision.

## Ownership Boundary

- Continuity remains the system of record for project decisions, status, and supersession.
- OpenBMC 知识助手 stores searchable, additive projections of Continuity records and links them to technical evidence.
- The extension owns intent detection, query construction, result presentation, and explicit user controls.
- The service owns lifecycle-aware filtering, scoped hybrid retrieval, ranking inputs, and relationship traversal.
- A new or changed project decision is written through Continuity, not through the read-only OpenBMC 知识助手 MCP server.

## Intent Routing

Routing must not depend only on a model deciding whether a term looks technical. The extension applies deterministic signals before optional model-assisted disambiguation.

### Technical Evidence Intent

Trigger technical retrieval when at least one of these conditions is true:

- The current prompt explicitly requests search, a definition, a specification, a page, a register, a protocol, an interface, a threshold, or a command.
- The current prompt matches an active entity label or alias from the service catalogue.
- The user invokes an explicit OpenBMC 知识助手 search command.

Entity labels and aliases form the primary terminology catalogue. Tags are ranking metadata and are not terminology aliases by default.

### Historical Decision Intent

Trigger decision retrieval when the current prompt asks, explicitly or implicitly:

- why a choice was made;
- what was previously agreed or constrained;
- whether a proposed change conflicts with earlier work;
- what alternatives, risks, or trade-offs were considered;
- whether an earlier decision is still active or has been superseded.

Typical signals include `why`, `previously`, `decided`, `agreed`, `constraint`, `trade-off`, `conflict`, `change`, and their localized equivalents. These signals are hints, not decision records.

### Combined Intent

A prompt may require both paths. For example, a question about changing PECI fallback behavior should retrieve specification evidence and relevant historical decisions in parallel, then keep the two result classes visibly separate.

## Query Construction

The current user prompt is the primary retrieval query. Conversation history is used only to resolve references such as `it`, `that register`, or `the previous approach`.

The router must not append unrelated earlier topics to a self-contained prompt. A direct topic change such as `search PECI` must remain a PECI query even if the preceding conversation discussed another domain.

Each routed request produces a structured plan:

```json
{
  "query": "PECI service fallback behavior",
  "intents": ["technical_evidence", "historical_decision"],
  "scope": {
    "workspace_id": "current workspace",
    "repo_id": "current repository when known",
    "components": ["PECI", "service fallback"]
  },
  "include_status": ["active", "superseded"],
  "exclude_status": ["raw", "candidate"]
}
```

Superseded decisions are included for history and conflict explanation, never presented as current guidance.

## Decision Record Projection

An imported decision should preserve or derive these fields when available:

- stable decision ID;
- question and reasoning;
- repository, workspace, component, and branch scope;
- lifecycle status;
- creation and update timestamps;
- tags and source references;
- constraints and alternatives;
- `supersedes` and `superseded_by` relationships;
- linked evidence IDs;
- observed outcome or validation evidence.

Missing fields remain unknown. The service must not infer a verified outcome merely because a decision is active.

## Retrieval And Ranking

Decision ranking should combine:

1. repository and workspace scope;
2. component, symbol, file, and entity overlap;
3. lexical and semantic relevance to the current prompt;
4. lifecycle status and recency;
5. evidence and outcome coverage.

Scope is a ranking and filtering boundary, not just display metadata. A highly similar decision from another project must not outrank an applicable decision from the current project without an explicit cross-project request.

The service should return a calibrated `no relevant decision` result below a tested relevance threshold. Returning unrelated decisions is worse than returning no decision.

## Conflict And Applicability

For every retrieved decision, presentation should distinguish:

- **Active and applicable**: scope and assumptions still match.
- **Historical only**: useful background, but superseded or outside the current scope.
- **Potential conflict**: the proposed action violates a recorded constraint or differs from an active decision.
- **Needs review**: evidence, outcome, scope, or freshness is insufficient.

Conflict detection produces a review signal, not an automatic veto. The user owns business judgment and the final project decision.

## Answer Contract

Decision-aware answers use separate sections when both source classes are present:

1. Technical evidence, with document name, page or source reference, and excerpt.
2. Relevant historical decisions, with decision ID, date, status, scope, and reasoning.
3. Applicability or conflict analysis, explicitly labelled as analysis.
4. Recommended next action: retain, revisit, or replace the decision.

The answer must say when no relevant technical evidence or historical decision was found. It must not describe a returned record as injected into the model without Host-level evidence.

## Service Contract Direction

The existing `/v1/search` response remains backward compatible. Decision-aware retrieval can initially use existing fields and filters, then add optional request and response metadata:

- request: `intents`, `repo_id`, `workspace_id`, `components`, `include_superseded`;
- response: `result_class`, `applicability`, `scope_match`, `supersession`, `conflicts`, `evidence_coverage`.

New fields are optional. Older clients must continue to parse the response.

## Acceptance Criteria

A fixed evaluation set must cover direct terms, aliases, decision questions, combined questions, topic changes, unrelated prompts, and superseded decisions. Report at least:

- technical Precision@K;
- decision Recall@K;
- current-project scope accuracy;
- source and page evidence coverage;
- superseded-decision labelling accuracy;
- conflict detection precision;
- unsupported-answer rate;
- no-result accuracy for unrelated prompts.

End-to-end checks must evaluate the user-visible answer, not only result counts or graph-link counts.

## Delivery Order

1. Populate and validate entity aliases and decision scope metadata.
2. Add deterministic technical and decision intent routing using the current prompt.
3. Add decision-specific scope, lifecycle ranking, and a calibrated no-result threshold.
4. Present evidence and historical decisions as separate source classes.
5. Add supersession and conflict relationships.
6. Gate completion on the fixed end-to-end evaluation set.