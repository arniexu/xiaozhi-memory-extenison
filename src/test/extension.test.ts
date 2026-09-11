import * as assert from 'assert';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseImportData } from '../data-import';
import { KnowledgeNode } from '../model';
import { chunkPage } from '../pdf-documents';
import { buildPageText } from '../pdf-layout';
import { KnowledgeStore } from '../store';
import { parseTranscript } from '../transcript-parser';
import { rankRetrievalResults } from '../retrieval';
import { connectServiceSearchResults, formatConnectedSearchContext } from '../search-connections';
import { presentSearchResults } from '../search-presentation';
import { rankServiceSearchResults } from '../service-client';
import { fallbackContextResolution, normalizeSessionContext } from '../session-context';
import { cosineSimilarity, embed } from '../vector';

suite('Extension Test Suite', () => {
	test('document chunks preserve page identity and stable overlap', () => {
		const text = `${'register field. '.repeat(140)}final value`;
		const chunks = chunkPage('document:abc', 7, text);

		assert.ok(chunks.length > 1);
		assert.strictEqual(chunks[0].id, 'document:abc:page:7:chunk:0');
		assert.strictEqual(chunks[0].page, 7);
		assert.ok(chunks.every((chunk) => chunk.text.length <= 900));
		assert.ok(chunks.every((chunk) => chunk.contentHash.length === 64));
	});

	test('document chunks prefer Chinese sentence and paragraph boundaries', () => {
		const sentences = Array.from({ length: 80 }, (_, index) => `第${index + 1}项说明包含寄存器、状态位和恢复条件。`);
		const chunks = chunkPage('document:cn', 3, `${sentences.slice(0, 40).join('')}\n\n${sentences.slice(40).join('')}`);

		assert.ok(chunks.length > 1);
		assert.ok(chunks.slice(0, -1).every((chunk) => /[。！？；.!?]$/u.test(chunk.text)));
		assert.ok(chunks.every((chunk) => chunk.text.length <= 900));
		assert.ok(chunks[1].text.includes('寄存器'));
	});

	test('page layout rebuilds table rows from coordinates', () => {
		const text = buildPageText([
			{ str: 'Offset', transform: [1, 0, 0, 1, 65, 725], width: 30 },
			{ str: 'Register', transform: [1, 0, 0, 1, 137, 725], width: 41 },
			{ str: '7:6', transform: [1, 0, 0, 1, 217, 709], width: 14 },
			{ str: 'RO', transform: [1, 0, 0, 1, 254, 709], width: 15 },
			{ str: 'Reserved', transform: [1, 0, 0, 1, 282, 707], width: 43 },
			{ str: '0x00', transform: [1, 0, 0, 1, 70, 695], width: 21 },
			{ str: 'Board SKU', transform: [1, 0, 0, 1, 133, 695], width: 50 },
			{ str: 'flowing', transform: [1, 0, 0, 1, 100, 600], width: 30 },
			{ str: 'text', transform: [1, 0, 0, 1, 133, 600], width: 18 },
		]);
		const rows = text.split('\n');

		assert.strictEqual(rows[0], 'Offset | Register');
		assert.strictEqual(rows[1], '7:6 | RO | Reserved');
		assert.strictEqual(rows[2], '0x00 | Board SKU');
		assert.strictEqual(rows[3], 'flowing text');
	});

	test('unified import recognizes snapshots and Continuity JSONL', () => {
		const snapshot = parseImportData(JSON.stringify({
			schemaVersion: 1,
			sessions: [],
			turns: [],
			vectors: [],
			nodes: [],
			edges: [],
			events: [],
		}));
		assert.strictEqual(snapshot.kind, 'snapshot');

		const continuity = parseImportData([
			JSON.stringify({ id: 'decision-1', question: 'Why?', answer: 'Because.' }),
			JSON.stringify({ id: 'decision-2', question: 'How?', answer: 'Carefully.' }),
		].join('\n'));
		assert.strictEqual(continuity.kind, 'continuity');
		if (continuity.kind === 'continuity') {
			assert.deepStrictEqual(continuity.decisions.map((decision) => decision.id), ['decision-1', 'decision-2']);
		}
	});

	test('search presentation deduplicates matches and keeps evidence context', () => {
		const timestamp = '2026-09-08T00:00:00.000Z';
		const snapshot = {
			schemaVersion: 1,
			sessions: [],
			turns: [],
			vectors: [],
			nodes: [{ id: 'decision:1', kind: 'decision' as const, label: 'Use local storage', summary: 'Keep a local fallback.', status: 'active' as const, confidence: 'high' as const, evidenceTurnIds: ['turn:1', 'turn:2'], tags: [], createdAt: timestamp, updatedAt: timestamp }],
			edges: [],
			events: [],
		};
		const results = presentSearchResults(
			[{ id: 'decision:1', type: 'decision', summary: 'Use local storage', resolution: 'Keep a local fallback.', status: 'active', source: 'semantic', evidence: [{ id: 'turn:1' }] }],
			[{ sourceId: 'decision:1', sourceKind: 'knowledge', score: 0.9, text: 'Use local storage: Keep a local fallback.' }],
			snapshot,
			8,
		);

		assert.strictEqual(results.length, 1);
		assert.strictEqual(results[0].title, 'Use local storage');
		assert.strictEqual(results[0].evidenceCount, 2);
		assert.deepStrictEqual(results[0].matchSources, ['semantic', 'local']);
	});

	test('hybrid ranking rejects graph matches on generic query terms', () => {
		const results = rankRetrievalResults('Context Recall retrieval quality', [
			{
				name: 'graph',
				weight: 0.8,
				requireTermOverlap: true,
				items: [{ id: 'camera', summary: 'OpenBMC IP-Camera Maintainer Agent', resolution: 'Matched: label=Agent' }],
			},
			{
				name: 'lexical',
				weight: 1.2,
				items: [{ id: 'memory', summary: 'Context Recall retrieval quality benchmark' }],
			},
		], 8);

		assert.deepStrictEqual(results.map((item) => item.id), ['memory']);
	});

	test('hybrid ranking matches query terms inside technical identifiers', () => {
		const results = rankRetrievalResults('reset', [{
			name: 'graph',
			weight: 0.8,
			requireTermOverlap: true,
			items: [{ id: 'signal', summary: 'RESET_N', resolution: 'CPLD reset signal' }],
		}], 4);

		assert.deepStrictEqual(results.map((item) => item.id), ['signal']);
	});

	test('service search ranks relevance above source order', () => {
		const results = rankServiceSearchResults('CPLD authentication pin', {
			graph: [{ id: 'generic', type: 'fact', summary: 'Agent capability inventory', resolution: 'Matched: label=Agent', status: 'active' }],
			semantic_memories: [{ id: 'semantic', type: 'fact', summary: 'Delayed authentication control', resolution: 'CPLD pin behavior', status: 'active' }],
			lexical: [{ id: 'lexical', type: 'fact', summary: 'CPLD authentication pin', resolution: 'Verified hardware behavior', status: 'active' }],
		}, 3);

		assert.deepStrictEqual(results.map((item) => item.id), ['lexical', 'semantic']);
		assert.deepStrictEqual(results.map((item) => item.source), ['lexical', 'semantic']);
	});

	test('service search preserves native semantic relevance', () => {
		const results = rankServiceSearchResults('firmware rollback protection', {
			graph: [],
			semantic: [{ source_id: 'semantic', score: 0.94 }],
			semantic_memories: [{ id: 'semantic', type: 'decision', summary: 'Prevent older signed images', resolution: 'Reject decreasing security versions.', status: 'active' }],
			lexical: [{ id: 'lexical', type: 'fact', summary: 'Firmware inventory', resolution: 'Lists firmware components.', status: 'active' }],
		}, 2);

		assert.strictEqual(results[0].id, 'semantic');
		assert.strictEqual(results[0].semanticScore, 0.94);
	});

	test('search connections preserve graph edges and shared evidence', () => {
		const results = [
			{
				id: 'source:dam', type: 'graph:SourceRef', summary: 'DAM source', resolution: 'Repository evidence', status: 'active',
				connections: [{ edge_id: 'edge:supports', type: 'SUPPORTS', direction: 'outgoing' as const, neighbor_id: 'command:dam-read', neighbor_title: 'DAM Read Status', confidence: 'high', evidence: ['turn:dam'] }],
			},
			{ id: 'memory:commands', type: 'fact', summary: 'DAM IPMI commands', resolution: 'NetFn 0x32', status: 'active', evidence: [{ id: 'turn:dam' }] },
			{ id: 'memory:allowlist', type: 'decision', summary: 'DAM allowlist', resolution: 'KCS only', status: 'active', source_refs: ['turn:turn:dam'] },
		];
		const connections = connectServiceSearchResults(results);
		const context = formatConnectedSearchContext(results);

		assert.ok(connections.some((item) => item.relation === 'SUPPORTS' && item.toId === 'command:dam-read'));
		assert.ok(connections.some((item) => item.relation === 'SHARES_EVIDENCE' && item.evidence.includes('turn:dam')));
		assert.ok(context.includes('DAM source --SUPPORTS--> DAM Read Status'));
		assert.ok(context.includes('VERIFIED CONNECTIONS'));
	});

	test('session context resolves short follow-ups without losing open issues', () => {
		const previous = {
			goal: 'Understand GMM CPLD updates',
			currentTopic: 'GMM CPLD update',
			currentPhase: 'investigation',
			completedActions: [],
			verifiedResults: [],
			reasoningSummary: '',
			intermediateConclusions: [],
			decisions: [],
			openIssues: ['Find rollback behavior'],
			nextSteps: ['Inspect updater implementation'],
			changedFiles: [],
			evidenceRefs: [],
			updatedAt: '2026-09-10T00:00:00.000Z',
		};
		const resolution = fallbackContextResolution('它失败后怎么办？', previous);
		const normalized = normalizeSessionContext({ currentPhase: 'diagnosis' }, previous);

		assert.strictEqual(resolution.rewrittenQuery, 'GMM CPLD update 它失败后怎么办？');
		assert.deepStrictEqual(normalized.openIssues, ['Find rollback behavior']);
		assert.deepStrictEqual(normalized.nextSteps, ['Inspect updater implementation']);
	});

	test('embeddings rank related text above unrelated text', () => {
		const query = embed('CPLD delayed authentication pin');
		const related = cosineSimilarity(query, embed('DAM controls a CPLD authentication pin'));
		const unrelated = cosineSimilarity(query, embed('frontend typography color palette'));
		assert.ok(related > unrelated, `${related} should be greater than ${unrelated}`);
	});

	test('store persists sessions, vectors, and knowledge graph data', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'knowledge-agent-test-'));
		try {
			const store = new KnowledgeStore(directory);
			await store.initialize();
			const timestamp = new Date().toISOString();
			await store.ensureSession('session-1', 'workspace-1', 'Investigate delayed authentication');
			await store.updateSessionContext('session-1', {
				goal: 'Diagnose delayed authentication',
				currentTopic: 'CPLD DAM control',
				currentPhase: 'investigation',
				completedActions: [],
				verifiedResults: [],
				reasoningSummary: '',
				intermediateConclusions: [],
				decisions: [],
				openIssues: ['Confirm the controlling register'],
				nextSteps: ['Inspect CPLD evidence'],
				changedFiles: [],
				evidenceRefs: [],
				updatedAt: timestamp,
			});
			const turn = await store.recordTurn('session-1', 'user', 'DAM is controlled by a CPLD pin');
			const node: KnowledgeNode = {
				id: 'knowledge:dam',
				kind: 'fact',
				label: 'Delayed Authentication Mode',
				summary: 'DAM is associated with a CPLD control pin.',
				status: 'active',
				confidence: 'low',
				evidenceTurnIds: [turn.id],
				tags: ['dam', 'cpld'],
				createdAt: timestamp,
				updatedAt: timestamp,
			};
			await store.upsertKnowledge([node], []);
			await store.upsertKnowledge([{
				...node,
				evidenceTurnIds: ['second-evidence'],
				tags: ['authentication'],
				createdAt: '2099-01-01T00:00:00.000Z',
				updatedAt: '2099-01-01T00:00:00.000Z',
			}], []);

			assert.deepStrictEqual(store.getStats(), {
				sessions: 1,
				organizedSessions: 0,
				turns: 1,
				vectors: 2,
				nodes: 1,
				edges: 0,
				vectorCoverage: 100,
				activeKnowledge: 1,
				evidenceBackedKnowledge: 1,
				recentKnowledge: 1,
				contestedKnowledge: 0,
			});
			assert.ok(store.search('CPLD DAM').some((result) => result.sourceId === node.id));
			const reloaded = new KnowledgeStore(directory);
			await reloaded.initialize();
			assert.strictEqual(reloaded.getSessionContext('session-1')?.currentTopic, 'CPLD DAM control');
			assert.deepStrictEqual(reloaded.getSessionContext('session-1')?.openIssues, ['Confirm the controlling register']);
			const merged = store.getSnapshot().nodes[0];
			assert.deepStrictEqual(merged.evidenceTurnIds, [turn.id, 'second-evidence']);
			assert.deepStrictEqual(merged.tags, ['dam', 'cpld', 'authentication']);
			assert.strictEqual(merged.createdAt, timestamp);

			const restored = new KnowledgeStore(directory);
			await restored.initialize();
			assert.strictEqual(restored.getStats().sessions, 1);
			assert.strictEqual(restored.getStats().nodes, 1);
			assert.strictEqual(JSON.parse(await readFile(join(directory, 'knowledge-agent.json'), 'utf8')).schemaVersion, 1);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test('store rejects malformed imported vector data', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'knowledge-agent-import-test-'));
		try {
			const store = new KnowledgeStore(directory);
			await store.initialize();
			await assert.rejects(
				store.importSnapshot({
					schemaVersion: 1,
					sessions: [],
					turns: [],
					vectors: [{ id: 'bad', dimensions: 2, values: [1, 2] }],
					nodes: [],
					edges: [],
					events: [],
				}),
				/256 finite values/,
			);
			assert.strictEqual(store.getStats().vectors, 0);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test('parses Copilot transcripts into deduplicated session evidence', () => {
		const transcript = [
			JSON.stringify({ type: 'session.start', data: { sessionId: 'abc', startTime: '2026-09-05T01:00:00.000Z' }, timestamp: '2026-09-05T01:00:00.000Z' }),
			JSON.stringify({ type: 'user.message', data: { content: 'Investigate DAM' }, timestamp: '2026-09-05T01:00:01.000Z' }),
			JSON.stringify({ type: 'user.message', data: { content: 'Investigate DAM' }, timestamp: '2026-09-05T01:00:02.000Z' }),
			JSON.stringify({ type: 'assistant.message', data: { content: 'The implementation is not present.' }, timestamp: '2026-09-05T01:00:03.000Z' }),
		].join('\n');
		const parsed = parseTranscript(transcript, 'workspace-1');
		assert.strictEqual(parsed?.id, 'copilot:abc');
		assert.strictEqual(parsed?.title, 'Investigate DAM');
		assert.strictEqual(parsed?.transcript.match(/Investigate DAM/g)?.length, 1);
		assert.match(parsed?.transcript ?? '', /ASSISTANT:\nThe implementation is not present\./);
	});

	test('uses legacy transcript file IDs and redacts credentials', () => {
		const transcript = JSON.stringify({
			type: 'user.message',
			data: { content: 'api_key=visible-secret password:another-secret' },
			timestamp: '2026-09-05T01:00:00.000Z',
		});
		const parsed = parseTranscript(transcript, 'workspace-1', 'legacy-session');
		assert.strictEqual(parsed?.id, 'copilot:legacy-session');
		assert.strictEqual(parsed?.transcript, 'USER:\napi_key=[REDACTED] password:[REDACTED]');
	});
});
