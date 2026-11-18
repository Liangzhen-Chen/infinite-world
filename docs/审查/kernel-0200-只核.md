核对标识：chk-1116-y18（会话标识见主会话台账）；所核提交：d7b5892c、4ffff21c

# kernel 李白 01:25 / 01:30 / 02:00 落地只核（今日最后一轮）

对照：审查/李白裁定-1116-0125-kernel五项.md、审查/李白裁定-1116-0200-kernel四项补裁.md、PLAN.md 01:30 条（:3261）、上轮 审查/kernel-0125-只核.md（chk-1116-y17）。不看执行记录。本机只跑了仓库已有脚本：transcribe-migrows.mjs、gen-card-ledger.mjs（含 GEN_CHILD=1 子进程模式）、check-卷十一.mjs、check-vol2.mjs、check-vol2-ext.mjs、脚本/卷三/check-卷三*.mjs 五个。

## 一 y17 T1–T7 是否改清

- **T1 登记卷**：defTok 改为只认 `rules.` 键表行、"词表族 `X`"标题、"本卷拥有…词表族"登记表首格，登记表行写明"归卷X"（别卷）的不算。重跑后与判据一不同的 9 行：M3b-13b→卷四（卷四 :313 `rules.body.carry`）、M20-12/M20-15→卷二十（卷二十 §2.3 词表族 calendar）、M20-32/M20-34→卷二十（§2.5 weather）、M5-26→卷五（卷五 §2.2 登记表 terrain）、M13-26/M13-33→卷十三、M14-82c→卷十四。逐条对卷文核过，都对。y17 指出的 7 行误判（calendar→卷七、season→卷三乙、sense→卷四）都已消失。整类，无按行特判。**改清**。（提交说明写"13→5 行"，现读数 9 行，是 4ffff21c 之后的读数，不影响结论。）
- **T2 退役名与别名**：标题含"退役"的 §3 小节整节不收；`名(...).字段` 形式的别名不收。全卡账 readBook、workmanshipTier 出现 0 次；LEDGER-1 的 entries 不再有 placeId、scope。**改清**。
- **T3 列表式入口**：列表项 "`名(参数)`" 已收（卷五 canEnter/take/setAspect、卷十九 facilityView、卷十八 intimateEligible 已进 entries）。**列表式改清**；但同类的表格漏收仍在，见真问题 R1。
- **T4 归卷**：entryOfRow 直接取 §3 所在卷，不借别卷同名上线键。C-卷五-place-1 的 canEnter 现为 卷五§3.2。**改清**。
- **T5 entries 与 launches 同一拒收**：卡账生成后对全部卡的 entries、launches 用同一 in3() 过滤；notLaunched 改用 §3 入口集合。**口径统一，改清**；但 §3 集合本身漏收（R1），所以 launches 被摘掉了一批真入口（如 卷二十一 careOptions、courseSummary，卷十四 certStanding），notLaunched 152 也没计入这些入口。
- **T6 定义节只取本卷**：secOfRule 排除前面紧跟别卷卷名的 §n，规则编号只取本卷。**按 y17 的写法改了**；但"定义节取本行文字"这个取法仍会造出假唯一，见真问题 R2。
- **T7 转录**：migRow 改为 `^M\d+[a-z]*-\d+(?:[a-z]\d*)?$`，像编号但不合格式的行报问题，不静默丢。重跑：迁移行 1157 行（别名 65，非别名 1092），M2-10a1–a3、M5-10b1–b2 已进；M2-10a3 在 LEDGER-1a。问题 6 条全是"处置不是五值之一"的待定/待补行，不是丢行。**改清**。

## 二 entries 重抽（种子 20261115，同 y17 取法）

总体：entries 非空的卡 43 张，按卡账次序编号。起点 20261115 mod 43 = 31，步长 31，第 k 个取 (31+31k) mod 43 + 1，k = 0..29。抽中编号 2、3、5、7、8、9、10、12、14、15、17、19、20、21、22、24、26、27、28、29、31、32、33、34、36、38、39、40、41、43。

核两件：①名字与归卷——该名是否登记在所写卷的 §3 读/判/写入口表（不是退役、不是别名、卷对）；②行到入口——按 01:30"一节多入口列待查、不推定"，该卷该节是否只有这一个入口。①逐个对卷文首格核完；②只核出了 卷九 一处，其余未逐行核。

