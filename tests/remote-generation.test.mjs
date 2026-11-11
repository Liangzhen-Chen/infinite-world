import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {init} from '../server-plugin/index.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,digest} from '../server-plugin/storage.mjs';
import {generateCounty,remoteWorld,remoteCountyOf} from '../server-plugin/remote-generation.mjs';
import {shopStores} from '../server-plugin/shop.mjs';
import {reputationSettlements} from '../server-plugin/reputation-registry.mjs';
import {standing,collectivesOf,transmitStanding} from '../server-plugin/standing.mjs';
import {adminLevel} from '../server-plugin/promotion.mjs';
import {npcRumors} from '../server-plugin/npc-rumors.mjs';
import {locationTraits} from '../server-plugin/traits.mjs';
import {regionOf} from '../server-plugin/regions.mjs';
import {checkGeneratedProfile} from '../server-plugin/population.mjs';

const WORLD_DIRS=['world/geo','world/lore','world/people','world/meta'];
async function worldDigest(){
    // world/meta now holds subdirectories (mechanics layers): digest every file beneath, not only the top level.
    const walk=async dir=>{const out=[];for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:1))out.push(...(e.isDirectory()?await walk(path.join(dir,e.name)):[await fs.readFile(path.join(dir,e.name),'utf8')]));return out;};
    const files=[];for(const dir of WORLD_DIRS)files.push(...await walk(dir));
    return digest(files);
}
const digestBefore=await worldDigest();
const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(world);
// WorldEngine merges the mechanism annotations into the loaded world in place (A1, 4a1aa099), so the baseline is taken once the engine holds it.
const worldBefore=digest(world);
const ZHEYA='county_hanlu_zheya',TONGJI='county_hanlu_tongji';

async function walk(doc,destinations,prefix){
    for(const [i,destination]of destinations.entries()){const r=await engine.reduce(doc,{tool:'world_move',args:{destination},eventId:`${prefix}-${i}`});doc=applyPatches(doc,r.patches);}
    return doc;
}
const roster=(doc,district)=>Object.values(doc.state.created).filter(e=>e.generated==='population'&&e.home.district===district).sort((a,b)=>a.id.localeCompare(b.id));
const ident=e=>({id:e.id,name:e.name,age:e.age,sex:e.sex,species:e.species,culture:e.culture,occupation:e.occupation,householdId:e.householdId,home:e.home});

// One campaign reaches the orc valley through the copper ridge; reused below.
let A=engine.createCharacter(seed,{},'t143-same');A.state.location='loc_bs';
A=await walk(A,['loc_far_tongji','loc_far_duanqi'],'a');
const zheya=A.state.remote[ZHEYA].skeleton,orcSeat=zheya.seat;
A=await walk(A,[orcSeat,...zheya.settlements[0].districts.flatMap(d=>[d,orcSeat])],'a2');

test('种子确定性：同一战役种子不论路线先后，郡骨架与住区名册一致；换种子则不同',async()=>{
    assert.deepEqual(generateCounty(world,ZHEYA,'seed-x'),generateCounty(world,ZHEYA,'seed-x'));
    assert.notDeepEqual(generateCounty(world,ZHEYA,'seed-x').people.map(p=>p.name),generateCounty(world,ZHEYA,'seed-y').people.map(p=>p.name));
    // Same seed, another route and order: through a Baishi district first.
    let B=engine.createCharacter(seed,{},'t143-same');B.state.location='loc_bs';
    B=await walk(B,['loc_bs_hebu','loc_bs','loc_far_tongji','loc_far_duanqi',orcSeat],'b');
    assert.deepEqual(B.state.remote[ZHEYA].skeleton,zheya);assert.equal(B.state.remote[ZHEYA].hash,A.state.remote[ZHEYA].hash);
    assert.deepEqual(B.state.remote[TONGJI].skeleton,A.state.remote[TONGJI].skeleton);
    const den=zheya.settlements[0].districts[1];
    B=await walk(B,[den],'b2');
    assert.deepEqual(roster(B,den).map(ident),roster(A,den).map(ident));
    // The skeleton never depends on which other counties were generated first.
    let C=engine.createCharacter(seed,{},'t143-same');C.state.location='loc_far_tongji';
    C=await walk(C,['loc_far_duanqi'],'c');
    assert.deepEqual(C.state.remote[ZHEYA].skeleton,zheya);
});

