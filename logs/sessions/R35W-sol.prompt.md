【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试输出必须过滤，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（不要用 grep/head）；禁止读完整输出；细节只看单个失败用例最后 30 行。每个文件修好只确认一次，最后统一跑验收组。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。

卡 R35W（S2c/S2b-2 回归收口）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/R35B（分支 r35b，已合入 R35X/R35Y/R35Z2 与最新 master）。主会话分诊（沙箱外实测）：F:/dnd/logs/sessions/R35B-triage2.md，12 个文件仍失败。已知线索：
①entity-life 5 项：期望旧字段状态 '取消'，实际 'void'——新义务状态写回旧字段时应保持旧值（双写兼容），修投影/双写，不改断言。
②festival 3 项：TypeError 读 durationMinutes——疑 R35Y 改节日参与判定时引入（git log -p -3 -- server-plugin/*festival*），修。
③npc-depth/npc-depth-next/village-ledgers/w1-*：“发布骨架或引用事实已改变 loc_bs_yupo”——R35Z2（报告 F:/dnd/logs/sessions/R35Z2-luna.final.txt）在其分支上已修（negligent_fire 只放 E06 的 loc_hw 本地法典、恢复共享模板），合并后仍坏：查是哪个合并把共享模板或四村排除又改回去了，修到四村审核上下文与已审核版本一致（不重审、不放宽校验）。
④entity-view 2 项、npc-life-health、npc-life-t164（继承，已按 04 §4.4 改为过阶段后断言，仍 deep-equal 不符）、reputation-law、revival：逐个查根因修实现。revival 若是 S2c 合法新增世界升级导致版本数 3≠2，写依据停下，不改断言。
跑：上述 12 个文件；tests/s2c-*、transition-*、holdings-reconcile、ledger-reconcile、save-roundtrip、CORE。
报告 F:/dnd/logs/sessions/R35W-sol.final.txt；回复 ≤150 字：每文件结果、根因、未解决项。
