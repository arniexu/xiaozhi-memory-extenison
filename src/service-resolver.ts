import { networkInterfaces } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 服务地址解析：显式配置优先，其次回环地址，再次本机各网卡的 IPv4。
 *
 * 动机（2026-09-11 实测）：分层服务常常绑定在**某个具体网卡地址**上
 * （如 10.112.229.254:8765），而非回环地址。此时扩展里写死的
 * `http://127.0.0.1:8765` 永远连不上，`backend=auto` 又会静默降级到本地存储，
 * 于是"分层服务"看起来在工作、实际从未被使用。
 *
 * 解析结果会写到 `<globalStorage>/service-resolution.json`，用于回答
 * "为什么没走服务"这类问题。
 */

export interface ServiceResolution {
	/** 最终选定的服务地址 */
	url: string;
	/** 配置里给出的地址（可能为空或不可达） */
	configured: string;
	/** configured=按配置直接可达；probe=探测到其它候选；unreachable=全部不可达 */
	source: 'configured' | 'probe' | 'unreachable';
	/** 实际探测过的候选地址，按顺序 */
	candidates: string[];
	probedAt: string;
}

export const DEFAULT_SERVICE_PORT = '8765';
const CACHE_MS = 60_000;
const PROBE_TIMEOUT_MS = 800;

let cached: { resolution: ServiceResolution; at: number } | undefined;

/** 构造候选地址：显式配置 → 回环 → 本机各网卡 IPv4（跳过 internal）。 */
export function candidateServiceUrls(configured: string, port = DEFAULT_SERVICE_PORT): string[] {
	const candidates: string[] = [];
	const push = (url: string): void => {
		if (url && !candidates.includes(url)) {
			candidates.push(url);
		}
	};
	push(configured);
	push(`http://127.0.0.1:${port}`);
	for (const addresses of Object.values(networkInterfaces())) {
		for (const address of addresses ?? []) {
			if (address.family === 'IPv4' && !address.internal) {
				push(`http://${address.address}:${port}`);
			}
		}
	}
	return candidates;
}

async function reachable(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(new URL('/health', url), { signal: controller.signal });
			return response.ok;
		} finally {
			clearTimeout(timer);
		}
	} catch {
		return false;
	}
}

/** 逐个探测候选地址，返回第一个可达的。 */
export async function resolveServiceUrl(configured: string, port = DEFAULT_SERVICE_PORT): Promise<ServiceResolution> {
	const candidates = candidateServiceUrls(configured, port);
	for (const url of candidates) {
		if (await reachable(url)) {
			return {
				url,
				configured,
				source: url === configured ? 'configured' : 'probe',
				candidates,
				probedAt: new Date().toISOString(),
			};
		}
	}
	return { url: configured, configured, source: 'unreachable', candidates, probedAt: new Date().toISOString() };
}

/** 带缓存的解析，避免每次检索都做一轮探测。 */
export async function resolveServiceUrlCached(configured: string, port = DEFAULT_SERVICE_PORT): Promise<ServiceResolution> {
	if (cached && Date.now() - cached.at < CACHE_MS) {
		return cached.resolution;
	}
	const resolution = await resolveServiceUrl(configured, port);
	cached = { resolution, at: Date.now() };
	return resolution;
}

export function resetServiceResolutionCache(): void {
	cached = undefined;
}

/** 把解析结果落盘，便于排查"为什么没走服务"。失败不影响主流程。 */
export async function recordServiceResolution(storageDirectory: string, resolution: ServiceResolution): Promise<void> {
	try {
		await writeFile(
			join(storageDirectory, 'service-resolution.json'),
			`${JSON.stringify(resolution, null, 2)}\n`,
			'utf8',
		);
	} catch {
		// 记录失败不应影响扩展主流程
	}
}
