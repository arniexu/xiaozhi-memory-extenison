# B 任务报告：测试残留清理与自检（knowledge-agent-service）

- 日期：2026-09-29
- Repo：/home/xuqj/knowledge-agent-service（HEAD e83a387；未做任何 git 操作）
- 证据文件：`/tmp/p0-20260929/B-selfcheck-raw.txt`（6 项自检完整原始输出）、`B-before.json`、`B-after.json`
- 原始终端输出落盘说明：本会话的 bash 沙箱是 `bwrap --ro-bind / / --tmpfs /tmp --bind <repo> <repo>`（`/proc/self/mountinfo`），沙箱内 `/tmp` 是**每次调用即失的私有 tmpfs**，因此 bash 看不到编排方提供的 `/tmp/p0-20260929/memory.copy.sqlite3`。自检改为在沙箱内用 **SQLite backup API** 从生产库（`mode=ro&immutable=1`）重新生成一份 pristine 副本并放在**同名路径**上执行；上述证据文件通过 harness 文件工具写入真实 `/tmp/p0-20260929/`。

## 1. 结论摘要

| 项 | 结果 |
| --- | --- |
| 检测规则命中数（副本，清理前） | **16**，exit **1** ✅ 与 `pollution-inventory.txt` 的 16 个 active `knowledge:*` 完全一致 |
| dry-run | 打印 16 条命中 + Neo4j 命中计数（16 节点 / 39 边），**零改动**，exit 0 |
| apply（副本） | `superseded 16/16`、`memory_events +16`，备份路径 `/tmp/p0-20260929/memory.copy.sqlite3.backup-20260929T024618Z` |
| 清理后复检 | **residues 0**，exit **0** |
| 回读 | 16 个 id 全部 `superseded`；`memory_events` 72114 → 72130（+16 条 `supersede` 审计）；非 status 字段 diff = 0；行数 20571 → 20571（无物理删除）；豁免行 `knowledge:d36d1b9bff6138116732` 仍 `active` |
| `py_compile` | exit **0** |
| 生产库 | 全程只读（sha256 前后一致 `5b0648e7…e202`，mtime 仍为 2026-09-24 05:08:59） |
| 服务 | `active/running`，`ExecMainStartTimestamp=Wed 2026-09-23 05:47:11 UTC`，未重启 |

## 2. 变更清单（file:line）

改动文件恰好 3 个（`find -newermt` 证据见 §5）：

### 2.1 `scripts/check-test-residues.py`（新建，199 行，sha256 `94f230d036ea31525c9a97dc16a5b112689af3700e46f8bcf72a67597a72c327`）

| 位置 | 内容 |
| --- | --- |
| `scripts/check-test-residues.py:42-54` | 引导：复刻 `scripts/cleanup-xiaozhi-test-entities.py:13-26`（env 文件逐行解析 + 去引号 + `sys.path.insert` + `load_settings`） |
| `scripts/check-test-residues.py:57-73` | 内置 16-id 清单（09-11 批 11 条 + 09-16 批 5 条） |
| `scripts/check-test-residues.py:75-85` | 防误伤规则：`SUMMARY_KEYWORD_LIKE = "%面包%"` + `_TARGET_SQL`，**resolution 不出现** |
| `scripts/check-test-residues.py:91-112` | `open_readonly()`：`mode=ro` → 失败回退 `mode=ro&immutable=1`，并 `PRAGMA query_only=ON`；任何情况下不写库；读取失败打印 stderr 并 `raise SystemExit(2)`（:110-111） |
| `scripts/check-test-residues.py:114-120` | `find_residues()`：`status='active' AND id LIKE 'knowledge:%' AND (summary LIKE ? OR id IN (…))` |
| `scripts/check-test-residues.py:135-156` | `--json` 结构化结果（db/rule/count/residues/match 原因/`resolution_matched:false`） |
| `scripts/check-test-residues.py:158-195` | `main()`：`--db` 覆盖（缺省 `settings.memory_db`）+ 逐条 `id/type/status/created_at/summary[:60]` + `residues N` + `return 1 if rows else 0`（:195） |

