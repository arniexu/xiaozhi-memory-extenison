import * as vscode from 'vscode';

const SEARCH_COUNT_KEY = 'valueMetrics.searchCount';
const SUCCESSFUL_SEARCH_COUNT_KEY = 'valueMetrics.successfulSearchCount';

export interface ValueUsageMetrics {
	searchCount: number;
	successfulSearchCount: number;
}

export class ValueMetrics {
	constructor(private readonly state: vscode.Memento) {}

	get(): ValueUsageMetrics {
		return {
			searchCount: this.state.get<number>(SEARCH_COUNT_KEY, 0),
			successfulSearchCount: this.state.get<number>(SUCCESSFUL_SEARCH_COUNT_KEY, 0),
		};
	}

	async recordSearch(foundResults: boolean): Promise<void> {
		const current = this.get();
		await this.state.update(SEARCH_COUNT_KEY, current.searchCount + 1);
		if (foundResults) {
			await this.state.update(SUCCESSFUL_SEARCH_COUNT_KEY, current.successfulSearchCount + 1);
		}
	}
}
