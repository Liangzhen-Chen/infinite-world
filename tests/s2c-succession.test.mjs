import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,draft} from './probes/harness.mjs';
import {organization,organizationAction,foundOrganization,advanceOrganizations,DUES_PERIOD} from '../server-plugin/organizations.mjs';
import {duelAction,activeDuel,finishDuel} from '../server-plugin/duels.mjs';
import {recordEntityDeath} from '../server-plugin/npc-life.mjs';
import {aliveHoldings} from '../server-plugin/holdings.mjs';
import {standing,adjustStanding} from '../server-plugin/standing.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {spiritAction,checkSpiritSocieties} from '../server-plugin/wildlife-society.mjs';
import {templeCapacity} from '../server-plugin/faith.mjs';
import {isGone} from '../server-plugin/lifecycle-state.mjs';
import {openHoldings} from '../server-plugin/holdings.mjs';
import {reconcileHoldings} from '../server-plugin/holding-sources.mjs';

const A='npc_hw_linsui',B='npc_hw_ayan',C='npc_hw_chenbai',W='npc_hw_gucen';
function scene(){
 const s=setup(),d=draft(s.doc),e=s.engine;d.engine=e;d.original=s.doc;
 d.set(['state','minute'],540);
 for(const id of [A,B,C,W])d.set(['state','npcs',id],{...d.get('state','npcs',id),location:d.get('state','location'),activity:'闲谈',status:'正常',coins:100});
 const id='org_succession',entity={id,name:'清虚观',scope:d.get('state','location'),occupation:'教会',notes:'约斗决定继任'};
 d.set(['state','created',id],entity);foundOrganization(d,e,entity,'found');
 let seq=0;const org=args=>organizationAction.call(e,d,{org:id,...args},`org-${++seq}`);
 org({operation:'org_propose',action:'charter',consent:false});
 for(const m of [A,B,C,W])org({operation:'org_join',member:m,consent:true});
 for(const m of [B,C])org({operation:'org_propose',action:'appoint',member:m,name:'长老'});
 org({operation:'org_deposit',coins:200});org({operation:'org_propose',action:'appoint',member:A,name:'主祭'});
 resyncBooks(e,d.document);
 return {...s,d,e,id,org,view:()=>organization(e,d.get('state'),id)};
}
function gone(s){recordEntityDeath(s.d,s.e,A,540,'自然死亡');}
function challenge(s,extra={}){
 for(const id of [B,C])s.e.byId.get(id).personality={traits:['尚武','争强']};
 return duelAction.call(s.e,s.d,{operation:'duel_challenge',speaker:B,member:C,authority:W,choice:'touch',org:s.id,...extra},'challenge');
}

test('真实死亡关闭首脑权能；保留弟子、公库、私产边界及空缺事件',()=>{
 const s=scene(),before=s.view();gone(s);
 assert.equal(s.view().leader,null);assert.ok(s.view().members.player);
 assert.equal(s.view().treasury,before.treasury);
 assert.equal(aliveHoldings(s.d,{kind:'holds_office',holder:A}).length,0);
 assert.ok(Object.values(s.d.get('state','records')).some(r=>r.category==='organization_vacancy'&&r.org===s.id));
 assert.throws(()=>s.org({operation:'org_propose',speaker:A,action:'withdraw',member:A,coins:10}),/在场且清醒/);
});

