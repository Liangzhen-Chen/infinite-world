import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches} from '../server-plugin/storage.mjs';

const sender='npc_hw_linsui',destination='bld_hw_council',item='item_bread';
const qty=row=>typeof row==='number'?row:row?.quantity??0;
async function setup(){
 const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
 world.npcs.find(n=>n.id===sender).schedule={default:[{start:0,end:1440,location:'bld_hw_qingdeng',activity:'营业',services:['trade']}]};
 world.routes.find(r=>[r.from,r.to].includes('bld_hw_qingdeng')).toll=2;
 const engine=new WorldEngine(world),document=engine.initialFromLegacy(legacy,'courier-test');
 const route=engine.route(document.state.location,destination,'walk',document.state.minute,document.randomSeed);
 const promise={type:'送货',promisor:sender,item,quantity:2,location:destination,deadline:document.state.minute+route.minutes+10,content:'把两份面包送到村务屋交给我'};
 const run=async(doc,tool,args,id,options={})=>{const output=await engine.reduce(doc,{tool,args,eventId:id},options);return{doc:applyPatches(doc,output.patches),result:output.result,patches:output.patches};};
 return{world,engine,document,route,promise,run};
}

test('NPC送货按真实路线在途，扣本人路费，到约定地点按时当面交付真实货物一次',async()=>{
 const {engine,document,route,promise,run}=await setup(),created=await run(document,'world_promise',promise,'delivery');
 assert.equal(created.result.obligation.deliveryVersion,1);assert.deepEqual(created.doc.state.npcs[sender].inventory,document.state.npcs[sender].inventory);assert.equal(created.doc.state.npcs[sender].coins,document.state.npcs[sender].coins);
 await assert.rejects(run(created.doc,'world_trade',{seller:sender,item,quantity:1},'conflict'),/冲突/);
 const started=await run(created.doc,'world_time',{minutes:1},'start');assert.equal(started.doc.state.npcs[sender].location,null);assert.equal(started.doc.state.npcs[sender].scheduleTravel.to,destination);assert.deepEqual(started.doc.state.npcs[sender].scheduleTravel.edges,route.edges);assert.equal(started.doc.state.npcs[sender].coins,document.state.npcs[sender].coins-route.cost);
 const arrived=await run(started.doc,'world_move',{destination},'player-arrives');assert.equal(arrived.doc.state.npcs[sender].location,destination);assert.equal(qty(arrived.doc.state.inventory[item]),qty(document.state.inventory[item]));
 const delivered=await run(arrived.doc,'world_time',{minutes:promise.deadline-arrived.doc.state.minute},'due');assert.equal(delivered.doc.state.obligations.obl_delivery.status,'已完成');assert.equal(delivered.doc.state.obligations.obl_delivery.resolvedAt,promise.deadline);
 assert.equal(qty(delivered.doc.state.inventory[item]),qty(document.state.inventory[item])+2);assert.equal(qty(delivered.doc.state.npcs[sender].inventory[item]),qty(document.state.npcs[sender].inventory[item])-2);
 assert.ok(delivered.result.notices.some(row=>row.type==='obligations'&&row.text.includes('已完成')));assert.ok(delivered.doc.state.npcs[sender].memoryStream.some(row=>row.content.includes('已完成')&&row.minute===promise.deadline));
 const later=await run(delivered.doc,'world_time',{minutes:5},'later');assert.equal(qty(later.doc.state.inventory[item]),qty(delivered.doc.state.inventory[item]));assert.equal(qty(later.doc.state.npcs[sender].inventory[item]),qty(delivered.doc.state.npcs[sender].inventory[item]));
});

test('收件人另去他处时NPC仍到约定地点，不全知追踪、不隔空给物，并记收件人未到',async()=>{
 const {document,promise,run}=await setup(),created=await run(document,'world_promise',promise,'delivery');
 const elsewhere=await run(created.doc,'world_move',{destination:'bld_hw_forge'},'elsewhere');
 const due=await run(elsewhere.doc,'world_time',{minutes:promise.deadline-elsewhere.doc.state.minute},'due');
 assert.equal(due.doc.state.npcs[sender].location,destination);assert.equal(due.doc.state.obligations.obl_delivery.location,destination);assert.equal(due.doc.state.obligations.obl_delivery.status,'违约');assert.deepEqual(due.doc.state.obligations.obl_delivery.breachedBy,['player']);assert.match(due.doc.state.obligations.obl_delivery.reason,/收件人未在/);
 assert.equal(qty(due.doc.state.inventory[item]),qty(document.state.inventory[item]));assert.equal(qty(due.doc.state.npcs[sender].inventory[item]),qty(document.state.npcs[sender].inventory[item]));
});

