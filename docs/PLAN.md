# 新骨架排期（阶段 0 → 阶段 1）

旧骨架排期已归档至 archive/docs-status/PLAN-旧骨架-至1124.md。

## 阶段 0：整理工作区与顾问复审（硬门闩）

- 阶段 0A 工作区整理（Step 0–Step 5）：冻结旧队列、打 `pre-rewrite-1124` 标签、落地 `.github/workflows/ci.yml` + `tsc` + 新门禁与 `dispatch.mjs`、建立六份单一真相源、归档旧文件、获亮圳点头后执行 816 MB 删除清单、清出新 `server-plugin/` 骨架空仓与红灯 E2E 烟测桩。验收：第三章 Step 0–Step 5 命令全通过，整理 PR 在 GitHub CI 绿灯。
- 阶段 0A 落地清单（照 Gemini 开工文件 docs/gemini/kickoff-1125.md 第八章 L-01–L-20，origin/antigravity d16c0ecde；做完一步标 [x] 并写一句结果）：
  - [x] L-01 清理分支合入 master：395986f01（快进，补 1 提交把清理记录挪出 docs 顶层），全量 2239/2239。
  - [x] L-02 旧工作树 new-session-8e4637：git 记录已 prune，Orca 已受理移除；空目录仍被 Orca 自身占用，按李白裁定跳过（分支保留）。P5 deepseek 工作树与分支本已不存在。
  - [~] L-03 Orca setup 钩子改 npm ci（李白批 P2）：该设置存于 Orca 应用的仓库设置，CLI 无法修改，需在 Orca 界面改一处（已报李白）；改好前派卡建树一律 `--setup skip` 后手跑 `npm ci`。
  - 拍板记录：P1/P2/P4/P5 李白批（纯技术）；P3 亮圳 11-25 01:59 拍板（交最小可玩版，5 处卷文按 literature/design_spec 分级）；交付期限待定——亮圳 11-25 20:01 定原 11-30 往后推，新日期等 S1-1 写出看清速度后由李白报亮圳再定（K1125-DATE）。L-13 写入现行有效裁定。
  - [x] L-06/L-08/L-10 收编 chore/step1-tooling：DeepSeek 写四轮（第二轮照验收题造 write 档、删空卡文防线被打回；第三轮进程挂住由主会话代提交）、Haiku 出题含一轮改题、Opus API 审第一轮必须改 3 条、Sonnet API 第二轮复核可合，合入 master。已定 DeepSeek 不加 --max-budget-usd（估价失真）。遗留：clearDeepseek 补 CLAUDE_CODE_OAUTH_TOKEN（本机未设该变量，随 L-07 卡补）；A12-4.5、S12-2、S12-3 为主线既有非必过项。
  - [ ] P1 工具与 CI：L-04 typescript+typecheck 脚本；L-05 .github/workflows/ci.yml；L-06 dispatch.mjs（收编 chore/step1-tooling）；L-07 派活卡头规矩 ≤50 行、删自查表；L-08 archive_ref 检测器；L-09 检测器六项加固；L-10 tools/cloud、tools/notify 收编去写死。
  - [~] L-12 跨卷契约表：Gemini 规格 docs/gemini/contracts-spec-1125.md 已入 master；卡 chore/contracts 写 DeepSeek、出题 Haiku（20 条）、审 Opus 可合（契约表与规格逐字节一致，V1–V14 全实现），34 条全绿，分支 ds/contracts 已推远端。卡住同 L-11：出题.md 14 条依据无卷文行，等亮圳拍板出题依据口径。
  - [x] L-13 现行有效裁定.json 写入 K1125-P1～P5 与 K1125-ESC（附原话出处）；Q-14/Q-15（亮圳的留档、门禁规矩）与 B7（世界方向）不由主会话改，附理由/备选/代价报李白，Q-14/Q-15 转亮圳，B7 标「产品拍板」。
  - [x] L-14 docs/卡档案/_template/state.json 模板（照开工文件 5.3 节字段）。
  - [x] P4 main-session/.claude/settings.local.json 禁用 Agent（不入库；至 11-26 会员额度重置前，重置后按亮圳 13:31 改用会员额度并撤此限）。
  - [~] L-11 状态快照脚本：卡 chore/status-snapshot 写 DeepSeek 两轮（第二轮补定接通率向下取整）、出题 Haiku、审 Sonnet 可合，33 条全绿，分支 ds/status-snapshot 已审未合。卡住：出题.md 17 条依据出自 Gemini 开工文件、29 卷无对应行，合并门禁拒推；放宽「照设计原文（卷:行）出题」属亮圳规矩，已报李白转亮圳（推荐允许 docs/gemini 文件行）。已定：生成基准与最近提交两段不受 --check 比对（提交快照本身会改 HEAD），入口接通、门禁基线、在途卡三段受检。
  - [~] L-15/L-16 新骨架空仓：Gemini 裁定 msg_82485b7f7ab7——kernel 只留 6 零件的 14 文件 import 闭包、≤15 不放宽；gate/output-gate/textcore 一并归档，S1-3 随真实入口迁回（依赖文件收各自目录，不回 kernel）；tools/accept 自用旧 kernel 读表辅助收进 tools/accept/lib/。卡 chore/new-skeleton 写码第一轮完成并暂存（工作树 new-skel，352 文件，内核 14 文件，测试全绿），但门禁数据（state-owners、items 必过条目、criteria 指纹）仍指旧文件，pre_commit 报错提交不了——L-17 拆到下一轮是拆卡错误。本轮 DeepSeek 疑超单项 5 元（约 6～7 元），已停报李白，第二轮做法（推荐同卡做完 L-17 再提交）待李白回复。出题 Haiku 题已暂存。11-25 12:0x 李白令清工作树：两棵树的暂存成果已存为补丁（本机临时目录 staged-1125 下 new-skeleton-r1.patch、ts-new-skeleton.patch，已验证在 ea7812793 上可干净 git apply --index），工作树已删、分支保留；拍板后新建树从 ea7812793 起 apply 恢复再做第二轮。
  - [x] L-15/L-16/L-17 新骨架空仓、旧测试归档、门禁数据去旧绑定与基线全行锁定：chore/new-skeleton 写三轮、Opus 审→Sonnet 复核可合，已合入 master（205+54 全绿）。已知缺口：cross_write 缺 must_pass、4 条 E-ACC-ITEM-FORM；基线 locked 字段尚无读者（后续门禁卡让 le_baseline 读）。
  - [x] L-04/L-05/L-18：chore/ci-typecheck 合入。tsc 类型检查 0 错（typescript 7.0.2 + @types/node，无忽略注释）；.github/workflows/ci.yml 主 job（npm ci→typecheck→pre_commit→快照 --check→test:all）首次远端全绿 run 45634788525；e2e-observe 红灯桩按设计红（停在第 1/6 步开局）。
  - [x] L-19 master 分支保护：历史已改写抹 IP/邮箱（亮圳 13:58 授权，备份 pre-scrub-1125.bundle），亮圳 15:22 拍板公开；仓库已公开，保护已开（必过检查 main、strict、要求 PR、enforce_admins、禁强推禁删）。此后合入一律走 PR。
  - [x] 门禁补齐卡（每日审核 A3）：PR #8 合入 f5a06ac26——派前核 needs 闭包（卷二:764 行键）与三方模型族、派卡收据、合并提交要查、state.json 校验、CI 逐提交档案检查、CLAUDE.md 一致性测试。
  - [x] L-09 检测器加固 + L-08 扩项：PR #10 合入 72074c6cd。现仓既有命中登只降不升基线待清：c_module_state 4（kernel named-structs/rx 顶层 Map、validate/types 两处 idIndex.get）、c_big_md 3（三份 >500KB 设计卷）。
  - [ ] 余项：L-07 删九项自查表（亮圳 11-25 20:01 拍板，PR #19 合入中；派活卡头规矩压到 ≤50 行另议）；L-03（李白在 Orca 界面处理）；tools/cloud 长测（李白裁定等 S1-2 后）；notify.py 停用（李白裁定 K1125-NONOTIFY，找李白写在会话回复或 orchestration）；c_module_state 4 处并入 S1-1 验收；c_big_md 已豁免（PR #13）；断链行号与 docLimits 已修（PR #12）；CI 里 tsc 跑两遍保持（见 L-05 规格）；state.json 强制落盘接进档案门禁（K1125-HANDOVER，另卡）。
  - 写审分工：靠实时额度派活，照 CLAUDE.md 第 3 节（亮圳 11-25 18:19，PR #15 合入 1cbad9a12）；合入一律走 PR（master 已保护）。
  - 主会话总台邮箱：Orca 持久 run `run_ff745853fb21`（11-25 21:0x 建）。接班会话启动后先 `orca orchestration run-use --id run_ff745853fb21 --json` 接管，子会话回报发 `--to run:run_ff745853fb21`（CLAUDE.md 第 1 节换班条）。
  - S1-1 拆三张串行卡（主会话 11-25，Sonnet API 勘察 $0.22 + Opus API 接口草案 $0.41；旧内核约 4100 行，超单卡 150–800 行）：
    - [x] S1-1a 底座与黑户（feat/s1-1a）：运行期实体认定 kindOfEntity、顶层键切片 memo、storage/dimensions、rules/load/registry.mjs 登记构造、事务模块最小写入层（writeScope/txSet，整笔撤销，李白 11-25 23:20 裁定选 1）、dim/modified 返回 Fact、零件合并后内核 12 文件、c_module_state 4→0、基线 current 258→233；storage.mjs 两类门禁只读段例外（卷二:535，李白 11-26 00:35 裁定 A）。写 DeepSeek 1–3 轮→Sonnet API 4–7 轮，出题 Haiku API，审 Opus API 两轮（第二轮干净复核可合）。PR 见卡档案 state.json。
    - [x] S1-1p 插入卡（李白 11-26 02:47 选备选 1）：路径句柄 P（kernel/handles.mjs#makePathHandles）与 readPath/writePath/createEntity 签名对齐卷二:535，init 返回 {engine, state}。**教训：卡 A 设计时漏核卷二:535 签名，以后设计接口卡先逐条对照卷文签名。**
    - [x] S1-1b（B1）事务与推进（feat/s1-1b）：submitProposal（效果原语 time/create/fact.set，先记输入条目、单事务执行、拒写整笔回滚）、scheduler.advance 按 rules.host.heartbeatStepMinutes 分步推进 clock、create 的 template 落地（dim 回落模板实体行，卷二:131）、装配迁 rules/load/mount.mjs。连败 4 轮后经 antigravity 三份独立诊断收口（1 段路径配 2 段写者、created.props 写者位置、改动被门禁 import 的 validate/types.mjs 致 41 条指纹漂移、js-state.mjs 词法器误判 const state=）。
    - [ ] S1-1b2（B2）存档与重放：save/saveDigest/replay_apply，engineRulesDigest/dataPacksDigest 作清单字段（卷二十七:534）；**日志簿移出 state**（卷二十七:542 存档五部分日志与状态并列）并改追加接口。
    - 门禁封口卡加一项：修 tools/accept/lib/js-state.mjs:128–:153 stateChains 未排除 const/let/var 声明的误判（修后 rules/load/mount.mjs 的局部名 built 可改回）。
    - [ ] S1-1c 挂载与启动强断言：mountKernel 缺 saveEnv/unitOfPath/modifierSource 即抛；加载器移入 server-plugin/rules/load/（并入 registry.mjs，不另写第二份）；inputsOf 替换手传 inputs；engine.modifierSources 缺省改为强断言（审卡提示）。
  - 下一张：S1-1b（会员额度常态档：Sonnet 写、Haiku 出题、Opus 审）；其后门禁封口卡（pre-push.mjs 加 -m、触发目录扩项、收据/state.json 强制校验、S12 登记历史问题，Gemini 11-25 审核 P1，李白 23:35 定排卡 A 之后）。
  - 已定（主会话 11-25）：archive_ref 扫描范围排除 tests/acceptance/。理由：验收题职责就是断言旧路径已归位，必须写出归档目录字样；逐文件豁免要写码方知道验收题文件名，破坏三方分离且每卡重复。archive_ref 出自 Gemini 重写指南 Step 1，非亮圳硬规则，属技术口径修正；已报李白可否决。由 chore/new-skeleton 写码第二轮落数据。
  - 11-25 每日全库审核（Gemini，origin/antigravity a11ed4d45 docs/gemini/daily/2026-11-25-audit.md）A 类整改排期：① L-11/L-12 合入；② L-04/L-05 tsc+CI（新骨架合入后）；③ dispatch.mjs 补 needs 闭包核/派前模型族核/收据、clearDeepseek 补 OAuth 令牌、dispatch-consistency 测试、archive_ref 扩项、派活卡头规矩关「合并提交免查」、使用说明.md 更正、notify 三种 JSON、state.json 接 card-archive——合成一张「门禁补齐」卡；④ 新骨架 L-15～L-17 收尾后接 L-18 E2E 桩与 L-09 检测器加固；⑤ L-02/L-03 环境收尾。B 类（L-19 分支保护 403 需升 Pro/公开/替代、Q-14/Q-15、B7、交付日是否顺延）转李白→亮圳。
  - [ ] L-07 派活卡头规矩 ≤50 行、删 9 项自查表：等亮圳拍板 Q-14（自我反思是否保留）。
  - [ ] P4 治理：L-19 已完成（见上）；L-20 李白 Routine A/B 上线演练（李白侧）。
  - [x] ~~全部自验后交 antigravity 复核~~ 作废（亮圳 11-25 09:47）：Gemini 只做李白每日例程发起的全库审核，不另交。