test('双 NPC 接受约斗、独立见证与认输；胜者合法接任且结算去重',()=>{
 const s=scene();gone(s);const result=challenge(s),row=s.d.get('state','records',result.duel);
 assert.equal(result.status,'已接受');assert.deepEqual(Object.keys(row.decisions).sort(),[B,C].sort());
 assert.equal(activeDuel(s.d,s.e,C,B)?.id,row.id);
 const ended=duelAction.call(s.e,s.d,{operation:'duel_yield',proposal:row.id,speaker:C,consent:true},'yield');
 assert.equal(ended.winner,B);assert.equal(s.view().leader,B);
 const count=Object.keys(s.d.get('holdings','rows')).length;
 assert.equal(finishDuel(s.d,s.e,row,B,'repeat','认输').duplicate,true);
 assert.equal(Object.keys(s.d.get('holdings','rows')).length,count);
 const pay=s.org({operation:'org_propose',speaker:B,action:'withdraw',member:B,coins:10});
 assert.equal(pay.status,'通过');assert.equal(s.view().treasury,190);
 assert.equal(s.d.get('state','npcs',B,'coins'),110);
});

test('约斗保留拒绝、双方清醒、在场与独立见证门槛，未接受不能结算',()=>{
 const s=scene();gone(s);
 assert.throws(()=>challenge(s,{authority:B}),/独立/);
 s.d.set(['state','npcs',W,'location'],'loc_hw_northwood');
 assert.throws(()=>challenge(s),/在场且清醒/);
 s.d.set(['state','npcs',W,'location'],s.d.get('state','location'));
 s.e.byId.get(C).personality={traits:['和平','谨慎']};
 const r=duelAction.call(s.e,s.d,{operation:'duel_challenge',speaker:B,member:C,authority:W,choice:'death'},'refuse');
 assert.equal(r.status,'已拒绝');
 assert.throws(()=>finishDuel(s.d,s.e,s.d.get('state','records',r.duel),B,'fake','生死已分'),/未接受/);
});

test('依逐人立场离群或留任，成员/容量同步变化，公库不随出走者转移',()=>{
 for(const leave of [true,false]){
  const s=scene();gone(s);
  adjustStanding(s.d,s.e,C,B,leave?-100:30,{sourceEvent:'rival',reason:'争位立场'});
  adjustStanding(s.d,s.e,C,s.id,leave?-100:30,{sourceEvent:'loyalty',reason:'组织立场'});
  adjustStanding(s.d,s.e,W,C,100,{sourceEvent:'follow-c',reason:'支持长老'});
  adjustStanding(s.d,s.e,W,B,-100,{sourceEvent:'oppose-b',reason:'反对长老'});
  const before=templeCapacity(s.e,s.d.get('state'),{id:s.id,seat:s.d.get('state','location')});
  const r=challenge(s);duelAction.call(s.e,s.d,{operation:'duel_yield',proposal:r.duel,speaker:C,consent:true},'yield');
  const after=templeCapacity(s.e,s.d.get('state'),{id:s.id,seat:s.d.get('state','location')});
  assert.equal(Boolean(s.view().members[C]),!leave);assert.equal(Boolean(s.view().members[W]),!leave);
  assert.equal(after.members.length,before.members.length-(leave?2:0));
  assert.equal(aliveHoldings(s.d,{kind:'member_of',holder:C,subject:s.id}).length,leave?0:1);
  assert.equal(s.view().treasury,200);assert.equal(s.d.get('state','npcs',C,'coins'),100);
 }
});

test('公开支持/反对改变当前权威关系一次',()=>{
 const s=scene();gone(s);
 s.org({operation:'org_propose',speaker:B,action:'charter',choice:'vote'});
 // In the vacant elders council both elders must approve the charter.
 const pending=Object.values(s.d.get('state','records')).find(r=>r.category==='organization_proposal'&&r.status==='议事中');
 s.org({operation:'org_vote',proposal:pending.id,speaker:C,opinion:'approve'});
 const b0=standing(s.e,s.d.get('state'),B,'player'),c0=standing(s.e,s.d.get('state'),B,C);
 const p=s.org({operation:'org_propose',action:'appoint',member:B,name:'主祭'});
 s.org({operation:'org_vote',proposal:p.proposal,speaker:C,opinion:'reject'});
 s.org({operation:'org_vote',proposal:p.proposal,speaker:B,opinion:'approve'});
 s.org({operation:'org_vote',proposal:p.proposal,speaker:W,opinion:'approve'});
 assert.equal(s.view().leader,B);
 assert.equal(standing(s.e,s.d.get('state'),B,'player'),b0+5);
 assert.equal(standing(s.e,s.d.get('state'),B,C),c0-5);
 const before=standing(s.e,s.d.get('state'),B,'player');
 advanceOrganizations(s.d,s.e,{before:540,after:1440});
 assert.equal(standing(s.e,s.d.get('state'),B,'player'),before);
});

