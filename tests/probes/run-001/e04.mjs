// E04 矿脉见底，夜间盗采：裂炉营矿口 site_ms_ll_adit 替代黑岩铁矿；玩家无许可开采 4 次（核对者 e04.mjs 同情境），
// 另把储量置 0 再开采一次。
import {setup,src,world,once,ok,partial,wrong,missing,codeHas} from '../harness.mjs';

import assert from 'node:assert/strict';
import {fixture,host,worker,clerk} from '../../helpers/finance.mjs';
import {mineEmployment} from '../../../server-plugin/extraction.mjs';
import {openLedger,auditLedger} from '../../../server-plugin/ledger.mjs';

// Use a real local court and a finite deposit; this exercises NPC extraction,
// not autonomous selection of a nighttime crime (outside this criterion).
const npcScenario=once(()=>{
 const f=fixture(),location=f.doc.state.location,item='item_iron';
 f.e.byId.get(location).minerals=[{item,reserve:3,owner:clerk}];
 const row={id:'e04-npc-job',category:'contract',kind:'workshop',owner:host,worker,
  location,item,task:'矿脉开采',createdAt:0,starts:0,deadline:30*1440,
  status:'有效',attendance:{0:480}};
 f.doc.state.records[row.id]=row;
 const tool=f.e.rules.extraction.mining.tool;
 f.doc.state.npcs[worker].inventory[tool]={quantity:1,durability:100};
 f.doc.state.npcs[worker].attributes={力量:1000,敏捷:1000,体质:1000};
 f.doc.ledger=openLedger(f.e,f.doc);
 const d=f.draft(),before=f.e.quantity(d,host,item),mined=mineEmployment(d,f.e,row,600,480);
 assert.equal(mined?.success,true);assert.equal(mined.illegal,true);
 const vein=d.get('state','records',`mineral:${location}:${item}`);
 assert.equal(vein.reserve,0);assert.equal(vein.extracted,3);
 assert.equal(f.e.quantity(d,host,item)-before,3);
 assert.ok(mined.cases.length>0);
 for(const id of mined.cases){
  assert.equal(d.get('state','records',id,'offender'),worker);
  assert.equal(d.get('state','records',id,'offense'),'illegal_mining');
 }
 const snapshot=structuredClone(d.document);
 assert.throws(()=>mineEmployment(d,f.e,row,601,480),/枯竭/);
 assert.deepEqual(d.document,snapshot);assert.deepEqual(auditLedger(d.get('ledger')),[]);
 return `NPC 非法开采共享矿脉 3→0，实收矿石3，立案${mined.cases.length}件，零储量拒采`;
});

const L='site_ms_ll_adit';
const scenario=once(async()=>{
 const S=setup();let c=structuredClone(S.doc);c.state.location=L;
 const bag=S.engine.bagPath('player');let o=c;for(const k of bag.slice(0,-1))o=o[k]??={};const b=o[bag.at(-1)]??={};b.item_mining_pick=3;
 const tries=[];
 for(let i=0;i<4;i++){const r=await S.attempt(c,'world_site',{operation:'mine'},`e04m${i}`);c=r.document;tries.push(r.error?{error:r.error}:{reserve:r.result.reserve,illegal:r.result.illegal,case:r.result.case,jurisdiction:r.result.jurisdiction,success:r.result.success});}
 const key=Object.keys(c.state.records).find(k=>k.startsWith(`mineral:${L}:`));
 const mineral=c.state.records[key];
 const empty=structuredClone(c);empty.state.records[key]={...mineral,reserve:0,updatedAt:empty.state.minute};
 const exhausted=await S.attempt(empty,'world_site',{operation:'mine'},'e04empty');
 return {tries,mineral,initial:world.rules.extraction.mining.locations[L]?.[0]?.reserve,exhausted};
});

export default [
 {id:'E04-1',event:'E04',no:1,text:'盗采的矿石同样扣减矿脉储量',async check(){
  const s=await scenario(),dug=s.mineral?.extracted??0;
  if(!dug)return missing(`未能盗采：${JSON.stringify(s.tries)}`);
  assert.equal(s.initial-s.mineral.reserve,dug);
  const npc=await npcScenario();
  return ok(`玩家开采储量 ${s.initial}→${s.mineral.reserve}，产出${dug}；${npc}`);}},
 {id:'E04-2',event:'E04',no:2,text:'停工期间正规产量为零，铁价上涨，打造成本上升',async check(){
  const priced=/mineral:/.test(src('server-plugin/settlement-trade.mjs'))||/mineral:/.test(src('server-plugin/shop.mjs'));
  return priced?partial('价格读取矿脉记录，但无矿工雇佣与正规产量'):missing('矿脉只有玩家能挖，无正规产量；铁价不读矿脉储量与产出');}},
 {id:'E04-3',event:'E04',no:3,text:'盗采者按本地法典盗采罪处理，买赃者也可能被追责',async check(){
  const s=await scenario(),cased=s.tries.some(t=>t.case);
  const receiving=Object.values(world.rules.law.templates).some(t=>t.penalties?.receiving_stolen);
  if(cased&&receiving)return ok('盗采立案，且有收买赃物罪名');
  if(cased)return partial('盗采按本地法典立案；无“收买赃物”罪名');
  const j=s.tries.find(t=>t.jurisdiction)?.jurisdiction;
  if(j)return partial(`矿口法域可解析（${j.kind} ${j.faction??j.law??''}），按${j.kind==='faction'?'聚居地习俗改立场':'法典'}处理但未立案；无“收买赃物”罪名`);
  return missing(`未立案：${JSON.stringify(s.tries.map(t=>t.case??t.error))}`);}},
 {id:'E04-4',event:'E04',no:4,text:'欠薪矿工可起诉矿主，判决后优先清偿工资',async check(){
  const priority=codeHas(/wagePriority|优先受偿|工资优先/);
  const strike=/罢工|strike/.test(src('server-plugin/labor-market.mjs'));
  return priority?ok('有工资优先受偿规则'):strike?partial('通用雇佣有欠薪→罢工→逾期立案，但矿上无雇工、无工资优先受偿'):missing('无欠薪机制');}},
 {id:'E04-5',event:'E04',no:5,text:'储量归零后不再产出矿石',async check(){
  const s=await scenario();
  return s.exhausted.error&&/枯竭/.test(s.exhausted.error)?ok(`储量 0 时：${s.exhausted.error}`):wrong(`储量 0 仍可开采：${JSON.stringify(s.exhausted.result??s.exhausted.error)}`);}},
];
