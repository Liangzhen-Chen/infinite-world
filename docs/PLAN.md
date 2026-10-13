# 执行计划

## 规划与执行客户端会话的规则

先遵守 AGENTS.md 的 Stop That Shit 开发规则：完成卡片完整责任，复用直接方案，仅因实际缺口扩展；保留有效保护，修正经证据确认的重复或过宽拒绝。必要调用、数据和测试一起交付。文件清单是分工，跨非锁定文件的必要小接点说明后由主协调，不额外请用户批准已授权工作。

已有效的验收证据复用；新变化或具体失败才补查，不为此 Skill 新增清单、manifest、验证器或审核会话。等价阻碍只处理一次规划，不通过不断拆新卡重复同一修复。摘要报告提交、实际验收、改动和未解问题；验收后主合并、CORE、更新文档、清理干净 worktree，并归档确定不再续用的会话。

1. 主会话是 Claude，负责调度、验收、合并与检查；规划（Astra）与执行（Sol）会话由主会话通过 codex 工具启动，不再启动其他会话或子代理。
2. 只跑相关测试；提交前加跑 `node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs`。不跑全量测试，不调用真实模型，除非卡片要求。本文以下称这条命令为 CORE；每张执行卡的验收都包含 CORE。
3. 输出过长只截取报错部分；读过的文件只看相关行。用 `rg` 定位，不通读仓库。
4. 同一个错误两种修法仍失败：停止，提交已通过测试的部分，在不超过 10 行的摘要里写明现象、已试方法和判断。主会话派规划客户端会话处理一次；仍不行标记卡住，继续其他块。
5. 执行客户端会话 在自己的 worktree 和分支工作，完成后提交并回不超过 10 行摘要。`docs/PROGRESS.md` 和 `docs/CHANGELOG.md` 只由主会话更新；PLAN 由主会话维护或委派规划客户端会话修改。
6. 同时最多 3 个 执行客户端会话，只并行没有依赖且改动文件不重叠的块。真实 DeepSeek 块同时只运行一个；内容可以先并行准备，模型阶段由主会话授予运行槽。
7. 新树为 `F:/dnd-wt/T编号`，分支为 `t编号`，从依赖已合入的主线建立；依赖安装方式沿用现有 worktree。已有树优先在原树收尾。不得覆盖其他会话的改动；仅凭修改时间不能认定已无人工作。
8. 主会话先核验卡片验收，再合并；合并后跑 CORE，更新 PROGRESS/CHANGELOG，再删除已完成且干净的任务树。存在未提交差异、其他会话活动或未合入成果时保留树。
9. 每完成一个里程碑或内容波次打 `review-编号` 标签，交规划客户端会话看上次标签以来的 `git diff --stat`、最新报告及抽样内容；问题写成卡片或已知问题，再派修复。标签不代表已部署。
10. 不读取 `secrets.json`；DeepSeek 只用环境变量 `DEEPSEEK_API_KEY`。不部署到用户酒馆，不动原存档。需要用户决定的事由主会话写入 `docs/待用户确认.md`，跳过并继续其他工作。
11. 世界内容只写进 `world/`，不手改 `dist/`。不缩减规模、不降低断言或评分、不删除失败测试；保留基线的 23 项预期失败。最新失败原文和有限范围的证据不能被概括为整体验收通过。
12. 内容沿第 10 章逐条处理：L1 全量，L2 全量事实审核，最多两次定点修正，L4 被标记条目加随机 5 条，每批人工阅读不超过 10 分钟；波次随机 10 条六项平均至少 4，单项至少 3。未经 L2 的新事实不得记成已审核发布。
13. 费用和未知预留如实保留，不新建空账绕过历史花费；每次真实模型运行遵守当前卡片的明确额度与授权。下文 2026-10-12 的 100/20/30 元总限额属于当期批准历史，最新目标已移除这组 goal 硬限；不能把它自动恢复为新目标的停止条件，也不能把未知费用记零或谎报归属。既有执行卡的具体额度继续执行，必要调整由主调度与规划明确记录。同一条真实失败最多重跑一次，报告写明重跑后通过。
14. Claude 校准已取消（2026-10-13 用户决定），方向与效率由主会话直接把控。执行会话报告已通过的卡片验收，主会话合并前不重跑，合并后只跑 CORE；有具体疑点才定向核对。
15. 本轮目标覆盖完整指南，部署及待用户决定事项除外。原时间预算继续记录；超过 1.5 倍需决定的块记录选项后跳过，不因一个块停下无人值守队列。全部可执行卡完成，或剩余都卡住/依赖卡住/待用户决定时，由主会话运行 `npm test`、`npm run build:release`、`npm run build:final`，如实记录失败，覆盖当前状态后停止。

## 最新调度与门槛

2026-10-12 用户最新授权“追加预算 重开没问题我授权 只要高效”，覆盖旧T06/T07/T08冻结及单卡追加需决定的限制，T09允许增额，T17修好源缺陷后允许新一轮真实验收。旧失败与原账继续保留；部署、原存档和补粮仍未授权。T27/T30及T30-R1/T34及T34-R1/T45/T46已合，不重复派工；其他活动卡沿主会话最新调度，所有权不变。

T49已合，T06榆坡30人已正式发布。T08于59fca09停止，17次新L2后累计4.21283504/4.5元；23passed/7manual含五人共享背景失效，不等于23人来源闭合。T07当前独占模型并使用同一manifest，T09在其后首审；T08先按下卡零模型定位，闭合受授权叶及鞠舒次数阻断，不抢槽。T48正式预检已兼容T46/T49。未变合格L2继续复用，L4实际阅读；完整请求上界不适配就未发停止，不截正文。

T07自然结束并释放模型/预算锁后，主会话核对原共享账的spent、reserved和未用额度，再按已授权追加预算作串行修订。现world/design/w1-reopen-authorization.json已被原grant/proof按hash冻结，不能直接改文件；保留其原件及旧allocation，沿原账追加可追溯的授权修订凭证和额度差额，工具仅补所需继承支持，不换nonce重领。五人来源变更须显式补齐ID/叶权限；鞠舒第三次不包含在本卡，仍待真正决定。全程不提高波次20/goal100、不释放未知0.083736。当前只能准备差异，不能并行改公共工具、manifest或额度。

T17-A可现在零模型准备。指南D.3要求原18人完整档和N1–N17至少12项/90%、十天离屏；D.6允许W1在M2期间并行。因此河湾32人及本轮实际引用事件/事实闭包核验后，可先跑T17-B，无须等苇汀、砾泉、桑坂全部闭合。保留完整正式世界与动态出处guard；出现未批准实际人物依赖就停止。河湾专项通过不关闭T11-C，也不替代C.4/C.5的里程碑验收。人物模型优先，T07/T09结束或遇停止线后让槽给已就绪T17-B；T08只有真正解除阻碍才回队列。T18零模型来源准备可并行，后续原完整目标顺序不变。

以下保留首次增额前历史快照：spent=10.81767864、未知reserved=0.083736，当时波次20元、剩余9.09858536；表内余额不是当前可用额。原allocation和grant留档，不能从零记新卡；当前T08仅余0.28716496，T07运行中的余额以原账为准。

| 原卡 | 原上限→新上限 | 追加额度 | 扣旧spent及reserved后最多可再用 |
|---|---:|---:|---:|
| T06 | 2→2.5 | 0.5 | 0.58760016 |
| T07 | 3→4.5 | 1.5 | 1.73736984 |
| T08 | 3→4.5 | 1.5 | 1.62939256 |
| T09 | 3→4.5 | 1.5 | 4.5 |

该历史快照四卡剩余合计8.45436256元，波次当时保留0.64422280元未分配；首ID的0.50元是卡内试运行上限，非额外授额。按正式完整请求最高费率预留，逐次结算及确定未发退款后才推进；未知0.083736不释放。T09原120请求、373叶/15背景、172原hash/60私密风险保留，旧11.497666–13.315548元只是全30人首轮上界合计，不作实际账单或整批预付。任何增额都需在原账记录授权/旧值/新值/时间并幂等；不得提高波次20或goal100。余额不足即未发停队列，主会话可在本次用户授权与剩余额度内重新分配，不能另起空账。

T17旧spent=0.28484248、reserved=6.372890、upper=6.65773248保留；新轮先1元试运行，确认正式源守卫与账本后本轮新增最多8元，含试运行及所有角色/复测费用，合计上界14.65773248仍低于原单轮30。旧run不清零，新轮绑定旧run与此次授权并汇总旧未知预留；与内容账分开，统一计goal100。主会话授槽前去重核对全部历史费用及预留，无法核齐则只做零模型准备，不能把100减局部快照充余额。

