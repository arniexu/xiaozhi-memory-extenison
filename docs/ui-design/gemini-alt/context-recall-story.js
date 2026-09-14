/**
 * Context Recall - Engineering Continuity Workbench (gemini-alt)
 * Interactive Prototype Logic
 * 
 * Strict ASCII only. No external dependencies.
 */

(function () {
  'use strict';

  // Representative verified data profiles across states
  const STATE_PROFILES = {
    'service-online': {
      trustStatus: 'online',
      trustLabel: 'Service Online (auto @ 127.0.0.1:8765)',
      rawCount: 11448,
      candidateCount: 1030,
      activeCount: 5569,
      contestedCount: 1,
      edgeCount: 1842,
      continuityCount: 64,
      banner: null,
      topStageTitle: '1. Raw Evidence Intake',
      topStageTag: 'draft/raw',
      topStageDesc: 'Read-only turns, PDF specs, logs hashed with SHA-256.',
      bottomStageTitle: '3. Active Knowledge',
      bottomStageTag: 'active/memory',
      bottomStageDesc: 'Verified, vectorized (256-d), entity-linked knowledge.'
    },
    'local-fallback': {
      trustStatus: 'fallback',
      trustLabel: 'Local Fallback (local SQLite snapshot)',
      rawCount: 0,
      candidateCount: 0,
      activeCount: 5569,
      contestedCount: 1,
      edgeCount: 420,
      continuityCount: 64,
      banner: {
        type: 'warning',
        text: 'Companion service unreachable at 127.0.0.1:8765. Operating in local fallback mode using read-only SQLite snapshot. Vector search and service sync paused.'
      },
      topStageTitle: '1. Local Memory Snapshot',
      topStageTag: 'local/sqlite',
      topStageDesc: 'Local cached nodes and session records.',
      bottomStageTitle: '3. Active Local Nodes',
      bottomStageTag: 'active',
      bottomStageDesc: 'Local keyword search and continuity records active.'
    },
    'service-unavailable': {
      trustStatus: 'unavailable',
      trustLabel: 'Service Unavailable (mode=service)',
      rawCount: 0,
      candidateCount: 0,
      activeCount: 0,
      contestedCount: 0,
      edgeCount: 0,
      continuityCount: 0,
      banner: {
        type: 'error',
        text: 'Strict service mode configured, but knowledge-agent-service connection failed. Knowledge queries are blocked to prevent ungrounded responses.'
      },
      topStageTitle: '1. Intake Blocked',
      topStageTag: 'offline',
      topStageDesc: 'Service offline.',
      bottomStageTitle: '3. Reservoir Offline',
      bottomStageTag: 'offline',
      bottomStageDesc: 'Cannot serve queries in strict service mode.'
    },
    'loading': {
      trustStatus: 'loading',
      trustLabel: 'Syncing & Indexing...',
      rawCount: '--',
      candidateCount: '--',
      activeCount: '--',
      contestedCount: '--',
      edgeCount: '--',
      continuityCount: '--',
      banner: {
        type: 'info',
        text: 'Synchronizing SQLite WAL journals, indexing 256-d vector embeddings, and re-checking entity links...'
      },
      topStageTitle: '1. Syncing Intake',
      topStageTag: 'indexing',
      topStageDesc: 'Reading journals...',
      bottomStageTitle: '3. Updating Index',
      bottomStageTag: 'indexing',
      bottomStageDesc: 'Building graph...'
    },
    'empty': {
      trustStatus: 'online',
      trustLabel: 'Service Online (Fresh Store)',
      rawCount: 0,
      candidateCount: 0,
      activeCount: 0,
      contestedCount: 0,
      edgeCount: 0,
      continuityCount: 0,
      banner: {
        type: 'info',
        text: 'No evidence captured yet in this workspace. Run a debugging turn or import hardware PDFs to begin grounded recall.'
      },
      topStageTitle: '1. Raw Evidence Intake',
      topStageTag: 'empty',
      topStageDesc: 'Awaiting first debugging session or spec import.',
      bottomStageTitle: '3. Active Knowledge',
      bottomStageTag: 'empty',
      bottomStageDesc: 'Zero active units.'
    },
    'contested': {
      trustStatus: 'online',
      trustLabel: 'Service Online (1 Contested Item Flagged)',
      rawCount: 11448,
      candidateCount: 1030,
      activeCount: 5569,
      contestedCount: 12,
      edgeCount: 1842,
      continuityCount: 64,
      banner: {
        type: 'warning',
        text: '12 conflicting technical assertions detected across specification revisions. Conflicting facts quarantined from active retrieval.'
      },
      topStageTitle: '1. Raw Evidence Intake',
      topStageTag: 'draft/raw',
      topStageDesc: 'Incoming hardware spec revisions detected.',
      bottomStageTitle: '3. Active Knowledge',
      bottomStageTag: 'active/memory',
      bottomStageDesc: 'Active memory preserved while conflicting items are quarantined.'
    }
  };

  // Step-by-step incident journey data (OpenBMC TSOD thermal triage)
  const JOURNEY_STEPS = [
    {
      step: 1,
      title: 'Step 1: Immutable Evidence Intake',
      subtitle: 'Capturing Raw Engineering Artifacts',
      content: `
        <div class="evidence-card highlight">
          <div class="evidence-meta">
            <span>SOURCE: debug_turn_8829 / openbmc-openbmc</span>
            <span>SHA256: 7f8a91b...c2</span>
          </div>
          <div class="evidence-body">
            <strong>Incident Context:</strong> TSOD thermal sensor on GlenRock platform reporting erroneous 0x7F trip on warm reboot.
            <div class="code-snippet">i2cget -y 4 0x48 0x05 w  # Returns 0x7F00 (trip point overflow)
dmesg | grep -i "tsod trip"  # Kernel thermal shutdown invoked</div>
          </div>
        </div>
        <p style="font-size:11px; color:var(--text-secondary); margin-top:6px;">
          Captured into <code>draft/raw</code> table. Immutable and read-only. Never overwritten.
        </p>
      `
    },
    {
      step: 2,
      title: 'Step 2: Candidate Knowledge Distillation',
      subtitle: 'Asynchronous Schema Extraction with Foreign Evidence IDs',
      content: `
        <div class="evidence-card">
          <div class="evidence-meta">
            <span>STAGE: draft/candidate</span>
            <span>EVIDENCE REF: turn_8829, intel_glr_spec_v2_p44</span>
          </div>
          <div class="evidence-body">
            <strong>Proposed Fact:</strong> GlenRock TSOD register 0x05 uses 11-bit twos-complement formatting; reading word-swapped endianness yields false 127 degC trips.
            <div class="code-snippet">{
  "entity": "TSOD_Register_0x05",
  "resolution": "Swap byte-order in hwmon driver before threshold comparison",
  "evidence_turns": ["turn_8829"],
  "spec_chunks": ["intel_glr_p44"]
}</div>
          </div>
        </div>
      `
    },
    {
      step: 3,
      title: 'Step 3: Lifecycle Review & Conflict Check',
      subtitle: 'Human/Automated Gate Prevents Silent Promotion',
      content: `
        <div class="evidence-card" style="border-left:3px solid var(--accent-amber);">
          <div class="evidence-meta">
            <span>VALIDATION: Passed Schema & Integrity Check</span>
            <span>STATUS: Promoted to Active Memory</span>
          </div>
          <div class="evidence-body">
            Candidate reviewed against platform spec. No contradiction with existing <code>decision-17891594</code>.
            Confidence rated <strong>HIGH</strong> based on dual corroboration (lab oscilloscope + platform spec v2).
          </div>
        </div>
      `
    },
    {
      step: 4,
      title: 'Step 4: Multi-Layer Active Reservoir',
      subtitle: 'SQLite Storage, 256-d Vector Index, and Entity Graph Linking',
      content: `
        <div class="evidence-card">
          <div class="evidence-meta">
            <span>INDEX: SQLite FTS5 + 256-d Vector + Neo4j Edge</span>
            <span>KEY: kn_tsod_endian_swap</span>
          </div>
          <div class="evidence-body">
            Record committed to <code>active/memory</code>. Cross-document edge established:
            <br>
            <code>[TSOD_Register_0x05] --(governs_driver)--> [meta-intel/sensors/tsod.c]</code>
          </div>
        </div>
      `
    },
    {
      step: 5,
      title: 'Step 5: Grounded Retrieval & Concrete Continuation',
      subtitle: 'Future Engineer Receives Cited Evidence and Actionable Next Steps',
      content: `
        <div class="answer-box">
          <div class="answer-header">
            <strong>Query: "Why does BMC trip thermal shutdown on GlenRock warm reboot?"</strong>
            <span class="confidence-badge confidence-high">HIGH CONFIDENCE</span>
          </div>
          <p style="font-size:12px; color:var(--text-primary);">
            The TSOD sensor register 0x05 returns 11-bit twos-complement data in big-endian format.
            During warm reboot, the uninitialized hwmon driver reads the register in little-endian order,
            interpreting the 25 degC ambient as 0x7F00 (127 degC), which immediately triggers the kernel thermal trip point <span class="citation-pill">[1]</span><span class="citation-pill">[2]</span>.
          </p>
          <div class="citations-list">
            <div class="citation-item">
              <span class="citation-pill">[1]</span>
              <span>debug_turn_8829: Oscilloscope I2C trace and dmesg log (SHA: 7f8a91b)</span>
            </div>
            <div class="citation-item">
              <span class="citation-pill">[2]</span>
              <span>Intel GlenRock Platform Spec Rev 2.1, Section 8.4 (Page 44, chunk_142)</span>
            </div>
          </div>
        </div>
      `
    }
  ];

  // Canned Search Responses
  const QUERY_RESPONSES = {
    'tsod': {
      query: 'Why does BMC trip thermal shutdown on GlenRock warm reboot?',
      confidence: 'high',
      confidenceClass: 'confidence-high',
      text: 'The TSOD sensor register 0x05 returns 11-bit twos-complement data in big-endian format. During warm reboot, the uninitialized hwmon driver reads the register in little-endian order, interpreting 25 degC ambient as 0x7F00 (127 degC), triggering an instant kernel thermal trip [1][2].',
      citations: [
        { id: '[1]', ref: 'debug_turn_8829: Oscilloscope I2C trace & dmesg log (SHA256: 7f8a91b)' },
        { id: '[2]', ref: 'Intel GlenRock Platform Spec Rev 2.1, Section 8.4 (Page 44, chunk_142)' }
      ],
      nextAction: 'Apply endianness swap patch in meta-intel/recipes-bsp/drivers/tsod-hwmon.bb and verify with vexp test.'
    },
    'pam': {
      query: 'What are the pam-ipmi lock timeout constraints?',
      confidence: 'high',
      confidenceClass: 'confidence-high',
      text: 'Per decision-17891594 and commit 6fddef2, pam-ipmi locks timeout after 15 seconds to prevent host bus deadlocks during BMC reboots [1].',
      citations: [
        { id: '[1]', ref: 'Decision record decision-17891594: pam-ipmi timeout arbitration' },
        { id: '[2]', ref: 'openbmc/pam-ipmi commit 6fddef2 (pam-ipmi: srcrev bump)' }
      ],
      nextAction: 'Verify watchdog arbitration timer in /etc/pam.d/ipmi configuration.'
    },
    'crashdump': {
      query: 'How is crashdump payload synchronized across dual flash?',
      confidence: 'medium',
      confidenceClass: 'confidence-medium',
      text: 'Crashdump uses hiomapd partition mapping to stage payload in secondary SPI flash before committing signature to active partition [1]. Note: A pending pull request proposes reducing chunk size to 64KB.',
      citations: [
        { id: '[1]', ref: 'openbmc/hiomapd commit f091080 & Intel BMC Architecture Guide (Page 112)' }
      ],
      nextAction: 'Review hiomapd window boundaries before deploying dual-flash image.'
    }
  };

  // State initialization
  let currentState = 'service-online';
  let currentStepIndex = 0;

  function init() {
    bindEvents();
    renderState(currentState);
    renderJourneyStep(currentStepIndex);
  }

  function bindEvents() {
    // Prototype state switcher
    const stateSelect = document.getElementById('protoStateSelect');
    if (stateSelect) {
      stateSelect.addEventListener('change', function (e) {
        setState(e.target.value);
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        const original = currentState;
        setState('loading');
        setTimeout(function () {
          setState(original);
        }, 600);
      });
    }

    // Tab buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const targetTab = btn.getAttribute('data-tab');
        activateTab(targetTab);
      });
    });

    // Journey step dots
    const stepDots = document.querySelectorAll('.step-dot');
    stepDots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        const step = parseInt(dot.getAttribute('data-step'), 10) - 1;
        renderJourneyStep(step);
      });
    });

    // Prev / Next Journey buttons
    const prevBtn = document.getElementById('prevStepBtn');
    const nextBtn = document.getElementById('nextStepBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (currentStepIndex > 0) {
          renderJourneyStep(currentStepIndex - 1);
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (currentStepIndex < JOURNEY_STEPS.length - 1) {
          renderJourneyStep(currentStepIndex + 1);
        }
      });
    }

    // Canned query selector
    const querySelect = document.getElementById('cannedQuerySelect');
    if (querySelect) {
      querySelect.addEventListener('change', function (e) {
        renderCannedQuery(e.target.value);
      });
    }

    // Interactive hourglass funnel clicks
    const funnelStages = document.querySelectorAll('.funnel-stage');
    funnelStages.forEach(function (stage) {
      stage.addEventListener('click', function () {
        const stageName = stage.getAttribute('data-stage');
        if (stageName === 'raw') {
          activateTab('tab-journey');
          renderJourneyStep(0);
        } else if (stageName === 'neck') {
          activateTab('tab-review');
        } else if (stageName === 'bottom') {
          activateTab('tab-ask');
        }
      });
    });

    // Keyboard navigation for tabs
    const tabList = document.querySelector('.task-tabs');
    if (tabList) {
      tabList.addEventListener('keydown', function (e) {
        const tabs = Array.from(document.querySelectorAll('.tab-btn'));
        const currentIndex = tabs.findIndex(function (t) { return t.classList.contains('active'); });
        if (e.key === 'ArrowRight') {
          const nextIndex = (currentIndex + 1) % tabs.length;
          tabs[nextIndex].click();
          tabs[nextIndex].focus();
        } else if (e.key === 'ArrowLeft') {
          const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          tabs[prevIndex].click();
          tabs[prevIndex].focus();
        }
      });
    }
  }

  function setState(stateKey) {
    currentState = stateKey;
    const stateSelect = document.getElementById('protoStateSelect');
    if (stateSelect) {
      stateSelect.value = stateKey;
    }
    renderState(stateKey);
  }

  function renderState(stateKey) {
    const profile = STATE_PROFILES[stateKey] || STATE_PROFILES['service-online'];

    // Trust badge
    const trustBadge = document.getElementById('trustBadge');
    if (trustBadge) {
      trustBadge.setAttribute('data-status', profile.trustStatus);
      const labelEl = trustBadge.querySelector('.trust-label');
      if (labelEl) {
        labelEl.textContent = profile.trustLabel;
      }
    }

    // Banner
    const banner = document.getElementById('stateBanner');
    if (banner) {
      if (profile.banner) {
        banner.className = 'state-banner visible ' + profile.banner.type;
        const textEl = banner.querySelector('.banner-text');
        if (textEl) {
          textEl.textContent = profile.banner.text;
        }
      } else {
        banner.className = 'state-banner';
      }
    }

    // Counts
    setCount('rawCount', profile.rawCount);
    setCount('candidateCount', profile.candidateCount);
    setCount('activeCount', profile.activeCount);
    setCount('contestedCount', profile.contestedCount);
    setCount('edgeCount', profile.edgeCount);
    setCount('continuityCount', profile.continuityCount);
    setCount('stageRawCount', profile.rawCount);
    setCount('stageCandidateCount', profile.candidateCount);
    setCount('stageActiveCount', profile.activeCount);

    // Dynamic stage titles (e.g. for local fallback relabeling)
    const topStageTitleEl = document.getElementById('topStageTitle');
    if (topStageTitleEl) topStageTitleEl.textContent = profile.topStageTitle;
    const topStageTagEl = document.getElementById('topStageTag');
    if (topStageTagEl) topStageTagEl.textContent = profile.topStageTag;
    const topStageDescEl = document.getElementById('topStageDesc');
    if (topStageDescEl) topStageDescEl.textContent = profile.topStageDesc;

    const bottomStageTitleEl = document.getElementById('bottomStageTitle');
    if (bottomStageTitleEl) bottomStageTitleEl.textContent = profile.bottomStageTitle;
    const bottomStageTagEl = document.getElementById('bottomStageTag');
    if (bottomStageTagEl) bottomStageTagEl.textContent = profile.bottomStageTag;
    const bottomStageDescEl = document.getElementById('bottomStageDesc');
    if (bottomStageDescEl) bottomStageDescEl.textContent = profile.bottomStageDesc;

    // Update refresh timestamp
    const timeEl = document.getElementById('refreshTimestamp');
    if (timeEl) {
      const now = new Date();
      timeEl.textContent = 'Updated ' + now.toLocaleTimeString();
    }
  }

  function setCount(id, val) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = typeof val === 'number' ? val.toLocaleString() : val;
    }
  }

  function activateTab(tabId) {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(function (btn) {
      const isActive = btn.getAttribute('data-tab') === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    tabPanels.forEach(function (panel) {
      const isActive = panel.id === tabId;
      panel.classList.toggle('active', isActive);
      if (isActive) {
        panel.setAttribute('tabindex', '0');
      } else {
        panel.removeAttribute('tabindex');
      }
    });
  }

  function renderJourneyStep(index) {
    currentStepIndex = index;
    const stepData = JOURNEY_STEPS[index];
    if (!stepData) return;

    // Update dots
    const dots = document.querySelectorAll('.step-dot');
    dots.forEach(function (dot, i) {
      dot.classList.toggle('active', i === index);
      dot.classList.toggle('passed', i < index);
    });

    // Update buttons
    const prevBtn = document.getElementById('prevStepBtn');
    const nextBtn = document.getElementById('nextStepBtn');
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.disabled = index === JOURNEY_STEPS.length - 1;

    // Update content
    const titleEl = document.getElementById('journeyStepTitle');
    const subtitleEl = document.getElementById('journeyStepSubtitle');
    const contentEl = document.getElementById('journeyStepContent');

    if (titleEl) titleEl.textContent = stepData.title;
    if (subtitleEl) subtitleEl.textContent = stepData.subtitle;
    if (contentEl) contentEl.innerHTML = stepData.content;

    // Highlight corresponding hourglass stage
    const rawStage = document.getElementById('funnelRawStage');
    const neckStage = document.getElementById('funnelNeckStage');
    const bottomStage = document.getElementById('funnelBottomStage');

    if (rawStage) rawStage.classList.toggle('active', index === 0);
    if (neckStage) neckStage.classList.toggle('active', index === 1 || index === 2);
    if (bottomStage) bottomStage.classList.toggle('active', index === 3 || index === 4);
  }

  function renderCannedQuery(key) {
    const data = QUERY_RESPONSES[key] || QUERY_RESPONSES['tsod'];
    const answerContainer = document.getElementById('retrievalAnswerBox');
    if (!answerContainer) return;

    let citationsHtml = '';
    data.citations.forEach(function (c) {
      citationsHtml += '<div class="citation-item"><span class="citation-pill">' + c.id + '</span><span>' + c.ref + '</span></div>';
    });

    answerContainer.innerHTML = `
      <div class="answer-header">
        <strong>Query: "${data.query}"</strong>
        <span class="confidence-badge ${data.confidenceClass}">${data.confidence.toUpperCase()} CONFIDENCE</span>
      </div>
      <p style="font-size:12px; color:var(--text-primary); margin-top:6px;">
        ${data.text}
      </p>
      <div class="citations-list" style="margin-top:8px;">
        ${citationsHtml}
      </div>
      <div style="margin-top:10px; padding-top:8px; border-top:1px dashed var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:11px; color:var(--accent-cyan); font-family:var(--font-mono);">NEXT ACTION: ${data.nextAction}</span>
        <button class="btn btn-primary" onclick="alert('Action applied to workbench checklist [Proposed].')">Apply to Task</button>
      </div>
    `;
  }

  // Self-execute on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
