import { readFile, writeFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import { parseImportData } from './data-import';
import { organizeDocument } from './document-organizer';
import { DashboardStats, KnowledgeEdge, KnowledgeNode, KnowledgeSnapshot } from './model';
import { extractPdfDocument } from './pdf-documents';
import { connectServiceSearchResults, formatSearchConnection } from './search-connections';
import { KnowledgeServiceClient, ServiceHealth } from './service-client';
import { resolveWorkspaceIdentity } from './scope';
import { KnowledgeStore } from './store';
import { ValueMetrics, ValueUsageMetrics } from './value-metrics';
import { embed } from './vector';

interface DashboardSearchResult {
	sourceKind: string;
	source: string;
	score?: number;
	text: string;
}

interface DashboardState {
	stats: DashboardStats;
	snapshot: KnowledgeSnapshot;
	searchResults: DashboardSearchResult[];
	query: string;
	searchError: string;
	backend: ServiceHealth;
	usage: ValueUsageMetrics;
}

function nonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

export class DashboardPanel {
	private panel: vscode.WebviewPanel | undefined;
	private query = '';
	private pendingSearch = false;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly store: KnowledgeStore,
		private readonly service: KnowledgeServiceClient,
		private readonly valueMetrics: ValueMetrics,
	) {}

	async show(): Promise<void> {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.One);
			await this.refresh();
			return;
		}

		this.panel = vscode.window.createWebviewPanel(
			'contextRecall.dashboard',
			'OpenBMC 知识助手 Overview',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
			},
		);
		this.panel.webview.html = this.html(this.panel.webview);
		this.panel.onDidDispose(() => { this.panel = undefined; });
		this.panel.webview.onDidReceiveMessage(async (message: { type?: string; query?: string }) => {
			switch (message.type) {
				case 'ready':
				case 'refresh':
					await this.refresh();
					break;
				case 'search':
					this.query = message.query?.trim() ?? '';
					this.pendingSearch = Boolean(this.query);
					await this.refresh();
					break;
				case 'export':
					await this.exportData();
					break;
				case 'import':
					await this.importData();
					break;
				case 'importDocuments':
					await this.importDocuments();
					break;
				case 'syncService':
					await vscode.commands.executeCommand('contextRecall.syncService');
					await this.refresh();
					break;
				case 'startChat':
					await vscode.commands.executeCommand('contextRecall.startChat');
					break;
				case 'organizeSessions':
					await vscode.commands.executeCommand('contextRecall.organizeCopilotSessions');
					await this.refresh();
					break;
			}
		});
	}

	async refresh(): Promise<void> {
		if (!this.panel?.visible) {
			return;
		}
		const snapshot = this.store.getSnapshot();
		const localResults = this.query ? this.store.search(this.query, 12) : [];
		let serviceResults: Awaited<ReturnType<KnowledgeServiceClient['search']>>;
		let searchError = '';
		if (this.query) {
			try {
				const identity = resolveWorkspaceIdentity();
				serviceResults = await this.service.search(this.query, embed(this.query), { workspaceId: identity.canonicalId, sessionId: '', workspaceAliases: identity.aliases }, 12);
			} catch (error) {
				searchError = error instanceof Error ? error.message : String(error);
			}
		}
		const searchResults: DashboardSearchResult[] = [];
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
		const state: DashboardState = {
			stats: this.store.getStats(),
			snapshot,
			searchResults: searchResults.slice(0, 16),
			query: this.query,
			searchError,
			backend: await this.service.health(),
			usage: this.valueMetrics.get(),
		};
		await this.panel.webview.postMessage({ type: 'state', state });
	}

	private async exportData(): Promise<void> {
		const target = await vscode.window.showSaveDialog({
			title: 'Export OpenBMC 知识助手 Data',
			filters: { JSON: ['json'] },
			defaultUri: vscode.Uri.file('context-recall-export.json'),
		});
		if (!target) {
			return;
		}
		await writeFile(target.fsPath, JSON.stringify(this.store.getSnapshot(), null, 2), 'utf8');
		void vscode.window.showInformationMessage(`Knowledge data exported to ${target.fsPath}`);
	}

	private async importData(): Promise<void> {
		const selected = await vscode.window.showOpenDialog({
			title: 'Import OpenBMC 知识助手 Or Continuity Data',
			canSelectMany: false,
			filters: { 'Supported data': ['json', 'jsonl'], JSON: ['json'], 'JSON Lines': ['jsonl'] },
		});
		if (!selected?.[0]) {
			return;
		}
		try {
			const imported = parseImportData(await readFile(selected[0].fsPath, 'utf8'));
			if (imported.kind === 'snapshot') {
				await this.store.importSnapshot(imported.snapshot);
				void vscode.window.showInformationMessage('OpenBMC 知识助手 snapshot imported.');
			} else {
				const workspace = vscode.workspace.getWorkspaceFolder(selected[0]) ?? vscode.workspace.workspaceFolders?.[0];
				const result = await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: `OpenBMC 知识助手: importing ${imported.decisions.length} Continuity decisions`,
				}, () => this.service.importContinuity({
					decisions: imported.decisions,
					embeddings: imported.decisions.map((decision) => ({
						decisionId: decision.id,
						values: embed(`${decision.question} ${decision.answer ?? ''} ${(decision.tags ?? []).join(' ')}`),
					})),
					source: vscode.workspace.asRelativePath(selected[0], false),
					workspaceId: resolveWorkspaceIdentity().canonicalId,
					repoId: workspace?.name ?? '',
				}));
				void vscode.window.showInformationMessage(
					`Continuity import completed: ${Number(result.created ?? 0)} created, ${Number(result.updated ?? 0)} updated, ${Number(result.skipped ?? 0)} skipped.`,
				);
			}
			await this.refresh();
		} catch (error) {
			void vscode.window.showErrorMessage(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async importDocuments(): Promise<void> {
		const selected = await vscode.window.showOpenDialog({
			title: 'Upload PDF Evidence To OpenBMC 知识助手',
			canSelectMany: true,
			filters: { 'PDF documents': ['pdf'] },
		});
		if (!selected?.length) {
			return;
		}
		const workspace = vscode.workspace.getWorkspaceFolder(selected[0]) ?? vscode.workspace.workspaceFolders?.[0];
		try {
			const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			const totals = await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'OpenBMC 知识助手: importing PDF evidence',
				cancellable: true,
			}, async (progress, token) => {
				const totals = { documents: 0, chunks: 0, created: 0, updated: 0, skipped: 0, nodes: 0, edges: 0 };
				const organizedNodes: KnowledgeNode[] = [];
				const organizedEdges: KnowledgeEdge[] = [];
				for (const [index, uri] of selected.entries()) {
					const filename = uri.path.split('/').pop() ?? uri.fsPath;
					progress.report({ message: `Extracting ${filename}`, increment: index === 0 ? 0 : 100 / selected.length });
					await this.panel?.webview.postMessage({ type: 'documentImportStatus', status: 'working', message: `Extracting ${filename}` });
					const document = await extractPdfDocument(uri.fsPath);
					if (!document.chunks.length) {
						totals.skipped += 1;
						continue;
					}
					progress.report({ message: `Indexing ${filename}` });
					const result = await this.service.importDocuments({
						documents: [document],
						embeddings: document.chunks.map((chunk) => ({ chunkId: chunk.id, values: embed(chunk.text) })),
						workspaceId: resolveWorkspaceIdentity().canonicalId,
						repoId: workspace?.name ?? '',
					});
					totals.documents += Number(result.imported_documents ?? 0);
					totals.chunks += document.chunks.length;
					totals.created += Number(result.created ?? 0);
					totals.updated += Number(result.updated ?? 0);
					totals.skipped += Number(result.skipped ?? 0);
					if (!model || token.isCancellationRequested) {
						continue;
					}
					// Semantic layer: turn document evidence into reusable entities so later
					// documents can be linked to it and cross-document links can appear.
					const organization = await organizeDocument(model, document, token, (message) => progress.report({ message }));
					organizedNodes.push(...organization.nodes);
					organizedEdges.push(...organization.edges);
				}
				if (organizedNodes.length || organizedEdges.length) {
					await this.store.upsertKnowledge(organizedNodes, organizedEdges);
					totals.nodes = organizedNodes.length;
					totals.edges = organizedEdges.length;
					try {
						await this.service.sync(this.store.getSnapshot());
					} catch (error) {
						console.warn('Document knowledge was stored locally but not synced to the layered service.', error);
					}
				}
				return totals;
			});
			const message = `${totals.documents} documents, ${totals.chunks} chunks: ${totals.created} created, ${totals.updated} updated, ${totals.skipped} skipped; ${totals.nodes} entities and ${totals.edges} relationships extracted.`;
			await this.panel?.webview.postMessage({ type: 'documentImportStatus', status: 'complete', message });
			void vscode.window.showInformationMessage(`PDF import completed: ${message}`);
			await this.refresh();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.panel?.webview.postMessage({ type: 'documentImportStatus', status: 'error', message });
			void vscode.window.showErrorMessage(`PDF import failed: ${message}`);
		}
	}

	private html(webview: vscode.Webview): string {
		const token = nonce();
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'dashboard.css'));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'dashboard.js'));
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${token}';">
	<link rel="stylesheet" href="${styleUri}">
	<title>OpenBMC 知识助手 Overview</title>