test('移动开始预写目的地不冒充到场，途中经过截止时刻不能提前收货',async()=>{
 const {world,document,route,promise,run}=await setup(),created=await run(document,'world_promise',{...promise,deadline:540+route.minutes+2},'delivery');
 const departed=await run(created.doc,'world_move',{destination:'loc_hw'},'leave');
 // This isolated route fixture makes the receiver's second leg longer than
 // the agreed delivery window; the courier already departed on its own route.
 const edge=world.routes.find(r=>[r.from,r.to].includes(destination));edge.lengthKm=2;
 const late=await run(departed.doc,'world_move',{destination},'late');
 assert.equal(late.doc.state.location,destination);assert.equal(late.doc.state.obligations.obl_delivery.status,'违约');assert.match(late.doc.state.obligations.obl_delivery.reason,/仍在途中/);assert.deepEqual(late.doc.state.obligations.obl_delivery.breachedBy,['player']);assert.equal(qty(late.doc.state.inventory[item]),qty(document.state.inventory[item]));
});

test('NPC对NPC送货仍要求双方真实到场，收件人的日程没有被送货约定占用',async()=>{
 const {world,document,promise,run}=await setup(),receiver='npc_hw_chenbai';
 document.state.npcs[receiver].location=document.state.location;
 world.npcs.find(n=>n.id===receiver).schedule={default:[{start:0,end:541,location:document.state.location,activity:'交谈',services:[]},{start:541,end:1440,location:destination,activity:'办公',services:[]}]};
 const created=await run(document,'world_promise',{...promise,promisee:receiver},'delivery');
 const done=await run(created.doc,'world_time',{minutes:promise.deadline-540},'due');assert.equal(done.doc.state.obligations.obl_delivery.status,'已完成');assert.equal(done.doc.state.npcs[receiver].location,destination);
 assert.equal(qty(done.doc.state.npcs[receiver].inventory[item]),qty(document.state.npcs[receiver].inventory[item])+2);assert.equal(qty(done.doc.state.inventory[item]),qty(document.state.inventory[item]));
});

test('封路、失能或履行时缺货会违约；拒绝无货、远程承诺和擅入私宅且不扣费',async()=>{
 const {world,document,promise,run}=await setup();
 for(const args of [{...promise,quantity:99999},{...promise,promisor:'npc_hw_wushuo'},{...promise,location:'bld_hw_home_15'}]){const snapshot=structuredClone(document);await assert.rejects(run(document,'world_promise',args,'bad'));assert.deepEqual(document,snapshot);}
 const created=await run(document,'world_promise',promise,'delivery');
 for(const change of [d=>d.state.npcs[sender].status='患病',d=>d.state.npcs[sender].inventory[item]=0]){
  const isolated=structuredClone(created.doc);change(isolated);const due=await run(isolated,'world_time',{minutes:promise.deadline-540},'due');assert.equal(due.doc.state.obligations.obl_delivery.status,'违约');assert.equal(qty(due.doc.state.inventory[item]),qty(document.state.inventory[item]));
 }
 for(const edge of world.routes)edge.closedSeasons=[0,1,2,3];
 const blocked=await run(created.doc,'world_time',{minutes:promise.deadline-540},'closed');assert.equal(blocked.doc.state.obligations.obl_delivery.status,'违约');assert.equal(blocked.doc.state.npcs[sender].location,document.state.location);assert.equal(blocked.doc.state.npcs[sender].coins,document.state.npcs[sender].coins);
});

