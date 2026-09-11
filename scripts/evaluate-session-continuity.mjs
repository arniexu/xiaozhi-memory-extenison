import assert from 'node:assert/strict';
import Module from 'node:module';

const originalLoad = Module._load;
Module._load = (request, parent, isMain) => request === 'vscode' ? {} : originalLoad(request, parent, isMain);
const { fallbackContextResolution, normalizeSessionContext } = await import('../out/session-context.js');

const previous = {
	goal: 'Understand GMM CPLD update and recovery',
	currentTopic: 'GMM CPLD update',
	currentPhase: 'investigation',
	completedActions: ['Located the update implementation'],
	verifiedResults: ['The updater uses Lattice ISC commands'],
	reasoningSummary: 'Runtime registers and programming opcodes are separate interfaces.',
	intermediateConclusions: ['0xCxxx and 0xExxx are runtime register banks'],
	decisions: [],
	openIssues: ['Confirm rollback behavior'],
	nextSteps: ['Inspect failure handling'],
	changedFiles: [],
	evidenceRefs: ['CpldProgrammingOperations.hpp'],
	updatedAt: '2026-09-10T00:00:00.000Z',
};

const cases = [
	{ name: 'Chinese pronoun follow-up', query: '它失败后怎么办？', expected: 'GMM CPLD update 它失败后怎么办？' },
	{ name: 'English pronoun follow-up', query: 'How does it recover?', expected: 'GMM CPLD update How does it recover?' },
	{ name: 'Elliptical register follow-up', query: '升级相关的寄存器呢？', expected: 'GMM CPLD update 升级相关的寄存器呢？' },
	{ name: 'Explicit topic switch', query: 'DAM', expected: 'DAM' },
	{ name: 'Explicit Chinese topic switch', query: '介绍一下风扇控制', expected: '介绍一下风扇控制' },
	{ name: 'Self-contained query', query: 'GMM CPLD update failure recovery', expected: 'GMM CPLD update failure recovery' },
];

const results = cases.map((testCase) => {
	const actual = fallbackContextResolution(testCase.query, previous).rewrittenQuery;
	return { ...testCase, actual, passed: actual === testCase.expected };
});

const preserved = normalizeSessionContext({ currentPhase: 'diagnosis' }, previous);
results.push({
	name: 'Preserve omitted open issues',
	expected: JSON.stringify(previous.openIssues),
	actual: JSON.stringify(preserved.openIssues),
	passed: JSON.stringify(preserved.openIssues) === JSON.stringify(previous.openIssues),
});

const explicitlyResolved = normalizeSessionContext({ openIssues: [] }, previous);
results.push({
	name: 'Allow explicit issue resolution',
	expected: '[]',
	actual: JSON.stringify(explicitlyResolved.openIssues),
	passed: explicitlyResolved.openIssues.length === 0,
});

for (const result of results) {
	console.log(`${result.passed ? 'PASS' : 'FAIL'} | ${result.name} | ${result.actual}`);
}
const passed = results.filter((result) => result.passed).length;
console.log(`SUMMARY | ${passed}/${results.length} passed | ${(passed / results.length * 100).toFixed(1)}%`);
assert.equal(passed, results.length, `${results.length - passed} continuity cases failed`);
