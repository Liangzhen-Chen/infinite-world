import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {relationView,applyNpcRelation,recordNpcRelationEvidence} from '../server-plugin/npc-relations.mjs';
class Draft{constructor(document){this.document=document;this.patches=[];}get(...p){return p.reduce((x,k)=>x?.[k],this.document);}set(path,value){const p={op:'set',path,value};this.document=applyPatches(this.document,[p]);this.patches.push(p);}}
function setup(){
 const npcs=[{id:'a',tier:'full',age:30,flags:{minor:false},relationships:[{with:'b',trust:60,affection:30}]},{id:'b',tier:'full',age:16,flags:{minor:true},relationships:[]}];
 const engine={world:{npcs},byId:new Map(npcs.map(n=>[n.id,n])),resolve:x=>x};
 const document={schemaVersion:2,worldVersion:'relations-test',randomSeed:'relations',state:{minute:100,location:'home',player:{coins:50,age:25},npcs:Object.fromEntries(npcs.map(n=>[n.id,{location:'home',trust:7,affection:4,coins:20,hp:30,inventory:{},relationships:{},developments:[]}])),records:{},obligations:{}}};
 return {engine,document};
}
test('任意sourceEvent、随口记忆、错配双方和类型均不能白加关系，未成年恋爱拒绝',()=>{
 const {engine,document}=setup(),d=new Draft(document);d.set(['memories'],{roof:{content:'我帮助修屋顶',source:'real-looking-id'}});const before=structuredClone(d.document);
 assert.throws(()=>applyNpcRelation(d,engine,{npc:'a',eventType:'帮助',sourceEvent:'roof'},'fake'),/已核验证据/);
 assert.throws(()=>applyNpcRelation(d,engine,{npc:'b',romance:true,eventType:'帮助',sourceEvent:'roof'},'minor'),/未成年/);
 assert.throws(()=>applyNpcRelation(d,engine,{from:'player',to:'b',romanceDelta:1,sourceEvent:'roof'},'reverse_minor'),/未成年/);
 assert.deepEqual(d.document,before);
});
test('NPC之间从正式初始关系增量记账，实际协助完成记录欠谁什么，重复引用不叠加',()=>{
 const {engine,document}=setup();document.state.obligations.help={id:'help',type:'协助',promisor:'b',promisee:'a',content:'核对木工尺寸',status:'待履行'};
 const d=new Draft(document);d.set(['state','obligations','help','status'],'已完成');d.set(['state','obligations','help','completion'],{minute:100,source:'check',success:true});
 recordNpcRelationEvidence(d,engine,document.state,'check',{}, {},'check');
 const relation=relationView(engine,d.get('state'),'a','b');assert.equal(relation.trust,63);assert.equal(relation.affection,30);assert.equal(relation.respect,1);assert.deepEqual(relation.favors.map(x=>[x.debtor,x.creditor,x.what]),[['a','b','核对木工尺寸；依据help的实际完成记录']]);
 const snapshot=structuredClone(d.document);recordNpcRelationEvidence(d,engine,document.state,'check',{}, {},'check');assert.deepEqual(d.document,snapshot);
 const repeat=applyNpcRelation(d,engine,{from:'a',to:'b',eventType:'信守约定',sourceEvent:'help'},'new-id');assert.equal(repeat.changes[0].duplicate,true);assert.deepEqual(d.document,snapshot);
 assert.throws(()=>applyNpcRelation(d,engine,{from:'b',to:'a',eventType:'信守约定',sourceEvent:'help'},'wrong-pair'),/已核验证据/);
 assert.throws(()=>applyNpcRelation(d,engine,{from:'a',to:'b',eventType:'信守约定',sourceEvent:'help',trustDelta:50},'edited'),/幅度/);
 assert.equal(d.get('state','npcs','a','trust'),7,'NPC对玩家的旧字段不受NPC之间关系影响');
});
// A3 causal2 / product principle II.1: the old scalars remain initial values;
// retain trust=2 and affection=3 in the ledger, and assert the old 7/4 stay intact.
test('玩家失约只惩罚真实责任方；NPC按时等候仍获履约证据，旧字段仅作初值',()=>{
 const {engine,document}=setup();document.state.obligations.wait={id:'wait',type:'等候',promisor:'a',promisee:'player',status:'进行中',content:'屋前等候',deadline:120};
 const d=new Draft(document);d.set(['state','minute'],120);d.set(['state','obligations','wait'],{...document.state.obligations.wait,status:'违约',keptBy:['a'],breachedBy:['player'],resolvedAt:120,reason:'玩家未到'});
 recordNpcRelationEvidence(d,engine,document.state,'time',{}, {},'one-long-wait');
 assert.equal(relationView(engine,d.get('state'),'a','player').trust,2);assert.equal(d.get('state','npcs','a','trust'),7);assert.equal(d.get('state','npcs','a','affection'),4);assert.equal(relationView(engine,d.get('state'),'a','player').affection,3);
 assert.equal(relationView(engine,d.get('state'),'player','a').trust,3);assert.equal(relationView(engine,d.get('state'),'player','a').affection,1);
 const other=new Draft({...document,state:{...document.state,minute:110}});other.set(['state','minute'],120);other.set(['state','obligations','wait'],d.get('state','obligations','wait'));recordNpcRelationEvidence(other,engine,document.state,'time',{}, {},'second-short-wait');
 assert.deepEqual(other.document,d.document,'约定证据采用真实约定编号和时间，不依赖外层等待事件编号');
});
test('欠款还清需要实际资金转移，履约关系不改变钱物守恒；假还款不生证据',()=>{
 const {engine,document}=setup();document.state.records.debt={category:'debt',debtor:'player',creditor:'a',amount:10,paid:0,status:'待偿还',deadline:200};
 const d=new Draft(document);d.set(['state','records','debt'],{...document.state.records.debt,status:'已还清',paid:10,paidAt:100});
 recordNpcRelationEvidence(d,engine,document.state,'trade',{payment:'repay'},{debt:'debt',cost:10},'fake');assert.equal(d.get('state','relationEvidence'),undefined);
 d.set(['state','player','coins'],40);d.set(['state','npcs','a','coins'],30);recordNpcRelationEvidence(d,engine,document.state,'trade',{payment:'repay'},{debt:'debt',cost:10},'paid');
 assert.equal(d.get('state','player','coins')+d.get('state','npcs','a','coins'),70);assert.equal(relationView(engine,d.get('state'),'a','player').trust,10);assert.equal(relationView(engine,d.get('state'),'a','player').respect,1);
 assert.deepEqual(d.get('state','npcs','a','inventory'),{});
});
test('畏惧依真实交锋损伤；盗窃关系仅实际识别目击者变化',()=>{
 const {engine,document}=setup(),d=new Draft(document);d.set(['state','npcs','a','hp'],24);
 recordNpcRelationEvidence(d,engine,document.state,'combat',{}, {target:'a',damage:6,targetHp:24},'fight');assert.equal(relationView(engine,d.get('state'),'a','player').fear,2);
 const crime=new Draft(document);crime.set(['state','records','case'],{category:'legal_case',offender:'player',victim:'a',evidence:[{kind:'eyewitness',witness:'b',identified:true}]});
 recordNpcRelationEvidence(crime,engine,document.state,'crime',{}, {target:'a',case:'case',witnesses:['a','b']},'theft');assert.equal(relationView(engine,crime.get('state'),'a','player').trust,7);assert.equal(relationView(engine,crime.get('state'),'b','player').trust,2);
});
// A3 causal / product principles I.4 and II.4: all tiers reject unverified sources;
// absence of a real transfer still produces no relation evidence.
test('non-full characters also reject fabricated relation sources without writes',()=>{
 const {engine,document}=setup();for(const npc of engine.world.npcs)delete npc.tier;
 const d=new Draft(document);assert.throws(()=>applyNpcRelation(d,engine,{npc:'a',eventType:'帮助',sourceEvent:'old'},'old'),{code:'E-ACTION-PRECONDITION'});assert.deepEqual(recordNpcRelationEvidence(d,engine,document.state,'trade',{}, {cost:5},'old'),[]);assert.deepEqual(d.document,document);
});
test('实际事件交易幂等，重启与导出保留关系证据，撤销恢复钱与原关系',async t=>{
 const {engine,document}=setup(),root=await fs.mkdtemp(path.join(tmpRoot(),'npc-relations-'));t.after(async()=>{assert.ok(path.resolve(root).startsWith(path.resolve(tmpRoot())+path.sep+'npc-relations-'));await fs.rm(root,{recursive:true,force:true});});
 const reducer=async(doc,input)=>{const d=new Draft(doc);d.set(['state','player','coins'],doc.state.player.coins-5);d.set(['state','npcs','a','coins'],doc.state.npcs.a.coins+5);recordNpcRelationEvidence(d,engine,doc.state,'trade',{seller:'a'},{buyer:'player',seller:'a',cost:5},input.eventId);return {patches:d.patches,result:{ok:true}};};
 const storage=new CampaignStorage(root,{reducer});await storage.create({id:'relations',worldVersion:document.worldVersion,document});
 const event={id:'paid',anchor:'paid',input:{eventId:'paid'}};await storage.transact('relations',event,reducer);await storage.transact('relations',event,reducer);
 const bought=(await storage.read('relations')).document;assert.equal(bought.state.player.coins,45);assert.equal(relationView(null,bought.state,'a','player').trust,8);assert.equal(Object.keys(bought.state.relationEvidence).length,1);
 const restarted=new CampaignStorage(root,{reducer});assert.deepEqual((await restarted.read('relations')).document,bought);assert.deepEqual((await restarted.import(await restarted.export('relations'),'copy')).document,bought);
 await restarted.reconcile('relations',[],null);assert.deepEqual((await restarted.read('relations')).document,document);
});
test('同一人物对每日现金交易只加一次信任，翌日真实付款才能再次计入',()=>{
 const {engine,document}=setup();let current=document;
 const buy=(id,minute)=>{const d=new Draft(current);d.set(['state','minute'],minute);d.set(['state','player','coins'],current.state.player.coins-1);d.set(['state','npcs','a','coins'],current.state.npcs.a.coins+1);recordNpcRelationEvidence(d,engine,current.state,'trade',{seller:'a'},{seller:'a',buyer:'player',cost:1},id);current=d.document;};
 for(let i=0;i<20;i++)buy(`small_${i}`,100+i);assert.equal(relationView(null,current.state,'a','player').trust,8);assert.equal(Object.keys(current.state.relationEvidence).length,1);assert.equal(current.state.player.coins+current.state.npcs.a.coins,70);
 buy('next_day',1440);assert.equal(relationView(null,current.state,'a','player').trust,9);assert.equal(Object.keys(current.state.relationEvidence).length,2);
});
test('逾期后补款增加敬重但不抵消已经记下的失信',()=>{
 const {engine,document}=setup();document.state.records.late={category:'debt',debtor:'player',creditor:'a',amount:10,paid:0,status:'待偿还',deadline:110};
 const overdue=new Draft(document);overdue.set(['state','minute'],120);overdue.set(['state','records','late'],{...document.state.records.late,status:'逾期',overdueAt:110});recordNpcRelationEvidence(overdue,engine,document.state,'time',{}, {},'late');assert.equal(relationView(engine,overdue.get('state'),'a','player').trust,2);
 const paid=new Draft(overdue.document);paid.set(['state','records','late'],{...overdue.get('state','records','late'),status:'已还清',paid:10,paidAt:120});paid.set(['state','player','coins'],40);paid.set(['state','npcs','a','coins'],30);recordNpcRelationEvidence(paid,engine,overdue.document.state,'trade',{payment:'repay'},{debt:'late',cost:10},'repay');
 assert.equal(relationView(engine,paid.get('state'),'a','player').trust,2);assert.equal(relationView(engine,paid.get('state'),'a','player').respect,1);assert.equal(paid.get('state','relationEvidence','debt:late:paid').eventType,'逾期补款');
});
