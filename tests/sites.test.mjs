import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {MemoryIndex} from '../server-plugin/retrieval.mjs';
import {catalogDefinition} from '../server-plugin/catalog.mjs';
import {siteKnowledge,validateSites} from '../server-plugin/sites.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {init} from '../server-plugin/index.mjs';
import {toolDefinitions,modelToolCall} from '../extension/tools.mjs';
import {readStateSection} from '../extension/state-read.mjs';

const baseline=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const siteId='site_test_archive',historyId=baseline.history[0].id;
const fixture=(configure=()=>{})=>{
    const world=structuredClone(baseline);
    world.locations.push({id:siteId,name:'测试旧记水站',parent:'loc_hw',scope:'loc_hw',coordinates:[0,0],terrain:'平原',owner:null,description:'旧站外墙留下水痕。',
        site:{owner:null,occupants:[],entryMechanisms:['door'],
            mechanisms:[{id:'door',name:'门栓机关',description:'门栓被旧木楔卡住。',check:{attribute:'敏捷',difficulty:10},minutes:2,tool:'item_staff',materials:[{item:'item_ration',quantity:1}],failureDamage:3}],
            clues:[{id:'carving',name:'墙面刻痕',description:'墙角有一行刻痕。',text:'刻痕注明洪水高度由沿河耕作者丈量。',minutes:3,mechanisms:['door']},
                {id:'copy',name:'旧抄本',description:'石槽内有折叠纸页。',text:'抄本记录迁居时带走刻石。',minutes:4}],
            resources:[{id:'bundle',name:'封存干粮',item:'item_ration',quantity:2,minutes:2,requires:['carving'],mechanisms:['door']}],
            truths:[{id:'water_history',history:historyId,requires:['carving','copy']}]}});
    world.routes.push({id:'route_test_archive',from:'loc_hw',to:siteId,lengthKm:0,terrainMultiplier:1,modes:['walk'],closedSeasons:[],toll:0,risk:0});
    configure(world.locations.at(-1).site,world);
    const engine=new WorldEngine(world),fresh=()=>engine.initialFromLegacy({state:seed.state,memories:seed.memories},'sites-test');
    return{world,engine,fresh};
};
const run=async(engine,document,tool,args,eventId)=>{const output=await engine.reduce(document,{tool,args,eventId});return{document:applyPatches(document,output.patches),result:output.result};};
const action=(engine,document,operation,args={},eventId=operation)=>run(engine,document,'world_site',{operation,...args},eventId);
async function arrive(f){return(await run(f.engine,f.fresh(),'world_move',{destination:siteId},'arrive')).document;}
async function open(f,document){
    document=(await action(f.engine,document,'investigate',{target:'door'},'see_door')).document;
    // This fixed event rolls 18; the attribute supplies the supported modifier.
    document.state.player.attributes['敏捷']=100;
    document=(await action(f.engine,document,'disarm',{target:'door'},'open_door_success')).document;
    return(await action(f.engine,document,'enter',{},'enter')).document;
}

test('据点工具复用world_field路由，当前位置之外不能调查，门口不透露内部正文',async()=>{
    const f=fixture(),before=f.fresh();
    await assert.rejects(action(f.engine,before,'enter'),/先沿道路抵达/);
    const call=modelToolCall('world_site',{operation:'inspect'});
    assert.equal(call.tool,'world_field');assert.equal(call.args.operation,'site_inspect');
    assert.ok(toolDefinitions().find(t=>t.function.name==='world_field').function.parameters.properties.operation.enum.includes('site_gather'));
    const c=await arrive(f),view=await run(f.engine,c,call.tool,call.args,'inspect');
    assert.equal(view.result.entered,false);assert.equal(view.result.resources,undefined);assert.equal(view.result.clues,undefined);
    assert.doesNotMatch(f.engine.scene(c),/丈量|迁居时带走刻石/);
    await assert.rejects(action(f.engine,c,'enter'),/机关/);
    await assert.rejects(action(f.engine,c,'disarm',{target:'door'}),/先调查/);
    await assert.rejects(action(f.engine,c,'investigate',{target:'copy'}),/先进入/);
});

