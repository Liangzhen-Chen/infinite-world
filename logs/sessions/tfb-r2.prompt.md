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
限时：300 分钟（到 290 分钟时停手写交接）。

续做 TFB（正文 tfb.body.md，共同规则 s5law-common.md，设计 F:/dnd/logs/arch/townfood/design.md）。链路已通（探价→留粮锁款→真实运输→到柜结算→货损退款），保留。剩两块：

## 1. 生成县真实镇不发货（tests/s5-law-food-supply.test.mjs:163）——先查清拒绝发生在哪一层
现场：来源 loc_far_zhufeng、管理人 npc_rg_fengji_zhufeng_03；镇铺 shop_rg_fengji_zhufeng_09，观察报价量4、单价14、税300bps；真实驮畜 30kg/factor 0.375；planFoodSupply 没有产生该来源订单。
做法：给 planFoodSupply 的每一道筛选（余粮计算、报价获知、净收益、运力可用、经营者决定、路线可达）在该用例下逐步记录结果（临时诊断，交卡前删），定位是哪一步把它刷掉（文件:行）。若是规律缺口（例如生成县的经营者权限、驮畜运力口径、跨县路线）就按通用规律补；若是测试前提不成立就按真实动作补前提。不要换第三种等价修法——查到哪一层再改哪一层。
## 2. 运量太小：白石镇 30 天只到 22 份（11kg），需求约 4284 饼/周
设计 §3 已指出须按真实车辆/班次/运力扩容。要做：planFoodSupply 选择运力时使用世界里已有的承运服务（CT07 后 transport.mjs 的车行并载、逐日行程；有车有驮畜的家户/车行可受雇），不仅限于经营者本人背运；同一供货窗口内按缺口与运力可多趟/多车；运费、误工进入净收益。给出改动前后 30 天白石镇到柜量，以及到柜量与登记户需求（按原粮折算）的对照。
## 不在本卡
家户买原粮回家加工成口粮（卡 C，K16 合入后另派）。K08 不买无营养原粮是正确行为，不要改它让家户买燕麦。
## 文件所有权
同 tfb.body.md（food-supply.mjs、agriculture、shop、transport、advance-registry daily 接线、settlement-trade、rules.json 的 foodSupply 段及测试）。不改 npc-life、household-budget、npc-state、household-subsistence（K16 在改）。
## 验收
s5-law-food-supply 全过；共同规则大清单口径；金快照字段表更新（TFB-golden-table.md）；汇报 ≤300 字：拒绝层根因（文件:行）、运力扩容做法、30 天到柜量前后。
