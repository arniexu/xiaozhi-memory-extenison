# OpenBMC 知识助手（Context Recall）记忆质量评估报告

- 评估日期：2026-09-29（UA 预注册条款冻结于任何测量之前，见 criteria.md，sha256 `a3f6379b…`，测量后未回改）
- 评估对象：服务 `knowledge-agent-service` v0.1.7 / commit `e83a387`（运行于 `http://10.112.229.254:8765`，started_at 2026-09-23T05:47:16Z，进程 cwd=仓库）；扩展 `knowledge-agent-extension` HEAD `db04463`（v0.3.24）
- 数据面快照（/health，见 raw/corpus-snapshot）：memory total=20571 / active=searchable=7963 / candidate=1040 / raw=11448 / continuity=568；vectors=8674；Neo4j nodes=8309 / rels=16383；active 文档=5 篇 PDF
- 方法论要求（2026-09-29 下达）：**所有测试必须有中间结果** —— 本报告第 5 节为逐步骤中间产物索引；唯一历史缺口（09-14 无原始响应留档）已通过本轮 `golden-raw` 捕获在制度上封堵

## 1. 总判定：**不通过（FAIL）**

- 硬不变量（H 类）全部通过；但 D1（数据卫生）失败、A1/A2/A3（效果）与 C1（可达率）未达标。
- 分级结论：**这不是"检索能力崩塌"** —— 实测显示答案内容大体仍被正确检索到（6 个技术用例的 top1 实为期望页，仅因文档改名 `(1)` 被评分系统判负；归一化后 hit@1=16/18=0.889，与 09-14 完全持平）。真正的问题分两类：
  1. **度量失养（占比最大）**：文档身份漂移 + 金标/探针 fixture 未随语料刷新，使"记忆质量的度量系统"当前不可信；
  2. **真实质量缺陷（独立于度量）**：测试污染仍在 active 且在线可检（09-16 又新增 4 条）；乱码查询拒答缺口（semantic 无下限、graph 噪音）；2 篇文档 7 个页样本全通道不可达；CI 门禁缺失；回归闸门指向过旧基线。

## 2. 条款判定总表（详见 criteria.md）

| ID | 指标 | 阈值 | 今日实测 | 判定 |
|---|---|---|---|---|
| A1 | hitAt1（primary 18 例） | ≥0.60；回退线 ≥0.889 | 0.556（归一化复算 0.889） | ❌ 跌破回退线（见 §3） |
| A2 | precisionAtK | ≥0.60 | 0.347（09-14: 0.549） | ❌ 且较 09-14 下降 |
| A3 | documentRecallAtK | ≥0.70 | 0.400（09-14: 0.800） | ❌ 且较 09-14 下降 |
| A4 | technicalTop3PageCoverage | ≥0.80 | 0.875（09-14: 0.775） | ✅ 转好 |
| A5 | smokeRate | =1.00 | 1.000 | ✅ |
| H1 | noResultAccuracy | ≥0.90（回退线 =1） | 1.000 | ✅（口径内） |
| H2 | supersededLeakage | =0 | 0 | ✅ |
| H3 | diversityRate | ≥0.85 | 1.000 | ✅ |
| C1 | 可达率（chat/mcp 等） | ≥80% | 75.0% 词法口径；跨通道复核 82.5% | ❌（口径分歧见 §4.4） |
| D1 | 测试污染残留 | =0 | 7 个 active 单元在线可检（含 6 条"烤面包"类） | ❌ |
| D2 | active 重复组 | 记录 | summary 重复组 1559（多为同页多 chunk）；fingerprint 重复 0 | 记录 |
| D3 | skills 端点 / raw 读路径 | 记录 | `/v1/capabilities/skills` = 200（404 不复现）；未见 raw/candidate 读端点 | 记录 |
| E1 | 跨文档链接 | 记录/通过条件 | v0.1.7 `/v1/search` 已无 document_links 字段（关系由 `graph` 通道承载）；乱码查询 graph=3 | 口径失效，转复核项 |
| E2 | 别名换词（PECI↔全称） | 记录 | top-8 文档重叠 2（639866、Whitley） | 记录 |
| E3 | 页码证据抽查 | 记录 | 技术类 top-3 页证据 21/24；3 个抽查查询 top3 全带页 | 记录 |
| F1 | 部署一致性 | 通过条件 | 运行 commit==仓库 HEAD，工作树 clean | ✅ |
| F2 | CI 门禁（评测进 CI） | 通过条件 | 两仓库均无 workflow | ❌ |
| F3 | 检索延迟（含本地嵌入） | 记录 | p50 606ms / p95 715ms（n=13） | 记录 |
| F4 | 决策呈现完整度 | 记录 | 决策类结果 status 标注齐全、泄漏 0 | 记录 |