- 阶段 0B Gemini 复审（硬门闩）：独立顾问逐条核验复审勾选清单，给出明确「复审通过」→ 整理 PR 合入 `master` → 开 `master` 分支保护 → 门闩解锁，允许开工 S1-1。

## 阶段 1：最小闭环竖切片（4 张强衔接卡，串行优先）

1. **S1-1 新 L0 核心底座与启动强断言**：`kernel/` ≤15 文件，解除 `state.created`、memo 切片失活、`postCommit.advanceMinutes` 三死锁，补启动完整性强断言。验收：`tsc` 0 错；`kernel/files.json` ≤15 且基线违例 0；新建实体 `ref` 可写可读；缺 `saveEnv`/`modifierSource`/`unitOfPath` 启动必抛；时间推进后 `saveDigest` 逐字节一致。
2. **S1-2 真实开局 + 最小领域包 + `submitProposal`/`time` 闭环**：接通真实开局落盘、最小可玩规则集、第二物种 `null` 键修复、可重建烘焙层雏形。验收：真实开局 <3 s；第二物种走通 `body`/`death`；`submitProposal` 动作落盘 + 日志 + 时钟推进 30 分钟；CI 绿且入口可达图无孤岛。
3. **S1-3 最小菜单动作表 + 真实入口 + 存档四路路由 + 零 mock E2E 转绿**：菜单动作接 `submitProposal`，存档路由接通，E2E 烟测首次全绿并锁死为后续底线。验收：`node --test tests/e2e/vertical-slice-smoke.test.mjs` 全绿；拔掉任一接线烟测必红；腾讯云跑一次 `real-world-load` 长测。
4. **S1-4 极简无 AI 浏览器菜单前端**：复用 `assets/`，新建 `client/` 由 `index.mjs` 托管静态路由，可点开真玩一局。验收：Playwright 无头冒烟 0 控制台报错；`npm start` 后 10 秒内可亲自试玩。

阶段 2 及以后（文化圈桥接等）等阶段 1 全绿后再排。
