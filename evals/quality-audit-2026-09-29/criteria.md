# 记忆质量评估条款（Criteria）· 预注册版

- 注册时间：2026-09-29（在当日任何复测运行**之前**冻结；测量完成后只在 report.md 中引用，本文件不回改）
- 评估对象：OpenBMC 知识助手（Context Recall）
  - 服务：knowledge-agent-service v0.1.7 / commit e83a387 / http://10.112.229.254:8765 / started_at 2026-09-23T05:47:16Z
  - 扩展：knowledge-agent-extension HEAD db04463（v0.3.24）
  - 数据面快照（2026-09-29 采集，见 raw/corpus-snapshot-2026-09-29.json）：memory total=20571 / active=searchable=7963 / candidate=1040 / raw=11448 / continuity=568；vectors=8674；Neo4j nodes=8309 / rels=16383
- 条款来源标注：[D] 既往决策（出处 ID）；[B] 度量台预置阈值（evals/baseline.json targets，2026-09-14 冻结）；[N] 本次新增观测项（首次测量、无历史阈值，数值作为后续复测对比基线）
- 判定规则：硬不变量（H 类）任一失败 ⇒ 整体不通过；A/B/C/D1/F1/F2 按阈值判定；[N] 观测项只记录数值、不设通过线
- 冻结后不得因测量结果回改阈值；阈值若需变更须另开 v2 并注明原因

## A 效果类（golden set 24 例：technical 12 / decision 4 / cjk 5 / unrelated 3）

| ID | 指标 | 定义（脚本口径） | 阈值 | 来源 | 2026-09-14 基线 |
|---|---|---|---|---|---|
| A1 | hitAt1 | 首条命中匹配期望（docPrefix+页/keyPages）的用例比例 | ≥0.60；另有回退线：不得低于 0.889 | [B][D:25aaf731] | 0.889 ✅ |
| A2 | precisionAtK | top-K（K≤8）命中率均值 | ≥0.60 | [B] | 0.549 ❌ |
| A3 | documentRecallAtK | 期望文档覆盖率 | ≥0.70 | [B] | 0.800 ✅ |
| A4 | technicalTop3PageCoverage | 技术类用例 top-3 含正确页比例 | ≥0.80 | [B] | 0.775 ❌ |
| A5 | smokeRate | 有非空返回的用例比例 | =1.00 | [B] | 1.000 ✅ |
| A6 | recallAtK（诊断） | 期望页召回（口径 09-14 已改，不可跨版本比较） | 不判定 | [B 诊断] | 0.431 |
| A7 | pageEvidenceCoverage（诊断） | 返回项含页码的比例 | 不判定 | [B 诊断] | 0.363 |

## H 硬不变量类（任一失败 = 整体不通过）

| ID | 指标 | 定义 | 阈值 | 来源 | 2026-09-14 基线 |
|---|---|---|---|---|---|
| H1 | noResultAccuracy | 无关查询正确返回空的比例 | ≥0.90；回退线 =1.000 | [B][D:25aaf731] | 1.000 ✅ |
| H2 | supersededLeakage | 返回结果中非 active 记录数 | =0 | [B][D] | 0 ✅ |
| H3 | diversityRate | 结果多样度（09-14 口径：不同文档数足够时才计分） | ≥0.85 | [B] | 1.000 ✅ |

## C 可达性/范围类（reachability probe：40 抽样 × 5 调用方）

| ID | 指标 | 定义 | 阈值 | 来源 | 2026-09-14 基线 |
|---|---|---|---|---|---|
| C1 | 主路径可达率 | chat/mcp/(dashboard) 可检索到抽样记忆的比例 | ≥80% | [D:8d4ee195] | chat 32/40、mcp 32/40、dashboard 33/40 |
| C2 | 调用方矩阵 | chat-multiroot / chat-single / mcp / dashboard / legacy-uri 各自数值 | 记录 | [N] | 32/32/32/33/32 |

## D 数据卫生类（P2 缺陷验收）

| ID | 指标 | 定义 | 阈值 | 来源 | 2026-09-14 状态 |
|---|---|---|---|---|---|
| D1 | 测试污染残留 | active 记忆中「烤面包」等验收测试残留的可检索命中数 | =0 | [D:f705999d] | 待复测（09-14 存在且带向量） |
| D2 | active 内容级重复组 | SQLite 只读 GROUP BY（内容规范化）count>1 的组数 | 记录（基线待定） | [N] | 683 行/283 组（含 raw/candidate，非 active 口径） |
| D3 | raw/candidate 可达性 | /v1/capabilities/skills 返回 200；raw/candidate 存在读路径 | 记录 | [D:f705999d] | 09-14：404/不可读 |

## E 证据与链接类

| ID | 指标 | 定义 | 判定 | 来源 | 参照值 |
|---|---|---|---|---|---|
| E1 | 跨文档链接查询相关性 | 无关查询 DocumentLink=0；相关查询链接 resolution 含本次命中实体 | 通过条件 | [D: v0.1.6 验收] | TSOD→3、crashdump→3、乱码→0（09-11/09-14） |
| E2 | 别名/换词鲁棒性 | "PECI" vs "Platform Environment Control Interface" top-8 结果文档重叠率 | 记录（已知缺口：aliases 覆盖率 0） | [N] | 未测 |
| E3 | 页码证据抽查 | 3 个技术查询的 top-3 中含页码条数 | 记录 | [N] | — |

## F 运维/治理类

| ID | 指标 | 定义 | 判定 | 来源 | 09-14 状态 |
|---|---|---|---|---|---|
| F1 | 部署一致性 | 运行 commit == 仓库 HEAD 且工作树 clean；服务进程 cwd 指向仓库 | 通过条件 | [D:3b8f24bc ⑤] | 未满足（线上落后/改动未提交） |
| F2 | CI 门禁 | 两仓库存在端到端检索评测 workflow | 通过条件 | [D:3b8f24bc ④] | 未满足 |
| F3 | 检索延迟 | /v1/search p50 / p95（探针 n≈9） | 记录 | [N] | 未测 |
| F4 | 决策呈现完整度 | decision 类查询返回项带 status/scope 标注的比例 | 记录 | [N] | 未测 |

## 复现命令（全部只读；注意本机 shell 带企业代理，curl 必须 --noproxy）

1. 语料快照：`curl -s --noproxy '*' http://10.112.229.254:8765/health -o raw/corpus-snapshot-2026-09-29.json`
2. golden：`cd ~/knowledge-agent-extension && npm run compile-tests && node scripts/evaluate-retrieval.mjs --json evals/quality-audit-2026-09-29/raw/retrieval-2026-09-29.json`
3. reachability：`node scripts/evaluate-retrieval.mjs --reachability --json evals/quality-audit-2026-09-29/raw/reachability-2026-09-29.json`
4. 探针：`node evals/quality-audit-2026-09-29/probe.mjs > evals/quality-audit-2026-09-29/raw/probes-2026-09-29.json`
5. DB 只读审计：`python3` + `sqlite3 mode=ro`（脚本头见 raw/db-audit-2026-09-29.txt）

## 输出物

- report.md（判定与证据索引）
- raw/（bench 报告、探针 JSON、DB 审计、快照；report 附录列 sha256）
- Continuity 决策登记（本仓库 .continuity）
