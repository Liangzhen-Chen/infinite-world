# a3t2-triage：contract2 离线分诊与修复

真实报告仍为 **89/131**，没有调用真实模型，没有声称修后真实通过率。原报告有42条顶层断言失败、41个失败回合、39个一致性失败回合，其中17个状态为 unverified；这些口径不同，不相加。以下回合从1计数（原报告 index 从0计数）。

## 分类汇总

| 主类 | 失败回合数 | 代表例 |
|---|---:|---|
| A | 1 | craft第11回合：hp效果未投影资源对象 |
| B | 14 | npc_quest_social第2回合：私人D单缺可纠正参数提示；literacy第7回合：中文名/ID断言误差 |
| C | 19 | craft第18回合：today误传dayOffset:1；审查JSON/引用错误 |
| D | 7 | craft第7/14回合：技能/配方学习前提未建立；npc_quest_social第7/8回合任务不存在 |

每个失败回合按最主要责任层只计一次；混合原因及连锁失败逐行标注，不能将分类计数当作可直接恢复的分数。全部42条失败断言原文另存 classification.json，未删除、跳过或降低标准。

## 最小改动及边界

- extension/turn-contract.mjs：只改动态补跑请求；原意匹配候选优先，空候选可通过既有 open:proposal 提交；no_action仅纯闲聊/纯观察，不可能效果也应取得引擎拒绝。仍只补跑一次，未执行前不产生事实，未审原稿不进入历史。
- server-plugin/quest-board.mjs：只补额度诊断和私人D单 personal:true 的纠正写法；额度、等级、同意、目标、托管与承接规则不变。
- server-plugin/repair.mjs：只补缺少技能的名称/ID、工序与所需熟练度及学习路径；协助不代替本人技能。保留工序编号纠正、无技能/无工序拒绝及拒绝不扣钱物时间。
- server-plugin/consistency-evidence.mjs：原子 effect.object 补实际 resource/need；server-plugin/consistency-review.mjs 的聚合来源同样补 need。hp变化现在可以按真实 hp 对象核验；不改 sourceSupportsClaim、validateClaims 或门禁规则。
- server-plugin/consistency-review.mjs：动态审查请求明确资源编号与呈现细节、历史时长、新决定的填法。不是重放时改判旧响应；仍拒绝错误主体/对象/数量、无来源新决定、假引文、格式修正翻转及私密知识越界。
- tests/a3t2-triage.test.mjs：新增独立离线回归，覆盖两条原行动请求、原委托/修理参数纠正、拒绝原子性、托管守恒、资源投影与真拦。未改旧断言。

静态 prompt/、extension/tools.mjs、world/、题集、判分器和架构设计均未改。无 Git 写操作，无部署，无原存档写入。

## 补跑证据

奇思妙想第6回合与交谈打听第3回合，sidecar gate.preview.status 都是 needs_alternative，candidates 都是空数组。不能宣称构造器已生成明确行动候选。前者之前的 world_actions 列表确实可发现 open:proposal；两者的补跑都返回 world_no_action({}) → {ok:true,status:no_action,settled:false}。旧请求同时出现“纯闲聊/纯观察请选择no_action”“不要自动执行预览候选”，没有明确说明行动失败也应正式裁决。修复只澄清编排，不自动替玩家执行候选。

交谈打听第3回合还存在前一轮任务发布失败的连锁前提：即使补跑提交 accept，也应该取得不存在任务的拒绝，不能直接变成成功承接。

## 原参数离线重放

| 回合/调用 | 原返回 → 修后离线返回/纠正 | 输入是否不变 |
|---|---|---|
| craft 7 / world_craft | 尚未学会这个配方 → 尚未学会这个配方； | True |
| craft 14 / world_craft | 维修工序编号未识别；此物品已登记：repair_staff_trim。请使用已登记编号，或省略repairPlan让唯一工序自动匹配 → 维修工序编号未识别；此物品已登记：repair_staff_trim。请使用已登记编号，或省略repairPlan让唯一工序自动匹配；omitPlan → 尚未掌握维修所需技能：木匠基础手艺（skill_life_6_core）；工序 repair_staff_trim 要求熟练度至少0。请先通过学习掌握该技能；协助者不能替代本人掌握技能的前提 | True |
| craft 14 / world_craft | 尚未掌握维修所需技能 → 尚未掌握维修所需技能：木匠基础手艺（skill_life_6_core）；工序 repair_staff_trim 要求熟练度至少0。请先通过学习掌握该技能；协助者不能替代本人掌握技能的前提；omitPlan → 尚未掌握维修所需技能：木匠基础手艺（skill_life_6_core）；工序 repair_staff_trim 要求熟练度至少0。请先通过学习掌握该技能；协助者不能替代本人掌握技能的前提 | True |
| craft 15 / world_craft | 尚未掌握维修所需技能 → 尚未掌握维修所需技能：木匠基础手艺（skill_life_6_core）；工序 repair_staff_trim 要求熟练度至少0。请先通过学习掌握该技能；协助者不能替代本人掌握技能的前提；omitPlan → 尚未掌握维修所需技能：木匠基础手艺（skill_life_6_core）；工序 repair_staff_trim 要求熟练度至少0。请先通过学习掌握该技能；协助者不能替代本人掌握技能的前提 | True |
| craft 20 / world_craft | 尚未掌握维修所需技能 → 尚未掌握维修所需技能：木匠基础手艺（skill_life_6_core）；工序 repair_staff_trim 要求熟练度至少0。请先通过学习掌握该技能；协助者不能替代本人掌握技能的前提；omitPlan → 尚未掌握维修所需技能：木匠基础手艺（skill_life_6_core）；工序 repair_staff_trim 要求熟练度至少0。请先通过学习掌握该技能；协助者不能替代本人掌握技能的前提 | True |
| npc_quest_social 2 / world_quest | 身份或本月任务发布额度不足 → 身份或本月任务发布额度不足（本月已用0，额度0，本单需1）；若以本人钱款发布私人D级委托，请显式传 personal:true，仍须通过在场、同意、报酬托管和目标校验；personal → 成功，只发布托管 | True |

