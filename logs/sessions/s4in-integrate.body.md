卡 s4in-integrate（s4a 集成：A3 修复合入后的 3 个失败）。工作区 F:/dnd-wt/S4IN（分支 t-s4in，自 s4a 433a53cd）。先读 docs/产品原则.md。逐个单独运行定位并修根因：
1. tests/arch-metrics.test.mjs：S4 新模块（server-plugin/norm-stack.mjs、place-layout.mjs、perception.mjs 等）未归层——在 tools/arch-layers.mjs 按实际职责归层，不抬逆向依赖基线。
2. tests/system-map.test.mjs：新模块归入系统（tools/system-map.mjs），运行 node tools/system-map.mjs 重新生成 docs/system-map.*，不绕过完整性检查。
3. tests/draw-water.test.mjs 1 个用例失败：A3 的日常取水与 S4 的分区可及性（place-layout / perception：同分区不等于可接触、须走近）交互。判断是取水应改用 S4 的可及性判定（产品），还是测试前提需按真实走近动作产生（测试），修根因，不放宽断言。
验收（逐个单独运行）：上述 3 个 + tests/s4-layout.test.mjs、tests/s4-perception.test.mjs、tests/a3-intent-proposal.test.mjs、tests/environment.test.mjs。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不改 docs/（system-map 生成物除外）。不再启动其他会话或子代理。最后回复不超过 6 行，同样写到 F:/dnd/logs/sessions/s4in-integrate.final.txt。