test('长等待按交付时刻结算，短步进钱物/路线/约定一致；之后正常返程',async()=>{
 const {document,promise,run}=await setup(),created=await run(document,'world_promise',promise,'delivery'),arrived=await run(created.doc,'world_move',{destination},'arrive');
 const duration=promise.deadline-arrived.doc.state.minute+8,once=await run(arrived.doc,'world_time',{minutes:duration},'long');let split=arrived.doc;
 for(let i=0;i<duration;i++)split=(await run(split,'world_time',{minutes:1},`step-${i}`)).doc;
 assert.deepEqual(split.state.obligations,once.doc.state.obligations);assert.deepEqual(split.state.inventory,once.doc.state.inventory);
 for(const field of ['inventory','coins','location','activity','scheduleTravel'])assert.deepEqual(split.state.npcs[sender][field],once.doc.state.npcs[sender][field],field);
 assert.equal(once.doc.state.obligations.obl_delivery.status,'已完成');assert.equal(once.doc.state.npcs[sender].location,document.state.location);
});

test('延后送货提前取消不扣费，已承诺后路费不足或道路变为私宅不能强行启程',async()=>{
 const {world,document,promise,run}=await setup(),future={...promise,start:550,deadline:580};
 const created=await run(document,'world_promise',future,'delivery');assert.equal(created.doc.state.obligations.obl_delivery.status,'待履行');
 const cancelled=await run(created.doc,'world_promise',{operation:'cancel',obligation:'obl_delivery'},'cancel');
 const later=await run(cancelled.doc,'world_time',{minutes:40},'later');assert.equal(later.doc.state.obligations.obl_delivery.status,'取消');assert.equal(later.doc.state.npcs[sender].coins,document.state.npcs[sender].coins);assert.deepEqual(later.doc.state.npcs[sender].inventory,document.state.npcs[sender].inventory);
 const poor=structuredClone(created.doc);poor.state.npcs[sender].coins=0;
 const due=await run(poor,'world_time',{minutes:40},'poor');assert.equal(due.doc.state.obligations.obl_delivery.status,'违约');assert.equal(due.doc.state.npcs[sender].coins,0);assert.equal(due.doc.state.npcs[sender].location,document.state.location);assert.deepEqual(due.doc.state.npcs[sender].inventory,document.state.npcs[sender].inventory);
 // The public junction turns private after agreement. Departure must check
 // the actual route again rather than trusting its earlier feasibility.
 world.locations.find(row=>row.id==='loc_hw').access={mode:'private',requiresConsent:true,residents:[]};
 const denied=await run(created.doc,'world_time',{minutes:40},'private-route');assert.equal(denied.doc.state.obligations.obl_delivery.status,'违约');assert.equal(denied.doc.state.npcs[sender].location,document.state.location);assert.equal(denied.doc.state.npcs[sender].coins,document.state.npcs[sender].coins);
});

test('在途存档重启、重复事件、导出导入和撤销保留一次扣费与一次交物',async t=>{
 const {engine,document,promise,run}=await setup(),directory=await fs.mkdtemp(path.join(tmpRoot(),'fields-courier-'));
 t.after(async()=>{assert.ok(path.resolve(directory).startsWith(path.resolve(tmpRoot())+path.sep+'fields-courier-'));await fs.rm(directory,{recursive:true,force:true});});
 const reducer=(doc,input,options)=>engine.reduce(doc,input,options);let store=new CampaignStorage(directory,{reducer});await store.create({id:'courier',worldVersion:document.worldVersion,document});
 const transact=(id,tool,args)=>store.transact('courier',{id,anchor:id,input:{tool,args,eventId:id}},reducer);
 await transact('delivery','world_promise',promise);await transact('start','world_time',{minutes:1});const travelling=(await store.read('courier')).document;assert.equal(travelling.state.npcs[sender].location,null);
 store=new CampaignStorage(directory,{reducer});assert.deepEqual((await store.read('courier')).document,travelling);
 await transact('arrive','world_move',{destination});const beforeDue=(await store.read('courier')).document,minutes=promise.deadline-beforeDue.state.minute;
 await transact('due','world_time',{minutes});assert.equal((await transact('due','world_time',{minutes})).duplicate,true);const done=(await store.read('courier')).document;
 assert.deepEqual((await store.import(await store.export('courier'),'copy')).document,done);
 await store.reconcile('courier',['delivery','start','arrive']);assert.deepEqual((await store.read('courier')).document,beforeDue);
 await store.reconcile('courier',[]);assert.deepEqual((await store.read('courier')).document,document);
});
