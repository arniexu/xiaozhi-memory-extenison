#!/usr/bin/env node
/**
 * 命名一致性检查器（方案 B：单名制 Context Recall）
 *
 * 用途：小步快跑改名时，每一步都能立刻验证"改干净了没有"。
 * 用法：node scripts/check-naming.mjs [--json]
 * 退出码：发现任何遗留旧名 → 1；干净 → 0
 *
 * 判据（人看得到 vs 机器标识）：
 *   - 人类可见：一律 "Context Recall"（chat 入口 @recall 保持不变）
 *   - 机器标识：一律 context-recall / contextRecall.*
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

/** 目标 vs 遗留：`target` 是终态应当使用的写法 */
const RULES = [
  { id: 'ext-id',          target: 'name: "context-recall"',            legacy: /^\s*"name"\s*:\s*"memory"/m },
  { id: 'command-ns',      target: 'contextRecall.*',                   legacy: /knowledgeAgent\./ },
  { id: 'setting-ns',      target: 'contextRecall.*',                   legacy: /"knowledgeAgent\./ },
  { id: 'provider-id',     target: 'contextRecall.mcpServers',          legacy: /"knowledgeAgent\.mcpServers"/ },
  { id: 'participant-id',  target: 'contextRecall.chat',                legacy: /knowledge-agent\.chat/ },
  { id: 'snapshot-file',   target: 'context-recall.json',               legacy: /knowledge-agent\.json/ },
  { id: 'env-prefix',      target: 'CONTEXT_RECALL_*',                  legacy: /KNOWLEDGE_AGENT_[A-Z_]*/ },
  { id: 'service-refs',    target: 'context-recall-service',            legacy: /knowledge-agent-service|knowledge_agent_service/ },
  { id: 'storage-dir',     target: 'xuqj-local.context-recall',         legacy: /xuqj-local\.memory/ },
];

/** 有意的兼容层：允许保留，但必须在 S6 收缩期删除（勿误删） */
const ALLOW = [
  { when: /^package\.json$/, match: /"knowledgeAgent\.(backend|serviceUrl)"/, reason: 'deprecated 旧设置键（S6 删除）' },
  { when: /^src\/extension\.ts$/, match: /legacyId|MCP_PROVIDER_ID|affectsConfiguration\('knowledgeAgent|旧 `knowledgeAgent/, reason: '兼容别名与双监听（S6 删除）' },
];

const bucket = { unexpected: new Map(), allowed: new Map() };

const scan = (file, text) => {
  text.split('\n').forEach((line, index) => {
    const rules = RULES.filter((rule) => new RegExp(rule.legacy.source).test(line));
    if (!rules.length) return;
    const permitted = ALLOW.find((a) => a.when.test(file) && a.match.test(line));
    const target = permitted ? bucket.allowed : bucket.unexpected;
    const key = `${file}:${index + 1}`;
    const entry = target.get(key) ?? {
      file,
      line: index + 1,
      rules: [],
      target: rules[0].target,
      snippet: line.trim().slice(0, 96),
      ...(permitted ? { reason: permitted.reason } : {}),
    };
    for (const rule of rules) if (!entry.rules.includes(rule.id)) entry.rules.push(rule.id);
    target.set(key, entry);
  });
};

// 1) package.json（贡献点）
const pkgText = readFileSync(join(root, 'package.json'), 'utf8');
scan('package.json', pkgText);
const pkg = JSON.parse(pkgText);

// 2) src 全量
const srcDir = join(root, 'src');
for (const file of readdirSync(srcDir)) {
  if (!file.endsWith('.ts')) continue;
  scan(`src/${file}`, readFileSync(join(srcDir, file), 'utf8'));
}

const unexpected = [...bucket.unexpected.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const allowed = [...bucket.allowed.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

// 3) 人类可见文案自查：应当出现 "Context Recall" / "recall"，不应出现别的产品名
const visible = [
  ['displayName', pkg.displayName],
  ['description', pkg.description],
  ...(pkg.contributes?.commands ?? []).map((c) => [`command.title:${c.command}`, c.title]),
  ...(pkg.contributes?.viewsContainers?.activitybar ?? []).map((v) => [`viewContainer.title:${v.id}`, v.title]),
  ...(pkg.contributes?.chatParticipants ?? []).flatMap((p) => [
    [`chatParticipant.name:${p.id}`, p.name],
    [`chatParticipant.fullName:${p.id}`, p.fullName],
  ]),
];

const report = {
  target: 'Context Recall (single-name)',
  status: unexpected.length === 0 ? 'CLEAN' : 'PENDING_RENAME',
  unexpectedTotal: unexpected.length,
  allowedTotal: allowed.length,
  unexpected,
  allowed,
  visibleNames: visible.map(([k, v]) => ({ field: k, value: v })),
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n命名一致性检查 — 目标: ${report.target}\n`);
  console.log(`  非预期遗留: ${report.unexpectedTotal} 处   |   有意兼容层: ${report.allowedTotal} 处\n`);
  if (report.unexpectedTotal === 0) {
    console.log('  ✅ 无非预期遗留（兼容层仍在，按 S6 收缩期删除）\n');
  } else {
    console.log('  ❌ 需要修掉的非预期遗留:');
    for (const item of report.unexpected) {
      console.log(`    ${item.file}:${item.line}  [${item.rules.join('+')}] → ${item.target}`);
      console.log(`      ${item.snippet}`);
    }
    console.log();
  }
  if (report.allowedTotal) {
    console.log('  ⏳ 有意兼容层（可保留，勿误删）:');
    for (const item of report.allowed) {
      console.log(`    ${item.file}:${item.line}  ${item.reason}`);
    }
    console.log();
  }
  console.log('  人可见文案（应为 Context Recall / @recall）:');
  for (const { field, value } of report.visibleNames) {
    console.log(`    ${field.padEnd(46)} ${value}`);
  }
  console.log();
}

process.exit(report.unexpectedTotal === 0 ? 0 : 1);
