# APR 北林边条目补审操作手册

适用对象：`patch_loc_hw_northwood_site`。操作在 `F:/dnd-wt/APR`（分支 `t-apr-northwood`）执行。此手册只给出步骤；`--review` 是付费步骤，本卡未执行。

## 现状与复审对象

正式字段是 `world/geo/locations.json` 中 `loc_hw_northwood.site`。当前字段已经包含 `nw_plantain`、`nw_honeysuckle`，对应物品 `item_plantain`、`item_honeysuckle`。`contextFor()` 从地点 site 的全部资源自动生成 `publishedFacts.items`，所以新 L2 请求会带上三种资源所引用的物品（既有药草及两种新增物品）；无需手改回执或 publishedFacts。

L1 已在本 worktree 实跑：

```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
node world/design/a3-content-approval-content.mjs --l1 --id patch_loc_hw_northwood_site
```

结果：`{"entries":1,"L1":"passed"}`。L1 只读世界并做校验，不调用网络、不写审批草稿文件。

## 操作步骤

在开始前，把下面现存审批产物复制到工作目录外的备份目录（不要放回草稿目录，避免被程序当成输入）：

- `world/drafts/a3-content-approval/patch_loc_hw_northwood_site.json`
- `world/drafts/a3-content-approval/foundation.json`
- `world/drafts/a3-content-approval/batch-0.json`
- `world/drafts/a3-content-approval/batch-1.json`
- `world/drafts/a3-content-approval/batch-2.json`
- `world/drafts/a3-content-approval/summary.json`

不要删除或覆盖其他条目的定稿 JSON、L2 回执、任何 `budget-responses/` 文件，也不要改写 `budget.json` 或 `usage.jsonl`。现有北林边单条记录的指纹对应旧上下文；若需确保记录完全从头重建，可将上列北林边单条 JSON 单独移至备份目录。其余条目 JSON 必须留在原位供指纹复用。

### 1. 准备和复跑 L1

```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
node world/design/a3-content-approval-content.mjs --prepare
node world/design/a3-content-approval-content.mjs --l1 --id patch_loc_hw_northwood_site
```

`--prepare` 不是 L1/L2 的必需步骤；脚本运行时直接从正式世界文件重建 entries。若执行，必须不带 `--id`：它会完整重写 `foundation.json`，包括本 revision 的全部 entries/corrections，不会只保留北林边。`--prepare --id patch_loc_hw_northwood_site` 会把 foundation 改成单条，丢掉 foundation 中其他条目，禁止这样用。foundation 不是正式世界数据，也不作为审批证据。

### 2. 做单条 L2、保留整批状态

```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
node world/design/a3-content-approval-content.mjs --review
```

这里刻意不带 `--id`。`runContentPipeline()` 的 `--id` 过滤只影响当前输入列表，但它仍从 `batch-0.json` 开始编号，并重写 `summary.json`；单独运行 `--review --id patch_loc_hw_northwood_site` 会覆盖 batch-0 和整份 summary，造成同批及其他批次摘要/L4 状态丢失。完整运行时，其他记录的 entry/context/revision 指纹不变，会复用已有 passed 记录和冻结定稿；目标记录指纹因世界资源及 publishedFacts 改变而失效，`reuseFrozenDrafts` 会从当前 entry 的 `draftFor()` 冻结定稿，再请求 L2，不会请求起草模型。完整汇总会保留另外两批的样本及 L4。

完整运行会重写 `batch-0.json`、`batch-1.json`、`batch-2.json` 和 `summary.json`。前两批指纹不变时保留原 L4；北林边所在的 batch-2 指纹改变，其 L4 会被重置为未批准。需要人工重新阅读 batch-2 中列出的全部 12 条（包括其他 11 条），重新填写 `batch-2.json` 的 `l4.approved`、`reader`、`readAt`、逐条 `notes`；`summary.json` 中对应 batch 的 L4 镜像也要同步。北林边旧 L4 note 只描述 `item_herb`，不能沿用为新条目的阅读凭据。不得改 fingerprint、summary/batch 计数或把旧 note 当成人工阅读。

### 3. 费用上限

执行前账面现状：`budget.json` 的共享累计 `spentYuan=0.13146712`、`reservedYuan=0`；A3FIX 单卡额度 1 元，已花 0.13146712 元，可用 0.86853288 元。`usage.jsonl` 有 52 条既有请求记录；北林边旧 `review0` 实际记录费用为 0.00121912 元。因完整 `--review` 会跳过所有指纹未变且 passed 的条目，预计新增 1 次 DeepSeek Flash L2 请求；按旧请求只作参考，预估约 0.0012 元。流水线每条最多 3 次审查尝试；程序预算账会按请求体预留并硬停在共享/单卡 1 元上限，故本次最多新增费用不超过剩余额度 0.86853288 元（若达到该值即停止，不得绕过）。重试标签为 `review0`、`review1`、`review2`。本手册作者没有执行付费步骤。

### 4. L4、验证及发布

L2 返回后确认目标记录 `status=passed` 且无 hard contradiction；若为 `manual`/`pending` 或有硬矛盾，停止发布，保存记录并按下方回滚/复核处理。随后按上节完成 batch-2 全批 L4 人工阅读和回执，再执行：

```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
node world/design/a3-content-approval-content.mjs --verify
```

`--verify` 必须整批运行：它要求整批所有 entries 均已审批、所有批次 L4 有效，并逐项核对草稿与正式世界行。该 site 数据已经写入 `locations.json`；`publishContent()` 实际只会发布有登记纠正的 office 行，因此本次重新审批不需要 `--publish`。若后续确需发布纠正，必须不带 `--id`，让脚本先核对整批；发布前再次确认所有 entries/L4 都通过。

最后复跑拦截测试（单文件、独立进程；摘要过滤）：

```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
node --test --test-isolation=none tests/a3-content-approval.test.mjs 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40
```

## 回滚

若准备或复审前失败，可从备份恢复上述六个审批产物。若复审已发出请求，保留最新的 `budget.json`、`usage.jsonl` 和新增 `budget-responses/` 证据，绝不恢复旧预算账或删请求记录；只恢复审批产物快照，并将失败结果及已花费用交主会话处理。正式世界文件本流程不改写；不要为回滚去改 `locations.json`。审查失败时不发布，保留失败回执供后续处置。
