import fs from 'node:fs/promises';import path from 'node:path';
import {loadWorld} from './load-world.mjs';import {spellBlueprints} from '../world/design/spell-blueprints.mjs';
import {reuseSpellCandidates,reuseMechanismFacts} from '../world/design/w2-reuse-candidates.mjs';
import {objectSpellCandidates} from '../world/design/m4-object-candidates.mjs';import {validateMagicCatalog} from '../server-plugin/magic.mjs';
const gaps={
 damage_cold:'通用伤害没有炎热环境减伤消费者。',damage_wind:'通用生命目标伤害不能切开非活体软物，亦无甲材差异。',damage_earth:'缺真实小石的取用、飞行和落地归属，不能凭空射石。',damage_shadow:'通用伤害没有沿途强光衰减。',light:'现有照明必须绑定单件持有物，无法在掌心生成、遮挡和熄灭。',healing:'回血未建模浅表出血、血量、感染或教派仪式，不能替代所述医疗语义。',ward:'shadow_ward只有暗影伤害抗性，未有邪秽/邪灵干扰消费者。',
 warm:'热处理器只处理非活体对象，没有手掌生理温度与接触安全。',sense_heat:'已有感知只给单一温度，缺炭线接触和器壁空间温差。',forge_heat:'已有heat允许未燃目标，缺维持真实炉火及持续投料的限定。',craft_heat:'缺窑炉温区与烧制裂损消费者。',
};
const groups=[
 ['barrier area_fire contain_fire area_water area_wind dark_area purify_area light_screen quiet privacy veil_water block_space fear_bind bind_shadow mud_trap inverse_wind','缺区域内多目标、持续触发及跨边界解除/友军波及消费者。'],
 ['airflow clean_air carry_voice sense_air dry_grain slow_fall sail air_bubble deflect smoke lift','缺空气流动/通风、实际位移或对应传播、载荷、呼吸消费者。'],
 ['seal bind_water survey_water slow_flow preserve mud_seal levee level_ground ore structural_sense support fracture survey_earth sense_soil till','缺对应有限地形/容器状态、施工或传感消费者，不能只登记效果。'],
 ['focus_light reveal_wear reflect color shadow_measure waymark trace fog_light beam reveal dim shadow sense_shadow contract_sense decoy corrode counter_contract','缺对应光路/表面证据/材料腐蚀/契约反制消费者；现有刻记不提供检测或遮蔽。'],
 ['herb_sense seedling pain preserve_food roots disease_sense stabilize clean_wound graft parasite restore_tendon garden rest_bless comfort','缺所述生物、病理或食物状态消费者；常规回血和状态提示不能代替。'],
 ['record_feeling sense_mind consent_link wake mind_message hesitation sleep team_link memory_guard','缺所述自愿精神状态、限距传讯或长期记忆保护消费者，不能改写人格或直接宣称有效。'],
 ['measure organize anchor_sense lock_space retrieve bag_seal alarm calibrate_anchor blink store anchor_cargo teleport repair_space','缺真实锚点/容器/通道的可用状态和相应检查或物件/人物迁移消费者。'],
 ['lure clean_servant summon_earth summon_air reassign coordinate invite','现有役灵模板无此任务；缺真实动物引导、清扫、负载传讯、协作或邀约消费者。'],
 ['clean_altar witness_oath exorcise discipline faith_contract revival_mark restore faith_shield','缺教派仪式授权、对应受术者/祭坛/守戒/誓言或参与者消耗消费者。'],
];
// Consumers are available for content authoring; this does not publish a spell.
export function heatSpellCandidates(){
 const handlers={
  forge_heat:{effectSpec:{kind:'object',operation:'forge_heat',power:5000,limitC:1200},duration:30,rangeMeters:3},
  craft_heat:{effectSpec:{kind:'object',operation:'craft_heat',power:5000,limitC:1200},duration:60,rangeMeters:3},
  sense_heat:{effectSpec:{kind:'object',operation:'sense_heat',power:1,surface:true},duration:0,rangeMeters:0},
  warm:{effectSpec:{kind:'heat',operation:'warm',power:1000,limitC:38},duration:30,rangeMeters:0},
  contain_fire:{effectSpec:{kind:'heat',operation:'contain_fire',power:1,upkeepMp:1},duration:30,rangeMeters:3},
  barrier:{effectSpec:{kind:'heat',operation:'barrier',power:5000},duration:10,rangeMeters:3},
  damage_cold:{effectSpec:{kind:'damage',power:40,damageType:'cold',armorFactor:.25,coldDecay:true},duration:0,targeting:{lineOfSight:true}},
 };
 return spellBlueprints().filter(s=>handlers[s.mechanism]).map(s=>({...s,...handlers[s.mechanism],materials:s.mechanism==='sense_heat'?[{item:'item_charcoal',amount:1}]:s.materials}));
}
export function mechanismMap(world){
 const published=new Map(world.spells.map(s=>[s.id,s])),reuse=new Map(reuseSpellCandidates().map(s=>[s.id,s])),approved=new Map(objectSpellCandidates.map(s=>[s.id,s])),heat=new Map(heatSpellCandidates().map(s=>[s.id,s]));
 const rows=spellBlueprints().map(s=>{const actual=published.get(s.id)??approved.get(s.id)??reuse.get(s.id)??heat.get(s.id),status=published.has(s.id)?'published':approved.has(s.id)?'reviewed-unpublished':reuse.has(s.id)?'reuse-candidate':heat.has(s.id)?'consumer-ready':'missing-consumer';
 const gap=gaps[s.mechanism]??groups.find(([keys])=>keys.split(' ').includes(s.mechanism))?.[1];
 if(status==='missing-consumer'&&!gap)throw Error(`未归类的机制 ${s.id}/${s.mechanism}`);
 return{id:s.id,name:s.name,mechanism:s.mechanism,originalEffect:s.effect,status,handler:actual?.effectSpec??s.effectSpec??null,validation:validateMagicCatalog(actual??s,{requireHandler:true}),evidence:status==='consumer-ready'?'server-plugin/magic-object.mjs、magic.mjs与tests/magic-forge.test.mjs；未进行内容审核或正式发布':status==='reuse-candidate'?reuseMechanismFacts[s.mechanism]:status==='published'?'正式world/meta/spells.json及对应M4发布测试':status==='reviewed-unpublished'?'world/drafts/m4-object/；两条既有审核不重复':gap};});
 return{scope:'逐条机制盘点；缺失项保留目标，不按数量压力改成研究型或删除。结构通过不等于原描述已实现。',total:rows.length,formalSpellCount:world.spells.length,counts:Object.fromEntries([...new Set(rows.map(r=>r.status))].map(k=>[k,rows.filter(r=>r.status===k).length])),rows};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){const r=mechanismMap(await loadWorld());await fs.writeFile('world/design/w2-mechanism-map.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({total:r.total,formal:r.formalSpellCount,counts:r.counts}));}
