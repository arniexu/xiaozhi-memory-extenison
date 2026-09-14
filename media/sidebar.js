const vscode = acquireVsCodeApi();
const metrics = document.getElementById('metrics');
const sessions = document.getElementById('sessions');
const events = document.getElementById('events');
const syncService = document.getElementById('syncService');
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const clearSearch = document.getElementById('clearSearch');
const searchResults = document.getElementById('searchResults');
const searchSummary = document.getElementById('searchSummary');
let renderedQuery = '';
let searchPending = false;

function escapeHtml(value) {
	return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function formatCount(value) {
	return Number.isFinite(value) ? value.toLocaleString() : '—';
}

function searchMessage(text, className = 'search-empty') {
	const message = document.createElement('p');
	message.className = className;
	message.textContent = text;
	return message;
}

function renderSearch(state) {
	renderedQuery = state.query;
	if (document.activeElement !== searchInput) searchInput.value = state.query;
	searchPending = false;
	searchButton.disabled = false;
	searchButton.textContent = 'Search';
	clearSearch.hidden = !state.query;
	if (!state.query) {
		searchSummary.textContent = 'Graph · Semantic · FTS5';
		searchResults.replaceChildren(searchMessage('Enter a query to search the layered knowledge base.'));
		return;
	}
	const content = [];
	if (state.searchError) content.push(searchMessage(`${state.searchError} · Showing available local evidence.`, 'search-warning'));
	for (const result of state.searchResults) {
		const article = document.createElement('article');
		article.className = 'search-result';
		article.dataset.source = result.source;
		const source = document.createElement('strong');
		source.textContent = result.source;
		const kind = document.createElement('span');
		kind.className = 'result-kind';
		kind.textContent = result.sourceKind;
		const heading = document.createElement('div');
		heading.className = 'result-heading';
		heading.append(source, kind);
		const text = document.createElement('p');
		text.textContent = result.text;
		article.append(heading, text);
		content.push(article);
	}
	if (!state.searchResults.length) content.push(searchMessage('No matching graph, knowledge, or session evidence.'));
	searchSummary.textContent = `${state.searchResults.length} ${state.searchResults.length === 1 ? 'result' : 'results'}`;
	searchResults.replaceChildren(...content);
}

function submitSearch() {
	const query = searchInput.value.trim();
	if (searchPending || query === renderedQuery) return;
	if (!query) {
		clearSearch.hidden = true;
		searchSummary.textContent = 'Graph · Semantic · FTS5';
		searchResults.replaceChildren(searchMessage('Enter a query to search the layered knowledge base.'));
		if (renderedQuery) vscode.postMessage({ type: 'search', query: '' });
		return;
	}
	searchPending = true;
	searchButton.disabled = true;
	searchButton.textContent = 'Searching...';
	clearSearch.hidden = false;
	searchSummary.textContent = 'Searching';
	searchResults.replaceChildren(searchMessage('Searching graph, semantic knowledge, and FTS5...'));
	vscode.postMessage({ type: 'search', query });
}

function resetSearch() {
	searchInput.value = '';
	searchPending = false;
	renderedQuery = '';
	clearSearch.hidden = true;
	searchSummary.textContent = 'Graph · Semantic · FTS5';
	searchResults.replaceChildren(searchMessage('Enter a query to search the layered knowledge base.'));
	vscode.postMessage({ type: 'search', query: '' });
	searchInput.focus();
}

function render(state) {
	renderSearch(state);
	const backend = state.backend;
	const neo4j = backend.neo4j?.ready ? 'Neo4j ready' : backend.neo4j?.configured ? 'Neo4j unavailable' : 'Neo4j not configured';
	const serviceMark = backend.available ? 'Connected' : backend.mode === 'service' ? 'Required' : 'Fallback active';
	document.getElementById('backend').innerHTML = backend.available
		? `<i class="ready"></i><span>Layered service online · ${escapeHtml(neo4j)}</span>`
		: `<i></i><span>${backend.mode === 'service' ? 'Service required but unavailable' : backend.mode === 'local' ? 'Local fallback selected' : 'Layered service unavailable'}</span>`;
	document.getElementById('serviceMode').textContent = backend.mode.toUpperCase();
	document.getElementById('serviceDetails').innerHTML = `
		<div class="service-state">
			<div><strong>${backend.available ? 'Online' : 'Unavailable'}</strong><span class="endpoint" title="${escapeHtml(backend.url)}">${escapeHtml(backend.url)}</span></div>
			<span class="service-mark ${backend.available ? 'online' : ''}">${serviceMark}</span>
		</div>
		<div class="service-metrics">
			<div><strong>${formatCount(backend.memory?.active)}</strong><span>Active knowledge</span></div>
			<div><strong>${formatCount(backend.memory?.continuity)}</strong><span>Continuity</span></div>
			<div><strong>${formatCount(backend.vectors?.total)}</strong><span>Service vectors</span></div>
			<div><strong>${backend.neo4j?.ready ? 'Ready' : backend.neo4j?.configured ? 'Error' : 'Off'}</strong><span>Neo4j</span></div>
		</div>`;
	syncService.disabled = !backend.available;
	syncService.title = backend.available ? 'Add or update local data in the layered service' : 'Layered service is unavailable';
	metrics.innerHTML = [
		['Sessions', state.stats.sessions],
		['Vectors', state.stats.vectors],
		['Knowledge', state.stats.nodes],
		['Relations', state.stats.edges],
	].map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('');
	document.getElementById('sessionTotal').textContent = `${state.stats.turns} turns`;
	sessions.innerHTML = state.sessions.length ? state.sessions.map((session) => `
		<article><strong>${escapeHtml(session.title)}</strong><span>${session.turnIds.length} turns · ${new Date(session.updatedAt).toLocaleDateString()}</span></article>`).join('') : '<p class="empty">No sessions yet.</p>';
	events.innerHTML = state.events.length ? state.events.map((event) => `
		<article class="event"><i></i><span>${escapeHtml(event.detail)}<small>${new Date(event.createdAt).toLocaleString()}</small></span></article>`).join('') : '<p class="empty">No organization activity yet.</p>';
}

document.getElementById('startChat').addEventListener('click', () => vscode.postMessage({ type: 'startChat' }));
document.getElementById('openDashboard').addEventListener('click', () => vscode.postMessage({ type: 'openDashboard' }));
document.getElementById('organizeSessions').addEventListener('click', () => vscode.postMessage({ type: 'organizeSessions' }));
syncService.addEventListener('click', () => vscode.postMessage({ type: 'syncService' }));
searchButton.addEventListener('click', submitSearch);
clearSearch.addEventListener('click', resetSearch);
searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') submitSearch(); });
searchInput.addEventListener('input', () => { clearSearch.hidden = !searchInput.value; });
document.addEventListener('keydown', (event) => {
	if (event.key === '/' && document.activeElement !== searchInput) {
		event.preventDefault();
		searchInput.focus();
	}
});
window.addEventListener('message', (event) => { if (event.data.type === 'state') render(event.data.state); });
window.setInterval(() => vscode.postMessage({ type: 'refresh' }), 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) vscode.postMessage({ type: 'refresh' }); });
vscode.postMessage({ type: 'ready' });