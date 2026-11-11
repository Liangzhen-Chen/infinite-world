K04 续做（主会话已处理两件事，请先 git log -3 / git status 看清）：
1. 你的改动已作为 WIP 提交（929caafe），并合入了最新 s5a（5d8b47be）。s5a 上主会话已修好 K02 的一处规律错误（店主自家补货不受本人营业时段限制；无作息表的店主保持旧的随时营业），所以 **tests/npc-schedule.test.mjs 已撤回你加 100 个面包的改动**，它在原样下应自然通过。请确认。
2. **所有权扩展**：`server-plugin/extraction.mjs` 的 `mineEmployment`（约 155–170 行）及 `mineActor` 读取当前地点的接点，划给本卡改。

要做：把采矿雇佣的结算从"结算时刻矿工是否仍在矿上"改为"按真实在场、真实作业的出勤事实结算"——矿工按时下工返家后，当日已实际完成的采矿工时、产出与工资照常结算；仍保留许可、工具、储量、账本与真实同意的保护；不得给没去、没干的人发钱。这条应对所有按班次结算的雇佣通用，若 labor-market 已有出勤事实，复用它，不另建第二份出勤账。

验收：s5-law-household-labor 全过（含你写的采矿返程回归：往返各2分钟、日薪960、7次×60分钟 → 实作420分钟、付840、产1份矿石，用你已记录的手算）；另逐文件 extraction 相关测试（grep tests 中引用 extraction / mine 的文件）、labor-market、npc-schedule、npc-obligations、s3-labor-justice、npc-life-health、CORE 三件、同步四件套。金快照字段表按最新基线重做（weather_exposure 那项差异应已消失）。汇报同原卡。
