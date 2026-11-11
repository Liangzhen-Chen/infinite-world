【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 s407-trial：S4-07 证据审理、缴罚与新证上诉

工作区 F:/dnd-wt/S407（分支 t-s407，基于 s4a 6df89a9d，已含 S4-01~06、08 及回归修复）。设计依据：docs/架构设计/05-统一模型.md §5.2.4、§5.2.7（案件是实体、证据评分、上诉、执行）；08-叙述与界面投影.md §8.5；附录A-术语与枚举.md §A.7；docs/A3-后续阶段登记.md 第 49、109 行。先读 docs/产品原则.md 与这几节，只汇报与本卡有关的结论。S4 设计决定：D 犯罪先成事件、立案才成案件；E 缺规范数据不猜。

## 结果
正式立案（S4-06 已做：报案 → 经办人本人决定受理）之后：玩家可递证、申请辩护、上诉；裁判有证据依据；罚款确实从当事人真实账户进公库；复审决定确实改变后续执行。

## 机制断言（全部要有测试）
1. 证据评分：证言的质量（证人与当事人立场、视线质量、见证版本完整度）与重复证言、文书原件（S4-05 的原件，经实际核验所得真伪与完整度）影响评分；低于该罪名的定罪阈值不定罪。评分只读所提交证据，不读引擎真相。
2. 辩护：聘请讼师以 NPC 本人答应并真实签约为准（不能用调用参数代填同意；参照 organizations/legal-representation 现有同意流程），讼师经修正槽影响证据权重。
3. 行为时法与现行程序分开：罪名与刑罚按行为发生时的法典，程序按现行法典。
4. 上诉：按案件种类读取 appealStaysExecution；受理上诉不自动翻案；新证（如新原件）进入复审评分，可维持或改判；改判确实改变后续执行（未执行的不再执行、已缴的按法典返还）。
5. 执行：本批只做罚款与返还。只能在可执行处对可及当事人执行；当事人逃离则案件回到 pursuit，不远程扣款。监狱完整 regime、破产、宣告与民事十类留后批，不做。
6. 存档往返与复演不二次执行（复演读记录的判决与转移，不重新评分、不重复扣款）；新行为加版本标记，旧事件保持旧结果。
7. 经办/审理人是 NPC 时，审理与裁判是其职权动作：玩家只能递交、申请、请求，不能替法官定罪或改判（与 S4-06 同一原则）；玩家本人担任该职位时才由玩家自己裁决。

## 恢复的 todo（前提必须由真实游戏动作产生，不直接写 state、不新增测试专用接口或内容；断言不放宽）
- tests/a3-owner-ding.test.mjs：四个 N/O 罚款用例（fine settlement through on-duty office / absent-off-duty-unrelated office cannot collect / full corpus fine proposal routes to real public collection / paying a restored fine retains ten-minute cost）；P/Q 同一收据与 P 来源链接；Q 当前经办/失能经办/legacy parties（看文件里对应 todo 名称）。
- tests/a3-setup-institutions.test.mjs：案件阶段用例（cases: native historical registration…）。
- tests/a3-precondition-receipt.test.mjs：native legal 52/55/58；signature 055 quote-only。
- 含货损或多个未就绪阶段的整组 todo 保留 todo，不宣称恢复。

## 可改
server-plugin/{law,legal-representation,advance-registry,action-affordances,action-text,scene-card,ui-affairs}.mjs，extension/{actions-view,affairs-panels}.mjs，新增 server-plugin/legal-appeal.mjs；world/actions/law.json 及 locale/zh-CN/law.json；tests/{s4-trial(新),s4-justice-ui(新，如需浏览器则写成可沙箱外跑的测试),law,a3-owner-ding,a3-setup-institutions,a3-precondition-receipt,a3-score-self}.test.mjs。新模块在 tools/arch-layers.mjs 归层、tools/system-map.mjs 登记。
锁：规范解析（norm-stack）、机构/职位生产者（offices）、感知与空间、组织同意规则；不改 docs/、dist/、PLAN/PROGRESS/CHANGELOG/当前状态；不改冻结语料、tests/probes、scorer。

## 验收
`tests/s4-trial.test.mjs`、`law`、`a3-owner-ding`、`a3-setup-institutions`、`a3-precondition-receipt`、`a3-score-self` 逐个单独进程跑全过（沙箱拦 spawn 用 --test-isolation=none）；s4-filing、s4-documents、s4-offices、organizations、arch-metrics、system-map、CORE（engine/storage/plugin）各一次全过。本卡改了 law 与交易/执行接点，影响面大：再跑 `node F:/dnd-tools/affected-tests.mjs s4a` 列出的文件中名字含 law、legal、case、fine、court、a3-owner、a3-setup、a3-precondition 的全部，逐个跑并报 pass/fail。静态提示：
`node --input-type=module -e "import {loadPromptBundle} from './tools/build-card.mjs'; const b=await loadPromptBundle(); console.log('staticTokens='+b.budget.estimatedTokens); if(b.budget.estimatedTokens>10593)process.exitCode=1"`

## 汇报（≤400 字）
改了哪些文件、新动作清单、恢复了哪几个 todo、改动的旧测试逐处一句、命令与 pass/fail、静态 token、偏离与未解决。不贴代码与完整日志。
