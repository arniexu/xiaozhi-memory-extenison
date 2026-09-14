const vscode = acquireVsCodeApi();
const metrics = document.getElementById('metrics');
const sessions = document.getElementById('sessions');
const activity = document.getElementById('activity');
const distribution = document.getElementById('distribution');
const graph = document.getElementById('graph');
const graphLegend = document.getElementById('graphLegend');
const kindFilter = document.getElementById('kindFilter');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchButton = document.getElementById('searchButton');
const clearSearch = document.getElementById('clearSearch');
const searchSummary = document.getElementById('searchSummary');
const syncButton = document.getElementById('syncButton');
const documentUploadButton = document.getElementById('documentUploadButton');
const documentImportStatus = document.getElementById('documentImportStatus');
let currentState;
let renderedQuery = '';
let searchPending = false;

function escapeHtml(value) {
	return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function metric(label, value, note) {
	return `<div class="metric"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><em>${escapeHtml(note)}</em></div>`;
}

function formatCount(value) {
	return Number.isFinite(value) ? value.toLocaleString() : '—';
}

function formatBytes(value) {
	if (!Number.isFinite(value)) return '—';
	const units = ['B', 'KB', 'MB', 'GB'];
	let size = value;
	let unit = 0;
	while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
	return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function systemCard(kind, title, status, rows, note) {
	return `<article class="system-card" data-kind="${escapeHtml(kind)}">
		<div class="system-card-heading"><div><small>${escapeHtml(kind)}</small><h3>${escapeHtml(title)}</h3></div><strong>${escapeHtml(status)}</strong></div>
		<dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd></div>`).join('')}</dl>
		<p>${escapeHtml(note)}</p>
	</article>`;
}

function renderSystems(state) {
	const backend = state.backend;
	const memory = backend.databases?.memory;
	const vectors = backend.databases?.vectors;
	const neo4j = backend.neo4j;
	document.getElementById('dataSystems').innerHTML = [
		systemCard('KNOWLEDGE STORE', memory?.engine || 'SQLite + FTS5', backend.available ? 'Online' : 'Unavailable', [
			['Records', formatCount(backend.memory?.total)],
			['File size', formatBytes(memory?.size_bytes)],
			['Features', memory?.features?.join(' · ') || 'FTS5 · WAL'],
			['Path', memory?.path || 'Service unavailable'],
		], 'Lifecycle records, evidence references, scopes, and audit events.'),
		systemCard('VECTOR DATABASE', vectors?.engine || 'SQLite', backend.available ? 'Online' : 'Unavailable', [
			['Vectors', formatCount(backend.vectors?.total)],
			['Dimensions', formatCount(backend.vectors?.dimensions)],
			['File size', formatBytes(vectors?.size_bytes)],
			['Path', vectors?.path || 'Service unavailable'],
		], vectors?.features?.join(' · ') || 'Exact cosine semantic recall.'),
		systemCard('KNOWLEDGE GRAPH', 'Neo4j', neo4j?.ready ? 'Online' : neo4j?.configured ? 'Unavailable' : 'Off', [
			['Database', neo4j?.database || 'neo4j'],
			['Endpoint', neo4j?.endpoint || 'Not configured'],
			['Nodes', formatCount(neo4j?.nodes)],
			['Relationships', formatCount(neo4j?.relationships)],
		], `Local snapshot: ${formatCount(state.stats.nodes)} nodes · ${formatCount(state.stats.edges)} relationships.`),
	].join('');
}

function renderService(state) {
	const backend = state.backend;
	const neo4j = backend.neo4j?.ready ? 'Ready' : backend.neo4j?.configured ? 'Unavailable' : 'Not configured';
	document.getElementById('serviceEndpoint').textContent = backend.url;
	document.getElementById('serviceStatus').innerHTML = `<i class="${backend.available ? 'online' : ''}"></i><div><strong>${backend.available ? 'Online' : 'Unavailable'}</strong><span>${escapeHtml(backend.mode.toUpperCase())} mode</span></div>`;
	document.getElementById('serviceMetrics').innerHTML = [
		metric('Active knowledge', formatCount(backend.memory?.active), `${formatCount(backend.memory?.total)} total`),
		metric('Continuity', formatCount(backend.memory?.continuity), 'Imported decisions'),
		metric('Candidates', formatCount(backend.memory?.candidate), 'Awaiting promotion'),
		metric('Raw records', formatCount(backend.memory?.raw), 'Captured evidence'),
		metric('Service vectors', formatCount(backend.vectors?.total), backend.vectors?.dimensions ? `${backend.vectors.dimensions} dimensions` : 'Semantic index'),
		metric('Neo4j', neo4j, backend.neo4j?.ready ? 'Graph backend online' : 'Optional graph layer'),
	].join('');
	syncButton.disabled = !backend.available;
	syncButton.title = backend.available ? 'Add or update local snapshot data in the layered service' : 'Layered service is unavailable';
	documentUploadButton.disabled = !backend.available;
	documentUploadButton.title = backend.available ? 'Choose one or more PDF documents' : 'Layered service is unavailable';
}

function renderHourglass(state) {
	const memory = state.backend.memory;
	const total = memory?.total;
	const active = memory?.active;
	document.getElementById('capturedCount').textContent = formatCount(total);
	document.getElementById('rawCount').textContent = formatCount(memory?.raw);
	document.getElementById('candidateCount').textContent = formatCount(memory?.candidate);
	document.getElementById('activeCount').textContent = formatCount(active);
	document.getElementById('relationCount').textContent = formatCount(state.backend.neo4j?.relationships ?? state.stats.edges);
	document.getElementById('maturityRate').textContent = Number.isFinite(total) && total > 0 && Number.isFinite(active)
		? `${Math.round(active / total * 100)}%`
		: '—';
}

function renderMetrics(state) {
	const stats = state.stats;
	metrics.innerHTML = [
		metric('Sessions', stats.sessions, `${stats.turns} stored turns`),
		metric('Vectors', stats.vectors, `${stats.vectorCoverage}% coverage`),
		metric('Knowledge', stats.nodes, `${stats.activeKnowledge} active`),
		metric('Relationships', stats.edges, 'Evidence linked'),
		metric('Contested', stats.contestedKnowledge, stats.contestedKnowledge ? 'Review required' : 'No conflicts'),
	].join('');
}

function renderSessions(state) {
	const recent = [...state.snapshot.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12);
	document.getElementById('sessionCount').textContent = `${state.stats.sessions} total`;
	sessions.innerHTML = recent.length ? recent.map((session) => `
		<div class="session">
			<strong>${escapeHtml(session.title)}</strong>
			<div>${session.turnIds.length} turns · ${new Date(session.updatedAt).toLocaleString()}</div>
		</div>`).join('') : '<div class="empty">Start a conversation with @recall to create the first session.</div>';
}

function renderDistribution(state) {
	const counts = new Map();
	for (const node of state.snapshot.nodes) counts.set(node.kind, (counts.get(node.kind) || 0) + 1);
	const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
	const max = Math.max(1, ...rows.map((row) => row[1]));
	distribution.innerHTML = rows.length ? rows.map(([kind, count]) => `
		<div class="bar-row"><span>${escapeHtml(kind)}</span><div class="bar"><i style="width:${Math.round(count / max * 100)}%"></i></div><b>${count}</b></div>`).join('') : '<div class="empty">Knowledge distribution appears after the first organized conversation.</div>';
}

function renderActivity(state) {
	activity.innerHTML = state.snapshot.events.length ? state.snapshot.events.slice(0, 14).map((event) => `
		<div class="activity-item"><i></i><div>${escapeHtml(event.detail)}<br><small>${new Date(event.createdAt).toLocaleString()}</small></div></div>`).join('') : '<div class="empty">No organization activity yet.</div>';
}

function renderSearch(state) {
	renderedQuery = state.query;
	searchPending = false;
	if (document.activeElement !== searchInput) searchInput.value = state.query;
	searchButton.disabled = false;
	searchButton.textContent = 'Search';
	clearSearch.hidden = !state.query;
	searchSummary.textContent = state.query ? `${state.searchResults.length} ${state.searchResults.length === 1 ? 'result' : 'results'}` : 'Ready';
	const results = state.searchResults.length ? state.searchResults.map((result) => `
		<div class="result"><strong>${escapeHtml(result.source)} · ${escapeHtml(result.sourceKind)}${Number.isFinite(result.score) ? ` · ${(result.score * 100).toFixed(0)}%` : ''}</strong><p>${escapeHtml(result.text)}</p></div>`).join('') : state.query ? '<div class="result"><p>No matching graph, knowledge, or session evidence.</p></div>' : '';
	searchResults.classList.toggle('visible', Boolean(state.query));
	searchResults.innerHTML = `${state.searchError ? `<div class="answer-error">${escapeHtml(state.searchError)} · Showing available local evidence.</div>` : ''}${results}`;
}

function submitSearch() {
	const query = searchInput.value.trim();
	if (searchPending || query === renderedQuery) return;
	if (!query) {
		resetSearch();
		return;
	}
	searchPending = true;
	searchButton.disabled = true;
	searchButton.textContent = 'Searching...';
	clearSearch.hidden = false;
	searchSummary.textContent = 'Searching';
	searchResults.classList.add('visible');
	searchResults.innerHTML = '<div class="result"><p>Searching graph, semantic knowledge, FTS5, and local evidence...</p></div>';
	vscode.postMessage({ type: 'search', query });
}

function resetSearch() {
	searchInput.value = '';
	searchPending = false;
	renderedQuery = '';
	clearSearch.hidden = true;
	searchSummary.textContent = 'Ready';
	searchResults.classList.remove('visible');
	searchResults.replaceChildren();
	vscode.postMessage({ type: 'search', query: '' });
	searchInput.focus();
}

function renderGraph(state) {
	const allNodes = state.snapshot.nodes;
	const kinds = [...new Set(allNodes.map((node) => node.kind))].sort();
	const selected = kindFilter.value || 'all';
	kindFilter.innerHTML = '<option value="all">All kinds</option>' + kinds.map((kind) => `<option value="${escapeHtml(kind)}"${selected === kind ? ' selected' : ''}>${escapeHtml(kind)}</option>`).join('');
	const visible = (selected === 'all' ? allNodes : allNodes.filter((node) => node.kind === selected)).slice(0, 24);
	if (!visible.length) {
		graph.innerHTML = '<div class="empty">Knowledge nodes will organize themselves here after a conversation.</div>';
		graphLegend.innerHTML = '<span><b>Green</b> medium/high confidence</span><span><b>Amber</b> low confidence</span>';
		return;
	}
	const width = Math.max(graph.clientWidth, 520);
	const height = graph.clientHeight;
	const centerX = width / 2;
	const centerY = height / 2;
	const radius = Math.min(width * .36, height * .38);
	const positions = new Map();
	visible.forEach((node, index) => {
		const angle = (index / visible.length) * Math.PI * 2 - Math.PI / 2;
		positions.set(node.id, { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius });
	});
	const nodeIds = new Set(visible.map((node) => node.id));
	const edges = state.snapshot.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)).slice(0, 36);
	const elements = [];
	for (const edge of edges) {
		const from = positions.get(edge.from); const to = positions.get(edge.to);
		const dx = to.x - from.x; const dy = to.y - from.y;
		const length = Math.sqrt(dx * dx + dy * dy); const angle = Math.atan2(dy, dx) * 180 / Math.PI;
		const line = document.createElement('div');
		line.className = 'graph-line';
		line.style.left = `${from.x}px`; line.style.top = `${from.y}px`; line.style.width = `${length}px`; line.style.transform = `rotate(${angle}deg)`;
		const label = document.createElement('span'); label.textContent = edge.type; line.append(label); elements.push(line);
	}
	for (const node of visible) {
		const position = positions.get(node.id);
		const element = document.createElement('div');
		element.className = 'graph-node'; element.dataset.confidence = node.confidence;
		element.style.left = `${position.x}px`; element.style.top = `${position.y}px`;
		element.title = node.summary; element.textContent = node.label; elements.push(element);
	}
	graph.replaceChildren(...elements);
	graphLegend.innerHTML = `<span>${visible.length} nodes</span><span>${edges.length} visible relationships</span><span><b>Green</b> medium/high</span><span><b>Amber</b> low</span>`;
}

function render(state) {
	currentState = state;
	renderService(state); renderHourglass(state); renderMetrics(state); renderSystems(state); renderSessions(state); renderDistribution(state); renderActivity(state); renderSearch(state); renderGraph(state);
}

document.getElementById('refreshButton').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
document.getElementById('exportButton').addEventListener('click', () => vscode.postMessage({ type: 'export' }));
document.getElementById('importButton').addEventListener('click', () => vscode.postMessage({ type: 'import' }));
documentUploadButton.addEventListener('click', () => vscode.postMessage({ type: 'importDocuments' }));
syncButton.addEventListener('click', () => vscode.postMessage({ type: 'syncService' }));
searchButton.addEventListener('click', submitSearch);
clearSearch.addEventListener('click', resetSearch);
searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') submitSearch(); });
searchInput.addEventListener('input', () => { clearSearch.hidden = !searchInput.value; });
kindFilter.addEventListener('change', () => { if (currentState) renderGraph(currentState); });
window.addEventListener('message', (event) => {
	if (event.data.type === 'state') render(event.data.state);
	if (event.data.type === 'documentImportStatus') {
		documentImportStatus.dataset.status = event.data.status;
		documentImportStatus.textContent = event.data.message;
		documentUploadButton.disabled = event.data.status === 'working';
	}
});
window.addEventListener('resize', () => { if (currentState) renderGraph(currentState); });
window.setInterval(() => vscode.postMessage({ type: 'refresh' }), 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) vscode.postMessage({ type: 'refresh' }); });
vscode.postMessage({ type: 'ready' });