test('机关工具、真实材料、耗时和解除状态均记账；失败伤害由引擎结算',async()=>{
    const f=fixture(),c=await arrive(f),observed=(await action(f.engine,c,'investigate',{target:'door'},'observe')).document;
    const noTool=structuredClone(observed);delete noTool.state.inventory.item_staff;
    await assert.rejects(action(f.engine,noTool,'disarm',{target:'door'}),/工具/);
    const noMaterial=structuredClone(observed);delete noMaterial.state.inventory.item_ration;
    await assert.rejects(action(f.engine,noMaterial,'disarm',{target:'door'}),/材料/);
    observed.state.player.attributes['敏捷']=1;
    // Difficulty 30 plus the fixed attribute guarantees a real failed check.
    f.engine.byId.get(siteId).site.mechanisms[0].check.difficulty=30;
    const failed=await action(f.engine,observed,'disarm',{target:'door'},'fail_door');
    assert.equal(failed.result.check.success,false);assert.equal(failed.result.damage,3);
    assert.equal(failed.document.state.player.hp,observed.state.player.hp-3);
    assert.equal(failed.document.state.inventory.item_ration.quantity,observed.state.inventory.item_ration.quantity-1);
    assert.equal(failed.document.state.minute,observed.state.minute+2);
    await assert.rejects(action(f.engine,failed.document,'enter'),/机关/);
    assert.equal(observed.state.player.hp,c.state.player.hp);
});

test('实际进入、发现和有限采集闭合；离开重访及新世界版本均不刷新宝物',async()=>{
    const f=fixture();let c=await open(f,await arrive(f));
    await assert.rejects(action(f.engine,c,'gather',{target:'bundle'}),/尚未实际发现/);
    c=(await action(f.engine,c,'investigate',{target:'carving'},'carving')).document;
    const before=c.state.inventory.item_ration.quantity;
    let out=await action(f.engine,c,'gather',{target:'bundle',quantity:2},'take_all');c=out.document;
    assert.equal(out.result.remaining,0);assert.equal(c.state.inventory.item_ration.quantity,before+2);
    const changed=structuredClone(f.world);changed.locations.at(-1).site.resources[0].quantity=200;
    changed.locations.at(-1).site.resources.push({id:'new_bundle',name:'新发现的盐包',item:'item_ration',quantity:1,minutes:2});
    const compatible=compatibleWorld(f.world,changed),upgrade=planWorldUpgrade(c,f.world,compatible.world,{worldHash:'a'.repeat(64),eventId:'upgrade'});
    c=applyPatches(c,upgrade.patches);const next=new WorldEngine(compatible.world);
    c=(await run(next,c,'world_move',{destination:'loc_hw'},'leave')).document;
    assert.equal(c.state.records.site_presence,undefined);
    c=(await run(next,c,'world_move',{destination:siteId},'return')).document;
    await assert.rejects(action(next,c,'gather',{target:'bundle'}),/先进入/);
    c=(await action(next,c,'enter',{},'reenter')).document;
    await assert.rejects(action(next,c,'gather',{target:'bundle'}),/有限资源不足/);
    out=await action(next,c,'gather',{target:'new_bundle'},'new_item');assert.equal(out.result.remaining,0);
    assert.equal(out.document.state.records[`site:${siteId}`].remaining.bundle,0);
    assert.equal(readStateSection(out.document.state,'records')[`site:${siteId}`],undefined);
    const repeat=await action(next,c,'disarm',{target:'door'},'repeat_door');assert.equal(repeat.result.duplicate,true);assert.equal(repeat.document.state.minute,c.state.minute);
});

