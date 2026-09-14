/**
 * Context Recall - Product Story Interactive Prototype Script
 * High-fidelity, self-contained interaction engine for evidence-grounded memory.
 * Strict ASCII source encoding.
 */

(function () {
  'use strict';

  // Verified Data Store Mock Definitions
  const STATE_PROFILES = {
    'service-online': {
      statusText: 'Service Online (10.112.229.254:8765)',
      statusClass: 'online',
      banner: null,
      inventory: {
        raw: '11,448',
        candidate: '1,030',
        active: '5,569',
        contested: '1',
        graph: '1,842'
      },
      instrumentMode: 'LAYERED PIPELINE ACTIVE',
      candidateBadge: '1,030 pending',
      storageStatus: 'SQLite (WAL/FTS5) + 256-d Vectors + Neo4j Graph (Connected)'
    },
    'local-fallback': {
      statusText: 'Local Fallback (Service Offline)',
      statusClass: 'local',
      banner: {
        type: 'local',
        message: 'Layered service is offline. Operating in Local Fallback mode using VS Code snapshot. Raw turns and candidates require service connection to review.',
        actionText: 'Retry Service Sync'
      },
      inventory: {
        raw: '11,448',
        candidate: 'N/A (Local)',
        active: '5,569',
        contested: '1',
        graph: '1,842'
      },
      instrumentMode: 'LOCAL SNAPSHOT FALLBACK',
      candidateBadge: 'Offline',
      storageStatus: 'Local Snapshot (context-recall.json) + 256-d Vectors'
    },
    'service-unavailable': {
      statusText: 'Service Unavailable (Connection Error)',
      statusClass: 'error',
      banner: {
        type: 'error',
        message: 'Unable to reach knowledge agent service at http://10.112.229.254:8765. In service-only mode, queries cannot be executed.',
        actionText: 'Switch to Auto Backend'
      },
      inventory: {
        raw: '--',
        candidate: '--',
        active: '--',
        contested: '--',
        graph: '--'
      },
      instrumentMode: 'PIPELINE DISCONNECTED',
      candidateBadge: 'Unavailable',
      storageStatus: 'Service Unreachable (Check systemd status)'
    },
    'empty-store': {
      statusText: 'Service Online (Empty Knowledge Base)',
      statusClass: 'online',
      banner: {
        type: 'info',
        message: 'No sessions or documents indexed yet. Use @recall in Copilot Chat or run "Import documents" to begin building memory.',
        actionText: 'Import Sample Spec'
      },
      inventory: {
        raw: '0',
        candidate: '0',
        active: '0',
        contested: '0',
        graph: '0'
      },
      instrumentMode: 'EMPTY PIPELINE AWAITING INGESTION',
      candidateBadge: '0 pending',
      storageStatus: 'SQLite 0 records &bull; Vectors 0 &bull; Graph 0 nodes'
    },
    'loading': {
      statusText: 'Synchronizing Knowledge Graph...',
      statusClass: 'loading',
      banner: {
        type: 'info',
        message: 'Re-indexing 256-dimensional vector space and linking entity aliases across PDF document chunks...',
        actionText: 'Cancel'
      },
      inventory: {
        raw: '11,448',
        candidate: '...',
        active: '...',
        contested: '...',
        graph: '...'
      },
      instrumentMode: 'INDEXING IN PROGRESS',
      candidateBadge: 'Syncing...',
      storageStatus: 'Computing Embeddings & Cross-Document Graph Links'
    },
    'contested-knowledge': {
      statusText: 'Service Online (Contested Decision Detected)',
      statusClass: 'online',
      banner: {
        type: 'error',
        message: 'Attention: 1 contested decision in thermal-management requires review. Legacy spec contradicts Birch Stream EDS Vol 2 Section 4.12.',
        actionText: 'Inspect Conflict'
      },
      inventory: {
        raw: '11,448',
        candidate: '1,030',
        active: '5,568',
        contested: '2',
        graph: '1,842'
      },
      instrumentMode: 'CONFLICT BOUNDED IN RESERVOIR',
      candidateBadge: '1,030 pending',
      storageStatus: 'Active Claims: 5,568 &bull; Contested: 2 &bull; Quarantined from default auto-synthesis'
    }
  };

  const SCENARIOS = {
    'TSOD temperature threshold fault handling': {
      confidence: 'HIGH &bull; 3 Evidence Sources',
      text: 'The TSOD (Thermal Sensor on DIMM) fault handling protocol requires the BMC to mask transient SMBus timeout errors during host warm-reset cycles <cite data-ref="1">[1]</cite>. Historical register dumps from the GlenRock platform confirm that unmasked alerts trigger spurious VR_HOT shutdown assertions <cite data-ref="2">[2]</cite>. The verified mitigation sets the debouncing window to 250ms and forces PECI-over-eSPI arbitration during post-code 0x7E <cite data-ref="3">[3]</cite>.',
      nextAction: 'Verify `/etc/thermal-config.json` contains `debounce_ms: 250` and confirm PECI mux driver patch `04feab0` is cherry-picked into local branch.',
      citations: [
        {
          num: '[1]',
          source: 'Intel Birch Stream EDS Vol 2 &bull; p. 142',
          kind: 'vector:256d',
          excerpt: '"Section 4.12.3: TSOD thermal polling over I3C/SMBus must be suspended when S0_RESET_N transitions low to prevent register contention."',
          metaLeft: 'SHA256: 8f9b2c41...',
          metaRight: 'Confidence: HIGH'
        },
        {
          num: '[2]',
          source: 'Session: GlenRock VR_HOT Triage &bull; Turn 14',
          kind: 'lexical:fts5',
          excerpt: '"Assistant: Confirmed via oscilloscope capture that 50ms pulse on VR_HOT was caused by TSOD read timeout during CPU warm reset."',
          metaLeft: 'Session: sess_glr_9041',
          metaRight: 'Turn ID: turn_8829'
        },
        {
          num: '[3]',
          source: 'Continuity Decision: decision-17891594',
          kind: 'graph:link',
          excerpt: '"Resolution: Configured TSOD debouncing to 250ms and routed PECI arbitration via eSPI driver during host reset."',
          metaLeft: 'Tags: bmc, peci, tsod',
          metaRight: 'Status: ACTIVE'
        }
      ]
    },
    'PECI crashdump bus arbitration warm reset': {
      confidence: 'HIGH &bull; 2 Evidence Sources',
      text: 'During CPU warm reset, PECI client interface loses arbitration if Crashdump service is actively streaming telemetry over Mailbox registers <cite data-ref="1">[1]</cite>. The safe recovery sequence requires the BMC kernel driver to assert PECI_DIS prior to S0_RESET_N assertion, resetting the controller state machine <cite data-ref="2">[2]</cite>.',
      nextAction: 'Check `peci-pcie` kernel module parameters and verify reset sequence hook in `sysfs-peci-power.c`.',
      citations: [
        {
          num: '[1]',
          source: 'Intel PECI Spec Rev 3.4 &bull; p. 88',
          kind: 'vector:256d',
          excerpt: '"Section 6.2: If S0_RESET_N asserts while RdPkgConfig is pending, client must abort transaction and clear Mailbox FIFO."',
          metaLeft: 'SHA256: e4a19b02...',
          metaRight: 'Confidence: HIGH'
        },
        {
          num: '[2]',
          source: 'Session: PECI Lockup Debug &bull; Turn 08',
          kind: 'graph:link',
          excerpt: '"Assistant: Verified patch libmctp srcrev bump 99b9d238bc resolves mailbox contention during warm reset."',
          metaLeft: 'Session: sess_peci_1102',
          metaRight: 'Turn ID: turn_7712'
        }
      ]
    },
    'IPMI PAM migration credential safety': {
      confidence: 'HIGH &bull; 2 Evidence Sources',
      text: 'Upstream OpenBMC dropped pam_tally2 in favor of pam_faillock across Yocto nanbield/scarthgap releases <cite data-ref="1">[1]</cite>. The GlenRock build requires recipe srcrev bump 565237cd04 in `pam-ipmi` to maintain failed login lockdown without failing authentication initialization <cite data-ref="2">[2]</cite>.',
      nextAction: 'Verify `pam-ipmi.bb` references commit `565237cd04` and run `bitbake pam-ipmi` test suite.',
      citations: [
        {
          num: '[1]',
          source: 'Continuity Decision: decision-17891581',
          kind: 'graph:link',
          excerpt: '"Q: pam-ipmi recipe srcrev bump outcome? A: Bumped cbf6f7ee9b..565237cd04 to support pam_faillock."',
          metaLeft: 'Commit: 6fddef2',
          metaRight: 'Status: ACTIVE'
        },
        {
          num: '[2]',
          source: 'OpenBMC Security Hardening Guidelines &bull; p. 24',
          kind: 'vector:256d',
          excerpt: '"Section 3.1: All IPMI channel authenticators must bind against pam_faillock.so with max_attempts=3."',
          metaLeft: 'SHA256: a17f8842...',
          metaRight: 'Confidence: HIGH'
        }
      ]
    }
  };

  const EVIDENCE_RECORDS = {
    'ev-1': {
      type: 'TURN RECORD',
      title: 'Turn 14: Oscilloscope VR_HOT Pulse Analysis',
      id: 'turn_8829_0x4a21',
      session: 'sess_glr_9041 (GlenRock Thermal Triage)',
      hash: 'sha256:9c8411b0e7d01859bfae83f5...',
      time: '2026-09-08 14:22:10 UTC',
      state: 'IMMUTABLE RAW RECORD (Read-Only)',
      content: 'User: "Did we figure out why the BMC triggers a false thermal trip during warm reset?"\nAssistant: "Yes. Oscilloscope channel 2 captured a 50ms low pulse on VR_HOT right as the host entered post-code 0x7E. At that instant, TSOD polling on the SMBus times out because the CPU bus controller is resetting. Because the timeout handler didn\'t debounce the signal, it treated the bus float as an emergency overheat."'
    },
    'ev-2': {
      type: 'PDF DOCUMENT CHUNK',
      title: 'Intel Birch Stream EDS Vol 2 Chunk #48',
      id: 'doc_chunk_birch_p142',
      session: 'Imported PDF Document (birch_stream_vol2.pdf)',
      hash: 'sha256:8f9b2c41098de76112a033b...',
      time: '2026-09-09 09:15:00 UTC',
      state: 'IMMUTABLE SOURCE CHUNK (Read-Only)',
      content: 'Section 4.12.3: TSOD Thermal Sensor Interface\n"TSOD thermal polling over I3C/SMBus must be suspended when S0_RESET_N transitions low to prevent register contention on the shared SMBus segment. The BMC must debounce sensor timeouts for at least 200ms following reset assertion before declaring a thermal fault condition."'
    },
    'ev-3': {
      type: 'CONTINUITY DECISION',
      title: 'Decision-17891594: TSOD Debounce Configuration',
      id: 'decision-17891594',
      session: 'Continuity Session (.continuity/decisions.jsonl)',
      hash: 'sha256:3d917f8a002bc1149e211...',
      time: '2026-09-11 11:30:00 UTC',
      state: 'ACTIVE CONTINUITY RECORD',
      content: 'Question: What was the root cause and mitigation for false thermal trips during GlenRock host resets?\nAnswer: Configured TSOD debouncing to 250ms and routed PECI arbitration via eSPI driver during host reset. Verified with 50 warm reset cycles without false trip.'
    },
    'ev-4': {
      type: 'TURN RECORD',
      title: 'Turn 03: PECI Register Post-Code 0x7E Dump',
      id: 'turn_7712_peci_03',
      session: 'sess_peci_1102 (PECI Mailbox Analysis)',
      hash: 'sha256:e4a19b02773cd981a3011...',
      time: '2026-09-10 16:45:12 UTC',
      state: 'IMMUTABLE RAW RECORD (Read-Only)',
      content: 'Assistant: "Examined /sys/bus/peci/devices/0-30/peci_status. Register 0x40 reads 0x80000002 indicating client bus timeout while Mailbox RdPkgConfig transaction was in flight."'
    }
  };

  const WALKTHROUGH_STEPS = {
    1: {
      badge: 'STAGE 1 &bull; CAPTURE',
      subtag: 'IMMUTABLE EVIDENCE LAYER',
      heading: 'Engineering Work Produces Raw Evidence',
      narrative: 'During a severe VR_HOT shutdown bug on the GlenRock platform, an engineer and Copilot debugged oscilloscope captures. Context Recall records every completed turn into immutable storage. Checksums and timestamps ensure source evidence cannot be rewritten.',
      facts: [
        '<strong>Immutable Evidence:</strong> Raw turns and PDF page extracts receive stable sha256 checksums.',
        '<strong>Zero Silent Promotion:</strong> Raw records enter as `draft/raw` and are never queried as active facts.'
      ],
      terminalTitle: 'RECORD PAYLOAD [RAW TURN]',
      terminalHash: 'SHA256: 9c8411b0e7d01859...',
      terminalBody: '<div class="payload-card"><div class="payload-header"><span>ID: turn_8829_0x4a21</span><span>Session: sess_glr_9041</span></div><div><strong>Role:</strong> assistant<br><strong>Text:</strong> "Confirmed via oscilloscope channel 2: 50ms low pulse on VR_HOT occurs because TSOD polling times out during host reset."</div></div>'
    },
    2: {
      badge: 'STAGE 2 &bull; DISTILLATION',
      subtag: 'CANDIDATE EXTRACTION LAYER',
      heading: 'Model Proposes Candidates Without Overwriting Evidence',
      narrative: 'Context Recall runs asynchronous knowledge organization. It analyzes the raw evidence and proposes candidate facts and lessons. Crucially, candidates retain foreign keys linking back to specific turn IDs and document chunk checksums.',
      facts: [
        '<strong>Provenance Links:</strong> Candidate contains `evidence_json: [turn_8829, chunk_birch_p142]`.',
        '<strong>Isolated State:</strong> Held in `memory_units` with `status: draft, memory_kind: candidate`.'
      ],
      terminalTitle: 'CANDIDATE PROPOSAL [JSON SCHEMA]',
      terminalHash: 'FINGERPRINT: d8a94bc1...',
      terminalBody: '<div class="payload-card"><div class="payload-header"><span>Kind: candidate</span><span>Type: lesson</span></div><div><strong>Summary:</strong> "TSOD SMBus read timeout during warm reset triggers false VR_HOT"<br><strong>Resolution:</strong> "Debounce TSOD timeout by 250ms and arbitrate via eSPI."<br><strong>Evidence Refs:</strong> ["turn_8829_0x4a21", "doc_chunk_birch_p142"]</div></div>'
    },
    3: {
      badge: 'STAGE 3 &bull; REVIEW GATE',
      subtag: 'LIFECYCLE VERIFICATION GATE',
      heading: 'Human Review & Conflict Verification',
      narrative: 'Before a candidate can influence default engineering queries, it passes through the verification gate. Contradictions with existing active decisions are flagged, and deterministic entity linking connects terms across specifications.',
      facts: [
        '<strong>Conflict Isolation:</strong> Conflicting proposals are marked `contested` rather than overwriting existing active memory.',
        '<strong>Idempotent Migration:</strong> Staged imports can be re-run safely without duplication.'
      ],
      terminalTitle: 'AUDIT GATE CHECKLIST',
      terminalHash: 'STATUS: REVIEW_READY',
      terminalBody: '<div class="payload-card"><div class="payload-header"><span>Gate: candidate -> active</span><span>Rule: Deterministic Linking</span></div><div style="color:#10b981;">&check; Evidence references verified in immutable log</div><div style="color:#10b981;">&check; 256-d vector embedding generated</div><div style="color:#f59e0b;">! Global promotion approved by lead engineer</div></div>'
    },
    4: {
      badge: 'STAGE 4 &bull; ACTIVE GRAPH',
      subtag: 'MULTI-LAYER KNOWLEDGE RESERVOIR',
      heading: 'Active Knowledge Indexed with Graph & Vectors',
      narrative: 'Once promoted to `active/memory`, the unit is indexed into the 256-dimensional vector database for semantic recall, SQLite FTS5 for exact keyword queries, and Neo4j for entity relationships.',
      facts: [
        '<strong>Multi-Layer Storage:</strong> Fast SQLite local storage with optional additive Neo4j graph.',
        '<strong>Clean Boundaries:</strong> Low-level database engines are abstracted away from customer workflow.'
      ],
      terminalTitle: 'ACTIVE KNOWLEDGE NODE',
      terminalHash: 'NODE_ID: memory:d8a94bc1...',
      terminalBody: '<div class="payload-card highlight-active"><div class="payload-header"><span>Status: ACTIVE</span><span>Kind: MEMORY</span></div><div><strong>Entity:</strong> TSOD_Thermal_Sensor<br><strong>Links:</strong> REL_TRIGGERED_BY &rarr; CPU_Warm_Reset<br><strong>Vectors:</strong> 256-dim float array indexed in vectors.sqlite3</div></div>'
    },
    5: {
      badge: 'STAGE 5 &bull; GROUNDED RECALL',
      subtag: 'AUDITABLE ACTION TO FUTURE ENGINEER',
      heading: 'Future Engineer Retrieves Grounded Rationale',
      narrative: 'Three months later, another engineer investigating thermal trips runs a query. Context Recall returns a synthesized answer with bracketed citations [1][2], confidence level, exact document references, and concrete next actions.',
      facts: [
        '<strong>Strict Grounding:</strong> No external model hallucinations; answers strictly cite retrieved evidence.',
        '<strong>Customer Outcome:</strong> Eliminates repeated root-cause investigations and shortens onboarding.'
      ],
      terminalTitle: 'SYNTHESIZED GROUNDED ANSWER',
      terminalHash: 'QUERY: TSOD temperature threshold',
      terminalBody: '<div class="payload-card"><div class="payload-header"><span>Confidence: HIGH</span><span>3 Citations</span></div><div>"TSOD fault handling requires BMC to mask SMBus timeouts during warm reset <span class="citation-mark">[1]</span> to avoid false VR_HOT shutdowns <span class="citation-mark">[2]</span>. Mitigation sets 250ms debouncing <span class="citation-mark">[3]</span>."</div></div>'
    }
  };

  // State application
  function applyPrototypeState(stateKey) {
    const profile = STATE_PROFILES[stateKey] || STATE_PROFILES['service-online'];

    // Update Header Trust Badge
    const trustDot = document.getElementById('trust-status-dot');
    const trustText = document.getElementById('trust-status-text');
    if (trustDot && trustText) {
      trustDot.className = 'status-dot ' + profile.statusClass;
      trustText.textContent = profile.statusText;
    }

    // Update Banner
    const bannerContainer = document.getElementById('system-banner-container');
    if (bannerContainer) {
      if (profile.banner) {
        bannerContainer.innerHTML = `
          <div class="system-banner ${profile.banner.type}" role="alert">
            <span>${profile.banner.message}</span>
            <button type="button" class="banner-action-btn" onclick="window.ContextRecallStory.handleBannerAction()">${profile.banner.actionText}</button>
          </div>
        `;
      } else {
        bannerContainer.innerHTML = '';
      }
    }

    // Update Inventory Strip
    const valRaw = document.getElementById('val-raw');
    const valCandidate = document.getElementById('val-candidate');
    const valActive = document.getElementById('val-active');
    const valContested = document.getElementById('val-contested');
    const valGraph = document.getElementById('val-graph');

    if (valRaw) valRaw.textContent = profile.inventory.raw;
    if (valCandidate) valCandidate.textContent = profile.inventory.candidate;
    if (valActive) valActive.textContent = profile.inventory.active;
    if (valContested) valContested.textContent = profile.inventory.contested;
    if (valGraph) valGraph.textContent = profile.inventory.graph;

    // Update Badges & Labels
    const liveMode = document.getElementById('instrument-live-mode');
    if (liveMode) liveMode.textContent = profile.instrumentMode;

    const candidateBadge = document.getElementById('badge-candidate-count');
    if (candidateBadge) candidateBadge.textContent = profile.candidateBadge;

    const storagePill = document.getElementById('storage-status-pill');
    if (storagePill) storagePill.textContent = profile.storageStatus;
  }

  // Task tabs switcher
  function switchTaskPanel(panelId) {
    const taskBtns = document.querySelectorAll('.customer-task-btn');
    const panels = document.querySelectorAll('.task-panel-content');

    taskBtns.forEach((btn) => {
      const controls = btn.getAttribute('aria-controls');
      const isTarget = controls === panelId;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    panels.forEach((panel) => {
      const isTarget = panel.id === panelId;
      panel.classList.toggle('is-active', isTarget);
    });
  }

  // Scenario search execution
  function executeSearch(customQuery) {
    const input = document.getElementById('history-search-input');
    const query = (customQuery || (input ? input.value : '')).trim();
    if (!query) return;

    // Match scenario
    const scenario = SCENARIOS[query] || SCENARIOS['TSOD temperature threshold fault handling'];

    const confidenceTag = document.getElementById('synthesis-confidence-tag');
    const synthesisBody = document.getElementById('synthesis-body');
    const nextActionBox = document.getElementById('synthesis-next-action');
    const citationsContainer = document.getElementById('citation-cards-container');

    if (confidenceTag) confidenceTag.innerHTML = `Confidence: ${scenario.confidence}`;
    if (synthesisBody) synthesisBody.innerHTML = scenario.text;
    if (nextActionBox) {
      nextActionBox.innerHTML = `
        <div class="action-box-title">RECOMMENDED NEXT ACTION</div>
        <div class="action-box-desc">${scenario.nextAction}</div>
      `;
    }

    if (citationsContainer) {
      citationsContainer.innerHTML = scenario.citations.map((c) => `
        <div class="citation-record-item">
          <div class="citation-head">
            <span class="citation-number">${c.num}</span>
            <span class="citation-source-name">${c.source}</span>
            <span class="citation-match-kind">${c.kind}</span>
          </div>
          <div class="citation-excerpt">${c.excerpt}</div>
          <div class="citation-foot">
            <span>${c.metaLeft}</span>
            <span>${c.metaRight}</span>
          </div>
        </div>
      `).join('');
    }

    // Attach click handlers on citations
    const citeTags = synthesisBody ? synthesisBody.querySelectorAll('cite') : [];
    citeTags.forEach((cite) => {
      cite.addEventListener('click', function () {
        const refNum = this.getAttribute('data-ref');
        const targetCard = citationsContainer.querySelector(`[data-ref="${refNum}"]`);
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          targetCard.style.borderColor = 'var(--cr-accent)';
          setTimeout(() => { targetCard.style.borderColor = 'var(--cr-border)'; }, 1500);
        }
      });
    });
  }

  // Evidence inspector item selection
  function selectEvidenceItem(itemId) {
    const record = EVIDENCE_RECORDS[itemId];
    if (!record) return;

    const items = document.querySelectorAll('.evidence-tree-item');
    items.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-id') === itemId);
    });

    const typeBadge = document.getElementById('view-item-type');
    const titleEl = document.getElementById('view-item-title');
    const idBox = document.getElementById('view-item-id');
    const metaSession = document.getElementById('view-meta-session');
    const metaHash = document.getElementById('view-meta-hash');
    const metaTime = document.getElementById('view-meta-time');
    const metaState = document.getElementById('view-meta-state');
    const rawContent = document.getElementById('view-raw-content');

    if (typeBadge) typeBadge.textContent = record.type;
    if (titleEl) titleEl.textContent = record.title;
    if (idBox) idBox.textContent = `ID: ${record.id}`;
    if (metaSession) metaSession.textContent = record.session;
    if (metaHash) metaHash.textContent = record.hash;
    if (metaTime) metaTime.textContent = record.time;
    if (metaState) metaState.textContent = record.state;
    if (rawContent) rawContent.textContent = record.content;
  }

  // Walkthrough step navigation
  function goToWalkthroughStep(stepNum) {
    const step = WALKTHROUGH_STEPS[stepNum];
    if (!step) return;

    const stepBtns = document.querySelectorAll('.step-nav-btn');
    stepBtns.forEach((btn) => {
      const isTarget = parseInt(btn.getAttribute('data-step'), 10) === stepNum;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    const badge = document.getElementById('journey-badge');
    const subtag = document.getElementById('journey-subtag');
    const heading = document.getElementById('journey-heading');
    const narrative = document.getElementById('journey-narrative');
    const factsContainer = document.getElementById('journey-facts');
    const termTitle = document.getElementById('terminal-pane-title');
    const termHash = document.getElementById('terminal-hash-display');
    const termBody = document.getElementById('journey-terminal-body');

    if (badge) {
      badge.className = `stage-phase-tag step-${stepNum}`;
      badge.innerHTML = step.badge;
    }
    if (subtag) subtag.textContent = step.subtag;
    if (heading) heading.textContent = step.heading;
    if (narrative) narrative.textContent = step.narrative;
    if (factsContainer) {
      factsContainer.innerHTML = step.facts.map((f) => `
        <div class="fact-item">
          <span class="fact-bullet">&bull;</span>
          <span>${f}</span>
        </div>
      `).join('');
    }
    if (termTitle) termTitle.textContent = step.terminalTitle;
    if (termHash) termHash.textContent = step.terminalHash;
    if (termBody) termBody.innerHTML = step.terminalBody;
  }

  // Candidate review simulation
  function handleCandidateAction(action, title) {
    alert(`Candidate "${title}" marked as ${action === 'promote' ? 'PROMOTED to Active Memory' : 'REJECTED (Archived)'}. State updated idempotently.`);
  }

  function handleBannerAction() {
    alert('Action triggered. Refreshing backend connectivity check...');
    applyPrototypeState('service-online');
    const sel = document.getElementById('state-simulator-select');
    if (sel) sel.value = 'service-online';
  }

  // Initialize listeners on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    // State simulator switcher
    const stateSelect = document.getElementById('state-simulator-select');
    if (stateSelect) {
      stateSelect.addEventListener('change', (e) => {
        applyPrototypeState(e.target.value);
      });
    }

    // Task Tab Buttons
    const taskBtns = document.querySelectorAll('.customer-task-btn');
    taskBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const panelId = btn.getAttribute('aria-controls');
        switchTaskPanel(panelId);
      });
    });

    // Preset query pills
    const presetPills = document.querySelectorAll('.preset-pill');
    presetPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        presetPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        const query = pill.getAttribute('data-query');
        const input = document.getElementById('history-search-input');
        if (input) input.value = query;
        executeSearch(query);
      });
    });

    // Evidence Tree Items
    const treeItems = document.querySelectorAll('.evidence-tree-item');
    treeItems.forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        selectEvidenceItem(id);
      });
    });

    // Walkthrough Step Buttons
    const stepBtns = document.querySelectorAll('.step-nav-btn');
    stepBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const stepNum = parseInt(btn.getAttribute('data-step'), 10);
        goToWalkthroughStep(stepNum);
      });
    });

    // Storage Accordion Trigger
    const accordionBtn = document.getElementById('storage-accordion-btn');
    const accordionBody = document.getElementById('storage-accordion-body');
    if (accordionBtn && accordionBody) {
      accordionBtn.addEventListener('click', () => {
        const isExpanded = accordionBtn.getAttribute('aria-expanded') === 'true';
        accordionBtn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
        accordionBody.hidden = isExpanded;
      });
    }

    // Initial state
    applyPrototypeState('service-online');
    executeSearch('TSOD temperature threshold fault handling');
  });

  // Expose global interface for inline buttons
  window.ContextRecallStory = {
    executeSearch,
    handleCandidateAction,
    handleBannerAction,
    switchTaskPanel,
    selectEvidenceItem,
    goToWalkthroughStep,
    applyPrototypeState
  };

})();