| # | 卡 | entries | ① 名字/归卷 | ② 行→入口 |
|---|---|---|---|---|
| 2 | LEDGER-1a | 卷三乙 recipeView；卷二十五 butcherOutcome、forageOptions；卷二十四 verbView；卷五 take；卷六 chainOf、demand、priceFor、propertyView、shopView；卷十七 gateQuote；卷十六 threatBrief | 符 | 未逐行核 |
| 3 | LEDGER-1b | 卷二十五 forageOptions；卷五 take；卷六 priceFor | 符 | 未逐行核 |
| 5 | LEDGER-1d | 卷六 priceFor；卷十三 noteRout | 符 | 未逐行核 |
| 7 | LEDGER-1g | 卷六 priceFor | 符 | 未逐行核 |
| 8 | C-卷二十三-sys.arts-1 | 卷二十三 knownForms | 符 | 未逐行核 |
| 9 | C-卷二十九-sys.display_l10n-1 | 卷二十九 labelText、selectRows | 符 | 未逐行核 |
| 10 | C-卷二十二-knowledge-1 | 卷二十二 claimHolds、readOutcome | 符 | 未逐行核 |
| 12 | C-卷十八-sys.social-1 | 卷十八 intimateEligible | 符 | 未逐行核 |
| 14 | C-卷十四-skill-1 | 卷十四 skillView | 符 | 未逐行核 |
| 15 | C-卷二十三-sys.arts-4 | 卷二十三 actOutcome、knownForms | 符 | 未逐行核 |
| 17 | C-卷十八-sys.social-2 | 卷十八 intimateEligible | 符 | 未逐行核 |
| 19 | C-卷三乙-item-1 | 卷六 priceFor | 符 | 未逐行核 |
| 20 | C-卷九-sys.ai_interface-1 | 卷九 freeSlotsOf；卷二十九 selectRows | 符 | **不符**：freeSlotsOf 假唯一（R2） |
| 21 | C-卷二十一-status-1 | 卷九 freeSlotsOf | 符 | **不符**：同上 |
| 22 | C-卷十三-sys.combat-1 | 卷十五 interactionsFor | 符 | 未逐行核 |
| 24 | C-卷九-sys.ai_interface-4 | 卷九 consent | 符 | 未逐行核 |
| 26 | C-卷三乙-recipe-1 | 卷三乙 recipeView | 符 | 未逐行核 |
| 27 | C-卷二-sys.capacity-1 | 卷八b disposalRight | 符 | 未逐行核 |
| 28 | C-卷二十五-plant-1 | 卷二十五 butcherOutcome、cropForage、forageOptions | 符 | 未逐行核 |
| 29 | C-卷八b-offense-1 | 卷九 consent；卷八b disposalRight；卷十九 accessClassAt；卷十八 intimateEligible | 符 | 未逐行核 |
| 31 | C-卷十九-facility_type-1 | 卷九 freeSlotsOf | 符 | **不符**：来自 M4-30b"读动作行维度（卷九 §4.1）"，应为 actionView 等，§4.1 有五个入口（R2） |
| 32 | C-卷十九-facility_type-2 | 卷十九 kilnReach | 符 | 未逐行核 |
| 33 | C-卷五-place-1 | 卷五 canEnter、setAspect、setBorderTerm；卷十九 facilityView | 符 | 未逐行核 |
| 34 | C-卷五-place-4 | 卷五 setBorderTerm | 符 | 未逐行核 |
| 36 | C-卷七-faith-1 | 卷七 conversionOdds | 符 | 未逐行核 |
| 38 | C-卷十-sys.worldgen-1 | 卷七 culturePref；卷十 instanceIdOf | 符 | 未逐行核 |
| 39 | C-卷十四-profession-1 | 卷七 vowsOf；卷十三 combatReadings；卷十四 professionView、skillsOf | 符 | 未逐行核 |
| 40 | C-卷二十二-knowledge-3 | 卷二十二 claimHolds、publicShare、readOutcome；卷十 instanceIdOf | 符 | 未逐行核 |
| 41 | C-卷二十七-sys.offscreen_save-1 | 卷二十七 legalKeyIdOf；卷十 instanceIdOf | 符 | 未逐行核 |
| 43 | C-卷二十九-sys.display_l10n-2 | 卷二十九 labelText、selectRows；卷二十二 researchOptions、returnDigest；卷二十四 chronicleAll | 符 | 未逐行核 |

