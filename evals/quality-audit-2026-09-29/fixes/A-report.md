# A 报告：度量台 fixture 治理（knowledge-agent-extension）

- 时间：2026-09-29（UTC）；repo `/home/xuqj/knowledge-agent-extension`（HEAD db04463）
- 服务：`http://10.112.229.254:8765`（只调用 `POST /v1/search`、`GET /health`，未写库、未重启服务）
- 落盘产物：`/tmp/p0-20260929/A-fixtures.json`、`/tmp/p0-20260929/A-after.json`、`/tmp/p0-20260929/A-compare.json`
- 结论摘要：`hitAt1` 归一化后 = **0.889（16/18）**，与审计 §3 的复算一致；fixture 自检 **3/3 mapped、exit 0**；`--compare` 的 documentRecallAtK 静默跳过缺陷已修复并实测可拦截。

## 1. 变更清单（file:line）

### 1.1 `scripts/evaluate-retrieval.mjs`（仅修匹配器与对比器）

| 位置 | 变更 |
|---|---|
| `scripts/evaluate-retrieval.mjs:2-11` | 文件头 usage：推荐 `--compare evals/accepted.json`（最近验收基线）、`--baseline-update`（验收后由验收人刷新）、标注名称归一化规则 |
| `scripts/evaluate-retrieval.mjs:80-88` | 新增 `canonicalDoc(name)`：`String(name).replace(/ \(\d+\)\.pdf$/, '.pdf')`；`undefined/null` 安全返回 `''` |
| `scripts/evaluate-retrieval.mjs:90-92` | `matches()` 中 docPrefix 比较改为两侧归一：`canonicalDoc(doc).startsWith(canonicalDoc(expectation.docPrefix))` |
| `scripts/evaluate-retrieval.mjs:224-236` | `documentRecall` 的期望文档集合与返回文档集合都归一化，且**去重前归一**（同一篇文档的 `(1)` 副本不再算两个期望文档） |
| `scripts/evaluate-retrieval.mjs:324-326` | `lowerIsBetter` 只保留 `supersededLeakage`，移除误入的 `documentRecallAtK`（原实现使其回退被静默跳过，见审计 §4.5） |

未改动（保持原判定口径）：页码比较（`:93-99`）、`summaryContains`（`:101-103`）、`resolutionContains`（`:104-106`）、`--baseline-update`（`:345-349`）、不传 `--compare` 时的行为。

### 1.2 `scripts/check-fixtures.mjs`（新建，160 行）

| 位置 | 功能 |
|---|---|
| `scripts/check-fixtures.mjs:1-28` | 头部 usage；同款 vscode shim + `out/vector.js` embed；缺 out/ 时提示 `npm run compile-tests` 并 `exit 2` |
| `scripts/check-fixtures.mjs:30-33` | `--json <path>` 解析；服务地址取 `CONTEXT_RECALL_EVAL_SERVICE` 或 `golden.service.url` |
| `scripts/check-fixtures.mjs:36-42` | 与评测台一致的 `canonicalDoc`（`undefined/null` 安全） |
| `scripts/check-fixtures.mjs:54-66` | 收集去重后的 `expect[].docPrefix`（按归一化名去重，查询仍用金标原文） |
| `scripts/check-fixtures.mjs:68-85` | 对每个前缀 `POST /v1/search`，body `{query: 前缀原文, embedding: embed(前缀原文), workspace_id:'', session_id:'', limit:8}` |
| `scripts/check-fixtures.mjs:87-135` | 扫描返回项（lexical→semantic→graph），归一化文档名 `startsWith` 归一化前缀即映射成功，记录首个样例（channel/doc/page/summary） |
| `scripts/check-fixtures.mjs:137-139` | 打印逐前缀 `OK/MISSING` 行 + 汇总行 `fixtures mapped X/Y` |
| `scripts/check-fixtures.mjs:141-157` | `--json <path>` 写结构化结果（`capturedAt`、`expected[]`、`mapped{count,total,completeRate,complete}`） |
| `scripts/check-fixtures.mjs:160` | 未映射（含 HTTP 失败）或 0 fixture → `exit 1`；全命中 → `exit 0` |

