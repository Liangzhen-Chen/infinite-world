import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {shareNpcMemory,advanceNpcCognition,settleNpcReflection,npcCognitionView,nextNpcCognitionMinute} from '../server-plugin/npc-cognition.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const from='npc_hw_linsui',to='npc_hw_hezhou',third='npc_hw_ayan';
test('复盘无变化不写补丁，七天遗忘边界只写一次且不改变旧认知或证据',async()=>{
 // Hand anchor: minute500 + seven days ×1440 =10580. At10579 no
 // cognition write is due; at10580 exactly one projection is added.
 const {engine,d}=await setup(),memory=fact('deadline',{salience:1,participants:[from,third]});
 d.set(['state','npcs',from,'memoryStream'],[memory]);
 d.set(['state','npcs',from,'cognition'],{blurred:{},reflections:[]});
 const old=d.document,saved=structuredClone(old),start=d.patches.length,deadline=500+7*1440;
 settleNpcReflection(d,engine,from,deadline-1);
 assert.equal(d.patches.length,start);assert.deepEqual(d.document,saved);
 settleNpcReflection(d,engine,from,deadline);
 assert.equal(d.patches.length,start+1);
 assert.equal(d.get('state','npcs',from,'cognition','blurred','deadline','minute'),deadline);
 assert.deepEqual(old,saved);assert.deepEqual(d.get('state','npcs',from,'memoryStream'),[memory]);
 settleNpcReflection(d,engine,from,deadline+1);assert.equal(d.patches.length,start+1);
});
function draft(document){return {document,patches:[],get(...p){return p.reduce((x,k)=>x?.[k],this.document);},set(path,value){const patch={op:'set',path,value};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},remove(path){const patch={op:'delete',path};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);}};}
const fact=(id='seen',extra={})=>({id,sourceEvent:id,kind:'trade',minute:500,location:'bld_hw_qingdeng',participants:['player',from],content:'旅人支付12铜购买面包4份。',sourceType:'亲历',salience:3,emotion:'平静',...extra});
async function setup(){const world=await loadWorld(),engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'cognition-test');doc.state.minute=600;
 for(const id of [from,to,third]){doc.state.npcs[id].location='bld_hw_qingdeng';doc.state.npcs[id].activity='交谈';}
 doc.state.npcs[from].memoryStream=[fact()];return {world,engine,doc,d:draft(doc)};}
