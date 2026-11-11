【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试命令一律加过滤，只看摘要：`node --test --test-isolation=none <文件> 2>&1 | grep -E "^ℹ (pass|fail)|^✖|^not ok" | head -40`；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。本卡预算约 30 万 token，预计超出就停下，把已完成与剩余写进交接报告。

卡 R35A（主线回归修复）。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/R35A（分支 r35a，基于最新 master，已含 R34 修复）。沙箱不允许 git 写操作：只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 2 个 node 进程。

二分定位：以下测试文件在合并提交 508abdb7 之前通过、之后失败（git show 508abdb7 --stat 看该次合入改了什么）：
tests/npc-depth-wt.test.mjs tests/npc-depth-lq.test.mjs tests/npc-depth-sb.test.mjs tests/npc-growth.test.mjs tests/rumor-route.test.mjs tests/w2-reuse-publication.test.mjs tests/w4-b2.test.mjs tests/wildlife-creatures-mixed.test.mjs tests/w2-s1.test.mjs tests/w4-b1.test.mjs tests/w4-b3.test.mjs 
先逐个跑一遍（当前分支可能已被 R34 顺带修好一部分），只处理仍失败的。找共性根因，修实现；不许改断言、不许特判测试、不许关掉调度器或转移协议。若某期望本身与新设计冲突（docs/架构设计/），停下逐条写依据交主会话，不要改期望。scale.test 对机器负载敏感：只在没有其他测试并行时单独跑一次判定。
修后跑：上述仍失败过的文件；CORE（tests/engine、storage、plugin、system-map、advance-registry）；tests/invariants/i31-total-order、save-roundtrip、ledger-reconcile、holdings-reconcile。金快照不可改。
硬规则：不删/跳过测试；不读 secrets.json；不改 docs/架构设计/。
报告 F:/dnd/logs/sessions/R35A-luna.final.txt；最后回复 ≤200 字：仍失败的文件数（开始/结束）、根因分类与文件:函数、未解决项。
