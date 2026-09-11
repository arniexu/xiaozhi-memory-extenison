import * as vscode from 'vscode';
import { PresentedSearchResult } from './search-presentation';

export interface SearchAnswer {
	text: string;
	sources: Array<{ number: number; title: string; sourceLabel: string; updatedAt?: string }>;
	error?: string;
}

export async function synthesizeSearchAnswer(query: string, evidence: PresentedSearchResult[]): Promise<SearchAnswer> {
	const sources = evidence.slice(0, 8).map((item, index) => ({
		number: index + 1,
		title: item.title,
		sourceLabel: item.sourceLabel,
		updatedAt: item.updatedAt,
	}));
	if (!evidence.length) {
		return { text: 'There is not enough historical evidence to answer this question. Try a more specific keyword.', sources: [] };
	}

	const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot' });
	if (!model) {
		return { text: '', sources, error: 'No Copilot model is currently available to synthesize the search results.' };
	}
	const evidenceText = evidence.slice(0, 8).map((item, index) =>
		`[${index + 1}] Title: ${item.title}\nContent: ${item.answer}\nSource: ${item.sourceLabel}\nEvidence count: ${item.evidenceCount}`,
	).join('\n\n');
	const prompt = `You are Context Recall, a rigorous context retrieval assistant. Answer the user's question using the retrieved evidence below.

Requirements:
- Use only the supplied evidence. Do not add external knowledge or speculate.
- Write one concise, natural paragraph without a list.
- Cite each fact or conclusion with its source number, such as [1] or [1][2].
- Explicitly identify conflicting evidence. When evidence is insufficient, say "The available records are insufficient to confirm this."
- Do not include a heading, preamble, Markdown code block, or separate source list.

User question: ${query}

Retrieved evidence:
${evidenceText}`;

	const cancellation = new vscode.CancellationTokenSource();
	try {
		const response = await model.sendRequest(
			[vscode.LanguageModelChatMessage.User(prompt)],
			{},
			cancellation.token,
		);
		let text = '';
		for await (const fragment of response.text) {
			text += fragment;
		}
		const answer = text.trim();
		const citedAnswer = answer && !/\[\d+\]/.test(answer)
			? `${answer} ${sources.map((source) => `[${source.number}]`).join('')}`
			: answer;
		return citedAnswer
			? { text: citedAnswer, sources }
			: { text: '', sources, error: 'The model returned no synthesized result. Try again later.' };
	} catch (error) {
		return {
			text: '',
			sources,
			error: `Synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	} finally {
		cancellation.dispose();
	}
}