### 2.2 `scripts/cleanup-test-residues.py`（新建，263 行，sha256 `3d2e56a6d95a48b40eb0551c57df9def006d33a65a3e3ef57c52b35a0cbb6407`）

| 位置 | 内容 |
| --- | --- |
| `scripts/cleanup-test-residues.py:48-61` | 同一引导先例；`memory_store.utc_now`（`memory_store.py:37-38`）与 `_json` 语义对齐（`memory_store.py:41-42`） |
| `scripts/cleanup-test-residues.py:64-69` | 复用 `check-test-residues.py` 的 `find_residues/open_readonly/match_reason/one_line`，检测规则单源、不漂移 |
| `scripts/cleanup-test-residues.py:78-100` | `--backup`：SQLite backup API 生成 `<db>.backup-<YYYYMMDDTHHMMSSZ>` |
| `scripts/cleanup-test-residues.py:102-142` | SQLite 应用段：`UPDATE memory_units SET status='superseded', updated_at=? WHERE id=? AND status='active'`（:112-114）+ `INSERT INTO memory_events(event_type,memory_id,detail_json,created_at)`（:120-134，形态对齐 `memory_store.py:204-207`）；`event_type='supersede'`（`memory_store.py` 只定义过 `'upsert'`，无专用类型）；`detail_json={"date":"2026-09-29","prev_status":"active","reason":"test-residue-cleanup"}`；单事务提交 |
| `scripts/cleanup-test-residues.py:154-192` | Neo4j 阶段（xiaozhi 先例 `cleanup-xiaozhi-test-entities.py:40-63`）：`MATCH (n:KnowledgeEntity) WHERE n.id IN $ids` 计数 → `DETACH DELETE` → 回读计数；先做 3s TCP 预检，失败报 `UNCONFIRMED` 且不影响 SQLite 结论 |
| `scripts/cleanup-test-residues.py:215-220` | 安全闸：生产路径 + `--apply` 无 `--confirm-production` ⇒ 打印拒绝、`return 2`（在任何 DB 访问之前） |
| `scripts/cleanup-test-residues.py:239-258` | 无命中/ dry-run / apply 分支；apply 的图谱删除条件 `allow_delete=production and args.confirm_production` |

**Neo4j 删除的额外安全闸（有意为之，见 §6-UNCONFIRMED-1）**：`--db` 指向副本时即使 `--apply` 也只做只读计数（`cleanup-test-residues.py:182-186`），避免"演练副本 apply"误删生产图谱；只有 `--db == settings.memory_db` 且带 `--confirm-production` 才执行 `DETACH DELETE`（:258）。

### 2.3 `README.md`（仅追加，140-164 行，sha256 `e639edc40f6467651e90a73a5dfdf06b89614227c45756bbca03c13ef32bb5f6`）

- `README.md:140-164`「验收/试验数据隔离（强制）」：`export KNOWLEDGE_AGENT_DATA_DIR=/tmp/...` 强制隔离（引用 `config.py:18-28,36-38`）、09-11/09-16 污染教训、`check-test-residues.py`（exit 1=违规）与 `cleanup-test-residues.py`（dry-run / `--apply` / `--backup` / `--confirm-production`）用法、检测规则与"只做状态转换、不物理删除、不动 vectors.sqlite3"约束。
- 追加位置：文件原最后一行为旧第 138 行，新小节从第 140 行开始，旧内容零改动（`sed -n '138,141p'` 证据见 §5）。

## 3. 检测规则对齐证据

- 生产库只读盘点（审计期）：`summary LIKE '%面包%'` 命中 **14**，内置清单补足 2 条（`knowledge:84e4d0c0590ca5c82365` 验收测试污染、`knowledge:ae1d4457d6d82bbdd0be` 语义检索误召回）→ 合计 **16**，与 `pollution-inventory.txt:2-23` 一致（原文 `count summary-like: (14,)` 见 `pollution-detail.txt:24`）。
- 防误伤红线验证：`knowledge:d36d1b9bff6138116732`（"检索管线缺陷"）的 `resolution` 含"面包内部熟成温度"，但规则不含 resolution → 清理后回读 `('knowledge:d36d1b9bff6138116732', 'active', '检索管线缺陷')`（§4 STEP 5）。
- 显式豁免集为空：脚本中不存在豁免列表/白名单逻辑。