test('非人统治区按巢窟营结构生成，物种与文化取自T142的cultures与factions',async()=>{
    assert.equal(zheya.kind,'orc');
    const seat=zheya.settlements[0],profile=zheya.profiles.find(p=>p.id===seat.id),names=seat.districts.map(id=>zheya.locations.find(l=>l.id===id).name);
    assert.ok(names.filter(n=>n.endsWith('营')).length>=2&&names.some(n=>n.endsWith('矮洞'))&&names.some(n=>n.endsWith('石窝')),names.join(','));
    assert.deepEqual(Object.keys(profile.pendingSpeciesStructure).sort(),['monster_ash_cave_goblin','monster_moss_back_troll','monster_split_tusk_orc']);
    assert.equal(zheya.locations.find(l=>l.id===seat.buildings[0]).purpose,'议事区');
    assert.ok(zheya.settlements.slice(1).every(s=>s.name.endsWith('营地')&&s.level==='村'));
    // Every rostered member follows the orc valley's naming rule by species.
    const all=Object.values(A.state.created).filter(e=>e.generated==='population'&&e.settlement===orcSeat);
    assert.equal(all.length,profile.pendingPopulation);
    for(const e of all){
        assert.equal(e.culture,'culture_far_orc');
        if(e.species==='monster_ash_cave_goblin')assert.match(e.name,/^锉/);
        else if(e.species==='monster_moss_back_troll')assert.match(e.name,/^磐/);
        else assert.match(e.name,/^[兀喀骨虎嘎].·.+部$/);
    }
    const den=seat.districts.find(id=>zheya.locations.find(l=>l.id===id).name.endsWith('矮洞'));
    assert.ok(roster(A,den).length&&roster(A,den).every(e=>e.species==='monster_ash_cave_goblin'));
    assert.ok(roster(A,den).filter(e=>e.age<18).every(e=>e.occupation==='由部里照看'&&!e.flags.romanceable));
    // Key people of the outline hold their faction; 锉/磐 names keep goblin and troll bodies.
    for(const p of zheya.people.filter(p=>p.keyPerson))assert.equal(p.faction,'faction_far_orcmoot');
    // Wood spirits root on slopes; scent-kin live in burrows; the shared forest keeps a forester quarter.
    const lignum=generateCounty(world,'county_wushan_shanyi','t143-same');
    assert.equal(lignum.kind,'lignum');
    assert.ok(lignum.profiles.every(p=>Object.keys(p.populationTemplate.composition).join()==='monster_knot_elm_sprite'));
    assert.ok(lignum.locations.filter(l=>l.purpose==='住区').every(l=>l.name.endsWith('扎根处')));
    const elder=lignum.people.find(p=>p.id==='npc_t142_lignum_elder');assert.equal(elder.name,'杉霜');assert.equal(elder.age,world.factionPeople.find(p=>p.id===elder.id).age);
    const beast=generateCounty(world,'county_feicui_xiudao','t143-same');
    assert.equal(beast.kind,'beast');assert.ok(beast.settlements.slice(1).every(s=>s.name.endsWith('穴')));
    assert.ok(beast.locations.filter(l=>l.purpose==='住区').every(l=>l.name.endsWith('坡屋')));
    const shared=generateCounty(world,'county_feicui_lieer','t143-same'),sp=shared.profiles[0].populationTemplate;
    assert.deepEqual([...new Set(Object.values(sp.districts).map(d=>d.culture))].sort(),['culture_beast','culture_canopy']);
    // Human counties keep a town-and-village layout instead.
    const tongji=A.state.remote[TONGJI].skeleton;
    assert.equal(tongji.kind,'human');assert.equal(tongji.settlements[0].level,'城');assert.ok(tongji.settlements.some(s=>s.level==='村'));
});

