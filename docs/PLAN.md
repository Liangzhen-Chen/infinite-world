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

### T07 已完成（待T73正式整合）：苇汀30人L1/L2/L4全过，随机10人评分均4.32/最低3，7条共享事件闭合、T04零缺口、发布预演通过；累计4.49559880元。重开授权入口已支持追加授权：T07/T08/T09上限7/6.5/4.5元、每人6次、波次25元（用户2026-10-13同意）。T58已并入完成。

### T08 已完成（待T86正式整合）：砾泉30人L1/L2/L4全过，L4均4.38/最低3，事件闭合、T04与发布预演通过；10次调用，累计4.92485848元。

### T86 已完成：砾泉30人正式整合，6条事件闭合；全体152 full的人物深度与规则措辞零缺口，“四村年粮守恒”转为通过；相关44/CORE40，0模型。T11-C随之关闭，已打标签review-w1-depth。

### T54 已完成：63613dc已合；真实T07的42 changes/12指纹保持，T08父proof四叶及逐event+sourceHash的L4/发布重放通过，相关87/CORE40；0模型，T07真实复审与T08来源授权仍归原卡。原验收见 `git show ee0f4e6:docs/PLAN.md`。

### T09 已完成（待T85正式整合）：桑坂30人L1/L2/L4全过，随机10人均分4.33/最低3，15条事件闭合、T04零缺口、发布预演通过；累计2.77692672元。

### T85 已完成：桑坂30人完整档正式整合，15事件闭合，重发零写入，仍152 full/294名册；相关29/CORE40，0模型。

### T10 已完成：32人和五独立源L1/L2/L4闭合已合，候选合后56过；后经T11-B正式整合，不重审；原卡累计2.40776216元。 完整原验收见 `git show bb4c575:docs/PLAN.md` 对应卡。

### T11 人物分批原子整合与全体质量门槛

调度依据：用户明确的硬限制是第 1、2 项完成前不得新增人口，并要求卡住后继续其他块；人物优先级不应让个别村卡住阻断无关验收。指南 D.3 第 1 项要求原有 18 人完整档，D.6 的 W1 允许 M2 期间并行；C.4 的全量测试及 release 仍是里程碑关闭条件。故允许先整合已完整审核的河湾 32 人并进行 M2 专项验收。T06现已正式发布，原失败与新增轮分别保留；不增加人口，不将分批整合称为全体人物达标。

T11-A 已完成：同快照原子预演/写入、事件闭合与全体full的release/final强门槛已合；原验收见 `git show bb4c575:docs/PLAN.md`，不重建发布器。

T11-B 已完成：da431e4正式整合河湾32人、15事件闭合，幂等/旧记忆与原17traits保留；当时全体1517缺口仍拒release，原88项合后证据见PROGRESS，原验收同上。

T11-C 已关闭（2026-10-13，T86）。原文：T11-C 全体人物质量关闭：只有 T06–T10 全部所需人物和事件完成并整合后才可关闭。全体正式 full 的 validateNpcDepth/findNpcRuleWording 零缺口，原17traits固定值不变，随机10人平均至少4、单项至少3；主会话跑 npm run build:release 并须成功，保留其他类别失败；必要相关测试和CORE通过后打 review-w1-depth 并派审核。依赖全体内容卡及 T11-A/B，当前待T07–T09恢复闭合，不通过拆批假称本卡全部完成。原第1、2项完成前不新增人口的限制一直有效。

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

### T64 已执行，未通过：九场完整（npc_private 4/8），账本149/170，有效N 12项但整合判定0/12，工具漏5错3，审查标记泄漏5，N12盲辨7/9；324次调用6.60625216元。证据在docs/测试报告/M2-recheck/。第二次分析交Astra（M2-fix-planner-002），修复后再做第三轮。

### M2修复第二批（2026-10-13主会话审定，来源：Astra草案M2-fix-planner-002，对应T64真实失败；分析全文见该草案A段）

要点：T64的0/12含测量错误——tools/npc-acceptance.mjs把同场任何账本失败或残留警告连坐到该场所有N，指南只要求逐N按行为判定、另设账本/时间/存档100%的总体门槛。21条账本失败是漏调9、错工具6、参数语义错5、脚本分步歧义1，没有引擎缺陷。npc_private停在第4回合是保密意图被映射成“会面”占用时段、随后改写把失败移动写成成功。5条泄漏标记都不是私密外泄。N1/N7/N8/N14本就没有对应场景，属未测。
审计：四张修复卡和第三轮复验都同意。T98与T96都增加静态提示，T98在T96合入后派。第三轮上限10元，单轮保守上界因此到约38.4元，超过旧的30元；按用户授权由主会话放行并记账。

### T95 已完成：逐N按关联证据判定，不再被同场无关的账本失败或警告连坐；账本/时间/存档100%总门槛保留（原90%改回100%）；分段评分改为单回合、上限12288，截断或缺响应仍算未完成。用T64原始结果离线重判可恢复7项N通过，整体仍因账本149/170等拒绝。相关34/CORE40，0模型。

### T96 已完成：world_read可按单个人物定位读取；保密不建会面、明确等待不缩时、未登记地点先查目录写入规则；“服务暂停”限定为交易与授课；四条原失败行动链离线回放通过；提示估算11103 token。相关与CORE通过，0模型，真实效果由T99验证。

### T97 已完成：审查取用历史工具回执、原始答复和未承接委托的托管事实；knowledge类警告须指出无渠道主体和具体私密内容；唯一改写保留工具失败和实际时地。相关37/CORE40，0模型。

### T98 已完成：回忆保留真实期限与已记录的失败费用，同题对白沿各人风格，冲突现场由已登记见证者发言；提示估算11642 token（硬上限12000）。相关8/CORE40，0模型，真实效果由T99测量。

### T99 已执行，未通过：六场完整（送货5/9、私宅6/9、离屏4/8、推搡4/9中断），账本157/165，有效N 9项过5项（N5/N6/N10/N13/N16），盲辨9/9与N6/N16零泄漏通过，工具漏4错2；305次调用6.94093904元。证据在docs/测试报告/M2-recheck-003/。第三次分析交Astra（M2-fix-planner-003）；第四轮若仍不过，M2标卡住并继续其他里程碑。

### 生物与修行流派补足（2026-10-13用户新要求；主会话审定，来源：Astra核查与草案Creatures-planner-001，核查全文见该文件）

用户原话：世界是中西结合的仙武世界，生物要丰富，有道士和尚法师，不能没有怪物；世界不能全由人类掌控。
核查结论：150种生物里中式6种、西式5种，其余139种（92.7%）是动物植物变体，没有哥布林、兽人、巨魔、鬼魂、僵尸；16个首领15个中性。非人类主导的文化1种、势力2个，都很小，没有成规模的非人政体。职业里有道士、僧侣、法师，但61条法术全部归法师，道、僧、巫、祭司专属法术为0，只有法师有认证导师；地点里没有可进入的寺院、道观或学院。怪物只能靠主动追踪或探巢遇到，赶路不会遇见，四个村没有自己的栖地；委托目标只有送货、到访、建造，不能结算除妖。
审计：八项全部同意。三张新卡（T153赶路遭遇、T154中西生物18种、T155除妖委托）；其余五项是改已有卡的选题和接点，不新增数量：T93、T102–T104、T105–T106、T142（重写为9省纲要含三个非人社会）、T94/T113–T115/T117–T122。派这些已有卡时，开场消息须带上下面对应的C条。所有内容原创，不用原小说专名与情节。

共同验收CORE为：node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs。各卡另跑下列同领域整组；新增专项按本批ID检查，不将正式目录总数写死，已有明确验收保留。

所有内容卡均同卡完成执行会话起草、全量L1、全量真实L2、定点修正、L4和正式发布到world。L4读标记项加随机5条，波次随机10条六项均分≥4、单项≥3，每次人工阅读≤10分钟；验证取得路径和world_upgrade保留旧变化。下列真实调用均指DeepSeek L2，起草0次，金额包含修正；同一失败最多重跑一次。

共同锁定原存档、用户酒馆、dist、旧报告及其他会话在写的文件；不更改屏蔽表来放行名称，不复制原小说专名或情节。PLAN/PROGRESS/CHANGELOG仍归主会话；发布共享目录和内容账串行，草稿可并行。T150–T152当前占用的接点等原卡释放后再接；改工具的卡加跑tests/prompt.test.mjs及tests/tool-groups.test.mjs，静态提示≤11900。

### T153（C1）已完成：穿过已有栖地或在野外停留时，按路线、时段和现存种群出现踪迹或在场生物，可避开、追踪或接触；重放不重生，种群耗尽不再出现，遭遇不默认开战。专项与相关76/76、CORE40，0模型。长时间生态模拟留全量测试核对。

1. 玩家结果：穿过已有栖地或在野外停留时会看到有来源的踪迹或在场生物，可以避开、追踪或接触。
2. 可改server-plugin/{engine,wildlife,wildlife-range}.mjs及必要场景投影、tests/wildlife-encounters.test.mjs；锁定目录正文。复用追踪的种群扣除和实例生成，按经过路线、时段与战役种子判定；途中遭遇落在实际路段节点，停下或绕行正确结算已走时耗。与T109和所有engine时间写者串行，可并行C2起草。
3. 验收CORE及node --test "tests/wildlife*.test.mjs" "tests/w4-*.test.mjs" tests/seasonal-migration.test.mjs tests/farm-pests.test.mjs tests/combat.test.mjs tests/pets.test.mjs tests/prompt.test.mjs。覆盖正常移动与等待、重放不重生、观察不刷怪、种群耗尽、绕行及存档恢复；遭遇不默认开战。
4. 模型0次、0元。
5. 预计3–4小时，先让已有物种进入日常旅行；不以每次移动必出怪或全图刷新实现。

### T154（C2）补中西生物缺口并落在六个聚落周边。

1. 玩家结果：五村与白石镇各有可达的怪物活动区，能辨认妖怪、亡灵和西式生物的不同习性与应对办法。
2. 可改world/design/creatures-mixed.mjs、对应drafts与发布入口、meta/{monsters,rules,items,recipes}.json及栖地地理接点；允许wildlife/bosses实例化、magic-ritual/combat和schema的本批必要接点，锁定旧生物正文及人物。复用C1，地点优先取T94本批ID；T94的meta锁由主会话交给本卡串行发布，既有T90骨架不重做。
3. 验收CORE及node --test "tests/wildlife*.test.mjs" "tests/w4-*.test.mjs" "tests/boss*.test.mjs" "tests/magic*.test.mjs" "tests/w3-*.test.mjs" tests/combat.test.mjs tests/pets.test.mjs tests/seasonal-migration.test.mjs tests/farm-pests.test.mjs tests/world-validation.test.mjs；node tools/w4-audit-ecology.mjs。将现有生态工具改为读取正式目录及本批ID，保留20种子三年，避免只查旧100种骨架；新增本批正常遭遇、弱点、取材与world_upgrade用例。
4. 真实L2预计30–50次，上限1.5元；含生物、材料和栖地新事实。
5. 预计18种，约4–5小时加后台生态模拟：中式9种覆盖狐妖、木精、游魂、僵尸与灵兽；西式9种覆盖哥布林、兽人、巨魔、骷髅、元素体及魔兽。每种明确生态位、食性或能量来源、作息、弱点、人兽关系和可得材料；至少12种处于一至二阶，每个聚落至少2种可接触。新增材料最多6项，优先复用已有物品；文明族群以交换产物表达资源，不把居民统一设成可猎取材料。灵体定义须在追踪及首领生成时进入实际状态，非生殖性亡灵按既定生成条件恢复，不能套普通动物繁殖文案。

### C3 并入T93：改寺庙学馆选题并补修行入口。

