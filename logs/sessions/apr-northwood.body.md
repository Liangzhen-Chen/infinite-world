# 卡 APR：北林边已审条目补审的操作手册（只读，不调用付费模型）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/APR，分支 t-apr-northwood，基于 s5a@69174ba6。

## 背景
W8-E3 在 world/geo/locations.json 的 loc_hw_northwood.site 里新增了 nw_plantain、nw_honeysuckle 两个资源和两条再生规则（:381、391、402–403），没有经审批管线。world/design/a3-content-approval-content.mjs 的条目 **patch_loc_hw_northwood_site** 因此与已审指纹不符，tests/a3-content-approval.test.mjs 正确拦截（tools/content-pipeline.mjs:229）。
需按现有 L1/L2/L4 管线补审这一个条目（含 L2 publishedFacts.items 新增 item_plantain、item_honeysuckle），不得直接改哈希、指纹、summary/batch 或人工阅读凭据。

## 要做（只读+写手册，不执行付费步骤）
1. 读 world/design/a3-content-approval-content.mjs（run()：--prepare/--l1/--review/--publish/--verify）、tools/content-pipeline.mjs（runContentPipeline、reuseFrozenDrafts、readApprovedContent、预算文件）、world/drafts/a3-content-approval/ 目录结构。
2. 写出一份可直接照做的操作手册到 F:/dnd/logs/sessions/APR-runbook.md：
   - 让这一条目重新生成定稿并重审，需要移走/删除哪些文件（精确路径），哪些文件必须保留不动（同批其他条目的定稿、回执、summary 中其他条目）；
   - 依次执行的命令（含 --id 用法；注意 --prepare 会改写 foundation.json，说明是否需要、会不会丢掉其他条目）；
   - L1 是否能在沙箱内先跑（不联网），给出你实际跑 L1 的结果；
   - 付费步骤（--review）预计请求数与费用上限（读 budget.json 与 usage.jsonl 现状）；
   - 审完后如何 --verify、是否需要 --publish（发布必须核对整批），以及如何复跑 tests/a3-content-approval.test.mjs 验证；
   - 回滚办法（审核不过或出错时如何恢复到现状）。
3. 不改任何文件（手册除外），不联网，不调用 DeepSeek。

## 汇报
≤200 字：手册路径、L1 结果、预计费用、风险点。
