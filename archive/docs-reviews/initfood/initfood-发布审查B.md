# INITFOOD 发布结果审查 B（提交 daef0280，相对 6d4b21de；只读，未运行任何东西）

结论：approve。五项全部通过，附 3 个不阻断的提示。

## 1. settlements.json 只删了 4 个 food 键：通过
`git diff 6d4b21de daef0280 -- world/geo/settlements.json` 共 4 个 hunk，每个都是单行删除：`"food": 18000`（行 571）、`22000`（1529）、`22000`（2462）、`25000`（3441），上下文行（openingDay、seed）原样保留，缩进与逗号不变，无其它改动（`4 -` 无 `+`）。其余字节不变。删除值与清单、候选 before（18000、22000×2、25000）一致。

## 2. 回执链完整、supersedes 接对：通过
- L1：l1.json（entries 4、addedErrors []、modelCalls 0；removedErrors 为发布前登记 food 被新 schema 拒绝所产生的 48 条 schema 错误，发布后消失，非本批新错）。
- L2：review/ 下 4 个条目记录（status passed、attempts 0、contradictions []、frozenCandidate 的 entryHash/draftHash 在位），batch-0.json（passed 4、manual 0、pending 0）、summary.json（total 4、passed 4、manual 0）；budget-responses/ 4 份响应证据，requestHash 与 responseHash 与 budget.json 一致。
- L4：batch-0.json 与 summary.json 里 l4.approved true，reviewer/by 为 sonnet-initfood-L4，4 条逐条核对笔记（目标行号、回执路径、人口 × 295 的独立核算：23600/29500/28320/32450，与我之前核对的值一致）。
- publication：publication.json（revision initfood-1，4 条，before 值与 candidate.json 一致，after 为 `{"$remove":true}`，receipt 指向 world/drafts/initfood/review）。
- supersedes：8 条，分别指向 world/drafts/w1/village-ledgers/<村>.json#<村> 与 world/drafts/w1/village-ledgers/candidate.json#<村>，字段 economy.publicStock.food，4 个村 × 2，与批准范围一致；这些原回执文件在本提交里没有被改动（提交文件清单不含 w1/village-ledgers），指纹不受影响。

## 3. usage.jsonl 与 budget.json：通过
- usage.jsonl 4 行，每行 label 为 content-review-initfood-<村>-review0，usage：prompt 1294（缓存命中 640、未命中 654）、completion 7；单次费用上界 = (640×0.04 + 654×2 + 7×8)/1e6 = 0.0013896 元，4 次合计 0.0055584 元，与 budget.json 的 spentYuan、card.spentYuan、summary.json 完全一致；reservedYuan 0。
- budget.json requests 4 条且全部 status settled，无 unknown；4 次 ≤ maxRequests 40，0.0055584 ≤ 0.3，远在上限内；尝试数 attempts 0 / 每条仅 review0 一次，没有重试。
- 另：l1.json 与 cost-estimate.json 的 modelCalls 均为 0。

## 4. drafts 里没有 key 或令牌：通过
对 world/drafts/initfood/ 全目录大小写不敏感地 grep sk-…、api key、bearer、authorization、token（词边界）、DEEPSEEK_API、secret、password：0 命中。响应证据里只有请求体、响应体与用量（prompt_tokens/completion_tokens 属用量字段，不是令牌），无 header。

## 5. L4 时间序：通过（提示 1）
时间线（文件 mtime 与记录内时间戳）：prepare 07:03:09 → 4 次复核 07:03:12–07:03:15（usage.jsonl 07:03:15.72）→ L4 reviewedAt 07:04:44.000 → 批次记录写入 batch-0.json 07:05:12.74、summary.json 07:05:12.91 → publication.json 07:05:28.55（publishedAt 07:05:28.551Z）。L4 早于发布 44 秒，写入 L4 记录早于发布 16 秒。
- 提示 1：reviewedAt 是整秒（.000，手填值），与文件写入时间（07:05:12）相差约 28 秒，即"评审完成时间"早于"记录写入时间"，顺序合理，但这个时间戳是自报而非机器记录；没有矛盾，只是不能当精确时间使用。

## 提示（不阻断）
1. 同上：reviewedAt 为手填整秒。
2. L4 笔记已自述冻结的 basis 文字仍写 openingFood 与 primitives-body.mjs（实际读者已是 openingStockFood、farmTargetDays 已搬到 settlement-mouths.mjs）；basis 不写入世界数据，规律一致，不影响批准，笔记已记录，不必重冻。
3. L4 审阅者是 sonnet 子代理（sonnet-initfood-L4），不是独立的人；该批无正文、只删字段，核对内容是机械可复算的（人口×295、容量−种粮），我复算与笔记一致，可接受。

结论：approve。