1. 玩家结果：在白石镇能实际拜入道、佛、法、武四条路线，学到入门本领并承担相应学费、材料或戒律。
2. 在T93原33人内选既有名册作导师，保留18手工和15殿舍学馆的大体分工；可改原craft草稿/发布文件、people目录与meta/professions、skills、items，必要时解开T93地理锁补寺观学馆入口。learning、professions、magic-ritual与工具的必要接点同卡完成；锁定无关人物和61术效果，与T92、C4及所有人物/工具写者串行。
3. 验收CORE及node --test "tests/r06-bs-*.test.mjs" "tests/npc-*.test.mjs" tests/learning.test.mjs tests/professions.test.mjs "tests/magic*.test.mjs" "tests/w2-*.test.mjs" tests/spell-lore.test.mjs tests/world-validation.test.mjs tests/prompt.test.mjs tests/tool-groups.test.mjs；node tools/audit-npc-depth.mjs。覆盖正常拜师、认证、购书、学习、施用和仪式资格取得；共享术式须同时检查高阶学习与熟练度，不剥夺旧法师已学能力。
4. T93整卡真实L2上限由120次调为160次，金额仍≤7元，包含新增机构和教学事实；不是另加7元。
5. 预计在T93原工作上增加2–3小时。道门沿验汀传统授符箓、护界与驱邪；佛门补原创寺院师承，授静息、体术和度亡仪轨，不把现有四神教派全部改称佛门；法师沿许苓及学馆授元素与研究，武者沿侠客/战士授步法兵器。另用既有巫师、祭司承接巫祝，用炼金师/医师承接炼丹；代表法术先复用定息、守心、符持远笺等。入门和守戒状态由实际行为产生，保留有代价的仪式资格要求。

### C4 并入T102–T104：改法术选题。

1. 玩家结果：修行路线有可买到或学到、实际生效的代表术式，后续仍按原30、30、29条发布。
2. 可改三卡原w2-s2/s3/s4设计、草稿和发布范围，复用C3导师与机构；补书籍库存和必要材料配方，锁定已合格61术的效果。接C3，三批正式发布串行；不另立法术数量任务。
3. 各卡验收CORE及node --test "tests/w2-*.test.mjs" "tests/magic*.test.mjs" tests/learning.test.mjs tests/professions.test.mjs tests/spell-lore.test.mjs tests/manufacturing.test.mjs "tests/w3-*.test.mjs" tests/world-validation.test.mjs。逐本批ID检查实际来源、职业资格与效果，仪式需用正常获得的资格及C2实际灵体，不能只注入夹具状态。
4. 每卡真实L2预计40–65次、各≤1元，沿原额度；起草、L1/L2/L4和发布均留在各原卡。
5. 每批约2–3小时。T102在炉作水土内安排至少6项道门制符、炼丹控火和武者器用选题，炼丹须有真实药材与成品配方；T103至少10项用于禅定、医护与巫祝安抚，沿光、医、心机制；T104至少12项用于符阵、驱邪、守戒及度亡，沿役灵、仪式和空间。超度落实为特定低阶游魂的可终结状态与去向，不冒充复活；必要的小接点归T104。

### T155（C5）村镇除妖委托与生物往来。

1. 玩家结果：能接下有实际报酬的除妖、驱邪委托，也能通过避让、供奉或交易处理村镇与怪物的冲突。
2. 可改server-plugin/quest-board.mjs及combat、magic-ritual、boss-negotiation回执接点，extension/tools.mjs、world/geo/settlements.json、本批委托来源和发布工具、tests/quest-wildlife.test.mjs；锁定无关法术与人口。依赖C2及C4相关仪式，发布者复用五村与T92/T93人物；与T124及T152的委托所有权串行。
3. 验收CORE及node --test "tests/quest-*.test.mjs" "tests/wildlife*.test.mjs" "tests/w4-*.test.mjs" "tests/boss*.test.mjs" "tests/magic*.test.mjs" tests/activities.test.mjs tests/learning.test.mjs tests/village-ledgers.test.mjs tests/prompt.test.mjs tests/tool-groups.test.mjs。核对指定目标的死亡、驱离或度亡结果，不能用visit冒充；已完成事件不得重复领奖，旧deliver/build行为保留，NPC只接其已有执行能力支持的目标。
4. 真实L2预计12–24次，上限0.8元，审核委托及地方新事实；机制实现不调用模型。
5. 预计8条地方事件或委托，约3–4小时；五村与镇均有入口，至少4条可结算的除妖/驱邪任务，其余覆盖袭扰、材料交易与禁忌供奉。付款、供物来自实际库存；敌意取决于具体行为，不按非人种族一概敌对。

### T142重写（C6）：9省纲要，补三个非人社会；不执行旧T143预写人口。

1. 玩家结果：能从地图与消息知道哪些地区由非人统治，以及当地通行、贸易或敌对关系。
2. 可改world/geo省郡纲要、world/lore/{cultures,factions,factionPeople,history}.json、本批设计/草稿/发布工具、加载与检索接点、tests/lod2-1.test.mjs；锁定LOD0 full和T143按需生成实现。与T110/T111势力、T113–T115地理发布串行，可与C1准备并行；T143后续生成消费这些统治和文化事实，不在本卡提前造聚落与full。
3. 验收CORE及node --test tests/lod2-1.test.mjs "tests/world-*.test.mjs" "tests/w5-*.test.mjs" tests/retrieval.test.mjs tests/world-clock.test.mjs。按本批省郡ID检查归属、邻接与统治方；区域统治不能被默认的人类官府覆写，联络地点不能被当作首都，world_upgrade保留既有地区变化。
4. 真实L2预计70–110次，上限3元，替代T142旧2元上限；包含纲要及新增文化、势力的完整审核发布。
5. 预计9省、32郡，分布草案为2/3/4/5/3/2/6/4/3郡；每省郡仅纲要及3–5名短名册人物，约4–5小时。保留砾耳交证群48人为地方组织，将其所属兽裔社会明确为多聚落区域；另增原创木精联邑与兽人诸部两种文化及两个势力，区域人口用估计规模，不当作已生成人物。分别落实猎林共治及对人贸易、山林自治及季节互不进入、矿谷部盟及边境敌对/议和；至少三个有边界的非人统治或占据区分布在九省内，省名表示地理分区，不强设为帝国官署辖区。沉星七人群保留小群体定位。

### C7 并入T105–T106：改首领后两批选题。

1. 玩家结果：能遇见有不同战法与诉求的妖怪首领和西式首领，其中可交涉者与非人社会有具体关系。
2. 可改两卡原w4-b2/b3设计、草稿、bosses及平衡产物，基础物种取C2或已有目录；锁定普通物种与人物，依赖C2，引用远方统治关系须等C6。与bosses和共享发布账写者串行。
3. 各卡验收CORE及node --test "tests/boss*.test.mjs" "tests/w4-*.test.mjs" "tests/wildlife*.test.mjs" tests/combat.test.mjs；node tools/m4-balance.mjs --catalog world/meta/bosses.json --out world/design/w4-b2-balance.json，T106改用w4-b3-balance.json并保留node tools/w4-audit-ecology.mjs。按各12个ID检查巢穴、弱点、实际材料、交涉与死亡后占据变化，原多种子平衡门槛保留。
4. 各卡真实L2预计25–40次、各≤0.6元，沿原额度。
5. 各12个、各3名智能存在不变，每批至少4个中式和4个西式，其余按生态缺口选；约各2小时加后台平衡。智能个体有族群关系、交易物与可拒绝事项，不能以首领12只替代一整个文明。

### C8 并入T94、T113–T115、T117–T122：改地点与消息选题。

1. 玩家结果：可从村镇传闻追到怪物巢区、废寺或异族旧据点，并从实际调查得知真相和当地生存办法。
2. 使用各原卡设计/草稿/发布范围；T94在原10地点中安排至少6处供C2六个聚落周边活动区使用，C2负责meta栖地与物种绑定。T112补实际占据者接触和调查接点，T113–T115选废寺、旧法术工场、异族边市等；T116负责沿路传播，T117–T122负责内容。锁定无关人物与生物；按原依赖及C2/C5/C6发布先后串行，不另建同地点或同传闻。
3. 各卡保留原命令与CORE，相关域整组为node --test "tests/r06-bs-*.test.mjs" "tests/w5-*.test.mjs" "tests/wildlife*.test.mjs" "tests/w4-*.test.mjs" "tests/boss*.test.mjs" tests/sites.test.mjs tests/activities.test.mjs "tests/world-*.test.mjs" tests/rumor-route.test.mjs tests/village-rumor-access.test.mjs tests/retrieval.test.mjs；T116另保留"tests/npc-*.test.mjs"。各专项随所属原卡交付，核对本批ID的路线、消息来源、占据者及发现后真相，未发布ID不提前引用。
4. T112/T116为0模型；T94沿≤50次/4元；T113–T115各预计25–45次/2元；T117–T120各50–75次/1.5元，T121–T122各45–70次/1.5元，均为原卡整卡额度。
5. 原地点和传闻数量不增；60据点中至少12处体现非人生活或道佛法传承，后六批260条传闻中至少48条围绕怪物、修行与跨族关系。题材含袭扰缘由、交易习惯、供奉禁忌及误传，真伪差异可调查；各原卡预计只增加0.5–1小时接点工作。

### 怪物聚居地、内部文化与成精路线（2026-10-13用户进一步要求；主会话审定，来源：Astra草案MonsterSociety-planner-001）

用户原话：怪可以有自己的部落，可以几种怪生活在一起，也可以某种怪大规模聚居，比如哥布林地宫；怪有自己内部的文化；中式有野兽成精；这里可以做得丰富很多。
现状（Astra核查）：聚落、名册、骨架的数据结构可直接复用；遗迹进入、首领谈判已有，但据点里仍在场的非NPC占据者会直接拒绝进入，首领议和不会转成通行；智能首领存在creatures里，engine.actor只认玩家和NPC；野兽“觉醒”尚无实现；按需人口生成器还没有。
审计：全部同意。七张新卡T156–T162，S5并入T143（按需人口生成，先供核心区聚居地用）。首批六处：炭阶地宫（白石镇近郊，哥布林单族240）、苔灯坞（河湾北林，狐族48）、榆根里（榆坡，木精与觉醒穴鼬林獾混居64）、裂炉营（砾泉，兽人哥布林巨魔主从104）、回汐埠（苇汀，獭龟蛙精怪之乡56）、灰棚集（桑坂，哥布林兽人元素体跨族集市64）。每处12名具名成员（4名完整档、8名名册），其余按需生成。成精阶段用原创名“听息、立意、借形”，与战力九阶分开。卡文里的S1–S8即T156、T157、T158、T159、（S5并入T143）、T160、T161、T162。新增真实模型上限合计约5.6元。依赖：T154（中西生物）与T109（势力时钟）先行；改工具的卡等T101压缩提示合入后再派。

六处以下均为拟建，距离是选址目标，发布时按真实路线计算。每处共十二名具名成员，其中四名由同 ID 名册升为完整档，另八名保留名册；六处共二十四 full、四十八 roster，其余从固定人口配额按需生成。四名完整档分别承担首领、祭司或长老、生产负责人及有不同主张的成员；名册补足战士、日常劳动者和幼体，幼体不进入恋爱或亲密情节。

炭阶地宫，拟 ID loc_ms_tanjie：白石镇近郊废窑下，距镇约四公里，二百四十名哥布林单族聚居。洞室按共灶窟分组，设菌床、通风井及铸补间，以菌粮和修补收入购粮；与镇戒备交易，抢粮派挑战窟主。用敲管传讯，忌封公共风井，换季熄炉送亡者，幼体由共灶轮养；玩家可接通风修复雇工、潜入失窃仓窟或谈粮约。

苔灯坞，拟 ID loc_ms_taideng：河湾北林支路约三公里，四十八名有灵智的狐族成员，普通幼兽另记生态来源。设根洞家巢、药圃与共食庭，采药和果粮换盐，与河湾猎户争捕夹边界；长老容许结缘，年轻成员要求追偿旧伤。气味绳兼作记号，忌夺亡者尾结，葬礼熄灯归土，护幼者先分食；玩家可结缘报恩、返还遗物或处理寻仇。