</head>
<body>
	<header class="topbar">
		<div>
			<p class="eyebrow">OPENBMC 知识助手</p>
			<h1>Data Overview</h1>
		</div>
		<div class="topbar-controls">
			<div class="actions">
				<button id="importButton" class="secondary" type="button">Import data</button>
				<button id="exportButton" class="secondary" type="button">Export</button>
				<button id="syncButton" class="secondary" type="button">Sync service</button>
				<button id="refreshButton" type="button">Refresh</button>
			</div>
		</div>
	</header>

	<main>
		<section class="service-overview" aria-labelledby="serviceTitle">
			<div class="service-heading">
				<div><p class="eyebrow">LIVE BACKEND</p><h2 id="serviceTitle">Layered service</h2><span id="serviceEndpoint"></span></div>
				<div id="serviceStatus" class="service-status"></div>
			</div>
			<div id="serviceMetrics" class="service-metrics" aria-label="Layered service metrics"></div>
		</section>

		<section class="knowledge-hourglass" aria-labelledby="hourglassTitle">
			<div class="hourglass-copy">
				<p class="eyebrow">KNOWLEDGE MATURITY</p>
				<h2 id="hourglassTitle">From captured evidence to reusable knowledge</h2>
				<p>See how much knowledge currently rests at each lifecycle stage. Counts show inventory, not historical conversion.</p>
				<div class="maturity-summary">
					<strong id="maturityRate">—</strong>
					<span>of captured records are active and ready for default recall</span>
				</div>
			</div>
			<div class="hourglass-visual" aria-label="Knowledge maturity counts">
				<div class="hourglass-total"><span>Captured records</span><strong id="capturedCount">—</strong></div>
				<div class="hourglass-shell">
					<div class="hourglass-layer raw"><span>Raw evidence</span><strong id="rawCount">—</strong></div>
					<div class="hourglass-layer candidate"><span>Candidate knowledge</span><strong id="candidateCount">—</strong></div>
					<div class="hourglass-layer active"><span>Reusable knowledge</span><strong id="activeCount">—</strong></div>
				</div>
				<div class="hourglass-output"><span>Evidence-linked relations</span><strong id="relationCount">—</strong></div>
			</div>
		</section>

		<section class="document-upload" aria-labelledby="documentUploadTitle">
			<div>
				<p class="eyebrow">DOCUMENT EVIDENCE</p>
				<h2 id="documentUploadTitle">Upload PDF documents</h2>
				<p>Select one or more PDFs. Pages are extracted, chunked, indexed, and linked to their source document.</p>
			</div>
			<button id="documentUploadButton" type="button">Choose PDFs</button>
			<div id="documentImportStatus" class="document-import-status" aria-live="polite">Ready for PDF evidence</div>
		</section>

		<section class="local-overview" aria-labelledby="localTitle">
			<div class="overview-heading"><div><p class="eyebrow">LOCAL FALLBACK</p><h2 id="localTitle">Portable evidence snapshot</h2></div><span>Import, export, graph, and session detail</span></div>
			<div id="metrics" class="metrics" aria-label="Local knowledge metrics"></div>
		</section>

		<section class="pipeline" aria-label="Knowledge lifecycle">
			<div><span>01</span><strong>Evidence</strong><small>Immutable source</small></div>
			<i></i>
			<div><span>02</span><strong>Lifecycle</strong><small>Raw · candidate · active</small></div>
			<i></i>
			<div><span>03</span><strong>Recall</strong><small>FTS5 + vectors</small></div>
			<i></i>
			<div><span>04</span><strong>Relations</strong><small>Neo4j when configured</small></div>
		</section>

		<section class="systems" aria-labelledby="systemsTitle">
			<div class="overview-heading"><div><p class="eyebrow">STORAGE</p><h2 id="systemsTitle">Knowledge graph & databases</h2></div><span>Credentials are never displayed</span></div>
			<div id="dataSystems" class="system-grid"></div>
		</section>

		<section class="search-band">
			<div class="search-heading"><label for="searchInput">Search graph, semantic knowledge, FTS5, and local evidence</label><span id="searchSummary">Ready</span></div>
			<div class="search-row">
				<input id="searchInput" type="search" placeholder="Search decisions, concepts, tools, sessions...">
				<button id="searchButton" type="button">Search</button>
			</div>
			<button id="clearSearch" class="search-clear" type="button" hidden>Clear search</button>
			<div id="searchResults" class="search-results" role="status" aria-live="polite"></div>
		</section>

		<div class="dashboard-grid">
			<section class="panel graph-panel">
				<div class="panel-heading">
					<div><p class="eyebrow">STRUCTURE</p><h2>Knowledge Graph</h2></div>
					<select id="kindFilter" aria-label="Filter graph by knowledge kind"><option value="all">All kinds</option></select>
				</div>
				<div id="graph" class="graph" aria-label="Knowledge graph visualization"></div>
				<div id="graphLegend" class="legend"></div>
			</section>

			<section class="panel session-panel">
				<div class="panel-heading"><div><p class="eyebrow">EVIDENCE</p><h2>Recent Sessions</h2></div><span id="sessionCount"></span></div>
				<div id="sessions" class="sessions"></div>
			</section>

			<section class="panel distribution-panel">
				<div class="panel-heading"><div><p class="eyebrow">QUALITY</p><h2>Knowledge Distribution</h2></div></div>
				<div id="distribution" class="distribution"></div>
			</section>

			<section class="panel activity-panel">
				<div class="panel-heading"><div><p class="eyebrow">SYSTEM</p><h2>Organization Activity</h2></div></div>
				<div id="activity" class="activity"></div>
			</section>
		</div>
	</main>
	<script nonce="${token}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}