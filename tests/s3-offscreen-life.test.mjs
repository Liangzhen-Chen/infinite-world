import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,DAY,draft} from './probes/harness.mjs';
import {advancePets} from '../server-plugin/pets.mjs';
import {affairs} from '../server-plugin/ui-affairs.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';

import {custodyFixture,privateFarmScenario} from './probes/s3-offscreen.mjs';
test('E12-4: 托养360天按小时实扣受托人的食物，所有权保留，实际领回关闭服务',async()=>{
 const S=custodyFixture();let doc=(await S.run(S.doc,'world_pet',{operation:'custody',target:S.id,keeper:S.keeper,days:360,consent:true},'custody-sign')).document;
 const id=doc.state.pets[S.id].custody.obligation,before=doc.state.npcs[S.keeper].inventory.item_ration.quantity,food=doc.state.inventory.item_ration.quantity;
 const d=draft(doc);advancePets(d,S.engine,doc.state.minute+360*DAY);doc=d.document;
 assert.ok(doc.state.creatures[S.id].hp>0);assert.equal(doc.state.creatures[S.id].owner,'player');
 assert.ok(doc.state.npcs[S.keeper].inventory.item_ration.quantity<before);assert.equal(doc.state.inventory.item_ration.quantity,food);
 doc=(await S.run(doc,'world_pet',{operation:'collect',target:S.id},'custody-return')).document;
 assert.equal(obligationView(doc.state,id).closed,true);assert.equal(doc.state.pets[S.id].following,true);
});
test('E12-4: 拒绝重复托养零写；受托人搬走或死亡不凭空喂养，也不消灭宠物',async()=>{
 const S=custodyFixture(),signed=(await S.run(S.doc,'world_pet',{operation:'custody',target:S.id,keeper:S.keeper,days:360,consent:true},'custody-sign')).document;
 const before=structuredClone(signed);
 await assert.rejects(S.run(signed,'world_pet',{operation:'custody',target:S.id,keeper:S.keeper,days:1,consent:true},'custody-duplicate'),/已有/);assert.deepEqual(signed,before);
 for(const change of [n=>{n.location=null;n.scheduleTravel={migration:'custody-relocation',depart:signed.state.minute,arrive:signed.state.minute+DAY};},n=>n.status='死亡']){
  const doc=structuredClone(signed);change(doc.state.npcs[S.keeper]);
  if(doc.state.npcs[S.keeper].location===doc.state.creatures[S.id].location)doc.state.npcs[S.keeper].location='loc_ms';
  const food=doc.state.npcs[S.keeper].inventory.item_ration.quantity,d=draft(doc);advancePets(d,S.engine,doc.state.minute+60);
  assert.equal(d.document.state.pets[S.id].custody.status,'interrupted');assert.equal(d.document.state.npcs[S.keeper].inventory.item_ration.quantity,food);
  assert.equal(d.document.state.creatures[S.id].owner,'player');assert.ok(d.document.state.creatures[S.id].hp>0);
 }
});
test('R13: 规范义务与旧投影只显示一次，履行结束仍显示既欠余额',()=>{
 const S=setup(),s=S.doc.state;
 s.obligations.example={id:'example',runtimeVersion:1,kind:'rent',debtor:'player',creditor:'npc_hw_linsui',amount:40,paid:10,createdAt:s.minute-100,deadline:s.minute-1,endedAt:s.minute-1,legacyRecord:'old-rent'};
 s.records['old-rent']={category:'debt',obligation:'example',debtor:'player',creditor:'npc_hw_linsui',amount:40,paid:10};
 const rows=affairs(S.engine,S.doc).obligations.filter(r=>['example','old-rent'].includes(r.id));
 assert.equal(rows.length,1);assert.equal(rows[0].outstanding,30);assert.equal(rows[0].active,false);
});
test('E12-5: 私田播种实扣粮种，公共田仍生产，离开360天未收私田腐烂而不进入行囊',async()=>{
 await privateFarmScenario();
});
