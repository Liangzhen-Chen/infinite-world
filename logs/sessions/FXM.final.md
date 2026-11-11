# FXM 交接（2026-10-30）

工作树 `F:/dnd-wt/FXM`，分支 `t-fxm`，起点 `9b105b45`。只交工作区差异，由主会话提交；未部署、未改原存档。开工已有未跟踪 `.base`，保留不动。

## 交付与范围

- `server-plugin/npc-state.mjs` 提取 K06 原有家户/出勤劳力派生为 `agriculturalWorkforce`；`agriculture.mjs` 日结直接调用，保持原日结公式与运算顺序。
- `server-plugin/labor-market.mjs` 缺工预测复用同一田间分钟，不再按旧人口比例及整数工位估计；不足整班的缺口向上取整为招聘人数。
- `tests/s5-law-production-inputs.test.mjs` 增加预测→实际日结的精确分钟对照及只读保证，另验本地已出勤农雇工只计一次。
- 四个交互回归文件按 K08 已生效的规律更新严格锚点，没有为结果增加库存或修改世界数据。原有用例种子不变，另加固定种子 `w4-player-flow` 覆盖玩家先服务，保留原有自动成交、柜台、回执、报表的正向保证。
- 必要接点为 `npc-state.mjs` 和 `agriculture.mjs`，其目的为复用既有 K04/K06 责任层，未新增模块、配置、校验器。

## A：逐项裁定与手算

均属于新规律的正确结果；本卡不修改 K08 的定价、客流、补货或运输实现。

| 原失败点 | 旧锚点→新锚点 | 公式、输入、依据 |
|---|---|---|
| s5-w4-economy F026 | 玩家客流1→0；A的钱37→38；E的钱3→0；玩家柜台103→100、口粮1→3、收入3→0 | `business.mjs:786` 正午720结算、按种子排列商店，原种子 `w4-flow` 下原生客店先服务。A为一人户，60饱食÷30=2面包，2×目录2×稀缺下限0.5=2铜。E按 K02 缓冲缺口及实际3铜预算购买，2面包2铜+1燕饼 trunc(3×0.5)=1铜；旧25%钱袋截断不再用于客流。新锚点严格验证原生店三笔成交、零税、玩家无重复收入/扣货、报表与账本。 |
| s5-04 subjective-options | 已知市价12→4；无观察的目录先验仍6 | `market.mjs:328–352`：旧断言把已知4铜再乘主观稀缺3；K08已知完整市价直接采用4，未知仍目录2×稀缺3=6。隐蔽钱袋/库存不改变主观候选的断言保留。 |
| s5-04 real attendance | 首日475→470、迟到日360→355分钟 | `npc-state.mjs:264–270`：每日480−路网单程5×往返2=470，工资 ceil(30×470/480)=30。迟到日已由真实在途扣去程120，再扣返程5：120+240−5=355。累计825分钟，ceil(30×825/480)=52铜；工程剩余10−825/480=8.28125工日。患病日仍无工资、无进度。 |
| quest-sources NPC短缺 | 托管后钱袋400→406 | `business.mjs:707–781` 正午成交：4面包4+2面包2+2燕饼3+2燕饼3+4口粮6=18铜。`shop.mjs:452–508` 午夜补货6面包×1+4燕饼×1.5=12铜；450+18−12−托管50=406。托管仍50、总钱守恒仍严格核对。 |
| quest-sources 出不起 | 30→36，不发布仍不变 | 同上18−12=6铜营业净流入；(30+6)÷2=18，低于D级报酬下限20，不发布也不扣任务款。 |
| quest-sources 灾害公账 | 300→312 | 铁镰1×基价10×稀缺2=20不变。新增上述食品补货12入公库：510+20+12−疫病150−修堤80=312。疫病后若再拨饥荒200则192<留底300，所以饥荒不发布仍成立。 |
| quest-sources 到期退款 | 公库680→842，钱袋450→407、柜台0→26 | 铁镰日1/8各20=40不变；真实客流使客店逐日补货，货款合计162，640+40+162=842。全部销售145铜，首日柜台未建时18铜入钱袋、其后127入柜台；累计柜台注资61，61+127−162=26。钱袋450+18−61=407；等价于450+145−162−柜台26，最终无新公开托管。任务仍逐笔全额退回；额外核对包括柜台在内的总钱守恒。 |
| entity-world 迁店补货 | 日期触发远途补货→现货0、付款0、运单0；公库只入铁镰20 | `shop.mjs:397–450`：迁到白石后面包来源仍派生为route；本场景实际到场报价数=0、可领取运单数=0，新增库存=0、货款/运费/关税=0。旧做法仅凭路通及日期导入货物，K08已删除。保留迁店派生、铁镰20、报价1→499、历史快照不变等断言。 |

