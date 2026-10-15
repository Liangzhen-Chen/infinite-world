import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {PatchCursor,applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {npcCrimePlan,commitNpcCrime,advanceNpcJustice,advanceNpcCrime} from '../server-plugin/npc-crime.mjs';
import {evidenceScore,advanceLaw} from '../server-plugin/law.mjs';
import {advocateService} from '../server-plugin/legal-representation.mjs';
import {npcRumors} from '../server-plugin/npc-rumors.mjs';
import {returnChanges} from '../server-plugin/return-summary.mjs';
import {personConstraint} from '../server-plugin/entity-view.mjs';
const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const actor='npc_hw_hezhou',victim='npc_hw_linsui',witness='npc_hw_wushuo',guard='npc_hw_gucen',judge='npc_hw_chenbai',court='bld_hw_council',scene='bld_hw_qingdeng';
const money=doc=>doc.state.player.coins+Object.values(doc.state.npcs).reduce((s,n)=>s+(n.coins??0),0)+Object.values(doc.state.workshopFunds??{}).reduce((s,n)=>s+n,0)+Object.values(doc.state.records).filter(r=>['legal_treasury','legal_deposit'].includes(r.category)).reduce((s,r)=>s+(r.coins??0),0);
function cursor(doc){const c=new PatchCursor(doc);return{get document(){return c.expose(c.root);},get:(...p)=>c.expose(p.reduce((v,k)=>v?.[k],c.root)),set:(p,v)=>c.apply({op:'set',path:p,value:v}),remove:p=>c.apply({op:'delete',path:p}),say:()=>{}};}
function setup(){
 const w=structuredClone(world);for(const n of w.npcs)delete n.schedule;
 w.rules.law.npcCrime.dailyChance=1;w.npcs.find(n=>n.id===actor).personality={drive:'投机贪财，冲动好斗'};
 const lawyer=w.npcs.find(n=>n.age>=25&&n.tier==='full'&&![actor,victim,witness,guard,judge].includes(n.id));lawyer.occupation='讼师';lawyer.skills={skill_literacy:{proficiency:400}};
 const engine=new WorldEngine(w),document=engine.createCharacter(seed,{},'npc-crime-L1');
 document.state.minute=600;document.state.location='loc_bs';document.state.player.coins=1000;
 for(const n of Object.values(document.state.npcs)){n.location='loc_capital';n.activity='休息';n.status='正常';}
 for(const id of [actor,victim,witness])Object.assign(document.state.npcs[id],{location:scene,activity:'交谈',coins:id===actor?0:100});
 for(const id of [guard,judge])Object.assign(document.state.npcs[id],{location:court,activity:'当值'});
 document.state.npcs[actor].intelligence={level:3,growth:0};document.state.npcs[actor].goals={short:[{source:'need',need:'money',status:'进行中',deadlineDay:30,steps:[]}]};
 document.state.npcs[lawyer.id].occupation='讼师';document.state.npcs[lawyer.id].location=court;
 return{engine,document,lawyer:lawyer.id};
}
test('需求、立场、灵智与处境选择四类犯罪，守法、幼者及在押者不被强制犯罪',()=>{
 const {engine,document}=setup(),s=document.state;
 assert.equal(npcCrimePlan(engine,s,actor).offense,'fraud');s.npcs[actor].intelligence.level=1;assert.equal(npcCrimePlan(engine,s,actor).offense,'theft');
 s.npcs[actor].goals.short[0].need='safety';s.records[`standing:${actor}:${victim}`]={value:-80};assert.equal(npcCrimePlan(engine,s,actor).offense,'assault');
 s.npcs[actor].goals.short[0].need='money';s.npcs[actor].intelligence.level=2;s.npcs[actor].location='loc_hw_gate';s.npcs[victim].location='loc_hw_gate';s.npcs[actor].inventory.item_ember_core=1;assert.equal(npcCrimePlan(engine,s,actor).offense,'smuggling');
 engine.byId.get(actor).personality={principle:'正直守法'};assert.equal(npcCrimePlan(engine,s,actor),null);
 engine.byId.get(actor).age=12;assert.equal(npcCrimePlan(engine,s,actor),null);
});
test('离屏偷盗真实转账，独立目击沿路报案，同一证据门槛审判与赔偿，不重复扣款',()=>{
 const {engine,document}=setup(),total=money(document),d=cursor(document),key=commitNpcCrime(d,engine,{actor,victim,offense:'theft',need:'money',intelligence:1},600);
 assert.equal(money(d.document),total);assert.equal(d.get('state','npcs',actor,'coins'),20);assert.equal(d.get('state','npcs',victim,'coins'),80);assert.equal(d.get('state','records',key,'reported'),false);
 const deadline=d.get('state','records',key,'npcCrime','reportAt');assert.ok(deadline>600);
 advanceNpcJustice(d,engine,deadline-1);assert.equal(d.get('state','records',key,'reported'),false);
 d.set(['state','minute'],deadline);advanceNpcJustice(d,engine,deadline);assert.equal(evidenceScore(d,d.get('state','records',key)),2);
 d.set(['state','npcs',actor,'location'],court);d.set(['state','npcs',actor,'coins'],100);const funded=money(d.document);
 const hearing=d.get('state','records',key,'nextHearing');d.set(['state','minute'],hearing);advanceNpcJustice(d,engine,hearing);
 assert.equal(d.get('state','records',key,'status'),'已结案');assert.equal(d.get('state','records',`legal_deposit:${key}`,'coins'),20);assert.equal(money(d.document),funded);
 d.set(['state','npcs',victim,'location'],court);advanceNpcJustice(d,engine,hearing+1);assert.equal(d.get('state','records',`legal_deposit:${key}`,'claimed'),true);
 const after=structuredClone(d.document);advanceNpcJustice(d,engine,hearing+2);assert.deepEqual(d.document,after);assert.equal(commitNpcCrime(d,engine,{actor,victim,offense:'theft'},600),null);
});
test('一名见证不足定罪，无见证不泄漏传闻，未成年不进入离屏犯罪',()=>{
 const {engine,document}=setup();document.state.npcs[witness].location='loc_capital';const d=cursor(document),key=commitNpcCrime(d,engine,{actor,victim,offense:'theft'},600);
 const report=d.get('state','records',key,'npcCrime','reportAt');d.set(['state','minute'],report);advanceNpcJustice(d,engine,report);d.set(['state','minute'],report+60);advanceNpcJustice(d,engine,report+60);
 assert.equal(d.get('state','records',key,'status'),'证据不足');assert.equal(d.get('state','records',key,'judgment'),undefined);
 const f=setup();f.document.state.npcs[victim].activity='熟睡';f.document.state.npcs[witness].location='loc_capital';const hidden=cursor(f.document),k=commitNpcCrime(hidden,f.engine,{actor,victim,offense:'theft'},600);
 assert.deepEqual(hidden.get('state','records',k,'witnesses'),[]);assert.equal(hidden.get('state','records',k,'npcCrime','reportAt'),null);
 assert.deepEqual(returnChanges(f.engine,hidden.get('state'),'loc_hw',{from:0,to:700}),[]);
});
test('斗殴与私运有实际伤害或货物转移，NPC事件记正确行为人并进入传闻和返场',()=>{
 for(const offense of ['assault','fraud','smuggling']){
  const {engine,document}=setup();if(offense==='smuggling'){for(const id of [actor,victim,witness])document.state.npcs[id].location='loc_hw_gate';document.state.npcs[actor].inventory.item_ember_core=1;}
  const d=cursor(document),key=commitNpcCrime(d,engine,{actor,victim,offense,need:'money',intelligence:3,item:'item_ember_core'},600);assert.ok(key);
  if(offense==='assault')assert.ok(d.get('state','npcs',victim,'hp')<d.get('state','npcs',victim,'maxHp'));
  if(offense==='smuggling'){assert.equal(engine.quantity(d,actor,'item_ember_core'),0);assert.equal(engine.quantity(d,victim,'item_ember_core'),1);}
  const event=d.get('state','records',`world_event:npc_crime:${actor}:0`);assert.equal(event.actor,actor);
  const rumors=npcRumors(engine,witness,d.document);assert.ok(rumors.some(r=>r.id?.startsWith('rumor_event:')||r.rumor?.startsWith('rumor_event:')));
  const lines=returnChanges(engine,d.get('state'),'loc_hw',{from:0,to:700});assert.ok(lines.some(l=>l.includes(engine.byId.get(actor).name)));
  assert.ok(d.get('state','npcs',witness,'memoryStream').some(m=>m.eventRumor&&m.content.includes(engine.byId.get(actor).name)&&!m.content.includes(document.state.player.name)));
 }
});
test('NPC证据充分但未到案会通缉，缺钱劳役约束本人，玩家离开不终止NPC刑期',()=>{
 const {engine,document}=setup(),d=cursor(document),key=commitNpcCrime(d,engine,{actor,victim,offense:'theft'},600),at=d.get('state','records',key,'npcCrime','reportAt');
 d.set(['state','minute'],at);advanceNpcJustice(d,engine,at);d.set(['state','minute'],at+5000);advanceNpcJustice(d,engine,at+5000);
 assert.ok(d.get('state','records',key,'wanted'));assert.equal(d.get('state','records',key,'judgment'),undefined);
 d.set(['state','npcs',actor,'location'],court);d.set(['state','npcs',actor,'coins'],0);d.set(['state','minute'],at+5001);advanceNpcJustice(d,engine,at+5001);assert.equal(d.get('state','records',key,'status'),'服役中');
 const lock=d.get('state','records',`legal_custody:${key}`);assert.equal(lock.subject,actor);assert.ok(personConstraint(engine,d.get('state'),actor));
 advanceLaw(d,lock.expires-1,engine);assert.equal(d.get('state','records',`legal_custody:${key}`,'status'),'生效');
 advanceLaw(d,lock.expires,engine);assert.equal(d.get('state','records',key,'status'),'待赔偿');assert.equal(personConstraint(engine,{...d.get('state'),minute:lock.expires},actor),null);
});
test('讼师费用实付、技能减罚且不减赔偿，缺证不获定罪，重复委托或改业不能沿用服务',async()=>{
 const f=setup(),{engine,lawyer}=f;let doc=f.document;doc.state.location=court;
 doc.state.records['legal_case:client']={category:'legal_case',id:'legal_case:client',law:'law_hw_property',offender:'player',victim,offense:'theft',value:20,reported:true,status:'已报案',witnesses:[],evidence:[{kind:'confession',subject:'player'}]};
 const before=money(doc),service=advocateService(engine,doc.state,lawyer);assert.ok(service.fee>0);
 const hired=await engine.reduce(doc,{tool:'world_law',args:{operation:'hire_advocate',case:'legal_case:client',authority:lawyer},eventId:'hire'});doc=applyPatches(doc,hired.patches);assert.equal(money(doc),before);assert.equal(doc.state.records['legal_case:client'].representation.paid,service.fee);
 await assert.rejects(engine.reduce(doc,{tool:'world_law',args:{operation:'hire_advocate',case:'legal_case:client',authority:lawyer},eventId:'hire-again'}),/重复/);
 const heard=await engine.reduce(doc,{tool:'world_law',args:{operation:'hear',case:'legal_case:client',authority:judge},eventId:'hear'});const j=heard.result.judgment;assert.equal(j.fine,24);assert.equal(j.compensation,20);assert.equal(j.evidenceScore,2);
 doc.state.npcs[lawyer].occupation='小贩';assert.equal(advocateService(engine,doc.state,lawyer),null);
 const noEvidence=structuredClone(doc);noEvidence.state.records['legal_case:client'].evidence=[];const no=await engine.reduce(noEvidence,{tool:'world_law',args:{operation:'hear',case:'legal_case:client',authority:judge},eventId:'no-proof'});assert.equal(no.result.convicted,false);
});
test('推进注册表触发离屏来源，当前现场不结算，旧回执不补造犯罪；重启存档保留同一案件',async t=>{
 const {engine,document}=setup();document.state.minute=599;
 const result=await engine.reduce(document,{tool:'world_time',args:{minutes:2},eventId:'crime-tick'}),after=applyPatches(document,result.patches);
 const crimes=Object.values(after.state.records).filter(r=>r.category==='legal_case'&&r.npcCrime);assert.ok(crimes.some(r=>r.offender===actor));assert.equal(result.result.npcCrimeVersion,1);
 assert.deepEqual((await engine.reduce(document,{tool:'world_time',args:{minutes:2},eventId:'crime-tick'},{replay:true,result:result.result})).patches,result.patches);
 const old={...result.result};delete old.npcCrimeVersion;const replay=await engine.reduce(document,{tool:'world_time',args:{minutes:2},eventId:'crime-tick'},{replay:true,result:old});assert.ok(!Object.values(applyPatches(document,replay.patches).state.records).some(r=>r.npcCrime));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'l1-npc-crime-'));t.after(()=>{const target=path.resolve(dir);if(!target.startsWith(path.resolve(os.tmpdir())+path.sep+'l1-npc-crime-'))throw Error('临时目录边界错误');return fs.rm(target,{recursive:true,force:true});});
 const reducer=(doc,input,options)=>engine.reduce(doc,input,options),store=new CampaignStorage(dir,{reducer});await store.create({id:'npc-crime',worldVersion:engine.world.version,document});
 await store.transact('npc-crime',{id:'crime-tick',anchor:'crime-tick',input:{tool:'world_time',args:{minutes:2},eventId:'crime-tick'}},reducer);
 assert.deepEqual((await store.read('npc-crime')).document,after);assert.deepEqual((await new CampaignStorage(dir,{reducer}).read('npc-crime')).document,after);
 assert.deepEqual((await store.import(await store.export('npc-crime'),'npc-crime-copy')).document,after);assert.deepEqual((await store.reconcile('npc-crime',[])).document,document);
 const local=setup();local.document.state.location=scene;const d=cursor(local.document);advanceNpcCrime(d,local.engine,{before:599,after:601});assert.ok(!Object.values(d.get('state','records')).some(r=>r.npcCrime));
});