## 4. 六项自检原始输出

> 完整逐字输出见 `/tmp/p0-20260929/B-selfcheck-raw.txt`。STEP 2/3 的 16 行命中清单与 STEP 1 逐字相同（唯一的差异是 dry-run 多 Neo4j 两行、apply 多 `backup/superseded` 行），此处为避免重复仅保留差异行并标注。

### STEP 1 `python3 scripts/check-test-residues.py --db /tmp/p0-20260929/memory.copy.sqlite3 --json /tmp/p0-20260929/B-before.json`（预期 residues 16 / exit 1）

```
db: /tmp/p0-20260929/memory.copy.sqlite3
production: no
rule: status='active' AND id LIKE 'knowledge:%' AND (summary LIKE '%面包%' OR id IN <builtin 16-id list>)
[1/16] id=knowledge:0bc5bc59e5e52f32f1db type=fact status=active created_at=2026-09-11T13:20:00.946Z match=id-list+keyword summary=面包烘烤温度时间
[2/16] id=knowledge:25b0da6f42ec47cf390d type=concept status=active created_at=2026-09-11T14:57:46.454Z match=id-list+keyword summary=面包烘焙
[3/16] id=knowledge:32b9fe36bcf3cc399434 type=fact status=active created_at=2026-09-11T13:20:00.946Z match=id-list+keyword summary=面包内部熟成温度
[4/16] id=knowledge:451e92becddaa0ee11f3 type=fact status=active created_at=2026-09-11T14:57:46.454Z match=id-list+keyword summary=基础面包配方
[5/16] id=knowledge:6601cf70895d4d95d84d type=workflow status=active created_at=2026-09-11T13:20:00.946Z match=id-list+keyword summary=基础面包烘焙流程
[6/16] id=knowledge:84e4d0c0590ca5c82365 type=fact status=active created_at=2026-09-16T07:30:13.864Z match=id-list summary=验收测试污染
[7/16] id=knowledge:914bd94df49c3089ac0a type=fact status=active created_at=2026-09-16T07:30:13.864Z match=id-list+keyword summary=烤面包知识库缺口
[8/16] id=knowledge:ae1d4457d6d82bbdd0be type=fact status=active created_at=2026-09-16T07:30:13.864Z match=id-list summary=语义检索误召回
[9/16] id=knowledge:cb1b93daa0216c0e7566 type=workflow status=active created_at=2026-09-16T07:30:13.864Z match=id-list+keyword summary=烤面包通用流程
[10/16] id=knowledge:cbc2e2c50b435925abae type=concept status=active created_at=2026-09-11T13:20:00.946Z match=id-list+keyword summary=烤面包
[11/16] id=knowledge:da7cb9f0b6391ec164a0 type=fact status=active created_at=2026-09-11T14:57:46.454Z match=id-list+keyword summary=面包熟度判断
[12/16] id=knowledge:dd578bb0344f1dac23d8 type=fact status=active created_at=2026-09-16T07:30:13.864Z match=id-list+keyword summary=面包烘烤温度时间
[13/16] id=knowledge:ddc7c273a80ddfc689a0 type=fact status=active created_at=2026-09-11T13:20:00.946Z match=id-list+keyword summary=面包发酵条件
[14/16] id=knowledge:e6ebf34f8a0322ad339c type=decision status=active created_at=2026-09-16T07:30:13.864Z match=id-list+keyword summary=将如何烤面包视为独立检索请求
[15/16] id=knowledge:f79109a9879e57262102 type=workflow status=active created_at=2026-09-11T13:21:23.460Z match=id-list+keyword summary=烤面包
[16/16] id=knowledge:f89d0968e6bba06086d9 type=fact status=active created_at=2026-09-11T13:20:00.946Z match=id-list+keyword summary=面包常见失败点
residues 16
json: /tmp/p0-20260929/B-before.json
step1 exit=1
```

