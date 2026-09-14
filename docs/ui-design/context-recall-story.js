/* Context Recall - Product Story prototype.
   Minimal interactions: switch representative lifecycle states and
   trace one evidence-backed recall journey. No framework, no network. */
(function () {
	'use strict';

	/* ------------------------------------------------------------------
	 * State model. Each state maps to real fields:
	 *
	 * captured       -> ServiceHealth.memory.total
	 * raw            -> ServiceHealth.memory.raw
	 * candidate      -> ServiceHealth.memory.candidate
	 * active         -> ServiceHealth.memory.active
	 * continuity     -> ServiceHealth.memory.continuity
	 * relationships  -> ServiceHealth.neo4j.relationships (falls back to
	 *                   DashboardStats.edges in the local snapshot)
	 * evidenceBacked -> DashboardStats.evidenceBackedKnowledge
	 * contested      -> DashboardStats.contestedKnowledge
	 * ------------------------------------------------------------------ */
	var STATES = {
		loading: {
			backend: 'loading',
			trust: { label: 'Checking backend', sub: 'contacting layered service', tone: 'loading' },
			counts: {},
			banner: null
		},
		online: {
			backend: 'service',
			trust: { label: 'Service online', sub: 'auto mode - 127.0.0.1:8765', tone: 'online' },
			counts: { captured: 18048, raw: 11448, candidate: 1030, active: 24, continuity: 5546, evidenceBacked: 24, contested: 3, relationships: 126 },
			banner: null
		},
		local: {
			backend: 'local',
			trust: { label: 'Local fallback', sub: 'auto mode - service unreachable', tone: 'local' },
			counts: { captured: 38, raw: 412, candidate: 57, active: 24, continuity: null, evidenceBacked: 24, contested: 3, relationships: 57 },
			banner: {
				tone: 'info',
				text: 'Layered service unreachable. Using the portable local snapshot. Staged raw/candidate review is a layered-service feature and is unavailable until the service returns.'
			}
		},
		unavailable: {
			backend: 'unavailable',
			trust: { label: 'Service unavailable', sub: 'service mode - retrieval blocked', tone: 'unavailable' },
			counts: { captured: null, raw: null, candidate: null, active: null, continuity: null, evidenceBacked: 24, contested: 3, relationships: 57 },
			banner: {
				tone: 'error',
				text: 'Context Recall is in service mode and cannot reach the layered service. Switch to auto mode or start the service to resume retrieval. The local snapshot remains intact.'
			}
		},
		empty: {
			backend: 'empty',
			trust: { label: 'No data yet', sub: 'ready for first capture', tone: 'empty' },
			counts: { captured: 0, raw: 0, candidate: 0, active: 0, continuity: 0, evidenceBacked: 0, contested: 0, relationships: 0 },
			banner: { tone: 'info', text: 'Nothing captured yet. Start a chat with @recall to create the first evidence.' }
		},
		contested: {
			backend: 'service',
			trust: { label: 'Service online', sub: 'auto mode - 127.0.0.1:8765', tone: 'online' },
			counts: { captured: 18048, raw: 11448, candidate: 1030, active: 24, continuity: 5546, evidenceBacked: 24, contested: 3, relationships: 126 },
			banner: { tone: 'warn', text: '3 knowledge items are contested and need review before they can be trusted for reuse.' }
		}
	};

	/* Canned recall question and answer sets. Representative demo content. */
	var ANSWERS = {
		adapter: {
			text: 'The compatibility-first approach was chosen so the three consumer teams could migrate independently instead of being blocked by one breaking rewrite. The accepted trade-off was an interim adapter. [1][2]',
			sources: [
				{ num: 1, title: 'Session: compatibility migration review', label: '2 stored turns' },
				{ num: 2, title: 'Decision: Compatibility-first migration', label: 'active - high confidence' }
			],
			next: 'Continue work: resume the migration from the adapter boundary, or inspect the two source turns before changing course.'
		},
		rollout: {
			text: 'The rollout was sequenced so each consumer team could adopt the adapter on its own schedule; no single flag-day rewrite was planned. [1]',
			sources: [
				{ num: 1, title: 'Session: compatibility migration review', label: '2 stored turns' }
			],
			next: 'Continue work: check the current rollout checklist against the recorded sequencing before the next team starts.'
		},
		risk: {
			text: 'The accepted risk was carrying an interim adapter with duplicated mapping logic until the last consumer migrated. The record flags this as a trade-off, not a resolved risk. [1][2]',
			sources: [
				{ num: 1, title: 'Session: compatibility migration review', label: '2 stored turns' },
				{ num: 2, title: 'Decision: Compatibility-first migration', label: 'active - high confidence' }
			],
			next: 'Review candidates: confirm whether the interim adapter is still present before relying on this decision.'
		}
	};

	var STAGE_TO_PANEL = { 1: 'evidence', 2: 'candidate', 3: 'active', 4: 'recall' };
	var STAGE_NAME = { 1: 'raw', 2: 'candidate', 3: 'active', 4: 'recall' };

	var els = {};
	var currentState = 'loading';
	var currentStep = 1;
	var settleTimer = null;

	function $(id) { return document.getElementById(id); }

	function formatCount(value) {
		if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
			return '--';
		}
		return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	function nowTime() {
		var d = new Date();
		var pad = function (n) { return (n < 10 ? '0' : '') + n; };
		return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
	}

	function setText(id, value) {
		var node = $(id);
		if (node && node.textContent !== String(value)) {
			node.textContent = String(value);
		}
	}

	function hourglassView(state) {
		var c = state.counts || {};
		if (state.backend === 'service') {
			return {
				caption: ['Captured', formatCount(c.captured), 'records across all lifecycle states'],
				layers: [
					['raw', 'Raw evidence', formatCount(c.raw)],
					['candidate', 'Candidate', formatCount(c.candidate)],
					['active', 'Active knowledge', formatCount(c.active)],
					['recall', 'Grounded recall', formatCount(c.relationships)]
				],
				recallNote: 'linked relationships'
			};
		}
		if (state.backend === 'local') {
			return {
				caption: ['Captured', formatCount(c.captured), 'sessions in the local snapshot'],
				layers: [
					['raw', 'Stored turns', formatCount(c.raw)],
					['candidate', 'Knowledge nodes', formatCount(c.candidate)],
					['active', 'Active knowledge', formatCount(c.active)],
					['recall', 'Linked relationships', formatCount(c.relationships)]
				],
				recallNote: 'in the local snapshot'
			};
		}
		if (state.backend === 'unavailable') {
			return {
				caption: ['Captured', '--', 'service counts unavailable'],
				layers: [
					['raw', 'Raw evidence', '--'],
					['candidate', 'Candidate', '--'],
					['active', 'Active knowledge', '--'],
					['recall', 'Linked relationships', formatCount(c.relationships)]
				],
				recallNote: 'from the local snapshot'
			};
		}
		return {
			caption: ['Captured', '0', 'no records yet'],
			layers: [
				['raw', 'Raw evidence', '0'],
				['candidate', 'Candidate', '0'],
				['active', 'Active knowledge', '0'],
				['recall', 'Linked relationships', '0']
			],
			recallNote: 'nothing linked yet'
		};
	}

	function inventoryItems(state) {
		var c = state.counts || {};
		if (state.backend === 'local') {
			return [
				{ label: 'Captured', value: c.captured, note: 'sessions in the local snapshot', tone: 'neutral' },
				{ label: 'Stored turns', value: c.raw, note: 'immutable evidence turns', tone: 'evidence' },
				{ label: 'Knowledge nodes', value: c.candidate, note: 'organized claims', tone: 'candidate' },
				{ label: 'Active knowledge', value: c.active, note: 'ready for recall', tone: 'active' },
				{ label: 'Evidence-backed', value: c.evidenceBacked, note: 'nodes with source turns', tone: 'active' },
				{ label: 'Contested', value: c.contested, note: 'review required', tone: 'contested' },
				{ label: 'Linked relationships', value: c.relationships, note: 'entity links', tone: 'neutral' },
				{ label: 'Imported decisions', value: '--', note: 'requires layered service', tone: 'neutral' }
			];
		}
		if (state.backend === 'unavailable') {
			return [
				{ label: 'Captured', value: '--', note: 'service counts unavailable', tone: 'neutral' },
				{ label: 'Raw evidence', value: '--', note: 'service counts unavailable', tone: 'evidence' },
				{ label: 'Candidate', value: '--', note: 'service counts unavailable', tone: 'candidate' },
				{ label: 'Active knowledge', value: '--', note: 'service counts unavailable', tone: 'active' },
				{ label: 'Evidence-backed', value: c.evidenceBacked, note: 'local snapshot', tone: 'active' },
				{ label: 'Contested', value: c.contested, note: 'local snapshot', tone: 'contested' },
				{ label: 'Linked relationships', value: c.relationships, note: 'local snapshot', tone: 'neutral' },
				{ label: 'Imported decisions', value: '--', note: 'service counts unavailable', tone: 'neutral' }
			];
		}
		return [
			{ label: 'Captured', value: c.captured, note: 'records across all lifecycle states', tone: 'neutral' },
			{ label: 'Raw evidence', value: c.raw, note: 'awaiting organization', tone: 'evidence' },
			{ label: 'Candidate', value: c.candidate, note: 'awaiting review', tone: 'candidate' },
			{ label: 'Active knowledge', value: c.active, note: 'ready for default recall', tone: 'active' },
			{ label: 'Evidence-backed', value: c.evidenceBacked, note: 'local snapshot: nodes with source turns', tone: 'active' },
			{ label: 'Contested', value: c.contested, note: 'review required', tone: 'contested' },
			{ label: 'Linked relationships', value: c.relationships, note: 'entity links', tone: 'neutral' },
			{ label: 'Imported decisions', value: c.continuity, note: 'Continuity projections', tone: 'neutral' }
		];
	}

	function renderTrust(state) {
		var trust = state.trust;
		els.trustPill.dataset.tone = trust.tone;
		els.trustPill.querySelector('.trust-text').textContent = trust.label;
		els.trustPill.querySelector('.trust-sub').textContent = trust.sub;
	}

	function renderBanner(state) {
		if (state.banner) {
			els.banner.hidden = false;
			els.banner.dataset.tone = state.banner.tone;
			els.banner.textContent = state.banner.text;
		} else {
			els.banner.hidden = true;
			els.banner.textContent = '';
		}
	}

	function renderHourglass(state) {
		var view = hourglassView(state);
		setText('hgCaptionLabel', view.caption[0]);
		setText('hgCaptionCount', view.caption[1]);
		setText('hgCaptionNote', view.caption[2]);
		var idByStage = {
			raw: ['hgRawLabel', 'hgRawCount'],
			candidate: ['hgCandidateLabel', 'hgCandidateCount'],
			active: ['hgActiveLabel', 'hgActiveCount'],
			recall: ['hgRecallLabel', 'hgRecallCount']
		};
		view.layers.forEach(function (layer) {
			setText(idByStage[layer[0]][0], layer[1]);
			setText(idByStage[layer[0]][1], layer[2]);
		});
		setText('hgRecallNote', view.recallNote);
	}

	function renderInventory(state) {
		var html = inventoryItems(state).map(function (item) {
			var value = formatCount(item.value);
			return '<div class="inv-item" data-tone="' + item.tone + '">'
				+ '<dt>' + item.label + '</dt>'
				+ '<dd><strong>' + value + '</strong><span>' + item.note + '</span></dd>'
				+ '</div>';
		}).join('');
		els.inventoryGrid.innerHTML = html;
	}

	function renderJourneyAvailability(state) {
		var showFlow = state.backend === 'service' || state.backend === 'local';
		var placeholder;
		if (state.backend === 'loading') {
			placeholder = 'Loading the example journey...';
		} else if (state.backend === 'empty') {
			placeholder = 'No example journey yet. Once evidence is captured and organized, a record will trace the path from source turn to grounded answer here.';
		} else if (state.backend === 'unavailable') {
			placeholder = 'The example journey needs the layered service to show raw/candidate/active staging. Local snapshot counts remain visible above.';
		} else {
			placeholder = '';
		}
		els.journeyFlow.hidden = !showFlow;
		els.journeyPlaceholder.hidden = showFlow;
		if (!showFlow) {
			els.journeyPlaceholder.textContent = placeholder;
		}
	}

	function renderReviewBadge(state) {
		var contested = (state.counts || {}).contested;
		var show = typeof contested === 'number' && contested > 0;
		els.reviewBadge.hidden = !show;
		if (show) {
			els.reviewBadge.textContent = contested;
		}
	}

	function render(stateName) {
		var state = STATES[stateName] || STATES.online;
		currentState = stateName;
		renderTrust(state);
		renderBanner(state);
		renderHourglass(state);
		renderInventory(state);
		renderJourneyAvailability(state);
		renderReviewBadge(state);
		setText('refreshTime', 'Refreshed ' + nowTime());
		setStep(currentStep, true);
		renderAnswer($('questionSelect').value);
	}

	/* ---------------- Journey ---------------- */

	function setStep(step, silent) {
		step = Math.max(1, Math.min(4, step));
		currentStep = step;
		var stage = STAGE_NAME[step];
		els.hourglass.dataset.activeStage = stage;
		var steps = els.journeyRail.querySelectorAll('.journey-step');
		steps.forEach(function (button) {
			var isCurrent = Number(button.dataset.step) === step;
			if (isCurrent) { button.setAttribute('aria-current', 'step'); }
			else { button.removeAttribute('aria-current'); }
		});
		els.journeyDetail.querySelectorAll('.step-panel').forEach(function (panel) {
			panel.hidden = panel.dataset.panel !== STAGE_TO_PANEL[step];
		});
		setText('stepCounter', 'Step ' + step + ' of 4');
		if (!silent && step === 4) {
			renderAnswer($('questionSelect').value);
		}
	}

	function renderAnswer(questionKey) {
		var answer = ANSWERS[questionKey] || ANSWERS.adapter;
		if (!answer) { return; }
		setText('answerText', answer.text);
		$('answerSourcesList').innerHTML = answer.sources.map(function (source) {
			return '<li><b>' + source.num + '</b><span>' + source.title + ' <br> ' + source.label + '</span></li>';
		}).join('');
		$('nextAction').innerHTML = '<strong>Next action:</strong> ' + answer.next;
	}

	/* ---------------- Actions ---------------- */

	function scrollToJourney() {
		els.journeyDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function handleAction(action) {
		if (action === 'continue') {
			setStep(4);
			scrollToJourney();
		} else if (action === 'ask') {
			setStep(4);
			scrollToJourney();
			setTimeout(function () { $('questionSelect').focus(); }, 200);
		} else if (action === 'inspect') {
			setStep(4);
			scrollToJourney();
			setTimeout(function () { $('answerSources').scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200);
		} else if (action === 'review') {
			setStep(2);
			scrollToJourney();
			if (currentState === 'contested') {
				els.banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}
	}

	/* ---------------- Init ---------------- */

	function cacheElements() {
		els.trustPill = $('trustPill');
		els.banner = $('banner');
		els.hourglass = $('hourglass');
		els.inventoryGrid = $('inventoryGrid');
		els.journeyFlow = $('journeyFlow');
		els.journeyPlaceholder = $('journeyPlaceholder');
		els.journeyDetail = $('journeyDetail');
		els.journeyRail = $('journeyRail');
		els.reviewBadge = $('reviewBadge');
	}

	function bindEvents() {
		$('demoState').addEventListener('change', function (event) {
			selectState(event.target.value);
		});
		$('refreshButton').addEventListener('click', function () {
			simulateRefresh();
		});
		els.journeyRail.querySelectorAll('.journey-step').forEach(function (button) {
			button.addEventListener('click', function () {
				setStep(Number(button.dataset.step));
			});
		});
		$('prevStep').addEventListener('click', function () { setStep(currentStep - 1); });
		$('nextStep').addEventListener('click', function () { setStep(currentStep + 1); });
		$('questionSelect').addEventListener('change', function (event) {
			renderAnswer(event.target.value);
		});
		document.querySelectorAll('.action').forEach(function (button) {
			button.addEventListener('click', function () {
				handleAction(button.dataset.action);
			});
		});
	}

	function selectState(stateName) {
		clearTimeout(settleTimer);
		if (stateName === 'loading') {
			render('loading');
			settleTimer = setTimeout(function () {
				$('demoState').value = 'online';
				render('online');
			}, 1200);
			return;
		}
		render(stateName);
	}

	function simulateRefresh() {
		var target = currentState;
		clearTimeout(settleTimer);
		render('loading');
		settleTimer = setTimeout(function () {
			$('demoState').value = target === 'loading' ? 'online' : target;
			render(target === 'loading' ? 'online' : target);
		}, 700);
	}

	function init() {
		cacheElements();
		bindEvents();
		render('loading');
		settleTimer = setTimeout(function () {
			$('demoState').value = 'online';
			render('online');
		}, 900);
	}

	document.addEventListener('DOMContentLoaded', init);
})();