受控重开使用固定授权标识user-reopen-20261012-01，逐卡绑定实际旧记录与源hash、修订ID/叶路径和有界新尝试记录。每轮仍最多两种实质修法及一次规划，失败后停该块，不反复更换授权标识；同文重复送审不算新修法。L2强审、逐flag+随机5的L4和波次评分不降，原缺失provider原文不得补造。

正式仍152full/294名册、榆坡发布后全体1192缺口，新增人口禁令保持。T28存档undefined已修、相关31/32，旧候选release与CLI前置未闭合；本次具体恢复队列不包含T28，先做人物，禁止借T31绕路。R01–R18完整目标保留。T35释放magic后接T36/T37，T41后接T42；T38/T43只在文件锁允许且不占人物槽时执行，T39接T38、T40接T42、T44接T38/T42。

review-002-yp=782a49e阶段审核通过，范围限T06正式发布与c64163d修订。已读review-001以来stat及t06-published-merged-core.log，抽样正式裘砚与汤桓：核签留白待确认、补墙收尾及各自未知事项可进入交谈，两人共同记忆仅同村往来；现金33/75、原库存与旧记忆均与冻结before一致。npc-depth-yp.test.mjs分别断言首次20条事件闭合及已发布重发零差异，合后CORE40的现成日志通过；本次未复跑。用户酒馆仍旧版，全体W1未关闭。

## 近期完整任务卡

### T01 已完成：榆坡4人、带路回执及送货付款前置已集成；相关、合后核心及8轮隔离HTTP前置通过，未跑模型。 完整验收见[已完成卡](PLAN_已完成.md#t01)。

### T02 已完成：四村生产/库存/分阶段税贸和权限已合入；L1/L2/L4、相关与合后CORE通过，人口未增。 完整验收见[已完成卡](PLAN_已完成.md#t02)。

### T03 已完成：公开账/权限真实HTTP检索通过；传闻实际获知链由T21闭合。 完整验收见[已完成卡](PLAN_已完成.md#t03)。

### T04 已完成：独立审计152full/1840缺口及17traits名单回归；T11-A已接全体release/final。 完整验收见[已完成卡](PLAN_已完成.md#t04)。

### T05 已完成：定点叶子合同/冻结指纹/可迁移manifest与预演发布已合入；相关与合后CORE通过，无真实模型。 完整验收见[已完成卡](PLAN_已完成.md#t05)。

### T06 已完成：榆坡30人真实L1/L2/L4、T04与事件闭合及正式发布已合；28旧通过复用、双人新L2通过，L4五抽样mean4.37/min3，重发零差异，不再派工。

### T07 苇汀失效条目续审【真实共享源hard；待T58】

拥有world/design/w1-wt-depth.mjs、world/drafts/w1/wt-depth/及tests/npc-depth-wt.test.mjs。沿原controlled候选和sourced/l4-invalidations.json，逐条处理湛鸥7hard及真实L4失效；核对17未复审ID。已有12 passed只在实际失效或叶改动时重审。原源hash及钉死LF/CRLF出处凭证保留，新增修订继承旧proof，不覆盖旧规划。

29eeeca已合及主CORE40。reopen/complete-003/final-report.json记录湛鸥首轮13叶/1事件/4risk合同完整，memorySeeds[2].event为source hard；支采“两户都催先拿”超过原publicSpeech，不作模型故障重送同文。新增0.05495808元、累计2.81758824/4.5、余1.68241176；首ID已领1/2，第二未领，17后续未发，12记录未变。真实L4与发布预演未完成。

验收tests/{npc-depth-wt,npc-depth-review,npc-depth-authored-background}.test.mjs及CORE；30人L1/L2完整，失效L4重新实际阅读、逐flag+随机5及规则12评分，事件闭合/T04/预演通过后交T11，不改正式人口或正确叶。

T50真实before/兄弟叶与T54逐entry背景继承已修好，不重做42 changes/12指纹准备。新阻碍见同目录parent-replay-diff.json：tools/npc-depth.mjs父proof仅重放changes，缺真实old-record draft basis，15人23兄弟叶漂移。shared-repair-diff列四方各memorySeeds[2]；background仅group_3.narrative改变，candidate四方同步，其余原sourceRefs/risks/participants不改。shared-repair-plan仍是被拒提议，不能直接视为授权或已通过准备。

权限精确范围为npc_wt_zhangou、npc_wt_zhicai、npc_wt_xueying、npc_wt_leizhi各memorySeeds[2]，source仅memory_wt_depth_group_3.narrative。湛鸥provider子字段映射原failurePaths父叶；另三人须新增source权限侧凭证。冻结world/design/w1-reopen-authorization.json祖先hash为f23eb0e7c49f472e75e47fce1946469e6c906a6314e9bf341aa6b77a2bfd3195；原record绑定如下，shared-repair-plan.authorized逐人的inheritedAuthorizationHash继续保留。

| ID | 原grant绑定record hash |
|---|---|
| npc_wt_zhangou | eb019f7032173a2fd23085cd778f9dadc856cd797a789d3a88d6724b2160d637 |
| npc_wt_zhicai | 3f150064b3ae9b26936e94398ef271e9637ac66916db8f5f91b36902811aafc3 |
| npc_wt_xueying | ec4c2bb7b1b26f72a3c119d76c426220abe86489c1a3fb3a8fb73accd085fa3b |
| npc_wt_leizhi | 57f901ab78d02a41c7bf1699bc33ca0356ecfa7332b549a3b019c80760716926 |

湛鸥首轮后record为5f18f3b4b4c3ad25f6ebcfad0bd020208ea4d16d513a31bd325d19946d5739c6，须沿prior链核到表内原hash，不能替换祖先。全goal已授权现NPC source编修，主会话可串行维护精确来源凭证，不把普通补证一律转交用户；预算及次数不变。余17/原12只是本次未变快照，T58若使通过者实际context改变，按证据失效重L2。

### T58 T07父basis与四方源唯一续修【零模型】

拥有tools/npc-depth{,-content}.mjs最少helper及review/publish调用点、T07 source/candidate与对应tests。父proof绑定冻结原record hash还原draft basis，再叠changes；record只重建候选，不作事实源。持久/预检/full/compact/发布共用重放，拒篡改越权。

group_3仅narrative及四方memorySeeds[2]同步收窄；沿原publicSpeech，不假定同意，不改sourceRefs/risks/participants。湛鸥finding memorySeeds[2].event映射已准父叶；支采/薛萤/雷芷补共享叶权限。主串行提供source侧凭证，列ID/pointer、原record及grant祖先hash；继承冻结manifest、budget ID/hash/attempt/限额，禁改冻JSON或换nonce空账。

先真实子plan零模型prepare通过；实际已准备父entry与四方修订均须真实测试，禁mock替代，覆盖各消费者及hash/兄弟叶负例。context改变者失效重L2，未变者全指纹/record保持，不硬保12。相关+CORE；不重做42/12或预算框架。T08仅实证同根才复用helper，不扩正文。

权限/quota核过由主复用T07原chat领第二次，本卡0模型。余1.68241176/限4.5/波次20，保留失败和未知预留。仍fail即卡住，不拆卡重领；后续验收沿T07。

### T08 砾泉最小修卡【零模型；整卡卡住】

据59fca09的reopen-complete/{next-gap.txt,background-source-block.json,neighbor-request-guard-block.json,stopped-report.json}。23passed/7manual，五人背景失效，最多21闭合；余额0.28716496。鞠舒两次已尽，第三次须真正决定，增额不重置次数。

拥有world/design/w1-lq-depth.mjs、world/drafts/w1/lq-depth/；T54已完成逐entry背景/context继承，本卡仍受来源授权及次数阻断。原neighbor-request-guard-block.json显示崔帆两叶携“向她解释过”，新after为“需先问她是否愿意谈”；衡庐另两叶同类。T58父basis helper仅在实际T08父proof重放证实同根时复用，不扩本卡正文、不重做已过四叶准备。

共享源仅另存memory_lq_depth_readback修订：narrative、designedFacts[2]、sourceRefs[12,13].publicSpeech、associations五份narrative/factsHash及匡叶viewpoint；五人memorySeeds[2]与knowledge.known[2]同步。依据匡叶原occupation/goals及三项risks，删“被本人回绝”，只谈本人确认原则；原秘密/旧记忆/refs哈希和参与者不改。新背景revision继承父源，foundation.revision不换；旧proof读旧背景，新元数据仅验本事件差异。

现grant缺沙萝及五人完整共享叶权限，不能执行该源修订；先交精确差异，依调度串行补授权支持。其余仅七manual的hard叶；未变通过者复用。来源五人重审后才L4/闭合预演；相关及CORE，保留旧80请求与费用，禁止新nonce/重领。

### T54 已完成：63613dc已合；真实T07的42 changes/12指纹保持，T08父proof四叶及逐event+sourceHash的L4/发布重放通过，相关87/CORE40；0模型，T07真实复审与T08来源授权仍归原卡。原验收见 `git show ee0f4e6:docs/PLAN.md`。