重放使用只读 sidecar.before 与同次试玩缓存世界，不调用服务、不调用模型。6次原调用包括制造1次、修理4次、委托1次；每次输入快照哈希均不变。委托纠正后新结果中的 escrow=20、status=公开、taker=null；测试另核对付款方减少20与托管增加20相等。修理没有绕过实际技能缺失；不宣称维修链已可完成。完整参数/返回在 replay.json。

## unverified 17轮审计

逐轮读 sidecar 的 firstReview/review、原始响应、格式修正原因及真实结算。7轮含明确F类误伤（literacy 4/5/8，craft 3/4/11/12），其中部分同时有格式失败或真实问题，不能把整轮都改成通过。A类资源投影缺口已修；其余模型把姿态标成变化、写错对象、伪引文等，通过动态审查请求澄清，旧错误响应仍按原规则拒绝。此离线回归不证明未来模型一定遵守。

| 场景/回合 | 判断 | 依据与保留项 |
|---|---|---|
| a3_whimsy 1 | T/分歧 | 营业事实不能仅凭日历推断；首审支持、复审否定，不通过降低来源标准解决。 原响应：firstReview:issues；review:issues |
| a3_whimsy 3 | 格式 | 原断言 JSON 损坏，无法证明格式修正保留原判断。 原响应：firstReview:原断言 JSON 损坏，格式修正不能证明保留原判断；review:原断言 JSON 损坏，格式修正不能证明保留原判断 |
| literacy 3 | 格式 | supported 非豁免断言无来源；保留拒收。 原响应：firstReview:支持或矛盾的断言必须引用真实来源；review:支持或矛盾的断言必须引用真实来源 |
| literacy 4 | F+格式 | 留纸姿态不等于库存转移；“写在自己纸上也行”是条件建议，不声明已持纸。假引文与缺来源仍拒收。 原响应：firstReview:支持或矛盾的断言必须引用真实来源；review:支持或矛盾的断言必须引用真实来源 |
| literacy 5 | F+格式 | 同一学堂庭内走动不自动成为跨地点变化；另有 supported 项未引用来源，保留格式拒收。 原响应：firstReview:支持或矛盾的断言必须引用真实来源；review:支持或矛盾的断言必须引用真实来源 |
| literacy 8 | F+格式 | 声音渐渐听不见、未说出私密内容的交谈不需要新事件。格式修正删除/新增问题仍拒收。 原响应：firstReview:格式修正不得删除或新增原审查问题；review:格式修正不得删除或新增原审查问题 |
| craft 2 | 格式/T | 真实两笔买卖均有来源；但新布袋存钱位置不因此获得记录，且 supported 项缺引用。 原响应：firstReview:支持或矛盾的断言必须引用真实来源；review:支持或矛盾的断言必须引用真实来源 |
| craft 3 | F+T+格式 | 收草绳是普通姿态；“下次再讲”是未有决策的新承诺。禁止格式修正反转后者判断。 原响应：firstReview:格式修正不得改变原断言判断；review:格式修正不得改变原断言判断 |
| craft 4 | F+格式 | 六铜付款已结算；文本资源 object 不规范、感官姿态被误当账本。复审 knowledge 响应字段亦不合法。 原响应：firstReview:issues；review:知情泄漏须指出无渠道主体、原句内具体私密内容及对应认知证据；场外核账归事实 |
| craft 8 | 格式 | 缺来源的 supported 断言仍不合法；未发现可确认的 F 负评。 原响应：firstReview:支持或矛盾的断言必须引用真实来源；review:支持或矛盾的断言必须引用真实来源 |
| craft 11 | F+A | 半步和肩头接触为既有交锋/伤害的呈现；hp资源投影已修，原错误施害者 object 不自动改成 hp。 原响应：firstReview:issues；review:issues |
| craft 12 | F | hp+2后的主观疼痛消退不新增持久伤病；time=180是历史时长。clock当前00:02正确不应再报无误时间。 原响应：firstReview:issues；review:issues |
| craft 17 | 格式 | 响应未完整返回；保留拒收，不猜缺失断言。 原响应：firstReview:审查响应未完整返回唯一问题清单；review:审查响应未完整返回唯一问题清单 |
| craft 19 | T | 已有义务登记可陈述；不存在同 request/scope/outcome 的新 NPC 决定，不能照抄模型猜的“成立/created”。 原响应：firstReview:issues；review:issues |
| npc_quest_social 1 | T+格式 | 未结房钱无债务来源；knowledge类别缺具体泄漏内容，格式拒收仍有效。 原响应：firstReview:知情泄漏须指出无渠道主体、原句内具体私密内容及对应认知证据；场外核账归事实；review:知情泄漏须指出无渠道主体、原句内具体私密内容及对应认知证据；场外核账归事实 |
| npc_quest_social 4 | 格式 | supported断言缺来源，保留真拦，不因“我没听说”自动证明所有台词。 原响应：firstReview:支持或矛盾的断言必须引用真实来源；review:支持或矛盾的断言必须引用真实来源 |
| npc_quest_social 11 | T/预算 | 场外尾注应移除；检索未调用不能证明查无记录；复审预算不足属于未验证。 原响应：firstReview:issues；review:试玩波次或单卡增量费用不足，拒绝发送 |

## 41个失败回合逐条证据

