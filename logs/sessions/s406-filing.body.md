# 卡 s406-filing：S4-06 失窃、指控与立案分开发生

工作区 F:/dnd-wt/S406（分支 t-s406，基于 s4a，已含 S4-01~05、08）。设计依据：docs/架构设计/05-统一模型.md §5.2.3、§5.2.7；附录A-术语与枚举.md §A.7；docs/A3-后续阶段登记.md 第 47–49、109 行。先读 docs/产品原则.md 与这几节，只汇报与本卡有关的结论。S4 设计决定 D：犯罪先成事件，立案（经办人受理）才成案件；E：缺规范数据不猜。

## 结果
玩家或 NPC 的偷窃先结算并留下私密嫌疑（见证按 S4 感知），不自动公开、不自动建案；报案人（见证者/受害者）提交自己所知的内容；经办人（按 S4-04 机构的在岗职位与职权）用另一个动作实际决定受理或拒绝。

## 机制断言（全部要有测试）
1. 真实偷窃结果先结算，不自动建案、不自动公开。
2. 报案只提交报案人知情集合里的内容（见证或被告知），不能提交其不知道的事实；收件本身不定罪。
3. 受理/拒绝是经办人的独立动作，需在岗、有职权；拒绝要有世界内原因。
4. 无真实嫌疑的错告也能按所提交的证据进入程序——经办人不能靠查看引擎真相来拒收。
5. 讼费（若法典规定）从报案人真实账户转入公库；钱不足则整笔不立案，不留半笔。
6. 存档往返与复演保持报案、受理事件与来源不变（复演不重新决定；新行为加版本标记，旧事件保持旧结果）。

## 恢复的 todo
- tests/a3-owner2-R.test.mjs「R2: confession preserves the legal entry and refuses to promote a witness into an official」
- tests/a3-precondition-receipt.test.mjs 的 native legal 51 与 53（legalRequests 列表里的这两项）；其余项保持 todo（52/55/58 归 07）。
- 前提必须由真实游戏动作产生（setup.prelude/applyIntentSetup 或真实调用序列），不直接写 state，不新增测试专用接口或内容；断言不放宽。
- 旧 law 测试若因两步立案失败：只补真实的受理步骤，逐处在汇报里说明，保留其证据/权限意图，不删断言。

## 可改
server-plugin/{law,world-events,npc-decision,engine,action-affordances,action-text}.mjs，新增 server-plugin/legal-reactions.mjs；world/actions/law.json、world/actions/locale/zh-CN/law.json（照现有动作目录写法，新动作走动态目录，不增加静态提示）；tests/{s4-filing(新),law,a3-owner2-R,a3-precondition-receipt}.test.mjs。新模块在 tools/arch-layers.mjs 归层、tools/system-map.mjs 登记。
锁：空间/感知求值器（place-layout、perception）、任免来源（organizations 的同意规则）、07 的审理/上诉；两步立案只接现有罪名中本闭环用到的事件类谓词。不改 docs/、dist/、PLAN/PROGRESS/CHANGELOG/当前状态，不改冻结语料、tests/probes 与 scorer。

## 验收
`tests/s4-filing.test.mjs`、`tests/law.test.mjs`、`tests/a3-owner2-R.test.mjs`、`tests/a3-precondition-receipt.test.mjs` 逐个单独进程跑全过（沙箱拦 spawn 用 --test-isolation=none）；另跑 s4-perception、s4-offices、s4-documents、arch-metrics、system-map、CORE（engine/storage/plugin）各一次全过。静态提示预算：
`node --input-type=module -e "import {loadPromptBundle} from './tools/build-card.mjs'; const b=await loadPromptBundle(); console.log('staticTokens='+b.budget.estimatedTokens); if(b.budget.estimatedTokens>10593)process.exitCode=1"`

## 汇报（≤400 字）
改了哪些文件、新动作清单、恢复了哪几个 todo、改动的旧 law 测试逐处一句、命令与 pass/fail、静态 token、偏离与未解决。不贴代码与完整日志。