## 3. 回归分解（核心发现：观测量下降的主因是"改名漂移"）

| 指标 | 09-14 终测 | 今日实测 | 分解 |
|---|---|---|---|
| hitAt1 | 0.889 | 0.556 | 10/18 基准命中 + 6 个用例被 `(1)` 改名破坏前缀匹配（tsod p107、crashdump p195、redfish p300、spd p70、global/legacy-tsod）= **归一化后 16/18 = 0.889，与 09-14 严格持平** |
| 真实边界变化 | — | — | dec-coverity-triage ↑（False→True）；tech-cpld-register ↓（top1 被新文档 Whitley EPS p104 占据）——一升一降净 0 |
| documentRecallAtK | 0.800 | 0.400 | 同受漂移压制（30 个期望文档引用中 11 个不可被匹配）+ 新文档竞争；因 09-14 无原始响应留档，无法精确分解（见 §7） |
| precisionAtK | 0.549 | 0.347 | 同上（漂移 + 新文档竞争 + chunk 摘要拥挤） |

因果链（可审计）：
1. `776846_…OpenBMC_Rev1_0 3.pdf` 于 **2026-09-17** 以 `…3 (1).pdf` 名重新入库（当日 1083 次 upsert，见 db-audit）；金标 docPrefix 仍为无 `(1)` 名 → 该文档所有返回项在评分器中不可命中。受影响的期望文档引用：**11/30**；受影响用例：11 个；**0 个期望文档从语料消失**（全部仍在库）。
2. 语料演进（供背景）：active 5576→7963（+43%）。导入/重索引波：09-17 776846×1083；09-20 Whitley EPS×1231；09-21 ≈2498；09-23 ≈2463；09-24 934。（来源：memory_events join memory_units）
3. 判定影响：A1/A2/A3 的"下降"中，至少 hit@1 可 100% 归因于改名漂移；docRecall/P@K 的漂移占比需修正金标后重测确认。

## 4. 分项发现

### 4.1 测试污染（D1 FAIL，真实缺陷）
- active 单元中仍有 7 条验收测试残留（3 条 09-11 原始 + **4 条 2026-09-16 新注入**：`烤面包通用流程`、`烤面包知识库缺口`、`验收测试污染`、`语义检索误召回`）。
- 在线可检：查询「如何烤面包」→ lexical 5 / semantic 2 / graph 5；「烤面包通用流程」→ 1/3/1（探针 json 有原始响应）。
- 与决策 f705999d 的修复方向（验收测试使用独立 KNOWLEDGE_AGENT_DATA_DIR）相比：未闭环。

### 4.2 拒答缺口（记录，bench 口径 H1 仍通过）
- 「zzz qqq 无意义」「qqq zzz 无意义」→ 各通道均返回 3 条（semantic 分 0.35–0.37，无下限；graph 返回 3 条决策类记忆）。与商业化硬门槛③（无证据阈值与引用闭环）一致，非本轮条款内但实证存在。
- 机制候选（未验证）：CJK 逐字索引的 any/CJK 通道对短 CJK 词过宽。

### 4.3 别名/换词（记录）
- 「PECI」返回 3 篇文档、「Platform Environment Control Interface」返回 4 篇，重叠 2 篇。n 过小，仅作趋势记录（aliases 覆盖率 0 的历史缺口未再单独测量）。

### 4.4 可达率（C1 口径分歧，重要）
- 预注册口径（脚本，lexical top-8 精确 id）：30/40 = 75%，判定 ❌（09-14: 32/40）。
- 补充跨通道复核（chat-multiroot 的 10 个 miss 样本）：3 个 memory 单元实际经 semantic(+graph) 可达 → 33/40 = 82.5%；按样本类型：**文档页 13/20 = 65%**、memory 单元 20/20。
- 10 个 miss 明细：7 个文档页（776846 的 p100/135/262、639866 的 p127/157/231/331——**均仍在库 active，非夹具孤儿**，属真实低排名/结构不可达）+ 3 个 memory 单元（词法通道不可达）。
- 结论：75% 判定按预注册方法有效；但"可检索到"的合理解释应为跨通道，且探针一半样本是 memory 单元、词法单通道计数偏严 —— **C1 需要 v2 口径**（通道感知 + 文档页占比）。

