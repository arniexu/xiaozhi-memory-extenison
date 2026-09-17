#!/usr/bin/env node
/**
 * 命名一致性检查器（单名制：OpenBMC 知识助手）
 *
 * 用途：小步快跑改名时，每一步都能立刻验证"改干净了没有"。
 * 用法：node scripts/check-naming.mjs [--json]
 * 退出码：发现任何遗留旧名 → 1；干净 → 0
 *
 * 判据（人看得到 vs 机器标识）：
 *   - 人类可见：一律 "OpenBMC 知识助手"（chat 入口 @openbmc）
 *   - 机器标识：一律保持 context-recall / contextRecall.* 不变（改名不改 ID，含扩展 ID "memory"）
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

/** 目标 vs 遗留：`target` 是终态应当使用的写法 */
const RULES = [
  // 扩展 ID 有意保持 "memory"（xuqj-local.memory）：改名不改 ID，避免 globalStorage 与安装身份漂移（2026-09-17 决定）。
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
  { when: /^src\/mcp-server\.ts$/, match: /KNOWLEDGE_AGENT_/, reason: '兼容读取旧环境变量（S6 删除）' },
  { when: /^src\/store\.ts$/, match: /legacy|LEGACY_SNAPSHOT_FILENAME|旧快照文件/, reason: '兼容旧快照文件名与迁移注释（S6 删除）' },
  { when: /^src\/scope\.ts$/, match: /knowledge-agent-service/, reason: '服务仓库真实目录名（机器标识，不随品牌改名）' },
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

// 2b) 用户可见文案不得残留旧品牌（区分大小写；context-recall / CONTEXT_RECALL_ 等机器标识不受影响）。
// 有意保留旧名称的历史材料（CHANGELOG 历史条目、docs/ui-design/、evals/、自动生成文件、*.code-workspace）不在扫描范围。
const EXPECTED_BRAND = 'OpenBMC 知识助手';
const scanVisibleBrand = (file, text) => {
  text.split('\n').forEach((line, index) => {
    if (!/Context[ ]Recall|CONTEXT[ ]RECALL/.test(line)) return;
    bucket.unexpected.set(`${file}:${index + 1}`, {
      file,
      line: index + 1,
      rules: ['brand-stale'],
      target: EXPECTED_BRAND,
      snippet: line.trim().slice(0, 96),
    });
  });
};
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});
const visibleScanTargets = [
  'package.json',
  'README.md',
  'website/index.html',
  'media/dashboard.js',
  'media/sidebar.js',
  'docs/decision-reference-design.md',
  '.github/copilot-instructions.md',
  '.github/agents/context-recall-china-commercial.agent.md',
  '.github/agents/context-recall-story-ui.agent.md',
];
for (const file of visibleScanTargets) {
  scanVisibleBrand(file, readFileSync(join(root, file), 'utf8'));
}
for (const path of walk(join(root, 'src'))) {
  if (path.endsWith('.ts')) scanVisibleBrand(path.slice(root.length + 1), readFileSync(path, 'utf8'));
}
if (pkg.displayName !== EXPECTED_BRAND) {
  bucket.unexpected.set('package.json:displayName', {
    file: 'package.json', line: 3, rules: ['brand-expected'], target: `displayName = ${EXPECTED_BRAND}`, snippet: String(pkg.displayName),
  });
}
const chatName = pkg.contributes?.chatParticipants?.[0]?.name;
if (chatName !== 'openbmc') {
  bucket.unexpected.set('package.json:chatParticipant.name', {
    file: 'package.json', line: 134, rules: ['handle-expected'], target: 'chatParticipant.name = openbmc', snippet: String(chatName),
  });
}

const unexpected = [...bucket.unexpected.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const allowed = [...bucket.allowed.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

// 3) 人类可见文案自查：应为 "OpenBMC 知识助手" / @openbmc
const visible = [
  ['displayName', pkg.displayName],
  ['description', pkg.description],
  ...(pkg.contributes?.commands ?? []).map((c) => [`command.title:${c.command}`, c.title]),
  ...(pkg.contributes?.mcpServerDefinitionProviders ?? []).map((p) => [`mcpProvider.label:${p.id}`, p.label]),
  ...(pkg.contributes?.viewsContainers?.activitybar ?? []).map((v) => [`viewContainer.title:${v.id}`, v.title]),
  ...(pkg.contributes?.chatParticipants ?? []).flatMap((p) => [
    [`chatParticipant.name:${p.id}`, p.name],
    [`chatParticipant.fullName:${p.id}`, p.fullName],
  ]),
];

const report = {
  target: 'OpenBMC 知识助手 (single-name)',
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
  console.log('  人可见文案（应为 OpenBMC 知识助手 / @openbmc）:');
  for (const { field, value } of report.visibleNames) {
    console.log(`    ${field.padEnd(46)} ${value}`);
  }
  console.log();
}

process.exit(report.unexpectedTotal === 0 ? 0 : 1);
