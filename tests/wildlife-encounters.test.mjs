import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches} from '../server-plugin/storage.mjs';
import {wildlifeEncounterAt} from '../server-plugin/wildlife.mjs';

const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const wood='loc_hw_northwood',field='loc_hw_fields',dock='loc_hw_dock',village='loc_hw',habitat='habitat_hw_wood';
// A route through an existing habitat plus a longer alternate road. No catalog changes.
function setup(kind='present'){
    const world=structuredClone(source);delete world.rules.weather;
    // These encounter routes replace roads named by flood/disease clocks.
    delete world.rules.hazardClock;
    const edge=(id,from,to,lengthKm,toll)=>({id,from,to,lengthKm,toll,terrainMultiplier:1,modes:['walk'],closedSeasons:[],risk:0});
    world.routes=[...world.routes.filter(r=>!['route_loc_hw_northwood','route_loc_hw_fields','route_loc_hw_dock'].includes(r.id)),edge('test_wood',village,wood,2,3),edge('test_field',wood,field,2,7),edge('test_dock',village,dock,1,2),edge('test_alternate',dock,field,4,5)];
    const engine=new WorldEngine(world);let c;
    for(let i=0;i<200;i++){
        c=engine.createCharacter(legacy,{},`encounter-${i}`);c.state.location=village;c.state.minute=540;c.state.creatures??={};
        const d={document:c,get:(...p)=>p.reduce((v,k)=>v?.[k],c)};
        if(wildlifeEncounterAt(d,engine,wood,570)?.kind===kind)break;
    }
    assert.equal(wildlifeEncounterAt({document:c,get:(...p)=>p.reduce((v,k)=>v?.[k],c)},engine,wood,570)?.kind,kind);
    const run=async(doc,tool,args,id)=>{const out=await engine.reduce(doc,{tool,args,eventId:id});return{document:applyPatches(doc,out.patches),result:out.result};};
    // A1：引擎在自己的世界副本上工作；夹具的世界改指引擎世界（断言不动）
    return{world:engine.world,engine,c,run};
}
const population=(c,species)=>c.state.records[`ecology:${habitat}`].populations[species];
function conservation(c){
    for(const r of Object.values(c.state.records).filter(r=>r.category==='ecology'))for(const p of Object.values(r.populations)){
        assert.equal(p.initial+p.born+(p.arisen??0)+(p.immigrated??0)-p.predated-p.starved-p.withdrawn-(p.emigrated??0),p.count);assert.ok(p.count>=0);
    }
}

test('正常移动接触实际个体，按活动时段和战役种子判定；无自动战斗或掉落',async()=>{
    const{world,engine,c,run}=setup(),out=await run(c,'world_move',{destination:wood},'arrive');
    const seen=out.result.encounter,actor=out.document.state.creatures[seen.target],s=world.monsters.find(s=>s.id===seen.species);
    assert.equal(seen.kind,'present');assert.equal(seen.source,'arrive');assert.equal(actor.location,wood);assert.equal(actor.ecology,habitat);
    assert.ok(s.levelRange[0]<=actor.level&&actor.level<=s.levelRange[1]);assert.equal(actor.hp,actor.maxHp);
    assert.equal(population(out.document,s.id).count,population(c,s.id).count-1);assert.equal(population(out.document,s.id).withdrawn,population(c,s.id).withdrawn+1);
    assert.equal(out.document.state.player.hp,c.state.player.hp);assert.deepEqual(out.document.state.inventory,c.state.inventory);conservation(out.document);
    const other=await run(c,'world_move',{destination:wood},'different_nonce');assert.equal(other.result.encounter.target,seen.target);
    assert.match(engine.scene(out.document),new RegExp(seen.target));
    const inspect=await run(out.document,'world_pet',{operation:'inspect',target:seen.target},'contact');assert.equal(inspect.result.target,seen.target);
});