### STEP 2 `python3 scripts/cleanup-test-residues.py --db /tmp/p0-20260929/memory.copy.sqlite3`（dry-run，预期 16 命中 + Neo4j 计数，exit 0）

```
db: /tmp/p0-20260929/memory.copy.sqlite3
production: no
mode: dry-run
[1/16] … [16/16]   ← 与 STEP 1 的 16 行逐字相同（完整输出见 B-selfcheck-raw.txt）
residues 16
Neo4j 命中节点: 16 ｜ 关联边: 39
Neo4j: 只读计数（dry-run 不做任何改动）
dry-run：未做任何改动；加 --apply 执行
step2 exit=0
```

### STEP 3 `python3 scripts/cleanup-test-residues.py --db /tmp/p0-20260929/memory.copy.sqlite3 --apply --backup`

```
db: /tmp/p0-20260929/memory.copy.sqlite3
production: no
mode: apply
[1/16] … [16/16]   ← 与 STEP 1 的 16 行逐字相同（完整输出见 B-selfcheck-raw.txt）
residues 16
backup: /tmp/p0-20260929/memory.copy.sqlite3.backup-20260929T024618Z
superseded knowledge:0bc5bc59e5e52f32f1db
superseded knowledge:25b0da6f42ec47cf390d
superseded knowledge:32b9fe36bcf3cc399434
superseded knowledge:451e92becddaa0ee11f3
superseded knowledge:6601cf70895d4d95d84d
superseded knowledge:84e4d0c0590ca5c82365
superseded knowledge:914bd94df49c3089ac0a
superseded knowledge:ae1d4457d6d82bbdd0be
superseded knowledge:cb1b93daa0216c0e7566
superseded knowledge:cbc2e2c50b435925abae
superseded knowledge:da7cb9f0b6391ec164a0
superseded knowledge:dd578bb0344f1dac23d8
superseded knowledge:ddc7c273a80ddfc689a0
superseded knowledge:e6ebf34f8a0322ad339c
superseded knowledge:f79109a9879e57262102
superseded knowledge:f89d0968e6bba06086d9
sqlite: superseded 16/16 ｜ memory_events +16
Neo4j 命中节点: 16 ｜ 关联边: 39
Neo4j: 只读计数（--db 非生产库，图谱删除仅在 --confirm-production 的生产 apply 执行）
step3 exit=0
```

### STEP 4 重跑 STEP 1（预期 residues 0 / exit 0）

```
db: /tmp/p0-20260929/memory.copy.sqlite3
production: no
rule: status='active' AND id LIKE 'knowledge:%' AND (summary LIKE '%面包%' OR id IN <builtin 16-id list>)
residues 0
json: /tmp/p0-20260929/B-after.json
step4 exit=0
```

### STEP 5 python3 内联 sqlite 回读（pristine 备份 vs 清理后副本）

