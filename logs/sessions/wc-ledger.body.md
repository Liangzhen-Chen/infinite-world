卡 wc-ledger（a3a 收口：最后两个测试问题）。工作区 F:/dnd-wt/A3WC（分支 t-a3wc，自最新 a3a）。先读 docs/产品原则.md（三.2 测试前提用真实游戏动作产生，不为测试造接口）。
1. tests/world-content2.test.mjs:72 与 :90 两个用例失败（master 上没有该文件）：旧 setup 直接往状态里注入物品实例、考核记录与在岗状态，与现在的前置动作校验、转介授权和目录职位校验不符（只读核查证据见 F:/dnd/logs/sessions/arch-cycle.final.txt）。把这两个用例的前提改为真实动作产生（tools/a3-setup/prelude.mjs 的 runPrelude，或 previewAction+reduce）；保留原断言意图。若某前提确实没有真实生产动作，按已有做法改为 test.todo(原名, 原函数) 并在名称后加〔前提待真实动作：<缺的动作>；归 <阶段>〕，在报告里列出，不新增接口。
2. tests/ledger-price.test.mjs:76 价格输入点登记 SURVEY 仍列 server-plugin/obligation-runtime.mjs，但该模块已无价格词匹配（0 命中）——陈旧登记。核实后从登记中移除，保留对其他模块的检查；若发现该模块的价格逻辑被搬到了别的模块，就把新位置登记进去。该文件很慢，先 --test-name-pattern 跑相关用例，最后整文件跑一次。
可改：上述两个测试文件。锁定：其余所有文件。
验收：node --test --test-isolation=none tests/world-content2.test.mjs；node --test --test-isolation=none tests/ledger-price.test.mjs（逐文件单独运行）。
不调用真实模型。预计规模：小。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程（另有真实试玩在跑），输出过滤为摘要。不再启动其他会话或子代理。最后回复不超过 6 行，同样写到 F:/dnd/logs/sessions/wc-ledger.final.txt。