### T09 桑坂两人一次规划【卡住；第三次待人类决定】

0323dc2的first-review/complete-002/stopped-report.json：42次直接L2、2.46694448元，28passed/2manual；13事件26人闭合，shared_11池杉/查悦与shared_12秦婉/龙芙未闭，L4未批准。首审及补证两次attempts已尽；不自动第三call、新nonce或重领。

只准备原world/design/w1-sb-depth.mjs两人失败叶的最小差异。池杉known[2]/memorySeeds[2]改为明确“池杉说…；查悦说…”的原publicSpeech归属；独立first-review/authored-background.json的shared_11已载双方公开说话，hard把有限发言判为私密属证据冲突，不能据此扩大knownBy。若牵动共享正文，列出查悦受影响叶，不覆盖旧通过。

龙芙原memorySeeds[1]支持湿布记忆、独立shared_12支持招呼，不能因before.known未列就判无源；pending步骤不算已做。voice.register恢复“先指叶背再谈土”并仅补原notes的重复旧例；亲属备注收窄为原sourceRecords可见动作，删“使他不耐烦”等推断，unknown保留未知边界。逐hard绑定独立源/原hash，缺源不编造；保留失败，不能手工改passed。

无第三次授权，执行仍卡住。未变28人复用；后续若获真实决定，原账总限4.5、未知预留不退，原L1/L2/L4、30人T04与事件闭合/预演及相关+CORE门槛不变；不新增人口或发布。原范围/验收见 `git show ee0f4e6:docs/PLAN.md`。

### T10 已完成：32人和五独立源L1/L2/L4闭合已合，候选合后56过；后经T11-B正式整合，不重审；原卡累计2.40776216元。 完整原验收见 `git show bb4c575:docs/PLAN.md` 对应卡。

### T11 人物分批原子整合与全体质量门槛

调度依据：用户明确的硬限制是第 1、2 项完成前不得新增人口，并要求卡住后继续其他块；人物优先级不应让个别村卡住阻断无关验收。指南 D.3 第 1 项要求原有 18 人完整档，D.6 的 W1 允许 M2 期间并行；C.4 的全量测试及 release 仍是里程碑关闭条件。故允许先整合已完整审核的河湾 32 人并进行 M2 专项验收。T06现已正式发布，原失败与新增轮分别保留；不增加人口，不将分批整合称为全体人物达标。

T11-A 已完成：同快照原子预演/写入、事件闭合与全体full的release/final强门槛已合；原验收见 `git show bb4c575:docs/PLAN.md`，不重建发布器。

T11-B 已完成：da431e4正式整合河湾32人、15事件闭合，幂等/旧记忆与原17traits保留；当时全体1517缺口仍拒release，原88项合后证据见PROGRESS，原验收同上。

T11-C 全体人物质量关闭：只有 T06–T10 全部所需人物和事件完成并整合后才可关闭。全体正式 full 的 validateNpcDepth/findNpcRuleWording 零缺口，原17traits固定值不变，随机10人平均至少4、单项至少3；主会话跑 npm run build:release 并须成功，保留其他类别失败；必要相关测试和CORE通过后打 review-w1-depth 并派审核。依赖全体内容卡及 T11-A/B，当前待T07–T09恢复闭合，不通过拆批假称本卡全部完成。原第1、2项完成前不新增人口的限制一直有效。

### T12 已完成：单N完整审核及旧报告CLI已合入；mock/相关/合后CORE通过，真实调用0，旧失败不改。 完整验收见[已完成卡](PLAN_已完成.md#t12)。

### T13 已完成：五链实际位置/60分钟/燕麦/濒死司法/十天结算，定向40及合后CORE38过；模型0，叙述错留T15。 完整验收见[已完成卡](PLAN_已完成.md#t13)。

### T14 已完成：WIP及89ed384已集成；语义时间负例/显式交谈/恢复通过，合后CORE通过；未跑300轮模型。 完整验收见[已完成卡](PLAN_已完成.md#t14)。

### T15 已完成：私密任务边界/实际8次木8费16回忆及替人发言回归，定向61与合后CORE过；真实模型留T17。 完整验收见[已完成卡](PLAN_已完成.md#t15)。

### T16 已完成：有效N/账本/知情/盲辨及工具实测口径合入，相关18/合后CORE过；原真实失败报告不变，模型0。 完整验收见[已完成卡](PLAN_已完成.md#t16)。

### T17-A 新轮来源准备【T52部分已合；仅续T56】

8c2243d/d391ebf已合；地点精确span及27反例通过，guide、npc_delivery/home_visit/offscreen/private/social六场完整，含十天离屏；四场实际依赖拒发。榆坡30人已正式发布且publisher重放零差异；preflight仅把河湾32人含原18人放入approvedIds，不能以旧T11-B全world hash阻挡新发布源。

证据限docs/测试报告/20261012-T17-new/dependency-gaps.json及zero-model-requests.jsonl：46/48–49为courier榆坡问题行及30人闭包，245/247–248为shove同类；233/237–239为quest_social三村tax，郑汐/栾佩展开王浦/焦岩；283/285–286为voices的problem_lq_3慎书/宁野。host实际位置分别messages[9]/[22]/[5].content；review的sceneBefore/sceneBeforeReply需同源绑定，assertions.actual的ID是拒发错误串，不能豁免，应重跑消除。当前尚无私密正文必需依赖的独立证据；若续跑真实遇到，逐ID/字段/源/场景拒发留证，六场与已发布河湾/榆坡可用范围不能冒充十场或有效N通过。

### T56 来源续修已完成；历史归属仍未知

d983cc6已合；原十场87回合正常HTTP全角色完成，33项guard及旧拒发回放通过，preflightReady=true。现存paymentReady=false仍是真实结果，仅因310笔旧usage中110笔缺run/responseId关联；24笔持久run结算及初版/resume前缀已核齐。归属核查未完成，不能补造ID、退款未知或修改旧run。来源与私密守卫保持，预算门槛最小修订交T17-B；本段替代旧调度中“历史必须逐笔归属核齐才付款”的附加条件。

T59只读复核payment-history.json的六份原文件hash均一致；该文件SHA256为1ac8412d8ff67046087b7201360c7103a36932360bfe2c8081ae9510c270dec1。旧spent0.28484248+未知6.372890+完整legacy5.77063128+新增8=20.42836376<30，110笔费用1.41941680已包含，未减去任何可能重复项。310笔发生于2026-10-11，早于主goal起点2026-10-12T08:02UTC，仍全额保守计入。

主目录world/drafts下m4-object、w1、m2-people、w3、w4、w5、w3/items、w3/recipes、w1/villages各budget.json的spent+reserved合计34.38349580；逐源为14.83547840、0.50579544、0.45309952、5.24950848、3.13954664、1.67909368、0.73012320、1.48249612、6.30835432。加上述20.42836376得已知账保守goal上界54.81185956；共享内容按整个20元波次封顶替换14.83547840后为59.97638116<100，包含潜在重复，不称真实去重账单。共享原账spent14.75174240/unknown0.083736，SHA256 b2aacefb8d420c0e044103537e6205347f5ca9d168dc0a1346de2712cc1e725f；相对goal-usage-snapshots.json期初7.94707120的已知增量6.80467120仅作核对，不再另加或抵扣。主logs与持久run共20份usage日志均无goal起点后的费用；其他本期执行API0据主调度记录。执行前刷新原账/hash并列覆盖范围，有新增未覆盖金额则先计入，禁止拿局部余额充全goal余额。

### T17-B 河湾M2新轮【已授权；先零模型预算proof】

拥有新轮报告目录；最小改preflight.mjs预算门槛，必要tools/playtest-budget.mjs及其测试、CLI接线。复用原守卫，不加框架或第四守卫。将T56保守envelope的来源/hash/封顶写证据，分别报告budgetUpperSafe与historyAttributionComplete=false；paymentReady须来源全过、完整上界可证且新增账本严格预留/结算，不能直接置true。保留完整world/bundle/host，重跑guard和十场0模型；验证超额/缺金额拒发、归属未知不冒称核齐，相关playtest-runner、playtest-npc-evidence、playtest-budget及CORE。

proof通过后由主授唯一模型槽；新run绑定旧run及user-reopen-20261012-01，旧账不动。原十场ID/repeat=1/parallel=4走正常HTTP、检索、完整提示栈。先≤1元验证，再新增累计≤8元含初探、所有角色及复测；每次发送核envelope，每笔request/responseId、角色、费用完整ledger，未知不退，单轮30/goal100/内容20不变，超限未发停止。不得第三次旧resume。