榆根里，拟 ID loc_ms_yugen：榆坡村外约五公里，六十四名木精与已觉醒穴鼬、林獾混居。树穴住区与地窟相连，设育苗地和修具棚；木精护林供果，穴居者排水运土，围绕谁能分配林产发生争执。节疤记号配土染图，忌伤育苗根，死者归根葬，新生共同照护；与村民中立互助，玩家可调停伐界、承接排水或帮助非木精成员争取议事权。

裂炉营，拟 ID loc_ms_lielu：砾泉村矿道支路约六公里，兽人七十二、哥布林二十四、巨魔八，共一百零四名成员。兽人掌武力与营地分配，哥布林修矿具，巨魔搬运，以矿石及劳务换粮；棚营有共炉和分种居处，主从关系正被工匠挑战。炉灰画契，忌私占共炉首火，亡者工具归所属共营，幼体不服劳役；与村里暂行纳贡换通行，玩家可受雇护运、议和或支持改贡为贸易。

回汐埠，拟 ID loc_ms_huixi：苇汀村水道约四公里，五十六名獭、龟、蛙类觉醒成员组成精怪之乡。浅洞和高台屋共用晒鱼台、避水幼居，以渔获和水路向导维生；与村里因堰闸转为敌对，内部争论迁居或破堰。水纹板标路，忌堵育幼汊，退水时送亡者归葬，年长龟族照护幼体；玩家可调水、寻找失散者、请寺观点化或阻止双方报复。

灰棚集，拟 ID loc_ms_huipeng：桑坂村外商路约五公里，哥布林四十、兽人二十、具灵智元素体四，共六十四名成员。分散棚屋围着轮值炉场与交换地，补具和道路劳务换粮，元素体靠约定燃料维持；各族互相利用，争论炉场收益与燃料优先权。货架结绳通语，忌替别人许诺，亡者遗物交指定继承者，幼体由结伴户抚养；与村里中立贸易，可调停欠薪或接受寻料委托。同为哥布林，这里认可迁户自立，与炭阶共窟继承不同。

共同执行边界：原存档、用户酒馆、dist、屏蔽表和历史审核记录锁定；PLAN/PROGRESS/CHANGELOG 归主会话。可改文件清单包含必要加载、schema 源及生成产物接点，实际跨卡写入先由主会话协调；共享正式目录及费用账串行，独立草稿可并行。

每卡验收均含 CORE：`node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs`，另执行各卡所列同领域整组。下列新专项随所属卡新增；按本批 ID 检查人物、地点及引用，不写死全目录总数。保留原卡验收和基线二十三项预期失败，本草案不要求每卡全量或 release 构建。

内容卡同卡完成起草、全量 L1、全量真实 L2、定点修正、L4 及正式发布到 world；L4 为标记项加随机五条，每次人工阅读不超过十分钟，波次十条六项均分至少四、单项至少三。起草由执行会话完成，另调真实模型仅用于所列 L2；金额含修正且复用既有账。涉及 extension/tools.mjs 或 prompt/ 的卡必须通过 prompt/tool-groups 整组，静态提示估算不超过 11900 token，现约 11710；沿用 world_lair、world_wildlife、world_settlement、world_trade 和既有 world_site 的操作，不增公共工具。

### T156（S1）已完成：非人居民复用NPC的作息与交易；智能首领与其完整档共用同一身体和库存，伤势与死亡同时影响谈话、交易和巢穴；据点按公共区、议事区、私巢分别授权；升级恢复已接通。专项6/6，首领/据点/白石镇/CORE共150/150，发布构建ok，0模型。

### T157（S2）炭阶地宫与苔灯坞正式落地。

1. 玩家结果：在白石镇和河湾附近分别进入单族地宫与狐族住区，接触居民并进行有限库存交易。
2. 可改 world/design/monster-society-1.mjs、对应 drafts、world/geo/{locations,routes,settlements}.json、people/{baseline,residents,households}.json、lore/{cultures,factions}.json、本批发布入口及必要物品库存配置；锁定无关居民和已审生物。依赖 S1、T154，本批地点与 T94 共用 ID；正式发布与 T90–T94、T110/T111、T142 串行。
3. 验收 CORE 及 `node --test tests/monster-society-content.test.mjs "tests/population*.test.mjs" "tests/npc-*.test.mjs" "tests/w1-*.test.mjs" "tests/w5-*.test.mjs" "tests/world-*.test.mjs" tests/sites.test.mjs tests/settlement-trade.test.mjs tests/retrieval.test.mjs`；`node tools/audit-npc-depth.mjs`。按两处 ID 检查路线、四名 full 深度、户巢和库存；待生成人口须与具名成员分开。
4. 真实 L2 预计八十至一百三十次，上限一点五元；含人物、建筑、社会与文化新事实。
5. 预计三至四小时加后台 L2。两处共二十四名具名成员，其中八 full；每处二至三个住区、四至六项公共设施、至少两组内部立场。生活空间和初始交易本卡可玩，动态争端接 S3/T109，委托接 T155；不把尚未接入的内容标成已生效。

### T158（S3）已完成：玩家可与聚居地首领立约（贸易、朝贡、通行，按10天一期履约），可潜入登记过的据点（私宅和议事区不可登记潜入）；守约、背约、交锋、潜入被发现都会改变成员态度，消息沿步行路线传到邻村后改变邻村态度（目前邻村反应只有“敌对后拒绝交易”一种）；议事可推动势力时钟。聚居地用location.monsterSociety、潜入用site.infiltration登记，正式数据由T157等内容卡发布。新增5项、CORE40、发布构建ok，提示约11330，0模型。

### T159（S4）榆根里与裂炉营正式落地。

1. 玩家结果：在榆坡与砾泉附近接触共生聚落和主从营地，并能改变其中一项具体争端。
2. 可改 S2 对应的 monster-society-2 设计、drafts、发布入口及这两处正式 geo/people/lore 条目和本批 tests；锁定 S2 内容及无关目录。依赖 S1/S3/T154/T109；可与 S6 零模型开发并行，共享目录和真实 L2 串行。
3. 验收 CORE 及 `node --test tests/monster-society-content.test.mjs tests/monster-society.test.mjs "tests/population*.test.mjs" "tests/npc-*.test.mjs" "tests/w5-*.test.mjs" "tests/world-*.test.mjs" tests/sites.test.mjs tests/faction-clock.test.mjs tests/settlement-trade.test.mjs tests/retrieval.test.mjs`；`node tools/audit-npc-depth.mjs`。核对混居物种配额、资源来源及两地内部方案的不同后果。
4. 真实 L2 预计八十至一百三十次，上限一点五元。
5. 预计三至四小时加后台 L2，二十四名具名成员含八 full，结构规模同 S2。榆根里发布林产分配争议，裂炉营发布贡粮与劳动争议，消耗和结局接 T109；议事、交易和已授权生产实际生效，公开风俗与派系私下目标分开检索。

### S5 并入T143：改人口子项的选题：先供核心区社会使用。

1. 玩家结果：走入未展开的巢窟会遇到稳定成员，首次交谈后人物完整档保存，重访和重启仍是同一个人。
2. 可改 T143 的按需人口生成与持久化模块、server-plugin/{npc-state,world-upgrade}.mjs、实际场景/交谈调用点、tools/population-validation.mjs 和 tests/population-on-demand.test.mjs；锁定六处已审具名人物及远方省郡正文。依赖 S1/S2，与人物、生成和升级写者串行；本子项先行，T143 远方地理模板另按原范围分项，不在本会话一起实现。
3. 验收 CORE 及 `node --test "tests/population*.test.mjs" "tests/npc-*.test.mjs" "tests/world-*.test.mjs" tests/retrieval.test.mjs tests/prompt.test.mjs tests/tool-groups.test.mjs`；增加正常到访、首次交谈、生成失败再访及升级恢复场景，按六处 seed 验证人数、物种、年龄与户巢配额。
4. 开发零模型；真实入口验证六名成人，每名起草和一次自查，预计十二次，含最多一次失败重试合计不超过十八次、零点八元。属于战役按需生成，沿 M7 已审定的代码硬约束加一次自查流程；静态核心人物仍走完整 L1/L2/L4 发布。
5. 预计三至四小时。代码先按稳定种子生成名册与住所，只扣剩余配额；第一次交谈才生成 full，失败保留已分配身份，不补钱物或重掷人生。运行中资料写战役持久层，不能反写共享 world；生成器同供远方 T143 使用，不另建怪物人口生成器。若改提示，静态估算不超过 11900 token。

### T160（S6）野兽开启灵智。

1. 玩家结果：能观察普通野兽的灵智变化，用实际灵物或具资格的点化帮助它成为可交流的个体。
2. 可改 server-plugin/wildlife.mjs、world-clock/T109 的觉醒效果调用点、npc-state、pets、world-upgrade、magic-ritual 必要接点及 extension/tools.mjs、规则 schema 和 tests/wildlife-awakening.test.mjs；锁定正式物种及术式正文。依赖 S1/S5/T109，与 T153/T154、T93/T104 和生态时间写者串行，可并行 S8 起草。
3. 验收 CORE 及 `node --test "tests/wildlife*.test.mjs" "tests/w4-*.test.mjs" "tests/boss*.test.mjs" "tests/magic*.test.mjs" "tests/population*.test.mjs" tests/pets.test.mjs tests/faction-clock.test.mjs tests/world-clock.test.mjs tests/seasonal-migration.test.mjs tests/farm-pests.test.mjs tests/prompt.test.mjs tests/tool-groups.test.mjs`；覆盖自然累积、吞食、点化、资源不足、重放及长短步一致。
4. 真实模型零次，零元；本批正式条件参数和解释由 S8 同批审核发布。
5. 预计三小时。灵智采用原创阶段“听息、立意、借形”，与九阶战力分开；本卡做到立意。来源分别记录物种年岁阈值与经历累积、灵地停留、真实灵物消耗或导师点化；观察不能刷进度。未见种群只扣一次，已实例化个体不再扣；保留原身体、伤势与遭遇来源，进入社会后退出野生捕食/自动恢复统计。觉醒后的收伏转为有边界的同意关系，旧宠物身份不自动变成居民财产。静态提示不超过 11900 token。

### T161（S7）成精后的修习与结社。

1. 玩家结果：能教导已立意的精怪、帮助其取得借形能力，并参与它们定居或加入现存精怪之乡。
2. 可改 S6 觉醒模块、server-plugin/{learning,manufacturing,npc-planning-service,npc-autonomy,magic-ritual}.mjs 的非人消费者接点、T109 faction-clock 结社效果、settlement-profile、world-upgrade、extension/tools.mjs 和 tests/wildlife-society.test.mjs；锁定 S6 身份转移规则及目录正文。依赖 S6/T109，与相关学习、生产和 engine 写者串行。
3. 验收 CORE 及 `node --test "tests/wildlife*.test.mjs" "tests/npc-*.test.mjs" "tests/population*.test.mjs" "tests/magic*.test.mjs" tests/learning.test.mjs tests/manufacturing.test.mjs tests/professions.test.mjs tests/faction-clock.test.mjs tests/world-clock.test.mjs tests/prompt.test.mjs tests/tool-groups.test.mjs`；验证真实教学和制作、变形前后同一身体、加入/退出群落及季度推进无重复人口与库存。
4. 真实模型零次，零元；新能力和结社参数由 S8 发布，新增术式正文并入 T104。
5. 预计三至四小时。立意后可依实际资格学习并制造工具，借形需修习经历及真实施术代价，不默认化人或提升战力。T109 按季度或年检查自愿成员、可居住地点和口粮来源，满足后形成新组织或并入现存聚落；不足则保留游居状态。寺观关系与猎户冲突沿事件记忆，点化、结缘、报恩和寻仇均绑定具体当事人。静态提示不超过 11900 token。

### T162（S8）回汐埠、灰棚集与成精路线正式落地。