test('自动接入：派生商店与补货、交易事件、声望与立场传导、行政级别、传闻、路线与栖地接口',async()=>{
    let doc=engine.createCharacter(seed,{},'t143-systems');doc.state.location='loc_bs';
    doc=await walk(doc,['loc_far_tongji'],'s');
    const sk=doc.state.remote[TONGJI].skeleton,shop=sk.settlements[0].shops[0];
    // K08：开局有限货源是同地行商的真实行囊，不是到集日刷库存。
    // 手算：每种货的掌柜开架 amount + 行商(maximum-amount) = maximum。
    const keeper=sk.people.find(p=>p.id===shop.keeper),supplier=sk.people.find(p=>p.consignment?.keeper===shop.keeper);
    assert.ok(supplier&&doc.state.npcs[supplier.id]);
    assert.equal(doc.state.npcs[supplier.id].location,shop.location);
    for(const row of keeper.shopRestock){
        assert.equal(keeper.inventory[row.item]+supplier.inventory[row.item],row.maximum);
        assert.equal(supplier.consignment.origins[row.item],row.from);
    }
    let overlay=engine.scoped(doc);
    // K10 shop derivation picks the keeper up by shopType; no hand registration.
    const store=shopStores(overlay.world).find(s=>s.keeper===shop.keeper);
    assert.ok(store?.derived);assert.equal(store.settlement,sk.seat);assert.ok(store.restock.every(r=>r.source==='route'&&r.from));
    assert.ok(reputationSettlements(overlay).includes(sk.seat)&&sk.settlements.every(s=>reputationSettlements(overlay).includes(s.id)));
    assert.deepEqual(adminLevel(overlay,doc.state,sk.seat),{level:'城',superior:TONGJI,since:null,record:null});
    assert.equal(adminLevel(overlay,doc.state,TONGJI).level,'郡');
    assert.equal(adminLevel(overlay,doc.state,sk.settlements.find(s=>s.level==='村').id).superior,sk.seat);
    const office=sk.offices.find(o=>o.level==='郡');assert.equal(overlay.byId.get(office.holder).name,world.regions.find(r=>r.id===TONGJI).keyPeople[0].name);
    doc=await walk(doc,[shop.location],'s2');
    let r=await engine.reduce(doc,{tool:'world_time',args:{until:{dayOffset:1,hour:10}},eventId:'s-wait'});doc=applyPatches(doc,r.patches);
    const item=Object.keys(doc.state.npcs[shop.keeper].inventory)[0];
    r=await engine.reduce(doc,{tool:'world_trade',args:{seller:shop.keeper,item,quantity:1},eventId:'s-buy'});doc=applyPatches(doc,r.patches);
    assert.equal(r.result.seller,shop.keeper);
    assert.equal(doc.state.records['world_event:s-buy'].location,shop.location);
    // S5-02 / 15 §15.2: derived shop attribution is in the native receipt;
    // the current quote is not a stored record.
    assert.equal(r.result.pricing.shop,store.id);
    r=await engine.reduce(doc,{tool:'world_time',args:{minutes:1440*2},eventId:'s-days'});doc=applyPatches(doc,r.patches);
    const ledger=doc.state.records[`shop:${store.id}`];
    assert.ok(ledger.entries.some(e=>e.source==='route'&&e.from&&e.added>0),JSON.stringify(ledger.entries));
    for(const row of keeper.shopRestock){
        const delivered=ledger.entries.filter(e=>e.item===row.item&&e.from===supplier.id).reduce((n,e)=>n+e.added,0);
        assert.ok(delivered<=supplier.inventory[row.item]);
    }
    // K4 standing: what is done to a member reaches the generated settlement.
    overlay=engine.scoped(doc);
    assert.ok(collectivesOf(overlay,doc.state,shop.keeper).some(c=>c.holder===sk.seat));
    const d={document:doc,get(...k){return k.reduce((o,x)=>o?.[x],this.document);},set(p,v){this.document=applyPatches(this.document,[{op:'set',path:p,value:v}]);}};
    transmitStanding(d,overlay,[{id:'gift-far',verb:'gift',actor:'player',target:shop.keeper,value:120,witnesses:[],tags:['gift'],minute:doc.state.minute}]);
    assert.ok(standing(overlay,d.document.state,sk.seat,'player')>0);
    // Rumor seeds from the outline's own relations, told by the seat's keepers.
    const rumors=npcRumors(overlay,shop.keeper,doc);assert.ok(rumors.length&&rumors.every(x=>x.id.startsWith('rumor_rg_hanlu_tongji_')));
    const scene=overlay.scene(doc,'');assert.match(scene,/远方郡骨架/);assert.match(scene,/可讲述/);
    // Roads: the trunk road reaches a generated village; neighbours without a node get a road and a seat.
    const village=sk.settlements.find(s=>s.level==='村');
    const route=overlay.route('loc_bs',village.id,'walk',doc.state.minute,doc.randomSeed);
    assert.ok(route.edges.includes('route_far_bs_tongji')&&route.edges.some(e=>e.startsWith('route_rg_')));
    assert.ok(sk.routes.some(x=>x.id.startsWith('route_rg_link_')&&x.to==='loc_rg_hanlu_tuixie'||x.from==='loc_rg_hanlu_tuixie'));
    assert.equal(remoteCountyOf(overlay.world,'loc_rg_hanlu_tuixie'),'county_hanlu_tuixie');
    // K8 interface: county wild land carries terrain and biome words, with no owner or access.
    const wild=sk.locations.find(l=>l.purpose==='野地');
    assert.ok(!wild.owner&&!wild.access&&!wild.rooms&&wild.biome.length);
    assert.ok(locationTraits(wild).tags.includes('stone'));
    // K8 derives the wild land's habitat on arrival and stocks it in the campaign; districts are not wild.
    const eco=doc.state.records[`ecology:habitat_auto_${wild.id}`];
    assert.ok(eco&&Object.values(eco.populations).some(p=>p.count>0));
    assert.ok(!Object.keys(doc.state.records).some(k=>k.startsWith('ecology:habitat_auto_loc_rg_')&&!k.endsWith('_wild')));
    assert.equal(regionOf(overlay.world,village.districts[0]).county.id,TONGJI);
});