```
pristine_reference_backup: /tmp/p0-20260929/memory.copy.sqlite3.backup-20260929T024618Z
status_counts_after: {'superseded': 16}
events_total: pristine=72114 -> cleaned=72130 (+16)
supersede_events_for_targets: 16
event_type_distribution_cleaned: {'supersede': 16, 'upsert': 72114}
-- 16 new audit rows (id | event_type | memory_id | detail_json | created_at) --
72115 supersede knowledge:0bc5bc59e5e52f32f1db {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72116 supersede knowledge:25b0da6f42ec47cf390d {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72117 supersede knowledge:32b9fe36bcf3cc399434 {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72118 supersede knowledge:451e92becddaa0ee11f3 {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72119 supersede knowledge:6601cf70895d4d95d84d {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72120 supersede knowledge:84e4d0c0590ca5c82365 {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72121 supersede knowledge:914bd94df49c3089ac0a {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72122 supersede knowledge:ae1d4457d6d82bbdd0be {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72123 supersede knowledge:cb1b93daa0216c0e7566 {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72124 supersede knowledge:cbc2e2c50b435925abae {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72125 supersede knowledge:da7cb9f0b6391ec164a0 {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72126 supersede knowledge:dd578bb0344f1dac23d8 {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72127 supersede knowledge:ddc7c273a80ddfc689a0 {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72128 supersede knowledge:e6ebf34f8a0322ad339c {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72129 supersede knowledge:f79109a9879e57262102 {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
72130 supersede knowledge:f89d0968e6bba06086d9 {"date": "2026-09-29", "prev_status": "active", "reason": "test-residue-cleanup"} 2026-09-29T02:46:18Z
-- per-id: status | created_at (unchanged) | updated_at (new) --
knowledge:0bc5bc59e5e52f32f1db superseded 2026-09-11T13:20:00.946Z 2026-09-29T02:46:18Z
knowledge:25b0da6f42ec47cf390d superseded 2026-09-11T14:57:46.454Z 2026-09-29T02:46:18Z
knowledge:32b9fe36bcf3cc399434 superseded 2026-09-11T13:20:00.946Z 2026-09-29T02:46:18Z
knowledge:451e92becddaa0ee11f3 superseded 2026-09-11T14:57:46.454Z 2026-09-29T02:46:18Z
knowledge:6601cf70895d4d95d84d superseded 2026-09-11T13:20:00.946Z 2026-09-29T02:46:18Z
knowledge:84e4d0c0590ca5c82365 superseded 2026-09-16T07:30:13.864Z 2026-09-29T02:46:18Z
knowledge:914bd94df49c3089ac0a superseded 2026-09-16T07:30:13.864Z 2026-09-29T02:46:18Z
knowledge:ae1d4457d6d82bbdd0be superseded 2026-09-16T07:30:13.864Z 2026-09-29T02:46:18Z
knowledge:cb1b93daa0216c0e7566 superseded 2026-09-16T07:30:13.864Z 2026-09-29T02:46:18Z
knowledge:cbc2e2c50b435925abae superseded 2026-09-11T13:20:00.946Z 2026-09-29T02:46:18Z
knowledge:da7cb9f0b6391ec164a0 superseded 2026-09-11T14:57:46.454Z 2026-09-29T02:46:18Z
knowledge:dd578bb0344f1dac23d8 superseded 2026-09-16T07:30:13.864Z 2026-09-29T02:46:18Z
knowledge:ddc7c273a80ddfc689a0 superseded 2026-09-11T13:20:00.946Z 2026-09-29T02:46:18Z
knowledge:e6ebf34f8a0322ad339c superseded 2026-09-16T07:30:13.864Z 2026-09-29T02:46:18Z
knowledge:f79109a9879e57262102 superseded 2026-09-11T13:21:23.460Z 2026-09-29T02:46:18Z
knowledge:f89d0968e6bba06086d9 superseded 2026-09-11T13:20:00.946Z 2026-09-29T02:46:18Z
non_status_field_diffs (expect 0): 0
rows_total: pristine=20571 cleaned=20571
exempt_row: ('knowledge:d36d1b9bff6138116732', 'active', '检索管线缺陷')
active_knowledge_after: 2474
active_after: 7947
step5 exit=0
```

（`non_status_field_diffs` 是 16 行 × 除 `status`/`updated_at` 外全部列与 pristine 备份逐列比对，结果为 0，证明"只改状态 + 时间戳"。）

### STEP 6 `python3 -m py_compile scripts/check-test-residues.py scripts/cleanup-test-residues.py`

```
step6 exit=0
```

### 附加 A 读取错误退出码（自证，非要求项）

```
===== EXTRA A: read-error path → expect exit 2 =====
无法只读打开数据库 /tmp/p0-20260929/does-not-exist.sqlite3: unable to open database file
db: /tmp/p0-20260929/does-not-exist.sqlite3
production: no
rule: status='active' AND id LIKE 'knowledge:%' AND (summary LIKE '%面包%' OR id IN <builtin 16-id list>)
read-error exit=2
```