N1–N17至少12项完整有效且≥90%，N6/N16零泄漏，N12真实盲辨，N17十天自主行动；账本/时间/存档100%，工具选择/参数/target分母如实。真实失败最多复测一次并保留旧失败；不降source/private/tests。相关及CORE；不部署，M2关闭仍待C.4/C.5，T11-C不变。

### M2修复批（2026-10-13主会话审定，来源：Astra草案M2-fix-planner-001，对应T60真实失败）

审计结论：F1、F2、F3同意；F4（工具机会标注）并入T61，不单独成卡；F5同意，里程碑收尾命令归主会话。已知未查清：N9在进入司法流程前中断的原因、quest_social之外其余账本失败的来源、林穗/吴朔两处知情是否有公共来源——不为此派卡，复验后按实际失败再定。

### T61 已完成：主持人默认4096、逐N与盲辨8192，截断仍判失败，四处工具机会标注修正；相关28/CORE40，0模型，真实效果由T64复验。

### T62 已完成：“燕麦”可解析为带壳燕麦，粮仓买卖与商家交易的工具边界写清，发布→承接→买粮→交付整链守恒；相关8/CORE40，0模型，真实效果由T64复验。

### T63 已完成：审查请求与示例区分可见细节、否认知情和补造经历；合并后静态提示超限，同会话精简到35956字节（上限48000）；专项37/CORE40/prompt全过，0模型，真实效果由T64复验。

### T64 M2真实复验【真实模型；T61–T63已合，待模型槽】

结果：在修订后的完整提示栈上重跑原十场，按原门槛给出通过或明确未通过。
可改：仅docs/测试报告/M2-recheck/及新run生成物；复用T60的preflight.mjs，只适配父记录、来源、额度和入口。代码和旧报告锁定。
验收：`node docs/测试报告/M2-recheck/preflight.mjs --zero-model`、CORE；然后`node tools/playtests.mjs --run-dir docs/测试报告/M2-recheck --run-id m2-recheck-001 --card M2-recheck --increment 8 --repeat 1 --parallel 4 --milestone M2 --only guide,npc_courier,npc_delivery,npc_home_visit,npc_offscreen,npc_private,npc_quest_social,npc_shove,npc_social,npc_voices --host-installation F:/dnd/SillyTavern --budget-proof docs/测试报告/M2-recheck/preflight.mjs`。
模型：全角色合计≤450次、新增≤8元（初探≤1元含在内）；保守单轮20.42836376+8=28.42836376<30。失败场次每场最多复测一次。门槛不变：N1–N17至少12项完整有效且≥90%，N6/N16零泄漏，N12真实盲辨，N17十天自主行动，账本/时间/存档100%。规模约150–250行适配。

### 法术150/首领40第一批（2026-10-13主会话审定，来源：Astra草案W2W4-planner-001）

路线：法术31→61→91→121→150（S1–S4，S1只用已有处理器；S2炉作通风水土、S3光医心、S4空间役灵仪式各依赖对应引擎卡）；首领4→16→28→40（B1–B3，8个智能存在按2/3/3分布）。
审计改动：草案把缺的消费者拆成约80张单效果引擎卡，改为按机制族一族一张（热、风、水土、光、医植食、心契、空间、役灵、仪式），每张在一个会话内把该族列出的效果都接到真实状态。草案里“release通过前内容卡不派”的前置删除：内容卡只依赖T19合入，release只在里程碑结束时看。各族效果清单见 logs/sessions/W2W4-planner-001.final.txt 的A段。

### T65 热族消费者【零模型】

结果：玩家的热系法术作用在真实对象上——给燃烧的炉火升温并持续耗燃料（forge_heat）、接触测温（sense_heat）、窑温与裂损（craft_heat）、活体保暖（warm）、室内控火与通风（contain_fire）、火线阻路（barrier）、冰针随环境衰减（damage_cold）。
可改：server-plugin/magic-object.mjs、environment.mjs、magic.mjs、magic-primitives.mjs的必要接点，tools/w2-mechanism-map.mjs、world/design/w2-mechanism-map.json，新增tests/magic-forge.test.mjs。锁定：world/meta正式目录、首领文件、extension/tools.mjs。
验收：`node --test tests/magic-forge.test.mjs tests/magic-object.test.mjs`、CORE；每个效果至少一条正常路径和一条拒绝路径，覆盖燃尽、未燃对象、重载。模型0。规模约600–900行。

### T66 风族消费者【零模型；T65合入后派，同改environment/magic接点】

结果：风系法术有真实效果——烟气沿连通出口流动而烟源继续产烟（airflow/smoke）、除尘、风向回声、沿途可听传话与静音、谷物排湿、缓降与轻物托举、船帆、有限呼吸、投射偏转、风刃对软物与甲材、道路风阻。
可改：新增server-plugin/magic-air.mjs、tests/magic-air.test.mjs；environment.mjs、magic.mjs、magic-primitives.mjs、world/meta/rules.json及机制图两文件。锁定：法术/人物/首领正式目录。
验收：`node --test tests/magic-air.test.mjs tests/magic.test.mjs`、CORE；封闭空间不能凭空净化，每个效果有正常与拒绝路径，到期与重载一致。模型0。规模约700–1000行。

### T67 首领接触记忆、目标与领地【零模型】

结果：智能首领记住实际交锋和接触，按领地目标改变公开态度，存档恢复后仍认得发生过的事。
可改：新增server-plugin/boss-cognition.mjs、tests/boss-cognition.test.mjs；bosses.mjs、boss-migration.mjs、tools/validate-world.mjs的模板接点。锁定：magic*、npc-memory.mjs、正式world文件。
验收：`node --test tests/boss-cognition.test.mjs tests/bosses.test.mjs`、CORE。模型0。规模约250–400行。

### T68 首领谈判、交易与结盟【零模型；待T67】

结果：玩家在巢穴提出条件，首领按自己的目标接受或给出拒绝理由，成交时交换有限物资并保存关系。
可改：新增server-plugin/boss-negotiation.mjs、tests/boss-negotiation.test.mjs；bosses.mjs、boss-cognition.mjs、extension/tools.mjs、tools/validate-world.mjs必要接点。工具说明要短，合入后tests/prompt.test.mjs仍须通过。锁定：magic*、正式world文件。
验收：`node --test tests/boss-negotiation.test.mjs tests/boss-cognition.test.mjs tests/tool-groups.test.mjs tests/prompt.test.mjs`、CORE。模型0。规模约300–500行。

### T69 S1：30条法术完整发布，31→61【真实模型；T19已合，待模型槽】

结果：玩家可买书并付费学习30条新法术（区域交锋与防护9、位移与自愿传讯8、器物与水务7、生长与役灵6），按真实材料、距离和持续消耗施放，每条有可验证效果。
可改：新增world/design/w2-s1.mjs、world/drafts/w2-s1/、tools/w2-s1-content.mjs、tools/publish-w2-s1.mjs、tests/w2-s1.test.mjs；world/meta/{spells,skills,items}.json及书商库存只追加本批。锁定：rules、bosses、引擎、共用流水线。
验收：起草→L1→L2→L4（标记项加随机5条，随机10条平均≥4、单项≥3）→`node tools/publish-w2-s1.mjs --publish`；`node --test tests/w2-s1.test.mjs`、CORE；覆盖30条取得→学习→施法、旧战役升级、重复发布零写入。
模型：起草≤108次、L2≤108次，合计≤12元。规模：30条法术加至多6本书，一个内容会话。

### T70 B1：12个首领完整发布，4→16，智能存在0→2【真实模型；待T68】

结果：玩家能遇到12个各有生态与战术的首领，其中2个能记住交涉、说明拒绝理由并实际交易或结盟。
可改：新增world/design/w4-b1.mjs、world/drafts/w4-b1/、tools/w4-b1-content.mjs、tools/publish-w4-b1.mjs、tests/w4-b1.test.mjs；world/meta/bosses.json、tools/m4-balance.mjs、新增world/design/w4-b1-balance.json。锁定：spells/skills/items/rules、人物、引擎。
验收：起草→L1→L2→L4→`node tools/publish-w4-b1.mjs --publish`；`node --test tests/w4-b1.test.mjs`；`node tools/m4-balance.mjs --catalog world/meta/bosses.json --out world/design/w4-b1-balance.json`（单人≤15%、标准五人55%–65%）；CORE。
模型：起草≤36次、L2≤36次，合计≤6元。规模：12条模板与正文，一个内容会话。

### T18 零模型部分已完成：713f0b9已合，14条全部走陆青付费出售的三册书，新测试22/CORE40；来源增量的L2/L4（≤1元）并入T19一起做。原卡如下。

目标：每条已有候选都有玩家实际能获得的学习来源。涉及文件：`world/design/w2-reuse-candidates.mjs`、新增 `world/design/w2-reuse-learning.mjs`、`world/drafts/w2-reuse/` 的来源审核记录，必要的新书/教学数据候选；新增 `tests/w2-reuse-learning.test.mjs`。不提前改正式人口。