1. 玩家结果：在苇汀和桑坂附近进入精怪之乡及跨族集市，并从普通野兽走通觉醒、修习和定居的一条实际路径。
2. 可改 monster-society-3 的设计、drafts、发布工具、两处 geo/people/lore 条目、world/meta/rules.json 的成精参数及必要配方/库存来源；锁定旧物种生态正文和前两批已审人物。依赖 S3/S5–S7、T154、T93 的导师及 T104 相关术式；规则发布与 T109/T154 串行，人物/内容账同样串行。
3. 验收 CORE 及 `node --test tests/monster-society-content.test.mjs "tests/wildlife*.test.mjs" "tests/population*.test.mjs" "tests/npc-*.test.mjs" "tests/w5-*.test.mjs" "tests/world-*.test.mjs" "tests/magic*.test.mjs" tests/faction-clock.test.mjs tests/learning.test.mjs tests/manufacturing.test.mjs tests/retrieval.test.mjs`；`node tools/audit-npc-depth.mjs`。使用本批正式地点、灵物及导师资格走通全部取得路径，并检查六处均可到达且各自可交往。
4. 真实 L2 预计一百至一百五十次，上限一点八元，覆盖两地内容和成精规则；不另跑真实聊天模型。
5. 预计四小时加后台 L2，二十四名具名成员含八 full。发布四类成精条件和三个阶段的适用边界，野兽来源优先用已有赤耳林狐、石须穴鼬、灰颈河獭及叠甲丘龟；回汐埠先有居民，玩家新增结缘者从原生态转入，不能凭一次施法生成整乡。灰棚集完整体现与炭阶不同的哥布林风俗。

与已审定卡衔接：并入 T154，改它的选题。仍为十八种、中西各九；西式明确保留哥布林、兽人、巨魔的席位，中式保留狐妖和木精，其余维持亡灵、元素体与灵兽等缺口。既有鼬、獭、龟的觉醒属于个体阶段，不拿它们重计新增物种；至少十二种低阶及六处周边可接触要求不变，文明居民不进入猎物掉落表，物种生态与居民数分别记。

并入 T105–T106，改它们的选题：各三名智能首领分别对应六处聚居地头领，沿用本批完整档身份；每批十二首领和原平衡门槛不变。人物经历由对应社会内容卡审核，首领卡审核战斗与交涉增量；同一人不再生成第二档。头领死亡后由社会争端决定继任，原有野生首领仍按原生态迁占。

并入 T155，改它的八项委托选题：保留至少四项可核实的除妖/驱邪，目标选实际危害个体；其余四项覆盖聚居地雇工、供物或内部调停，可由具完整档的怪物成员发布。增加身份与社会事件结算接点归 T155，使用 S3/T109 的真实回执，报酬由发布者库存支付；不把受雇杀同族设成唯一方案。原起草至发布流程及零点八元上限保留。

并入 T94，改它的近郊地点选题并与六处入口共用 ID；并入 T113–T115，改它们的遗迹选题，将三批各两处安排为聚居地内废区、旧神龛或采掘遗址，共六个 site 附件，仍计在原六十处之内。住区、道路和居民由本次内容卡发布，遗迹卡只补机关及可调查旧事；已完成 T112 的必要通行修正归 S1/S3，不重开一张据点实现卡。

并入 T117–T122，改它们的传闻选题：原至少四十八条相关传闻中，给每处四条，共二十四条，覆盖一个可调查误传及真实交往办法；其余仍供修行和生物题材。传播沿 T116，只引用已发布人物和地点；各原卡模型额度与审核发布要求不变。

并入 T109 的既有责任：为本批提供有资源代价的关系/争端阶段和觉醒调用，S3/S6/S7 各负责自己的效果消费者；并入 T110–T111，改相关邻近势力的选题，使人类村镇行为能推动关系变化。六个新增地方组织及阶段参数由三张社会内容卡审核，不挤占或重复审核原四十势力。

并入 T142，改它的联系选题：榆根里与远方木精联邑互通育苗和林界知识，裂炉营及灰棚集连接兽人诸部的矿货路线，苔灯坞与回汐埠通过猎道交换接触砾耳所属社会。远方仍只作九省纲要，近郊六处各自独立，不把联络地变成远方首都，也不移动砾耳四十八人与沉星七人来充人口。

### T163 二次回归修复【零模型；待Codex额度恢复】

来由：2026-10-13晚主线全量测试1524项中22项失败；T93合入后重跑相关15个文件，141项中19项失败。人口已稳定在251完整档/500名册，可以一次清掉。
结果：`npm test`全部通过。
清单与初判（逐条先跑一次确认，过期预期更新预期并写明原因，行为被弄坏的修行为，不删测试）：
- 写死旧数量：npc-depth-existing:35、npc-depth-sb:30、npc-depth-wt:23与:214（251!==152）；village-rumor-access:45（传闻52!==40）；festival:32（节俗5!==4）；w1-hewan:14（河湾口径深比较）；w1-villages-publish两项、w1-village-profiles一项（冻结名册不匹配）。
- 疑似真实问题：magic-message:146（未登记spell_message_mark）；npc-profile-publication:57（npc_bs_001_2.default作息地点不存在）；npc-publication-increments:41（聚落责任人不符：loc_bs/npc_hw_yanzhe）；retrieval:67（四村公开资料检索命中“白石镇公共燕麦田年粮产量”）；catalog:60（四村公共目录某字段undefined!==0）；w5-integration一项；npc-depth-sb:60（“另一个人物发布正在提交”，可能是并发锁或测试间互相影响）；npc-depth-lq整文件报错。
- 负载敏感：performance两项（提示组装门槛150ms，单跑101ms）；m3-consistency-browser一项（浏览器夹具）。
可改：上述测试及其夹具；server-plugin/、tools/里对应的实现。锁定：正式人物正文、extension/tools.mjs的工具集合（只许压短说明）。
验收：`node --test tests/*.test.mjs`（在主线目录跑，跑完`git checkout -- docs/测试报告/最新/`）、`node tools/build-world.mjs --release`。浏览器与子进程用例由主会话在沙箱外补跑。模型0。

### 主线全量回归修复（2026-10-13，全量测试1447项中76项失败；清单与报错在logs/sessions/full-fail-A/B/C.txt）

来由：今天合并五十多张卡，每张只验了自己的测试和CORE，卡与卡之间的影响累积。三张卡按领域分，可并行；都不删测试、不放宽断言——预期因正当变化而过期的更新预期并写明原因，行为被弄坏的修行为。模型0。

### T150 回归修复A：环境、召唤、法术批次与W3【零模型】
范围：tests/environment（11）、summons（8）、m4-batch2（8）、m4-publication（2）、w3-trades、w3-journey等，清单见full-fail-A.txt。可改：server-plugin/里对应模块与这些测试的过期夹具。验收：`node --test tests/environment.test.mjs tests/summons.test.mjs tests/m4-batch2.test.mjs tests/m4-publication.test.mjs "tests/w3-*.test.mjs" "tests/magic*.test.mjs" "tests/w2-*.test.mjs"`、CORE。

### T151 回归修复B：人物深度流水线、人口发布与世界校验【零模型】
范围：tests/npc-depth*（约16）、population-publication（3）、w1-villages-publish、w1-village-profiles、npc-profile-publication、world-validation、world-social、npc-acceptance、m1/m2前置等，清单见full-fail-B.txt。多数应是五村深度清零、白石镇入库、法术与首领发布之后的过期预期。可改：这些测试及其夹具，tools/npc-depth*.mjs、tools/publish-*.mjs、tools/validate-world.mjs的必要接点。验收：`node --test "tests/npc-depth*.test.mjs" tests/population-publication.test.mjs "tests/w1-*.test.mjs" tests/npc-profile-publication.test.mjs "tests/world-*.test.mjs" tests/npc-acceptance.test.mjs "tests/m1-*.test.mjs" tests/m2-preconditions.test.mjs tests/r06-bs-skeleton.test.mjs`、CORE。

### T152 回归修复C：其余（作息、户籍、工具分组、委托、M3、界面夹具、历史窗口）【零模型】
范围：npc-schedule（2）、civic（2）、npc-memory、tool-groups、quest-board、w5-integration、m3-consistency、m3-consistency-browser、m3-soak-adapter、history-window-integration、m6-06等，清单见full-fail-C.txt。浏览器类失败多为测试页面夹具加载不到界面模块，照tests/m6-05.test.mjs的通用代理写法修。可改：对应模块与测试夹具；extension/tools.mjs只许压短说明，提示估算不得超过11900。验收：`node --test "tests/npc-*.test.mjs" tests/civic.test.mjs tests/tool-groups.test.mjs tests/quest-board.test.mjs "tests/w5-*.test.mjs" "tests/m3-*.test.mjs" "tests/history-window*.test.mjs" "tests/m6-*.test.mjs" tests/runtime.test.mjs tests/prompt.test.mjs`、CORE；浏览器用例沙箱里跑不了，主会话补跑。

### M2修复第三批（2026-10-13主会话审定，来源：Astra草案M2-fix-planner-003，对应T99真实失败；分析全文见该草案A段）

要点：四场中断的共同出口是一致性审查的唯一改写未通过后拒绝提交、runner按stopOnFailure停止。四场原因不同：送货是二审引用被改动的JSON导致校验失败；私宅是审查自相矛盾地把正确时间判错；离屏是二审输出的JSON不合法；推搡是主持原稿和改写都多计了5分钟（真错）。账本8条里4条是这四次执行失败，另4条是粮仓买粮被提前一回合执行。N3、N4、N12是审核拿到的证据不全，N15是NPC确实编了经历，N2是逐N审核输出被截断。
审计：三张修复卡和第四轮复验都同意。卡文里的F1/F2/F3即T146/T147/T148；T147在T146合入后派，T148可与T146并行。第四轮上限12元。第四轮仍未通过则M2标卡住，转其他里程碑。

### T146 已完成：等待回合尾注按真实时钟规范化；审查响应格式失效最多修一次且保留原负评；未闭合引语显示登记姓名。相关94/95（余一项为主线旧的浏览器夹具问题，归T152），0模型。

### T147 已完成：主持场景与审查共享本人已有的关系和公开职务，作息只作有时间边界的背景；N4改用移动回执、带路履约和双方位置判定；逐N输入去掉重复正文，上限12288；评分格式失效允许修一次。0模型，真实效果由T149测量。

### T148 已完成：申请带路先答复、私宅先给许可、粮仓先到场后付款，courier移动只请求一次；对白区分当前观察、已发生经历和未来安排，不补档案外的经历；冲突现场由在场者实际发言。相关88/CORE40，0模型，真实效果由T149测量。

### T149 M2第四轮真实复验【真实模型；修复卡已齐，待模型槽】