| 场景/回合 | 类 | 状态与失败断言数 | 结论 |
|---|---|---|---|
| a3_whimsy 1 | C | unverified / 0 | 原稿“还没开集”与改写“今天不开集”涉及营业状态；当前日历不足以证明停市，不能把此项直接算普通姿态。首审与复审判断也不一致；保留真实营业事实校验。 |
| a3_whimsy 3 | C | unverified / 0 | 移动到旧渡口真实成功；审查原响应 JSON 损坏，格式修正不能证明保留原判断。未发现可安全本地补全的唯一响应。 |
| a3_whimsy 4 | B | pending / 2 | world_actions 已展示 open:proposal，但只查询后补跑 world_no_action，没有提交意图；补跑请求过去禁止自动执行预览候选，已改为优先匹配候选或提交原意。 |
| a3_whimsy 5 | B | pending / 0 | 玩家只核对库存与池水，两条查询均成功；pending 是无正式行动回执的既定门禁状态，试玩一致性统计将其计失败。锁定门禁和判分器均未改。 |
| a3_whimsy 6 | B | pending / 2 | 明显尝试许愿行动，补跑选 world_no_action。gate.candidates=[]，preview=needs_alternative；不是忽略现成明确候选。已使请求明确要求不可能效果也提交引擎裁决。 |
| a3_whimsy 7 | B | pending / 1 | 只读 environment_inspect 成功；仍缺第6轮原提案回执，锚定原回执断言随之失败。查询本身未改水质，正确保留未结算。 |
| a3_whimsy 8 | C | issues / 1 | 模型仅移动，林穗已在睡眠，没有按玩家原文等待她清醒。present 失败是真实未满足；此外审查对凳子/柜台/声响的普通感知有 F 类误判，已补动态口径。 |
| a3_whimsy 10 | C | pending / 1 | 留痕已成立但此前未等林穗清醒，无实际目击告知事件；本轮选 no_action，没有实际检索。不能凭旁白添加 tell。 |
| a3_whimsy 11 | C | pending / 0 | 要求向林穗发问，模型却仅 no_action；没有 NPC 回答裁决，不得补记忆或声称她已回答。 |
| a3_whimsy 12 | B | pending / 2 | 核账查询成功但第4/6轮原提案一直未提交，两个锚定回执断言失败；纯查询的 pending 不证明库存错账。 |
| literacy 2 | C | pending / 0 | 只查动作与旧事，未发起报价/对话裁决，却在原稿编出每小时四铜等新条件；pending 保留，不扩大场景卡为报价回执。 |
| literacy 3 | C | unverified / 0 | world_learn 真实结算；审查 supported 非观察断言缺来源，格式修正后仍失败。保留引用校验，不因教程成功而放行所有台词。 |
| literacy 4 | B | unverified / 0 | 教学成功；“把纸留下”“写在自己纸上也行”被当作送纸/拥有纸，属于姿态与条件建议误伤，同时响应有假引文/缺来源。动态请求澄清呈现；旧坏响应不自动改判。 |
| literacy 5 | B | unverified / 1 | world_practice(skill_literacy) 已成功，断言要求 skill=识字，严格字符串比较为0；这是工具口径误差。审查把同地散到庭外当新位置变化也属 F。未改锁定判分器。 |
| literacy 7 | B | verified / 1 | world_practice(skill_literacy) 已成功且 verified；唯一失败是断言 skill=识字 与真实技能 ID 不等。未改题集或判分器。 |
| literacy 8 | B | unverified / 0 | 真实移动到村路；审查把“念字声渐渐听不见”和未透露内容的同地交谈列为缺来源，属 F；格式修正还删除/新增问题，故旧响应仍应拒收。 |
| craft 2 | C | unverified / 0 | 小刀及两份木料两笔买卖已结算；审查响应 supported 项缺真实引用，不能以买卖成功豁免其它断言。“钱收入腰带布袋”也不能新建真实托管位置。 |
| craft 3 | B | unverified / 0 | 真实学习检定失败；“尹葛收起草绳”等同地姿态被报缺事件属 F。“下次再讲”的新授课承诺无决定仍是真拦；格式修正改了原判断仍拒收。 |
| craft 4 | B | unverified / 0 | 学习失败仍正常付六铜；审查把 change.object 填“六枚铜钱”而非 coin，造成已付款被拒；木尺/磨轴姿态也有 F。已补动态填写说明，并补原子 effect 的资源投影。 |
| craft 5 | D | pending / 1 | 模型确实尝试 core:learn，但服务窗口不足，原参数被引擎正确拒绝。场景断言无条件期待再学60分钟/扣六铜，未保证教师有完整可用时段。 |
| craft 6 | C | verified / 1 | 未学会技能时玩家要求再学一次；模型只等待46分钟，既未恢复完整服务窗口，也未再提交学习。 |
| craft 7 | D | pending / 6 | 先前学习均未掌握技能、更未学配方；制造原参数重放仍为“尚未学会这个配方”，无消耗正确。场景却无条件期待制一批及扣费耗材。 |
| craft 8 | C | unverified / 0 | 移动真实成功；审查 supported 断言缺来源，格式修正后仍不合法。未发现确定的普通姿态负评，不能把格式失败全计 F。 |
| craft 11 | A | unverified / 0 | 战斗确有玩家hp 12→11→10；effect.need=hp 未进入审查 object，导致正确写 hp 的计量断言也不可引用。已补投影。原响应另将施害者填成资源，仍须正确填写；半步与肩头接触是 F 类感官呈现。 |
| craft 12 | B | unverified / 0 | 休息真实经过180分钟并hp+2；疼痛消退被错判持久伤势痊愈、三小时被标成资源 change，属 F/结构化口径错误。已在动态请求区分感官、历史时长与资源变化。 |
| craft 14 | D | pending / 6 | 首个 repairPlan 自由文字可被原错误纠正为 repair_staff_trim；改编号后仍缺木匠基础技能。重放确认四种同类调用均不扣款不耗时；无条件维修成功前提不成立。另已补 B 类技能诊断。 |
| craft 15 | D | pending / 1 | 同一原参数仍缺技能，未形成 repair 记录/扣工坊费属于正确拒绝；再次检定之前需要先满足已学技能前提。 |
| craft 16 | C | pending / 1 | 查询后选 no_action；没有最后一次 repair 调用。缺技能拒绝合理，但若玩家要求尝试应提交或明确保留未行动，不能旁白替代回执。 |
| craft 17 | C | unverified / 0 | 场外账本核对；审查响应未完整返回且格式修正无法完成。未凭失败响应放行全文。 |
| craft 18 | C | verified / 1 | 原文“今天早上九点半”，当时已是雨月2日00:35；模型填 dayOffset:1，实际3450而期望2010。应填0；引擎按参数正确走到次日。 |
| craft 19 | C | unverified / 1 | world_promise 漏 attribute/skill，实际登记精神/null，而断言期待敏捷/木匠。settlement.decisions=[]，模型另造 NPC 新应允 scope/outcome；不能把义务记录等同任意新决定。 |
| craft 20 | D | pending / 3 | 协助不能替代本人学会技能，原修理参数加 helpers 仍被正确拒绝；且前轮实际协助登记为精神/null。保留未扣费、未消耗协助与未生成维修记录。 |
| npc_quest_social 1 | C | unverified / 0 | 进入酒馆真实成功；模型编造“房钱没结”，账本无相应债务。审查再用缺私密内容的 knowledge 问题返回，格式不合法；事实缺来源应保留。 |
| npc_quest_social 2 | B | pending / 2 | NPC 私人D委托漏 personal:true，被官方额度校验拒绝；旧报错没有给出可纠正参数。原参数离线补该字段即发布成功、只托管不承接。已补报错，未改额度或同意规则。 |
| npc_quest_social 3 | B | pending / 3 | 发布未成所以 quests={}，补跑选 no_action，accept 没提交；候选确为空。已改补跑应提交行动由引擎拒绝，不据空任务表造已接受委托。 |
| npc_quest_social 4 | C | unverified / 0 | 真实移动北林边，吴朔未得到具体委托内容；审查 supported 断言缺来源，原响应不完整。保留真实引用要求，未自动赋予私密知识。 |
| npc_quest_social 7 | D | verified / 1 | 已购买十份燕麦且返回酒馆，但委托从未发布，场景仍无条件期待进行中委托；不能凭粮食存在创造任务。根因关联第2轮 B。 |
| npc_quest_social 8 | D | pending / 4 | 委托仍不存在，所以不能交“这份委托”并领取20铜；库存仍十份、报酬未付是正确状态。场景承接成功前提未建立，关联第2轮 B。 |
| npc_quest_social 9 | C | pending / 0 | 涉及林穗当前挂心之事的新台词，模型只 no_action；无实际 NPC 决策，不能由旁白新建任务或计划。 |
| npc_quest_social 10 | C | pending / 0 | 继续问 NPC 的原因与打算，模型仍只 no_action；没有新增对话回执，保留 pending。 |
| npc_quest_social 11 | C | unverified / 0 | 场外核账原稿带尾注，首审还存在 history/chat 不能支持新事实的真实限制；复审因波次费用不足未发送。离线不追加模型，不把未验证当通过。 |

