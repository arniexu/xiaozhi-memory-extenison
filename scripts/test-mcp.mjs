import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined));

function embedding(text) {
	const values = new Array(256).fill(0);
	for (const term of text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []) {
		let hash = 2166136261;
		for (const character of term) {
			hash ^= character.charCodeAt(0);
			hash = Math.imul(hash, 16777619);
		}
		hash >>>= 0;
		values[hash % values.length] += (hash & 0x100) === 0 ? 1 : -1;
	}
	const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
	return magnitude === 0 ? values : values.map((value) => value / magnitude);
}

function startService() {
	const service = createServer((request, response) => {
		response.setHeader('content-type', 'application/json');
		if (request.url === '/health') {
			response.end(JSON.stringify({
				status: 'ok',
				memory: { total: 3, active: 3, candidate: 0, raw: 0 },
				vectors: { total: 3, dimensions: 256 },
				databases: { memory: { path: '/must/not/leak' } },
				neo4j: { configured: true, ready: true, database: 'neo4j', nodes: 1, relationships: 1 },
			}));
			return;
		}
		if (request.url === '/v1/search') {
			response.end(JSON.stringify({
				graph: [{
					id: 'graph-1', type: 'graph:Signal', summary: 'RESET_N', resolution: 'CONTROLS CPLD', status: 'active',
					connections: [{ edge_id: 'edge-1', type: 'CONTROLS', direction: 'outgoing', neighbor_id: 'cpld-1', neighbor_title: 'Main CPLD', confidence: 'high', evidence: ['turn:reset'] }],
				}],
				semantic: [{ source_id: 'semantic-1', score: 0.92 }],
				semantic_memories: [{ id: 'semantic-1', type: 'fact', summary: 'Semantic reset evidence', resolution: '', status: 'active', evidence: [{ id: 'turn:reset' }] }],
				lexical: [{ id: 'lexical-1', type: 'fact', summary: 'Lexical reset evidence', resolution: '', status: 'active' }],
				graph_error: '',
			}));
			return;
		}
		response.statusCode = 404;
		response.end('{}');
	});
	return new Promise((resolve) => service.listen(0, '127.0.0.1', () => resolve(service)));
}

async function connect(environment) {
	const client = new Client({ name: 'knowledge-agent-mcp-test', version: '1.0.0' });
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: ['dist/mcp-server.js'],
		env: { ...inheritedEnvironment, ...environment },
		stderr: 'pipe',
	});
	await client.connect(transport);
	return client;
}

const directory = await mkdtemp(join(tmpdir(), 'knowledge-agent-mcp-'));
const snapshotPath = join(directory, 'knowledge-agent.json');
const service = await startService();
const address = service.address();
if (!address || typeof address === 'string') {
	throw new Error('Synthetic service did not expose a TCP port');
}

await writeFile(snapshotPath, JSON.stringify({
	schemaVersion: 1,
	sessions: [{
		id: 'session-1', title: 'CPLD recovery', workspaceId: 'workspace-1', createdAt: 'now', updatedAt: 'now', turnIds: ['turn-1'],
		context: { goal: 'Recover CPLD update', currentTopic: 'GMM CPLD update', currentPhase: 'diagnosis', completedActions: [], verifiedResults: [], reasoningSummary: '', intermediateConclusions: [], decisions: [], openIssues: ['Find rollback behavior'], nextSteps: ['Inspect updater'], changedFiles: [], evidenceRefs: ['turn-1'], updatedAt: 'now' },
	}],
	turns: [{ id: 'turn-1', sessionId: 'session-1', role: 'user', text: 'How does CPLD update recovery work?', createdAt: 'now' }],
	vectors: [{ id: 'vector:knowledge:local-1', sourceId: 'local-1', sourceKind: 'knowledge', dimensions: 256, values: embedding('fallback'), createdAt: 'now' }],
	nodes: [{ id: 'local-1', kind: 'fact', label: 'Fallback', summary: 'Local fallback evidence', status: 'active', confidence: 'high', evidenceTurnIds: [], tags: [], createdAt: 'now', updatedAt: 'now' }],
	edges: [],
	events: [],
}));

try {
	const serviceClient = await connect({
		KNOWLEDGE_AGENT_BACKEND: 'service',
		KNOWLEDGE_AGENT_SERVICE_URL: `http://127.0.0.1:${address.port}`,
		KNOWLEDGE_AGENT_SNAPSHOT: snapshotPath,
	});
	try {
		const tools = await serviceClient.listTools();
		assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ['knowledge_search', 'knowledge_status', 'session_context']);
		const search = await serviceClient.callTool({ name: 'knowledge_search', arguments: { query: 'reset', limit: 6 } });
		assert.deepEqual([...new Set(search.structuredContent.results.map((item) => item.source))].sort(), ['graph', 'lexical', 'semantic']);
		assert.equal(search.structuredContent.results[0].id, 'semantic-1');
		assert.equal(search.structuredContent.relationships.some((item) => item.relation === 'CONTROLS' && item.toId === 'cpld-1'), true);
		assert.equal(search.structuredContent.relationships.some((item) => item.relation === 'SHARES_EVIDENCE' && item.evidence.includes('turn:reset')), true);
		const status = await serviceClient.callTool({ name: 'knowledge_status', arguments: {} });
		assert.equal(status.structuredContent.activeBackend, 'service');
		assert.equal(JSON.stringify(status.structuredContent).includes('/must/not/leak'), false);
		const context = await serviceClient.callTool({ name: 'session_context', arguments: { sessionId: 'session-1' } });
		assert.equal(context.structuredContent.contextReturned, true);
		assert.equal(context.structuredContent.hostInjected, false);
		assert.equal(context.structuredContent.context.currentTopic, 'GMM CPLD update');
		assert.deepEqual(context.structuredContent.context.openIssues, ['Find rollback behavior']);
		console.log('MCP-001 tool discovery and service retrieval | PASS');
		console.log('MCP-002 status sanitization | PASS');
		console.log('MCP-004 bounded session context | PASS');
	} finally {
		await serviceClient.close();
	}

	const localClient = await connect({
		KNOWLEDGE_AGENT_BACKEND: 'local',
		KNOWLEDGE_AGENT_SNAPSHOT: snapshotPath,
	});
	try {
		const search = await localClient.callTool({ name: 'knowledge_search', arguments: { query: 'fallback', limit: 3 } });
		assert.equal(search.structuredContent.backend, 'local');
		assert.equal(search.structuredContent.results[0].id, 'local-1');
		console.log('MCP-003 local snapshot fallback | PASS');
	} finally {
		await localClient.close();
	}
} finally {
	service.close();
	await rm(directory, { recursive: true, force: true });
}