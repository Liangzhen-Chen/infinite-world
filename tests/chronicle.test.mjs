import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches} from '../server-plugin/storage.mjs';
import {MemoryIndex} from '../server-plugin/retrieval.mjs';
import {collectChronicleFacts,buildChronicle,getChronicle,syncChronicleIndex,searchChronicle,chronicleContext} from '../server-plugin/chronicle.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function setup(t){
 const world=await loadWorld(),engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'chronicle-test');document.state.minute=540;
 for(const id of ['npc_hw_linsui','npc_hw_hezhou']){world.npcs.find(n=>n.id===id).schedule={default:[{start:0,end:1440,location:document.state.location,activity:'营业',services:['trade']}]};document.state.npcs[id].location=document.state.location;document.state.npcs[id].activity='营业';}
 const directory=await fs.mkdtemp(path.join(tmpRoot(),'dnd-chronicle-'));t.after(async()=>{const resolved=path.resolve(directory);assert.ok(resolved.startsWith(path.resolve(tmpRoot())+path.sep));await fs.rm(resolved,{recursive:true,force:true});});
 const reducer=engine.reduce.bind(engine),store=new CampaignStorage(directory,{reducer});await store.create({id:'chronicle',worldVersion:world.version,document});
 const run=(tool,args,id,anchor=id)=>store.transact('chronicle',{id,anchor,input:{tool,args,eventId:id}},reducer);
 return {world,engine,document,store,directory,reducer,run};
}
test('编年史只摘录已完成真实动作，场景附人物与来源锚点，不采模型随口记忆',async t=>{
 const {engine,store,run}=await setup(t);await run('world_trade',{seller:'npc_hw_linsui',item:'item_bread',quantity:1},'bread','message-7');
 await assert.rejects(run('world_trade',{seller:'npc_hw_linsui',item:'item_bread',quantity:10000},'impossible'),/库存不足/);
 const first=await getChronicle(store,'chronicle',{engine}),view=await store.read('chronicle');assert.match(first.scenes[0].text,/面包/);assert.ok(first.scenes[0].participants.includes('npc_hw_linsui'));assert.ok(first.scenes[0].sources.anchors.includes('message-7'));assert.ok(first.scenes.every(s=>[...s.text].length<=200));assert.ok(first.facts.every(f=>f.sourceEvent==='bread'));
 const forged=structuredClone(view.document);forged.memories.fake={content:'旅人获得失传王冠。',subject:'player'};
 assert.deepEqual(collectChronicleFacts(engine,view.document,forged,{eventId:'claim',tool:'world_memory',args:{content:'旅人获得失传王冠'}}),[]);
 assert.equal(first.scenes[0].authority,'summary-below-events');assert.equal((await store.read('chronicle')).reference.sequence,1);
});
test('撤销重算幸存事件的真实余额与来源，缓存、重启、导出导入一致',async t=>{
 const {engine,store,run,directory,reducer}=await setup(t);await run('world_trade',{seller:'npc_hw_linsui',item:'item_bread',quantity:1},'first');await run('world_trade',{seller:'npc_hw_linsui',item:'item_bread',quantity:1},'second');
 const index=new MemoryIndex({entities:engine.entities}),old=await getChronicle(store,'chronicle',{engine});syncChronicleIndex(index,old);assert.ok(old.facts.some(f=>f.sourceEvent==='first'));
 await store.reconcile('chronicle',['second']);const current=await getChronicle(store,'chronicle',{engine});syncChronicleIndex(index,current);assert.ok(current.facts.every(f=>f.sourceEvent==='second'));assert.ok([...index.documents.values()].every(f=>f.eventId==='second'));
 const state=(await store.read('chronicle')).document.state;assert.ok(current.facts.some(f=>f.text.includes(`现有 ${state.player.coins}`)));
 const restarted=new CampaignStorage(directory,{reducer});assert.deepEqual(await getChronicle(restarted,'chronicle',{engine}),current);
 const exported=await store.export('chronicle');await restarted.import(exported,'imported');const imported=await getChronicle(restarted,'imported',{engine});assert.deepEqual(imported.facts,current.facts);assert.deepEqual(imported.scenes,current.scenes);
 await store.reconcile('chronicle',[]);assert.deepEqual((await getChronicle(store,'chronicle',{engine})).facts,[]);
});
test('增量投影只复演新增事件，重复索引不重新切词；事件查询按来源去重',async t=>{
 const {engine,store,run,reducer}=await setup(t);await run('world_trade',{seller:'npc_hw_linsui',item:'item_bread',quantity:1},'one');let replays=0;store.reducer=(...args)=>{replays++;return reducer(...args);};
 const first=await getChronicle(store,'chronicle',{engine});assert.equal(replays,1);await getChronicle(store,'chronicle',{engine});assert.equal(replays,1);
 await run('world_trade',{seller:'npc_hw_linsui',item:'item_bread',quantity:1},'two');const second=await getChronicle(store,'chronicle',{engine});assert.equal(replays,2);
 const index=new MemoryIndex({entities:engine.entities});syncChronicleIndex(index,second);const tokenizations=index.tokenizations;syncChronicleIndex(index,second);assert.equal(index.tokenizations,tokenizations);
 assert.equal(searchChronicle(first,'买过什么吃食',{entities:engine.entities}).filter(r=>r.eventId==='one').length,1);
 first.facts[0].text='外部改写不应污染投影缓存';assert.doesNotMatch((await getChronicle(store,'chronicle',{engine})).facts[0].text,/污染/);
});
test('未了约定保留当时状态，明确结束谈话可关闭同一地点的场景',()=>{
 const base={sequence:1,anchor:'message-1',minute:600,location:'loc_hw',participants:['player','npc_hw_linsui'],entities:['player','npc_hw_linsui'],visibleTo:['player'],salience:4,kind:'obligations',reference:'obligations:waiting'};
 const facts=[{...base,id:'first',sourceEvent:'promise',text:'林穗答应等候旅人：待履行',status:'待履行'},{...base,sequence:2,anchor:'message-2',minute:660,id:'second',sourceEvent:'fulfilled',text:'林穗与旅人完成会面',status:'已完成'}];
 const c=buildChronicle(facts,{now:700,sceneBreakAfter:['promise','fulfilled']});assert.equal(c.scenes.length,2);assert.ok(c.scenes.every(s=>s.closed));assert.equal(c.scenes[0].unresolved[0].status,'待履行');assert.deepEqual(c.scenes[1].unresolved,[]);
 assert.deepEqual(c.scenes[0].sources.events,['promise']);assert.deepEqual(c.scenes[1].sources.anchors,['message-2']);
});
test('远方自治留真实编年记录，但默认玩家检索与上下文不泄漏私下行动',async t=>{
 const {engine,document}=await setup(t),after=structuredClone(document);after.state.minute=570;after.state.npcAutonomy={actions:{made:{npc:'npc_hw_ayan',minute:560,location:'bld_hw_mill',summary:'制成了木楔。',action:{kind:'craft'}}}};
 const facts=collectChronicleFacts(engine,document,after,{eventId:'wait',tool:'world_time'});assert.ok(facts.some(f=>f.kind==='autonomy'));
 const player=buildChronicle(facts,{now:570});assert.equal(player.facts.length,0);assert.equal(searchChronicle(player,'木楔').length,0);
 const own=buildChronicle(facts,{now:570,viewer:'npc_hw_ayan'});assert.match(own.scenes[0].text,/木楔/);assert.equal(chronicleContext(player).entries.length,0);
});
test('按场景、日、周、篇章逐级合成，当前日可注入，旧摘要按人物和地点召回',()=>{
 const facts=Array.from({length:30},(_,day)=>({id:`fact_${day}`,sourceEvent:`event_${day}`,sequence:day+1,anchor:`message_${day}`,minute:day*1440+600,location:day%2?'loc_bs':'loc_hw',participants:['player',day===0?'npc_hw_linsui':'npc_other'],entities:['player',day===0?'npc_hw_linsui':'npc_other'],visibleTo:['player'],salience:3,text:day===0?'林穗允许玩家借用酒馆厨房。':`旅人在第${day+1}天购买面包。`,kind:'trade'}));
 const c=buildChronicle(facts,{now:29*1440+650});assert.equal(c.days.length,30);assert.equal(c.weeks.length,5);assert.equal(c.chapters.length,2);assert.equal(c.chapters[0].closed,true);assert.equal(c.days.at(-1).closed,false);
 assert.deepEqual(c.chapters[0].sources.events,facts.slice(0,28).map(f=>f.sourceEvent));
 const context=chronicleContext(c,{query:'林穗的灶台',participants:['npc_hw_linsui'],entities:[{id:'npc_hw_linsui',name:'林穗'}],budgetChars:1800});assert.ok(context.entries.some(e=>e.day===0));assert.ok(context.entries.some(e=>e.level==='day'&&e.day===29));assert.ok(context.characters<=1800);
});
