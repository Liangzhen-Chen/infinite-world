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
限时：150 分钟（到 140 分钟时停手写交接）。

# W8-E8 续：接通玩家菜单与集体田租入

主会话审过你的交接。工坊库存部分接受。你停在接点处是对的；现在放开下列文件，请继续完成。

## 放开的文件
- server-plugin/finance-operations.mjs：操作集合里加入租入田地、工坊存取。
- extension/tools.mjs：只加必要的枚举值和槽位。静态提示必须 ≤10587：
  - 用 `node -e` 调 tools/build-card.mjs 的 loadPromptBundle 看 estimatedTokens，前后对比写进汇报；
  - 超了就压缩你新增的文字，不得删别人的。
- world/actions/core.json：菜单动作，改完 `node tools/export-actions.mjs` 重导。
- server-plugin/environment-state.mjs：只读即可。主会话已修 recordTillage 的非整数面积，改为有理数口径，s5-05 的 RangeError 已修，不用你处理。

## 集体田的租入
南田 feature_s1_field 的持有人是 loc_hw 集体，这是事实，不要造个人田主。集体资产出租要真实授权：
- 由该聚落当前有权管理集体资产的在任者（村长或里正一类，grep governance/office/organization 的现任与职权）当面同意；
- 租金入聚落公账（treasury），走现有账本；
- 无人在任或在任者不在场时拒绝，并写明原因与替代办法。
- 若架构文档对集体地出租另有规定（grep "集体" "公田" "租"），以文档为准。
- 不得为测试新建人物、职位或田地。若现有世界里确实没有能授权的在任者，停下写进汇报。

## 收尾
- tests/s5-playthrough.test.mjs 农事 todo 转正式步骤：
  - 全程走玩家菜单：租田 → 播种 → 推进到成熟 → 分批收割（背不动就多跑几趟，中间把粮存进工坊或卖掉均可，按真实动作）→ 卖自产粮 → 存钱庄；
  - 每步手算锚点。
- 更新 docs/可玩版本-S5.md。
- 逐文件跑：w8e8-premises、s5-playthrough、finance-assets、business-contracts、s5-05、a3-domain-properties、w8c-carry、holdings-writers、advance-registry、arch-metrics、actions-catalog、action-registry、turn-contract-client、a3-discoverability*（静态提示上限）。