退款场景客店补货严格表（`tests/quest-sources.test.mjs` 同表断言；每单总额取整一次）：

| 日 | 面包：量/款 | 燕饼：量/款 | 当日入公库 |
|---|---|---|---|
| 1 | 6/6 | 4/6 | 12 |
| 2 | 6/8 | 4/6 | 14 |
| 3 | 6/10 | 4/8 | 18 |
| 4 | 6/12 | 4/10 | 22 |
| 5 | 6/15 | 4/12 | 27 |
| 6 | 6/17 | 4/14 | 31 |
| 7 | 4/10 | 0/0 | 10 |
| 10 | 6/17 | 2/7 | 24 |
| 11 | 2/4 | 0/0 | 4 |
| 合计 |  |  | 162 |

这些款额并非抄实测放宽：`market.mjs:137–175` 派生商品类实物供给S、保留/承诺/货架需求D；`shop.mjs:460–464` 的本地进货base面包2/燕饼3，品质、深度、加成、关系及修正均1。`market.mjs:222–283`，稀缺限制[0.5,3]、零售阈值max(5,0.1S)；每单最后trunc一次。

- 日1..6面包S=45，D依次18/28/36/44/54/60，q=6，大于零售阈值5。日1全区间39..45的D/x低于0.5，trunc(2×6×0.5)=6；其余为trunc(2D×ln(45/39))，依次8/10/12/15/17。
- 同日燕饼在面包入库后S=51，D同前，q=4≤5：trunc(3×4×max(0.5,D/51))，依次6/6/8/10/12/14。
- 日7面包S=51、D=64、q=4：trunc(2×4×64/51)=10。
- 日10面包S=47、D=64、q=6：trunc(2×64×ln(47/41))=17；随后燕饼S=53、q=2：trunc(3×2×64/53)=7。
- 日11面包S=53、D=66、q=2：trunc(2×2×66/53)=4。
- 日1/8铁镰分别S=0/1、D=2、q=1、base=10，稀缺上限2：1×10×2=20。

## B：预测与实际日结对照

`tests/s5-law-production-inputs.test.mjs` 使用既有河湾村与阿燕，固定种子 `production-inputs`：人口1、workerFraction=1、farmWorkers=1、processing/fresh=0、农具容量2、完好100%、每工日耕20单位。既有合同已出勤120分钟，单程通勤30分钟；照护预约480..540=60分钟，真实market_trip 540..600=60分钟。

- 旧预测（原 `labor-market.mjs:129–133`）：normal=floor(1×1)=1；无征发；current=min(floor(1×1),2,1)=1工日=480分钟；required=1，招聘0。
- 新预测：480−照护60−赶集60−往返通勤60−已出勤120=180分钟=0.375工日；缺1−0.375=0.625工日，招聘ceil(0.625)=1人。预测不写状态、不提前出勤或消耗种粮。
- K06实际日结调用同一函数：field=375000/1000000，floor(20×0.375×100%)=7单位，与预测180分钟一致。
- 对照：同村农雇工实际出勤480分钟，先从原人口可用量扣480，再作为本田雇工加480；田间仍480分钟、20单位、招聘0，无双算。

## 验收与交接状态

测试全部逐文件单独 `node --test --test-isolation=none`，TEMP/TMP均为 `F:/dnd-tmp`，一次最多一个测试进程；用TAP摘要过滤 `# pass/# fail/not ok`，原因是本机PowerShell对默认报告符号的编码会漏掉摘要。单个失败只读取最后30行。