实现要点：复用 `reuseSpellCandidates` 的已实现效果，17 正式法术与 14 候选保持去重；参考 `tools/publish-m4-batch2.mjs` 中 spell/book/learning source 合并形状及现有书籍取得方式。来源可为实际已有合资格教师或有可买/可借路径的书，导师 services/serviceCatalog 白名单、技能条件、价格和地点作息必须一致，不能只是 catalog 文本里提到一本不存在的书。新来源按审核流水线，原法术已审核正文不重写。

验收：`node --test tests/w2-reuse-learning.test.mjs tests/w2-reuse.test.mjs tests/m4-publication.test.mjs`、CORE；14 条来源引用、取得、学习失败成本和学习后施放路径均可验证。内容 L2 只审来源增量，上限 1 元并计 W2/M4 共用 20 元账，L1/L2 无硬错、L4 完成；候选正文审核指纹没有改动则复用。不要做：新增法术、新增处理器、无成本赠书或免费学会。依赖：0模型来源准备可先做；付费审核及T19正式发布仍待T17达标。并行：可与不触碰魔法目录的 M3 整理，无其他模型块时审核。

### T19 已完成：14条法术连同三册书和学习来源经L1/真实L2/L4正式发布，目录17→31，重复发布零写入；19次调用0.12064368元，相关8/CORE40。

### T20 已完成：WIP及305e8f9已集成；玩家账本隐私过滤、390×844截图与相关/合后CORE通过。 完整验收见[已完成卡](PLAN_已完成.md#t20)。

### T21 已完成：40逐源真实获知及四村HTTP全链、拒绝边界/重启往返撤销通过；合后CORE过，未实跑模型叙述。 完整验收见[已完成卡](PLAN_已完成.md#t21)。

### T22 已完成：严格合同、稳定预算与单失败ID复审已合入；完整源留证/无损精简、相关71/合后CORE38过，模型0。 完整验收见[已完成卡](PLAN_已完成.md#t22)。

### T23 已完成：四份粮约正式作息提运/交割、无人拒绝与重载防重复通过；相关11/合后CORE38过，模型0。 完整验收见[已完成卡](PLAN_已完成.md#t23)。

### T24 已完成：精确已发教学/技能来源凭证与幂等保留合入，相关25/合后CORE过，非法增量仍拒，模型0。 完整验收见[已完成卡](PLAN_已完成.md#t24)。

### T25 已完成：独立新背景/受控修订/首次双审及原provider失败原文落盘合入，合后83过，工具0模型，T06当时冻结。 完整验收见[已完成卡](PLAN_已完成.md#t25)。

### T26 已完成：三字段/compact合同、精确事件ID和显式T10控制身份已合，相关与合后CORE95过，0模型；T06当时冻结。 完整原验收见 `git show bb4c575:docs/PLAN.md` 对应卡。

## 下一批完整卡：T27–T44【按实际状态选择】

调度以开头最新授权段为准；T06已完成，T07/T09人物优先，T08卡住，T17依河湾实际引用闭包可先专项，T11-B已完成。本批不抢占其模型槽或同文件工作。只有前序卡卡住、等待独占资源或无可执行工作时，主会话才选择下列无依赖块。源码机制可在人物阻断期间推进，模型验收和内容发布另按卡内依赖。新增人口仍禁止，T06已正式发布，T11-C及全体full的release/final门槛不变；原23项预期失败保留。所有世界定义仅写world/，测试在隔离存档，CORE指三个既定核心文件，提交前必跑。新增测试/CLI在卡内明确注明，不能当现成通过记录。

本批细化R01/R02/R03/R07/R08的一部分；这些粗卡仍保存未覆盖范围。M4当前已有共享伤害、防护、状态、物件热过程、首领反制；M3已有编年史/检索/审查/历史窗口；不重新建同类系统。T34–T37只补机制图明确标missing-consumer的四类。治疗病理、空气/地形/仪式等剩余消费者、NPC教学成长、完整政体及远方内容仍在原粗卡，做完本批再细化，不以本批代替全部指南。

### T27 已完成：正规动作磨损、协助维修及学习成败前置已合；相关20/CORE38，0模型，不代替真实M1；原验收见 `git show 63ce4d1:docs/PLAN.md`。

### T28 M1材料施法与历史场景【部分已合，整卡卡住】

T28-R1修好新回执undefined规范化并保留严格篡改拒绝，相关31/32、合后CORE40；旧候选release深度仍失败，CLI合成session前置尚未实现。唯一规划续修已用，不派同路径修复或换卡续做CLI。原场景/HTTP/发布门禁验收见 `git show 63ce4d1:docs/PLAN.md`，未过项继续保留，本批不派。

### T29 已完成：持久run身份/全角色费用/未知预留与传输恢复合入，合后58过；0模型，不重领同run预算。 完整原验收见 `git show bb4c575:docs/PLAN.md` 对应卡。

### T30 已完成：含唯一T30-R1，真实只读HTTP search回执绑定回合/版本，旧协议/空结果/伪造/回滚重启已验；相关51/CORE40，0模型；原合同见 `git show 63ce4d1:docs/PLAN.md`，不代表整体M3通过。

### T31 M3记忆/文风真实场景与长历史前置【待调度】

目标：把指南M2–M9、V1–V7缺项变成可复现会话与评分，另给M1第200回合问第10回合保留明确长程项。涉及：新增tests/playtests/m3_memory.json、m3_language.json，tests/history-window-integration.test.mjs、retrieval.test.mjs，新增tests/m3-acceptance.test.mjs；tools/playtest-metrics.mjs仅新增M3汇总，保留M2。实现：复用MemoryIndex、chronicleContext、既有历史窗口与真实HTTP，使用已获授权记忆；四种“账本/帐本/灶台/老板娘”查询命中同一事件且不命中系统用语。合成200回合仅用于离线重放/检索回归，不能计作200次真实模型会话；M1长程实证尚缺时报告未覆盖，不冒充M3全部关闭。

验收：`node --test tests/m3-acceptance.test.mjs tests/history-window-integration.test.mjs tests/retrieval.test.mjs tests/chronicle.test.mjs tests/npc-acceptance.test.mjs`、CORE；固定事实可用，裁历史不丢已索引事件，M6–M9断言100%，V评分≥95%、陈词≤0.5/千字，未测不能通过。模型0。不要做：重建检索、强加向量服务、删未覆盖项。依赖：T28/T30；与同场景/metrics写者串行，可并行M4引擎卡。

### T32 M3短程M/V与M1遗留真实复验【待调度】

目标：取得修后真实提示栈证据，不以离线夹具关闭M3。涉及：仅隔离报告与失败摘要；使用T27/T28/T31的场景。实现：先核对T17专项和本轮全部引用NPC已批准，保留正式完整世界与提示hash；会话各8–20自然轮，HTTP检索、真实审查及一次改写全启用。未完成200回合M1明确留在R02，不删门槛。

验收：`npm run test:playtests -- --only craft,literacy,magic,reconcile,world_upgrade,m3_memory,m3_language --repeat 1 --parallel 4 --run-dir docs/测试报告/m3-mv-wave --run-id m3-mv-wave --card T32 --increment 30`，以T29实际新增CLI及文件id核对；同持久波次上限30、单卡最多30，所有角色费用共计，每条失败最多复测一次且计原额。账本/时间/存档100%、魔法等评分≥90%、V≥95%，原问题逐项真证据；未达保留失败交规划。不要做：部署、额外新轮预算、报告M3全完成。依赖T17专项/T11-B/T29/T31及本轮NPC批准；唯一模型槽，报告目录不与T17最新覆盖写。

### T33 M3两人格150回合浸泡【待调度】

目标：复用现成浸泡器完成行商/建设者各150回合及11.4指标。涉及：docs/测试报告/m3-soak-wave内产物，必要仅错误复现另拆卡，不在运行中顺手改引擎。实现：沿m3-soak-state/adapter/runner的run.json、all-model-calls.json和任务tape；先读旧pilot费用/配置，属于同run的费用必须接续，不能重命名抹账。正式验收用一个持久run，两人格共上限30；先用--max-tasks小样确认审查语义时间，再同目录继续，样本费用包含在30元内。

验收：`node tools/m3-soak.mjs --directory docs/测试报告/m3-soak-wave --init`，后以`--run --turns 150 --budget 30`续跑及`--report`；每25轮五题来自50–200轮前真实事件，不足记失败。结构召回≥95%、细节≥80%、矛盾≤1/100轮、语义时间偏差≤10%，报告费用/p50/p95/cache目标≥70%，所有角色均入账。不要做：空探针算通过、用回放时差替语义、再领额度、原档。依赖T32及全部实际输入NPC/共享事件批准闭包；不以T11-C阻断无关机制，全体构建仍独立验收；独占模型。M1 200回合实证和R2部署仍另列，不能据本卡关闭全部M3。

