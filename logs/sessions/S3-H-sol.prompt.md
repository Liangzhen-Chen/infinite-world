【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试输出必须过滤，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（不要用 grep/head）；禁止读完整输出。本轮限时 60 分钟：到 50 分钟停手写交接。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。

卡 S3-H（修取证：让 run-001 判分检查真实行为）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/S3（分支 s3）。依据 F:/dnd/logs/sessions/S3-sol-replan.md 第 2.1 节：E04-1、E05-2、E05-4 的 tests/probes/run-001/e04.mjs、e05.mjs 判分只做关键词/固定 partial，结构上无法判合理，而实现已有真实行为与通过的业务测试（extraction.mjs:mineEmployment/mineActor 非法开采扣矿脉立案；transport.mjs escortTerms.daily 与工资义务按天累计；damageTransportCargo/compensateTransportLoss 毁损与分次赔偿）。
任务：把这三条判据的 scenario/check 改为驱动真实引擎并断言真实结果（储量扣减与 NPC 盗采立案、滞留天数×日薪的应付累计、货损后的库存减少与索赔支付），判据含义与 docs/probes/run-001/events.md 原题预期一致，不得把“部分”改“合理”而不验证行为；其他判据不动。E04-2/E04-3/E05-5/E18-1/E18-4 是功能缺口，本卡不做。
跑：tests/s3-run001.test.mjs（报 E04/E05/E18 每条判据结果）、tests/s2c-run001r.test.mjs（五题不降）、CORE。
报告 F:/dnd/logs/sessions/S3-H-sol.final.txt；回复 ≤150 字：三条判据前后、各题分数、测试结果。