### 1.3 `package.json`（仅 scripts 节）

| 位置 | 变更 |
|---|---|
| `package.json:157` | `"test:retrieval": "npm run compile-tests && node scripts/check-fixtures.mjs && node scripts/evaluate-retrieval.mjs"`（前置自检硬串接） |
| `package.json:158` | 新增 `"test:fixtures": "npm run compile-tests && node scripts/check-fixtures.mjs"` |

其余 scripts（`:148-156`、`:159-164`）未动。

## 2. 自检原始输出

### 自检 1：`npm run compile-tests`（exit 0）

```
(node:3) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.
(Use `node --trace-warnings ...` to show where the warning was created)

> memory@0.3.24 compile-tests
> tsc -p . --outDir out

EXIT=0
```

### 自检 2：`node scripts/check-fixtures.mjs --json /tmp/p0-20260929/A-fixtures.json`（exit 0）

```
(node:4) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.
(Use `node --trace-warnings ...` to show where the warning was created)

=== fixture 映射自检 (service=http://10.112.229.254:8765, limit=8, golden capturedAt=2026-09-14) ===
  OK      639866_GNR_EDS-A_Rev_2_4 (1).pdf -> [lexical] 639866_GNR_EDS-A_Rev_2_4 (1).pdf - page 22
  OK      776846_Intel® Server System Integrated OpenBMC_Rev1_0 3.pdf -> [lexical] 776846_Intel® Server System Integrated OpenBMC_Rev1_0 3 (1).pdf - page 10
  OK      GemMountain PAS V1.0.pdf -> [lexical] GemMountain PAS V1.0.pdf - page 58

fixtures mapped 3/3
报告: /tmp/p0-20260929/A-fixtures.json
EXIT=0
```

说明：简报自检 2 预期「mapped 5/5」，实际为 **3/3**。原因：`evals/retrieval-golden.json` 中 `expect[].docPrefix` 去重后只有 3 个唯一值（`grep -o '"docPrefix": "[^"]*"' evals/retrieval-golden.json | sort -u` 得 639866…(1).pdf / 776846…3.pdf / GemMountain PAS V1.0.pdf），Whitley 与 EGS 两篇语料文档不在金标 expect 中 → 见 §5 UNCONFIRMED-1。三个前缀全部经 lexical 通道命中，其中 776846 的命中样例文档名为 `…3 (1).pdf`，证明归一化映射在真实语料上生效。

### 自检 3：`node scripts/evaluate-retrieval.mjs --json /tmp/p0-20260929/A-after.json`（exit 1）

