【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

卡 wc-ledger（a3a 收口：最后两个测试问题）。工作区 F:/dnd-wt/A3WC（分支 t-a3wc，自最新 a3a）。先读 docs/产品原则.md（三.2 测试前提用真实游戏动作产生，不为测试造接口）。
1. tests/world-content2.test.mjs:72 与 :90 两个用例失败（master 上没有该文件）：旧 setup 直接往状态里注入物品实例、考核记录与在岗状态，与现在的前置动作校验、转介授权和目录职位校验不符（只读核查证据见 F:/dnd/logs/sessions/arch-cycle.final.txt）。把这两个用例的前提改为真实动作产生（tools/a3-setup/prelude.mjs 的 runPrelude，或 previewAction+reduce）；保留原断言意图。若某前提确实没有真实生产动作，按已有做法改为 test.todo(原名, 原函数) 并在名称后加〔前提待真实动作：<缺的动作>；归 <阶段>〕，在报告里列出，不新增接口。
2. tests/ledger-price.test.mjs:76 价格输入点登记 SURVEY 仍列 server-plugin/obligation-runtime.mjs，但该模块已无价格词匹配（0 命中）——陈旧登记。核实后从登记中移除，保留对其他模块的检查；若发现该模块的价格逻辑被搬到了别的模块，就把新位置登记进去。该文件很慢，先 --test-name-pattern 跑相关用例，最后整文件跑一次。
可改：上述两个测试文件。锁定：其余所有文件。
验收：node --test --test-isolation=none tests/world-content2.test.mjs；node --test --test-isolation=none tests/ledger-price.test.mjs（逐文件单独运行）。
不调用真实模型。预计规模：小。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程（另有真实试玩在跑），输出过滤为摘要。不再启动其他会话或子代理。最后回复不超过 6 行，同样写到 F:/dnd/logs/sessions/wc-ledger.final.txt。
