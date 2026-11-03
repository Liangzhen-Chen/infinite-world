【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试命令一律加过滤：`node --test --test-isolation=none <文件> 2>&1 | grep -E "^ℹ (pass|fail)|^✖|^not ok" | head -40`；禁止读完整输出；细节只看单个失败用例最后 30 行。本卡预算约 25 万 token，超出前停下写交接。

卡 R35X（转移协议回归，根因已分诊）。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/R35B（分支 r35b，已含上一轮部分修复）。沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。

主会话分诊（完整见 F:/dnd/logs/sessions/R35B-triage.md），本卡只修这三类，都与 server-plugin/transition.mjs 及其继承/通知路径有关：
①继承人为空：tests/entity-life.test.mjs 6 项（“…结算一次：人口、遗产、义务、组织空缺、宠物与契约保留守恒”及“名册先继承后补档…”，期望继承人如 npc_hw_baihui，实际 null）、tests/npc-life-health.test.mjs（病故后遗产整体交给同户成年继承人）、tests/npc-life-t164.test.mjs（配偶照护并继承）。疑 S2b-2/S2c 的继承分配（份额/顺位/同户成年人）没把旧字段（遗产接收人）双写回去或顺位规则漏了同户/配偶。
②tests/npc-life-family.test.mjs “任一方不愿意或条件不足都不交往、不成婚”报 Error: I6 account destination: npc_hw_jiaoyou。
③tests/entity-transitions.test.mjs 2 项：升格通知只在批准后产生（expected 1 actual 0）、死亡致店铺易主只发一次易主通知（expected 1 actual 0）。
修实现，不许改断言、不许特判。修后跑：上述 4 个文件；tests/transition-*.test.mjs、tests/s2c-*.test.mjs、holdings-reconcile、ledger-reconcile、save-roundtrip、CORE。
报告 F:/dnd/logs/sessions/R35X-sol.final.txt；最后回复 ≤150 字：每类根因（文件:函数）与修复、各文件前后结果。