### a3_whimsy 第1回合（C）

我沿已知路线去白石镇。只赶路，不买卖。

sidecar reviewId：`9416ceba404b543951a33ca45a7563c6b260ed53fce4b9e2f165109246cb116d`；返回状态：`unverified`。

```json
[{"tool":"world_move","args":{"destination":"loc_bs"},"returned":{"ok":true,"minutes":360,"minute":900,"receipt":{"status":"committed","routed":"core:move"}}}]
```

### a3_whimsy 第3回合（C）

我去河湾渡口看看水边的池水，不先取水或做别的事。

sidecar reviewId：`140b8537d843fdd68dbdd5102d248dd31bbb22f6f40ce50ff28ca596d32ccd52`；返回状态：`unverified`。

```json
[{"tool":"world_move","args":{"destination":"loc_hw_dukou"},"returned":{"ok":false,"error":"未登记“loc_hw_dukou”，候选：无；请使用已登记中文名称或候选编号，公开目录可用world_catalog查询"}},{"tool":"world_catalog","args":{"entity":"旧渡口","kind":"location"},"returned":{"query":"返回只读资料"}},{"tool":"world_move","args":{"destination":"loc_hw_dock"},"returned":{"ok":true,"minutes":363,"minute":1268,"receipt":{"status":"committed","routed":"core:move"}}},{"tool":"world_field","args":{"operation":"environment_inspect","target":"feature_hw_pool","location":"loc_hw_dock"},"returned":{"ok":true,"minute":1268,"actionScope":{"kind":"instant","instantaneous":true}}}]
```

### a3_whimsy 第4回合（B）

我想把渡口池水净化，装进刚买到的素面陶罐拿去卖。先按实际水质、容器和能力提出能做到的部分；做不到的部分请给世界内原因和可行替代。我不预设净化、取水或卖钱一定成功。

sidecar reviewId：`06b31e0ccb82d04e33572f3138621e0e1327ef7f844ef624121fc9d442e3aed6`；返回状态：`pending`。

```json
[{"tool":"world_catalog","args":{"entity":"素面陶罐","kind":"item"},"returned":{"query":"返回只读资料"}},{"tool":"world_actions","args":{"query":"检验水质 取水 净化","target":"feature_hw_pool"},"returned":{"query":"返回只读资料"}},{"tool":"world_read","args":{"section":"inventory"},"returned":{"query":"返回只读资料"}},{"tool":"world_actions","args":{"query":"检验水质 净化 煮沸 求人","target":"loc_hw_dock"},"returned":{"query":"返回只读资料"}},{"tool":"world_read","args":{"section":"人物"},"returned":{"ok":false,"error":"该栏目超过单次读取上限；人物可用npc编号定位，其他记录通过检索查看。"}},{"tool":"world_no_action","args":{},"returned":{"ok":true,"status":"no_action"}}]
```

### a3_whimsy 第5回合（B）

若刚才的提案有实际提交，只核对池水和行囊现在的状态；若被裁剪或拒绝，也按当前状态继续，不把想法当成已经取得的水。

sidecar reviewId：`9967389f77d0d5bfbb72e97b09f628358b66189f8d123e97fdb0744deb3fd07f`；返回状态：`pending`。

```json
[{"tool":"world_read","args":{"section":"行囊"},"returned":{"query":"返回只读资料"}},{"tool":"world_field","args":{"operation":"environment_inspect","location":"loc_hw_dock","target":"feature_hw_pool"},"returned":{"ok":true,"minute":1268,"actionScope":{"kind":"instant","instantaneous":true}}}]
```

### a3_whimsy 第6回合（B）

