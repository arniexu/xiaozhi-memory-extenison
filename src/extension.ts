import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { DashboardPanel } from './dashboard';
import { organizeConversation } from './organizer';
import { formatConnectedSearchContext } from './search-connections';
import { resolveSessionContext } from './session-context';
import { getKnowledgeServiceConfiguration, KnowledgeServiceClient } from './service-client';
import { recordServiceResolution, resolveServiceUrl } from './service-resolver';
import { resolveWorkspaceIdentity } from './scope';
import { SidebarProvider } from './sidebar';
import { KnowledgeStore } from './store';
import { organizeCopilotHistory } from './transcript';
import { ValueMetrics } from './value-metrics';
import { embed } from './vector';

const PARTICIPANT_ID = 'contextRecall.chat';
const MCP_PROVIDER_ID = 'contextRecall.mcpServers';

/**
 * 命名迁移（v0.3.6 单名制）：`contextRecall.*` 是唯一对外 id。
 * 旧 `knowledgeAgent.*` 只注册为兼容别名，且不再出现在 contributes.commands，
 * 因此命令面板不会出现重复项；待迁移完成后可直接删掉别名注册。
 */
function registerRenamedCommand(id: string, handler: (...args: any[]) => any): vscode.Disposable {
	const legacyId = id.replace(/^contextRecall\./, 'knowledgeAgent.');
	return vscode.Disposable.from(
		vscode.commands.registerCommand(id, handler),
		vscode.commands.registerCommand(legacyId, handler),
	);
}

function workspaceId(): string {
	return resolveWorkspaceIdentity().canonicalId;
}

function sessionId(chatContext: vscode.ChatContext): string {
	for (const turn of [...chatContext.history].reverse()) {
		if (turn instanceof vscode.ChatResponseTurn) {
			const previous = turn.result.metadata?.sessionId;
			if (typeof previous === 'string' && previous) {
				return previous;
			}
		}
	}
	return randomUUID();
}

async function memoryContext(service: KnowledgeServiceClient, store: KnowledgeStore, currentSessionId: string, query: string): Promise<string> {
	const identity = resolveWorkspaceIdentity();
	const serviceResults = await service.search(query, embed(query), { workspaceId: identity.canonicalId, sessionId: currentSessionId, workspaceAliases: identity.aliases }, 6);
	if (serviceResults) {
		return serviceResults.length
			? formatConnectedSearchContext(serviceResults)
			: 'The layered service found no relevant active knowledge.';
	}
	const results = store.search(query, 6);
	if (!results.length) {
		return 'No relevant stored knowledge was found.';
	}
	return results.map((result, index) => `${index + 1}. [${result.sourceKind}, score=${result.score.toFixed(3)}] ${result.text}`).join('\n');
}