完成结果：三卡合入后运行原十场87回合，使用F3澄清后的分步输入，保留原断言及真实失败历史。目标13项有效、至少12项通过，即12/13=92.3%；N1/N7/N8/N14仍未测，不把新增场景用于稀释失败。
预期保留N5/N6/N10/N13/N16，争取恢复N2/N3/N4/N11/N12/N15/N17。N9当前t1–2已明确没有还手或喊救，且无围观议论；恢复司法后半场仍不能自动补齐前半场，因此将N9列为最大不确定项，不能承诺13/13。
原十场在数学上足够，无须增场。若N12/N15等仍有两项失败，11/13=84.6%；即补齐余下四项且全部通过也只有15/17=88.2%，仍不到90%，必须修复失败本身。若未来扩测，缺的是N1帮修屋顶三天回访、N7次日走样传闻、N8凭线索揭穿欺骗、N14 NPC谎言入日志与揭穿，另立内容工作，不能混入本轮宣称可比。
N门槛通过不代表M2关闭：本轮仍有30条time/warning及其他事实、agency、meta问题，consistency和reviewsComplete也必须过；F1处理协议和误拒，F2/F3处理已知证据及正文来源。剩余真实负评如实保留，不能把warning统一忽略。
可改仅docs/测试报告/M2-recheck-004/及本run生成物；代码、world、旧报告和原存档锁定。沿T99正常HTTP、完整提示栈、repeat=1、parallel=4和同一模型槽，不部署；预计一次十场执行及一次结果整理。
建议新增上限12元、最多450次调用，含≤1元初探和全部审稿、受限格式修正。T99为71回合6.94093904元，按87回合线性估算约8.51元，12元覆盖较长逐N输出及少量协议修正；这是预算估算。保留全部旧费用及未知预留，刷新父账；按PLAN规则13不恢复旧100/20/30元历史硬限。
验收先运行 node docs/测试报告/M2-recheck-004/preflight.mjs --zero-model，再运行CORE；正式命令沿T99仅替换run目录、编号及增额：
node --import ./docs/测试报告/M2-recheck-004/git-entry.mjs tools/playtests.mjs --run-dir docs/测试报告/M2-recheck-004 --run-id m2-recheck-004 --card M2-recheck-004 --increment 12 --repeat 1 --parallel 4 --milestone M2 --only guide,npc_courier,npc_delivery,npc_home_visit,npc_offscreen,npc_private,npc_quest_social,npc_shove,npc_social,npc_voices --host-installation F:/dnd/SillyTavern --budget-proof docs/测试报告/M2-recheck-004/preflight.mjs
随后 node docs/测试报告/M2-recheck-004/summarize.mjs；逐项列完整回合、有效N及失败条件，账本/时间/存档断言须100%，N6/N16零泄漏、N12盲辨全对且整合通过、N17十天自主行动及回来谈话均过。本十场不含reload/rollback/duplicate真实专项，存档证据范围继续明示。第四轮仍未通过则按T99约定将M2标卡住，保留结果并转其他里程碑。

### 法术150/首领40第一批（2026-10-13主会话审定，来源：Astra草案W2W4-planner-001）

路线：法术31→61→91→121→150（S1–S4，S1只用已有处理器；S2炉作通风水土、S3光医心、S4空间役灵仪式各依赖对应引擎卡）；首领4→16→28→40（B1–B3，8个智能存在按2/3/3分布）。
审计改动：草案把缺的消费者拆成约80张单效果引擎卡，改为按机制族一族一张（热、风、水土、光、医植食、心契、空间、役灵、仪式），每张在一个会话内把该族列出的效果都接到真实状态。草案里“release通过前内容卡不派”的前置删除：内容卡只依赖T19合入，release只在里程碑结束时看。各族效果清单见 logs/sessions/W2W4-planner-001.final.txt 的A段。

### T65 已完成：热族七个效果（炉火升温耗燃料、测温、窑温裂损、保暖、控火通风、火线阻路、冰针衰减）接入真实状态；相关21/CORE40，0模型。

### T66 已完成：风族14个机制（烟气流动、除尘、风向、传话与静音、排湿、缓降托举、船帆、呼吸、偏转、风刃、风阻）接入真实状态；相关17/CORE40，0模型。

### T73 已完成：苇汀30人完整档正式整合进world/people/baseline.json，重发零写入，仍152 full/294名册；相关31/CORE40，0模型。

### T71 已完成：水土族17个机制（密封、测流缓流、水体束缚、水帘、探土耕平、勘矿、结构支撑、堤岸、裂隙、陷足、石弹）接入真实状态；相关22/CORE40，0模型。

### T72 已完成：光族机制（光源、聚光反射、辨色、显痕、光标、雾中能见度、遮光私密、视觉干扰、阴影束缚、强光衰减）接入真实状态；相关26/CORE40，0模型。

### T87 已完成：医、植、食族15个机制（止血、创面、病症感知、止痛稳定、驱寄生、肌腱、药草识别、抗霜、根系、嫁接、保鲜等）接入真实状态；相关28/CORE40，0模型。

### T88 已完成：心、契、物与空间族20个机制（感受载体、自愿精神观察、睡眠休养、记忆保护、契约痕迹与反制、腐蚀、测距、取物、封存、锁隙、警号、许可通道、锚点校准与货运、空间修补）接入真实状态，精神类须本人同意；相关38/CORE40，0模型。

### T89 已完成：役灵与仪式族19个机制接入真实状态；相关33/CORE40，0模型。九个机制族全部完成。

### T100 法术族之间的回归修复【零模型】

结果：tests/magic-*.test.mjs全部通过。现状（主线e0830b8之后）：magic-growth 11项、magic-water-earth 9项、magic-air 4项、magic-light 1项、magic-mind-space 1项失败，典型报错“Cannot read properties of undefined (reading 'state')”；在T69合入之前就已存在，是各族卡先后改engine/magic/environment接点互相影响、而每张卡只跑了自己的测试。
可改：server-plugin/magic*.mjs、environment.mjs、engine.mjs、agriculture.mjs的相关接点，tests/magic-*.test.mjs里因接口正当变化而过期的夹具。锁定：world/meta正式目录、extension/tools.mjs、prompt/。不删测试、不放宽断言；夹具过期就更新夹具，行为被破坏就修行为。
验收：`node --test tests/magic.test.mjs tests/magic-growth.test.mjs tests/magic-object.test.mjs tests/magic-forge.test.mjs tests/magic-air.test.mjs tests/magic-water-earth.test.mjs tests/magic-light.test.mjs tests/magic-care.test.mjs tests/magic-mind-space.test.mjs tests/magic-ritual.test.mjs tests/magic-movement.test.mjs tests/w2-s1.test.mjs`、CORE。模型0。

### T67 已完成：智能首领记住实际接触与交锋，按领地目标改变态度，存档恢复后保留；本卡8项通过/CORE40，0模型。bosses.test里两项主线旧失败（世界归档校验失败）不属本卡，随T43续修处理。

### T68 已完成：玩家可在巢穴向智能首领提条件，首领按目标接受或说明拒绝理由，成交交换有限物资并保存关系；相关24/CORE40，提示估算10685 token，0模型。正式首领的交易库存由T70登记。

### T69 已完成：30条新法术与6本有限库存的书经L1/真实L2/L4正式发布，目录31→61；随机10条均分4.07/最低3；48次调用费用上界0.37099264元。world/geo/locations.json与T81冲突由主会话按字段合并。

### T70 已完成：12个首领经L1/真实L2/L4正式发布，目录4→16，其中2名智能存在可记忆交涉、说明拒绝并交换有限库存；L4随机10条均分4.15/最低3；平衡：单人0%、标准五人57.06%–59.73%；29次调用0.12333664元。

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

### T40 已完成：玩家以私人身份发布D级委托并托管报酬，完整档NPC按能力、作息和路线离屏接单履约，失败或超期退款，进度只给有渠道知情的人；相关48/CORE40，提示估算10843 token，0模型。正式官职的发单额度待任命来源（R07）。

### T41 M5户籍公民与分聚落贡献【执行中，原范围不变】

目标：增加现有人物世界中的居民/公民申请及可见贡献，避免贡献自动授官。涉及：新增server-plugin/civic.mjs、tests/civic.test.mjs，activities.mjs聚落操作、extension/tools.mjs、state-notices.mjs、extension/ledger-view.mjs，world/design/m5-civic-rules.mjs；界面只接已有账本面板最小条目。实现：沿state.records与settlements记录居住起日、申请/担保/费用/犯罪审核、按聚落贡献流水；复用law案件状态、正式在场管理人和真实工程/教学/捐赠事件，sourceEvent幂等。达到阈值只开放申请，土地/官职仍须授权；旧档未知居住史不能补造。

验收：`node --test tests/civic.test.mjs tests/law.test.mjs tests/runtime.test.mjs`、CORE；条件逐项拒绝、费用只扣一次、不同村贡献不串、失败/私人工事不刷贡献、账本面板可见。模型0。不要做：新居民实体、替名册生成full、原档迁移、凭贡献自动封官。依赖现有T20/law/T02；与activities/UI同文件写者串行，可与T34的独立消费者开发并行但最终接点串行。

### T42 M5议事否决与NPC管事授权【待调度】

目标：补村民大会意见、上级任命与离屏管事，落实S3/S4。涉及：新增server-plugin/governance.mjs、tests/governance.test.mjs，civic.mjs、activities.mjs、extension/tools.mjs、npc-autonomy.mjs接点；规则仅现有四村权限/现有居民。实现：沿authorization记录增加权限范围/期限/撤销/审批主体，议案记录有资格的实际参与者与意见，未参加者不代投；按既有任命来源核验上级，不因玩家自称获得官职。管事在批准税率/地块/费用上限内办理真实申请、扣钱/公账/建房project，越权送议事，玩家不在可日结且留事件。

验收：`node --test tests/governance.test.mjs tests/civic.test.mjs tests/npc-autonomy.test.mjs tests/law.test.mjs`、CORE；大会否决不落工程、撤权后不代办、重复收费拒绝、日结和手动一致、预算不足停工。模型0。不要做：新官员人口、无视否决、未定爵位自动赋权、扩大四村任命。依赖T41/T02；与T40/T39和自治接点串行，可并行无引擎写入测试报告。

### T43 已完成：分区法典、上诉复核、公示与沿真实路线携信的区域声望，听说不作证；随后精简提示（估算10498 token，上限12000）并修复合入引起的主线回归（四村法典误继承河湾字段、天气夹具重复注册）。相关105中104过，唯一失败是已知的人物深度release门槛。

### T44 已完成：确定性世界时钟、四村节俗预约、逐人同意与自费结算已接入，新增14项通过/CORE40，0模型；24条候选节日未发布，势力计划与公共节庆支出的消费者留R08。

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

### 白石镇与LOD0第一批（2026-10-13主会话审定，来源：Astra草案W1-review-planner-001）

方案：白石镇按1000人规模，骨架登记严辙加305名新名册，其余694人为seed；随后三批各33人提升为full（码头货栈、官署市集、手工行会与寺庙学馆）。完成后白石镇100 full/206名册，LOD0常住250 full/500名册；另补10处本地野外地点使LOD0达15处。
共同做法：起草由执行会话完成，L1后全量真实L2，L4读标记条目加每批随机5条（随机10条六项均分≥4、单项≥3），共享事件闭合后正式整合，都在同一张卡里做完。每人送审到通过为止，只按整卡调用总量和金额封顶；到顶仍未过的条目保留为候选，不计入已交付。各卡锁定docs/、dist/、server-plugin/和用户存档。T90合入后T91→T92→T93串行（同写baseline与名册）；T94可与人物卡并行准备，真实模型阶段错开。
审计改动：草案把“T06也继承了6次上限”的修正并入骨架卡，删除——T06已完成，这处不影响任何后续卡。阶段审核结论：抽样六人未发现事实矛盾；已知问题是关系备注有重复句式（郑汐/王浦“还需要彼此听完再商量”，张洛/袁卿“同住……在家中见面”），留M3叙述润色。

### T90 已完成：白石镇骨架整合——6街区、18处公共与行业建筑、90处住宅、90户、306名登记居民（含严辙），另694人与210户为待生成；421次真实L2全过，L4均4.05/最低3，1.00851元。镇公库、税章与官职执行待治理卡接入。

1. 结果：玩家能沿街区找到建筑和居民，系统能区分 306 名已登记居民与 694 名待生成人口，并据此安排后续完整档。
2. 文件：可改 world/design/w1-baishi-skeleton.mjs、world/drafts/w1/baishi-skeleton/、world/people/ 三份目录及 world/geo/ 三份目录；工具限新 tools/w1-baishi.mjs、必要的 content-pipeline.mjs/content-budget.mjs 接点，测试限 tests/r06-bs-skeleton.test.mjs、tests/npc-depth-budget.test.mjs。旧人物只允许严辙的入籍及住址接点，保留既有身份；其他旧人物锁定。
3. 验收：node --test tests/r06-bs-skeleton.test.mjs tests/npc-depth-budget.test.mjs；node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs。前者覆盖真实目录计数、户籍年龄、建筑进入、聚落经济，以及名册提升后旧档状态保留。
4. 模型：起草 0 次，L2 总计不超过 450 次，整卡不超过 8 元；短名册与地点也须全部审核后整合。
5. 规模：305 条短名册、约 90 个已登记户、6 街区及约 18 处公共或行业建筑，住宅按户落地；总户数和待生成户数与 1000 人核平。官署职责、行会联络处和地方问题写入聚落完整档；复用表驱动骨架，单会话完成，不起草 99 人完整档。