我捧起一捧池水，许个愿，要它不借助任何药材和手艺，立刻变成能治百病的灵药，然后拿去高价卖掉。

sidecar reviewId：`ef802903921b64b97bc63859f5fe521d3f63839cb705184a3e75e75c97fa406e`；返回状态：`pending`。

```json
[{"tool":"world_no_action","args":{},"returned":{"ok":true,"status":"no_action"}}]
```

### a3_whimsy 第7回合（B）

我不把被拒绝的效果当成发生了；查看当前池水状态，确认它仍由世界规则决定。

sidecar reviewId：`e372e95b66202f2ffb94706d34e7b443968b364c2c528982f15e65b890f64f2c`；返回状态：`pending`。

```json
[{"tool":"world_field","args":{"location":"loc_hw_dock","operation":"environment_inspect","target":"feature_hw_pool"},"returned":{"ok":true,"minute":1268,"actionScope":{"kind":"instant","instantaneous":true}}},{"tool":"world_no_action","args":{},"returned":{"ok":true,"status":"no_action"}}]
```

### a3_whimsy 第8回合（C）

我去青灯酒馆，确认林穗实际在场且醒着后再留痕；若她不在，就等到她确实出现。随后我在墙边留一道普通刻痕，不声称它有法术效果，也不损坏别人的物品。

sidecar reviewId：`e4fb83cf396cbb87a257db7a178d21e49458449cb76c891690d34e81ffe44fe2`；返回状态：`issues`。

```json
[{"tool":"world_move","args":{"destination":"bld_hw_qingdeng"},"returned":{"ok":true,"minutes":4,"minute":1272,"receipt":{"status":"committed","routed":"core:move"}}}]
```

### a3_whimsy 第10回合（C）

我查看这次留痕带来的实际系统记录；若有人看见，核对是否生成对应的告知事件，不把旁白当成证据。

sidecar reviewId：`1fb366a0c5211cc1ac6c23d47219b42ad093339dbd5252ffc75b1ea5e3aac5bb`；返回状态：`pending`。

```json
[{"tool":"world_no_action","args":{},"returned":{"ok":true,"status":"no_action"}}]
```

### a3_whimsy 第11回合（C）

我问林穗是否实际注意到墙上的记号；如果她没看见或不在场，就接受她不知道，不替她补记忆。

sidecar reviewId：`f1bee09b8d86ffb7c9acb5efc93bac700d5556b42afcebae3f2cf01dc48676df`；返回状态：`pending`。

```json
[{"tool":"world_no_action","args":{},"returned":{"ok":true,"status":"no_action"}}]
```

### a3_whimsy 第12回合（B）

最后核对提案回执、留痕记录和当前钱物。未结算的想法不记成收入，标记本身也不凭空产生物品价值。

sidecar reviewId：`46910dca8592d4673fb3d9a0c9532196a34a6e2f4f5229912a7d5d08198d710b`；返回状态：`pending`。

```json
[{"tool":"world_search","args":{"query":"刻痕 青灯酒馆 留痕 mark_6811ed7291c908474afa37df09850a0c","limit":10},"returned":{"query":"返回只读资料"}},{"tool":"world_read","args":{"section":"行囊"},"returned":{"query":"返回只读资料"}}]
```

### literacy 第2回合（C）

我问陆青能不能教我基础识字，以及一次学习需要多少费用和时间。

sidecar reviewId：`a847ef460b700fdf2133a7272dc15b2519ff409ba7a3b6078800e3392f2783af`；返回状态：`pending`。

```json
[{"tool":"world_actions","args":{"target":"npc_hw_luqing","query":"识字教学 费用 时长"},"returned":{"query":"返回只读资料"}},{"tool":"world_search","args":{"query":"识字 学费 铜 授课 费用","limit":5},"returned":{"query":"返回只读资料"}},{"tool":"world_actions","args":{"query":"授课 学习 识字 学费"},"returned":{"query":"返回只读资料"}}]
```

### literacy 第3回合（C）

我交两枚铜币，跟陆青认真上一节基础识字课。

sidecar reviewId：`879ff8c582c2c2b091eadf0d87f4aba90c795be635ec32927bb2bc0ffcf4d418`；返回状态：`unverified`。

```json
[{"tool":"world_learn","args":{"entity":"skill_literacy","source":"npc_hw_luqing","kind":"skill","student":"player"},"returned":{"ok":true,"success":false,"minutes":60,"minute":612,"receipt":{"status":"committed","routed":"core:learn"}}}]
```

### literacy 第4回合（B）

如果还没掌握基础识字，我愿再花两铜上一节；已经学会就练习认字一次。

sidecar reviewId：`867bd08c2de08d90dedb6de23bd9b7f5c98e042fa08b7f97d7d4cdbc820e834a`；返回状态：`unverified`。

```json
[{"tool":"world_learn","args":{"entity":"skill_literacy","kind":"skill","source":"npc_hw_luqing","student":"player"},"returned":{"ok":true,"success":true,"minutes":60,"minute":672,"receipt":{"status":"committed","routed":"core:learn"}}}]
```

### literacy 第5回合（B）

我继续跟着陆青练习。如果仍未学会就付两铜再试一次学习，不跳过费用。

sidecar reviewId：`383211ca6b829c59d8035005dc522f624ab72f98a9613084790b9c3f657474de`；返回状态：`unverified`。

```json
[{"tool":"world_practice","args":{"skill":"skill_literacy"},"returned":{"ok":true,"minutes":120,"minute":792,"receipt":{"status":"committed","routed":"core:practice.session"}}}]
```

### literacy 第7回合（B）

我向陆青道谢，留在学堂再练习一次，不另买东西。

sidecar reviewId：`da504289ec6b2fe6d6d10c348266436ddd385bd79a315f3d8fdd417045b6bd91`；返回状态：`verified`。

```json
[{"tool":"world_practice","args":{"skill":"skill_literacy"},"returned":{"ok":true,"minutes":120,"minute":912,"receipt":{"status":"committed","routed":"core:practice.session"}}}]
```

### literacy 第8回合（B）

我离开学堂走回村路。