test('经过栖地在实际路段节点停下，同行和召唤随行，只支付已走路费和时耗',async()=>{
    const{engine,c,run}=setup();c.state.player.companions=['npc_hw_linsui'];c.state.npcs.npc_hw_linsui.location=village;
    c.state.effects.test_summon={kind:'summon',owner:'player',location:village,expires:9999};
    const total=engine.route(village,field,'walk',540,c.randomSeed),prefix=engine.route(village,wood,'walk',540,c.randomSeed);
    const out=await run(c,'world_move',{destination:field},'through');
    assert.equal(out.result.interrupted,true);assert.equal(out.result.requestedDestination,field);assert.equal(out.result.destination,wood);
    assert.equal(out.document.state.minute,540+prefix.minutes);assert.equal(out.result.minutes,prefix.minutes);assert.ok(prefix.minutes<total.minutes);
    assert.deepEqual(out.result.edges,['test_wood']);assert.equal(out.document.state.player.coins,c.state.player.coins-3);
    assert.equal(out.document.state.npcs.npc_hw_linsui.location,wood);assert.equal(out.document.state.effects.test_summon.location,wood);
    assert.equal(out.document.state.discoveries[field],undefined);
    const continued=await run(out.document,'world_move',{destination:field},'continue');
    assert.equal(continued.document.state.minute,540+total.minutes);assert.equal(continued.document.state.player.coins,c.state.player.coins-total.cost);
    assert.equal(continued.document.state.location,field);conservation(continued.document);
});

test('绕行从已抵达节点重新计时；返回与观察不会重新抽取同窗口或生成动物',async()=>{
    const{engine,c,run}=setup(),first=await run(c,'world_move',{destination:field},'stop');
    const expected=engine.route(wood,dock,'walk',first.document.state.minute,c.randomSeed);
    const bypass=await run(first.document,'world_move',{destination:dock},'bypass');
    assert.equal(bypass.document.state.minute,first.document.state.minute+expected.minutes);assert.equal(bypass.result.cost,expected.cost);
    assert.equal(bypass.document.state.location,dock);assert.doesNotMatch(engine.scene(bypass.document),/看见褐背短鹿/);
    const back=await run(bypass.document,'world_move',{destination:wood},'back');assert.equal(back.result.encounter,null);
    // Other habitats on the detour may yield their own encounter. Returning
    // to the already checked wood must neither duplicate nor change any actor.
    assert.deepEqual(back.document.state.creatures,bypass.document.state.creatures);
    for(const [id,actor]of Object.entries(first.document.state.creatures))assert.deepEqual(back.document.state.creatures[id],actor,id);
    for(let i=0;i<3;i++){
        const observed=await run(back.document,'world_wildlife',{operation:'observe'},`observe${i}`);assert.deepEqual(observed.document,back.document);
    }
    conservation(back.document);
});

test('踪迹有实际物种和时间来源，场景可见；追踪仍用原检定与有限种群',async()=>{
    const{c,engine,run}=setup('trace'),out=await run(c,'world_move',{destination:wood},'trace');
    const trace=out.result.encounter;assert.equal(trace.kind,'trace');assert.equal(trace.target,undefined);
    assert.deepEqual(out.document.state.creatures,c.state.creatures);assert.deepEqual(population(out.document,trace.species),population(c,trace.species));
    const observed=await run(out.document,'world_wildlife',{operation:'observe'},'look');assert.deepEqual(observed.result.traces,[trace]);
    assert.match(engine.scene(out.document),/野外接触/);assert.match(engine.scene(out.document),/来源trace/);
    let tracked;
    for(let i=0;i<60;i++){tracked=await run(out.document,'world_wildlife',{operation:'track',species:trace.species},`track${i}`);if(tracked.result.success)break;}
    assert.equal(tracked.result.success,true);assert.equal(tracked.document.state.minute,out.document.state.minute+engine.rules.wildlife.trackMinutes);
    assert.equal(tracked.document.state.creatures[tracked.result.found.id].species,trace.species);conservation(tracked.document);
});

test('野外等待按固定时间窗口发现线索，拆分等待结果一致且不扣种群',async()=>{
    const{c,run}=setup();c.state.location=wood;c.state.minute=360;
    const long=await run(c,'world_time',{minutes:359,activity:'等待'},'wait');assert.equal(long.document.state.minute,719);
    assert.equal(long.result.encounters.length,1);assert.equal(long.result.encounters[0].kind,'trace');assert.equal(long.result.encounters[0].source,'wait');
    assert.deepEqual(long.document.state.creatures,c.state.creatures);conservation(long.document);
    let split=c;for(let i=0;i<359;i+=47)split=(await run(split,'world_time',{minutes:Math.min(47,359-i)},'wait')).document;
    assert.deepEqual(split.state.records[`wildlife:encounter:${habitat}`],long.document.state.records[`wildlife:encounter:${habitat}`]);
    assert.deepEqual(split.state.records[`ecology:${habitat}`],long.document.state.records[`ecology:${habitat}`]);
    const observed=await run(long.document,'world_wildlife',{operation:'observe'},'wait-observe');assert.deepEqual(observed.document,long.document);
});