### T91 已完成：白石镇码头与货栈33人提升为完整档并正式整合，11件共同往事闭合，同ID从名册移出；全体185个完整档深度零缺口；80次真实L2全过，L4均4.12/最低3，1.10915416元。

### T92 已完成：白石镇官署与市集33人提升为完整档并正式整合，11件共同往事闭合；全体218个完整档深度零缺口；33次真实L2全过，L4均4.10/最低3，0.44856896元。

### T93 已完成：白石镇手工行会、寺院、道观、学馆、武馆33人提升为完整档并正式整合，道、佛、法、武四条路线的师授、认证与购书学习可用；拜入师门（initiate）、仪式资格（ritual_officiate）、施法许可（grant_magic_permit）三个操作已接入并各有测试。151次真实L2，L4均4.2/最低3，2.42794536元。正式完整档251个、名册500个，LOD0人口数量达标。收尾部分在Codex用量上限时中断，由主会话合并主线、解决两处小冲突并验证（相关182/182、CORE、发布构建通过）后合入；“四条路线各走通一次、违戒后果、到期收回许可”的用例覆盖是否齐全，待Codex恢复后由执行会话复核。

### T94 LOD0 野外地点补足

1. 结果：玩家能沿真实路线抵达至少 15 处本地野外地点，了解各处可见地貌、进入条件和已有资源。
2. 文件：依赖T90；可改 world/design/w1-baishi-wild.mjs、world/drafts/w1/baishi-wild/、world/geo/locations.json、world/geo/routes.json、新 tools/w1-baishi-wild.mjs、tests/r06-bs-wild.test.mjs；人物目录、共用工具与 meta/ 锁定。
3. 验收：node --test tests/r06-bs-wild.test.mjs；node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs。专项覆盖新增 10 处审核与正式整合、LOD0 15 处归属、路线连通及距离耗时、进入条件和资源引用。
4. 模型：起草 0 次，L2 总计不超过 50 次，整卡不超过 4 元；地点起草、L1/L2/L4 和正式整合同卡完成。
5. 规模：10 地点及接入路线，优先覆盖镇村之间的旧路、采集地和废弃工事；使用已有资源与生物，不附带扩充怪物目录，单会话。

### 下一批（2026-10-13主会话审定，来源：Astra草案Next-planner-001；括号里是草案内的字母编号，卡文中“接B1”“依赖C1”等引用沿用字母编号）

审计：全部同意，各卡均对应指南尚未完成的要求。旧的T31–T33卡文由T136–T141替换，不再要求T28的CLI前置。真实模型金额上限按各卡所写执行（M3浸泡整次30元、200回合长记忆12元等），由主会话按用户授权放行并如实记账。引擎卡的验收已按“同领域测试整组跑”来写。

共同约定：每卡验收均含 CORE，即 node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs。内容卡同卡完成起草、L1全量、真实L2全量、L4及正式发布，按本批ID验证取得路径和world_upgrade，保留既有变化；L4含被标记项与随机5条，波次随机10条六项均分≥4、单项≥3，每次人工阅读≤10分钟。调用次数以下给预计范围，金额为含修正的整卡上限；起草默认由执行会话完成，DeepSeek起草0次，真实调用只用单一模型槽。

共同边界：锁定原存档、部署目录、旧报告、dist及其他卡正在修改的文件。内容卡锁定引擎与prompt；引擎卡锁定无关正式内容。本批工具、加载器、schema和必要接点允许随卡修改，由主会话协调同文件串行。PLAN/PROGRESS/CHANGELOG由主会话维护。本批独立草稿可并行，正式发布若同写目录或共享内容账则串行；只读验收不据目录总数写死断言。

所有改extension/tools.mjs或prompt/的卡，静态提示估算须≤11900 token，验收追加node --test tests/prompt.test.mjs；目前11642，硬上限12000。若所需接口无法装入11900，先派下述P0，再派该功能卡。

### T101（P0）已完成：静态提示加工具定义压到约10700 token（硬上限12000），工具名、操作、参数全部保留；各测试里写死的估算上限统一改读12000。静态世界纲要只留起始地点名，地点描述改由只读目录查询取得。相关104/CORE40，0模型。

### T102（A1） W2-S2 炉作、通风、水土。结果：新增30条可取得、可学会、能实际影响工序或环境的法术。可改world/design/w2-s2.mjs、world/drafts/w2-s2/、仿w2-s1的内容/发布入口、tests/w2-s2.test.mjs；正式范围world/meta/{spells,skills,items}.json、书籍销售者的people/baseline.json和geo/locations.json接点。与A2/A3及T90–T94同文件发布串行，可并行A4准备。验收node --test "tests/w2-*.test.mjs" "tests/magic*.test.mjs" tests/learning.test.mjs，CORE。真实L2预计40–65次，≤1元；约2小时，复用已实现消费者。

### T103（A2） W2-S3 光、医、心。结果：新增30条有适用对象、反制和合法性边界的可学法术。文件同A1，批次名换w2-s3，新增tests/w2-s3.test.mjs；锁定及串行关系同A1，接A1发布。验收node --test "tests/w2-*.test.mjs" "tests/magic*.test.mjs" tests/learning.test.mjs，CORE。真实L2预计40–65次，≤1元；约2小时。

### T104（A3） W2-S4 空间、役灵、仪式。结果：新增29条，正式可学法术达到150条，锚点、契约和持续成本均有实际来源。文件同A1，批次名换w2-s4，新增tests/w2-s4.test.mjs；接A2发布，与地理/人物目录写者串行。验收node --test "tests/w2-*.test.mjs" "tests/magic*.test.mjs" tests/learning.test.mjs，CORE；按新增29个ID核对来源与效果。真实L2预计40–65次，≤1元；约2小时。

### T105（A4） W4-B2 首领第二批。结果：新增12个可交锋首领，其中3名智能存在可记忆、交涉和拒绝。可改world/design/w4-b2.mjs、world/drafts/w4-b2/、仿w4-b1的内容/发布入口、world/meta/bosses.json、tests/w4-b2.test.mjs及本批平衡报告；不改法术/人物目录，可与A1–A3零模型准备并行，发布账串行。验收node --test "tests/boss*.test.mjs" "tests/w4-*.test.mjs" tests/combat.test.mjs；node tools/m4-balance.mjs --catalog world/meta/bosses.json --out world/design/w4-b2-balance.json；CORE。L2预计25–40次，≤0.6元；约1.5小时。

### T106（A5） W4-B3 首领第三批。结果：再增12个、含3名智能存在，使首领达到40个、智能存在达到8名。文件与A4对应换w4-b3，另可更新world/drafts/w4/ecology.json；接A4，同一bosses.json串行。验收node --test "tests/boss*.test.mjs" "tests/w4-*.test.mjs" tests/combat.test.mjs；node tools/m4-balance.mjs --catalog world/meta/bosses.json --out world/design/w4-b3-balance.json；node tools/w4-audit-ecology.mjs；CORE。保留单人≤15%、标准五人55%–65%的多种子平衡及20种子三年生态要求。L2预计25–40次，≤0.6元；约2小时，模拟后台运行。

### T107（B1）已完成：正式节日改变作息与生产窗口，举办须有场地、参与者同意和实际物资并真实扣耗；新增10项通过/CORE40，0模型。24条候选的发布归T108。

### T108（B2） 24节日审核发布。结果：24个节日有正式举办地点和运行参数，玩家能参加有成本的活动。可改world/design/w5-festivals.mjs、原节日草稿、tools/w5-festivals.mjs及发布入口、world/lore/festivals.json和必要geo地点映射、tests/w5-festival-publication.test.mjs；接B1，地理发布与T94/遗迹卡串行。复用有效审核，仅修缺项；regional_unmapped须落实举办地再启用，不将远方人员瞬移来现场。验收node --test "tests/w5-*.test.mjs" tests/festival.test.mjs tests/festival-runtime.test.mjs tests/world-clock.test.mjs，CORE。L2预计24–50次，≤1.5元；约2小时。

### T109（B3）已完成：势力按日或周推进计划，阶段真实消耗资源，玩家干预改变后续；关系与争端有结算回执；觉醒调用接口已留（未实现的效果明确报错，个体变化归T160）。新增10项通过、相关95/96（余一项为主线旧的节俗数量断言）、CORE40、发布构建ok，0模型。正式参数待T110/T111。

### T110（B4） 势力时钟前20个。结果：前20个势力的资产与各阶段条件、代价和干预办法正式可执行。可改world/design/w5-clock-1.mjs、对应草稿/内容发布入口、world/lore/factions.json、本批tests/w5-clock-1.test.mjs；按现有ID排序分批，不重写合格背景，引用文化/神祇/历史的缺项在本批修正。接B3，与B5同文件串行。验收node --test "tests/w5-*.test.mjs" tests/world-clock.test.mjs tests/faction-clock.test.mjs，CORE。L2预计25–45次，≤1.5元；约2小时。

### T111（B5） 势力时钟后20个。结果：剩余20个势力也有资源约束和可干预的阶段，不以文字计划冒充生效。文件同B4，批次换w5-clock-2，接B4发布；与其他factions.json写者串行。验收node --test "tests/w5-*.test.mjs" tests/world-clock.test.mjs tests/faction-clock.test.mjs，CORE。L2预计25–45次，≤1.5元；约2小时。

### T112（B6）已完成：据点进入、机关处理、有限库存（重访不刷新），凭实际发现解锁隐藏历史；提示估算11710 token；相关与CORE通过，0模型。

### T113（B7） 遗迹据点第一组20处。结果：白石镇所属城市范围至少15处具备完整历史、物权、机关、资源与时间变化。可改world/design/w5-sites-1.mjs、对应草稿/工具、world/geo/{locations,routes}.json、tests/w5-sites-1.test.mjs；接B6和T94，优先补全其已建地点，同一ID只计一次。与B8/B9及其他地理发布串行。验收node --test "tests/w5-*.test.mjs" tests/sites.test.mjs tests/world-validation.test.mjs，CORE。L2预计25–45次，≤2元；约2小时。

### T114（B8） 遗迹据点第二组20处。结果：另20处据点可沿实际道路进入，历史与占据关系形成可调查联系。文件同B7，批次换w5-sites-2；接B7，与地理发布串行。验收node --test "tests/w5-*.test.mjs" tests/sites.test.mjs tests/world-validation.test.mjs，CORE。L2预计25–45次，≤2元；约2小时。

### T115（B9） 遗迹据点第三组20处。结果：再完成20处，使不同ID的合格遗迹据点至少60处。文件同B7，批次换w5-sites-3；接B8，与地理发布串行。验收node --test "tests/w5-*.test.mjs" tests/sites.test.mjs tests/world-validation.test.mjs，CORE；逐本批ID检查，不写目录总数等于60。L2预计25–45次，≤2元；约2小时。

### T116（B10）已完成：传闻随真实携带者和登记渠道沿路线抵达，逐手版本可追溯源头，按实际获知问询；相关与CORE通过，0模型。

### T117（B11） 传闻第一组45条。结果：新增45条可由实际渠道获知的真、半真或假传闻。可改world/design/w5-rumors-1.mjs、对应草稿/内容发布工具、world/lore/rumors.json、tests/w5-rumors-1.test.mjs；接B10，关联已发布事件、携带者及路线，与B12–B16同目录串行。验收node --test "tests/w5-rumors-*.test.mjs" tests/rumor-route.test.mjs tests/village-rumor-access.test.mjs，CORE。L2预计50–75次，≤1.5元；约1.5小时。