sidecar reviewId：`a995a4a0c514310c31f508ab9c7069cafb7cf892940dfa95da8fec977df89b2d`；返回状态：`unverified`。

```json
[{"tool":"world_move","args":{"destination":"loc_hw"},"returned":{"ok":true,"minutes":7,"minute":919,"receipt":{"status":"committed","routed":"core:move"}}}]
```

### craft 第2回合（C）

我向阿砚买一把削木小刀和两份木料，按正常价格付钱拿货。

sidecar reviewId：`ffa99810cdbb2b26d37f1f9772e243bd78a3dc2172038d9ed389268ce2990d47`；返回状态：`unverified`。

```json
[{"tool":"world_catalog","args":{"kind":"item","entity":"削木小刀"},"returned":{"query":"返回只读资料"}},{"tool":"world_catalog","args":{"kind":"item","entity":"木料"},"returned":{"query":"返回只读资料"}},{"tool":"world_trade","args":{"operation":"trade","seller":"npc_hw_ayan","buyer":"player","item":"item_whittling_knife","quantity":1,"unitPrice":8,"coins":8,"payment":"cash","consent":true},"returned":{"ok":true,"minute":549,"receipt":{"status":"committed","routed":"core:trade.trade"}}},{"tool":"world_trade","args":{"operation":"trade","seller":"npc_hw_ayan","buyer":"player","item":"item_wood","quantity":2,"unitPrice":4,"coins":8,"payment":"cash","consent":true},"returned":{"ok":true,"minute":554,"receipt":{"status":"committed","routed":"core:trade.trade"}}}]
```

### craft 第3回合（B）

请阿砚教我木匠基础手艺，我愿付正常学费认真学一次。

sidecar reviewId：`fb266eb175e328a9f58b859aa9823e1adf9db4fbf68aec4303fa0c2002e5fff2`；返回状态：`unverified`。

```json
[{"tool":"world_actions","args":{"target":"npc_hw_ayan","query":"学习木匠基础手艺 授课 学费"},"returned":{"query":"返回只读资料"}},{"tool":"world_act","args":{"action":"core:learn","slots":{"entity":"skill_life_6_core","source":"npc_hw_ayan","kind":"skill","student":"player","mode":"acquire"}},"returned":{"ok":true,"success":false,"minutes":60,"minute":614,"receipt":{"status":"committed","routed":"core:learn"}}}]
```

### craft 第4回合（B）

如果还没掌握木匠基础手艺，就跟阿砚付六铜学一次；已掌握手艺但不会削制榫用木楔，就付四铜学一次木楔工序；都学会就停下，不重复交钱。

sidecar reviewId：`8b7ba2cc6822a16a79c48530de1d83926ae82c643ab932ede7c731830c578b78`；返回状态：`unverified`。

```json
[{"tool":"world_act","args":{"action":"core:learn","slots":{"entity":"skill_life_6_core","kind":"skill","mode":"acquire","source":"npc_hw_ayan","student":"player"}},"returned":{"ok":true,"success":false,"minutes":60,"minute":674,"receipt":{"status":"committed","routed":"core:learn"}}}]
```

### craft 第5回合（D）

如果还没掌握木匠基础手艺，就跟阿砚付六铜学一次；已掌握手艺但不会削制榫用木楔，就付四铜学一次木楔工序；都学会就停下，不重复交钱。

sidecar reviewId：`87ab8eb50b78cd3d7530709bb2f1978872eaa737c1efbd9a2b9704eafeb0ba01`；返回状态：`pending`。

```json
[{"tool":"world_act","args":{"action":"core:learn","slots":{"entity":"skill_life_6_core","kind":"skill","mode":"acquire","source":"npc_hw_ayan","student":"player"}},"returned":{"ok":false,"error":"剩余服务时间不足，无法在休息或离开前完成"}},{"tool":"world_no_action","args":{},"returned":{"ok":true,"status":"no_action"}}]
```

### craft 第6回合（C）

如果还没掌握木匠基础手艺，就跟阿砚付六铜学一次；已掌握手艺但不会削制榫用木楔，就付四铜学一次木楔工序；都学会就停下，不重复交钱。

sidecar reviewId：`0bf7aaaa7a794017e9b373d4a8beb5ee79bbe02217676bcb398f9b2e0f592892`；返回状态：`verified`。

```json
[{"tool":"world_time","args":{"minutes":46,"activity":"等待"},"returned":{"ok":true,"elapsed":46,"minute":720,"receipt":{"status":"committed","routed":"core:time"}}}]
```

### craft 第7回合（D）

我用自己的木料和小刀，在木工台实际削制一批榫用木楔，只做一批。

sidecar reviewId：`6b90ba8af10583bd10e12e3438e31b2fdc375ffdebab7178173896587ef190bb`；返回状态：`pending`。

```json
[{"tool":"world_catalog","args":{"entity":"recipe_wooden_pegs","kind":"recipe"},"returned":{"minutes":20}},{"tool":"world_craft","args":{"operation":"manufacture","recipe":"recipe_wooden_pegs"},"returned":{"ok":false,"error":"尚未学会这个配方"}},{"tool":"world_no_action","args":{},"returned":{"ok":true,"status":"no_action"}}]
```

### craft 第8回合（C）

我带着旧木杖和小刀步行去北林边。

sidecar reviewId：`2b7c2225191eb0a6bcbf5be481cb6652bda36c5bc9d4e1dbdd15ed72bb96927a`；返回状态：`unverified`。

```json
[{"tool":"world_move","args":{"destination":"loc_hw_northwood"},"returned":{"ok":true,"minutes":37,"minute":757,"receipt":{"status":"committed","routed":"core:move"}}}]
```

### craft 第11回合（A）

我用随身旧木杖防守刚找到的那头活野猪，结算两次交锋；任何一方倒下就停，不继续攻击，也不取材。

sidecar reviewId：`97aa966ad2c4589e0b6767aeac6d6cbbe3982bbb1106f26d479b2b5e3e76ebda`；返回状态：`unverified`。