### 附加 B 生产安全闸（自证，非要求项）

```
===== EXTRA B: production safety gate (simulated production data dir, path = sandbox copy) =====
拒绝执行：--db 指向生产库且带 --apply；需显式追加 --confirm-production
db: /tmp/p0-20260929/prod-sim/memory.sqlite3
production: yes
mode: apply
gate-without-confirm exit=2 (expect 2)
```

用 `KNOWLEDGE_AGENT_DATA_DIR=/tmp/p0-20260929/prod-sim`（env 文件里 `KNOWLEDGE_AGENT_DATA_DIR` 是注释掉的，见 §5 证据，故 shell 变量生效）让 `settings.memory_db == --db`，从而在**不接触真实生产路径**的前提下验证拒绝分支；脚本在任何 DB 访问之前 `return 2`（`cleanup-test-residues.py:215-220`）。

## 5. 边界声明与证据

- **只改了 3 个文件**：`README.md`（仅追加 140-164 行）、`scripts/check-test-residues.py`（新建）、`scripts/cleanup-test-residues.py`（新建）。`find . -type f -newermt '-3 hours'`（排除 `.git/.venv/.runtime/.pytest_cache/.tmp-tests`）输出恰为这 3 个文件；未动 `src/**`、`tests/**`、`systemd/**`、`pyproject.toml`。
- **未做 git**：没有 `git add/commit/stash/checkout` 等任何 git 命令。
- **未重启/启停服务**：`systemctl --user show knowledge-agent-service` → `ActiveState=active`、`SubState=running`、`MainPID=853079`、`ExecMainStartTimestamp=Wed 2026-09-23 05:47:11 UTC`、`NRestarts=5`（B 任务期间无新增重启）。
- **未写生产库/`~/.config`**：生产库只以 `mode=ro&immutable=1` 打开用于生成副本；前后 sha256 一致（`5b0648e7a9c35cfe3b70723f5a4d870ce0089be8a1e0f0a9a03fbeb0d486e202`），mtime 仍为 `2026-09-24 05:08:59`；`vectors.sqlite3`（12779520，mtime 2026-09-24 05:08:59）与 `events.jsonl`（9875535，mtime 2026-09-24 05:08:59）均为 0 次写入。`cleanup-test-residues.py` 里没有任何 `vectors` 代码路径。
- **实验只在 `/tmp/p0-20260929/` 与沙箱私有 `/tmp`**：生产库 → 只读副本 → 副本上 apply；`prod-sim` 目录亦是副本拷贝。
- **原始输出落盘**：`/tmp/p0-20260929/B-selfcheck-raw.txt`（6 项自检 + 附加 A/B + 边界证据的完整原始输出）、`B-before.json`、`B-after.json`、`B-boundary-evidence.txt`；本报告。以上均为**最终字节版本**下的同一次运行。
- 沙箱限制（环境事实，非偏差）：bash 侧 `/proc/self/mountinfo` 显示 `--ro-bind / /`、`--tmpfs /tmp`、`--bind <repo> <repo>`；真实 `/tmp/p0-20260929/` 只能由 harness 文件工具读写，故证据文件经文件工具落盘、副本在沙箱内用 backup API 重建。`/tmp/p0-20260929/probe-tool.txt` 是 harness 沙箱探测遗留的探针文件，非本任务产物，可删。

## 6. UNCONFIRMED