### T34 已完成：含T34-R1，正常HTTP动作生成NPC/怪物位置并接法术/首领区域消费者，未知/遮挡/无同意/到期拒绝；相关51/CORE40，0模型；原合同见 `git show 63ce4d1:docs/PLAN.md`，其余M4缺口保留。

### T35 M4已知锚点与许可位移【执行中，原范围不变】

目标：补anchor_sense/blink/teleport等真实位移消费者，保留路线玩法。涉及：新增server-plugin/magic-movement.mjs、tests/magic-movement.test.mjs，magic-targeting.mjs、magic.mjs、location-access.mjs必要接点。实现：state.records保存发现过的锚点及所属/许可引用，复用location-access、天气路线/同行义务约束；effectSpec校验距离、载荷、代价与前置，移动成功写实际位置并留下事件，禁止只有效果标志。未知锚点、过期/他人许可、空间封锁拒绝且钱物不扣；越障与传送分别受可用地形/锚点约束。

验收：`node --test tests/magic-movement.test.mjs tests/home-permission.test.mjs tests/magic.test.mjs tests/npc-obligations.test.mjs`、CORE；许可撤销、载荷超额、失败原子、重复/导入重放及同行位置一致。模型0。不要做：默认王都瞬移、绕过私宅/司法、新增远方人口。依赖现有目标及权限模块；与T34/T36同magic文件串行，可并行T30。正式法术发布另走T19/R04。

### T36 已完成：b4c72e9已合；正常传讯符记、NPC反向有限情绪及team_link逐人许可/撤销/到达私有记忆已闭合，相关56/CORE40、合后CORE40；0模型。原验收见 `git show ee0f4e6:docs/PLAN.md`。

### T37 M4受资源约束的作物生长【待调度】

目标：给growth原语接真实农田/植物产量，避免“加速”空记效果。涉及：新增server-plugin/magic-growth.mjs、tests/magic-growth.test.mjs，agriculture.mjs、environment.mjs、magic.mjs必要接点；阶段界限写world/meta/rules.json，沿现有数值审计。实现：effectSpec指已登记田块/植物、有限比例/持续，复用agriculture field/batches和真实水/种粮/营养等已有资源；缺对应资源状态先明确拒绝，不能凭空补出。影响成熟/收成须在农事日结消费，保存来源与已用额度，不能治疗病理或自动操控NPC田地。

验收：`node --test tests/magic-growth.test.mjs tests/magic-object.test.mjs tests/village-ledgers.test.mjs`、CORE；无种/无授权拒绝，有限加速、资源账守恒、跨季及跳步一致、同田不叠无限收益、旧档零补发。模型0。不要做：重写热系统/农业、整年全量长模拟、新法术正文。依赖现有农业/目标；与agriculture/magic/rules写者串行，可与T30并行；正式内容仍独立审核。

### T38 已完成：f55e901已合；正常world_time周贸易与world_trade区域同日锁价通过，专项17/CORE40、合后CORE40；相关34/35的village-ledgers:33旧人物worldrelease1192错误仍保留，整体发布门槛未关。原验收见 `git show ee0f4e6:docs/PLAN.md`。

### T39 已完成：玩家可租铺、进货、雇工盘点、卖给实际顾客并得到可追溯的盈亏账，违约/停业/破产库存不为负；相关20/CORE40，0模型。原卡见 `git show 43f76a8:docs/PLAN.md`。

### T40 M5玩家发单与NPC离屏接单【待调度】

目标：修quest当前仅NPC发布、player接单的明确缺口。涉及：activities.mjs的quest委托薄适配、新增server-plugin/quest-board.mjs、tests/quest-board.test.mjs，npc-autonomy.mjs、extension/tools.mjs必要接点及现有world_quest参数。实现：复用state.quests/questQuota、D–S quotaUnits、托管和deliver/visit/build可验证目标；玩家从已有授权身份额度发布，默认无官职只能合法私人规则。接单者限现有full且有实际能力/作息/路线/材料，离屏任务沿advanceNpcAutonomy，失败/取消/超期有原因及退款规则，进度只给有渠道知情者。

验收：`node --test tests/quest-board.test.mjs tests/npc-autonomy.test.mjs tests/playtest-npc-evidence.test.mjs tests/npc-obligations.test.mjs`、CORE；额度不足/无资金拒绝，NPC到场履约或失败、托管守恒、并发抢单只一人、十日离开后事件可追查、无关NPC不知。模型0。不要做：新冒险者人口、随机宣布完成、放宽T15私密。依赖T42身份授权接口后接正式玩家官职，私人/测试身份可先机制；与T39/T42的activities路由串行。

### T41 M5户籍公民与分聚落贡献【执行中，原范围不变】

目标：增加现有人物世界中的居民/公民申请及可见贡献，避免贡献自动授官。涉及：新增server-plugin/civic.mjs、tests/civic.test.mjs，activities.mjs聚落操作、extension/tools.mjs、state-notices.mjs、extension/ledger-view.mjs，world/design/m5-civic-rules.mjs；界面只接已有账本面板最小条目。实现：沿state.records与settlements记录居住起日、申请/担保/费用/犯罪审核、按聚落贡献流水；复用law案件状态、正式在场管理人和真实工程/教学/捐赠事件，sourceEvent幂等。达到阈值只开放申请，土地/官职仍须授权；旧档未知居住史不能补造。

验收：`node --test tests/civic.test.mjs tests/law.test.mjs tests/runtime.test.mjs`、CORE；条件逐项拒绝、费用只扣一次、不同村贡献不串、失败/私人工事不刷贡献、账本面板可见。模型0。不要做：新居民实体、替名册生成full、原档迁移、凭贡献自动封官。依赖现有T20/law/T02；与activities/UI同文件写者串行，可与T34的独立消费者开发并行但最终接点串行。

### T42 M5议事否决与NPC管事授权【待调度】

目标：补村民大会意见、上级任命与离屏管事，落实S3/S4。涉及：新增server-plugin/governance.mjs、tests/governance.test.mjs，civic.mjs、activities.mjs、extension/tools.mjs、npc-autonomy.mjs接点；规则仅现有四村权限/现有居民。实现：沿authorization记录增加权限范围/期限/撤销/审批主体，议案记录有资格的实际参与者与意见，未参加者不代投；按既有任命来源核验上级，不因玩家自称获得官职。管事在批准税率/地块/费用上限内办理真实申请、扣钱/公账/建房project，越权送议事，玩家不在可日结且留事件。

验收：`node --test tests/governance.test.mjs tests/civic.test.mjs tests/npc-autonomy.test.mjs tests/law.test.mjs`、CORE；大会否决不落工程、撤权后不代办、重复收费拒绝、日结和手动一致、预算不足停工。模型0。不要做：新官员人口、无视否决、未定爵位自动赋权、扩大四村任命。依赖T41/T02；与T40/T39和自治接点串行，可并行无引擎写入测试报告。

### T43 M5多法典程序与区域声望传播【待调度】

目标：在既有crimeAction/lawAction/advanceLaw上补地区/势力分账及有路程的消息后果。涉及：server-plugin/law.mjs、npc-cognition.mjs必要接口、新增server-plugin/reputation.mjs、tests/reputation-law.test.mjs；world/design/m5-law-rules.mjs只配置现有政体与来源。实现：沿legal_case的evidence/witnesses/处罚时间、records及认知传播sourceEvent，记录聚落口碑、势力信誉、名望/恶名各自增量。不同辖区采用已配置法典，不因跨村自动定罪；公示/信使沿真实路线延迟，友好与敌对评价不一。缺政体规则则明确无执行权限，不套默认刑罚。

验收：`node --test tests/reputation-law.test.mjs tests/law.test.mjs tests/npc-cognition.test.mjs`、CORE；同事两地不同口碑、传播前未知、伪证/无证拒判、上诉/已服刑不重复罚，司法钱物守恒与旧案件重放。模型0。不要做：新官员/政体人口、全球即时通缉、把所有听说变事实。依赖既有law/T15，正式制度内容另审；与T36及law/cognition写者串行，可并行T29。

### T44 M5历法节日与确定性世界时钟【待调度】

目标：补W5仅候选节日无运行器、势力阶段无消费的机制，先不冒称24节日/300传闻完成。涉及：新增server-plugin/world-clock.mjs、festival.mjs、tests/world-clock.test.mjs、festival.test.mjs，engine.mjs日周接点、scene-card.mjs最小可见事实；world/design/m5-clock-rules.mjs引用已存在文化/势力/聚落。实现：沿360日年/calendar、weather种子和state.records保存clock阶段/触发条件/游标；节庆须实际日期、组织授权、支出、参与与关系事件，玩家不参与也按资源条件推进。四村日历可先适配；24条候选先L1/L2/L4发布才进入正式节日库。时钟不直接生成新人口/秘密/免费库存，具体消费者只接已实现经济/农事/生态状态，未知效果仍拒绝。

