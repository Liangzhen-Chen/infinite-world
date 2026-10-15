// T108 publication overlay for the 24 reviewed W5 festivals. The reviewed
// skeleton and prose stay in w5-festivals.mjs and festivals-candidate.json;
// this file only adds what publication needs: a real venue location, the
// running parameters, the material owner and the K6 effect-table effects.
//
// A festival runs (status active) only where a published resident can host it
// at the venue at the start time. A venue without such a resident keeps every
// running parameter but stays awaiting_host: no far-away person is moved in.
export const revision='w5-festival-publication-v1';
const standing=(holder,delta,reason)=>({kind:'standing',holder,target:'player',delta,reason});
const rumor=(id,claim,carriers)=>({kind:'rumor',id,claim,carriers,salience:2});
// [id, location, host|null, kind, startMinute, minimumParticipants, effects, hostRequirement]
const rows=[
 ['festival_ditchmeal','loc_hw_fields','npc_hw_luowei','ritual',720,2,[
  standing('loc_hw',2,'参加修渠灶饭日共食'),
  rumor('ditchmeal_shared','今年修渠灶饭日，南田渠旁照常开了灶，各家带自家薄饼共食，先给病人留了份。',['npc_hw_luowei'])]],
 ['festival_threshold','loc_hw','npc_hw_wengqiao','ritual',600,1,[
  standing('loc_hw',1,'参加水痕描槛日'),
  rumor('threshold_marks','水痕描槛日那天，几户人家请屋主指认后描了旧水线，老人又讲了当年搬粮避水的路。',['npc_hw_wengqiao'])]],
 ['festival_orchardshare','loc_hw_orchard','npc_hw_meiling','ritual',840,1,[
  standing('faction_riverhomes',2,'参加果枝空篮日分果'),
  rumor('orchard_baskets','果枝空篮日，果园树外空地上有人把空篮朝上，邻户自愿切了些自家果子分给他们。',['npc_hw_meiling'])]],
 ['festival_borrowbench','bld_bs_shrine','npc_bs_076_1','ritual',600,1,[standing('faction_returnorder',2,'参加借凳归途日')]],
 ['festival_steps','loc_capital',null,'ritual',480,1,[standing('faction_thresholdhouse',2,'参加清阶开庭日')],
  '须有王都开放门阶的住户亲自主持；王都尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_lampturn','loc_capital',null,'ritual',1080,1,[standing('faction_civicartisans',2,'参加公灯交值日')],
  '须有王都工坊里自愿接值的持灯者主持；王都尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_missingpage','loc_capital',null,'ritual',600,1,[standing('faction_quietledger',1,'参加留白忆亲日')],
  '须有王都愿意借出小院的家属主持；王都尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_copies','loc_capital',null,'ritual',540,1,[standing('faction_oathkeepers',2,'参加副契晾墨日')],
  '须有王都证契堂能开放抄写席的人主持；王都尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_wellrope','loc_far_zhufeng',null,'ritual',420,1,[standing('faction_wellkin',2,'参加交绳歇井日')],
  '须有逐风集一带交接井绳的迁帐队伍成员主持；逐风集尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_hoofsong','loc_far_zhufeng',null,'ritual',480,1,[standing('faction_hoofguild',2,'参加识蹄骨哨日')],
  '须有逐风集一带在场同意的牧户主持；逐风集尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_seeds','loc_far_shuqiao',null,'ritual',600,1,[standing('faction_seedcourt',2,'参加晒种会')],
  '须有树桥育苗院能开放晒台的照护者主持；树桥尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_bindings','loc_far_shuqiao',null,'ritual',540,1,[standing('faction_forestcouncil',2,'参加换绑听枝日')],
  '须有树桥的承重管理者在场允许停用架台并主持；树桥尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_scentcloth','loc_far_xiushi',null,'ritual',600,1,[standing('faction_scentkin',2,'参加晒嗅布日')],
  '须有嗅石集一带保管嗅布的养育群成员主持；嗅石集尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_oldvoices','loc_far_xiushi',null,'ritual',1140,1,[standing('faction_scentkin',2,'参加低鸣忆路日')],
  '须有嗅石集一带愿意开坡屋的养育群成员主持；嗅石集尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_sailpatch','loc_far_hupo',null,'ritual',1140,1,[standing('faction_patchsail',2,'参加补帆夜')],
  '须有琥珀港借出修帆棚的船户主持；琥珀港尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_tidebook','loc_far_hupo',null,'ritual',600,1,[standing('faction_harboroffice',1,'参加空泊阅潮日')],
  '须有琥珀港港方能开放潮簿席的人主持；琥珀港尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_rescuegear','loc_far_xuedeng',null,'ritual',600,1,[standing('faction_winterstore',2,'参加封湾验具日')],
  '须有雪灯镇共用内廊的冬储户主持；雪灯镇尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_wick','loc_far_xuedeng',null,'ritual',1200,1,[standing('faction_lamporder',2,'参加换芯长夜')],
  '须有雪灯镇愿意开放内廊的守灯户主持；雪灯镇尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_jarfair','loc_far_luyu',null,'market',480,1,[standing('faction_watercourt',1,'参加换罐候雨市')],
  '须有芦语渡站一带获水议席准许摆摊的家户主持；芦语渡站尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_shademeasure','loc_far_luyu',null,'ritual',840,1,[standing('faction_shadeorder',2,'参加量影歇行日')],
  '须有芦语渡站一带允许借阴的住户主持；芦语渡站尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_stretcher','loc_far_tongji',null,'ritual',600,1,[standing('faction_wedgeorder',2,'参加停炉补架日')],
  '须有铜脊城确认安全停炉的炉主主持；铜脊城尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_wrongwedge','loc_far_tongji',null,'ritual',600,1,[standing('faction_kilnkin',1,'参加退楔示裂日')],
  '须有铜脊城保管事故物的人主持；铜脊城尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_oldseal','loc_far_luyu',null,'ritual',540,1,[standing('faction_bankorder',2,'参加撤旧符日')],
  '须有芦语渡站一带验过堤的道院负责者主持；芦语渡站尚无登记在册的常住人物，在此之前不举办。'],
 ['festival_dryrubbing','loc_far_luyu',null,'ritual',660,1,[standing('faction_reedpaper',2,'参加晴檐拓尺日')],
  '须有芦语渡站纸坊准许借檐的人与水尺保管人主持；芦语渡站尚无登记在册的常住人物，在此之前不举办。'],
];
export const overlays=rows.map(([id,location,host,kind,startMinute,minimumParticipants,effects,hostRequirement])=>({id,location,host,kind,startMinute,minimumParticipants,effects,...(host?{}:{hostRequirement})}));
export const activeIds=overlays.filter(o=>o.host).map(o=>o.id);
// A duty binding, not a copied timetable: the current lamp caretaker's work
// slot supplies departure and return times on the festival date.
const hostDuties={festival_borrowbench:{occupation:'灯祠照看',settlement:'loc_bs'}};

