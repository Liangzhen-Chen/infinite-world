【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 A3-丙（接点 J–M、Y：物件损伤/污染/外观材质/穿戴属性/毒性、机关/微火/锁状态、穿戴槽、容器与液体/钱袋账户绑定、目录物迁位后的有效位置）。工作区 F:/dnd-wt/A3B（分支 a3b，已同步 a3a）。项目《无限原野》Node 规则引擎。依据 F:/dnd/logs/sessions/A3-owner-plan.md（接点码表、逐题阻塞表、卡与文件独占表）及其引用的 docs/架构设计/ 章节。本卡实现 A3 自有接点：每个接点同时交付①原生写入/存储（引擎内正规接口，进存档与回放）②引擎内真实消费者（相关动作的前提检查、授权、效果确实读取它）③ tools/a3-setup/ 中经该接口建立语料前提的加载（不往 state 塞结论）。只动本卡独占模块（见计划“建议卡”表），共享接线 engine.mjs/action-router.mjs/primitive-schema.mjs/a3-setup/index.mjs 与 loaders.mjs 仅做最小登记且在报告中逐处列出。不改语料、判分函数与口径、不删改既有断言；不造原文没有的权利、同意、任职者或成功。新增测试放 tests/a3-owner-<卡名>.test.mjs，每个接点正例 + 越权/伪造/非法输入反例 + 存档往返。验收：本卡接点对应题号的 setupUnmet 清零（逐题列出），再看这些题的路由/签名结果并逐条归因。重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/<卡名>-score.json 报六项指标；跑 tests/a3-*.test.mjs、本卡改动模块的相关测试与 CORE；静态提示不得超过 10593（tests/a3-tool-surface.test.mjs）。
另加一项（主会话已定口径）：空间前提（zones/paths/placements/positions/obstacles/hazards）中，凡引擎现有模型已能推出的（同一地点、无登记阻隔 ⇒ 可见可闻，现有局部区域/路径解析能表达的），加载器核对一致即视为已建立，不再记 unmet；只有需要现有模型无法表达的区分（同地点内听不到、墙线遮挡、具体米数影响结算、落石区进入结算）才记 unmet 并标 S4。核对必须读引擎的实际派生结果，不能仅凭语料字段自洽。完成后重新统计 S4 阻塞题号（对照计划逐题表）列入报告。报告 F:/dnd/logs/sessions/A3B-bing.final.txt；回复 ≤150 字。
