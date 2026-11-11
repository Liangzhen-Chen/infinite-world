【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试输出必须过滤，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（不要用 grep/head）；禁止读完整输出。每个文件修好只确认一次，最后统一跑一次验收组。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。

卡 R35Z2。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/R35Z（分支 r35z）。
背景：你上一轮（F:/dnd/logs/sessions/R35Z-luna.final.txt）查明 S2c 把 negligent_fire 写进了共享村级法典模板，导致四村已审核的 charter.law 内容变化、需重审。主会话裁定：不重审，改为把 negligent_fire 只放到需要它的地方（E06 夏夜铁铺火所在聚落的法典，见 tests/probes/run-001/e06.mjs 与 tests/s2c-*.test.mjs 中火灾用例；用 git log -p master -- world/ 找到 S2c 改共享模板的提交），共享模板恢复 S2c 之前的内容，使四村审核上下文指纹与已审核版本一致。
验收：tests/npc-depth.test.mjs、npc-depth-next、village-ledgers、w1-village-profiles、w1-villages-publish 全过；tests/s2c-run001r.test.mjs 中 E06 仍 100%（以及其他四题不降）；tests/s2c-*.test.mjs 全过；CORE。revival.test 的世界版本数：查明 S2c 是否新增了一次世界升级，若是合法新增，在报告写依据，不改断言，交主会话。
报告 F:/dnd/logs/sessions/R35Z2-luna.final.txt；回复 ≤150 字。