// The published row: reviewed candidate row + overlay. Participation minutes
// become the running duration; materials are the joining player's own items.
export function publishFestival(row,overlay){
 if(row.id!==overlay.id)throw Error(`节日发布骨架不匹配：${row.id}`);
 const {runtime:_draftRuntime,...base}=structuredClone(row);
 return {...base,
  venue:{...base.venue,location:overlay.location,precision:'existing_location'},
  resourceNeeds:base.resourceNeeds.map(n=>({...n,owner:'player',source:'参加者自有且同意提供；正式举办时只扣本人实际持有的物品，借用与交换物不扣除'})),
  runtime:{status:overlay.host?'active':'awaiting_host',...(overlay.host?{host:overlay.host}:{hostRequirement:overlay.hostRequirement}),
   ...(hostDuties[row.id]?{hostDuty:structuredClone(hostDuties[row.id])}:{}),
   kind:overlay.kind,startMinute:overlay.startMinute,durationMinutes:base.participation.minutes,minimumParticipants:overlay.minimumParticipants,
   effects:structuredClone(overlay.effects),cancellation:base.runtime?.cancellation??row.runtime.cancellation},
  references:[...new Set([...base.references.filter(id=>id!==base.venue.location),overlay.location,...(overlay.host?[overlay.host]:[])])],
 };
}
export function publishFestivals(candidate){
 const byId=new Map(candidate.festivals.map(r=>[r.id,r]));
 return overlays.map(o=>{const row=byId.get(o.id);if(!row)throw Error(`候选缺少节日：${o.id}`);return publishFestival(row,o);});
}
