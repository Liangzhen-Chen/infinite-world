// S5-07: one current, approved local rain rite, using existing places/hosts.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent} from '../../tools/content-pipeline.mjs';

const root='world/drafts/s507-rain',revision='s507-rain-1';
const files={deities:'world/lore/deities.json',faith:'world/lore/faith.json'};
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const deities=await read(files.deities),faith=await read(files.faith);
let foundation;
try{foundation=await read(`${root}/foundation.json`);}catch(error){if(error.code!=='ENOENT')throw error;}
const before=foundation??{deity:deities.find(d=>d.id==='deity_bank'),rite:null,practice:null};
const deity=structuredClone(before.deity);
deity.miracle.form='显出已设阵界的破损段，不能凭符纸创造河水；分畦祈雨可在春夏降下一昼夜的局部雨泽，不保证两村同受';
deity.miracle.cost='验界耗费芦纸与实测时间，补阵须获地权人同意；求雨须三名同信者持续虔信两日，在主持在场时花三十分钟，耗一份树脂并捐两铜，受同神七日冷却及本季次数限制';
deity.prose.miracles='葭界的验界神迹显出已设阵界的破损段，不能凭符纸创造河水。道士求显前须备芦纸与实测时间，补阵还要取得地权人同意。分畦祈雨是另一项有限回应：春夏三名同信者持续虔信两日，在白石芦篆道舍主持在场时合仪三十分钟，耗一份树脂并捐两铜，雨泽随后持续一昼夜。雨带可能覆榆坡全村、桑坂半村，也可能反过来，不能靠换一句祷词重选落区。未落雨的田地不算受益；受益信众到观后可从本人余钱中供献，不从远方行囊强征。上季实际香火收入支持下季有限次数，捐钱不保证指定田地得雨。神祇真实存在，平常只通过有限神迹回应；同神冷却七日，不借求雨授予地权或免租。误引水仍须赔下游损失，验界符契上施术人、材料、效期缺一不可。';
deity.description=before.deity.description.replace(before.deity.prose.miracles,deity.prose.miracles);
const rite={id:'bank_rain',name:'分畦祈雨',deity:'deity_bank',season:0,coins:2,minutes:30,offerings:{item_resin:1},
 collective:3,devotionDays:2,cooldownDays:7,responseMinutes:30,
 sign:'供盘上的芦岸记号微明三十分钟，只标记本次合仪；雨泽落区另记，不证明契约、地权或私密陈述。',
 rainfall:{minutes:1440,seasons:[0,1],baseQuota:1,coinsPerQuota:6,gratitudeCoins:12,reserveCoins:10,
  footprints:[[{location:'loc_bs_yupo',share:1},{location:'loc_bs_sangban',share:0.5}],
   [{location:'loc_bs_yupo',share:0.5},{location:'loc_bs_sangban',share:1}]]}};
const practice={id:'s507_rain',text:'白石芦篆道舍的分畦祈雨在春夏合仪，三名同信者须实际在场、持续虔信两日并各自同意；三十分钟耗一份树脂并捐两铜，同神冷却七日。雨泽持续一昼夜，榆坡全村与桑坂半村、或榆坡半村与桑坂全村二择一；同一季次不因更换请求编号而重选。只有实际受雨的田地获得供水收益。受益的成年信众到观后，可自本人钱袋供献十二铜乘受益份额向下取整，且至少保留十铜，不遥扣钱。每季基本一次，加上上季实际香火收入每六铜增加一次，经派生槽修正；仪式费用、普通香火与雨泽供献均须真实入库。没有雨额时只行普通祭仪，不以供盘发光冒充降雨，不自动免租。'};
const basis={source:'用户s507e授权正式求雨绑定；D05 §5.5与E18的两村落区、田地、香火及后续配额耦合。',
 change:'有意扩展葭界原先仅验界的能力，并替换排他叙述，不将新增求雨谎称为已有旧设定；保留验界不造河水、地权同意、下游赔偿及隐私边界。',
 calibration:'一昼夜、春夏、三人、二日虔信、二铜一树脂及七日冷却；基额1、每6铜增1、满份供献12铜且留10铜、两种1/.5落区，是本批新审定初值，未声称已完成平衡标定。',
 boundary:'复用现有神祇、道舍、主持、榆坡和桑坂；不新增村落、人物或神权。雨为水文时钟的显式降雨来源，不从河道重复扣量；不改原bank_sign。'};