**结论**：按 y17 的口径（①名字与归卷）不符 **0/30**，y17 的 4 张（readBook、workmanshipTier、卷九:canEnter）都已改对。按 01:30 原文再核②，至少 **3/30 不符**（#20、#21、#31，都是 卷九 freeSlotsOf），所以"不符必须为 0"没有达到。

## 三 02:00 Q1–Q4

- **Q1**：已删掉迭代。主进程只起一次子进程（GEN_CHILD=1）；子进程里 `r.recvObj = r.obj`，每行取自己的对象，按 R11-7.2 排出次序后打印；主进程用这个次序定各位置组，不回代。卷十一 R11-2.5 勘误原文合裁定。**次序取法符合裁定**。但子进程卡族有环，生成器没有查出来，见真问题 R3。
- **Q2**：卷三乙 §7 M3b-21（原 `sys.item`）、M3b-27（原 `item`）的落点对象改为 `recipe`，写了勘误第 44 行与快照，没改规则正文。生成器 cyc2 按"一向来源 1、一向来源 2"整类判，代码里没有行号或卷名字面量（check-卷十一 第 14 项通过）。重跑主卡账：item-1 阶段 2，recipe-1 阶段 3 依赖 item-1，无环，摘要报"两表成环：无"。**主卡族符合裁定**；但 cyc2 只查主卡族，同类行 M3b-8（§4.16 V-8）、M3b-15（§4.16 V-2）在子进程卡族里仍落在 item，见 R3。
- **Q3**：卷二 §6.11 M2-13 落点补"所消除的扫描：S13 (c)（§2.9 第 1 条内建闭集，§4.3 E-GLOBAL-UNLISTED）"，写了勘误与快照。卷二 :3227 核对表"全局对象白名单 | §2.9 第 1 条 | §4.3 E-GLOBAL-UNLISTED、S13 (c)、脚本第 18、21 项"，**卷二确有 S13 (c) 与 §2.9 第 1 条对应的登记**。卡账里 SWEEP-1-1 至 1-6 的 accept 为 `卷二:S13`，SWEEP-1-7（末段）为 `卷二:S13` 加 S11-1 至 S11-12。找不到扫描代号的行退回来源卷的分支已写（mechInfo.returned）。矩阵未改。形式上合裁定；内容问题见补裁 B2。
- **Q4**：段 1 记 consumer_group（只经 ① 切出的 11 个文件那一组），段 2–7 记 path_order（经 ③ 切的那一组）。卷十一 R11-7.8 写了"同 R11-7.5 ①③ 原文"和"记最后用到的那一级"。段卡 .mjs 数都不超过 25（段 2 是 25 个 .mjs 加 1 个非 .mjs 文件）。**符合裁定**。

## 四 读数

- 重跑 transcribe-migrows.mjs、gen-card-ledger.mjs，卡账 json 和摘要逐字不变（git status 为空）。
- 卡 120；n = 8；阶段 0–8 依次为 3/55/24/12/6/6/2/7/5；主卡族无环；孤儿行 3（M2-11c、M2-12a、M2-16，都是 01:25 B3 的待补）。**都对得上，可复现**。控制台的 unassigned 是 4，比孤儿行多 1，摘要没有说明（措辞小项）。
- **固定卡冲突 7 处**：LEDGER-1a 依赖 recipe-1（阶段 3）、plant-1（阶段 3）、event_type-1（阶段 8）、sys.travel-1（阶段 3）；LEDGER-1b 依赖 plant-1；LEDGER-1c 依赖 recipe-1、sys.worldgen-1（阶段 7）。
  - **原因**：这几张账本子卡里的外卷行都是并组时改判给 sys.economy 的：M3b-3、M3b-5 到 M3b-8、M3b-15，M25-1、M25-20、M25-28 到 M25-32、M25-42，M24-6、M24-11、M24-12，M17-2/3/4/13，M10-9/10/13/15 等。它们全在"并组后接收对象不是本行自己对象"的 277 行待查名单里。sys.economy 的首卡（母卡，固定阶段 1）在 R11-7.2 次序里排第 9，所以 R11-2.5 第一步几乎总取它。这些行的卷节带出了 recipeView、forageOptions/butcherOutcome、verbView、gateQuote、genView 这些入口，而上线这些入口的卡在后面的阶段。
  - **判断**：实现照规则走，不是实现错。卷十一 :643 定"账本母卡与子卡在阶段 1"；:645 写明这种冲突"报李白（固定卡的阶段出自卷一，本卷不改）"。所以这是规则冲突，**要李白裁**（B1）。zeroRow 转录后，R11-2.5 第一步可能改判一部分行，冲突数会变，但不保证消掉。另外，其中 M3b-8、M3b-15 接 recipeView 那一支属于 Q2 同一类，R3 修完后会改变。