| 文件/命令 | 最终结果 |
|---|---|
| s5-w4-economy | pass 13 / fail 0（含新增玩家先服务正向用例） |
| s5-04 | pass 18 / fail 0 |
| quest-sources | pass 8 / fail 0 |
| entity-world | pass 6 / fail 0 |
| labor-market | pass 16 / fail 0 |
| s5-law-household-labor | pass 16 / fail 0 |
| s5-law-production-inputs | pass 10 / fail 0 |
| s5-law-periodic-market | pass 22 / fail 0 |
| s5-08 | pass 21 / fail 0 |
| finance-assets | pass 12 / fail 0 |
| w8b-credit-tender | pass 9 / fail 0 |
| CORE engine / storage / plugin | 各 pass 22/14/7，fail 均0 |
| node tools/export-actions.mjs | 完成，248动作；docs/actions.json 33处定位行号变化，未修改动作行为/schema |
| actions-catalog / action-registry / arch-metrics | 各 pass 4/7/4，fail 均0 |
| advance-registry | pass 4 / fail 1：仅 full 旧金快照不一致，quiet及重放保证通过；详见下文 |
| npc-schedule | pass 12 / fail 0 |
| seasonal-hazards | pass 9 / fail 0 |
| w8e8-premises | pass 16 / fail 0 |
| w8c-carry | pass 12 / fail 0 |
| farm-pests | pass 6 / fail 1：第7项在93行CLI子进程status为null，前面的成长、巡守、保存/重启/导入/回滚断言已执行；沙箱外补跑该文件 |
| overfit-guard | pass 2 / fail 2：同义词和allowlist两项都在newSynonymHits的git show子进程status为null；其余静态扫描和正负控制通过，沙箱外补跑该文件 |
| s5-03-w1（额外检查） | 包含多段逐日60日利息推进；本轮排入短测范围过宽，运行约22分钟尚无完整摘要，停止后不计通过，交主会话按长推进检查 |
| s5-playthrough（额外整局试玩） | 原补充队列尚未启动；改列主会话跨季整局验证，不计通过 |

金快照及numeric-digest已完成基线对照：S5A@9b105b45与FXM的full/quiet每一步state/messages相同；进一步按advance-registry原算法在两个独立进程比较state+patches+messages完整trace，每一步亦相同。numeric-digest全部字段相同。full旧金快照在基线已有失配，本卡没有金场景字段变化。字段表与原金快照/基线完整trace值见 [FXM-golden-table.md](FXM-golden-table.md)。没有设置UPDATE_ADVANCE_GOLDEN，没有重生成金快照。

子进程限制已用同一沙箱的最小spawnSync复现确认：node --version和git show master:world/actions/core.json均返回status=null、error.code=EPERM。没有修改、跳过或放宽上述三个受限用例。主会话沙箱外逐文件补跑farm-pests、overfit-guard即可；本卡无浏览器测试实际运行结果，不将未跑的整局试玩记作浏览器通过。

`agriculture.test.mjs` 的跨季/三年/多种子长测按卡片留主会话外跑；farm-pests-clock（两年长/逐日）、farm-pests-hunt（两条一年）、farm-pests-harvest（跨季成熟/腐烂）也是长推进文件，本卡短测队列不包含它们。独立不变量四文件按共同规则由主会话提交/合并时逐文件运行。

禁止路径自查：实际改动仅上述三个server-plugin模块、五个测试文件与必跑导出的docs/actions.json；未触及docs/架构设计/、world/design/、dist/、docs/待办.md、docs/问题.md。未改任何world数据。没有调用git写操作；自建临时调试文件及中间快照/摘要JSON已删除，开工前的.base保留。

进程记录：额外银行检查的node PID 41784、其本会话测试队列PowerShell PID 21192已通过psutil核对完整命令行及父子关系，并在工具输出记录。运行1346秒后，按PID先结束队列21192、再结束node41784，命令成功；没有按名称或批量结束node。原队列会话55081已回收（exit -1）。后续队列43928、失败诊断/迁店验证队列49276均已正常完成，无本会话测试进程遗留。新增缺工测试改用与K04一致的“会面/照料家人”预约前提后，整文件10 pass/0 fail；迁店新增来源产地loc_hw严格断言后，整文件6 pass/0 fail。

收尾diff自查通过（既有CR行尾按cr-at-eol检查）。最终共9个待提交文件，外加开工前已存在的未跟踪.base；没有新增调试文件。实现已完成，剩余为基线full快照处理、上述沙箱外子进程检查及列出的长推进验证。主会话按原授权代提交并更新PROGRESS/CHANGELOG，本执行树未做这些主会话文档写入。