```
(node:4) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.
(Use `node --trace-warnings ...` to show where the warning was created)

=== 检索评测 (service=http://10.112.229.254:8765) ===
  语料: total=20571 active=7963 (golden capturedAt=2026-09-14)

  case                           caller          n   hit@1  P@K    R@K    top1
  tech-tsod-temperature          chat-multiroot  8   Y      0.500  0.250  776846_Intel® Server System Integrated O div=true
  tech-crashdump-autonomous      chat-multiroot  8   Y      0.375  0.429  776846_Intel® Server System Integrated O div=true
  tech-redfish-eventservice      chat-multiroot  8   Y      0.250  0.500  776846_Intel® Server System Integrated O div=true
  tech-memory-mirroring          chat-multiroot  8   Y      0.500  0.333  639866_GNR_EDS-A_Rev_2_4 (1).pdf - page  div=true
  tech-pirom-offset              chat-multiroot  8   Y      0.250  0.000  639866_GNR_EDS-A_Rev_2_4 (1).pdf - page  div=true
  tech-peci-temperature          chat-multiroot  8   Y      0.125  0.000  GemMountain PAS V1.0.pdf - page 43 div=true
  tech-cpld-register             chat-multiroot  8   -      0.250  0.125  Whitley BMC Firmware EPS_Rev1_0.pdf - pa div=true
  tech-mctp                      chat-multiroot  8   Y      0.500  0.375  639866_GNR_EDS-A_Rev_2_4 (1).pdf - page  div=true
  tech-spd-bus                   chat-multiroot  8   Y      0.750  0.125  776846_Intel® Server System Integrated O div=true
  tech-smm-status                chat-multiroot  8   Y      0.500  0.250  639866_GNR_EDS-A_Rev_2_4 (1).pdf - page  div=true
  dec-coverity-triage            chat-multiroot  8   Y      0.375  1.000  Coverity Triage Agent div=true
  dec-coverity-workflow          chat-multiroot  8   Y      0.125  0.500  Coverity Triage Agent Workflow div=true
  dec-loop1-orchestrator         chat-multiroot  3   Y      1.000  1.000  loop1_orchestrator 
  dec-crossdoc-fix               chat-multiroot  1   Y      1.000  1.000  跨文档链接与查询无关（固定注入全局 top-N）怎么修的？ 
  cjk-smoke-threshold            chat-multiroot  8   Y      0.250  1.000  TSOD 温度阈值 smoke=true
  cjk-smoke-register             chat-multiroot  7   Y      1.000  1.000  CPLD功能确认 smoke=true
  cjk-smoke-falsepositive        chat-multiroot  6   Y      0.833  1.000  不将无关条目关联到 Whitley smoke=true
  cjk-precise-threshold          chat-multiroot  1   Y      1.000  1.000  用户要求阈值与时间窗口必须可配置且掉电不丢失，并要求立即将这些约束加入实现。 
  cjk-precise-cpld               chat-multiroot  8   -      0.000  0.000  GMM CPLD D-Bus mapping div=true
  unrelated-weather              chat-multiroot  0   -      0.000  0.000   noresult=true
  unrelated-lottery              chat-multiroot  0   -      0.000  0.000   noresult=true
  unrelated-quantum              chat-multiroot  0   -      0.000  0.000   noresult=true
  global-tsod                    dashboard       8   Y      0.500  0.250  776846_Intel® Server System Integrated O div=true
  legacy-tsod                    legacy-uri      8   Y      0.750  0.250  776846_Intel® Server System Integrated O div=true

--- 聚合 ---
  PASS hitAt1                 0.889 / >= 0.6
  FAIL precisionAtK           0.486 / >= 0.6
  PASS documentRecallAtK      0.733 / >= 0.7
  PASS smokeRate              1.000 / >= 1
  PASS noResultAccuracy       1.000 / >= 0.9
  PASS supersededLeakage      0 / <= 0
  PASS diversityRate          1.000 / >= 0.85
  PASS technicalTop3PageCoverage 0.875 / >= 0.8

SUMMARY | FAIL | 7/8 指标达标 | 0 项回退 | 报告: /tmp/p0-20260929/A-after.json
```

- `hitAt1 = 0.8888888888888888`（16/18），达到简报预期 ≈0.889（见 `A-after.json` metrics）。未做任何调参。
- exit 1 的唯一原因是既有指标 `precisionAtK=0.486 < 0.6`（阈值见 `evals/retrieval-golden.json:44`），不属于本次变更范围，如实报告。
- `documentRecallAtK=0.733`、`technicalTop3PageCoverage=0.875`、`supersededLeakage=0` 均通过。

### 自检 4：`node scripts/evaluate-retrieval.mjs --compare evals/baseline.json --json /tmp/p0-20260929/A-compare.json 2>&1 | tail -20`（exit 1）

```
  unrelated-weather              chat-multiroot  0   -      0.000  0.000   noresult=true
  unrelated-lottery              chat-multiroot  0   -      0.000  0.000   noresult=true
  unrelated-quantum              chat-multiroot  0   -      0.000  0.000   noresult=true
  global-tsod                    dashboard       8   Y      0.500  0.250  776846_Intel® Server System Integrated O div=true
  legacy-tsod                    legacy-uri      8   Y      0.750  0.250  776846_Intel® Server System Integrated O div=true

--- 聚合 ---
  PASS hitAt1                 0.889 / >= 0.6
  FAIL precisionAtK           0.486 / >= 0.6
  PASS documentRecallAtK      0.733 / >= 0.7
  PASS smokeRate              1.000 / >= 1
  PASS noResultAccuracy       1.000 / >= 0.9
  PASS supersededLeakage      0 / <= 0
  PASS diversityRate          1.000 / >= 0.85
  PASS technicalTop3PageCoverage 0.875 / >= 0.8

--- 与基线对比 ---
  PASS 无指标回退

SUMMARY | FAIL | 7/8 指标达标 | 0 项回退 | 报告: /tmp/p0-20260929/A-compare.json
```