### T118（B12） 传闻第二组45条。结果：新增45条，覆盖第二组已发布势力/地方事件。文件同B11，批次换w5-rumors-2；接B11，同目录串行。验收node --test "tests/w5-rumors-*.test.mjs" tests/rumor-route.test.mjs tests/village-rumor-access.test.mjs，CORE。L2预计50–75次，≤1.5元；约1.5小时。

### T119（B13） 传闻第三组45条。结果：新增45条，覆盖可调查遗迹和沿路见闻。文件同B11，批次换w5-rumors-3；接B12及B7，同目录串行。验收node --test "tests/w5-rumors-*.test.mjs" tests/rumor-route.test.mjs tests/village-rumor-access.test.mjs，CORE。L2预计50–75次，≤1.5元；约1.5小时。

### T120（B14） 传闻第四组45条。结果：新增45条，给节日与势力阶段提供不同立场的消息。文件同B11，批次换w5-rumors-4；接B13及B2/B5，同目录串行。验收node --test "tests/w5-rumors-*.test.mjs" tests/rumor-route.test.mjs tests/village-rumor-access.test.mjs，CORE。L2预计50–75次，≤1.5元；约1.5小时。

### T121（B15） 传闻第五组40条。结果：新增40条，把第二组据点接进调查和消息网络。文件同B11，批次换w5-rumors-5；接B14及B8，同目录串行。验收node --test "tests/w5-rumors-*.test.mjs" tests/rumor-route.test.mjs tests/village-rumor-access.test.mjs，CORE。L2预计45–70次，≤1.5元；约1.5小时。

### T122（B16） 传闻第六组40条。结果：新增40条，与已有40条去重后至少300条，沿路线确实可获知。文件同B11，批次换w5-rumors-6；接B15及B9，同目录串行，不重做旧40条。验收node --test "tests/w5-rumors-*.test.mjs" tests/rumor-route.test.mjs tests/village-rumor-access.test.mjs，CORE。L2预计45–70次，≤1.5元；约1.5小时。

C部分只拆缺口：governance.mjs的任职入口止于“待上级决定”，quest-board.mjs不承认玩家官职来源，公款建房也无审批主体；爵位执行与个人看法聚合尚无消费者。NPC现有关系/战斗死亡继续复用，新增范围是离屏成长与人生事件。

### T123（C1） 治理权责、地块与封爵来源。结果：玩家能向正式登记机构申请任职、工程或封地，审批依据有可查来源。可改world/design/m5-authority.mjs、对应草稿/发布入口、world/geo/settlements.json及本批地块、world/lore/factions.json、world/meta/rules.json、tests/m5-authority-content.test.mjs；依赖T92的官署人物，不另造同职官员。约15–25条来源，包含上级职责、官职/月额度、可建地块/费率、公库来源及九级爵位权利义务。验收node --test "tests/governance*.test.mjs" tests/m5-authority-content.test.mjs tests/quest-board.test.mjs tests/world-validation.test.mjs，CORE。L2预计25–50次，≤2.5元；约2.5小时，正式发布与B4/B5及地理卡串行。

### T124（C2） 任命与官职任务额度。结果：上级依据贡献和意见实际任免玩家，生效身份按月提供任务额度并支持公款托管。可改server-plugin/{governance,civic,quest-board}.mjs、activities/extension/tools.mjs接点、tests/governance-office.test.mjs；接C1，拒绝自报官职，按1B=10C=100D折算，免职停止新增用额但不抹既有合同。验收node --test "tests/governance*.test.mjs" tests/civic.test.mjs tests/quest-board.test.mjs tests/activities.test.mjs tests/law.test.mjs tests/reputation-law.test.mjs tests/prompt.test.mjs，CORE。模型0；约2小时，与C3–C5串行，提示≤11900。

### T125（C3） 公共工程预算与完工。结果：批准后的工程从真实公库付材料和工钱，完工产生可用建筑或设施。可改server-plugin/{governance,civic,activities,engine}.mjs、新public-projects.mjs、extension/tools.mjs、tests/governance-projects.test.mjs；接C2，覆盖中止退款、资金不足、受益人和实际贡献。验收node --test "tests/governance*.test.mjs" tests/civic.test.mjs tests/quest-board.test.mjs tests/activities.test.mjs tests/village-ledgers.test.mjs tests/prompt.test.mjs，CORE。模型0；约2.5小时，与C4/C5及时间推进写者串行，提示≤11900。

### T126（C4） 管事离屏批建房与收费。结果：玩家划定规则后，NPC管事能按地块/资格/费率处理建房申请，日结收费并形成产权。可改server-plugin/{governance,public-projects}.mjs、engine及领地面板投影小接点、tests/governance-housing.test.mjs；接C3，税费进公账，越权申请退回，审批与实际施工分开。验收node --test "tests/governance*.test.mjs" tests/civic.test.mjs tests/quest-board.test.mjs tests/activities.test.mjs tests/village-ledgers.test.mjs，CORE。模型0；约2小时，与C3/C5串行，可并行独立内容准备。

### T127（C5） 爵位、领地收入与义务。结果：实际受封后获得对应辖区收入和权限，同时承担贡赋、兵役等义务，失去封地后结算随之变化。可改新server-plugin/titles.mjs、governance/quest-board/law/engine及领地投影接点、extension/tools.mjs、tests/governance-titles.test.mjs；接C1–C4，复用其来源，不凭贡献自动封爵。验收node --test "tests/governance*.test.mjs" tests/civic.test.mjs tests/quest-board.test.mjs tests/law.test.mjs tests/reputation-law.test.mjs tests/village-ledgers.test.mjs tests/prompt.test.mjs，CORE。模型0；约3小时，与治理和工具写者串行，提示≤11900。

### T128（C6）已完成：看法每次从现有关系、聚居地态度和声望推出，不另存好感分；只有记忆仍清晰的知情者计入当地支持/反对比例，未获知者单列；议事查看与闭合读取在场者的实际看法，场景与NPC上下文带上本地舆论。目前交锋、偷窃、法律案件和聚居地消息能形成看法，交易与节俗尚不产生舆论。新增4项、CORE40、发布构建ok，0模型。

### T129（C7）已完成：玩家教学（world_learn加student）和NPC日常工作带来有上限、有时间成本的技能增长；人物计划层可发起换营生，作息与服务随之改变，登记机构的导师不自行改行；先登记4个营生模板（磨坊木作、青灯帮厨、学馆助教、武馆陪练）。npc-growth 8/8、CORE40、发布构建ok，提示约11300，0模型。遗留：换营生后场景显示的公开职务仍读原目录。

### T130（C8） 成年家庭关系与出生。结果：长期关系可在双方条件满足时发展为婚姻，出生进入真实家户与人口状态，并通过当地渠道被知晓。可改新server-plugin/npc-life.mjs、npc-relations/npc-state/engine接点、world/meta/rules.json、docs/决策.md参数段、tests/npc-life-family.test.mjs；锁定旧人物静态经历，禁止未成年恋爱。验收node --test "tests/npc-*.test.mjs" ，CORE。模型0；约2.5小时，接C7，与C9/C10同文件串行。

### T131（C9） 生病、衰老与自然死亡。结果：NPC按年龄、健康和种子概率发生人生变化，服务及义务按真实失能状态处理。可改npc-life.mjs、npc-state/npc-obligations/engine接点、world/meta/rules.json、docs/决策.md参数段、tests/npc-life-health.test.mjs；接C8，复用已有死亡结算，不重置旧伤病。验收node --test "tests/npc-*.test.mjs" tests/activities.test.mjs，CORE；跨年长短步、照护和死亡后履约均覆盖。模型0；约2小时，与C10串行。

### T132（C10） 迁入迁出与人生消息。结果：NPC有原因地迁居，实际走路线，住户、工作与未履约事项在抵达后更新，玩家回来能听到变化。可改npc-life.mjs、npc-schedule/npc-cognition/civic接点、tests/npc-life-migration.test.mjs；接C9和B10，搬家不复制财产或新增同名人物。验收node --test "tests/npc-*.test.mjs" tests/civic.test.mjs ，CORE。模型0；约2小时，与认知/日程写者串行。

### T133（D1）已完成：NPC从本人库存添燃料维持热源并完成需火工序，缺料拒绝、离岗或失能停止，热账与窑炉裂损保留；新增11项通过/CORE40，0模型。

### T134（D2）已完成：研究出的技能可学习、练习并用于检定；自创配方走原制造链，实际扣料并产出署名成品。相关58/58、CORE40，提示估算约11000，0模型。

### T135（D3） W3长生活流程。结果：真实对话串起取得/学艺、制作失败及副产物、维修耐久、保存腐败、成本售卖和自创配方，离开再回来状态连续。可改tests/playtests/w3_long.json、tests/w3-long.test.mjs及docs/测试报告/w3-long/，引擎与合格目录锁定；接D1/D2。验收node tools/w3-wave-score.mjs --check；node --test "tests/w3-*.test.mjs" tests/manufacturing.test.mjs tests/learning.test.mjs tests/professions.test.mjs "tests/magic*.test.mjs"；npm run test:playtests -- --only w3_long --repeat 1 --parallel 1 --run-dir docs/测试报告/w3-long --run-id w3-long --card D3 --increment 5；CORE。519条已有审核和随机评分复用有效结果；账本/时耗/售空升级100%，叙述≥90%。真实约30自然轮、120–180次调用，≤5元；准备1小时加后台运行。

### T136（T31a）已完成：17轮记忆场景与M2–M9的HTTP准备及评分，四种查询在裁历史前后命中同一事实；0模型。

### T137（T31b）已完成：18轮文风与时间场景及V1–V7分项评分接入真实报告；0模型。提示估算约11100（硬上限12000）。问题文档里的叙述问题须T138真实复验后才关闭。

### T138（T32a） M3短程真实复验。结果：M2–M9和V1–V7取得当前完整提示栈的真实结论。可改docs/测试报告/m3-mv/及运行产物，代码和旧报告锁定；依赖T31a/b及T99结论，若相关缺陷仍存在先由原责任卡修。验收npm run test:playtests -- --only m3_memory,m3_language,reconcile,world_upgrade,out_of_character --repeat 1 --parallel 1 --run-dir docs/测试报告/m3-mv --run-id m3-mv --card T32a --increment 8；CORE。每场8–20自然轮，账本/时间/存档及M6–M9为100%，V≥95%，陈词≤0.5次/千字。真实预计180–350次调用，≤8元；约1小时整理加后台运行，独占模型槽。

### T139（T32b） M1第200回合追问第10回合。结果：200个连续真实回合后能正确找回第10回合约定，覆盖短场和150回合浸泡无法替代的长历史项。可改tests/playtests/m3_long_memory.json、新tests/m3-long-memory.test.mjs及docs/测试报告/m3-long-memory/，锁定引擎与其他报告；接T32a。验收node --test tests/m3-long-memory.test.mjs "tests/history-window*.test.mjs" tests/m3-retrieval.test.mjs；npm run test:playtests -- --only m3_long_memory --repeat 1 --parallel 1 --run-dir docs/测试报告/m3-long-memory --run-id m3-long-memory --card T32b --increment 12；CORE。禁止用合成200轮替代真实历史。预计450–800次调用，≤12元；准备≤1小时，200轮后台持续运行。

### T140（T33a） 两人格浸泡前半段。结果：行商和建设者各完成75个连续真实回合，保留同一run供后半段继续。仅改docs/测试报告/m3-soak-wave/运行产物，源码锁定；接T32a，独占模型槽。验收node tools/m3-soak.mjs --directory docs/测试报告/m3-soak-wave --run --turns 150 --budget 30 --max-tasks 156；node tools/m3-soak.mjs --directory docs/测试报告/m3-soak-wave --report；CORE。直接--run建立30元配置，不先用默认50元的--init；前25/50轮无足龄样本如实记未覆盖，第75轮须有5道50–200轮前的实事题。真实预计600–900次调用，与T33b共享整次30元；后台运行，本卡不宣称浸泡通过。

