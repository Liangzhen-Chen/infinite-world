【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试输出必须过滤，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（不要用 grep/head）；禁止读完整输出；失败细节只看该用例最后 30 行。每个文件修好只确认一次，最后统一跑验收组。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。主会话分诊（沙箱外实测）：F:/dnd/logs/sessions/S3-triage.md。

卡 S3-R1（S3 义务统一的兼容回归）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/S3-R1（分支 s3-r1，基于 s3，已合入最新 master）。
S3 把义务改为统一生命周期（server-plugin/obligation-state.mjs、obligation-runtime.mjs、obligation-kinds.mjs 等），以下既有测试因此失败；绝大多数是新状态没有正确投影回旧字段/旧视图（双写兼容），少数是新语义与旧期望冲突：
- 到期/逾期没投影：tests/a1-lt-scenarios（L7 到期提醒）、contracts（赊住宿过期只提醒一次）、m3-narrative-regressions（真实逾期后扣钱与信任损失）、runtime（账本显示“欠林穗 6铜 · 逾期”，实际“待偿”）、m2-action-context（屋外人物不应有欠款认知，实际有）。
- 履约与在场：npc-delivery（2 项：送货在途扣路费、到点当面交付；长等待与短步进一致）、npc-integration（约定占用服务窗口、拒绝动作不扣款）、npc-memory（任务领取与交付只由发布者记住）、a2-dialogue（三日后提及具体帮助“修屋顶”，实际只提还款）。
- 其他：finance-bank（“Judicial seizure requires assets physically at the court”——S3-C 的在场校验是否误伤法定抵押追讨，查 15 §15.1.1 判定）、s3-probe-integration（“借期天数必须在1到60之间”）、reputation-law（TypeError 读 evidence）、m1-repair-learning-preconditions（deep-equal）。
修实现（双写投影、视图、在场判定），不改断言、不特判。若确属 S3 新设计与旧期望冲突（docs/架构设计/），停下逐条写依据交主会话。
跑：上述文件；tests/s3-*.test.mjs；transition-*、holdings-reconcile、ledger-reconcile、save-roundtrip、CORE。
报告 F:/dnd/logs/sessions/S3-R1-sol.final.txt；回复 ≤150 字。
