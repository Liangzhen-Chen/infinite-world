import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {planWildlifeMigration} from '../server-plugin/wildlife-migration.mjs';
import {planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {wildlifeEncounterAt} from '../server-plugin/wildlife.mjs';
import {deriveHabitats,derivedHabitatId,speciesHabitatTypes} from '../server-plugin/wildlife-habitats.mjs';
import {speciesInHabitat} from '../server-plugin/wildlife-range.mjs';
import {validateWorld} from '../tools/validate-world.mjs';

const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const pine='loc_k8_pinewood',pineHabitat=derivedHabitatId(pine);
const place=(id,name,terrain,extra={})=>({id,name,aliases:[],parent:'loc_hw',coordinates:[3,1],terrain,description:`${name}，测试用野地。`,
    mapHierarchy:[{id:'known-continent',name:'已知大陆片区'},{id:'known-region',name:'已知地区片区'},{id:'known-county',name:'已知郡级片区'},{id,name}],...extra});
// A new edition: one pine wood reached on foot from the north wood. Nothing else is authored for it.
function withPine(world=source,extra={}){
    const w=structuredClone(world);w.locations.push(place(pine,'松针岗','针叶林',extra));
    w.routes.push({id:'route_k8_pinewood',from:'loc_hw_northwood',to:pine,lengthKm:1.5,terrainMultiplier:1,modes:['walk'],closedSeasons:[],toll:0,risk:0});return w;
}
const conservation=c=>{for(const r of Object.values(c.state.records).filter(r=>r.category==='ecology'))for(const p of Object.values(r.populations)){
    assert.equal(p.initial+p.born+(p.arisen??0)+(p.immigrated??0)-(p.emigrated??0)-p.predated-p.starved-p.withdrawn,p.count);assert.ok(p.count>=0);}};
const run=async(engine,doc,tool,args,id)=>applyPatches(doc,(await engine.reduce(doc,{tool,args,eventId:id})).patches);

test('地形、群落标签与 traits 派生栖地类型；泛地形、人居和建筑不派生',()=>{
    const w=withPine();
    w.locations.push(place('loc_k8_plain','平坡','平地'),place('loc_k8_reedplain','苇塘','平地',{biome:['苇塘']}),
        place('loc_k8_owned','松林小屋','针叶林',{owner:'npc_hw_linsui',rooms:['main']}),place('loc_k8_rock','碎石坡','碎石丘陵'));
    const rows=new Map(deriveHabitats(w).map(h=>[h.location,h]));
    assert.deepEqual(rows.get(pine).types,['forest']);assert.equal(rows.get(pine).derived,1);assert.equal(rows.get(pine).id,pineHabitat);
    assert.deepEqual(rows.get('loc_k8_reedplain').types,['wetland']);assert.deepEqual(rows.get('loc_k8_rock').types,['rock']);
    assert.equal(rows.has('loc_k8_plain'),false);assert.equal(rows.has('loc_k8_owned'),false);
    // The shipped world: every wild place already has an authored habitat; none is duplicated.
    assert.deepEqual(deriveHabitats(source),[]);
    const tagged=withPine(source,{biome:['苇塘']});assert.equal(validateWorld(tagged).ok,true);
    const bad=withPine(source,{biome:['无名']});assert.equal(validateWorld(bad).ok,false);
});

test('物种按自身栖息地标签分布，规模随面积与稀有度，捕食者只随猎物扩散，人形族群不扩散',()=>{
    const w=withPine(),h=deriveHabitats(w).find(h=>h.location===pine),manual=w.rules.wildlife.habitats,cfg=w.rules.habitatDerivation;
    const byId=new Map(w.monsters.map(s=>[s.id,s]));
    assert.ok(h.species.monster_bristle_boar);
    for(const [id,row]of Object.entries(h.species)){const s=byId.get(id),factor=cfg.defaultScale.site*cfg.rarity.find(r=>s.wildlife.population>=r.minimumPopulation).factor;
        assert.ok(speciesHabitatTypes(w,s,manual).every(t=>h.types.includes(t)),id);assert.equal(row.population,Math.floor(s.wildlife.population*factor));
        assert.ok(row.population>=1&&row.population<=row.capacity);assert.ok(!s.tags?.includes('humanoid'));
        if(s.wildlife.predatorOf.length)assert.ok(s.wildlife.predatorOf.some(p=>h.species[p]),`捕食者无猎物：${id}`);}
    for(const s of w.monsters.filter(s=>s.wildlife&&s.wildlife.population<cfg.rarity.at(-2).minimumPopulation))assert.equal(h.species[s.id],undefined,s.id);
    const big=deriveHabitats(withPine(source,{areaKm2:4})).find(h=>h.location===pine);
    assert.equal(big.species.monster_bristle_boar.population,byId.get('monster_bristle_boar').wildlife.population);
    assert.ok(Object.keys(big.species).length>=Object.keys(h.species).length);
    const engine=new WorldEngine(w);assert.ok(speciesInHabitat(engine.rules,engine.world.monsters,pineHabitat).some(s=>s.id==='monster_bristle_boar'));
});

test('手工登记栖地优先：同地点不再派生，原登记行原样保留',()=>{
    const w=withPine(),authored={id:'habitat_k8_pine',name:'松针岗林下',location:pine};w.rules.wildlife.habitats.push(authored);
    const engine=new WorldEngine(w);
    assert.equal(engine.rules.wildlife.habitats.some(h=>h.id===pineHabitat),false);
    assert.deepEqual(engine.rules.wildlife.habitats.find(h=>h.location===pine),authored);
    assert.deepEqual(engine.rules.wildlife.habitats.filter(h=>!h.derived),w.rules.wildlife.habitats.filter(h=>!h.derived));
    // Archived editions (no derivation rule) keep exactly their authored habitats.
    const old=structuredClone(withPine());delete old.rules.habitatDerivation;
    assert.deepEqual(new WorldEngine(old).rules.wildlife.habitats.map(h=>h.id),source.rules.wildlife.habitats.map(h=>h.id));
});

test('旧战役升级：既有种群记录不变，只给新匹配地点补种群，重复迁移为空',async()=>{
    const oldEngine=new WorldEngine(structuredClone(source));
    let c=oldEngine.createCharacter(legacy,{},'k8-upgrade');c=await run(oldEngine,c,'world_time',{minutes:20*1440},'wait');
    c.state.records['ecology:habitat_hw_wood'].populations.monster_bristle_boar.withdrawn+=2;c.state.records['ecology:habitat_hw_wood'].populations.monster_bristle_boar.count-=2;
    const before=structuredClone(c.state.records),newEngine=new WorldEngine(withPine());
    const plan=planWorldUpgrade(c,oldEngine.world,newEngine.world,{worldHash:'k8',eventId:'k8_upgrade'}),next=applyPatches(c,plan.patches);
    for(const[key,row]of Object.entries(before))if(row.category==='ecology')assert.deepEqual(next.state.records[key],row,key);
    const added=next.state.records[`ecology:${pineHabitat}`],row=newEngine.rules.wildlife.habitats.find(h=>h.id===pineHabitat);
    assert.equal(added.lastDay,Math.floor(c.state.minute/1440)-1);
    assert.deepEqual(Object.fromEntries(Object.entries(added.populations).map(([id,p])=>[id,p.count])),Object.fromEntries(Object.entries(row.species).map(([id,s])=>[id,s.population])));
    assert.deepEqual(planWildlifeMigration(next,newEngine.rules,newEngine.world.monsters),[]);
    const later=await run(newEngine,next,'world_time',{minutes:10*1440},'after');conservation(later);
    assert.deepEqual(later.state.records['ecology:habitat_hw_wood'].populations.monster_bristle_boar.withdrawn,before['ecology:habitat_hw_wood'].populations.monster_bristle_boar.withdrawn);
});

test('新地点自动长出生物：新战役有种群，接上赶路遭遇与季节迁徙，日结守恒',async()=>{
    const w=withPine(),engine=new WorldEngine(w);assert.equal(validateWorld(w).ok,true);
    let c=engine.createCharacter(legacy,{},'k8-new');
    const pool=c.state.records[`ecology:${pineHabitat}`];assert.ok(pool);assert.ok(pool.populations.monster_bristle_boar.count>0);
    // T153: the derived range takes part in travel encounter checks like any authored habitat.
    let seen=null;const d={document:c,get:(...p)=>p.reduce((v,k)=>v?.[k],c)};
    for(let m=0;m<200*360&&!seen;m+=360){const a=wildlifeEncounterAt(d,engine,pine,m+180);if(a?.kind)seen=a;}
    assert.ok(seen);assert.equal(seen.habitat.id,pineHabitat);assert.ok(w.rules.wildlife.habitats.find(h=>h.id===pineHabitat).species[seen.species.id]);
    const walk=structuredClone(c);walk.state.location='loc_hw_northwood';
    const moved=await run(engine,walk,'world_move',{destination:pine},'k8-walk');assert.equal(moved.state.location,pine);
    assert.ok(moved.state.records[`wildlife:encounter:${pineHabitat}`]);conservation(moved);
    // A seasonal route from the authored wood into the derived pine range, departing two days in.
    const day=Math.floor(c.state.minute/1440),route={id:'migration_k8_boar_pine',species:'monster_bristle_boar',from:'habitat_hw_wood',to:pineHabitat,path:['route_k8_pinewood'],departDay:(day+2)%360,travelDays:1,fraction:0.25};
    w.rules.wildlife.migration.routes.push(route);assert.equal(validateWorld(w).ok,true);
    const later=await run(engine,c,'world_time',{minutes:15*1440},'k8-fortnight');conservation(later);
    const boar=later.state.records[`ecology:${pineHabitat}`].populations.monster_bristle_boar,m=later.state.records['wildlife:migration'];
    assert.ok(boar.immigrated>0,'季节迁徙应把野猪带进派生栖地');assert.equal(m.departed,m.arrived+m.lost+m.transit.reduce((n,t)=>n+t.count+t.actors.length,0));
    const caps=engine.rules.wildlife.habitats.find(h=>h.id===pineHabitat).species;
    for(const[id,p]of Object.entries(later.state.records[`ecology:${pineHabitat}`].populations))assert.ok(p.count<=caps[id].capacity,`派生容量：${id}`);
});