test('同一线索重复调查不耗时，不凭名字、到访或普通记忆解锁历史',async()=>{
    const f=fixture();let c=await open(f,await arrive(f));
    c.memories.fake={subject:'player',content:'我已经看过旧抄本',source:'口述'};
    assert.equal(siteKnowledge(f.world,c).length,0);
    assert.equal(catalogDefinition(f.engine,c,{entity:historyId}).verified,false);
    const first=await action(f.engine,c,'investigate',{target:'carving'},'read_carving');c=first.document;
    assert.equal(first.result.truths.length,0);
    const repeated=await action(f.engine,c,'investigate',{target:'carving'},'again');
    assert.equal(repeated.result.duplicate,true);assert.equal(repeated.document.state.minute,c.state.minute);
    const found=await action(f.engine,c,'investigate',{target:'copy'},'read_copy');c=found.document;
    assert.equal(found.result.truths.length,1);
    assert.equal(catalogDefinition(f.engine,c,{entity:historyId}).verified,true);
    const index=new MemoryIndex({entities:f.engine.entities});index.syncSites(f.world,c);
    assert.ok(index.search('记水刻')[0].text.includes(f.world.history[0].accounts.verified.claim));
    index.syncSites(f.world,f.fresh());assert.equal(index.search('记水刻').length,0);
});

test('调查检定失败没有发现记录和隐藏真相；数量与未知操作失败不改账',async()=>{
    const f=fixture(s=>{s.clues[1].check={attribute:'智力',difficulty:30};});
    let c=await open(f,await arrive(f));c.state.player.attributes['智力']=1;
    const before=structuredClone(c),out=await action(f.engine,c,'investigate',{target:'copy'},'failed_copy');
    assert.equal(out.result.discovered,false);assert.equal(siteKnowledge(f.world,out.document).length,0);
    assert.equal(out.document.state.records[`site_discovery:${siteId}:copy`],undefined);
    assert.equal(out.document.state.minute,c.state.minute+4);assert.deepEqual(c,before);
    c=(await action(f.engine,c,'investigate',{target:'carving'},'carving')).document;
    for(const quantity of [0,-1,0.5,3])await assert.rejects(action(f.engine,c,'gather',{target:'bundle',quantity}),/数量|资源不足/);
    await assert.rejects(action(f.engine,c,'reset'),/操作须/);
});

test('实际占据者未离开或死亡时不能进入，不删除其身份和物权',async()=>{
    const f=fixture(s=>{s.entryMechanisms=[];s.occupants=['npc_hw_linsui'];});let c=await arrive(f);
    c.state.npcs.npc_hw_linsui.location=siteId;
    await assert.rejects(action(f.engine,c,'enter'),/占据者/);
    const permit=await run(f.engine,c,'world_promise',{operation:'grant_access',promisor:'林穗',location:siteId,content:'同意入内查看',minutes:60},'occupant_permit');c=permit.document;
    const entered=await action(f.engine,c,'enter',{authorization:permit.result.authorization},'permitted_entry');
    assert.equal(entered.document.state.npcs.npc_hw_linsui.location,siteId);
    c.state.npcs.npc_hw_linsui.location='loc_hw';
    assert.equal((await action(f.engine,c,'enter',{},'vacated')).result.entered,true);
    c.state.npcs.npc_hw_linsui.location=siteId;c.state.npcs.npc_hw_linsui.status='死亡';
    assert.equal((await action(f.engine,c,'enter',{},'dead_occupant')).result.entered,true);
});