```json
[{"tool":"world_combat","args":{"target":"monster_instance_836e994f405020d6","intent":"defend","weapon":"旧木杖"},"returned":{"ok":true,"minute":1261,"actionScope":{"kind":"combat_exchange","clockManaged":true,"seconds":60},"receipt":{"status":"committed","routed":"core:combat"}}},{"tool":"world_combat","args":{"intent":"defend","target":"monster_instance_836e994f405020d6","weapon":"旧木杖"},"returned":{"ok":true,"minute":1262,"actionScope":{"kind":"combat_exchange","clockManaged":true,"seconds":60},"receipt":{"status":"committed","routed":"core:combat"}}}]
```

### craft 第12回合（B）

若我濒死，等待十分钟；若已死亡，再等待一分钟在登记点复活。恢复正常后休息三小时，不做别的事。

sidecar reviewId：`1a321bfb80681a528f762996fc6a19d08e0d6f7e0eb1daf5c0be9427454d56fa`；返回状态：`unverified`。

```json
[{"tool":"world_time","args":{"activity":"休息","minutes":180},"returned":{"ok":true,"elapsed":180,"minute":1442,"receipt":{"status":"committed","routed":"core:time.rest"}}}]
```

### craft 第14回合（D）

我在磨坊木工台用自己买的小刀修整这根磨损的旧木杖，只尝试一次，按工序付费；修整检定失败也不擅自重做。

sidecar reviewId：`3e7764f0075d6b81d0af64609ac068c9211544ee93bc7b598f4e3d8365187097`；返回状态：`pending`。

```json
[{"tool":"world_craft","args":{"operation":"repair","item":"item_staff","repairPlan":"用削木小刀修整杖身磨损处、削平毛刺并试压握痕，一次为限"},"returned":{"ok":false,"error":"维修工序编号未识别；此物品已登记：repair_staff_trim。请使用已登记编号，或省略repairPlan让唯一工序自动匹配"}},{"tool":"world_craft","args":{"item":"item_staff","operation":"repair","repairPlan":"repair_staff_trim"},"returned":{"ok":false,"error":"尚未掌握维修所需技能"}},{"tool":"world_read","args":{"section":"inventory"},"returned":{"query":"返回只读资料"}}]
```

### craft 第15回合（D）

如果刚才没修好木杖，我再按同样工序付费修整一次，这次也只做一次；已经修好就只查看杖身，不再收费或动刀。

sidecar reviewId：`a7c68531232e4e0787e1f0bd523bc33bd02b12bb759a19a76fb098bf60e1945c`；返回状态：`pending`。

```json
[{"tool":"world_craft","args":{"item":"item_staff","operation":"repair","repairPlan":"repair_staff_trim"},"returned":{"ok":false,"error":"尚未掌握维修所需技能"}}]
```

### craft 第16回合（C）

如果前两次都没有修好，我最后再付费试一次同样的修整工序，今天总共最多三次；已经修好就不动刀，只查看保存的维修结果。

sidecar reviewId：`fa911c22276f230bb81f421813efb289409608729bf1710fda4f68313b4e5d98`；返回状态：`pending`。

```json
[{"tool":"world_actions","args":{"query":"维修 木杖 木工台 修理服务"},"returned":{"query":"返回只读资料"}},{"tool":"world_no_action","args":{},"returned":{"ok":true,"status":"no_action"}}]
```

### craft 第17回合（C）

（场外）核对制造与维修各自的消耗和成败，不把检定失败说成制成或修好。

sidecar reviewId：`547a02df5844dc3f85b5952d6715af44b3117ec68bb48791803197c6427ebfa0`；返回状态：`unverified`。

```json
[]
```
本轮零工具调用，实际为叙述草稿/场外核对；审查的原始返回见 classification.json.unverifiedAudit。

### craft 第18回合（C）

我留在磨坊休息到今天早上九点半，等阿砚正常上工，不做买卖或修整。

sidecar reviewId：`ee9391daeda47fdaa89b931d41041e0da26d91ca757173c3da9b84ddac964bfe`；返回状态：`verified`。

```json
[{"tool":"world_time","args":{"activity":"休息","until":{"dayOffset":1,"hour":9,"minute":30}},"returned":{"ok":true,"elapsed":1975,"minute":3450,"receipt":{"status":"committed","routed":"core:time.rest"}}}]
```

### craft 第19回合（C）

如果木杖还没修好，我请阿砚按木匠基础手艺在旁指点这一次修整；双方约定成立后，只登记这一次协助，不动刀、不先收费。已经修好就只向他说明已保存的结果，不再请他协助修整。

sidecar reviewId：`2c0756a4d86e7f9adf031811a7466e2c3aea721fdd69131e556909b5b266d580`；返回状态：`unverified`。

```json
[{"tool":"world_promise","args":{"operation":"create","type":"协助","promisor":"npc_hw_ayan","promisee":"player","content":"在旧磨坊按木匠基础手艺在旁指点修整旧木杖一次，只此一次；当场不收费，之后按实际工序另行结算","location":"bld_hw_mill","start":3450,"deadline":3720},"returned":{"ok":true,"minute":3450,"obligation":{"id":"obl_craft-1-18-0","type":"协助","promisor":"npc_hw_ayan","promisee":"player","content":"在旧磨坊按木匠基础手艺在旁指点修整旧木杖一次，只此一次；当场不收费，之后按实际工序另行结算","status":"待履行","deadline":3720,"attribute":"精神","skill":null},"receipt":{"status":"committed","routed":"core:promise.create"}}}]
```

### craft 第20回合（D）

如果木杖还没修好，我按刚才成立的一次协助约定，在阿砚指点下用小刀修整旧木杖一次，支付正常工坊费。无论成败都停下，不能把这次协助再用一遍；已经修好就只查看杖身，不再收费或动刀。

sidecar reviewId：`836bdcd0dd1933f2ad2a3d5f1470a8c635c105db43b51f49c3924fd11d5399ea`；返回状态：`pending`。

