export interface CopilotSession {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	transcript: string;
	workspaceId: string;
}

interface TranscriptEvent {
	type?: string;
	timestamp?: string;
	data?: { sessionId?: string; startTime?: string; content?: string };
}

const MAX_TRANSCRIPT_CHARACTERS = 24_000;

export function redact(text: string): string {
	return text
		.replace(/\b(authorization\s*:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
		.replace(/\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|passphrase|secret)\b(\s*[=:]\s*)[^\s,;]+/gi, '$1$2[REDACTED]')
		.replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]');
}

function compact(text: string): string {
	if (text.length <= MAX_TRANSCRIPT_CHARACTERS) {
		return text;
	}
	const half = Math.floor((MAX_TRANSCRIPT_CHARACTERS - 80) / 2);
	return `${text.slice(0, half)}\n\n[... middle of transcript omitted ...]\n\n${text.slice(-half)}`;
}

export function parseTranscript(content: string, workspaceId: string, fallbackSessionId = ''): CopilotSession | undefined {
	let sessionId = fallbackSessionId;
	let createdAt = '';
	let updatedAt = '';
	const messages: Array<{ role: 'USER' | 'ASSISTANT'; text: string }> = [];
	for (const line of content.split(/\r?\n/)) {
		if (!line.trim()) {
			continue;
		}
		let event: TranscriptEvent;
		try {
			event = JSON.parse(line) as TranscriptEvent;
		} catch {
			continue;
		}
		if (event.type === 'session.start') {
			sessionId = event.data?.sessionId ?? sessionId;
			createdAt = event.data?.startTime ?? event.timestamp ?? createdAt;
		}
		const role = event.type === 'user.message' ? 'USER' : event.type === 'assistant.message' ? 'ASSISTANT' : undefined;
		const text = event.data?.content?.trim();
		if (role && text) {
			const redacted = redact(text);
			const previous = messages.at(-1);
			if (previous?.role !== role || previous.text !== redacted) {
				messages.push({ role, text: redacted });
			}
		}
		if (event.timestamp && event.timestamp > updatedAt) {
			updatedAt = event.timestamp;
		}
	}
	if (!sessionId || !messages.length) {
		return undefined;
	}
	const firstUser = messages.find((message) => message.role === 'USER')?.text ?? 'Imported Copilot session';
	const title = firstUser.replace(/\s+/g, ' ').slice(0, 72);
	return {
		id: `copilot:${sessionId}`,
		title,
		createdAt: createdAt || updatedAt || new Date().toISOString(),
		updatedAt: updatedAt || createdAt || new Date().toISOString(),
		transcript: compact(messages.map((message) => `${message.role}:\n${message.text}`).join('\n\n')),
		workspaceId,
	};
}