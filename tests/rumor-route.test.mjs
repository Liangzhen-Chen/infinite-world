import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage,digest} from '../server-plugin/storage.mjs';
import {shareNpcMemory,npcCognitionView} from '../server-plugin/npc-cognition.mjs';
import {npcRumors,npcRumorSeeds} from '../server-plugin/npc-rumors.mjs';
import {npcContext} from '../server-plugin/npc-memory.mjs';
import {npcPlanningContext,npcPlanFingerprint} from '../server-plugin/npc-autonomy.mjs';
import {init} from '../server-plugin/index.mjs';

const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const from='npc_hw_linsui',to='npc_hw_hezhou',third='npc_hw_ayan';
const rumor={id:'rumor_route_fixture',source:from,carriers:[],claim:'旧渡口收到12铜修桥钱和4份木料。',fact:'密封的账页记载修桥钱被原数退回。',truth:'false'};
const slot=location=>({default:[{start:0,end:1440,location,activity:'营业',services:['trade']}]});
function draft(document){return {document,patches:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(path,value){const patch={op:'set',path,value};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},remove(path){const patch={op:'delete',path};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);}};}
async function setup(){
    const world=await loadWorld();world.rumors=[structuredClone(rumor)];
    for(const id of [from,to,third]){
        const npc=world.npcs.find(n=>n.id===id);npc.schedule=slot(id===from?'bld_hw_qingdeng':'loc_bs');
        npc.personality.flaws=[];npc.relationships=[from,to,third].filter(other=>other!==id).map(withId=>({with:withId,type:'朋友',trust:30}));
    }
    const engine=new WorldEngine(world),document=engine.initialFromLegacy(legacy,'rumor-route');document.state.minute=540;
    for(const id of [from,to,third]){
        const npc=document.state.npcs[id];npc.location=id===from?'bld_hw_qingdeng':'loc_bs';npc.activity='营业';npc.memoryStream=[];npc.relationships={};
    }
    return {world,engine,document};
}
async function reduce(engine,document,tool,args,eventId){const result=await engine.reduce(document,{tool,args,eventId});return {document:applyPatches(document,result.patches),result:result.result};}
async function planCarry(engine,document){
    const memory=npcCognitionView(engine,document,from).memories.find(m=>m.rumor===rumor.id);
    const out=await engine.reduce(document,{type:'npc_plan',eventId:'send_rumor',plan:{kind:'npc-plan',version:1,minute:document.state.minute,stateFingerprint:npcPlanFingerprint(document),proposals:[{npc:from,actions:[{kind:'share',to,memoryId:memory.id,channel:'carry'}]}]}});
    assert.equal(out.result.results[0].status,'进行中');
    return {document:applyPatches(document,out.patches),delivery:out.result.results[0].detail};
}
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fields-rumor-route-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}

test('正式传闻加载保持可选，只有登记讲述者进入计划，作者真相不进入人物认知',async t=>{
    const {world,engine,document}=await setup(),root=await temp(t);
    for(const dir of ['meta','people','geo','lore'])await fs.mkdir(path.join(root,dir));
    for(const [file,value] of Object.entries({'meta/rules.json':world.rules,'people/baseline.json':world.npcs,'geo/locations.json':world.locations,'geo/routes.json':world.routes,'meta/items.json':world.items,'meta/professions.json':world.professions,'meta/skills.json':world.skills,'meta/spells.json':world.spells}))await fs.writeFile(path.join(root,file),JSON.stringify(value));
    const empty=await loadWorld(root);assert.equal(Object.hasOwn(empty,'rumors'),false);
    await fs.writeFile(path.join(root,'lore/rumors.json'),'[]');assert.equal(digest(await loadWorld(root)),digest(empty));
    await fs.writeFile(path.join(root,'lore/rumors.json'),JSON.stringify([rumor]));assert.deepEqual((await loadWorld(root)).rumors,[rumor]);
    await fs.writeFile(path.join(root,'lore/rumors.json'),'{');await assert.rejects(loadWorld(root),SyntaxError);
    const context=npcPlanningContext(engine,document),source=context.people.find(n=>n.id===from);
    assert.ok(source.memories.some(m=>m.rumor===rumor.id&&m.content===rumor.claim));
    assert.ok(!JSON.stringify(context).includes(rumor.fact));assert.ok(!npcRumors(engine,to,document).some(r=>r.id===rumor.id));
});

