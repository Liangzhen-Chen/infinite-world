S5FIX：s5a 上三个真失败（S5 收尾清单第 2、5 条）。先读 docs/产品原则.md 和 docs/当前状态.md 的“S5 收尾清单”。

## 背景
- 工作树 F:/dnd-wt/S5FIX，分支 t-s5fix，基 s5a@6f3bddcb。
- 对照：master 是 F:/dnd，只读，当前 233a1a87；10-31 的 s5a 扫描记录在 F:/dnd/logs/gate/jobs/full-s5a-75cc-075a18606aff/result.json。
- 11-03 全量扫描后，主会话在干净的 s5a 上单跑确认了下面三个真失败（日志在 F:/dnd-tmp/s5a-rerun/）。
  1. **tests/s5-playthrough.test.mjs**（无 AI 自动通关，收尾清单第 5 条）：在第 67 行失败，期望 NPC 位置是 loc_hw，实际是 null。10-31 是超时，master 上不完整。
  2. **tests/s3-run001.test.mjs**：“S3 run-001 E05: reasonable >= 80%”只有 4/6 合理。10-31 的 s5a 上通过，是 10-31 之后合入的东西引起的回归。
  3. **tests/wildlife.test.mjs** 有 2 项失败：
     - “50物种骨架…错误数据拒绝”，第 31 行；
     - “怪物生命整数化兼容照料；驯兽不反击…”，precondition.mjs:6 抛出“这个实体不是交锋对象”。
     
     这个文件 10-31 和 master 上都是超时，没有基线结论。先在 master 上单跑同一文件，确认是不是本阶段引入的。

## 要做
- 每项先找根因，写到文件:行，并说明是哪次合入引起的。可用 `git log s5a` 加二分，脚本是 F:/dnd/logs/sessions/bisect-range.mjs。
- 判断是“新规律带来的正确变化”还是“规律或代码错了”：
  - 前者：按真实流程重算锚点，测试注释写算式和来源规律；
  - 后者：修代码。
- 不删断言、不放宽、不改判定口径（E05 的 80% 门槛不动），不为测试造设施或接口；测试前提用真实游戏动作产生。
- wildlife 如果在 master 上同样失败：先说明原因，再按根因修，不能因为“基线也败”就放过。

## 验收
- 三个文件全过。
- 用 F:/dnd-tools/affected-tests2.mjs 生成你改动的受影响清单，全跑，最多 2 个 node 进程，超 15 分钟的列出不跑。按子测名对照 s5a@6f3bddcb，不许有新增失败。对照基准用临时 detached 工作树 F:/dnd-wt/S5FIX-BASE，用完先删两个 junction，再 git worktree remove。
- 改了 server-plugin 的话：bench-farm-pests 30×2 与 F:/dnd-wt/S5A 交替跑三对，报中位；量性能时用 F:/dnd-tmp/perf.lock。

## 运行约束与文件所有权
- 所有命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp；文件只放 F 盘；最多 2 个 node 进程；不读 secrets.json；不改 dist/；世界内容只在 world/；不提交，由主会话审后提交。
- 只改 S5FIX。不得改 F:/dnd、S5A、TI3、PFT、AUDT、PERFBASE。另外三张卡正在 TI3、PFT、AUDT 里做城镇整合、性能和审计工具。
- 同一个问题失败两次就停，写明原因。

## 交接
写 F:/dnd/logs/sessions/S5FIX-final.md，≤300 字，内容包括：
- 每项的根因（文件:行、引入的提交）和处理方式；
- 测试对照结果；
- 性能（如果测了）；
- 未解决的问题。

不贴代码和完整日志。