### 4.5 治理与运维
- F1 ✅：服务进程 cwd=仓库、运行 commit==HEAD、工作树 clean（09-14 的"线上落后"已消解）；扩展 HEAD db04463，14 项 dirty 为协作配置文件（未触及被测路径）。
- F2 ❌：两仓库均无 CI workflow；评测闸门未进 CI。
- 回归闸门缺陷：`--compare` 默认指向 09-14 **修复前** baseline.json，本次运行打出"0 项回退"——与真实回归无关，属假安心（报告 JSON 中 regressions=[] 会产生误导）。
- 代理陷阱（操作教训）：本机 shell 带企业代理（http_proxy=child-prc.intel.com:913），curl 直连服务必须 `--noproxy '*'`，否则会得到代理的 403 页面并误判为服务故障；node fetch 不受影响。

## 5. 中间结果与证据链（"所有测试必须有中间结果"执行清单）

| # | 步骤 | 中间结果文件（evals/quality-audit-2026-09-29/） |
|---|---|---|
| 1 | 条款冻结（测量前） | `criteria.md`（sha256 a3f6379b…） |
| 2 | 语料快照 | `raw/corpus-snapshot-2026-09-29.json` |
| 3 | 编译 | `raw/compile-tests-2026-09-29.log` |
| 4 | golden 24 例 | `raw/retrieval-2026-09-29.json` + `raw/triage-2026-09-29.txt` + `raw/bench-derived-2026-09-29.txt` |
| 5 | 可达率（标准口径） | `raw/reachability-2026-09-29.json` |
| 6 | 可达率（全量 miss 诊断） | `raw/reachability-detail-2026-09-29.json`（脚本 miss 上限 3 条的补强） |
| 7 | 可达率（跨通道复核） | `raw/reachability-channel-2026-09-29.json` |
| 8 | 实时探针（污染/链接/别名/延迟/决策） | `raw/probes-2026-09-29.json` + `raw/summary-2026-09-29.txt` |
| 9 | DB 只读审计（sqlite mode=ro） | `raw/db-audit-2026-09-29.txt` |
| 10 | 复算/逐用例差异/事件波 | `raw/summary2-2026-09-29.txt` |
| 11 | golden 全量原始响应（离线复算用） | `raw/golden-raw-2026-09-29.json`（24 例全通道原始响应） |
| 12 | 服务/仓库状态快照 | `raw/service-state-2026-09-29.txt` |
| 13 | 哈希清单 | `raw/hashes-2026-09-29.txt` + 本报告附录 B |
| — | 审计脚本（只读） | `probe.mjs`、`reachability-detail.mjs`、`reachability-channel-check.mjs`、`golden-raw-capture.mjs` |

复现命令（全部只读；注意 --noproxy）：
```
cd ~/knowledge-agent-extension
npm run compile-tests
node scripts/evaluate-retrieval.mjs --json evals/quality-audit-2026-09-29/raw/retrieval-2026-09-29.json
node scripts/evaluate-retrieval.mjs --reachability --json evals/quality-audit-2026-09-29/raw/reachability-2026-09-29.json
node evals/quality-audit-2026-09-29/probe.mjs > evals/quality-audit-2026-09-29/raw/probes-2026-09-29.json
```
注：09-14 的 raw 响应无留档 → P@K/docRecall 漂移占比不可精确分解；自本报告起，`golden-raw` 模式可随时离线重放与复算（用修正后的金标即可，无需重跑服务）。

## 6. 修复清单（按优先级）

- **P0-1 金标/探针 fixture 治理**：① 776846 以规范名重入库（或评分器加 "(1)" 归一化规则）；② 度量台运行前置自检——期望 docPrefix↔语料文档名映射完整率 <100% 即失败；③ 刷新 expectationsDerivedAt 并重跑锁定新基线；④ `--compare` 目标改为"最近验收基线"，杜绝跨代比较。
- **P0-2 污染闭环**：清理 7 个 active 污染单元；验收测试强制独立数据目录；active 内容自检（禁词/来自验收语料的指纹）。
- **P1-1 拒答与阈值**：semantic 通道默认 min_similarity 下限；乱码查询 graph 噪音复核；把门槛③做成 CI 用例。
- **P1-2 可达性专案**：2 篇文档 7 个页样本（639866 / 776846）真实不可达；排查 per-document limit / 近似页竞争；探针 v2 重抽样（通道感知、文档页为主）。
- **P2 CI 门禁（F2）**：把 `evaluate-retrieval.mjs --compare` 接入两仓库 CI（当前全缺）。

## 7. 可信度边界（本报告局限）