```json
[{"tool":"world_craft","args":{"operation":"repair","item":"item_staff","repairPlan":"repair_staff_trim","helpers":["npc_hw_ayan"]},"returned":{"ok":false,"error":"尚未掌握维修所需技能"}},{"tool":"world_no_action","args":{},"returned":{"ok":true,"status":"no_action"}}]
```

### npc_quest_social 第1回合（C）

我走进青灯酒馆找林穗。

sidecar reviewId：`645300592f0fd077ebb146fd13477a1d798a4c0cb801f7b234ce7d1b5595df92`；返回状态：`unverified`。

```json
[{"tool":"world_move","args":{"destination":"bld_hw_qingdeng"},"returned":{"ok":true,"minutes":1,"minute":541,"receipt":{"status":"committed","routed":"core:move"}}}]
```

### npc_quest_social 第2回合（B）

我提出替林穗买十份燕麦并送来，约定总报酬二十铜，买粮多出的费用由我承担。请她明确是否同意这份私人委托，同意的话本轮只发布并托管报酬，我下一轮再承接，现在不接单、不交货。

sidecar reviewId：`4d6c90ad089749963f295d1c3637c366e8999b431b31e7bec84909c92c22e820`；返回状态：`pending`。

```json
[{"tool":"world_quest","args":{"operation":"publish","publisher":"npc_hw_linsui","taker":"player","consent":true,"reward":20,"grade":"D","content":"替青灯酒馆买十份燕麦送到酒馆；粮钱中超出二十铜报酬的部分由承接人自理。","objective":{"type":"deliver","item":"燕麦","quantity":10,"location":"bld_hw_qingdeng"}},"returned":{"ok":false,"error":"身份或本月任务发布额度不足"}},{"tool":"world_no_action","args":{},"returned":{"ok":true,"status":"no_action"}}]
```

### npc_quest_social 第3回合（B）

我接受刚才这份送十份燕麦的委托，然后问林穗我还需要做什么。

sidecar reviewId：`a029a5dee023129b5a8948d2d044a5d07c41d141635fca93197d041f0682c54d`；返回状态：`pending`。

```json
[{"tool":"world_read","args":{"section":"quests"},"returned":{"query":"返回只读资料"}},{"tool":"world_no_action","args":{},"returned":{"ok":true,"status":"no_action"}}]
```

### npc_quest_social 第4回合（C）

我到北林边找吴朔，只问他知道我现在给谁办什么事吗，不向他透露委托内容。

sidecar reviewId：`511520b34e6661b5b2957fec1f716013f104d8e443d61c62edce594434f7f874`；返回状态：`unverified`。

```json
[{"tool":"world_move","args":{"destination":"loc_hw_northwood"},"returned":{"ok":true,"minutes":31,"minute":572,"receipt":{"status":"committed","routed":"core:move"}}}]
```

### npc_quest_social 第7回合（D）

如果行囊里确实已有十份带壳燕麦，我才把粮带回青灯酒馆，问林穗还记得我的委托和约定数量吗，先不交货。若没买到，我留在柜台说明还未备齐，不把委托写成完成。

sidecar reviewId：`46abcd6739921a1909a41a5d217a22d8f929f9aba73d6002e47f3f5e5c557808`；返回状态：`verified`。

```json
[{"tool":"world_move","args":{"destination":"bld_hw_qingdeng"},"returned":{"ok":true,"minutes":4,"minute":619,"receipt":{"status":"committed","routed":"core:move"}}}]
```

### npc_quest_social 第8回合（D）

只有确实买到并带来那十份带壳燕麦，我才当面交给林穗，请她验收并结清委托；若粮没备齐就说明尚未交货，不能领取报酬。

sidecar reviewId：`9da50bf748b1ffe983b20b456ad340a81bf05820cc28ebe18ace7c30ed8bd2f9`；返回状态：`pending`。

```json
[{"tool":"world_read","args":{"section":"inventory"},"returned":{"query":"返回只读资料"}}]
```

### npc_quest_social 第9回合（C）

事办完了，我还想留下聊一会儿。林穗，你今天最挂心的是什么？不买东西，不另接任务。

sidecar reviewId：`738126a3d3195ddd977c0ced1825a1aebb24c051d8c57d8575773e5f7cbe90fa`；返回状态：`pending`。

```json
[{"tool":"world_no_action","args":{},"returned":{"ok":true,"status":"no_action"}}]
```

### npc_quest_social 第10回合（C）

我接着听她说，问问这件事为什么让她费心，是否有什么打算。我没有答应替她处理。

sidecar reviewId：`98b566a337b1b7f67d70c8b384bee7cc5c69b90ba3208b0f0b40595106c384b4`；返回状态：`pending`。

```json
[{"tool":"world_no_action","args":{},"returned":{"ok":true,"status":"no_action"}}]
```

### npc_quest_social 第11回合（C）

（场外）核对这次完成的委托、实际报酬，以及吴朔是否有得到委托消息的记录。

sidecar reviewId：`1f25017abb19f35639038bcdffeb2d9a70cdbe73328984cccf77fed599998a17`；返回状态：`unverified`。

```json
[]
```
本轮零工具调用，实际为叙述草稿/场外核对；审查的原始返回见 classification.json.unverifiedAudit。

## 验证与交接

所有测试文件均单独执行 `node --test --test-isolation=none --test-reporter=tap tests/<文件>`，仅过滤 pass/fail/not ok 摘要。PowerShell本机原生输出对ℹ显示为乱码，故用TAP的ASCII摘要避免漏掉结果；首次摘要为空的命令未作为通过证据。

通过文件：a3t2-triage（5）、turn-contract-client（17）、repair（10）、quest-board（16）、claim-review（16）、m3-consistency-evidence（12）、m1-repair-learning-preconditions（2）、m3-consistency（18）、m3-consistency-integration（8）、a1-applied-review（4）。每个文件终态 exit=0，未执行全量或真实模型。

CORE按卡片由主会话沙箱外补跑；本次相关文件未出现EPERM。主会话代提交；保留分类B的中文名/ID评分误差给持有判分器权限的主会话，D类前提须通过真实动作建立后再按原标准重测。当前89/131仅是旧真实报告，不改写分数。
