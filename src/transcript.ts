import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as vscode from 'vscode';
import { KnowledgeNode, SessionRecord, TurnRecord } from './model';
import { organizeSession } from './organizer';
import { KnowledgeStore } from './store';
import { CopilotSession, parseTranscript } from './transcript-parser';

function stableId(prefix: string, value: string): string {
	return `${prefix}:${createHash('sha256').update(value).digest('hex').slice(0, 20)}`;
}

export async function discoverCopilotSessions(globalStoragePath: string): Promise<CopilotSession[]> {
	const workspaceStorage = join(dirname(dirname(globalStoragePath)), 'workspaceStorage');
	const sessions = new Map<string, CopilotSession>();
	for (const workspace of await readdir(workspaceStorage, { withFileTypes: true })) {
		if (!workspace.isDirectory()) {
			continue;
		}
		const transcriptDirectory = join(workspaceStorage, workspace.name, 'GitHub.copilot-chat', 'transcripts');
		let files;
		try {
			files = await readdir(transcriptDirectory, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const file of files) {
			if (!file.isFile() || !file.name.endsWith('.jsonl')) {
				continue;
			}
			const fallbackSessionId = file.name.slice(0, -'.jsonl'.length);
			const parsed = parseTranscript(await readFile(join(transcriptDirectory, file.name), 'utf8'), workspace.name, fallbackSessionId);
			const existing = parsed && sessions.get(parsed.id);
			if (parsed && (!existing || parsed.transcript.length > existing.transcript.length)) {
				sessions.set(parsed.id, parsed);
			}
		}
	}
	return [...sessions.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function summaryNode(session: CopilotSession, summary: string, evidenceTurnIds: string[]): KnowledgeNode {
	const timestamp = new Date().toISOString();
	return {
		id: stableId('knowledge', `session-summary|${session.id}`),
		kind: 'workflow',
		label: `Session: ${session.title}`,
		summary,
		status: 'active',
		confidence: 'medium',
		evidenceTurnIds,
		tags: ['session-summary', 'copilot-import'],
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}

export async function organizeCopilotHistory(
	globalStoragePath: string,
	store: KnowledgeStore,
	model: vscode.LanguageModelChat,
	progress: vscode.Progress<{ message?: string; increment?: number }>,
	token: vscode.CancellationToken,
): Promise<{ discovered: number; organized: number; failed: number; cancelled: boolean }> {
	const sessions = await discoverCopilotSessions(globalStoragePath);
	const pending = sessions.filter((session) => !store.isSessionOrganized(session.id));
	let organized = 0;
	let failed = 0;
	for (const session of pending) {
		if (token.isCancellationRequested) {
			break;
		}
		progress.report({ message: `${organized + failed + 1}/${pending.length}: ${session.title}` });
		try {
			const sourceTurn: TurnRecord = {
				id: stableId('turn', `${session.id}|transcript`),
				sessionId: session.id,
				role: 'user',
				text: session.transcript,
				createdAt: session.createdAt,
			};
			const record: SessionRecord = {
				id: session.id,
				title: session.title,
				workspaceId: session.workspaceId,
				createdAt: session.createdAt,
				updatedAt: session.updatedAt,
				turnIds: [sourceTurn.id],
			};
			await store.importSessionEvidence(record, sourceTurn);
			const result = await organizeSession(model, session.title, session.transcript, [sourceTurn.id], token);
			if (!result.summary) {
				throw new Error('The selected model returned no session summary');
			}
			const summaryTurn = await store.importSessionEvidence(record, {
				id: stableId('turn', `${session.id}|summary`),
				sessionId: session.id,
				role: 'assistant',
				text: result.summary,
				createdAt: new Date().toISOString(),
			});
			const evidenceTurnIds = [sourceTurn.id, summaryTurn.id];
			const nodes = result.nodes.map((node) => ({ ...node, evidenceTurnIds }));
			await store.upsertKnowledge([summaryNode(session, result.summary, evidenceTurnIds), ...nodes], result.edges);
			await store.markSessionOrganized(session.id);
			organized += 1;
		} catch (error) {
			failed += 1;
			console.warn(`Failed to organize Copilot session ${session.id}`, error);
		}
		progress.report({ increment: pending.length ? 100 / pending.length : 100 });
	}
	return { discovered: sessions.length, organized, failed, cancelled: token.isCancellationRequested };
}