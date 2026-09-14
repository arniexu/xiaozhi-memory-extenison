(function () {
	'use strict';

	const stageOrder = ['raw', 'candidate', 'active', 'recall'];

	const states = {
		online: {
			trustClass: 'online',
			trustLabel: 'Online service',
			trustDetail: 'Auto mode using live service health and local snapshot detail',
			banner: null,
			counts: {
				captured: { value: '2,412', source: 'ServiceHealth.memory.total', description: 'Captured records' },
				raw: { value: '1,428', source: 'ServiceHealth.memory.raw', description: 'Immutable evidence inventory' },
				candidate: { value: '236', source: 'ServiceHealth.memory.candidate', description: 'Awaiting explicit review' },
				active: { value: '748', source: 'ServiceHealth.memory.active', description: 'Eligible for default recall' },
				evidence: { value: '684', source: 'DashboardStats.evidenceBackedKnowledge', description: 'Active knowledge with evidence refs' },
				contested: { value: '19', source: 'DashboardStats.contestedKnowledge', description: 'Uncertain or disputed knowledge' },
				relationships: { value: '531', source: 'ServiceHealth.neo4j.relationships or DashboardStats.edges', description: 'Linked relationships' },
			},
		},
		local: {
			trustClass: 'local',
			trustLabel: 'Local fallback',
			trustDetail: 'Service unavailable, local snapshot still usable',
			banner: { tone: 'local', text: 'Offline is a supported operating mode. Current fallback can still restore session context, active knowledge, contested items, and relationships. Raw and candidate stage counts are not available from the local snapshot types.' },
			counts: {
				captured: { value: '--', source: 'Unavailable offline', description: 'Total captured records unavailable in local-only mode' },
				raw: { value: '--', source: 'Unavailable offline', description: 'Raw lifecycle inventory not exposed locally' },
				candidate: { value: '--', source: 'Unavailable offline', description: 'Candidate lifecycle inventory not exposed locally' },
				active: { value: '748', source: 'DashboardStats.activeKnowledge', description: 'Local reusable knowledge count' },
				evidence: { value: '684', source: 'DashboardStats.evidenceBackedKnowledge', description: 'Knowledge still linked to evidence' },
				contested: { value: '19', source: 'DashboardStats.contestedKnowledge', description: 'Contested items still visible offline' },
				relationships: { value: '531', source: 'DashboardStats.edges', description: 'Local linked relationships' },
			},
		},
		unavailable: {
			trustClass: 'unavailable',
			trustLabel: 'Service unavailable',
			trustDetail: 'Service mode blocks remote retrieval until the backend recovers',
			banner: { tone: 'unavailable', text: 'This representative state shows service-only failure. Retrieval should fail clearly instead of pretending local fallback was active.' },
			counts: {
				captured: { value: '--', source: 'Unavailable', description: 'Blocked while service is unavailable' },
				raw: { value: '--', source: 'Unavailable', description: 'Blocked while service is unavailable' },
				candidate: { value: '--', source: 'Unavailable', description: 'Blocked while service is unavailable' },
				active: { value: '--', source: 'Unavailable', description: 'Blocked while service is unavailable' },
				evidence: { value: '684', source: 'Last local snapshot reference', description: 'Shown only as a reference, not active backend data' },
				contested: { value: '19', source: 'Last local snapshot reference', description: 'Shown only as a reference, not active backend data' },
				relationships: { value: '531', source: 'Last local snapshot reference', description: 'Shown only as a reference, not active backend data' },
			},
		},
		empty: {
			trustClass: 'online',
			trustLabel: 'Empty',
			trustDetail: 'No captured records yet',
			banner: { tone: 'empty', text: 'Useful first-run state: nothing has been captured or organized yet. The UI explains how evidence enters the system without inventing any staged knowledge.' },
			counts: {
				captured: { value: '0', source: 'ServiceHealth.memory.total', description: 'Captured records' },
				raw: { value: '0', source: 'ServiceHealth.memory.raw', description: 'Immutable evidence inventory' },
				candidate: { value: '0', source: 'ServiceHealth.memory.candidate', description: 'Awaiting explicit review' },
				active: { value: '0', source: 'ServiceHealth.memory.active', description: 'Eligible for default recall' },
				evidence: { value: '0', source: 'DashboardStats.evidenceBackedKnowledge', description: 'Knowledge with evidence refs' },
				contested: { value: '0', source: 'DashboardStats.contestedKnowledge', description: 'Uncertain or disputed knowledge' },
				relationships: { value: '0', source: 'ServiceHealth.neo4j.relationships or DashboardStats.edges', description: 'Linked relationships' },
			},
		},
		loading: {
			trustClass: 'loading',
			trustLabel: 'Loading',
			trustDetail: 'Checking backend and refreshing safe counts',
			banner: { tone: 'info', text: 'Representative loading state while the extension refreshes backend health and local snapshot-backed detail. The shape of the story stays stable even while counts are pending.' },
			counts: {
				captured: { value: '--', source: 'Pending', description: 'Captured records' },
				raw: { value: '--', source: 'Pending', description: 'Immutable evidence inventory' },
				candidate: { value: '--', source: 'Pending', description: 'Awaiting explicit review' },
				active: { value: '--', source: 'Pending', description: 'Eligible for default recall' },
				evidence: { value: '--', source: 'Pending', description: 'Knowledge with evidence refs' },
				contested: { value: '--', source: 'Pending', description: 'Uncertain or disputed knowledge' },
				relationships: { value: '--', source: 'Pending', description: 'Linked relationships' },
			},
		},
		contested: {
			trustClass: 'contested',
			trustLabel: 'Contested knowledge',
			trustDetail: 'Service online with bounded disagreement that needs review',
			banner: { tone: 'contested', text: 'Contested knowledge is visible and bounded. It is not silently promoted or merged away. Review should be explicit before anything becomes active.' },
			counts: {
				captured: { value: '2,412', source: 'ServiceHealth.memory.total', description: 'Captured records' },
				raw: { value: '1,428', source: 'ServiceHealth.memory.raw', description: 'Immutable evidence inventory' },
				candidate: { value: '236', source: 'ServiceHealth.memory.candidate', description: 'Awaiting explicit review' },
				active: { value: '741', source: 'ServiceHealth.memory.active', description: 'Eligible for default recall' },
				evidence: { value: '684', source: 'DashboardStats.evidenceBackedKnowledge', description: 'Knowledge with evidence refs' },
				contested: { value: '26', source: 'DashboardStats.contestedKnowledge', description: 'Uncertain or disputed knowledge' },
				relationships: { value: '531', source: 'ServiceHealth.neo4j.relationships or DashboardStats.edges', description: 'Linked relationships' },
			},
		},
	};

	const stageDetails = {
		raw: {
			tag: 'RAW',
			title: 'Captured evidence remains intact',
			body: 'Engineering work creates immutable evidence first: turns, documents, decisions, and investigation results. Context Recall captures the record without replacing it with a summary.',
			meta: [
				['Stored as', 'Immutable evidence'],
				['Example source', 'Session turn plus imported decision'],
				['Trust point', 'Nothing is promoted here'],
				['Current status', 'Inspectable and linkable'],
			],
			actions: [
				{ label: 'Inspect evidence', task: 'inspect', kind: 'current' },
			],
		},
		candidate: {
			tag: 'CANDIDATE',
			title: 'Knowledge pauses here for review',
			body: 'Candidate knowledge is derived from evidence but held apart from active recall. Review and contested states establish trust by making promotion explicit instead of silent.',
			meta: [
				['Stored as', 'Candidate memory'],
				['Evidence refs', '2 linked sources'],
				['Confidence', 'Medium until reviewed'],
				['Current status', 'Not default recall'],
			],
			actions: [
				{ label: 'Review candidate', task: 'review', kind: 'proposed' },
				{ label: 'Mark contested', task: 'review', kind: 'proposed' },
			],
		},
		active: {
			tag: 'ACTIVE',
			title: 'Reusable knowledge keeps its rationale attached',
			body: 'Active knowledge stays linked to evidence, confidence, scope, and relationships. The user sees the stable claim and can still inspect why it became reusable.',
			meta: [
				['Stored as', 'Active reusable knowledge'],
				['Confidence', 'High after review'],
				['Scope', 'Workspace and session aware'],
				['Current status', 'Default recall eligible'],
			],
			actions: [
				{ label: 'Ask history', task: 'ask', kind: 'current' },
				{ label: 'Continue work', task: 'continue', kind: 'current' },
			],
		},
		recall: {
			tag: 'RECALL',
			title: 'A future engineer gets grounded rationale and next action',
			body: 'The answer is not just a result string. It restores historical rationale, exposes evidence, and points to the next useful action while leaving uncertainty visible.',
			meta: [
				['Returned with', 'Evidence ledger plus next step'],
				['Scope', 'Current workspace and relevant history'],
				['Trust point', 'Answer remains inspectable'],
				['Current status', 'Retrieval exists, integrated workspace is proposed'],
			],
			actions: [
				{ label: 'Continue work', task: 'continue', kind: 'current' },
			],
		},
	};

	const answers = {
		adapter: {
			text: 'The team kept the compatibility adapter because rewriting every consumer at once would have blocked parallel work. The active decision records the adapter as the explicit trade-off, not as an accidental leftover.',
			next: 'Next action: verify whether any remaining consumers still depend on the adapter before planning removal.',
			ledger: [
				['Session: migration review', 'Turn evidence', '"Rewriting all consumers now would block three teams and delay the API cutover."'],
				['Decision import', 'Decision evidence', 'Compatibility-first migration accepted with linked rationale and scope.'],
				['Related note', 'Investigation result', 'Open issue preserved: adapter retirement criteria not yet settled.'],
			],
		},
		rollout: {
			text: 'Rollout order followed ownership boundaries: keep the adapter in place, move one consumer at a time, and preserve a record of which team owned each cutover decision so later sessions would not have to reconstruct it.',
			next: 'Next action: check the stored next steps for the remaining owner handoff and update the working session if rollout status has changed.',
			ledger: [
				['Session context', 'Current capability', 'SessionContext.nextSteps stores the remaining handoff and rollout tasks.'],
				['Decision evidence', 'Imported decision', 'Workspace-level rationale keeps the sequencing choice explicit.'],
				['Document chunk', 'Reference evidence', 'Owner responsibilities remain linkable to supporting guidance.'],
			],
		},
		risk: {
			text: 'The accepted risk was keeping a temporary compatibility layer longer than ideal. Context Recall should surface that the risk remained open, who accepted it, and which evidence justified doing so at the time.',
			next: 'Next action: review the contested or open-risk note before removing the adapter or broadening its scope.',
			ledger: [
				['Open issue', 'Session context', 'Open issues remain visible instead of being hidden behind the final answer.'],
				['Decision record', 'Evidence-backed knowledge', 'The active decision still points back to the source turns.'],
				['Contested review', 'Proposed workflow', 'A future review workspace could promote, bound, or supersede this risk explicitly.'],
			],
		},
	};

	const inventoryLabels = [
		['captured', 'Captured', 'captured'],
		['raw', 'Raw', 'raw'],
		['candidate', 'Candidate', 'candidate'],
		['active', 'Active', 'active'],
		['evidence', 'Evidence-backed', 'evidence'],
		['contested', 'Contested', 'contested'],
		['relationships', 'Linked relationships', 'relationships'],
	];

	let currentState = 'online';
	let currentStageIndex = 0;
	let loadingTimer = null;

	function formatTime() {
		const now = new Date();
		return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function setRefreshTime() {
		document.getElementById('refreshTime').textContent = `Refreshed ${formatTime()}`;
	}

	function renderBanner(profile) {
		const banner = document.getElementById('stateBanner');
		if (!profile.banner) {
			banner.hidden = true;
			banner.className = 'state-banner';
			banner.textContent = '';
			return;
		}
		banner.hidden = false;
		banner.className = `state-banner banner ${profile.banner.tone}`;
		banner.textContent = profile.banner.text;
	}

	function renderTrust(profile) {
		const pill = document.getElementById('trustPill');
		pill.className = `trust-pill ${profile.trustClass}`;
		document.getElementById('trustLabel').textContent = profile.trustLabel;
		document.getElementById('trustDetail').textContent = profile.trustDetail;
	}

	function renderCounts(profile) {
		document.getElementById('rawCount').textContent = profile.counts.raw.value;
		document.getElementById('candidateCount').textContent = profile.counts.candidate.value;
		document.getElementById('activeCount').textContent = profile.counts.active.value;
		document.getElementById('relationshipCount').textContent = profile.counts.relationships.value;

		const inventoryGrid = document.getElementById('inventoryGrid');
		inventoryGrid.innerHTML = '';
		for (const [key, label, cls] of inventoryLabels) {
			const entry = profile.counts[key];
			const card = document.createElement('div');
			card.className = `inventory-card ${cls}`;
			card.innerHTML = `<dt>${label}</dt><dd>${entry.value}</dd><div class="description">${entry.description}</div><div class="source-note">${entry.source}</div>`;
			inventoryGrid.appendChild(card);
		}
	}

	function actionToStage(action) {
		if (action === 'review') {
			return 'candidate';
		}
		if (action === 'inspect') {
			return 'raw';
		}
		return 'recall';
	}

	function renderStage() {
		const stage = stageOrder[currentStageIndex];
		const detail = stageDetails[stage];
		document.getElementById('hourglassShell').dataset.stage = stage;
		document.querySelectorAll('.stage-button').forEach((button) => {
			const isActive = button.dataset.stage === stage;
			button.classList.toggle('is-active', isActive);
			if (isActive) {
				button.setAttribute('aria-current', 'step');
			} else {
				button.removeAttribute('aria-current');
			}
		});
		document.querySelectorAll('.task-button').forEach((button) => {
			button.classList.toggle('is-active', actionToStage(button.dataset.action) === stage);
		});

		document.getElementById('stageCounter').textContent = `Step ${currentStageIndex + 1} of ${stageOrder.length}`;
		document.getElementById('detailTag').textContent = detail.tag;
		document.getElementById('detailTitle').textContent = detail.title;
		document.getElementById('detailBody').textContent = detail.body;

		const meta = document.getElementById('detailMeta');
		meta.innerHTML = '';
		for (const [term, description] of detail.meta) {
			const item = document.createElement('div');
			item.innerHTML = `<dt>${term}</dt><dd>${description}</dd>`;
			meta.appendChild(item);
		}

		const actions = document.getElementById('detailActions');
		actions.innerHTML = '';
		for (const action of detail.actions) {
			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = action.label;
			if (action.kind === 'proposed') {
				button.classList.add('proposed');
			}
			button.dataset.action = action.task;
			button.addEventListener('click', () => setStage(actionToStage(action.task)));
			actions.appendChild(button);
		}
	}

	function renderAnswer() {
		const answer = answers[document.getElementById('questionSelect').value];
		document.getElementById('answerText').textContent = answer.text;
		document.getElementById('nextAction').textContent = answer.next;
		const ledger = document.getElementById('ledgerList');
		ledger.innerHTML = '';
		for (const [title, meta, excerpt] of answer.ledger) {
			const item = document.createElement('li');
			item.innerHTML = `<span class="ledger-title">${title}</span><div class="ledger-meta">${meta}</div><div class="ledger-excerpt">${excerpt}</div>`;
			ledger.appendChild(item);
		}
	}

	function renderState(stateKey) {
		currentState = stateKey;
		const profile = states[stateKey];
		renderTrust(profile);
		renderBanner(profile);
		renderCounts(profile);
		renderStage();
		renderAnswer();
		setRefreshTime();
	}

	function setStage(stage) {
		currentStageIndex = stageOrder.indexOf(stage);
		if (currentStageIndex < 0) {
			currentStageIndex = 0;
		}
		renderStage();
	}

	function bindEvents() {
		document.getElementById('stateSelect').addEventListener('change', (event) => {
			const nextState = event.target.value;
			if (loadingTimer) {
				window.clearTimeout(loadingTimer);
				loadingTimer = null;
			}
			renderState(nextState);
			if (nextState === 'loading') {
				loadingTimer = window.setTimeout(() => {
					document.getElementById('stateSelect').value = 'online';
					renderState('online');
				}, 900);
			}
		});

		document.getElementById('refreshButton').addEventListener('click', () => {
			const previousState = currentState;
			document.getElementById('stateSelect').value = 'loading';
			renderState('loading');
			if (loadingTimer) {
				window.clearTimeout(loadingTimer);
			}
			loadingTimer = window.setTimeout(() => {
				document.getElementById('stateSelect').value = previousState === 'loading' ? 'online' : previousState;
				renderState(previousState === 'loading' ? 'online' : previousState);
			}, 700);
		});

		document.querySelectorAll('.stage-button').forEach((button) => {
			button.addEventListener('click', () => setStage(button.dataset.stage));
		});

		document.querySelectorAll('.task-button').forEach((button) => {
			button.addEventListener('click', () => setStage(actionToStage(button.dataset.action)));
		});

		document.getElementById('prevStage').addEventListener('click', () => {
			currentStageIndex = (currentStageIndex + stageOrder.length - 1) % stageOrder.length;
			renderStage();
		});

		document.getElementById('nextStage').addEventListener('click', () => {
			currentStageIndex = (currentStageIndex + 1) % stageOrder.length;
			renderStage();
		});

		document.getElementById('questionSelect').addEventListener('change', renderAnswer);
	}

	bindEvents();
	renderState('online');
})();