验收：`node --test tests/world-clock.test.mjs tests/festival.test.mjs tests/weather.test.mjs tests/village-ledgers.test.mjs`、CORE；跨日/月/年一次触发、分步与大步同种子一致、组织费守恒、取消/无人参与/资金不足有结果、离开30日后仅通过合法场景/消息显现。模型0。不要做：把常量阶段当完整世界演变、发布未审节日、新觉醒NPC、全村传播秘密。依赖T38/T42消费者；核心纯函数可先做，engine/scene接点串行；正式内容波次仍R08/R09。

后续卡沿开头队列和实际文件锁调度；T40依赖T42，T42不依赖T40。T31依T28仍阻断，不借M3接走未实现CLI；T32/T33尚无真实模型资格。

扩波依赖不变：R04法术150与R05首领40含8智能存在，先T18/T19及适用消费者/真实平衡；缺消费者保持待细化，不用研究型标签减少正式目标。R06新人口严格依T11-C全体达标及原第1项、T17验收、T19，当前不可执行；R14再依W1完成。M5/M3机制或局部专项通过不会解禁人口，也不替代全体full构建门槛。需要用户决定的原档、部署继续跳过；T06已关闭；T08依本次停止判断，不在本批绕过。

### T45 已完成：54e0201 首次附件/完整请求预留/发布重放已由主会话以 a64f348 合入；相关74与CORE38实跑全过，bb4c575已登记。首次draft/L2实际出站及预演重放、篡改拒绝合同保留，勿重派；完整验收见 `git show bb4c575:docs/PLAN.md`，mock不等于T08真实审核。

### T46 已完成：整轮draft+必要review原账预留、预算拒绝停队列及逐次provider原文已合；相关32/CORE40，0模型，未知预留与旧记录不变；原合同见 `git show 63ce4d1:docs/PLAN.md`。

### T34-R1 已完成：已并入T34完成记录，不再调度；正常动作和首领消费者验收均保持。

### T48 T09预检适配T46【零模型，可独立执行】

仅拥有world/drafts/w1/sb-depth/request-preflight.mjs、first-review/请求预检产物及README、新tests/npc-depth-sb-preflight.test.mjs；与T09串行，不改公共入口、预算或冻结源。

缺口：旧脚本用estimateCostYuan收集请求并断言拒绝后30次估价；T46按rates直接估价且首次拒绝停队列，旧review探针也缺reviewDraftFor。在临时副本实测runDepth整队列拒发；逐ID探针复用runContentPipeline和正式builder/transform/reviewDraftFor，记录完整draft/review及最高费率整轮上界，覆盖30人full/compact。原共享账只读，generate硬拒绝，不能伪造响应或修改生产账来通过。

依T49定版后刷新直接L2首审请求；原draft请求仍留作历史对照。验收新测试、npc-depth-sb及CORE；373叶/15背景/11附件和原hash不变。实测不足整轮零调用、拒绝停队列；汇报每ID预留与新4.5元及旧账余额的关系，旧总和不作预付。模型/费用0，未知保留；通过后交T09，失败遵守两修停止线。

### T49 显式增额与受控重开入口【已完成，原验收保留】

仅拥有tools/{content-budget,content-pipeline,npc-depth,npc-depth-review,npc-depth-content,publish-npc-depth}.mjs及对应测试，新增tests/npc-depth-reopen.test.mjs、world/design/w1-reopen-authorization.json；不改人物正文。与T06–T09模型阶段串行，不碰T35/T41。

旧入口拒额度变化、T06/T08受控修订及已用reviewRecovery。复用原预算锁/修订proof，接固定user-reopen-20261012-01授权清单；按上表增额，保留旧allocation/请求/未知/计数。清单绑定旧record或未审缺档证据、源hash、允许ID/叶/增额；重放幂等，换nonce不另领。新proof串接旧proof，T07源凭证原规则不变，T06双侧事件必须相容。

沿原逐ID入口记录新轮有界尝试；合法已存draft或冻结候选过L1后直接完整L2，首次附件/coverage照常，不造模型draft记录。未变passed跳过；预算停止只由此次清单明确覆盖的ID解除并留历史。逐次原文及T46必要请求预留保持，不能只删除冻结判断。

验收tests/{npc-depth-reopen,npc-depth-budget,npc-depth-review,npc-depth-source-evidence,npc-depth-batch-publication}.test.mjs及CORE；旧入口无授权仍拒、重复增额不翻倍、旧费用不减、失败零写、未授权叶拒、双侧漏改拒、复审后L4失效、原证明链可重放。modelCalls=0。
## 后续粗卡：全部待细化

粗卡不得直接交执行客户端会话。近期卡完成后规划客户端会话按最新源码和证据拆成同样字段的可执行卡，仍保留以下完整范围；已有实现先审计差距再派增量。部署 R1–R5/正式版均单独列为待用户确认，不是源码开发的依赖。

### R01 M0/M1 剩余验收与原始问题追踪【待细化】

范围：核对构建 release/final 分层、正式 prompt/build-card、25 工具共用定义、场景 6000 字符、输出边界、10 类 8–20 轮试玩及账本至少 90%。补现成材料施法 G1、真实维修磨损前置、修改消息/世界升级、学习失败合理断言；不重做已完成提示层。部署后副本连续 20 分钟和酒馆冒烟留待用户，R1 迁移/兼容清理只在实际发布时做。验收：相关测试、真实提示栈预算 30 元；待细化时标注 B.4 每个问题对应证据。

### R02 M3 记忆、检索、一致性与 300 回合浸泡【待细化】

范围：D.4、8、9 章余项；编年史、固定记忆、中文称呼/近义词、相关性/最近性/显著度检索、成批裁历史、未登记名字登记/改写、场外无尾注和自然中文表达。可选本地向量检索不阻塞必需机制。清空问题文档叙述组中的已复现硬错，M/V 会话通过后跑行商与建设者各 150 回合。复用 `m3-soak.mjs --directory <隔离目录> --init|--run --turns 150 --budget 30` 和 T14 语义计时；先补缺失测量，不能沿用 pilot 5/6 宣称通过。每 25 回合问 50–200 回合前 5 题，结构事实召回≥95%、细节≥80%，矛盾≤1/100 回合，时间误差≤10%，费用/p50/p95/cache 报告齐全，缓存目标≥70%。依赖 T17/T14；R2 部署另记待确认。

### R03 M4 原语、154 骨架与平衡【待细化】

范围：复核 7.6 的 12–15 种共享原语及效果消费者，`world/design/w2-mechanism-map.json`/`tools/w2-mechanism-map.mjs` 逐条实际映射，特别保留 missing-consumer 状态。无法映射者按指南研究型/合理替换处理，同时保证正式可学法术至少 150，不能删骨架后降低规模。首领模板每种能力实际生效。验收：每原语处理器测试、正式学习/施法链、3.3 平衡区间多种子报告；单人限制与标准五人胜率沿现有规则，不改数值只为过线。依赖 T19；世界内容与引擎消费者分卡。

### R04 W2 法术达到 150【待细化】

范围：31 条之后分 25–50 条候选批，依 R03 已实现机制组织，不为数量重复同义法术。每条门类/阶段/消耗/材料/时间/距离/持续/合法性/反制/社会后果齐全，取得来源可玩；全量 L1/L2、L4、wave 评分及 world_upgrade。每波累计预算 20 元，断点续跑，作者与审核分开；依赖 T19/R03。与不写 magic/items/人口正式文件的工作可并行。

### R05 W4 首领 40 个与 8 个智能存在【待细化】

范围：现有 4 到 40，至少 8 个智能存在有记忆、目标、领地、谈判和拒绝理由，能力来源共享原语；150 怪物的生态模拟结果仅有旧记录，核验是否仍适用，缺的 20 种子三年模拟在波次末跑一次。保留掉落守恒、驯服/骑乘/召唤边界、觉醒前后生态与身份。内容审核每波 20 元，上线模拟和 world_upgrade。依赖 R03；首领与法术目录编辑隔离。

### R06 W1 白石镇与 LOD0 人口、建筑、地方生活【待细化】