async function server(t,root,{generator}={}){
    const app=express();app.use(express.json({limit:'500mb'}));const router=express.Router();
    await init(router,{baseRoot:root,world,populationGenerator:generator,consistencyEnabled:false,npcPlanningEnabled:false});app.use(router);
    const listener=app.listen(0,'127.0.0.1');await once(listener,'listening');t.after(()=>listener.close());
    return async(endpoint,body)=>{
        const response=await fetch(`http://127.0.0.1:${listener.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const json=await response.json();if(response.status!==200)throw Error(`${endpoint} ${response.status} ${json.error}`);return json;
    };
}
const tempRoot=async t=>{const root=await fs.mkdtemp(path.join(tmpRoot(),'remote-generation-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;};
function generator({bad=null}={}){
    const calls=[];
    const generate=async brief=>{
        calls.push(brief.identity.id);const i=brief.identity;
        const profile={personality:{traits:['说话直'],values:['守约'],flaws:['急躁']},voice:{register:'短促',accent:'谷里口音',habits:['拍胸口两下'],samples:['说定了。']},
            background:`${i.name}是${i.title??i.occupation}，在谷里住了多年。`,currentConcern:'今年的互市别出岔子。',goals:['守住约定'],fears:['再起战事'],knowledge:{unknown:['王都的消息']},relationships:[],visibleFeature:'额上抹着赭土'};
        return {profile:bad?bad(profile,brief):profile,calls:2,model:'mock'};
    };
    generate.calls=calls;return generate;
}

test('进出与重启一致；关键人物首次交谈按S5流程建档且身份与纲要一致',async t=>{
    const root=await tempRoot(t);let request=await server(t,root,{generator:generator()});
    const campaignId=(await request('/create',{name:'测试旅人'})).reference.campaignId;
    const first=await request('/execute',{campaignId,tool:'world_move',args:{destination:'loc_far_duanqi'},eventId:'r1'});
    assert.equal(first.result.remote.county,ZHEYA);
    let {document}=await request('/read',{campaignId});
    const sk=document.state.remote[ZHEYA].skeleton,seat=sk.seat,chief=sk.people.find(p=>p.id==='npc_t142_orc_chief');
    const outline=world.factionPeople.find(p=>p.id==='npc_t142_orc_chief');
    for(const k of ['name','age','culture','faction','occupation'])assert.equal(chief[k],outline[k],k);
    assert.equal(chief.title,'部盟首领');assert.equal(chief.location,sk.settlements[0].buildings[0]);
    const young=sk.people.find(p=>p.name==='骨芒·碎岩部');assert.ok(young.keyPerson&&young.age<=32&&young.species==='monster_split_tusk_orc');
    // Walking out and back never regenerates.
    await request('/execute',{campaignId,tool:'world_move',args:{destination:seat},eventId:'r2'});
    await request('/execute',{campaignId,tool:'world_move',args:{destination:'loc_far_duanqi'},eventId:'r3'});
    const back=await request('/execute',{campaignId,tool:'world_move',args:{destination:chief.location},eventId:'r4'});
    assert.equal(back.result.remote,undefined);
    const before=(await request('/read',{campaignId})).document;
    assert.deepEqual(before.state.remote[ZHEYA].skeleton,sk);
    // A profile without the outline office is refused, the identity kept.
    const bad=generator({bad:p=>({...p,background:'我只是个放羊的。'})});
    request=await server(t,root,{generator:bad});
    let res=await request('/scene',{campaignId,query:'兀烈·赭牙部，你好'});
    assert.equal(res.populationProfiles[0].status,'failed');assert.match(res.populationProfiles[0].reason,/纲要职务/);
    document=(await request('/read',{campaignId})).document;
    assert.equal(document.state.remote[ZHEYA].profiles.npc_t142_orc_chief.failures,1);assert.equal(document.state.npcs.npc_t142_orc_chief,undefined);
    // Restart with a sound drafter: full profile once, identity unchanged, no purse.
    const good=generator();request=await server(t,root,{generator:good});
    const restarted=(await request('/read',{campaignId})).document;
    assert.deepEqual(restarted.state.remote,document.state.remote);assert.deepEqual(restarted.state.created,document.state.created);
    res=await request('/scene',{campaignId,query:'兀烈·赭牙部，你好'});
    assert.equal(res.populationProfiles[0].status,'full');assert.match(res.scene,/兀烈·赭牙部/);
    document=(await request('/read',{campaignId})).document;
    const stored=document.state.remote[ZHEYA].profiles.npc_t142_orc_chief;
    assert.equal(stored.status,'full');assert.match(stored.profile.background,/部盟首领/);
    assert.equal(document.state.npcs.npc_t142_orc_chief.coins,0);assert.deepEqual(document.state.npcs.npc_t142_orc_chief.inventory,{});
    const overlay=engine.scoped(document),entity=overlay.byId.get('npc_t142_orc_chief');
    for(const k of ['name','age','culture','faction','occupation','title'])assert.equal(entity[k],chief[k],k);
    assert.equal(entity.profileStatus,'full');assert.ok(!overlay.world.factionPeople.some(p=>p.id==='npc_t142_orc_chief'));
    assert.equal(overlay.resolve('兀烈·赭牙部'),'npc_t142_orc_chief');
    // Talking again never redrafts.
    const calls=good.calls.length;await request('/scene',{campaignId,query:'兀烈·赭牙部，再说两句'});assert.equal(good.calls.length,calls);
    // Export and import replay the ledger into the same campaign.
    const bundle=await request('/export',{campaignId}),imported=await request('/import',{bundle});
    assert.deepEqual(imported.document.state.remote,document.state.remote);assert.deepEqual(imported.document.state.npcs.npc_t142_orc_chief,document.state.npcs.npc_t142_orc_chief);
    // Age claims and changed identity are refused by the same checker.
    assert.match(checkGeneratedProfile(entity,{...stored.profile,background:`${entity.title}，活了${entity.age+30}岁`}).join(),/年龄/);
    assert.match(checkGeneratedProfile(entity,{...stored.profile,name:'别人'}).join(),/身份/);
});

test('不写回world；未生成的远方人数不算进完整档',async()=>{
    assert.equal(await worldDigest(),digestBefore);assert.equal(digest(world),worldBefore);
    assert.equal(engine.world,world);assert.ok(!world.locations.some(l=>l.generated==='remote'));
    const overlay=engine.scoped(A);
    const full=list=>list.filter(p=>p.tier==='full').length;
    assert.equal(full(overlay.world.npcs),full(world.npcs));assert.equal(full(overlay.world.residents),full(world.residents??[]));
    assert.ok(Object.values(A.state.remote).every(r=>Object.keys(r.profiles).length===0));
    assert.ok(Object.values(A.state.created).every(e=>e.profileStatus!=='full'));
    // Outline population is an estimate; the rostered quota is far smaller and only partly unfolded.
    const census=zheya.census;assert.ok(census.outlineNumber>census.rostered);
    const unfolded=Object.values(A.state.population).filter(p=>p.template.settlement.startsWith('loc_rg_')).reduce((n,p)=>n+p.basis.pendingPopulation-p.remaining.population,0);
    assert.ok(unfolded<census.rostered);
    // A base engine never sees the overlay: the same document read through it is rerouted.
    assert.equal(remoteWorld(world,{}),world);
});