- **待补第 13 项"读数暂缺"**：第一句（zeroRow 没转录，并组改判的行列待查）合 02:00 口径。第二句把"各卷 §3 入口表与迁移行落点的节号对不上的行（entries 待查三类）"整体记成读数暂缺，**不对**：其中"§3 找不到入口 442 行"有一部分是生成器漏收 §3 入口造成的（R1），"一节多入口"也被 R2 的假唯一压低了。这两部分是逻辑问题，不该放进读数暂缺。只有"落点没有节号"一类算输入问题。

## 五 检查脚本、冻结目录、快照

- check-卷十一：失败项 0（第 14 项"重跑生成器与附录甲逐行比对；生成器代码无卷名字面量"通过）。check-vol2：PASS。check-vol2-ext：PASS。
- check-卷三、check-卷三-整类、check-卷三-成分：全部通过。check-卷三-全集：未通过断言 0。check-卷三-读取者：失败 0（WARN 2 个格，与本批无关）。整类、成分两个脚本报"卷末已贴输出与本次一致：否"，本批没有去查这是不是早就存在的。
- 冻结目录：d7b5892c^..4ffff21c 对 tools/、server-plugin/、extension/、world/ 的 diff 为空。
- 快照：
  - 勘误前快照与父提交的卷文逐字相同：卷十一（1116k5b、1116k5c）、卷二（1116k5b、1116k5c）、卷三乙-v7（1116k5c）。
  - 现行卷文与 卷十一-封卷.md、卷十一-v2.md、卷二-v17补26-现行.md、卷三乙-v7.md 逐字相同。
  - 三卷都写了勘误记录和必要理由。d7b5892c 没有改卷二，却留了一份卷二勘误前快照（多余，无害）。

## 问题

### 真问题（规则原文或生成器逻辑，挡封）

- **R1 §3 入口表只认首列，漏收真入口（T2/T3 同类，未改完）。** 生成器只收"首列表头含'入口'"的表。但有一批 §3 表的"入口"栏不在第一列，栏里是真入口：
  - 卷二十一 §3.1（读什么｜入口｜返回）：treatmentPreview、careOptions、prevalenceOf、courseSummary；
  - 卷二十六 §3.1：preferenceOf、decisionJitter、needSatisfiers；
  - 卷二十二 §3.3 写者：noteKnowing、setGuard、grantLore 等；
  - 卷九 §3.2：resolve、preview、confirm、withdraw；
  - 卷十 §3.2：generateWorld；
  - 卷十七 §3.3：placeSubject、tripStep、settleTrips、setGateTerms、gateStep；
  - 卷二十九 §3.1 的第二张表。
  - 另外，首格用" / "分隔的两个入口只收第一个，例如卷十四 `certsOf(...) / certStanding(...)` 漏了 certStanding。

  后果：这些入口被当成"不在 §3"，从 launches 摘掉（摘要里的 55 个里就有 卷二十一 careOptions、courseSummary，卷十四 certStanding）；notLaunched 不计它们；落到这些节的行被记成"找不到"；来源 2 的依赖因此少算，n 与阶段可能偏小。y17 当时把卷二十一、卷二十六那两张表整体当成别名表，判"排除是对的"，这个判断有误：表里 personView(...).x 那几行是别名，其余几行是真入口。整类修法：按表头找"入口"栏（不限第一列），在该栏取入口名；按分隔符切开，" / "也算。
