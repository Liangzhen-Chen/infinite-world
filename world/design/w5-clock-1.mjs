// T110 (B4): executable faction clocks for the first 20 W5 factions by ID.
// The reviewed prose clock (name, trigger, three stageEffects, counterplay) is
// kept; this adds the running stages, their conditions and treasury costs, the
// K6 effect-table effects, and the player's interventions at the faction's
// registration point (contactAnchor). The shared builder is used by B5 too.
export const revision='w5-clock-v1';
const round=n=>Math.max(0,Math.round(n/10)*10);
// Treasury shares: register, deliberate, conclude, player-steered outcome.
export const costsFor=treasury=>[0.02,0.03,0.05,0.04].map(r=>round(treasury*r));
const rumor=(id,claim,carriers)=>({kind:'rumor',id,claim,carriers,salience:2});
const relation=(target,delta)=>({kind:'relation',target,delta});
const dispute=(target,id,status)=>({kind:'dispute',target,id,status});

// Carriers: residents who would plausibly pass such news on (dock, crafts,
// office, market, the Hewan post and the trade agent who travels the roads).
export const CARRIERS={
 bsDock:['npc_bs_001_2','npc_bs_002_2'],bsCraft:['npc_bs_062_2','npc_bs_063_2'],bsOffice:['npc_bs_031_1','npc_bs_032_2'],
 bsMarket:['npc_bs_046_1','npc_bs_047_2'],bsCargo:['npc_bs_016_2','npc_bs_017_2'],hw:['npc_hw_linsui','npc_hw_chenbai'],
 hwDock:['npc_hw_zhengshuisheng','npc_hw_puduo'],post:['npc_hw_shendu','npc_hw_yanzhe'],
};

// spec: carriers, s3 / alt claims, alt name, pause / redirect interventions,
// optional s1 claim (local factions), standing holder, extra effects, partner, cycle.
export function clockRuntime(f,spec,source){
 const slug=f.id.replace(/^faction_/,''),loc=spec.location??f.contactAnchor,c=spec.costs??costsFor(f.resources?.treasuryCopper??0);
 const partner=spec.partner??f.relations?.[0]?.faction,score=(f.relations??[]).find(r=>r.faction===partner)?.score??0,rival=spec.rival??score<0;
 const names=f.clock.stageEffects.map(s=>s.effect),disputeId=f.clock.id,carriers=spec.carriers;
 const standing=(delta)=>spec.standing?[{kind:'standing',holder:spec.standing,target:f.id,delta,reason:`${f.name}：${f.clock.name}`}]:[];
 const check=x=>x.attribute?{attribute:x.attribute,difficulty:x.difficulty}:{};
 const stages=[
  {id:'s1',name:names[0],condition:{kind:'asset',minimum:{coins:c[0]+c[1]+c[2]}},cost:{coins:c[0]},
   effects:[...(spec.s1?[rumor(`${slug}_s1`,spec.s1,carriers)]:[relation(partner,rival?-2:2)]),...spec.extra1??[]]},
  {id:'s2',name:names[1],condition:rival?{kind:'always'}:{kind:'relation',target:partner,minimum:score-10},cost:{coins:c[1]},
   effects:rival?[dispute(partner,disputeId,'open')]:[relation(partner,3)]},
  {id:'s3',name:names[2],condition:rival?{kind:'dispute',target:partner,id:disputeId,status:'open'}:{kind:'always'},cost:{coins:c[2]},
   effects:[rumor(`${slug}_s3`,spec.s3,carriers),...(rival?[dispute(partner,disputeId,spec.rivalEnd??'settled'),relation(partner,spec.s3Delta??-3)]:[relation(partner,spec.s3Delta??2)]),...standing(2),...spec.extra3??[]]},
  {id:'alt',name:spec.alt,condition:{kind:'intervention',id:'redirect'},cost:{coins:c[3]},
   effects:[rumor(`${slug}_alt`,spec.altClaim,carriers),...(rival?[dispute(partner,disputeId,'settled'),relation(partner,spec.altDelta??5)]:[relation(partner,spec.altDelta??4)]),...standing(3),...spec.extraAlt??[]]},
 ];
 const interventions=[
  {id:'pause',name:spec.pause.name,stage:'s2',location:loc,minutes:60,cost:spec.pause.cost??{},effect:'pause',...check(spec.pause)},
  {id:'resume',name:'撤回暂缓请求',stage:'s2',location:loc,minutes:20,cost:{},effect:'resume'},
  {id:'redirect',name:spec.redirect.name,stage:'s3',location:loc,minutes:90,cost:spec.redirect.cost??{},effect:'redirect',nextStage:'alt',...check(spec.redirect)},
 ];
 return {settlement:loc,source,cycle:spec.cycle??'once',contact:{location:loc},stages,interventions};
}
export const EXECUTION='按已发布阶段推进：到期按概率核对条件，扣势力公库并产生效果；可在联络点登记暂缓、撤回或改道';