export const entries=[{id:'s507_rain_deity',target:'deity',row:deity},{id:'s507_rain_binding',target:'binding',row:{rite,practice}}];
const locations=await read('world/geo/locations.json'),rules=await read('world/meta/rules.json');
const facts={places:locations.filter(r=>['bld_bs_reed_dao','loc_bs_yupo','loc_bs_sangban'].includes(r.id)).map(({id,name,parent,scope,coordinates})=>({id,name,parent,scope,coordinates})),
 institution:rules.training.institutions.find(r=>r.institution==='bld_bs_reed_dao')};
const draftFor=e=>({id:e.id,row:e.row});
const contextFor=e=>({before:e.target==='deity'?before.deity:{rite:before.rite,practice:before.practice},basis,facts});
const validateDraft=(d,e)=>{try{assert.deepEqual(d,draftFor(e));assert.equal(facts.places.length,3);assert.equal(facts.institution.deity,'deity_bank');return [];}catch(error){return [error.message];}};
async function approved(){const rows=await readApprovedContent(`${root}/review`,entries,{revision,contextFor});assert.equal(rows.length,2,'求雨内容尚未全部通过审批');return rows;}
export async function verifyPublished(){
 const rows=await approved(),gods=await read(files.deities),rules=await read(files.faith);
 assert.deepEqual(gods.find(d=>d.id==='deity_bank'),rows.find(r=>r.id==='s507_rain_deity').row);
 const binding=rows.find(r=>r.id==='s507_rain_binding').row;
 assert.deepEqual(rules.rites.filter(r=>r.id===rite.id),[binding.rite]);assert.deepEqual(rules.practices.filter(r=>r.id===practice.id),[binding.practice]);
 return {verified:rows.length};
}
export async function publish(){
 const rows=await approved(),gods=await read(files.deities),rules=await read(files.faith),nextDeity=rows.find(r=>r.id==='s507_rain_deity').row,binding=rows.find(r=>r.id==='s507_rain_binding').row;
 const index=gods.findIndex(d=>d.id==='deity_bank');assert.ok(index>=0);
 assert.ok(JSON.stringify(gods[index])===JSON.stringify(before.deity)||JSON.stringify(gods[index])===JSON.stringify(nextDeity),'葭界已被其它内容改动');gods[index]=nextDeity;
 for(const [key,row] of [['rites',binding.rite],['practices',binding.practice]]){
  const index=rules[key].findIndex(r=>r.id===row.id),old=rules[key][index],prior=key==='rites'?before.rite:before.practice;
  assert.ok(!old||JSON.stringify(old)===JSON.stringify(row)||JSON.stringify(old)===JSON.stringify(prior),'求雨绑定已有其它改动');
  if(index<0)rules[key].push(row);else rules[key][index]=row;
 }
 for(const [file,value] of [[files.deities,gods],[files.faith,rules]]){const text=await fs.readFile(file,'utf8'),newline=text.includes('\r\n')?'\r\n':'\n';await fs.writeFile(file,(JSON.stringify(value,null,2)+'\n').replace(/\n/g,newline));}
 return verifyPublished();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.includes('--review')){
  await fs.mkdir(root,{recursive:true});if(!foundation)await fs.writeFile(`${root}/foundation.json`,JSON.stringify(before,null,2)+'\n');
  try{await fs.access(`${root}/budget.json`);}catch(error){if(error.code!=='ENOENT')throw error;
   await fs.writeFile(`${root}/budget.json`,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:0.2,cards:{S507E:{limitYuan:0.2,spentYuan:0,reservedYuan:0,maxRequests:6}},requests:{}},null,2)+'\n');}
  const {summary}=await runContentPipeline({entries,root:`${root}/review`,budgetRoot:root,revision,contextFor,validateDraft,
   reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,buildDraftRequest:()=>{throw Error('固定候选不调用模型起草');},buildReviewRequest:defaultReviewRequest,
   client:new DeepSeekClient({budgetYuan:0.2,logFile:`${root}/usage.jsonl`}),cardId:'S507E',
   allocation:{cardId:'S507E',incrementLimitYuan:0.2,maxRequests:6,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:2});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,budget:summary.budget.cards.S507E}));
 }
 if(process.argv.includes('--publish'))console.log(JSON.stringify(await publish()));
 if(process.argv.includes('--verify'))console.log(JSON.stringify(await verifyPublished()));
}