test('只从本人记忆经同地关系渠道转述，听说保留来源链且不能伪作亲历',async()=>{
 const {engine,doc,d}=await setup(),before=structuredClone(doc);
 const result=shareNpcMemory(d,engine,{from,to,memoryId:'seen',eventId:'chat'});assert.equal(result.delivered,true);
 const heard=d.get('state','npcs',to,'memoryStream')[0];assert.equal(heard.sourceType,'听说');assert.equal(heard.sourceEvent,'seen');assert.equal(heard.heardFrom,from);assert.equal(heard.transmissionChain.length,1);assert.equal(heard.reliability,'未经亲历核实');assert.deepEqual(doc,before);
 assert.equal(shareNpcMemory(d,engine,{from,to,memoryId:'seen',eventId:'again'}).duplicate,true);
 assert.throws(()=>shareNpcMemory(d,engine,{from,to,memoryId:'invented',eventId:'fake'}),/没有这条/);
});
test('私密约定与秘密没有授权不能外传，睡眠或隔墙地点不能听见',async()=>{
 const {engine,d}=await setup();d.set(['state','npcs',from,'memoryStream'],[fact('private',{visibility:'secret'})]);
 assert.throws(()=>shareNpcMemory(d,engine,{from,to,memoryId:'private'}),/私密/);
 d.set(['state','npcs',from,'memoryStream'],[fact()]);d.set(['state','npcs',to,'location'],'loc_hw');assert.throws(()=>shareNpcMemory(d,engine,{from,to,memoryId:'seen'}),/同一地点/);
 d.set(['state','npcs',to,'location'],'bld_hw_qingdeng');d.set(['state','npcs',to,'activity'],'睡眠');assert.throws(()=>shareNpcMemory(d,engine,{from,to,memoryId:'seen'}),/清醒/);
});
test('远传携信人亲自走真实路线并支付路费，抵达前无人预知，收件人离开不算交付',async()=>{
 const {world,engine,d}=await setup();d.set(['state','npcs',to,'location'],'loc_bs');const route=world.routes.find(r=>r.from==='loc_hw'&&r.to==='loc_bs'||r.to==='loc_hw'&&r.from==='loc_bs');route.toll=7;
 const coins=d.get('state','npcs',from,'coins'),result=shareNpcMemory(d,engine,{from,to,memoryId:'seen',channel:'carry',eventId:'carry'});
 assert.equal(d.get('state','npcs',from,'location'),null);assert.ok(result.arrive>=960);assert.equal(coins-d.get('state','npcs',from,'coins'),7);assert.equal(nextNpcCognitionMinute(d.get('state'),600),result.arrive);
 advanceNpcCognition(d,engine,600,result.arrive-1,'wait');assert.equal(d.get('state','npcs',to,'memoryStream'),undefined);
 d.set(['state','npcs',to,'location'],'loc_hw');d.set(['state','minute'],result.arrive);advanceNpcCognition(d,engine,result.arrive-1,result.arrive,'arrive');assert.equal(d.get('state','npcCognition','messages',result.messageId,'status'),'待交付');assert.equal(d.get('state','npcs',from,'location'),'loc_bs');
 d.set(['state','npcs',to,'location'],'loc_bs');const delivery=(Math.floor(result.arrive/15)+1)*15;assert.equal(nextNpcCognitionMinute(d.get('state'),result.arrive),delivery);d.set(['state','minute'],delivery);advanceNpcCognition(d,engine,result.arrive,delivery,'meet');assert.equal(d.get('state','npcCognition','messages',result.messageId,'status'),'已交付');assert.equal(d.get('state','npcs',to,'memoryStream')[0].minute,delivery);
});
test('封路、费用不足和既有预约不会造成半次携信扣款',async()=>{
 const {world,engine,d}=await setup();d.set(['state','npcs',to,'location'],'loc_bs');d.set(['state','npcs',from,'coins'],0);world.routes.forEach(r=>{r.toll=9;});const before=structuredClone(d.document);assert.throws(()=>shareNpcMemory(d,engine,{from,to,memoryId:'seen',channel:'carry'}),/路费/);assert.deepEqual(d.document,before);
 world.routes.forEach(r=>{r.closedSeasons=[0,1,2,3];});assert.throws(()=>shareNpcMemory(d,engine,{from,to,memoryId:'seen',channel:'carry'}));assert.deepEqual(d.document,before);
});
test('遗忘只改主观投影，三次真实付款形成可推翻反思，听说不当作亲身信用证据',async()=>{
 const {engine,d}=await setup();const rows=[fact('a',{salience:1}),fact('b',{minute:510}),fact('c',{minute:520}),fact('rumor',{sourceType:'听说'})];d.set(['state','npcs',from,'memoryStream'],rows);const history=structuredClone(d.get('state','npcs',from,'memoryStream'));
 settleNpcReflection(d,engine,from,40*1440);assert.deepEqual(d.get('state','npcs',from,'memoryStream'),history);const view=npcCognitionView(engine,d.document,from),forgotten=view.memories.find(m=>m.id==='a');assert.equal(forgotten.blurred,true);assert.doesNotMatch(forgotten.content,/12铜|4份/);assert.equal(view.reflections.length,1);assert.deepEqual(view.reflections[0].evidence,['a','b','c']);
 d.set(['state','npcs',from,'memoryStream'],[...rows,fact('bad',{kind:'obligation',minute:600,sourceType:'约定核对',content:'旅人付款违约。'})]);settleNpcReflection(d,engine,from,40*1440);assert.equal(d.get('state','npcs',from,'cognition','reflections').length,2);assert.match(d.get('state','npcs',from,'cognition','reflections')[1].content,/怀疑/);
});
test('正在工作不能被携信抽走，途中失能不瞬移送达',async()=>{
 const {engine,d}=await setup();d.set(['state','npcs',to,'location'],'loc_bs');
 d.set(['state','npcAutonomy','tasks','busy'],{npc:from,action:{kind:'craft'},start:590,finish:620,status:'进行中'});
 assert.throws(()=>shareNpcMemory(d,engine,{from,to,memoryId:'seen',channel:'carry'}),/自主工作/);d.remove(['state','npcAutonomy','tasks','busy']);
 const result=shareNpcMemory(d,engine,{from,to,memoryId:'seen',channel:'carry'});d.set(['state','npcs',from,'status'],'昏迷');d.set(['state','minute'],result.arrive);advanceNpcCognition(d,engine,600,result.arrive,'wait');
 assert.equal(d.get('state','npcs',from,'location'),null);assert.equal(d.get('state','npcCognition','messages',result.messageId,'status'),'中止');assert.equal(d.get('state','npcs',to,'memoryStream'),undefined);
});
test('本人逾期欠款和旧失信不能被新买面包覆盖，别人的债务不进入反思',async()=>{
 const {engine,d}=await setup();d.set(['state','npcs',from,'memoryStream'],[fact('a'),fact('b',{minute:510}),fact('c',{minute:520})]);
 d.set(['state','records','debt_actual'],{category:'debt',debtor:'player',creditor:from,amount:40,paid:0,deadline:400,status:'逾期'});settleNpcReflection(d,engine,from,600);
 assert.match(d.get('state','npcs',from,'cognition','reflections').at(-1).content,/未清欠款/);assert.ok(d.get('state','npcs',from,'cognition','reflections').at(-1).evidence.includes('debt_actual'));
 d.set(['state','records','debt_actual','creditor'],third);d.remove(['state','npcs',from,'cognition']);settleNpcReflection(d,engine,from,600);assert.doesNotMatch(d.get('state','npcs',from,'cognition','reflections').at(-1).content,/欠款/);
});
test('每日关系传播只观察真实同场，语义记录不依赖父事件编号',async()=>{
 const {world,engine,doc}=await setup();doc.state.minute=540;world.npcs.find(n=>n.id===from).relationships.find(r=>r.with===to).trust=30;
 for(const id of [from,to])world.npcs.find(n=>n.id===id).schedule={default:[{start:0,end:1440,location:'bld_hw_qingdeng',activity:'营业',services:['trade']}]};
 const run=parent=>{const d=draft(structuredClone(doc));d.set(['state','minute'],1440);advanceNpcCognition(d,engine,540,1440,parent,{beforeState:doc.state});return d.document;};
 const a=run('one'),b=run('different');assert.deepEqual(a,b);assert.ok(a.state.npcs[to].memoryStream.some(m=>m.sourceType==='听说'));
});


test('委托记忆的默认传播边界仍适用于旧存档，明确许可后才允许合法转述',async()=>{
 const {engine,d}=await setup();d.set(['state','npcs',from,'memoryStream'],[fact('task',{kind:'quest',content:'林穗托旅人送十份燕麦。'})]);
 const before=structuredClone(d.document);assert.throws(()=>shareNpcMemory(d,engine,{from,to,memoryId:'task'}),/私密/);assert.deepEqual(d.document,before);
 d.set(['state','npcs',from,'memoryStream'],[fact('task',{kind:'quest',content:'林穗托旅人送十份燕麦。',permittedRecipients:[to]})]);shareNpcMemory(d,engine,{from,to,memoryId:'task',eventId:'legal'});
 const heard=d.get('state','npcs',to,'memoryStream')[0];assert.equal(heard.sourceType,'听说');assert.equal(heard.heardFrom,from);assert.equal(heard.sourceEvent,'task');
});