test('所有者有效许可区别参观与采集；撤销、到期和缺状态的占据者不能绕过',async()=>{
    const f=fixture(s=>{s.owner='npc_hw_linsui';s.occupants=['npc_hw_linsui'];s.entryMechanisms=[];s.resources[0].requires=[];s.resources[0].mechanisms=[];});let c=await arrive(f);
    c.state.npcs.npc_hw_linsui.location=siteId;
    await assert.rejects(action(f.engine,c,'enter'),/物权/);
    const permit=await run(f.engine,c,'world_promise',{operation:'grant_access',promisor:'林穗',location:siteId,type:'site_visit',content:'只参观',minutes:60},'visit_permission');c=permit.document;
    c=(await action(f.engine,c,'enter',{authorization:permit.result.authorization},'visit')).document;
    await assert.rejects(action(f.engine,c,'gather',{target:'bundle',authorization:permit.result.authorization}),/物权/);
    const gather=await run(f.engine,c,'world_promise',{operation:'grant_access',promisor:'林穗',location:siteId,type:'site_gather',content:'同意取一份干粮',minutes:60},'gather_permission');c=gather.document;
    c=(await action(f.engine,c,'gather',{target:'bundle',authorization:gather.result.authorization},'gather_owned')).document;
    assert.equal(c.state.records[`site:${siteId}`].remaining.bundle,1);
    c.state.npcs.npc_hw_linsui.location=siteId;
    const revoked=await run(f.engine,c,'world_promise',{operation:'revoke_access',promisor:'林穗',authorization:gather.result.authorization},'revoke');
    await assert.rejects(action(f.engine,revoked.document,'gather',{target:'bundle',authorization:gather.result.authorization}),/物权/);
    c.state.minute=gather.result.permission.expires;
    await assert.rejects(action(f.engine,c,'enter',{authorization:gather.result.authorization}),/物权/);
    const missing=fixture(s=>{s.entryMechanisms=[];s.occupants=['npc_hw_linsui'];});c=await arrive(missing);delete c.state.npcs.npc_hw_linsui;
    await assert.rejects(action(missing.engine,c,'enter'),/状态尚未落实/);
});

test('资源另有所有者时不能凭据点所有者许可拿取；可合并真实的多份许可',async()=>{
    const f=fixture(s=>{s.owner='npc_hw_linsui';s.entryMechanisms=[];s.resources[0].owner='npc_hw_chenbai';s.resources[0].requires=[];s.resources[0].mechanisms=[];});let c=await arrive(f);
    for(const id of ['npc_hw_linsui','npc_hw_chenbai'])c.state.npcs[id].location=siteId;
    const p=await run(f.engine,c,'world_promise',{operation:'grant_access',promisor:'林穗',location:siteId,type:'site_visit',content:'同意参观'},'owner_entry');c=p.document;
    c=(await action(f.engine,c,'enter',{authorization:p.result.authorization})).document;
    await assert.rejects(action(f.engine,c,'gather',{target:'bundle',authorization:p.result.authorization}),/另有物权/);
    const q=await run(f.engine,c,'world_promise',{operation:'grant_access',promisor:'npc_hw_chenbai',location:siteId,type:'site_gather',content:'同意取粮'},'resource_permission');
    const got=await action(f.engine,q.document,'gather',{target:'bundle',authorizations:[p.result.authorization,q.result.authorization]},'multiple_permissions');
    assert.equal(got.result.remaining,1);
});

test('私宅据点仍须住户和同行许可；所有者可以在门外当面签发，许可须覆盖整个采集',async()=>{
    const f=fixture((s,world)=>{
        s.owner='npc_hw_linsui';s.entryMechanisms=[];s.resources[0].requires=[];s.resources[0].mechanisms=[];
        world.locations.at(-1).access={mode:'private',requiresConsent:true,residents:['npc_hw_linsui']};
    });let c=f.fresh();
    await assert.rejects(run(f.engine,c,'world_move',{destination:siteId},'no_consent'),/成年住户/);
    const grant=await run(f.engine,c,'world_promise',{operation:'grant_access',promisor:'林穗',location:siteId,type:'site_gather',content:'准许入内取粮'},'outside_permit');c=grant.document;
    const authorization=grant.result.authorization;
    c=(await run(f.engine,c,'world_move',{destination:siteId,authorization},'authorized_move')).document;
    c=(await action(f.engine,c,'enter',{authorization},'private_enter')).document;
    c.state.records[authorization].expires=c.state.minute+1;
    const before=structuredClone(c);
    await assert.rejects(action(f.engine,c,'gather',{target:'bundle',authorization},'expired_during_gather'),/许可/);
    assert.deepEqual(c,before);
    c.state.player.companions=['npc_hw_chenbai'];
    await assert.rejects(action(f.engine,c,'enter',{authorization},'uninvited_guest'),/同行者/);
});

