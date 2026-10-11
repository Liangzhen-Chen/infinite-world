import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches} from '../server-plugin/storage.mjs';
import {npcContext} from '../server-plugin/npc-memory.mjs';
import {npcRumors} from '../server-plugin/npc-rumors.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {shareNpcMemory} from '../server-plugin/npc-cognition.mjs';
import {getChronicle} from '../server-plugin/chronicle.mjs';
import {init} from '../server-plugin/index.mjs';
import {toolDefinitions,resolveToolCall} from '../extension/tools.mjs';

const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const world=await loadWorld(),profiles=world.settlementProfiles.filter(p=>p.details),all=profiles.flatMap(p=>p.details.rumors);
const argsFor=(r,speaker=r.source)=>({subject:'player',key:r.id,rumor:r.id,source:speaker,content:r.claim});
const isPublic=(engine,id)=>engine.byId.get(id)?.access?.mode!=='private'&&!id.includes('home');
async function temporary(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fields-rumor-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
const reduce=async(engine,doc,tool,args,eventId)=>{const out=await engine.reduce(doc,{...resolveToolCall(tool,args),eventId});return{document:applyPatches(doc,out.patches),result:out.result};};

// Approach actual routine locations with ordinary player moves/waits. Never
// edit NPC locations, schedules or memories to manufacture a conversation.
async function approach(engine,read,run,speaker){
    for(let attempt=0;attempt<6;attempt++){
        let doc=await read(),npc=doc.state.npcs[speaker];
        if(npc.location&&isPublic(engine,npc.location)&&!/睡眠|睡觉|熟睡/.test(npc.activity??'')){
            if(doc.state.location!==npc.location)await run('world_move',{destination:npc.location});
            doc=await read();npc=doc.state.npcs[speaker];
            const slot=scheduleAt(engine,speaker,doc.state.minute);
            if(npc.location===doc.state.location&&!npc.scheduleTravel&&!/睡眠|睡觉|熟睡/.test(npc.activity??'')&&slot.location===npc.location&&slot.until-doc.state.minute>=10)return doc;
        }
        doc=await read();
        const minute=doc.state.minute,offset=minute%1440;
        const target=offset<780?840:offset<960?960:1440+600;
        await run('world_time',{minutes:target-offset,activity:'等待'});
    }
    assert.fail(`无法按真实作息接近${speaker}`);
}

test('40登记种子仅投影给source/carriers，所有claim逐条经实际引擎交谈产生可追溯事件',async t=>{
    assert.equal(all.length,40);assert.equal(toolDefinitions().length,25);
    const original=structuredClone(world.npcs),engine=new WorldEngine(world);
    const contextDoc=engine.createCharacter(seed,{},'projection');
    for(const r of all)for(const npc of world.npcs){
        const expected=r.source===npc.id||r.carriers?.includes(npc.id);
        const projection=npcRumors(engine,npc.id).find(x=>x.id===r.id);
        assert.equal(Boolean(projection),Boolean(expected),`${r.id}/${npc.id}`);
        if(expected){assert.deepEqual(projection,{id:r.id,claim:r.claim,source:r.source,reliability:'未核实'});assert.ok(npcContext(engine,contextDoc,npc.id).rumors.some(x=>x.id===r.id));}
    }
    const root=await temporary(t),reducer=engine.reduce.bind(engine),store=new CampaignStorage(root,{reducer});
    for(const profile of profiles){
        const id=profile.id,document=engine.createCharacter(seed,{},id);
        // Isolated campaign spawn at the village; NPC state remains the real
        // initializer output. HTTP tests below travel from the default spawn.
        document.state.location=id;
        await store.create({id,worldVersion:world.version,document});let counter=0;
        const read=async()=>(await store.read(id)).document;
        const run=(tool,args,eventId=`${id}_${counter++}`)=>store.transact(id,{id:eventId,anchor:eventId,input:{tool,args,eventId}},reducer);
        for(const r of profile.details.rumors){
            const before=await approach(engine,read,run,r.source),scene=engine.scene(before,`${r.id} ${r.claim}`);
            assert.ok(scene.includes(r.claim),r.id);assert.ok(scene.length<=6000);
            assert.ok(!scene.includes(r.fact),`${r.id}: 场景不得包含作者fact`);
            assert.ok(!Object.values(before.memories).some(m=>m.rumor===r.id));
            const event=`hear_${r.id}`,heard=await run('world_remember',argsFor(r),event),after=await read();
            assert.ok(heard.result.content.includes(r.claim));assert.ok(!heard.result.content.includes(r.fact));
            assert.equal(after.state.minute,before.state.minute+10);
            const stream=after.state.npcs[r.source].memoryStream.filter(m=>m.rumor===r.id);
            assert.equal(stream.length,1);assert.equal(stream[0].sourceEvent,event);assert.equal(stream[0].private,true);assert.equal(stream[0].sourceType,'亲历');assert.deepEqual(stream[0].participants,['player',r.source]);
            for(const [npcId,npc]of Object.entries(after.state.npcs))if(npcId!==r.source)assert.ok(!(npc.memoryStream??[]).some(m=>m.rumor===r.id));
            const duplicate=await run('world_remember',argsFor(r),`repeat_${r.id}`);assert.equal(duplicate.result.duplicate,true);assert.deepEqual(await read(),after);
            const facts=(await getChronicle(store,id,{engine})).facts.filter(f=>f.sourceEvent===event);
            assert.equal(facts.length,1);assert.equal(facts[0].reference,`rumor:${r.id}`);assert.equal(facts[0].status,'未核实');assert.deepEqual(facts[0].visibleTo,[r.source,'player']);
        }
    }
    assert.deepEqual(world.npcs,original);
});

test('拒绝离场、睡眠、失能、冒充、改claim与truth；私密听说事件不自动传播',async()=>{
    const engine=new WorldEngine(world),r=all[0];let document=engine.createCharacter(seed,{},'boundaries');document.state.location=profiles[0].id;let count=0;
    const read=async()=>document,run=async(tool,args)=>{document=(await reduce(engine,document,tool,args,`approach_${count++}`)).document;};
    await assert.rejects(reduce(engine,document,'world_remember',argsFor(r),'absent'),/不在场/);
    await approach(engine,read,run,r.source);
    const wrong=world.npcs.find(n=>!npcRumors(engine,n.id).some(x=>x.id===r.id)).id;
    for(const args of [{...argsFor(r),subject:r.source},{...argsFor(r),key:'wrong'},argsFor(r,wrong),{...argsFor(r),content:r.claim+'已经证实'},{...argsFor(r),content:r.fact},{...argsFor(r),content:r.truth}])await assert.rejects(reduce(engine,document,'world_remember',args,'forged'));
    for(const [actor,field,value]of [[r.source,'activity','睡眠'],[r.source,'status','昏迷'],[r.source,'scheduleTravel',{arrive:9999}],['player','status','昏迷'],['player','activity','睡眠']]){
        const bad=structuredClone(document),row=actor==='player'?bad.state.player:bad.state.npcs[actor];row[field]=value;
        await assert.rejects(reduce(engine,bad,'world_remember',argsFor(r),'disabled'),/清醒/);
    }
    for(const type of ['obligation','autonomy']){
        const bad=structuredClone(document),now=bad.state.minute;
        if(type==='obligation')bad.state.obligations.block={id:'block',reservationVersion:1,type:'等候',promisor:r.source,promisee:'player',status:'待履行',start:now,deadline:now+60,departures:{[r.source]:now},location:bad.state.location};
        else bad.state.npcAutonomy={tasks:{block:{npc:r.source,action:{kind:'craft'},start:now,finish:now+60,status:'进行中'}}};
        await assert.rejects(reduce(engine,bad,'world_remember',argsFor(r),'busy'),/冲突|自主工作/);
    }
    const slot=scheduleAt(engine,r.source,document.state.minute);
    const closing=(await reduce(engine,document,'world_time',{minutes:slot.until-document.state.minute-5,activity:'等待'},'near_departure')).document;
    await assert.rejects(reduce(engine,closing,'world_remember',argsFor(r),'too_late'),/作息|不在场/);
    const before=structuredClone(document),out=await reduce(engine,document,'world_remember',argsFor(r),'heard');assert.deepEqual(document,before);document=out.document;
    await assert.rejects(reduce(engine,document,'world_remember',{subject:'player',key:`${r.id}::${r.source}`,content:'伪造改写'},'overwrite'),/受校验/);
    const witness=r.witnesses.find(id=>id!==r.source),memory=document.state.npcs[r.source].memoryStream.find(m=>m.rumor===r.id);
    const draft={get:(...p)=>p.reduce((v,k)=>v?.[k],document)};
    assert.throws(()=>shareNpcMemory(draft,engine,{from:r.source,to:witness,memoryId:memory.id,eventId:'share'}),/私密|关系/);
    await run('world_time',{minutes:60,activity:'等待'});
    for(const [id,npc]of Object.entries(document.state.npcs))if(id!==r.source)assert.ok(!(npc.memoryStream??[]).some(m=>m.rumor===r.id));
});

async function http(t,root){
    const app=express();app.use(express.json({limit:'100mb'}));const router=express.Router();await init(router,{baseRoot:root,world,npcPlanningEnabled:false,consistencyEnabled:false});app.use(router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
    return async(endpoint,body)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),value=await res.json();assert.equal(res.status,200,value.error);return value;};
}