- hit@1 归一化复算基于留档的 top1 字段与 expect.pages 重匹配；内存类用例（dec/cjk）依赖 resolutionContains 的匹配未纳入复算——内存类不受改名影响，不影响主结论。
- 跨通道可达率复核仅在 chat-multiroot 的 10 个 miss 样本上抽查，非全量重定义。
- "Whitley EPS p104 是否为 CPLD register 的更优答案"未做领域真值复核 → 该用例判"排序变化"而非"质量下降"。
- DB 审计全程只读（`mode=ro`），未改动任何数据；服务未重启、未写库。
- 本轮仅验证到评估时点（2026-09-29）的快照；语料/服务此后任何变更需重跑并对照本报告哈希。

## 附录 A：冻结条款哈希
`criteria.md` = `a3f6379b3ffb62e99d076c5e074523ed8e16f253a7f25ff5cb8201bb4bb1cb17`（测量前后一致）

## 附录 B：全部证据文件哈希（sha256，2026-09-29 生成）

```
a3f6379b3ffb62e99d076c5e074523ed8e16f253a7f25ff5cb8201bb4bb1cb17  evals/quality-audit-2026-09-29/criteria.md
e6e64f13bc7cadc66c350e18607344fd51e78eeee6e374e750241d1f8584d6e4  evals/quality-audit-2026-09-29/golden-raw-capture.mjs
24e61babe468e0793a2a70af0c11db32020b0e5c067c4e86f701f4d8c9c5dc95  evals/quality-audit-2026-09-29/probe.mjs
93e2ac1668b217e8c2485ca09a548f60a623d51d22b01182a04ab425106bc78a  evals/quality-audit-2026-09-29/reachability-channel-check.mjs
c21908f26996c12ac597e8072b7c634e3f7be36dbea583bcc8ff8c6d5116d672  evals/quality-audit-2026-09-29/reachability-detail.mjs
d70d57f21e940d6fa608df4031b1ee0fbd298abf060140b99884d6d4c5b74655  evals/quality-audit-2026-09-29/raw/bench-derived-2026-09-29.txt
56d7113bb5bdaa33155013fda14a34c2b40c4ddd7ff9186762c2d791280e3ade  evals/quality-audit-2026-09-29/raw/compile-tests-2026-09-29.log
b376758d4745c2e855aff804941c5d1f7db23779d3b9ef6561c486f8cc11d97d  evals/quality-audit-2026-09-29/raw/corpus-snapshot-2026-09-29.json
80e05862debefd76aad4395d43b3fa6105a42fdc42864f7dc555d494b2c4bb99  evals/quality-audit-2026-09-29/raw/db-audit-2026-09-29.txt
1edebe718e180d4649d29d35fa4863a1f157237452152445908e5c1c53a39358  evals/quality-audit-2026-09-29/raw/golden-raw-2026-09-29.json
166cfc00e454da8d65ba0e52bd615281fe02ee7264c019bfeb7d9ab24543e532  evals/quality-audit-2026-09-29/raw/hashes-2026-09-29.txt
2b33cbffb38d04787f63a80b0a1e619fdb0dfb08d7b852ab00ba2722ee0d27eb  evals/quality-audit-2026-09-29/raw/probes-2026-09-29.json
c1c3c3471e9dad58fa1cd2343e979e7a03017a6397c13cb3f710cf636668e73b  evals/quality-audit-2026-09-29/raw/reachability-2026-09-29.json
d2fe159e82c8b4046b73d19d9226062fb9b2469d544e0ab8fad661d3a82bed10  evals/quality-audit-2026-09-29/raw/reachability-channel-2026-09-29.json
98023fcaf9d30b264961f1fc446b99f4c76a49d80b356cd67eb7cf712462e117  evals/quality-audit-2026-09-29/raw/reachability-detail-2026-09-29.json
fe35f061ed233d83a72d98880c54da6a85ca1d47fb6e99a83435038110496696  evals/quality-audit-2026-09-29/raw/retrieval-2026-09-29.json
7287e112350ddd978e45e25c8fb1d913c2e215a34cca3bb9deaf6a384f40ec85  evals/quality-audit-2026-09-29/raw/service-state-2026-09-29.txt
75f2c0968f02ccfe49e477056af01a6673d520e4d108dae6cc9b652d6a31a3c0  evals/quality-audit-2026-09-29/raw/summary-2026-09-29.txt
787dd98e62ee386be94a4e7d0bed2806e50b8994c8a26cfc20d0162311536f5c  evals/quality-audit-2026-09-29/raw/summary2-2026-09-29.txt
cc232e46da897f3592c2dc0efa378ff53834ec566d913298cb2238554ece7b08  evals/quality-audit-2026-09-29/raw/triage-2026-09-29.txt
```
