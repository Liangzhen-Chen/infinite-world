续做 arch-deps（你的改动已合入 a3a）。新工作区 F:/dnd-wt/A3CY（分支 t-a3cy，自最新 a3a）。
主会话全量逐文件扫描（每个测试文件单独一个进程）发现：合入你的 arch-deps 之后（主会话在合并点 2be43fc3 → 664ad1e5 之间二分确认），以下文件单独运行时一加载就失败，报 “ReferenceError: Cannot access 'MemoryIndex' before initialization”（MemoryIndex 定义在 server-plugin/retrieval.mjs:82）：tests/a3-routing、a3-structural-routing、a3-limits、retrieval、m3-consistency、m3-narrative-regressions、m3-retrieval、m3-soak、m2-reply-protocol、a1-applied-review。你上轮把多文件放在同一进程（--test-isolation=none 一次跑多个文件）验收，其他文件先加载了模块，掩盖了循环导入。
要做：找出你移动代码（npc-state 下沉关系账、engine/runtime 接点等）后形成的导入环，按分层方向断开（例如延迟到函数内取用、由上层注入，或把被环引用的只读部分放到不依赖 retrieval 的位置），不改行为、不抬架构基线、不放宽测试。
验收：上面 10 个文件每个单独运行一次（每个文件一条 node --test --test-isolation=none tests/<文件>.test.mjs 命令，逐个报 pass/fail），全部通过；再跑 tests/arch-metrics.test.mjs tests/system-map.test.mjs。
另外顺带查以下文件在当前 a3a 单独运行的失败（master 上通过），判断是否也与本环有关：tests/npc-depth-wt.test.mjs、tests/world-content2.test.mjs、tests/m3-soak-adapter.test.mjs、tests/ledger-price.test.mjs（很慢，可先 --test-name-pattern 跑失败用例）。与本环无关的，只报告根因与证据，不改。
可改：你上轮改过的 server-plugin 模块及 retrieval.mjs（仅为断环）。锁定：测试断言、tests/metrics/*.baseline.json、world/、docs/（docs/system-map.* 生成物除外）。
不调用真实模型。预计规模：小。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不再启动其他会话或子代理。最后回复不超过 8 行，同样写到 F:/dnd/logs/sessions/arch-cycle.final.txt。
