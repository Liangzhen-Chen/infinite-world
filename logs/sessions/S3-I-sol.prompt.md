【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试输出必须过滤，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（不要用 grep/head）；禁止读完整输出。本轮限时 75 分钟：到 65 分钟停手写交接。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。

卡 S3-I（S3 集成收口，质量优先）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/S3（分支 s3）。另有执行者在 F:/dnd-wt/S3E04 改 settlement-trade/shop/extraction/law 相关文件，本卡尽量不碰这些文件。
1. 分层（tests/arch-metrics.test.mjs 失败）：L0 的 engine.mjs、advance-registry.mjs、advance-layers.mjs 直接 import 了 L1 的 obligation-runtime/obligation-state 与 law-codes。按 S1/S2 的做法（L1 模块启动时向内核注册，例如 registerAdvance、registerHoldingProtocol 一类的注册接口），把这些依赖改为注册注入：内核只认接口，L1 义务模块注册实现。不许把违例加进基线。
2. 工具面与静态提示（tests/action-registry.test.mjs：静态提示 10641 > 10593；tests/tool-groups.test.mjs：/粮仓.*farm_buy/ 不匹配）：S3 在 extension/tools.mjs 把义务操作（world_promise 的 settle/close/file_claim/receive_collection/resume_estate、estate 参数，world_trade 的 liability，festival 的 medicine_cancel、contract）塞进静态工具，并为抵消 token 删改了其他工具描述（丢了“NPC按世界钟履约”“采集份数”等信息，首行还加了 BOM）。按 docs/架构设计/06-动作层与开放动作.md 与 A1 动作目录（world_actions/world_act，docs/actions.json 由工具导出），把这些新操作登记为动作目录里的动作（带槽位、consent 来源与前置），经 world_act 执行；从静态工具中移除；把 S3 对其他工具描述的删改恢复为 master 原文（git diff master -- extension/tools.mjs 对照），去掉 BOM。目标：静态提示 ≤10593，tool-groups、action-registry、a1-*、prompt* 测试通过，且这些义务操作仍能被玩家/模型发现和执行（补测试：world_actions 能列出、world_act 能执行一次清偿）。
跑：上述测试；tests/s3-*.test.mjs、tests/a2-*.test.mjs、CORE、arch-metrics、system-map。
报告 F:/dnd/logs/sessions/S3-I-sol.final.txt；回复 ≤150 字。
