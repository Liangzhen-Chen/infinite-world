import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,HOST,SEAT,T} from './helpers/faith.mjs';
import {personView} from '../server-plugin/entity-view.mjs';
import {groupAccountView} from '../server-plugin/group-account.mjs';
import {recordDisciplineBreach} from '../server-plugin/training.mjs';
import {draft} from './helpers/faith.mjs';

test('原师门入门沿同一次已付仪式接信仰与成员，不重复收费、不冒领主持资格',async()=>{
 const s=fixture(),coins=s.doc.state.player.coins,host=s.doc.state.npcs[HOST].coins;
 const args={operation:'initiate',profession:'profession_taoist',teacher:HOST,institution:SEAT};
 const r=await s.run(args,{tool:'world_profession'});
 assert.equal(r.initiated,true);assert.equal(s.doc.state.player.coins,coins-12);
 assert.equal(s.doc.state.npcs[HOST].coins,host+12);assert.equal(s.doc.state.minute,600);
 assert.equal(personView(s.engine,s.doc.state,'player').faith.value.temple,T);
 assert.equal(groupAccountView(s.engine,s.doc.state,T).coins,0,'原训练费用仍归原导师');
 assert.ok(s.doc.state.records[`organization:${T}`].members.player);
 const before=structuredClone(s.doc);await assert.rejects(s.run(args,{tool:'world_profession'}),/已经入门/);assert.deepEqual(s.doc,before);
 await assert.rejects(s.run({...args,operation:'ritual_officiate',deity:'deity_bank'},{tool:'world_profession'}),/实际职业/);
 recordDisciplineBreach(draft(s),s.engine,'theft','known-theft');
 assert.equal(s.doc.state.player.faith.lastBreach,s.doc.state.minute);
 assert.equal(s.doc.state.careers.profession_taoist.initiation.status,'违戒');
});

test('旧世界未登记RW07仍使用原信仰入门，不补造组织与新收支',async()=>{
 const s=fixture();delete s.engine.rules.faith;
 await s.run({operation:'initiate',profession:'profession_taoist',teacher:HOST,institution:SEAT},{tool:'world_profession'});
 assert.equal(s.doc.state.player.faith.deity,'deity_bank');assert.equal(s.doc.state.player.faith.temple,undefined);
 assert.equal(s.doc.state.records[`organization:${T}`],undefined);
});