`evals/baseline.json` 的 `comparable` 只含 hitAt1/precisionAtK/smokeRate/noResultAccuracy/supersededLeakage（`evals/baseline.json:26-32`），故 0 项回退；exit 1 同样来自 precisionAtK 阈值。

## 3. 补充验证（证明修复有效，非简报强制项）

### 3.1 `lowerIsBetter` 缺陷修复的实测拦截（合成"验收基线"）

构造 `comparable` 含全部 8 项、故意全部高于实值的基线后运行 `--compare`：

```
--- 与基线对比 ---
  FAIL 回退 hitAt1: 0.889 < baseline 1.000
  FAIL 回退 precisionAtK: 0.486 < baseline 1.000
  FAIL 回退 documentRecallAtK: 0.733 < baseline 0.900
  FAIL 回退 technicalTop3PageCoverage: 0.875 < baseline 0.900
  FAIL 回退 supersededLeakage: 0 > baseline -1

SUMMARY | FAIL | 7/8 指标达标 | 5 项回退
```

`documentRecallAtK` 与 `technicalTop3PageCoverage` 均被拦截（修复前 `documentRecallAtK` 在 `lowerIsBetter` 中会被 `continue` 静默跳过）；`supersededLeakage` 仍按「越低越好」判定。合成基线仅存在于沙箱 `/tmp`，未写入仓库。

### 3.2 自检失败路径（未映射 → exit≠0）

用返回空通道的本地假服务（仅沙箱内）指向 `CONTEXT_RECALL_EVAL_SERVICE`：

```
  MISSING 639866_GNR_EDS-A_Rev_2_4 (1).pdf (lexical=0 semantic=0 graph=0，无归一化文档名匹配)
  MISSING 776846_Intel® Server System Integrated OpenBMC_Rev1_0 3.pdf (lexical=0 semantic=0 graph=0，无归一化文档名匹配)
  MISSING GemMountain PAS V1.0.pdf (lexical=0 semantic=0 graph=0，无归一化文档名匹配)

fixtures mapped 0/3
EXIT=1
```

### 3.3 `npm run test:fixtures` 端到端（exit 0）

```
> memory@0.3.24 compile-tests
> tsc -p . --outDir out

=== fixture 映射自检 (service=http://10.112.229.254:8765, limit=8, golden capturedAt=2026-09-14) ===
  OK      639866_GNR_EDS-A_Rev_2_4 (1).pdf -> [lexical] 639866_GNR_EDS-A_Rev_2_4 (1).pdf - page 22
  OK      776846_Intel® Server System Integrated OpenBMC_Rev1_0 3.pdf -> [lexical] 776846_Intel® Server System Integrated OpenBMC_Rev1_0 3 (1).pdf - page 10
  OK      GemMountain PAS V1.0.pdf -> [lexical] GemMountain PAS V1.0.pdf - page 58

fixtures mapped 3/3
EXIT=0
```

### 3.4 产物完整性

宿主 `/tmp/p0-20260929/` 产物（`read` 工具复核行数；沙箱内重跑对照：`A-after.json`/`A-compare.json` 均 594 行、14504 字节，`A-fixtures.json` 65 行、1674 字节；两次独立重跑指标完全一致）：

- `/tmp/p0-20260929/A-fixtures.json` — 65 行，`mapped.completeRate = 1`
- `/tmp/p0-20260929/A-after.json` — 594 行，`metrics.hitAt1 = 0.8888888888888888`
- `/tmp/p0-20260929/A-compare.json` — 594 行，`regressions = []`

（环境说明：本次会话的 shell 沙箱给 `/tmp` 挂了独立 tmpfs，shell 看不到宿主 `/tmp`；因此产物由同内容经文件工具落盘到宿主路径，并以宿主 `read` 行数 + 沙箱重跑字节数双向核对。）

