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
import {populationTemplate,populationPlan,populationBasis,unfoldPopulationAt,checkGeneratedProfile,bucketOf} from '../server-plugin/population.mjs';
import {conversationCandidates} from '../server-plugin/population-service.mjs';
import {validatePopulation} from '../tools/population-validation.mjs';

const baseline=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const worldFiles=await fs.readdir('world/geo');
const worldDigestBefore=digest(await Promise.all(worldFiles.map(f=>fs.readFile(path.join('world/geo',f),'utf8'))));
const BS_DISTRICTS=['loc_bs_dongxue','loc_bs_guanqian','loc_bs_hebu','loc_bs_luxiang','loc_bs_nanshi','loc_bs_zhanxi'];

// Mock drafting model: echoes the assigned identity and household verbatim.
function goodProfile(brief){
    return {personality:{traits:['细心','话少'],values:['答应的事做完'],flaws:['遇事先往坏处想']},
        voice:{register:'语速平稳',accent:'本地口音',habits:['先听人说完'],samples:['你先说，我听着。','这活我做惯了。']},
        background:`${brief.identity.name}一直住在本区，平日以${brief.identity.occupation}为生，和同户的人分担家务。`,
        currentConcern:'担心这几天的雨耽误手上的活。',goals:['把手上的活做稳'],fears:['家里有人生病'],knowledge:{unknown:['镇外的新消息']},
        relationships:brief.identity.household.map(h=>({with:h.id,relation:h.relation,note:'同住一户'})),visibleFeature:'袖口常挽到肘上'};
}
function mockGenerator({failFor=new Set(),bad=null}={}){
    const calls=[];
    const generate=async brief=>{
        calls.push(brief.identity.id);
        if(failFor.has(brief.identity.id)){failFor.delete(brief.identity.id);throw Error('模拟模型超时');}
        return {profile:bad?bad(brief):goodProfile(brief),calls:2,model:'mock'};
    };
    generate.calls=calls;return generate;
}

