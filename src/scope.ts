import { createHash } from 'node:crypto';
import * as vscode from 'vscode';

/**
 * 工作区身份的唯一来源。
 *
 * 与 knowledge-agent-service 的 `scope.py` 是同一套规则：服务端历史上同时存在
 * `sha256(文件夹URI)[:20]`（聊天/MCP 路径）与 `file://` URI 原文（文档/Continuity 导入路径）
 * 两种 scope，检索时按字符串精确过滤，导致每次只看得见自己写的那一半。
 * 这里产出一个规范键 + 全部可能被写入过的别名，读路径按别名集合匹配。
 */
export interface WorkspaceIdentity {
	canonicalId: string;
	aliases: string[];
}

export function digestWorkspaceId(value: string): string {
	return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

export function canonicalWorkspaceId(...folders: string[]): string {
	const roots = [...folders].sort();
	return digestWorkspaceId(roots.length ? roots.join('|') : 'empty-workspace');
}

export function workspaceAliases(...values: string[]): string[] {
	const aliases: string[] = [];
	for (const value of values) {
		const text = (value ?? '').trim();
		if (!text) {
			continue;
		}
		const path = text.replace(/^file:\/\//, '').replace(/\/+$/, '');
		const base = path.split('/').filter(Boolean).pop() ?? '';
		for (const candidate of [text, text.replace(/\/+$/, ''), path, base]) {
			for (const item of [candidate, candidate ? digestWorkspaceId(candidate) : '']) {
				if (item && !aliases.includes(item)) {
					aliases.push(item);
				}
			}
		}
	}
	return aliases;
}

export function workspaceFolderUris(): string[] {
	return vscode.workspace.workspaceFolders?.map((folder) => folder.uri.toString()) ?? [];
}

export function resolveWorkspaceIdentity(): WorkspaceIdentity {
	const roots = workspaceFolderUris();
	return {
		canonicalId: canonicalWorkspaceId(...roots),
		aliases: workspaceAliases(...roots),
	};
}