test('计划携信付实际路费且抵达前不可询问，交付后的逐手版本可追到原来源',async()=>{
    const {world,engine,document}=await setup(),route=world.routes.find(r=>[r.from,r.to].includes('loc_hw')&&[r.from,r.to].includes('loc_bs'));route.toll=7;
    const before=structuredClone(document),sent=await planCarry(engine,document),d=sent.delivery;
    assert.deepEqual(document,before);assert.equal(before.state.npcs[from].coins-sent.document.state.npcs[from].coins,7);
    assert.equal(sent.document.state.npcs[from].location,null);assert.ok(d.arrive>540);
    const travelling=(await reduce(engine,sent.document,'world_time',{minutes:d.arrive-541,activity:'等待'},'wait_before_arrival')).document;
    assert.ok(!npcRumors(engine,to,travelling).some(r=>r.id===rumor.id));assert.equal(travelling.state.npcs[from].location,null);
    const arrived=(await reduce(engine,travelling,'world_time',{minutes:1,activity:'等待'},'arrive')).document;
    const heard=arrived.state.npcs[to].memoryStream.find(m=>m.rumor===rumor.id);
    assert.equal(heard.minute,d.arrive);assert.equal(heard.sourceType,'听说');assert.equal(heard.rumorSource,from);assert.equal(heard.transmissionChain.length,1);
    assert.equal(heard.transmissionChain[0].input,rumor.claim);assert.equal(heard.transmissionChain[0].channel,'carry');
    const next=draft(arrived);shareNpcMemory(next,engine,{from:to,to:third,memoryId:heard.id});
    const second=next.get('state','npcs',third,'memoryStream').find(m=>m.rumor===rumor.id);
    assert.equal(second.rootMemoryId,heard.rootMemoryId);assert.deepEqual(second.transmissionChain.map(h=>[h.from,h.to]),[[from,to],[to,third]]);
    assert.match(second.content,/若干/);assert.doesNotMatch(second.content,/12铜|4份/);
    assert.equal(second.transmissionChain[1].input,heard.content);assert.equal(second.transmissionChain[1].content,second.content);
    assert.equal(npcContext(engine,next.document,third).rumors.find(r=>r.id===rumor.id).claim,second.content);
    assert.ok(!JSON.stringify(npcRumors(engine,third,next.document)).includes('12铜'));
    const unchanged=structuredClone(next.document);assert.equal(shareNpcMemory(next,engine,{from:third,to:from,memoryId:second.id}).duplicate,true);assert.deepEqual(next.document,unchanged);
});

test('抵达后的公开传闻按每日真实同场继续传播，遗忘不从传播档案恢复数量',async()=>{
    const {engine,document}=await setup(),sent=await planCarry(engine,document);
    const arrived=(await reduce(engine,sent.document,'world_time',{minutes:sent.delivery.arrive-540,activity:'等待'},'arrive')).document;
    const nextDay=Math.floor(arrived.state.minute/1440)*1440+2040;
    const later=(await reduce(engine,arrived,'world_time',{minutes:nextDay-arrived.state.minute,activity:'等待'},'daily')).document;
    const received=later.state.npcs[third].memoryStream.find(m=>m.rumor===rumor.id);assert.ok(received);assert.equal(received.minute,nextDay);
    assert.deepEqual(received.transmissionChain.map(h=>h.to),[to,third]);assert.match(received.content,/若干/);
    const d=draft(later);d.set(['state','npcs',third,'cognition','blurred',received.id],{content:'记得有人谈起旧渡口，细节模糊。'});
    const view=npcRumors(engine,third,d.document).find(r=>r.id===rumor.id);assert.doesNotMatch(JSON.stringify(view),/12铜|4份|若干/);
    assert.doesNotMatch(JSON.stringify(npcCognitionView(engine,d.document,third).memories.find(m=>m.id===received.id)),/12铜|4份|若干/);
    assert.match(d.get('state','npcs',third,'memoryStream').find(m=>m.id===received.id).transmissionChain[0].input,/12铜/);
});