async function server(t,root,{world=baseline,generator}={}){
    const app=express();app.use(express.json({limit:'500mb'}));const router=express.Router();
    await init(router,{baseRoot:root,world,populationGenerator:generator,consistencyEnabled:false,npcPlanningEnabled:false});app.use(router);
    const listener=app.listen(0,'127.0.0.1');await once(listener,'listening');t.after(()=>listener.close());
    return async(endpoint,body)=>{
        const response=await fetch(`http://127.0.0.1:${listener.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const json=await response.json();if(response.status!==200)throw Error(`${endpoint} ${response.status} ${json.error}`);return json;
    };
}
const tempRoot=async t=>{const root=await fs.mkdtemp(path.join(tmpRoot(),'population-on-demand-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;};
const seeded=(document,district)=>Object.values(document.state.created).filter(e=>e.generated==='population'&&e.home.district===district);
const identity=e=>({id:e.id,name:e.name,age:e.age,sex:e.sex,species:e.species,householdId:e.householdId,household:e.household,home:e.home,occupation:e.occupation,kin:e.kin});

async function enterHebu(request){
    const created=await request('/create',{name:'测试旅人'}),campaignId=created.reference.campaignId;
    const moved=await request('/execute',{campaignId,tool:'world_move',args:{destination:'loc_bs_hebu'},eventId:'walk-hebu'});
    return {campaignId,moved};
}

test('到访未展开住区按种子生成稳定名册，只扣剩余配额，不写回共享world',async t=>{
    const request=await server(t,await tempRoot(t),{generator:mockGenerator()});
    const {campaignId,moved}=await enterHebu(request);
    assert.equal(moved.result.population.district,'loc_bs_hebu');
    const {document}=await request('/read',{campaignId}),record=document.state.population.loc_bs,people=seeded(document,'loc_bs_hebu');
    assert.equal(people.length,moved.result.population.people);assert.ok(people.length>0);
    assert.equal(record.remaining.population,694-people.length);
    assert.equal(record.remaining.households,210-record.districts.loc_bs_hebu.households.length);
    // Roster identities are consistent: household, district, trade, age flags, no purse.
    for(const e of people){
        assert.equal(e.profileStatus,'roster');assert.equal(e.location,'loc_bs_hebu');assert.equal(document.state.npcs[e.id],undefined);
        assert.ok(record.template.districts.loc_bs_hebu.work.includes(e.occupation)||e.age<18);
        assert.equal(e.flags.minor,e.age<18);assert.equal(e.flags.romanceable,e.age>=18);
        for(const k of e.kin)assert.ok(e.household.includes(k.with));
        for(const k of e.kin.filter(k=>k.relation==='子女'))assert.ok(e.age-k.age>=16);
    }
    const scene=await request('/scene',{campaignId,query:''});
    assert.match(scene.scene,/本区按需登记住户/);
    // Walking out and back in never generates the district again.
    await request('/execute',{campaignId,tool:'world_move',args:{destination:'loc_bs'},eventId:'out'});
    const back=await request('/execute',{campaignId,tool:'world_move',args:{destination:'loc_bs_hebu'},eventId:'back'});
    assert.equal(back.result.population,undefined);
    const again=(await request('/read',{campaignId})).document;
    assert.deepEqual(seeded(again,'loc_bs_hebu').map(identity),people.map(identity));
    assert.equal(again.state.population.loc_bs.remaining.population,record.remaining.population);
    const after=digest(await Promise.all(worldFiles.map(f=>fs.readFile(path.join('world/geo',f),'utf8'))));
    assert.equal(after,worldDigestBefore);
    assert.equal(baseline.settlementProfiles.find(p=>p.id==='loc_bs').pendingPopulation,694);
});

test('首次交谈才生成完整档；生成失败保留身份、不发钱物，再访可重试；之后不再改变',async t=>{
    const root=await tempRoot(t),generator=mockGenerator();
    const request=await server(t,root,{generator});
    const {campaignId}=await enterHebu(request);
    let {document}=await request('/read',{campaignId});
    const person=seeded(document,'loc_bs_hebu').find(e=>e.age>=18),before=identity(person);
    // Arrival alone never drafts anyone.
    await request('/scene',{campaignId,query:'我在街上四处看看'});assert.equal(generator.calls.length,0);
    // Failure: identity kept, no money or goods, failure counted.
    generator.calls.length=0;const failing=mockGenerator({failFor:new Set([person.id])});
    const request2=await server(t,root,{generator:failing});
    const failed=await request2('/scene',{campaignId,query:`我走过去和${person.name}打招呼`});
    assert.equal(failed.populationProfiles[0].status,'failed');
    document=(await request2('/read',{campaignId})).document;
    assert.deepEqual(identity(document.state.created[person.id]),before);
    assert.equal(document.state.created[person.id].profileStatus,'roster');
    assert.equal(document.state.npcs[person.id],undefined);
    assert.equal(document.state.population.loc_bs.profiles[person.id].failures,1);
    const remaining=document.state.population.loc_bs.remaining.population;
    // Revisit and talk again: same identity, profile accepted and stored.
    await request2('/execute',{campaignId,tool:'world_move',args:{destination:'loc_bs'},eventId:'leave'});
    await request2('/execute',{campaignId,tool:'world_move',args:{destination:'loc_bs_hebu'},eventId:'return'});
    const ok=await request2('/scene',{campaignId,query:`${person.name}，最近怎么样？`});
    assert.equal(ok.populationProfiles[0].status,'full');
    document=(await request2('/read',{campaignId})).document;
    const full=document.state.created[person.id];
    assert.deepEqual(identity(full),before);assert.equal(full.profileStatus,'full');assert.ok(full.background.includes(person.name));
    assert.equal(document.state.npcs[person.id].coins,0);assert.deepEqual(document.state.npcs[person.id].inventory,{});
    assert.equal(document.state.population.loc_bs.remaining.population,remaining);
    assert.match(ok.scene,new RegExp(person.name));
    // Talking again never redrafts.
    const calls=failing.calls.length;
    const third=await request2('/scene',{campaignId,query:`${person.name}，再聊两句`});
    assert.equal(failing.calls.length,calls);assert.equal(third.populationProfiles,undefined);
    assert.deepEqual((await request2('/read',{campaignId})).document.state.created[person.id],full);
});

test('硬约束：年龄亲属、住址户巢、职业、物种、钱物与未成年人恋爱均被拒绝，失败只记次数',async t=>{
    const engine=new WorldEngine(baseline);let doc=engine.createCharacter(seed,{},'constraints');doc.state.location='loc_bs';
    const moved=await engine.reduce(doc,{tool:'world_move',args:{destination:'loc_bs_hebu'},eventId:'c1'});doc=applyPatches(doc,moved.patches);
    const record=doc.state.population.loc_bs,people=seeded(doc,'loc_bs_hebu');
    const adult=people.find(e=>e.age>=18&&e.kin.length),minor=people.find(e=>e.age<18);
    const brief=e=>({identity:{...e,household:e.kin.map(k=>({id:k.with,relation:k.relation}))}});
    const opts={template:record.template};
    assert.deepEqual(checkGeneratedProfile(adult,goodProfile(brief(adult)),opts),[]);
    const cases=[
        [adult,p=>({...p,age:adult.age+3}),/身份/],
        [adult,p=>({...p,background:`${adult.age+20}岁时离家`}),/年龄/],
        [adult,p=>({...p,relationships:[{with:'npc_bs_002_1',relation:'伴侣'}]}),/不在本户/],
        [adult,p=>({...p,relationships:[{with:adult.kin[0].with,relation:'陌生人'}]}),/亲属关系/],
        [adult,p=>({...p,home:{district:'loc_bs_nanshi'}}),/身份/],
        [adult,p=>({...p,occupation:'御前将军'}),/身份/],
        [adult,p=>({...p,species:'monster_grey_otter'}),/身份/],
        [adult,p=>({...p,coins:50}),/钱物/],
        [adult,p=>({...p,inventory:{item_ration:3}}),/钱物/],
        [minor,p=>({...p,currentConcern:'偷偷喜欢隔壁的人，想和对方约会'}),/未成年/],
    ];
    for(const [who,mutate,pattern]of cases){
        const errors=checkGeneratedProfile(who,mutate(goodProfile(brief(who))),opts);
        assert.ok(errors.some(e=>pattern.test(e)),`${pattern}：${errors.join('；')}`);
    }
    // Skeleton-level checks on the identity itself.
    assert.ok(checkGeneratedProfile({...adult,occupation:'御前将军'},goodProfile(brief(adult)),opts).some(e=>/职业/.test(e)));
    assert.ok(checkGeneratedProfile({...adult,species:'monster_grey_otter'},goodProfile(brief(adult)),opts).some(e=>/物种/.test(e)));
    assert.ok(checkGeneratedProfile({...adult,home:{...adult.home,district:'loc_hw'},location:'loc_hw'},goodProfile(brief(adult)),opts).some(e=>/住区/.test(e)));
    assert.ok(checkGeneratedProfile({...minor,flags:{minor:true,romanceable:true}},goodProfile(brief(minor)),opts).some(e=>/未成年/.test(e)));
    // The reducer re-checks, so an imported or forged event cannot store a bad profile.
    await assert.rejects(engine.reduce(doc,{type:'population_profile',person:minor.id,outcome:'accepted',profile:{...goodProfile(brief(minor)),background:'和人订婚了'}}),/硬约束/);
    await assert.rejects(engine.reduce(doc,{type:'population_profile',person:'npc_bs_002_1',outcome:'accepted',profile:goodProfile(brief(adult))}),/名册人物/);
    const failed=await engine.reduce(doc,{type:'population_profile',person:adult.id,outcome:'failed',reason:'x'});
    assert.deepEqual(failed.patches.map(p=>p.path.slice(0,3).join('/')),['state/population/loc_bs']);
});

test('重启、导出导入与 world_upgrade 后仍是同一人，未展开住区继续按原种子生成',async t=>{
    const root=await tempRoot(t);
    let request=await server(t,root,{generator:mockGenerator()});
    const {campaignId}=await enterHebu(request);
    let {document}=await request('/read',{campaignId});
    const person=seeded(document,'loc_bs_hebu').find(e=>e.age>=18);
    await request('/scene',{campaignId,query:`你好，${person.name}`});
    const before=(await request('/read',{campaignId})).document;
    const full=before.state.created[person.id];assert.equal(full.profileStatus,'full');
    // Restart: a new plugin instance over the same files.
    request=await server(t,root,{generator:mockGenerator()});
    const restarted=(await request('/read',{campaignId})).document;
    assert.deepEqual(restarted.state.created,before.state.created);assert.deepEqual(restarted.state.population,before.state.population);
    // Export and import replay the ledger into an identical campaign.
    const bundle=await request('/export',{campaignId}),imported=await request('/import',{bundle});
    assert.deepEqual(imported.document.state.created[person.id],full);assert.deepEqual(imported.document.state.population,before.state.population);
    // World upgrade: a new edition (here also with a changed seed and quota) keeps the campaign's people and plan.
    const next=structuredClone(baseline);next.version=`${baseline.version}-pop-upgrade`;
    const profile=next.settlementProfiles.find(p=>p.id==='loc_bs');profile.populationSeed='another-seed';
    request=await server(t,root,{world:next,generator:mockGenerator()});
    const upgraded=(await request('/read',{campaignId})).document;
    assert.equal(upgraded.worldSourceHash,digest(next));assert.notEqual(upgraded.worldHash,before.worldHash);
    assert.deepEqual(upgraded.state.created,before.state.created);assert.deepEqual(upgraded.state.population,before.state.population);
    assert.deepEqual(upgraded.state.npcs[person.id],before.state.npcs[person.id]);
    // Next district after the upgrade matches what the original seed planned.
    await request('/execute',{campaignId,tool:'world_move',args:{destination:'loc_bs'},eventId:'u1'});
    await request('/execute',{campaignId,tool:'world_move',args:{destination:'loc_bs_zhanxi'},eventId:'u2'});
    const later=(await request('/read',{campaignId})).document;
    const planned=populationPlan(populationTemplate(baseline,'loc_bs'),populationBasis(baseline,'loc_bs')).households.filter(h=>h.district==='loc_bs_zhanxi').flatMap(h=>h.members.map(m=>[m.id,m.name,m.age]));
    assert.deepEqual(seeded(later,'loc_bs_zhanxi').map(e=>[e.id,e.name,e.age]),planned);
    const scene=await request('/scene',{campaignId,query:''});assert.match(scene.scene,/本区按需登记住户/);
});

test('同种子同住区结果一致；全部住区展开后恰好用完配额，超额拒绝',async()=>{
    const engine=new WorldEngine(baseline);
    async function walk(randomSeed,order){
        let doc=engine.createCharacter(seed,{},randomSeed);doc.state.location='loc_bs';
        for(const [i,district]of order.entries()){
            for(const destination of ['loc_bs',district]){const r=await engine.reduce(doc,{tool:'world_move',args:{destination},eventId:`${randomSeed}-${i}-${destination}`});doc=applyPatches(doc,r.patches);}
        }
        return doc;
    }
    const a=await walk('seed-a',BS_DISTRICTS),b=await walk('seed-b',[...BS_DISTRICTS].reverse());
    for(const district of BS_DISTRICTS)assert.deepEqual(seeded(a,district).map(identity),seeded(b,district).map(identity));
    const all=Object.values(a.state.created).filter(e=>e.generated==='population'),profile=baseline.settlementProfiles.find(p=>p.id==='loc_bs');
    assert.equal(all.length,profile.pendingPopulation);
    assert.equal(new Set(all.map(e=>e.householdId)).size,profile.pendingHouseholdCount);
    const ages={children:0,youngAdults:0,adults:0,elders:0};for(const e of all)ages[bucketOf(e.age)]++;
    assert.deepEqual(ages,profile.pendingAgeStructure);
    assert.deepEqual(a.state.population.loc_bs.remaining,{population:0,households:0,ages:{children:0,youngAdults:0,adults:0,elders:0}});
    const names=new Set([...baseline.npcs,...baseline.residents].map(p=>p.name));
    assert.equal(new Set(all.map(e=>e.name)).size,all.length);assert.ok(all.every(e=>!names.has(e.name)));
    // Household sizes follow the skeleton facts: 146 of three, 64 of four.
    const sizes={};for(const e of all)sizes[e.householdId]=(sizes[e.householdId]??0)+1;
    assert.deepEqual(Object.values(sizes).reduce((m,n)=>(m[n]=(m[n]??0)+1,m),{}),{3:146,4:64});
    // A tampered quota is never exceeded.
    let doc=engine.createCharacter(seed,{},'quota');doc.state.location='loc_bs';
    const first=await engine.reduce(doc,{tool:'world_move',args:{destination:'loc_bs_hebu'},eventId:'q1'});doc=applyPatches(doc,first.patches);
    doc.state.population.loc_bs.remaining.population=3;
    for(const destination of ['loc_bs','loc_bs_zhanxi']){
        if(destination==='loc_bs'){const r=await engine.reduce(doc,{tool:'world_move',args:{destination},eventId:'q2'});doc=applyPatches(doc,r.patches);continue;}
        await assert.rejects(engine.reduce(doc,{tool:'world_move',args:{destination},eventId:'q3'}),/配额/);
    }
    // A different seed yields a different but equally valid roster.
    const other=structuredClone(baseline);other.settlementProfiles.find(p=>p.id==='loc_bs').populationSeed='other-seed';
    const x=populationPlan(populationTemplate(other,'loc_bs'),populationBasis(other,'loc_bs')),y=populationPlan(populationTemplate(baseline,'loc_bs'),populationBasis(baseline,'loc_bs'));
    assert.notDeepEqual(x.households.map(h=>h.members.map(m=>m.name)),y.households.map(h=>h.members.map(m=>m.name)));
    assert.deepEqual(validatePopulation(baseline),[]);
});

// Isolated lair fixture: monster settlements reuse the same generator.
function lairWorld(){
    const w=structuredClone(baseline),root='loc_ms_fixture';
    const loc=(id,name,parent,extra={})=>({id,name,aliases:[],parent,scope:root,coordinates:[0.5,0.5],terrain:'丘陵',openHours:[0,1440],rooms:[],inventory:{},description:`${name}（测试夹具）`,...extra});
    w.locations.push(loc(root,'测试巢窟','loc_hw'),loc(`${root}_north`,'北窟','loc_ms_fixture'),loc(`${root}_south`,'南窟','loc_ms_fixture'));
    const route=(from,to)=>({id:`route_fixture_${from}_${to}`,from,to,lengthKm:0.3,terrainMultiplier:1,modes:['walk'],closedSeasons:[],toll:0,risk:0});
    w.routes.push(route('loc_hw',root),route(root,`${root}_north`),route(root,`${root}_south`));
    const specs=[['north',1,'monster_grey_otter',[40,37,12]],['north',2,'monster_grey_otter',[55,30]],['south',3,'monster_grey_otter',[44,9]],['south',4,'monster_red_ear_fox',[33,31,6]]];
    const residents=[],households=[],ids=[];
    for(const [side,h,species,ages]of specs){
        const home=`bld_fixture_den_${h}`;w.locations.push(loc(home,`第${h}巢`,`${root}_${side}`,{access:{mode:'private',requiresConsent:true,residents:[]}}));
        const members=ages.map((_,j)=>`npc_fixture_${h}_${j+1}`);
        households.push({id:`house_fixture_${h}`,settlement:root,homeLocation:home,members});
        ages.forEach((age,j)=>{
            const id=members[j];ids.push(id);w.locations.find(l=>l.id===home).access.residents.push(id);
            residents.push({id,name:['苔','汀','潮','礁','岚','芦','漪','渚','澜','萍'][ids.length-1]+['伏','衔','游','栖'][h-1],aliases:[],tier:'roster',age,sex:j%2?'女':'男',species,culture:'culture_river',
                settlement:root,scope:root,householdId:`house_fixture_${h}`,household:members.filter(x=>x!==id),occupation:age<18?'看护幼崽':side==='north'?'捕鱼':'修补巢道',
                home:{location:home,access:'同巢共居'},location:home,flags:{minor:age<18,romanceable:age>=18}});
        });
    }
    w.residents.push(...residents);w.households.push(...households);
    w.settlementProfiles.push({id:root,parent:'loc_hw',population:50,householdCount:16,registeredPopulation:ids.length,pendingPopulation:40,registeredHouseholdCount:4,pendingHouseholdCount:12,
        registrationMode:'seeded-on-demand',populationSeed:'fixture-lair-1',residentIds:ids,visitors:[],commuters:[],externalRelatives:[],kinship:[],facts:[],buildingIds:[],
        ageStructure:{children:15,youngAdults:13,adults:18,elders:4},registeredAgeStructure:{children:3,youngAdults:3,adults:4,elders:0},pendingAgeStructure:{children:12,youngAdults:10,adults:14,elders:4}});
    return w;
}

test('怪物巢窟复用同一生成器：物种只取聚居地构成，幼体不入恋爱，首领以外成员按需建档',async t=>{
    const world=lairWorld();assert.deepEqual(validatePopulation(world).filter(e=>/fixture/.test(e)),[]);
    const request=await server(t,await tempRoot(t),{world,generator:mockGenerator()});
    const campaignId=(await request('/create',{name:'测试旅人'})).reference.campaignId;
    await request('/execute',{campaignId,tool:'world_move',args:{destination:'loc_ms_fixture'},eventId:'l1'});
    const entered=await request('/execute',{campaignId,tool:'world_move',args:{destination:'loc_ms_fixture_north'},eventId:'l2'});
    assert.equal(entered.result.population.settlement,'loc_ms_fixture');
    let {document}=await request('/read',{campaignId});
    const den=seeded(document,'loc_ms_fixture_north');assert.ok(den.length>0);
    for(const e of den){
        assert.ok(['monster_grey_otter','monster_red_ear_fox'].includes(e.species));
        assert.ok(['捕鱼','修补巢道','看护幼崽'].includes(e.occupation));
        assert.equal(new Set(den.filter(x=>x.householdId===e.householdId).map(x=>x.species)).size,1);
    }
    const kit=den.find(e=>e.age<18);assert.ok(kit);
    // A drafting model that sneaks romance into a minor's profile is rejected; identity kept.
    const bad=mockGenerator({bad:brief=>({...goodProfile(brief),currentConcern:'想和心上人约会'})});
    const root2=await tempRoot(t),r2=await server(t,root2,{world,generator:bad});
    const c2=(await r2('/create',{name:'测试旅人'})).reference.campaignId;
    await r2('/execute',{campaignId:c2,tool:'world_move',args:{destination:'loc_ms_fixture'},eventId:'m1'});
    await r2('/execute',{campaignId:c2,tool:'world_move',args:{destination:'loc_ms_fixture_north'},eventId:'m2'});
    const d2=(await r2('/read',{campaignId:c2})).document,kit2=seeded(d2,'loc_ms_fixture_north').find(e=>e.age<18);
    assert.deepEqual(identity(kit2),identity(kit));
    const res=await r2('/scene',{campaignId:c2,query:`${kit2.name}，过来一下`});
    assert.equal(res.populationProfiles[0].status,'failed');assert.match(res.populationProfiles[0].reason,/未成年/);
    const after=(await r2('/read',{campaignId:c2})).document;
    assert.equal(after.state.created[kit2.id].profileStatus,'roster');assert.equal(after.state.npcs[kit2.id],undefined);
    // An adult in the original campaign gets a full profile normally.
    const adult=den.find(e=>e.age>=18);
    const ok=await request('/scene',{campaignId,query:`${adult.name}在吗`});assert.equal(ok.populationProfiles[0].status,'full');
    document=(await request('/read',{campaignId})).document;
    assert.equal(document.state.npcs[adult.id].species,adult.species);
    assert.deepEqual(conversationCandidates(new WorldEngine(world),document,`${adult.name}在吗`),[]);
});