test('加载据点参数检查真实引用、有限数量与发现门槛，不改正式地点正文',()=>{
    const f=fixture();assert.deepEqual(validateSites(f.world),[]);
    for(const modify of [s=>{s.resources[0].quantity=-1;},s=>{s.truths[0].requires=['unknown'];},s=>{s.truths[0].requires=[];},s=>{s.mechanisms[0].check.difficulty=1;},s=>{s.resources[0].item='item_unknown';}]){
        const changed=structuredClone(f.world);modify(changed.locations.at(-1).site);assert.throws(()=>new WorldEngine(changed),/site:/);
    }
    assert.equal(baseline.locations.some(row=>row.id===siteId),false);
});

test('真实HTTP：发现条件限制目录、检索与场景；重复采集、重启重放和独立战役保持账本',async t=>{
    const f=fixture(s=>{s.entryMechanisms=[];s.resources[0].mechanisms=[];s.clues[0].mechanisms=[];});
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'fields-sites-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const serve=async()=>{
        const app=express();app.use(express.json());const router=express.Router();await init(router,{baseRoot:root,world:f.world,npcPlanningEnabled:false,consistencyEnabled:false});app.use(router);
        const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
        return async(endpoint,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();assert.equal(response.status,200,result.error);return result;};
    };
    let request=await serve();const created=await request('/create',{name:'遗迹调查者'}),campaignId=created.reference.campaignId;
    const truth=f.world.history[0].accounts.verified.claim;
    const unknown=await request('/search',{campaignId,query:'记水刻'});assert.equal(unknown.results.some(row=>row.text.includes(truth)),false);
    const exec=(operation,args={},eventId=operation)=>request('/execute',{campaignId,tool:'world_field',args:{operation:`site_${operation}`,...args},eventId});
    await request('/execute',{campaignId,tool:'world_move',args:{destination:siteId},eventId:'walk'});
    await exec('enter');await exec('investigate',{target:'carving'},'first_clue');
    assert.equal((await request('/catalog',{campaignId,entity:historyId})).verified,false);
    await exec('investigate',{target:'copy'},'second_clue');
    assert.equal((await request('/catalog',{campaignId,entity:historyId})).verified,true);
    assert.ok((await request('/search',{campaignId,query:'记水刻'})).results.some(row=>row.text.includes(truth)&&row.source==='遗迹发现'));
    const got=await exec('gather',{target:'bundle',quantity:2},'loot');assert.equal(got.result.remaining,0);
    assert.equal((await exec('gather',{target:'bundle',quantity:2},'loot')).duplicate,true);
    const saved=await request('/read',{campaignId});request=await serve();assert.deepEqual((await request('/read',{campaignId})).document,saved.document);
    assert.ok((await request('/search',{campaignId,query:'记水刻'})).results.some(row=>row.text.includes(truth)));
    const other=(await request('/create',{name:'未发现的旅人'})).reference.campaignId;
    assert.equal((await request('/catalog',{campaignId:other,entity:historyId})).verified,false);
    assert.equal((await request('/search',{campaignId:other,query:'记水刻'})).results.some(row=>row.text.includes(truth)),false);
    assert.doesNotMatch((await request('/scene',{campaignId:other,query:'旧记水站'})).scene,/刻痕注明洪水高度|抄本记录迁居/);
});