test('私密获知的允许名单逐手保留，不能通过听说转为公开传闻',async()=>{
    const {engine,document}=await setup(),d=draft(document);
    for(const id of [from,to,third])d.set(['state','npcs',id,'location'],'bld_hw_qingdeng');
    const memory={id:'private_rumor',rumor:rumor.id,rumorSource:from,kind:'rumor',content:rumor.claim,minute:500,sourceType:'听说',visibility:'secret',knownBy:[to],salience:2};
    d.set(['state','npcs',from,'memoryStream'],[memory]);shareNpcMemory(d,engine,{from,to,memoryId:memory.id});
    const received=d.get('state','npcs',to,'memoryStream').find(m=>m.rootMemoryId===memory.id);assert.deepEqual(received.knownBy,[to]);
    assert.ok(!npcRumors(engine,to,d.document).some(r=>r.id===rumor.id));
    const before=structuredClone(d.document);assert.throws(()=>shareNpcMemory(d,engine,{from:to,to:third,memoryId:received.id}),/私密/);assert.deepEqual(d.document,before);
});

test('玩家只能问实际收到的版本，获知保留传播链并可导出重放、回滚',async t=>{
    const {engine,document}=await setup(),sent=await planCarry(engine,document);
    let arrived=(await reduce(engine,sent.document,'world_time',{minutes:sent.delivery.arrive-540,activity:'等待'},'arrival')).document;
    const heard=arrived.state.npcs[to].memoryStream.find(m=>m.rumor===rumor.id);
    arrived.state.location='loc_bs';
    assert.ok(engine.scene(arrived,rumor.claim).includes(heard.content));assert.ok(!engine.scene(arrived,rumor.claim).includes(rumor.fact));
    const args={subject:'player',key:rumor.id,rumor:rumor.id,source:to,content:heard.content};
    await assert.rejects(reduce(engine,arrived,'world_remember',{...args,content:rumor.claim},'original'),/登记claim/);
    await assert.rejects(reduce(engine,arrived,'world_remember',{...args,content:rumor.fact},'truth'),/登记claim/);
    const root=await temp(t),store=new CampaignStorage(root,{reducer:engine.reduce.bind(engine)});await store.create({id:'rumor',document:arrived,worldVersion:engine.world.version});
    const event={id:'player_heard',anchor:'player_heard',input:{tool:'world_remember',args,eventId:'player_heard'}};
    await store.transact('rumor',event,engine.reduce.bind(engine));const after=(await store.read('rumor')).document,memory=after.memories[`player::${rumor.id}::${to}`];
    assert.equal(memory.rootMemoryId,heard.rootMemoryId);assert.deepEqual(memory.transmissionChain.map(h=>h.to),[to,'player']);assert.equal(memory.rumorSource,from);assert.equal(after.state.minute,arrived.state.minute+10);
    const bundle=await store.export('rumor');const copy=new CampaignStorage(path.join(root,'copy'),{reducer:engine.reduce.bind(engine)});await copy.import(bundle,'rumor');assert.deepEqual((await copy.read('rumor')).document,after);
    await store.reconcile('rumor',[]);assert.deepEqual((await store.read('rumor')).document,arrived);
});

test('长短时间步传播相同，未交付、死亡携信者及未登记渠道不产生收件知识',async()=>{
    const {engine,document}=await setup(),sent=await planCarry(engine,document),duration=sent.delivery.arrive-540;
    const long=(await reduce(engine,sent.document,'world_time',{minutes:duration,activity:'等待'},'long')).document;
    let short=sent.document;for(let left=duration;left>0;){const minutes=Math.min(17,left);short=(await reduce(engine,short,'world_time',{minutes,activity:'等待'},`short_${left}`)).document;left-=minutes;}
    assert.deepEqual(short.state.npcs[to].memoryStream,long.state.npcs[to].memoryStream);assert.deepEqual(short.state.npcCognition,long.state.npcCognition);
    const missing=structuredClone(sent.document);missing.state.npcs[to].location='bld_hw_school';engine.byId.get(to).schedule=slot('bld_hw_school');
    const delayed=(await reduce(engine,missing,'world_time',{minutes:duration,activity:'等待'},'miss')).document;
    assert.ok(!npcRumors(engine,to,delayed).some(r=>r.id===rumor.id));assert.equal(delayed.state.npcCognition.messages[sent.delivery.messageId].status,'待交付');
    const dead=structuredClone(sent.document);dead.state.npcs[from].status='死亡';
    const stopped=(await reduce(engine,dead,'world_time',{minutes:duration,activity:'等待'},'stopped')).document;
    assert.equal(stopped.state.npcCognition.messages[sent.delivery.messageId].status,'中止');assert.ok(!npcRumors(engine,to,stopped).some(r=>r.id===rumor.id));
    const d=draft(document),before=structuredClone(document),memoryId=npcRumorSeeds(engine,from).find(m=>m.rumor===rumor.id).id;
    assert.throws(()=>shareNpcMemory(d,engine,{from,to,memoryId,channel:'teleport'}),/未登记/);assert.deepEqual(d.document,before);
});

