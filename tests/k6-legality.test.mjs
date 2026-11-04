// K6 legality is a consequence: what is physically open to the actor happens;
// a missing licence is named by the norm stack as an offense and has
// consequences tied to the act's own event. Physical impossibility still refuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {offenseOf} from '../server-plugin/law.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const vocabulary=JSON.parse(await fs.readFile('world/ontology/offenses.json','utf8')).entries;
const game=(w=world,id='k6')=>{const engine=new WorldEngine(structuredClone(w));return {engine,doc:engine.createCharacter(seed,{},id)};};
let n=0;
async function call(g,tool,args){
 const eventId=`k6-${++n}`,out=await g.engine.reduce(g.doc,{tool,args,eventId});
 g.doc=applyPatches(g.doc,out.patches);return {eventId,result:out.result};
}
const account=(owner,item)=>`${owner}|${item}|inventory`;
const qty=(doc,owner,item)=>{const v=(owner==='player'?doc.state.inventory:doc.state.npcs[owner].inventory)?.[item];return typeof v==='number'?v:v?.quantity??0;};
const offensesOf=(doc,eventId)=>Object.values(doc.state.records).filter(r=>r.category==='offense'&&r.sourceEvent===eventId);

test('罪名只由行为类别与对象属性派生：每个 act 都有罪名，越具体越优先，无名单',()=>{
 assert.equal(offenseOf('take').id,'theft');assert.equal(offenseOf('enter').id,'trespass');
 assert.equal(offenseOf('gather').id,'illegal_harvest');assert.equal(offenseOf('destroy').id,'property_damage');
 assert.equal(offenseOf('use').id,'unauthorized_use');assert.equal(offenseOf('detain').id,'unlawful_detention');
 assert.equal(offenseOf('cast',{permit:'mental_magic'}).id,'mental_magic');assert.equal(offenseOf('cast',{permit:'elemental_magic'}).id,'unlicensed_magic');
 // Any thing at all, never seen before, is taken under the same offense.
 assert.equal(offenseOf('take',{id:'item_never_registered_k6',kind:'item'}).id,'theft');
 for(const row of vocabulary.filter(o=>o.act))assert.ok(!row.against||Object.keys(row.against).every(k=>!/id$/i.test(k)),`${row.id} 不按 id 匹配`);
 // Every derived offense can be sentenced through itself or a broader statute.
 const penalties=new Set([...Object.keys(world.rules.law.templates[0].penalties),...Object.keys(world.rules.law.spellConsent.penalties)]);
 for(const row of vocabulary.filter(o=>o.act)){let at=row,seen=0;while(at&&!penalties.has(at.id)&&seen++<5)at=vocabulary.find(o=>o.id===at.broader?.replace(/^offense:/,''));assert.ok(at&&penalties.has(at.id),`${row.id} 有可比附的罚则`);}
});

test('当着林穗拿走她的面包：确实转移、账本守恒，立盗窃并由在场法典受理，她当场反应，后果回指原事件',async()=>{
 const g=game();await call(g,'world_move',{destination:'bld_hw_qingdeng'});
 g.doc.state.npcs.npc_hw_linsui.location='bld_hw_qingdeng';g.doc.state.npcs.npc_hw_linsui.activity='看店';
 const before=g.doc,had=qty(before,'npc_hw_linsui','item_bread');assert.ok(had>0);
 const {eventId,result}=await call(g,'world_propose',{intent:'当面拿走林穗柜上的一个面包',effects:[{op:'transfer',from:account('npc_hw_linsui','item_bread'),to:account('player','item_bread'),qty:1}]});
 assert.equal(result.receipt?.status,'committed',JSON.stringify(result.receipt?.reason));
 assert.equal(qty(g.doc,'npc_hw_linsui','item_bread'),had-1);assert.equal(qty(g.doc,'player','item_bread'),qty(before,'player','item_bread')+1);
 assert.deepEqual(auditLedger(g.doc.ledger),[]);
 const [row]=offensesOf(g.doc,eventId);
 assert.equal(row?.offense,'theft');assert.equal(row.victim,'npc_hw_linsui');assert.ok(row.value>0);assert.ok(row.witnesses.includes('npc_hw_linsui'));
 assert.equal(result.receipt.consequences.find(c=>c.type==='offense')?.record,row.id);
 if(row.case){const legal=g.doc.state.records[row.case];assert.equal(legal.sourceEvent,eventId);assert.equal(legal.offense,'theft');assert.equal(legal.offender,'player');}
 const evidence=Object.values(g.doc.state.relationEvidence??{}).filter(e=>e.sourceEvent===eventId&&e.from==='npc_hw_linsui');
 assert.ok(evidence.some(e=>e.delta.trust<0),'失主当场信任下降');
});

test('物理上做不到的仍然拒绝，理由是物理的：数量不够',async()=>{
 const g=game();await call(g,'world_move',{destination:'bld_hw_qingdeng'});
 const had=qty(g.doc,'npc_hw_linsui','item_bread');
 const out=await g.engine.reduce(g.doc,{tool:'world_propose',args:{intent:'把林穗的面包全拿走',effects:[{op:'transfer',from:account('npc_hw_linsui','item_bread'),to:account('player','item_bread'),qty:had+999}]},eventId:'k6-too-many'}).catch(e=>({error:e}));
 const reason=out.error?.message??out.result?.receipt?.reason??'';
 assert.ok(out.error||out.result?.receipt?.status==='rejected');
 assert.doesNotMatch(reason,/许可|授权|所有者|别人的|权利/);
});