- **R2 定义节只取 §3 行内文字，造成假唯一（T6 余项）。** §3 行里没写节号的入口（如卷九 actionView）定义节为空，任何节都对不上它。于是同一节里只要有一个入口的行碰巧写了节号，就被当成"恰一个入口"。实例：卷九 §4.1.2"统一入口"列了 actionView、affordances、activityOf、agendaOf、freeSlotsOf 五个读入口，但只有 freeSlotsOf 的 §3 行写了"R9-1.10"。结果卷九 §4.1 的所有行都取了 freeSlotsOf。抽样里 #20、#21、#31 三张不符；M4-30b"读动作行维度（卷九 §4.1）"本该是 actionView。按 01:30"一节多入口列待查、不推定"，这些行应进待查。整类修法：定义节定不出的入口不能让同节匹配成唯一，同卷有这种入口时，该节按"多入口"或"找不到"列待查；或者以 §4.x"统一入口"小节为定义节来源。
- **R3 Q1 的子进程卡族有环，生成器没查也没报。** 02:00 Q1 原文是"这个卡族若有环，按 Q2 处理，不另设破环规则"。子进程不查也不报 cycle：它在 :782 打印次序后直接退出，环由 DFS 隐式断开。
  - 实测：GEN_CHILD=1 输出的次序里，table:recipe 排 65，table:item 排 83。
  - 推断有环：recipe 首卡按来源 1 依赖 item 首卡，并上线 recipeView，所以无环时它的阶段一定严格晚于 item，次序也一定在 item 之后。实测相反，只有 item 与 recipe 同在一个环里、被 DFS 断开时才会这样。
  - 来源：M3b-8（§4.16 V-8）、M3b-15（§4.16 V-2）在不并组时仍归 item，它们的 §4.16 对上了 recipeView。这和 Q2 的 M3b-21、M3b-27 是同一类，只是在主卡族里被并组改判给了 sys.economy，cyc2 只查主卡族，所以没报出来。
  - 修法：子进程卡族也要跑同一个成环判法。同类行按 Q2 退回卷三乙勘误；不是这种搭配的，停下报李白。子进程卡族有环时，主进程不能拿这个次序用。

### 读数暂缺（输入未转录，不挡封）

- zeroRow 未转录：并组改判 277 行待查；R11-2.5 第一步只能按"没有这样的行"走。这一项写进待补第 13 项是对的。
- 落点没有节号或规则编号的 210 行（entries 无节号一类）。
- 待补第 13 项的第二句要按第四节改：entries 的"找不到""一节多入口"要等 R1、R2 修完后重算，不能整类记成读数暂缺。

### 需李白补裁

- **B1 固定卡阶段冲突 7 处**：都是账本子卡（卷十一 :643 固定在阶段 1）经 R11-2.4 并组、R11-2.5 改判，收进了别对象的行，这些行要接阶段 3–8 的卡上线的入口。卷十一 :645 规定这种情况报李白。要请李白定：已有冲突时，固定阶段的账本子卡是否不参加跨对象位置组的改判；或者这类行改去别处；或者等 zeroRow 补上后再裁。
- **B2 M2-13 段卡的 accept 内容**：卡账写的是整条 `卷二:S13`，"(c)"被丢了，E-GLOBAL-UNLISTED 也没写进去。
  - S13 本体是语言判断扫描（规则层基线 219 行等）。S13 (c) 是它的豁免名单子款（注释、report.mjs 里的 console、throw 文案、tests 夹具），不检测 structuredClone。
  - 真正把 structuredClone 判为违例的是 §2.9 第 1 条的三道判定，码 E-GLOBAL-UNLISTED，对应卷二"脚本第 18、21 项"。
  - 照现在这样，段卡按整条 S13 验收：它既证明不了替换做完了，又会因为本段文件里与替换无关的语言判断行而过不了。
  - 请李白定：accept 能不能写错误码 E-GLOBAL-UNLISTED 或"卷二脚本第 18/21 项"；如果只能写 S 编号，是否允许子款粒度（S13 (c)）。

### 措辞小项（不挡封）

- 摘要第四节还写着"v0 只能用本对象自己的入口……n 是下界"，与 01:30 的跨卷 entries 不符（y17 已提，没改）。
- 控制台 unassigned 4 与孤儿行 3 差 1，摘要没有说明。
- d7b5892c 提交说明的"13→5 行"与现在的 9 行不一致（是后一提交改的读数，摘要已是 9）。

不可封卷