test('元素解法、随时间再生与机关复位按实际状态与流逝时间结算，公开历史仅入内可见',async()=>{
    const {applyInteraction}=await import('../server-plugin/interactions.mjs');
    const f=fixture((s,world)=>{
        const place=world.locations.at(-1);
        place.features=[{id:'feature_test_archive_pool',name:'积水坑',aliases:[],kind:'water',owner:null,access:'public',position:[0,0],
            state:{capacityMl:200000,waterMl:150000,turbidity:40,saltMg:0,toxinUg:0,pathogenRisk:10,odor:'泥腥味'}}];
        s.mechanisms.push({id:'pool',name:'门前积水',description:'门槛前积了一坑深水。',check:{attribute:'力量',difficulty:30},minutes:5,failureDamage:2,element:{feature:'feature_test_archive_pool',tags:['frozen']}});
        s.entryMechanisms=['door','pool'];s.resources[0].mechanisms=[];
        s.history=[{era:'百年前',text:'沿河人修起水站。'},{era:'如今',text:'水站空置。'}];
        s.changes=[{id:'bundle_regrow',kind:'regrow',resource:'bundle',quantity:1,everyDays:10,max:2},{id:'pool_refill',kind:'rearm',mechanism:'pool',everyDays:3}];
    });
    let c=await arrive(f);
    const view=await action(f.engine,c,'inspect');assert.equal(view.result.history,undefined);
    const seen=await action(f.engine,c,'investigate',{target:'pool'},'see_pool');c=seen.document;
    assert.deepEqual(seen.result.element,{feature:'feature_test_archive_pool',states:['frozen']});
    c.state.player.attributes['力量']=1;
    const failed=await action(f.engine,c,'disarm',{target:'pool'},'wade');assert.equal(failed.result.status,'未解除');
    // A real cold interaction freezes the pool; the frozen state then clears the gate without a check.
    const d={document:structuredClone(c),get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(p,v){let o=this.document;for(const k of p.slice(0,-1))o=o[k]??={};o[p.at(-1)]=v;}};
    assert.deepEqual(applyInteraction(d,f.engine,{agent:'cold',target:'feature_test_archive_pool',minutes:60}).added,['frozen']);
    const frozen=await action(f.engine,d.document,'disarm',{target:'pool'},'walk_ice');
    assert.equal(frozen.result.status,'已解除');assert.equal(frozen.result.element.state,'frozen');assert.equal(frozen.result.check,undefined);
    assert.equal(frozen.document.state.player.hp,d.document.state.player.hp);
    c=frozen.document;c=await open(f,c);
    const inside=await action(f.engine,c,'inspect');assert.deepEqual(inside.result.history,['百年前：沿河人修起水站。','如今：水站空置。']);
    c=(await action(f.engine,c,'investigate',{target:'carving'},'carving')).document;
    c=(await action(f.engine,c,'gather',{target:'bundle',quantity:2},'take')).document;
    await assert.rejects(action(f.engine,c,'gather',{target:'bundle'}),/有限资源不足/);
    // Nine days later nothing has regrown; the gate refilled after three days and must be cleared again to re-enter.
    c.state.minute+=9*1440;
    await assert.rejects(action(f.engine,c,'gather',{target:'bundle'}),/有限资源不足/);
    c.state.minute+=1440+1;
    let out=await action(f.engine,c,'gather',{target:'bundle'},'regrown');assert.equal(out.result.remaining,0);c=out.document;
    c.state.minute+=30*1440;
    assert.equal((await action(f.engine,c,'inspect')).result.resources.find(r=>r.id==='bundle').remaining,2,'再生不超过上限');
    c=(await run(f.engine,c,'world_move',{destination:'loc_hw'},'leave')).document;
    c=(await run(f.engine,c,'world_move',{destination:siteId},'back')).document;
    await assert.rejects(action(f.engine,c,'enter',{},'reenter'),/机关/);
    const broken=structuredClone(f.world);broken.locations.at(-1).site.changes[0].max=5;assert.throws(()=>new WorldEngine(broken),/site:/);
    const missing=structuredClone(f.world);missing.locations.at(-1).site.mechanisms.at(-1).element.feature='feature_nowhere';assert.throws(()=>new WorldEngine(missing),/site:/);
});
