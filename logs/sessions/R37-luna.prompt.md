【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试输出必须过滤，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（不要用 grep/head）；禁止读完整输出；失败细节只看该用例最后 30 行。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。

卡 R37。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/R37（分支 r37，基于最新 master）。
问题：tests/w2-s4.test.mjs “隔离发布只追加本批，保留其他条目，重复发布零写入，篡改或冲突拒绝且不回补库存”单跑稳定失败（8 过 1 败，deep-equal 对象不符）。它在 R35C 分支末端（提交 3cb5f3fd）与 R35A 分支各自都通过，合并后（b25bb1ef 起）失败。唯一的人工冲突处理在 server-plugin/transition.mjs：R35A 把“搬移在册账户余额”的循环（含 'No account successor'）挪到了公布 gone 状态之前；R35C 在原位置的同一循环上加了 workstationAnchorOwner 条件；合并保留了 R35A 的位置并套上 R35C 的条件。请用 git diff 3cb5f3fd b25bb1ef -- server-plugin/ 等对比，找出两边修复的交互（例如循环提前后 wreck/残骸、工位、仓储账户尚未建立或被重复搬移），修到 w2-s4 通过，同时保持 R35A、R35C 各自修复的测试通过。不改断言。
跑：tests/w2-s4.test.mjs、w2-s2、w2-s3；R35A 文件组（npc-depth-wt/lq/sb、npc-growth、rumor-route、w2-reuse-publication、w4-b1/b2/b3、wildlife-creatures-mixed、w2-s1）；R35C 文件组（r06-bs-craft/market/dock、summons、quest-board、w2-s2/s3/s4、seasonal-migration）；tests/transition-*、s2c-*；CORE。
报告 F:/dnd/logs/sessions/R37-luna.final.txt；回复 ≤120 字：根因（文件:行）、修改、结果。