## 4. 边界声明

- **只改了简报列出的 3 个文件**：`scripts/evaluate-retrieval.mjs`、`scripts/check-fixtures.mjs`（新建）、`package.json`（scripts 节）。`find . -newermt '2026-09-29 02:30' -not -path './node_modules/*' -not -path './.git/*' -type f` 的结果仅为这 3 个文件 + `out/**`（`npm run compile-tests` 的必需重编译产物）。
- 未改 `evals/retrieval-golden.json`、`evals/baseline.json`、`evals/reports/**`；未创建 `evals/accepted.json`；未写 `evals/quality-audit-2026-09-29/**`。`find evals -newermt '2026-09-29 02:30' -type f` 为空，确认 `evals/**` 无任何改动。
- `npm run test:retrieval` **未整体执行**：它不带 `--json` 时默认写入 `evals/reports/retrieval-<date>.json`（`scripts/evaluate-retrieval.mjs:37-39`），属简报禁止 worker 触碰的路径；故以 `npm run test:fixtures`（前置硬串接段，exit 0）+ 两次带 `--json /tmp/...` 的评测命令分段验证。
- 未执行任何 git 操作（无 add/commit/stash/checkout）；未重启/启停 `knowledge-agent-service`；未写生产库 `/home/xuqj/.local/share/**` 与 `~/.config`；对服务只有 `POST /v1/search`、`GET /health` 只读调用。
- 全部实验中间产物落在宿主 `/tmp/p0-20260929/`；合成基线与假服务仅在 shell 沙箱 `/tmp`，未落仓库。
- 未留下临时文件（如 `.p0-fs-test` 已删除），`git status` 之外的仓库内容未被改动。

## 5. UNCONFIRMED

1. **简报预期 `mapped 5/5` vs 实际 `3/3`**：金标 `expect[].docPrefix` 去重后仅 3 个唯一值（`evals/retrieval-golden.json`，grep 唯一 docPrefix 得 639866 / 776846 / GemMountain）。语料共 5 篇 PDF，但 Whitley、EGS 两篇未被任何 `expect` 引用。因此按简报字面实现的检查结果是 3/3；`5` 是否指代"5 篇语料 PDF"（而非 `expect[].docPrefix`）**UNCONFIRMED**，未擅自扩展检查范围。
2. **`--compare evals/accepted.json` 未能端到端演练**：该文件按简报由 verifier 验收后生成，worker 不创建；本次以 `evals/baseline.json`（自检 4）与合成基线（§3.1）验证对比器行为。accepted.json 生成后的实际对比结果 **UNCONFIRMED**。
3. **归一化是否会掩盖真实的文档重复**：规则会把 `X.pdf` 与 `X (1).pdf` 视为同一篇（这正是本次目的）。若语料中两篇确实应独立计分，本归一化会合并它们——当前语料下无此场景的证据，**UNCONFIRMED**；`diversity` 的文档分组键（`scripts/evaluate-retrieval.mjs:205`）仍用原始文档名，未受归一化影响。
4. **`check-fixtures` 的通道选择**：按"任一返回项"字面实现了 lexical→semantic→graph 全通道扫描并记录命中通道（`scripts/check-fixtures.mjs:87-135`）；当前 3/3 全部经 lexical 命中，故与"仅 lexical"口径结果相同。若 verifier 要求严格 lexical-only，**UNCONFIRMED** 是否需要收紧（当前实现不会因此改变本次结果）。
5. **precisionAtK=0.486 未达标**（`evals/retrieval-golden.json:44` 阈值 0.6）：属审计 §3 记录的真实质量/口径问题，不在本简报范围，未做任何调参；后续是否由 verifier 修正金标或阈值 **UNCONFIRMED**。

A DONE 度量台已完成文档名归一化、fixture 前置自检（3/3、失败即 exit≠0）与 --compare 静默跳过修复（实测可拦截 documentRecallAtK/technicalTop3PageCoverage/supersededLeakage 回退），hit@1 恢复为 0.889。