范围：T11 人物门槛和 T17/T19 完成后解锁。河湾 58 人/22 户且至少 30 full；另四村 40–150 人全员名册、至少 12 full；白石镇 800–1500 人的合理种子人口，至少 80 full、200 以上名册，LOD0 合计至少 250 full、500 名册。名册、full 和未生成 seed 各自计数，不能用 seed 充实际名册。现有约 152/294 只作起点，补齐差额并逐份过 T04。所有聚落按 4.7 完整档，野外地点至少 15；经济账、建筑所有权/进入、年龄亲缘、事实引用和本地问题互相一致。先骨架后 25–50 条小批，20 元/波，world_upgrade 不覆盖旧玩法变化。依赖 T11/T17/T19；不得先建人口再补质量。

### R07 M5 经济、任务、身份、治理和法律【待细化】

范围：D.7、3.10–3.13、5.10–5.11；周贸易流、收入税与合同真实结算，NPC 冒险者公告栏接单/离屏完成，户籍/贡献/任职/爵位/领地与管事，政体法典和跨区声望，群体舆论及人物成长/人生变化。复用现有农业、义务、司法、任务工具，不另造绕过账本的完成记录；合同两端对账，玩家不在世界继续且有可追查事件。S/F 真实会话通过，预算 30 元/轮，守恒/存档失败当场修；R3 部署排除。依赖 T17、T02，地区扩展与人口批需规划文件隔离。

### R08 W5 节日运行、世界时钟及觉醒【待细化】

范围：已有 24 节日候选经审核发布，历法触发实际作息、生产/停工、集市/仪式参与，不能只展示名称。四村地方节俗与世界节日关联避免重复计数；组织资产、计划、40 势力钟阶段实例化，历史真相调查门槛、传闻源头事件、怪物觉醒有真实代价和消息延迟。复用 `w5-festivals.mjs`、world lore/social 目录及 NPC 日程/时间推进。测试跨日/跨月/重放不重复活动，未知信息不泄漏；20 元/内容波，真实 S/F 预算 30。依赖 T03/R07 的相关机制。

### R09 W5 遗迹据点 60 与传闻 300【待细化】

范围：至少 60 处遗迹/野外据点，其中至少 15 在白石镇所属城市范围；每处历史、占据者、物权/继承、危险机关、进入/难度/可得资源/时间变化齐全，宝物不刷新。至少 300 传闻含真/半真/假、源头事件、携带者、路线、逐手变化，四村现有 40 条可复用但不能重复计数。传播必须沿真实时间路线和认知边界，真相不进公开目录。并复核已达 10 文化、12 神祇、40 势力、80 带年份历史各自机制/引用缺口；20 元/波、四层审核。依赖 R08 传播/时钟接口；内容可先候选后发布。

### R10 W3 生活长流程与目录审核收尾【待细化】

范围：已有 410 物品/200 配方不重新扩数量；补完整取得、制作、失败副产品、热源、修理、耐久、保存/腐败、价格成本、职业认证与自创技能/配方、材料施法链路验收。复核 519 条审核/正式源指纹与随机评分，NPC 炉火照管不能靠绕过维护实现。真实生活流程覆盖 11.3 对应项，30 元/轮；相关性质测试保证财物守恒与重复发布保留售空状态。

### R11 M6 主题、消息、顶栏和全部面板【待细化】

范围：第 12.1–12.4、12.9–12.12；本地授权字体、双主题和 16 品质色、`<q who>` 说话人、系统事件卡、未知说话人登记、隐藏回执/尾注、信件告示、中文日期/天气/地点/钱袋/生命魔力。角色/技能/法术书/行囊/人物/任务约定/领地/编年史/传闻全部面板，玩家知情视图，T20 只是一块。自然语言快捷按钮、说/做切换和可关闭少量快捷键；继续/创建/存档/设置和前情提要，错误正常语言、debug 才见 JSON。390×844 可用、字号/高对比/减少动画、Playwright 截图基线无控制台错误。隔离运行不部署；依赖 T20/R07 各状态接口。

### R12 M6 地图和世界素材【待细化】

范围：world/geo SVG 四级缩放，亲历/可靠转述/传闻不同迷雾，路线/季节封闭/玩家标记，耗时花费风险出行预览只填输入框待玩家发送。统一美术说明、游戏纹章、约 80 张类型×时段×天气背景、LOD0 人物头像及 world 中可复用提示、`assets/LICENSES.md`。按指南允许职业纹章替代头像，但不能把所有背景/素材永久省略；新付费服务需用户决定则登记，先完成不依赖服务的接口和有许可素材。地图视口和鼠标/触摸可操作，截图基线。依赖 R06/R11，图像技能适用时由后续执行者读取，规划不调用模型。

### R13 M6 中文声音与按说话人语音【待细化】

范围：环境循环与情境音乐淡入淡出，仅 CC0/允许使用音频和许可清单；一次进入点击启用声音。按 `<q who>` 拆分台词、旁白独立声线、npc.tts_voice 与性别/年龄默认回退，中文多声线、文本哈希缓存、跳过/重播/关闭。先核实已安装可用服务与系统语音，新增付费/登录配置列待确认并继续独立实现；不能读酒馆密钥。自动测试加实际中文播放证据和手机操作。依赖 R11，完整 M6 验收与 R4 部署分开记录。

### R14 W6 LOD1 约 30 聚落/至少 500 full【待细化】

范围：按 4.1/4.7 建约 30 个 LOD1 聚落，LOD1 合计至少 500 份完整档；不把 LOD0 的 250 份重复计作新增目标。所有新 full 过 T04，地方经济、官员、建筑/进入、名册、关系与传闻有真实引用。规则离屏/智能层预算依 5.9 分层，不对所有人物每回合调用模型。分地理区 25–50 条内容批，四层审核、20 元/波、升级保持既有变化。依赖 R06/W1 完成，M5 期间可并行准备。

### R15 M7 LOD2/LOD3 与跨地区旅行贸易【待细化】

范围：本帝国 20 省/100 郡纲要和道路/地理/文化/政体约束，LOD3 稳定种子生成器，生成后入库不重生矛盾实体；跨区实际路线、季节路况、时耗花费、贸易库存与消息传播。不得以没有生成的远方人数冒充已实现 full 数量。跨地区 11.3 会话通过，种子确定性和进出地区重启一致，30 元/真实轮；R5 部署排除。依赖 R07/R14，地理纲要可先准备。

### R16 全规格差距逐项闭合【待细化】

范围：在 M5/M7 细化时建立第 3–9 章逐小节映射，覆盖职业多阶段/认证、属性死亡重生、16 品质、技能突破/自创、魔法研究、宠物坐骑召唤、任务层级、身份贡献领地爵位、法律经济、时间天气以及 6.2 全部玩法动词和 6.3 运行时创造。现有实现逐项列真实入口/测试/缺口，不新增一份泛泛“完成证明”；有缺口派功能卡，有已覆盖证据直接引用。其他玩家可选层默认关闭保持规格，不能成为必需系统的替代。技术范围含 7.5 的性能、缓存/上下文预算和配置开关；依赖各相关里程碑，先于 M8。

### R17 M8 全部真实会话、1500 回合浸泡与性能【待细化】

范围：11.1–11.5 全覆盖，11.3 每项都有断言或评分，完整发布会话每个 3 次；五人格各 300 回合，11.4 召回/矛盾/语义时间门槛与费用延迟缓存报告；10,000 事件/5,000 消息性能达到 7.5。每轮真实试玩 30 元，每次浸泡从严 30 元，超过停止并登记，禁止拆 run 清预算。指南要求的原档迁移与用户酒馆实玩属于待授权例外；使用合成/已有授权只读副本做可完成的重启、重生成、导入导出核验，明确不等同真实部署验收。依赖所有必需源码/内容卡和 R16。

### R18 最终构建、用户体验清单与停止【待细化】

范围：主会话运行 `npm test`、`npm run test:baseline`、`npm run build:release`、`npm run build:final`，基线保持 23 预期失败；数量和各波次评分全部核对，包括 150 法术/400 物品/200 配方/150 怪物/40 首领及 8 智能存在/LOD0 250 full 与500名册/LOD1 500 full/60据点/300传闻。B.4 每个原始问题可追溯到修复和验收。准备指南 11.7 的 30 分钟用户体验清单，更新当前状态≤150行，PROGRESS 逐块状态真实，待确认列补粮选择/原档迁移/部署及任何新增服务选择。无可执行块时即使构建仍失败也按用户停止条件保留报告停止，不能写全部完成；全部通过也不部署。

## 主会话交接边界

本次仅修改PLAN，主会话负责PROGRESS/CHANGELOG/当前状态与合并。摘要写入F:/dnd/logs/sessions/planner-client-004.final.txt，不提交logs。完整旧合同保留在PLAN_已完成及63ce4d1版本；压缩不删除原验收。派工前核对分支、差异和活动会话，T35/T41继续原文件范围。

### T30-R1 已完成：已并入T30完成记录，唯一续修已闭合，不再调度。

### T28-R1 卡住：存档修复已合，release失败和CLI未实现继承T28停止线；原唯一续修授权已用，不再调度。
