【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试输出必须过滤，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（不要用 grep/head）；禁止读完整输出。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。

卡 S3-T（主会话已裁定的四处测试与设计对齐）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/S3（分支 s3）。背景见 F:/dnd/logs/sessions/S3-R1-sol.final.txt 第 7–11 行。只改测试的准备步骤或把“检查内部存储形态”的断言改为检查其原本意图，每处加注释写明设计依据；断言意图与严格度不降、不删用例：
1. tests/finance-bank.test.mjs:32 附近：依 15 §15.1.1（价值有位置），recover 前把欠款 NPC 也带到法院（与法官/执法者同地），保留“从其随身 200 铜扣款并守恒”的断言。
2. tests/m2-action-context.test.mjs:82：S3 依设计把赊账债务记入统一义务表，原断言 state.obligations 为 {} 改为检查本意——屋外人物（列出的那些 NPC）对该欠款无认知（用主观视图或其知情集合检查），并另加断言：该债务确实存在于统一义务表且债务人/债权人正确。
3. tests/s3-probe-integration.test.mjs 第一项：第二张当票 days:90 超出 bank.loanMaximumDays=60（15 章无典当例外），夹具改为 ≤60 天并保证两张当票到期日仍不同；“分别到期、异地不冻结、未到期条款不改写”断言不变。
4. tests/m1-repair-learning-preconditions.test.mjs:98：依 05 §5.1，离屏矿业雇佣合同在等待期内累计 attendance/attendanceThrough 及条款投影属合法变化；把这些字段（仅限该合同记录的这几个字段）加入允许变化集合，其余“记录不变”检查保持。
跑这 4 个文件 + CORE。报告 F:/dnd/logs/sessions/S3-T-luna.final.txt；回复 ≤100 字。