1. **Neo4j `DETACH DELETE` 未执行（设计使然）**：副本 apply 只做了只读计数（命中 16 节点 / 39 边，`B-selfcheck-raw.txt` STEP 2/3）。删除路径（`cleanup-test-residues.py:187-190`）与删除后回读未被执行——生产图谱写入按简报由 verifier 执行。verifier 可运行：`python3 scripts/cleanup-test-residues.py --apply --backup --confirm-production`（对生产库；该命令同时会做 SQLite 状态转换与图谱删除）。
2. **编排方提供的真实副本未被 bash 打开**：`/tmp/p0-20260929/memory.copy.sqlite3`（编排方提供）在沙箱中不可见；自检使用的是同路径重新生成的副本。等价性依据：两者都取自同一生产库且生产库 mtime 自 2026-09-24 05:08:59 未变；但未对编排方副本做哈希比对 → UNCONFIRMED。
3. **服务进程内状态**：生产 apply 后是否需要重启服务（例如语义/向量通道可能仍返回已 superseded 单元）未验证。`knowledge:d36d1b9bff6138116732` 的 resolution 记录「/v1/search semantic 路径不过滤 status/kind」，与本任务 `supersededLeakage` 相关 → UNCONFIRMED（属 A/verifier 范围）。
4. **真实生产路径下的 `--confirm-production` 闸门**：只验证了"模拟生产路径"拒绝分支（exit 2）；未对真实生产路径执行任何 `--apply`（遵守禁写约束）。
5. **生产库当前仍为 16 条残留 active**：本任务只在 `/tmp` 副本上闭环，生产清理需 verifier apply → 生产侧 residue 数预期仍为 16，UNCONFIRMED（未在 B 阶段复查生产，避免与"只读副本"约束冲突；审计期只读盘点结果为 16）。

## 7. 建议（未实施；超出独占文件范围）

1. **写入侧护栏（src 层）**：在 `MemoryStore`/`api.py` 的写路径上加验收模式检查——当 `KNOWLEDGE_AGENT_ACCEPTANCE=1`（或 CLI `--acceptance`）时强制 `KNOWLEDGE_AGENT_DATA_DIR != 默认生产目录`，否则拒绝写入。仅靠文档约定不足以防止再次污染（`legacy_db-guard.py` 已有"拒绝生产目录"的同类先例可复用）。
2. **状态转换 API**：`memory_store.py` 只有 `upsert` 一种事件写入形态（`memory_store.py:204-207`），本任务首次使用 `event_type='supersede'`。建议在 `MemoryStore` 增加 `set_status()`，把 `UPDATE + memory_events` 收口到 store 内，避免清理脚本手写 SQL 漂移。
3. **语义通道过滤**：核对并修复"semantic 路径不过滤 status/kind"（`knowledge:d36d1b9bff6138116732` 的 resolution 已记录）；否则 superseded 残留仍可能被语义召回，`supersededLeakage` 指标应据此设阈。`vectors.sqlite3` 保留旧向量属预期（本任务不清理），检索侧负责过滤。
4. **CI/巡检接入**：把 `python3 scripts/check-test-residues.py`（exit 1 = 违规）挂到验收流水线尾部，针对只读快照运行；可加 `--json` 归档。
5. **清理命令默认更保守**：`--apply` 目前只有 `--backup` 是可选；建议"`--apply` 未带 `--backup` 时要求额外确认"或默认自动备份。
6. **清单单源化**：16-id 内置清单是硬编码（`check-test-residues.py:57-73`），长期会漂移；建议改为随仓库维护的显式清单文件（summary 关键词仍保留为兜底）。
7. **副本演练惯例写进 README 之外**：可考虑在 `scripts/` 增加一个"生成只读演练副本"的小工具（backup API + `chmod 0444`），与 `legacy-db-guard.py:122` 的快照做法一致。

## 8. 关键指纹（便于 verifier 比对）

| 文件 | sha256 |
| --- | --- |
| `README.md` | `e639edc40f6467651e90a73a5dfdf06b89614227c45756bbca03c13ef32bb5f6` |
| `scripts/check-test-residues.py` | `94f230d036ea31525c9a97dc16a5b112689af3700e46f8bcf72a67597a72c327` |
| `scripts/cleanup-test-residues.py` | `3d2e56a6d95a48b40eb0551c57df9def006d33a65a3e3ef57c52b35a0cbb6407` |
| 生产库（B 任务前后一致） | `5b0648e7a9c35cfe3b70723f5a4d870ce0089be8a1e0f0a9a03fbeb0d486e202` |
| 演练备份（副本清理前 pristine） | `/tmp/p0-20260929/memory.copy.sqlite3.backup-20260929T024618Z`（沙箱内生成，会话结束即失） |