### T141（T33b） 两人格浸泡后半段。结果：沿同一run完成各150回合并达到结构召回≥95%、细节≥80%、矛盾≤1/100轮、语义时间偏差≤10%。文件同T33a；依赖T33a，与所有真实模型卡串行。验收node tools/m3-soak.mjs --directory docs/测试报告/m3-soak-wave --run --turns 150 --budget 30；node tools/m3-soak.mjs --directory docs/测试报告/m3-soak-wave --report；CORE。每25轮继续五题，符合年龄窗口后样本不足即不通过；报告所有角色费用、p50/p95和缓存目标≥70%。真实预计新增600–900次调用，仍共享30元；后台运行加≤1小时结果整理。

M5真实场景接续路线：C/D机制完成后分“户籍与议事”“任职与工程”“爵位与发单”“成长与离乡”“节庆与自由生活”组织S1–S7/F1–F8，复用已有theft等场景，每组独立run且≤30元；完整M5验收保留全部S/F门槛。本批不重复拆已覆盖机制，真实场景卡待上述接口稳定后按组派。

M7分批路线：LOD2分4批，每批5省/25郡，合计20省/100郡；LOD1按行政与地区关系分30聚落，20聚落各20full、10聚落各10full，合计500full且不计LOD0。后续分别派LOD3稳定种子入库、跨区旅行贸易、跨区消息及真实会话，生成实体重访/重启必须沿原状态；本轮只派下面两张首批卡。

### T142（F1） LOD2第一批5省25郡。结果：第一片远方有明确行政上级、治所、地形产业与对外关系，地图和检索能识别。可改world/design/lod2-1.mjs、对应草稿/内容发布入口、world/geo行政纲要及routes必要连接、加载/schema接点、tests/lod2-1.test.mjs；锁定LOD0人物，地理发布与B地点卡串行。验收node --test tests/lod2-1.test.mjs "tests/world-*.test.mjs" tests/retrieval.test.mjs，CORE；验证5比1层级，未生成住民不计full。L2预计35–60次，≤2元；约2小时。

### T143（F2） LOD1首聚落20full。结果：白石镇上级城市首批关键住民可实际接触，具备完整经历、家户与可用建筑及地方经济。可改world/design/lod1-1.mjs、对应草稿/发布入口、world/people/和world/geo/本聚落条目、tests/lod1-1.test.mjs；依赖T90–T94与F1，正式发布与人物/地理卡串行。验收node --test "tests/npc-*.test.mjs" tests/lod1-1.test.mjs tests/world-validation.test.mjs；node tools/audit-npc-depth.mjs；CORE。L2预计70–110次，≤6元；约3小时，20full连同有限配套内容一批完成，后续聚落按同规模派。

M8分批路线：R16按3–9章随功能卡补现有PLAN的入口/测试/缺口，不另建证明文档；已确认缺口先做F3，其他缺口须沿消费者确认后再派。R17先F4性能，再按11.3领域分组跑真实场景；T3发布验收每场3次，M8全量每场5次，保留指南较高门槛。五人格各300回合按同一浸泡run分段续跑、整次≤30元，并扩展现有M3运行器的人格与300轮判定；最后做隔离副本重启/导入导出及界面验收，原档迁移与部署仍留主会话处理。

### T144（F3） 研究成果登记为可施放法术。结果：多日研究完成后，玩家可提交由现有原语组成的法术，经规则裁定后学会并实际施放。可改server-plugin/activities.mjs、magic/learning及实体解析接点、tools/create-schemas.mjs、extension/tools.mjs、新tests/runtime-spell-research.test.mjs；锁定正式法术目录，接D2，复用现有九族而不增加自由代码效果。验收node --test tests/runtime-spell-research.test.mjs tests/runtime-invention.test.mjs tests/activities.test.mjs tests/learning.test.mjs "tests/magic*.test.mjs" tests/prompt.test.mjs，CORE。模型0；约2.5小时，与创造/法术接点串行，静态≤11900。

### T145（F4）部分完成：存储达标（一万事件下提交1.21ms、对账36ms、每千回合增长2.17MB）；提示组装单独运行最慢101ms达标（门槛150ms），但与其他测试同跑、机器有负载时首次189ms超时，两种修法后按规则停止。基准脚本与热点修正已合入。性能测试对机器负载敏感，里程碑收尾时在空闲机器上单独复核。

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

### M6界面批（2026-10-13主会话审定，来源：Astra草案M6-planner-001；现状一览见该草案A段）

共同边界：锁定extension/tools.mjs、extension/prompt.mjs、prompt/、原存档、SillyTavern/、dist/；界面卡不加模型工具。数据读已有/read、/scene、/feedback、/catalog，缺展示字段时加只读投影；state-read的NPC脱敏不等于玩家知情过滤，不得展示全量NPC。截图写docs/测试报告/最新/M6-编号/（桌面与390×844、深浅两主题）。路径缩写E=extension/，S=server-plugin/，T=tests/。模型0。
审计改动：草案要求十张卡全部串行（因共改runtime.test.mjs、runtime.js和路由），改为T75先做并提供面板挂载点与路由注册点，其后各卡只在自己的新模块里注册面板和路由、测试写在自己的tests/m6-NN.test.mjs，不改tests/runtime.test.mjs；这样T76–T80可并行，T77与T79同改ledger-view须串行。T81地图先覆盖已发布地点，白石镇发布后补映射。T84语音若本机没有可用的中文多声线服务，记待用户确认并完成其余部分。

### T75 已完成：双主题、中文顶栏、字号/高对比/减少动画、手机全屏抽屉、本地字体与16品质色；后续卡在E/ui-*.mjs导出registerUI、在S/ui-*.mjs导出registerUIRoutes注册面板和路由。浏览器8/8、CORE40，六张截图在docs/测试报告/最新/M6-01/。遗留：390宽顶栏右侧地点和魔力被截断，交T76顺带处理。

### T76 已完成：头像名牌、未知说话人登记、钱袋与事件卡、告示/来信卡可收藏到邮件、说/做切换与快捷按钮（只填输入框）、390宽顶栏换行；界面测试全过、CORE40，六张截图在docs/测试报告/最新/M6-02/。

### T77 已完成：角色、技能、法术书、格子行囊四面板与/ui/personal只读投影；界面测试夹具改为通用代理extension/下全部模块，后续卡新增模块不用再改夹具。界面测试14/14、CORE40，16张截图在docs/测试报告/最新/M6-03/。

### T78 已完成：人物、编年史、传闻三面板与/ui/history，按玩家知情过滤，可搜索自己的历史并保存人物笔记与传闻判断；界面测试全过、CORE40，截图在docs/测试报告/最新/M6-04/。

### T79 已完成：任务、约定、领地三面板与/ui/affairs只读投影，按期限排序、收发筛选、公账展示；界面测试25/25、CORE40，截图在docs/测试报告/最新/M6-05/。缺口归R07：玩家发单额度与村级领地签发入口尚未实现，面板对缺记录显示“未登记”。

### T80 已完成：开始页可继续或创建角色（姓名、性别、外貌背景、六项属性），保存与导入含笔记和设置的备份，进入后显示开场或前情提要；界面测试14/14、CORE40，截图在docs/测试报告/最新/M6-06/。

### T81 已完成：四级已知地图、亲历/可靠转述/传闻三类迷雾、缩放平移、持久标记、路线比较，选中后只填输入框；标签保持14px并互相避让。界面测试16/16、CORE40，截图在docs/测试报告/最新/M6-07/。白石镇发布后补地点映射。

### T82 已完成：原创游戏纹章、80张SVG场景背景（10类场景×2时段×4天气）随场景淡入切换、200个地点的背景映射、446人职业纹章头像与逐人提示，新增“场景画册”面板；界面测试8/8、CORE40，截图在docs/测试报告/最新/M6-08/。白石镇发布后需重跑tools/build-m6-art.mjs补人物映射。

### T83 已完成：运行时WebAudio合成的原创环境音与五类情境音乐，随场景交叉淡入淡出，首次点击后才发声，顶栏与设置共用音量和静音，切换聊天停止旧声源；界面测试15/15、CORE40，截图在docs/测试报告/最新/M6-09/。声音未经人耳试听。

### T84 【搁置：用户2026-10-13决定先忽略语音，不派】按说话人中文语音：玩家能听到旁白与不同人物的中文声线，并能跳过、重播或关闭。
可改新 E/speaker-tts.mjs、E/runtime.js、E/ui-settings.mjs；必要的新 S/tts.mjs 与 S/index.mjs 接点，world/audio/voices.json、tools/deploy-engine.mjs，T/runtime.test.mjs、新 T/m6-10.test.mjs。复用02的说话人分段和 npc.tts_voice，缺值按性别年龄映射；先枚举已装系统声线和可用本地服务，支持返回音频的服务按文本＋声音＋参数哈希缓存；系统speechSynthesis不能提供音频字节，不能算缓存完成。
验收：node --test tests/runtime.test.mjs tests/m6-10.test.mjs；node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs。截图含手机播放控件；隔离页实际播放旁白及两名NPC中文，验证缓存复用、跳过重播关闭；生成模型0，实际TTS合成需执行，付费调用0；预计3小时，1会话，完整完成以可用多声线及音频缓存为条件。

### R11 M6 主题、消息、顶栏和全部面板【待细化】

范围：第 12.1–12.4、12.9–12.12；本地授权字体、双主题和 16 品质色、`<q who>` 说话人、系统事件卡、未知说话人登记、隐藏回执/尾注、信件告示、中文日期/天气/地点/钱袋/生命魔力。角色/技能/法术书/行囊/人物/任务约定/领地/编年史/传闻全部面板，玩家知情视图，T20 只是一块。自然语言快捷按钮、说/做切换和可关闭少量快捷键；继续/创建/存档/设置和前情提要，错误正常语言、debug 才见 JSON。390×844 可用、字号/高对比/减少动画、Playwright 截图基线无控制台错误。隔离运行不部署；依赖 T20/R07 各状态接口。

### R12 M6 地图和世界素材【待细化】

范围：world/geo SVG 四级缩放，亲历/可靠转述/传闻不同迷雾，路线/季节封闭/玩家标记，耗时花费风险出行预览只填输入框待玩家发送。统一美术说明、游戏纹章、约 80 张类型×时段×天气背景、LOD0 人物头像及 world 中可复用提示、`assets/LICENSES.md`。按指南允许职业纹章替代头像，但不能把所有背景/素材永久省略；新付费服务需用户决定则登记，先完成不依赖服务的接口和有许可素材。地图视口和鼠标/触摸可操作，截图基线。依赖 R06/R11，图像技能适用时由后续执行者读取，规划不调用模型。

### R13 M6 中文声音与按说话人语音【待细化】

范围：环境循环与情境音乐淡入淡出，仅 CC0/允许使用音频和许可清单；一次进入点击启用声音。按 `<q who>` 拆分台词、旁白独立声线、npc.tts_voice 与性别/年龄默认回退，中文多声线、文本哈希缓存、跳过/重播/关闭。先核实已安装可用服务与系统语音，新增付费/登录配置列待确认并继续独立实现；不能读酒馆密钥。自动测试加实际中文播放证据和手机操作。依赖 R11，完整 M6 验收与 R4 部署分开记录。

### M7范围调整（2026-10-13用户决定，覆盖下文R14、R15及T142、T143的旧范围）

远方世界改为分层：9个省（原20省100郡取消），各省郡数有多有少；并非全由人类掌控，要有非人类族群或势力实际统治、占据的地区。省与郡只做纲要（地形、产业、谁统治、邻里关系、三五个有名字的人物）。聚落骨架由代码按种子和模板在玩家前往时生成，同一种子结果不变；人物完整档在玩家第一次交谈时由模型起草、代码检查硬约束加一次自查后入库，之后不再变。原“LOD1提前写500个完整档”取消。T142、T143按此重写前不派；主线回归修稳后交Astra重拆。

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
