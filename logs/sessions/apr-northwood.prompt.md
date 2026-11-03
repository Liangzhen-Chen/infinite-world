【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

【交卡前必跑（10-26 起）】交卡前逐文件跑完以下检查并在汇报中写结果；不过的先修，不要留给门禁：
- CORE：tests/engine、tests/storage、tests/plugin；
- 同步四件套：先 `node tools/export-actions.mjs` 重导，再跑 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics。**不得重生成 advance-registry 金快照**（不得设 UPDATE_ADVANCE_GOLDEN）；若它因本卡有意改动而不一致，在汇报中逐项列出"字段：旧→新、原因"，由主会话审核后统一重生成。
- 本卡新增或修改的测试，以及本卡直接改到的模块的同名测试；
- 自查改动路径：不得触及禁区（docs/架构设计/、已审 W1 骨架 world/design/、dist/、docs/待办.md、docs/问题.md）。确有必要改的，停下写进汇报。
限时：60 分钟（到 50 分钟时停手写交接）。

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
