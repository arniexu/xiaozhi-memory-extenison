import * as vscode from 'vscode';
import { connectServiceSearchResults, formatSearchConnection } from './search-connections';
import { KnowledgeServiceClient } from './service-client';
import { KnowledgeStore } from './store';
import { ValueMetrics } from './value-metrics';
import { embed } from './vector';

interface SidebarSearchResult {
	sourceKind: string;
	source: string;
	score?: number;
	text: string;
}

function nonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

export class SidebarProvider implements vscode.WebviewViewProvider {
	private view: vscode.WebviewView | undefined;
	private query = '';
	private pendingSearch = false;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly store: KnowledgeStore,
		private readonly service: KnowledgeServiceClient,
		private readonly valueMetrics: ValueMetrics,
	) {}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
		};
		view.webview.html = this.html(view.webview);
		view.webview.onDidReceiveMessage(async (message: { type?: string; query?: string }) => {
			switch (message.type) {
				case 'startChat':
					await vscode.commands.executeCommand('contextRecall.startChat');
					break;
				case 'openDashboard':
					await vscode.commands.executeCommand('contextRecall.openDashboard');
					break;
				case 'organizeSessions':
					await vscode.commands.executeCommand('contextRecall.organizeCopilotSessions');
					break;
				case 'syncService':
					await vscode.commands.executeCommand('contextRecall.syncService');
					break;
				case 'search':
					this.query = message.query?.trim() ?? '';
					this.pendingSearch = Boolean(this.query);
					await this.refresh();
					break;
				case 'ready':
				case 'refresh':
					await this.refresh();
					break;
			}
		});
	}

	async refresh(): Promise<void> {
		if (!this.view?.visible) {
			return;
		}
		const snapshot = this.store.getSnapshot();
		const query = this.query;
		const localResults = query ? this.store.search(query, 8) : [];
		let serviceResults: Awaited<ReturnType<KnowledgeServiceClient['search']>>;
		let searchError = '';
		if (query) {
			try {
				serviceResults = await this.service.search(query, embed(query), { workspaceId: '', sessionId: '' }, 8);
			} catch (error) {
				searchError = error instanceof Error ? error.message : String(error);
			}
		}
		const searchResults: SidebarSearchResult[] = [];
		for (const result of serviceResults ?? []) {
			searchResults.push({
				sourceKind: result.type,
				source: result.source ?? 'service',
				text: `${result.summary}: ${result.resolution}`,
			});
		}
		for (const connection of connectServiceSearchResults(serviceResults ?? [])) {
			searchResults.push({
				sourceKind: 'relationship',
				source: connection.source,
				text: formatSearchConnection(connection),
			});
		}
		for (const result of localResults) {
			if (!searchResults.some((item) => item.text === result.text)) {
				searchResults.push({ ...result, source: 'local' });
			}
		}
		if (this.pendingSearch) {
			await this.valueMetrics.recordSearch(searchResults.length > 0);
			this.pendingSearch = false;
		}
		const backend = await this.service.health();
		await this.view.webview.postMessage({
			type: 'state',
			state: {
				stats: this.store.getStats(),
				query,
				searchResults,
				searchError,
				sessions: [...snapshot.sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 6),
				events: snapshot.events.slice(0, 6),
				backend,
				usage: this.valueMetrics.get(),
			},
		});
	}

	private html(webview: vscode.Webview): string {
		const token = nonce();
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.css'));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.js'));
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${token}';">
	<link rel="stylesheet" href="${styleUri}">
	<title>Context Recall</title>
</head>
<body>
	<header>
		<span>CONTEXT RECALL</span><h1>Layered intelligence</h1><div id="backend" class="backend"></div>
	</header>
	<section class="search-section" aria-labelledby="searchTitle">
		<div class="section-title"><h2 id="searchTitle">Search knowledge</h2><span id="searchSummary">Graph · Semantic · FTS5</span></div>
		<div class="search-row">
			<input id="searchInput" type="search" placeholder="Search decisions, tools, sessions..." aria-label="Search knowledge">
			<button id="searchButton" type="button">Search</button>
		</div>
		<button id="clearSearch" class="tertiary" type="button" hidden>Clear search</button>
		<div id="searchResults" class="search-results" role="status" aria-live="polite"><p class="search-empty">Enter a query to search the layered knowledge base.</p></div>
	</section>
	<div class="actions">
		<button id="startChat" type="button">Start chat</button>
		<button id="openDashboard" class="secondary" type="button">Open overview</button>
	</div>
	<button id="organizeSessions" class="organize" type="button">Organize Copilot sessions</button>
	<button id="syncService" class="organize" type="button">Sync local data to layered service</button>
	<section><div class="section-title"><h2>Recent sessions</h2><span id="sessionTotal"></span></div><div id="sessions"></div></section>
	<details>
		<summary>Storage and service details</summary>
		<section class="service-section" aria-labelledby="serviceTitle">
			<div class="section-title"><h2 id="serviceTitle">Layered service</h2><span id="serviceMode"></span></div>
			<div id="serviceDetails"></div>
		</section>
		<section aria-labelledby="localTitle">
			<div class="section-title"><h2 id="localTitle">Local fallback</h2><span>Portable snapshot</span></div>
			<div id="metrics" class="metrics" aria-label="Local knowledge metrics"></div>
		</section>
	</details>
	<details>
		<summary>Recent activity</summary>
		<div id="events"></div>
	</details>
	<script nonce="${token}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}