async function modelMessages(service: KnowledgeServiceClient, store: KnowledgeStore, currentSessionId: string, query: string, retrievalQuery: string): Promise<vscode.LanguageModelChatMessage[]> {
	const sessionContext = store.getSessionContext(currentSessionId);
	const instructions = `You are OpenBMC 知识助手, a persistent technical collaborator inside VS Code.
Answer the user directly and distinguish stored evidence from inference. Use the retrieved context only when relevant. Treat VERIFIED CONNECTIONS as explicit graph or shared-evidence relationships; do not invent causal links between otherwise separate items. Never claim that retrieved context is automatically verified.

WORKING SESSION CONTEXT:
${JSON.stringify(sessionContext ?? null)}

RETRIEVAL QUERY:
${retrievalQuery}

RETRIEVED CONTEXT:
${await memoryContext(service, store, currentSessionId, retrievalQuery)}`;
	const messages = [vscode.LanguageModelChatMessage.User(instructions)];
	for (const turn of store.getSessionTurns(currentSessionId, 14).slice(0, -1)) {
		messages.push(turn.role === 'user'
			? vscode.LanguageModelChatMessage.User(turn.text)
			: vscode.LanguageModelChatMessage.Assistant(turn.text));
	}
	messages.push(vscode.LanguageModelChatMessage.User(query));
	return messages;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const store = new KnowledgeStore(context.globalStorageUri.fsPath);
	await store.initialize();
	const service = new KnowledgeServiceClient();
	const valueMetrics = new ValueMetrics(context.globalState);
	const dashboard = new DashboardPanel(context.extensionUri, store, service, valueMetrics);
	const sidebar = new SidebarProvider(context.extensionUri, store, service, valueMetrics);
	const mcpDefinitionsChanged = new vscode.EventEmitter<void>();
	const mcpProvider = vscode.lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, {
		onDidChangeMcpServerDefinitions: mcpDefinitionsChanged.event,
		provideMcpServerDefinitions: async () => {
			const configuration = getKnowledgeServiceConfiguration();
			// 服务可能只监听某个具体网卡地址；配置不可达时探测候选地址，并落盘便于排查。
			const resolution = await resolveServiceUrl(configuration.url);
			await recordServiceResolution(context.globalStorageUri.fsPath, resolution);
			console.info(`OpenBMC 知识助手 MCP definition requested (backend=${configuration.mode}, service=${resolution.url}, source=${resolution.source}).`);
			const definition = new vscode.McpStdioServerDefinition(
				'OpenBMC 知识助手',
				process.execPath,
				[vscode.Uri.joinPath(context.extensionUri, 'dist', 'mcp-server.js').fsPath],
				{
					ELECTRON_RUN_AS_NODE: '1',
					CONTEXT_RECALL_BACKEND: configuration.mode,
					CONTEXT_RECALL_SERVICE_URL: resolution.url,
					CONTEXT_RECALL_SNAPSHOT: vscode.Uri.joinPath(context.globalStorageUri, 'context-recall.json').fsPath,
					CONTEXT_RECALL_WORKSPACE_ID: workspaceId(),
					CONTEXT_RECALL_WORKSPACE_ALIASES: resolveWorkspaceIdentity().aliases.join(','),
				},
				String(context.extension.packageJSON.version),
			);
			definition.cwd = context.extensionUri;
			return [definition];
		},
	});
	console.info(`OpenBMC 知识助手 MCP provider registered: ${MCP_PROVIDER_ID}`);
	const mcpConfigurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('contextRecall.backend') || event.affectsConfiguration('contextRecall.serviceUrl')
			|| event.affectsConfiguration('knowledgeAgent.backend') || event.affectsConfiguration('knowledgeAgent.serviceUrl')) {
			mcpDefinitionsChanged.fire();
		}
	});
	const mcpWorkspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => mcpDefinitionsChanged.fire());

	const startChat = registerRenamedCommand('contextRecall.startChat', async () => {
		await vscode.commands.executeCommand('workbench.action.chat.open', {
			query: '@openbmc ',
			isPartialQuery: true,
		});
	});
	const openDashboard = registerRenamedCommand('contextRecall.openDashboard', async () => dashboard.show());
	const refreshSidebar = registerRenamedCommand('contextRecall.refreshSidebar', async () => sidebar.refresh());
	const syncService = registerRenamedCommand('contextRecall.syncService', async () => {
		try {
			const result = await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'OpenBMC 知识助手: syncing layered context',
			}, () => service.sync(store.getSnapshot()));
			await sidebar.refresh();
			void vscode.window.showInformationMessage(`OpenBMC 知识助手 layered sync completed: ${JSON.stringify(result)}`);
		} catch (error) {
			void vscode.window.showErrorMessage(`OpenBMC 知识助手 sync failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	});
	const organizeSessions = registerRenamedCommand('contextRecall.organizeCopilotSessions', async () => {
		try {
			const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			if (!model) {
				void vscode.window.showErrorMessage('OpenBMC 知识助手 could not find an available Copilot language model.');
				return;
			}
			const result = await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'OpenBMC 知识助手: organizing Copilot sessions',
				cancellable: true,
			}, (progress, token) => organizeCopilotHistory(context.globalStorageUri.fsPath, store, model, progress, token));
			await dashboard.refresh();
			await sidebar.refresh();
			const status = result.cancelled ? 'stopped' : 'finished';
			void vscode.window.showInformationMessage(
				`OpenBMC 知识助手 ${status}: ${result.organized} organized, ${result.failed} failed, ${result.discovered} discovered.`,
			);
		} catch (error) {
			void vscode.window.showErrorMessage(`OpenBMC 知识助手 could not organize sessions: ${error instanceof Error ? error.message : String(error)}`);
		}
	});
	const sidebarRegistration = vscode.window.registerWebviewViewProvider('contextRecall.sidebar', sidebar);
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBar.name = 'OpenBMC 知识助手';
	statusBar.text = '$(database) OpenBMC 知识助手';
	statusBar.tooltip = 'Start a sticky OpenBMC 知识助手 chat';
	statusBar.command = 'contextRecall.startChat';
	statusBar.show();
	const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, async (request, chatContext, stream, token) => {
		if (request.command === 'overview') {
			await dashboard.show();
			stream.markdown('Opened the OpenBMC 知识助手 data overview.');
			return { metadata: { sessionId: sessionId(chatContext) } };
		}

		const currentSessionId = sessionId(chatContext);
		await store.ensureSession(currentSessionId, workspaceId(), request.prompt);
		const userTurn = await store.recordTurn(currentSessionId, 'user', request.prompt);
		const contextResolution = await resolveSessionContext(
			request.model,
			store.getSessionContext(currentSessionId),
			store.getSessionTurns(currentSessionId, 12),
			request.prompt,
			token,
		);
		await store.updateSessionContext(currentSessionId, contextResolution.context);

		let assistantText = '';
		try {
			const response = await request.model.sendRequest(await modelMessages(service, store, currentSessionId, request.prompt, contextResolution.rewrittenQuery), {}, token);
			for await (const fragment of response.text) {
				assistantText += fragment;
				stream.markdown(fragment);
			}
		} catch (error) {
			return {
				errorDetails: { message: error instanceof Error ? error.message : String(error) },
				metadata: { sessionId: currentSessionId },
			};
		}

		const assistantTurn = await store.recordTurn(currentSessionId, 'assistant', assistantText);
		stream.progress('Organizing durable knowledge from this exchange...');
		try {
			const organized = await organizeConversation(
				request.model,
				request.prompt,
				assistantText,
				[userTurn.id, assistantTurn.id],
				contextResolution.context,
				token,
			);
			await store.updateSessionContext(currentSessionId, organized.sessionContext);
			if (organized.nodes.length || organized.edges.length) {
				await store.upsertKnowledge(organized.nodes, organized.edges);
			}
		} catch (error) {
			console.warn('Knowledge organization failed; raw session and vectors were preserved.', error);
		}
		await dashboard.refresh();
		await sidebar.refresh();
		stream.button({ command: 'contextRecall.openDashboard', title: 'Open Data Overview' });
		return { metadata: { sessionId: currentSessionId } };
	});
	participant.iconPath = new vscode.ThemeIcon('database');
	participant.followupProvider = {
		provideFollowups: (result) => {
			const metadata = result.metadata as { sessionId?: unknown } | undefined;
			const contextSessionId = typeof metadata?.sessionId === 'string' ? metadata.sessionId : '';
			const sessionContext = contextSessionId ? store.getSessionContext(contextSessionId) : undefined;
			const contextual = [
				...(sessionContext?.openIssues.slice(0, 2).map((issue) => ({ prompt: issue, label: `Investigate: ${issue}` })) ?? []),
				...(sessionContext?.nextSteps.slice(0, 2).map((step) => ({ prompt: step, label: `Next: ${step}` })) ?? []),
			].slice(0, 3);
			return contextual.length ? contextual : [
				{ prompt: 'Summarize what you have learned in this session.', label: 'Summarize this session' },
				{ prompt: 'Which stored claims are uncertain or contested?', label: 'Review uncertain knowledge' },
			];
		},
	};

	context.subscriptions.push(
		startChat,
		openDashboard,
		refreshSidebar,
		syncService,
		organizeSessions,
		sidebarRegistration,
		statusBar,
		participant,
		mcpProvider,
		mcpDefinitionsChanged,
		mcpConfigurationListener,
		mcpWorkspaceListener,
	);
}

export function deactivate() {}