const P=CARRIERS;
export const specs={
 faction_bankorder:{carriers:P.post,
  s3:'听说验汀道院把一桩要道士逼人认罪的委托原样退回，只答应做当事人自愿的现场核验。',
  alt:'改为自愿现场核验',altClaim:'验汀道院那桩驱邪委托据说改成了当事人自愿的现场核验，强迫认罪的要求被撤了下来。',
  pause:{name:'出示证据请道院暂缓',attribute:'智力',difficulty:13,cost:{coins:10}},redirect:{name:'陪同当事人做自愿现场核验',attribute:'精神',difficulty:13,cost:{coins:20}}},
 faction_blackfloat:{carriers:P.post,rivalEnd:'escalated',
  s3:'驿路上传说暗浮标那伙人把一批来路不明的危险货分了线，港务厅的巡查跟着加紧了。',
  alt:'拒载危险货',altClaim:'暗浮标那条走线据说拒载了一批来路不明的危险货，货主只好去港务厅报关。',
  pause:{name:'劝走线人拒载危险货',attribute:'魅力',difficulty:15},redirect:{name:'举证追赃交给港务厅',attribute:'智力',difficulty:14,cost:{coins:30}}},
 faction_civicartisans:{carriers:P.post,
  s3:'听王都来的货商说，细嵌匠户联社公布了余料互换架的长期周转办法，余料先量尺寸再登记。',
  alt:'以自带木材补足互换',altClaim:'细嵌匠户联社的余料互换据说有人自带木材补上了缺口，互换单配齐了才挂上架。',
  pause:{name:'请联社按新设计重核尺寸',attribute:'智力',difficulty:12,cost:{coins:10}},redirect:{name:'自带木材补足互换缺口',cost:{items:{item_wood:4}}}},
 faction_civiccourt:{carriers:P.post,
  s3:'听说庭阶巡契署在王都设了公开抄阅案卷副本的时段，私人信息先遮去才给人看。',
  alt:'补入遗漏副本后再开放',altClaim:'巡契署的公开案卷据说补进了被人指出的遗漏副本，抄阅时段因此推后了一阵。',
  pause:{name:'指出遗漏的案卷副本',attribute:'智力',difficulty:13,cost:{coins:10}},redirect:{name:'提供反证补入副本',attribute:'智力',difficulty:14,cost:{coins:20}}},
 faction_fieldguild:{carriers:P.bsOffice,standing:'loc_bs',
  s1:'原径冒险公所在白石对读一桩失约委托的原约定，接单和发单的两边都被请去说明。',
  s3:'冒险公所把那桩失约委托实际做完的部分记进了簿子，押款按做到的部分算。',
  alt:'调解后补做约定',altClaim:'那桩失约委托经人调解，接单的人答应补做没完成的部分，公所记下了补做期限。',
  pause:{name:'退还未挣押款请公所暂缓记载',cost:{coins:30}},redirect:{name:'居中调解补做约定',attribute:'魅力',difficulty:13}},
 faction_forestcouncil:{carriers:P.post,
  s3:'听林道商人说，林地共同议会投票修订了入籍申请规则，育苗和巡护的实绩可以拿来作见证。',
  alt:'按旧契递交保留原规则',altClaim:'林地议会那次入籍修订据说因有人递交旧契而搁置，原有的申请规则暂时不改。',
  pause:{name:'提出反例请议会再议',attribute:'智力',difficulty:13},redirect:{name:'递交旧契副本',attribute:'智力',difficulty:12,cost:{coins:15}}},
 faction_furroworder:{carriers:P.hw,standing:'loc_hw',
  s1:'共灶会在河湾开始核对各户现存的口粮，有短缺记录的人家先去登记。',
  s3:'共灶会和各户议定了自愿、限期的分粮约定，到期再议，不愿参加的人家照旧自理。',
  extra3:[{kind:'regional_quote',item:'item_oats'}],
  alt:'以捐粮补足缺口',altClaim:'共灶会这回分粮据说有人捐出口粮补了缺口，约定的分配期因此短了些。',
  pause:{name:'公开具体缺口请暂缓议定',attribute:'智力',difficulty:12},redirect:{name:'捐出口粮补足缺口',cost:{items:{item_oats:10}}}},
 faction_gatehouse:{carriers:P.post,
  s3:'驿路上传说诸门通行署核算了单次对读票的各地损益，叠加收费的关口要逐一说明。',
  alt:'按清楚票面试行',altClaim:'诸门通行署据说改用一份更清楚的票面，过关的人对读一次就能看懂各项费用。',
  pause:{name:'拿运价举证请暂缓试点',attribute:'智力',difficulty:14,cost:{coins:10}},redirect:{name:'交一份清楚的票面设计',attribute:'智力',difficulty:13,cost:{coins:20}}},
 faction_harboroffice:{carriers:P.post,
  s3:'听说泊阶港务厅公开了扩建码头的实际占用和费用，海草合社对晾架被占仍有异议。',
  alt:'改用替代泊位',altClaim:'港务厅的扩港草案据说改走了替代泊位，海草区和晾架没有被划进去。',
  pause:{name:'拿渔获账请港务厅暂缓',attribute:'智力',difficulty:13},redirect:{name:'提出替代泊位方案',attribute:'智力',difficulty:14,cost:{coins:30}}},
 faction_hollowcircle:{carriers:P.bsCraft,
  s1:'白石有人说，一份带来源的旧楔记录被拿去和事故刻痕逐一对读。',
  s3:'那份旧事故记录据说按证人同意的范围公开了一部分，其余仍旧封存。',
  alt:'保密见证并全数封存',altClaim:'旧事故对读据说因证人要求保密而全部封存，只留下见证人的名单。',
  pause:{name:'复测刻痕请暂缓公开',attribute:'智力',difficulty:13,cost:{coins:10}},redirect:{name:'替证人保密见证',attribute:'精神',difficulty:12}},
 faction_hoofguild:{carriers:P.post,
  s3:'听草原来的驮商说，识蹄驯养会公示了病畜退养的条件，治疗和训练合同分开写。',
  alt:'先隔栏照护再议退养',altClaim:'驯养会那批病畜据说先被安排到隔栏照护，退养条件推迟了公示。',
  pause:{name:'出示旧记录请暂缓改约',attribute:'智力',difficulty:12},redirect:{name:'安排隔栏照护病畜',attribute:'体质',difficulty:12,cost:{coins:20}}},
 faction_icearchive:{carriers:P.post,
  s3:'听说低声记片社定下了去名抄记的规范，抄本里记不清的地方都留出空白标记。',
  alt:'撤回同意只存原本',altClaim:'记片社那批亲历片段据说有人撤回了同意，只保存原本，不再传抄。',
  pause:{name:'指出误拼请暂缓抄记',attribute:'智力',difficulty:12},redirect:{name:'协助保存原本副本',attribute:'智力',difficulty:11,cost:{coins:15}}},
 faction_kilnkin:{carriers:P.bsCraft,standing:'loc_bs',
  s1:'楔契炉议会的人在白石说，停工矿的旧排水道开始重测，积水和欠薪记录都摆了出来。',
  s3:'寒炉来的匠人说，停工矿按验收一段段恢复了，欠薪按议定的分担先还一部分。',
  alt:'保留停工先还欠薪',altClaim:'那座停工矿据说暂不恢复，炉议会先把欠薪按议定的分担还清。',
  pause:{name:'勘查排水请暂缓分担',attribute:'智力',difficulty:14,cost:{coins:20}},redirect:{name:'调解欠薪保留停工',attribute:'魅力',difficulty:14}},
 faction_lampbridge:{carriers:P.bsCraft,standing:'loc_bs',
  s1:'灯桥工匠会在白石核对共用作坊里的工具归属，各家的工具先刻上记号。',
  s3:'灯桥工匠会议定了共用作坊的租赁和损耗分担，炉班按排好的次序轮。',
  alt:'按调解后的排班试行',altClaim:'灯桥工匠会的炉班据说经人调解重排，先试行一季再议租赁。',
  pause:{name:'拿出独立样件请暂缓联营',attribute:'敏捷',difficulty:13,cost:{coins:10}},redirect:{name:'调解炉班排期',attribute:'魅力',difficulty:12}},
 faction_lamporder:{carriers:P.post,
  s3:'北境来信说，守芯院联寮按愿意护送的人手把灯材分送到远湾，先修最急的灯。',
  alt:'随航季末护送一并交付',altClaim:'远湾的灯材据说改在航季末随护送一并交付，路上有人帮忙带件。',
  pause:{name:'代修灯具请暂缓分配',attribute:'敏捷',difficulty:13,cost:{coins:10}},redirect:{name:'协调航季末护送带件',attribute:'魅力',difficulty:13,cost:{coins:20}}},
 faction_lanternmerc:{carriers:P.post,
  s3:'驿路上说，背灯佣队签下了寒季可撤回的护运班次，路况坏了就停班。',
  alt:'改走安全窗口分段护运',altClaim:'背灯佣队那批寒季护运据说改成分段走，只在天气稳的窗口出发。',
  pause:{name:'提醒路况请暂缓排期',attribute:'智力',difficulty:12},redirect:{name:'规划分段护运路线',attribute:'智力',difficulty:13,cost:{coins:15}}},
 faction_mossstudy:{carriers:P.post,
  s3:'听说苔院学舍开放了失败册的抄阅，不成功的法子都写明了，私人住址已经删掉。',
  alt:'先补辨样再开放',altClaim:'苔院学舍的失败册据说先补了辨样记录，开放抄阅推后，记下的方法更准了。',
  pause:{name:'提交反例请暂缓开放',attribute:'智力',difficulty:13},redirect:{name:'资助纸张并协助辨样',cost:{items:{item_parchment:3}}}},
 faction_oathkeepers:{carriers:P.post,
  s3:'听说门印证契堂给小户开了见证时段，契约当面对读后才归档具名副本。',
  alt:'退回未明条款',altClaim:'证契堂那批小户契约据说有人拒签未明的条款，退回改写后再对读。',
  pause:{name:'代为校读请暂缓归档',attribute:'智力',difficulty:12},redirect:{name:'陪同拒签未明条款',attribute:'魅力',difficulty:12}},
 faction_patchsail:{carriers:P.post,
  s3:'听海岸来的船户说，补帆祠舟席把岸工的名字补进了救助署名，抄本也送往北境。',
  alt:'先修补绳具再补录',altClaim:'补帆祠舟席的救助补录据说暂缓互送抄本，先把救助用的绳具修补齐了。',
  pause:{name:'提供救助证词请暂缓补录',attribute:'精神',difficulty:12},redirect:{name:'修补救助绳具',cost:{items:{item_flax_cord:2}}}},
 faction_quietledger:{carriers:P.post,rivalEnd:'escalated',altDelta:-10,
  s3:'王都有人低声说，一桩旧债的副本被人做了手脚，巡契署正在追查留下的见证。',
  alt:'原件保全伪契作废',altClaim:'那桩旧债据说原件被人保全，做了手脚的副本没能用上，巡契署拿到了举证。',
  pause:{name:'保存原件请账房退单',attribute:'智力',difficulty:15},redirect:{name:'向巡契署举证',attribute:'智力',difficulty:14}},
};
export const batchIds=Object.keys(specs);
// Reverse relation entries this batch adds, as [target, source]: the source
// faction already lists the target, the target row in this batch did not.
export const REVERSE=[['faction_civiccourt','faction_thresholdhouse'],['faction_civiccourt','faction_fieldguild'],['faction_civiccourt','faction_icearchive'],
 ['faction_civiccourt','faction_quietledger'],['faction_forestcouncil','faction_seedcourt'],['faction_harboroffice','faction_blackfloat'],['faction_hoofguild','faction_saltcaravan'],
 ['faction_bankorder','faction_stonethread'],['faction_bankorder','faction_reedpaper'],['faction_oathkeepers','faction_returnorder'],['faction_fieldguild','faction_starpact']];
export function buildClocks(factions,source='T110 w5-clock-1'){
 return batchIds.map(id=>{const f=factions.find(f=>f.id===id);if(!f)throw Error(`未登记势力：${id}`);return {id,runtime:clockRuntime(f,specs[id],source)};});
}