test('欠费除名与末员退出通过协议；无关组织会籍保留',()=>{
 const s=scene();s.org({operation:'org_propose',speaker:A,action:'charter',coins:5});
 s.d.set(['state','npcs',C,'coins'],0);resyncBooks(s.e,s.d.document);
 advanceOrganizations(s.d,s.e,{before:540,after:3*DUES_PERIOD+540});
 assert.equal(s.view().members[C],undefined);
 assert.equal(aliveHoldings(s.d,{kind:'member_of',holder:C,subject:s.id}).length,0);
 const x=scene();
 for(const member of [B,C,W])x.org({operation:'org_leave',member,consent:true});
 x.org({operation:'org_leave'});x.org({operation:'org_leave',member:A,consent:true});
 assert.equal(x.view(),null);assert.equal(isGone(x.e,x.d,x.id),true);
});

test('精怪成社、退出与末员解散关闭会籍；留守保留结缘，再建不复用消失实体',()=>{
 const s=setup(),d=draft(s.doc),e=s.engine;d.engine=e;d.original=s.doc;
 const home='loc_hw_northwood';d.set(['state','location'],home);
 for(const id of ['monster_spirit_a','monster_spirit_b'])d.set(['state','creatures',id],{
  species:'monster_red_ear_fox',location:home,hp:20,maxHp:20,status:'正常',
  mind:{awakened:{stage:'立意'},settle:{location:home}},companion:{with:'player',following:false,terms:{}}
 });
 checkSpiritSocieties(d,e,0,'form',home);
 const key=`spirit_society:${home}`,entity=d.get('state','records',key,'entity');
 assert.equal(aliveHoldings(d,{kind:'member_of',subject:entity}).length,2);
 const drift=()=>reconcileHoldings(e,d.document);
 assert.deepEqual(drift().missing,[]);assert.deepEqual(drift().extra,[]);
 const legacy=structuredClone(d.document);delete legacy.holdings;
 // A real old document has neither the canonical book nor the new entity key.
 delete legacy.state.records[key].entity;legacy.holdings=openHoldings(e,legacy);
 assert.equal(aliveHoldings({get:(...p)=>p.reduce((v,k)=>v?.[k],legacy)},{kind:'member_of',subject:entity}).length,2);
 spiritAction.call(e,d,{operation:'stay'},'stay','monster_spirit_a');
 assert.ok(d.get('state','creatures','monster_spirit_a','companion'));
 for(const target of ['monster_spirit_a','monster_spirit_b'])spiritAction.call(e,d,{operation:'leave'},`leave:${target}`,target);
 assert.equal(aliveHoldings(d,{kind:'member_of',subject:entity}).length,0);assert.ok(isGone(e,d,entity));
 for(const id of ['monster_spirit_a','monster_spirit_b'])d.set(['state','creatures',id,'mind','settle'],{location:home});
 checkSpiritSocieties(d,e,1440,'refound',home);
 assert.notEqual(d.get('state','records',key,'entity'),entity);assert.ok(isGone(e,d,entity));
 assert.deepEqual(drift().missing,[]);assert.deepEqual(drift().extra,[]);
 recordEntityDeath(d,e,'monster_spirit_b',1440,'自然死亡');
 assert.equal(aliveHoldings(d,{kind:'member_of',holder:'monster_spirit_b'}).length,0);
 assert.deepEqual(drift().missing,[]);assert.deepEqual(drift().extra,[]);
});