test('耗尽或非活动时段无凭空遭遇，普通室内等待与未命中移动不生成动物',async()=>{
    const{c,world,run}=setup();
    for(const p of Object.values(c.state.records[`ecology:${habitat}`].populations)){p.withdrawn+=p.count;p.count=0;}
    const out=await run(c,'world_move',{destination:wood},'extinct');assert.equal(out.result.encounter,null);assert.deepEqual(out.document.state.creatures,c.state.creatures);conservation(out.document);
    const sleeping=setup();for(const s of sleeping.world.monsters.filter(s=>s.wildlife?.habitat===habitat))s.wildlife.activeHours=[1080,360];
    const dormant=await sleeping.run(sleeping.c,'world_move',{destination:wood},'dormant');assert.equal(dormant.result.encounter,null);
    const indoor=setup();indoor.c.state.location='bld_hw_qingdeng';const rested=await indoor.run(indoor.c,'world_time',{minutes:359},'indoor');assert.deepEqual(rested.result.encounters,[]);
    const seeds=new Set();for(let i=0;i<40;i++){
        const doc=structuredClone(c);doc.randomSeed=`quiet-${i}`;
        const attempt=wildlifeEncounterAt({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)},new WorldEngine(world),wood,570);
        seeds.add(attempt?.kind);
    }
    assert.ok(seeds.has(null));
});

test('已有在场个体沿用身份，不增种群扣除；满场景至多给线索',async()=>{
    const{c,world,run}=setup(),s=world.monsters.find(s=>s.wildlife?.habitat===habitat);
    const actor={name:s.name,species:s.id,ecology:habitat,location:wood,level:s.levelRange[0],hp:10,maxHp:10,status:'正常',owner:null};
    c.state.creatures.known=actor;population(c,s.id).count--;population(c,s.id).withdrawn++;
    const out=await run(c,'world_move',{destination:wood},'existing');assert.equal(out.result.encounter.target,'known');assert.deepEqual(out.document.state.creatures,c.state.creatures);
    assert.deepEqual(population(out.document,s.id),population(c,s.id));conservation(out.document);
    const full=setup();for(let i=0;i<full.world.rules.wildlife.maximumPresent;i++)full.c.state.creatures[`owned${i}`]={...actor,owner:'player'};
    const capped=await full.run(full.c,'world_move',{destination:wood},'cap');assert.equal(capped.result.encounter.kind,'trace');assert.deepEqual(capped.document.state.creatures,full.c.state.creatures);
});

test('存档重启、重复事件、重放、导入导出与回滚保留遭遇和种群',async t=>{
    const{engine,c}=setup(),directory=await fs.mkdtemp(path.join(tmpRoot(),'wildlife-encounters-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const reducer=(doc,input,options)=>engine.reduce(doc,input,options),store=new CampaignStorage(directory,{reducer,snapshotEvery:100});
    await store.create({id:'encounters',worldVersion:engine.world.version,document:c});
    const request={id:'move',anchor:'a1',input:{tool:'world_move',args:{destination:field},eventId:'move'}};
    const first=await store.transact('encounters',request,reducer),saved=(await store.read('encounters')).document;
    const duplicate=await store.transact('encounters',request,reducer);assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.result,first.result);
    const restarted=new CampaignStorage(directory,{reducer});assert.deepEqual((await restarted.read('encounters')).document,saved);
    assert.deepEqual((await restarted.import(await store.export('encounters'),'copy')).document,saved);
    const replayed=await engine.reduce(c,request.input,{replay:true,result:first.result});assert.deepEqual(applyPatches(c,replayed.patches),saved);conservation(saved);
    assert.deepEqual((await store.reconcile('encounters',[],null)).document,c);
});