test('消息固定出发时的版本，封路或路费不足不扣钱也不产生半次传递',async()=>{
    const {world,engine,document}=await setup(),memoryId=npcRumorSeeds(engine,from).find(m=>m.rumor===rumor.id).id,d=draft(document);
    const sent=shareNpcMemory(d,engine,{from,to,memoryId,channel:'carry'});
    d.set(['state','npcs',from,'cognition'],{blurred:{[memoryId]:{content:'细节已经模糊。'}}});
    const arrived=(await reduce(engine,d.document,'world_time',{minutes:sent.arrive-540,activity:'等待'},'arrive')).document;
    assert.match(arrived.state.npcs[to].memoryStream.find(m=>m.rumor===rumor.id).content,/12铜/);
    const bad=draft(document);bad.set(['state','npcs',from,'coins'],0);world.routes.forEach(r=>{r.toll=9;});const unchanged=structuredClone(bad.document);
    assert.throws(()=>shareNpcMemory(bad,engine,{from,to,memoryId,channel:'carry'}),/路费/);assert.deepEqual(bad.document,unchanged);
    world.routes.forEach(r=>{r.closedSeasons=[0,1,2,3];});assert.throws(()=>shareNpcMemory(bad,engine,{from,to,memoryId,channel:'carry'}));assert.deepEqual(bad.document,unchanged);
});

test('HTTP公开搜索和目录不公开作者真相，只有已交谈版本能跨重启检索',async t=>{
    const {world,engine,document}=await setup(),sent=await planCarry(engine,document);
    const arrived=(await reduce(engine,sent.document,'world_time',{minutes:sent.delivery.arrive-540,activity:'等待'},'arrive')).document;arrived.state.location='loc_bs';arrived.worldHash=digest(world);
    const root=await temp(t),api=async()=>{
        const app=express();app.use(express.json());const router=express.Router();await init(router,{world,baseRoot:root});app.use(router);
        const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
        return async(endpoint,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/${endpoint}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;};
    };
    const request=await api(),created=await request('create',{character:{name:'传闻访客'}}),id=created.reference.campaignId;
    const unknown=await request('search',{campaignId:id,query:rumor.claim});assert.ok(unknown.results.every(r=>!r.text.includes(rumor.claim)&&!r.text.includes(rumor.fact)));
    const catalog=await request('catalog',{campaignId:id,entity:'loc_bs'});assert.ok(!JSON.stringify(catalog).includes(rumor.fact));
    // Import the route-produced NPC state, then acquire the claim through the
    // ordinary HTTP conversation endpoint. No author fact enters the campaign.
    const store=new CampaignStorage(path.join(root,'route'),{reducer:engine.reduce.bind(engine)});await store.create({id:'route',worldVersion:world.version,document:arrived});
    const imported=await request('import',{bundle:await store.export('route')}),campaignId=imported.reference.campaignId;
    const heard=arrived.state.npcs[to].memoryStream.find(m=>m.rumor===rumor.id),args={subject:'player',key:rumor.id,rumor:rumor.id,source:to,content:heard.content};
    await request('execute',{campaignId,tool:'world_remember',args,eventId:'http_heard',anchor:'http_heard'});
    for(const client of [request,await api()]){
        const search=await client('search',{campaignId,query:rumor.claim});assert.ok(search.results.some(r=>r.text.includes(heard.content)));assert.ok(search.results.every(r=>!r.text.includes(rumor.fact)));
        const truth=await client('search',{campaignId,query:rumor.fact});assert.ok(truth.results.every(r=>!r.text.includes(rumor.fact)));
    }
});