test('四村真实HTTP工具→持久事件→search，重放/重启/导入导出/撤销同步清除索引',async t=>{
    const root=await temporary(t),request=await http(t,root),engine=new WorldEngine(world),original=structuredClone(world.npcs);
    for(const p of profiles){
        const r=p.details.rumors[0],created=await request('/create',{character:{name:'传闻访客'}}),campaignId=created.reference.campaignId;let counter=0;
        const read=async()=>(await request('/read',{campaignId})).document;
        const run=(tool,args,eventId=`route_${counter++}`)=>request('/execute',{campaignId,tool,args,eventId,anchor:eventId});
        const unknown=await request('/search',{campaignId,query:r.claim,limit:20});assert.ok(unknown.results.every(x=>!x.text.includes(r.claim)&&!x.text.includes(r.fact)));
        const catalog=await request('/catalog',{campaignId,entity:p.id});assert.ok(!JSON.stringify(catalog).includes(r.claim));
        await run('world_move',{destination:p.id});await approach(engine,read,run,r.source);
        const before=await read(),scene=await request('/scene',{campaignId,query:r.claim});assert.ok(scene.scene.includes(r.claim));assert.ok(scene.scene.length<=6000);assert.ok(!scene.scene.includes(r.fact));
        assert.deepEqual(await read(),before);
        const event=`heard_${r.id}`,out=await run('world_remember',argsFor(r),event);assert.ok(out.result.content.includes(r.claim));
        const after=await read();assert.equal(after.state.minute,before.state.minute+10);
        assert.equal((await run('world_remember',argsFor(r),event)).duplicate,true);assert.deepEqual(await read(),after);
        const search=await request('/search',{campaignId,query:r.claim,limit:20});
        assert.ok(search.results.some(x=>x.eventId===event&&x.text.includes(r.claim)&&x.text.includes('尚未核实')&&x.text.includes(engine.byId.get(r.source).name)));
        assert.ok(search.results.every(x=>!x.text.includes(r.fact)));
        const bundle=await request('/export',{campaignId});assert.ok(bundle.events.some(e=>e.id===event));
        const imported=await request('/import',{bundle}),importId=imported.reference.campaignId;
        assert.deepEqual(imported.document,after);assert.ok((await request('/search',{campaignId:importId,query:r.claim})).results.some(x=>x.eventId===event));
        const restarted=await http(t,root);assert.deepEqual((await restarted('/read',{campaignId})).document,after);assert.ok((await restarted('/search',{campaignId,query:r.claim})).results.some(x=>x.eventId===event));
        const anchors=bundle.events.map(e=>e.anchor).filter(a=>a&&a!==event);
        await request('/reconcile',{campaignId,validAnchors:anchors});
        const forgotten=await request('/search',{campaignId,query:r.claim,limit:20});assert.ok(forgotten.results.every(x=>!x.text.includes(r.claim)&&x.eventId!==event));
        assert.ok(!Object.values((await read()).memories).some(m=>m.rumor===r.id));
        const undone=await read();
        const regenerated=await run('world_remember',argsFor(r),event);assert.ok(regenerated.result.content.includes(r.claim));
        assert.equal((await read()).state.minute,undone.state.minute+10);
        const regeneratedHits=(await request('/search',{campaignId,query:r.claim,limit:20})).results.filter(x=>x.eventId===event);
        assert.equal(regeneratedHits.length,1);assert.ok(regeneratedHits[0].text.includes('尚未核实'));
    }
    assert.deepEqual(world.npcs,original);
});
