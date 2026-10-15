import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {magicEffect} from '../server-plugin/magic-effects.mjs';
import '../server-plugin/magic.mjs';
import {careMechanisms} from '../server-plugin/magic-care.mjs';
import {mindSpaceMechanisms} from '../server-plugin/magic-mind-space.mjs';
import {airMechanisms} from '../server-plugin/magic-air.mjs';
import {ritualMechanisms} from '../server-plugin/magic-ritual.mjs';
import {waterEarthMechanisms} from '../server-plugin/magic-water-earth.mjs';
import {lightMechanisms} from '../server-plugin/magic-light.mjs';
const old=JSON.parse(await fs.readFile('world/design/w2-mechanism-map.json','utf8'));
const source=JSON.parse(await fs.readFile('world/drafts/spells/catalog.json','utf8')).spells;
const world=await loadWorld(),by=new Map(world.spells.map(s=>[s.id,s]));
const known={area_fire:['spell_s1_ember_circle'],consent_link:['spell_s1_mood_link'],mind_message:['spell_s1_marked_letter'],team_link:['spell_s1_team_link'],clean_servant:['spell_s4_dust_talisman'],summon_earth:['spell_s4_rubble_servant'],garden:['spell_s1_field_growth']};
const preferred={spell_fire_05:['spell_s2_wall_trace'],spell_light_03:['spell_s3_night_lamp'],spell_space_09:['spell_s1_solo_step','spell_s1_paired_step']};
const operations={spell_life_01:'hemostasis',spell_life_05:'close_wound',spell_faith_05:'ritual_heal',spell_summon_02:'dust_servant',spell_summon_06:'rubble_servant',spell_summon_07:'paper_bird'};
const explicit={
 spell_water_14:'水域压力与所有站入者的受力没有对应的已发布消费者；不能把普通伤害区域当作水压。',
 spell_shadow_02:'贴身衣影的光照边缘条件尚无同义正式术式；折光衣只覆盖一般光学伪装。',
 spell_shadow_04:'尚无暗影残留来源与只辨残留、不辨施法者的读取消费者。',
 spell_shadow_12:'恐惧已实现，恐惧与禁足的联合解除边界未形成该术消费者。',
 spell_mind_06:'普通噩梦及自愿唤醒的状态来源和唤醒消费者未闭合，不能从安神或睡眠术推断已覆盖。',
 spell_mind_09:'自愿者犹疑的可读状态未登记；不以测谎或读心代替。',
};
const rows=source.map(original=>{
 const prior=old.rows.find(r=>r.id===original.id)??{},mechanism=prior.mechanism??original.mechanism;
 let matches=by.has(original.id)?[original.id]:preferred[original.id]??known[mechanism]??world.spells.filter(s=>s.mechanism===mechanism&&s.effectSpec).map(s=>s.id);
 // These share a label, but the old target includes effects beyond that label.
 if(['spell_faith_06'].includes(original.id))matches=[];
 const base={id:original.id,legacyName:original.name,mechanism,priorStatus:prior.status??'旧表未列',originalEffect:prior.originalEffect??original.effect};
 if(matches.length&&!explicit[original.id])return {...base,disposition:'covered',spells:matches,scope:'机制已有正式术式；名称、数值、目标与限制以所列现有术式为准，不承诺旧文本全部数值。'};
 const op=operations[original.id]??mechanism;
 let family=Object.hasOwn(careMechanisms,op)?'care':Object.hasOwn(mindSpaceMechanisms,op)?'mind_space':Object.hasOwn(airMechanisms,op)?'air':Object.hasOwn(ritualMechanisms,op)?'ritual':Object.hasOwn(waterEarthMechanisms,op)?'water_earth':Object.hasOwn(lightMechanisms,op)?'optics':null;
 if(['dust_servant','rubble_servant','paper_bird'].includes(op))family='summon';
 if(mechanism?.startsWith('damage_')||mechanism==='beam')family='damage';
 const prototype=family?world.spells.find(s=>s.effectSpec?.kind===family):null;
 const implemented=Boolean(family&&magicEffect(family)||family==='damage');
 return {...base,disposition:'research',spells:[],research:{template:prototype?.id??null,skill:prototype?.skill??null,family,operation:op,
  route:implemented&&!explicit[original.id]?'已有原语，完成多日研究后提交 spec；仍须通过原语校验、阶段、同意与法典边界。':'先补实际状态来源与消费者，再经原语校验登记；当前不可取得该完整效果。',
  consumerReady:implemented&&!explicit[original.id],reason:explicit[original.id]??'现有150术没有完整对应的正式术式；保留旧目标为研究方向，不按同族相似描述算作已覆盖。'}};
});
const counts=Object.fromEntries(['covered','research'].map(k=>[k,rows.filter(r=>r.disposition===k).length]));
const report={scope:'154旧骨架逐条去向；covered指现版机制入口，不等于旧名与旧数值全部恢复。研究方向不是已审核发布的新法术。',legacyCount:source.length,formalCount:world.spells.length,counts,rows};
await fs.writeFile('world/design/m4-skeleton-map.json',JSON.stringify(report,null,2)+'\n');
const missing=rows.filter(r=>r.priorStatus==='missing-consumer');
const text=`# M4 骨架映射

旧草稿目录共 ${source.length} 条，现版正式目录 ${world.spells.length} 术。本表核对实际 ID、机制与效果处理器，${counts.covered} 条对应现有术式，${counts.research} 条保留为研究方向；没有为凑旧目录数量新增法术。

数据见 world/design/m4-skeleton-map.json，每条保留旧名称、旧效果和旧状态。covered 的目标与数值以引用的正式术式为准；研究项目可以沿 template 和 skill 进入多日研究，spec 仍要通过运行时原语校验。consumerReady 为 false 时，还缺实际状态或消费者，当前不会登记为可施放成果。

旧表标作 missing-consumer 的 ${missing.length} 条中，${missing.filter(r=>r.disposition==='covered').length} 条已有正式入口：${missing.filter(r=>r.disposition==='covered').map(r=>`${r.legacyName} → ${r.spells.join('、')}`).join('；')}。其余 ${missing.filter(r=>r.disposition==='research').length} 条保留具体缺口，水压不替换成普通伤害区域，犹疑不替换成读心或测谎。

本次只做去向核对，没有发布研究候选文案，未调用模型起草新法术。隐藏职业规则的独立 L2 账不作为法术内容发布证明。
`;
await fs.writeFile('docs/测试报告/M4-骨架映射.md',text);
console.log(JSON.stringify({legacy:source.length,formal:world.spells.length,counts,previouslyMissing:missing.map(r=>[r.id,r.disposition,r.spells])}));
