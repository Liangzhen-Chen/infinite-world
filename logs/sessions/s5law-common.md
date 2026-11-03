# S5 规律卡共同规则（W1 起）

- 先读：docs/产品原则.md（北极星）；docs/架构设计/05-统一模型.md §5.1.1–§5.1.4 与 §5.7"差异、噪声与少数行为"、14 §14.5.1（10-29 修订）；F:/dnd/logs/audit/LAW-astra-001/s5-cards.md 的 §0（公共约束与共同验收 C）和本卡全节。卡节写的规律、文件所有权、原语、手算、验收、并行边界都是本卡的范围。
- 基于 t-town@1d9cf7ee（由 law-card.sh 从 git 生成）：s5a 已合入分支 farmhunt perfs8 farmhunt ct07 s5ca2 s5ct s5cb fixt164 fixk08 fixpub tri2 k14-law k13-soak k10b-public k07-law perf-s5law2 perf-s5law fxm k06-law k08-law fxe6 k04-law apr-northwood fxe3 fxe8 k09-law k10-law k05-law st-triage k02-law s508-anchors k12-law k01-law k03-law k11-epidemic w8e10-eventsize w8e8-premises w8e9-scenarios w8e6-leftovers w8e1-carryfix w8e5-playthrough w8e3-consumers w8e7-reanchor w8e4-capacity w8e2-todo w8a-price w8d-service w8b-credit s5p1 s5w4 s5w8a s5d1 s5w2b s5w6 s504 s508 s509 s5w7 s503f s5ca s5r1 。其他在做的卡见主会话说明；未在此列出的卡均未合入。
- 文件所有权按禁区理解（2026-11-02 起）：卡里“不得改”的文件归其他在做的卡，碰之前停下交主会话；卡里“可改”只是预计要改的文件，不是白名单。没列为“不得改”的其他文件，需要时可以直接改，但只做本卡规律需要的最小改动，并在交接里逐个列出文件和理由。
- 只改本卡节"文件与函数所有权"列出的文件（加你新建的文件）。必须改别的文件时不改，写进汇报（文件:行与原因）。
- 派生优先：数值从世界状态与规则表派生，不手填、不按 ID/名字特判；不为测试造接口、人物、地点或内容；不删测试、不放宽断言；每条新用例带手算锚点注释。
- 随机性：个体差异与决策噪声只经现有种子抽签（14 §14.5.1），同版重放结果一致。机制正确性用零噪声或固定种子对照验证。
- 金快照不得重生成；若变化，用 `node F:/dnd-tools/golden-diff/golden-dump.mjs` 在 S5A 与本树各导一份，再 golden-diff.mjs 对比，按"字段｜旧→新｜原因"写进 F:/dnd/logs/sessions/<卡名>-golden-table.md。
- 持久化只存整数或有理数；`node tools/numeric-digest.mjs` 若变化须逐项解释。新模块在 tools/arch-layers.mjs、tools/system-map.mjs 登记。
- 测试一文件一进程，TEMP/TMP=F:/dnd-tmp，只取摘要（见 s5-cards §0 C.4）。本组三张卡同时进行，**每张卡同一时刻最多 2 个 node 测试进程（可并行跑两个文件）**。单文件超过 40 分钟的长测不跑，列给主会话外跑。overfit-guard 等子进程 EPERM 如实列出。
- **验收测试清单不自己挑**：交卡前运行 `node F:/dnd-tools/affected-tests2.mjs . <本树 .base 里的提交> WORKTREE 0`，清单里每个文件都要跑（排除 F:/dnd-tools/gate-skips.txt 里整文件标"."的 S7 慢测；有子测跳过模式的按该模式跳过）。汇报里给"清单 N 个 / 通过 N 个 / 失败列表"。清单中失败的文件若在 .base 上也失败，在 .base 树上复跑一次并**按子测名逐项对照**（`--test-reporter=tap` 的 not ok 名单；多出的子测就是本卡回归，不能按文件算"同败"）；否则就是本卡回归，必须修到通过或查清根因写明。
- **大清单**：清单超过 120 个文件时，卡内跑本卡失败/未完成文件 + CORE + 同步四件套 + invariants + s5-law-* + 本卡改过或直接相关的测试；全清单交主会话合并关卡（调度器并行，按子测名对照）。
- 不提交（沙箱不能写 git）；不读 secrets、不部署、不碰原存档；只结束自己启动并记录 PID 的进程。
- 汇报（≤300 字）：改了哪些文件；每项做法一句；手算锚点与实测对照；命令与 pass/fail；金快照/numeric-digest 是否变化；偏离本卡之处；未解决问题。详情写 F:/dnd/logs/sessions/<卡名>.final.md。
