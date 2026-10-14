import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches,digest} from '../server-plugin/storage.mjs';
import {wildlifePriceFactor} from '../server-plugin/wildlife.mjs';
import {validateWildlifeAwakening} from '../server-plugin/wildlife-awakening.mjs';

const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const wood='loc_hw_northwood',fox='monster_red_ear_fox',temple='bld_bs_still_temple';
function setup(seed='awaken-test'){
    const world=structuredClone(source);for(const n of world.npcs){delete n.tier;delete n.schedule;}
    const engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},seed);doc.state.minute=1200;doc.state.location=wood;
    const run=async(c,tool,args,id='e')=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{doc:applyPatches(c,out.patches),result:out.result};};
    const wait=async(c,minutes,id='wait')=>(await run(c,'world_time',{minutes},id)).doc;
    return{world,engine,doc,run,wait};
}
const ecology=c=>c.state.records['ecology:habitat_hw_wood'].populations[fox];
async function tracked(s){
    for(let i=0;i<80;i++){const out=await s.run(s.doc,'world_wildlife',{operation:'track',species:fox},`track${i}`);if(out.result.success)return{doc:out.doc,id:out.result.found.id};}
    throw Error('夹具没有找到成功追踪种子');
}
// Records shaped exactly as T93 initiation/certification/ritual_officiate write them.
function grantPermit(engine,doc,{institution=temple,expires=doc.state.minute+7*DAY}={}){
    const entry=engine.rules.training.institutions.find(e=>e.institution===institution&&e.ritual!==undefined),r=doc.state.records,now=doc.state.minute;
    const init={category:'training_initiation',profession:entry.profession,teacher:entry.teacher,institution,rule:entry.rule,observedSince:0,lastBreach:-1,status:'守戒中',sourceEvent:'init',cost:entry.initiationFee};
    r['training_initiation:init']=init;r['training_source:init']={initiation:structuredClone(init)};
    doc.state.careers??={};doc.state.careers[entry.profession]={initiation:{...init,record:'training_initiation:init'},certification:{teacher:entry.teacher}};
    doc.state.professions.combat=entry.profession;
    const permission={category:'authorization',action:'ritual_officiate',subject:'player',grantee:'player',grantor:entry.teacher,institution,profession:engine.byId.get(entry.profession).name,professionId:entry.profession,deity:entry.deity??null,church:entry.church,createdAt:0,expires,revoked:false,sourceType:'training',sourceEvent:'grant',initiation:'training_initiation:init'};
    r['ritual_permission:grant']=permission;r['ritual_source:grant']={permission:structuredClone(permission)};
    assert.equal(digest(r['ritual_permission:grant']),digest(r['ritual_source:grant'].permission));
    return'ritual_permission:grant';
}

test('正式开灵参数引用真实灵地与灵物；仅靠年岁和经历不能立意',()=>{
    assert.deepEqual(validateWildlifeAwakening(source),[]);
    assert.deepEqual(source.rules.wildlifeAwakening.stages.map(s=>s.name),['听息','立意']);
    for(const change of [w=>w.rules.wildlifeAwakening.spiritItems[0].item='item_missing',w=>w.rules.wildlifeAwakening.spiritLands[0].location='loc_missing',w=>w.rules.wildlifeAwakening.age.maximumPoints=90]){
        const bad=structuredClone(source);change(bad);assert.ok(validateWildlifeAwakening(bad).length);
    }
});

test('只观察不涨进度；未见种群只扣一次；灵物须实有且每日一次',async()=>{
    const s=setup(),before=ecology(s.doc),{doc,id}=await tracked(s);
    assert.equal(ecology(doc).count,before.count-1);assert.equal(ecology(doc).withdrawn,before.withdrawn+1);
    let c=doc;for(let i=0;i<5;i++){const out=await s.run(c,'world_wildlife',{operation:'observe'},`look${i}`);assert.deepEqual(out.doc,doc);c=out.doc;}
    assert.equal(doc.state.creatures[id].mind,undefined);
    await assert.rejects(s.run(doc,'world_wildlife',{operation:'nurture',target:id,item:'item_herb'}),/没有实际的灵物/);
    await assert.rejects(s.run(doc,'world_wildlife',{operation:'nurture',target:id,item:'item_honey'}),/不是登记的灵物/);
    await assert.rejects(s.run(doc,'world_wildlife',{operation:'enlighten',target:id}),/仪式主持资格/);
    await assert.rejects(s.run(doc,'world_wildlife',{operation:'pact',target:id}),/尚未立意/);
    const fed=structuredClone(doc);fed.state.inventory.item_herb=2;
    const first=await s.run(fed,'world_wildlife',{operation:'nurture',target:id,item:'item_herb'},'feed1');
    assert.equal(first.result.success,true);assert.equal(s.engine.quantity({get:(...p)=>p.reduce((v,k)=>v?.[k],first.doc)},'player','item_herb'),1);
    assert.equal(first.doc.state.minute,fed.state.minute+10);
    const mind=first.doc.state.creatures[id].mind;assert.equal(mind.points.item,10);assert.deepEqual(mind.sources.map(r=>[r.kind,r.item,r.by,r.event]),[['item','item_herb','player','feed1']]);
    await assert.rejects(s.run(first.doc,'world_wildlife',{operation:'nurture',target:id,item:'item_herb'},'feed2'),/今天已喂过/);
    assert.deepEqual(ecology(first.doc),ecology(doc));
    for(const key of ['hp','maxHp','level','species','ecology','location','owner'])assert.deepEqual(first.doc.state.creatures[id][key],doc.state.creatures[id][key]);
    // 随人经历只来自受照料且与你同处的宠物；离开你则不累积。
    const pet=structuredClone(doc),m=pet.state.minute;Object.assign(pet.state.creatures[id],{owner:'player',care:{version:1,hunger:0,fatigue:0,mood:60,loyalty:50,sickness:false,sickHours:0,neglectHours:0,nextTick:m+60,bond:0,contactDay:-1,feedDay:-1,groomDay:-1,trainDay:-1,skills:{},experience:0}});
    const together=await s.wait(pet,DAY,'pet-day');assert.equal(together.state.creatures[id].mind.points.experience,1);
    const apart=structuredClone(pet);apart.state.creatures[id].location='loc_hw_fields';
    assert.equal((await s.wait(apart,DAY,'pet-apart')).state.creatures[id].mind,undefined);
});

test('点化须T93仪式资格；时钟觉醒到立意后退出野生统计，收伏改为有边界的同意',async()=>{
    const s=setup(),{doc,id}=await tracked(s);
    const bad=structuredClone(doc);grantPermit(s.engine,bad,{expires:bad.state.minute+30});
    await assert.rejects(s.run(bad,'world_wildlife',{operation:'enlighten',target:id,permit:'ritual_permission:grant'}),/到期/);
    const school=structuredClone(doc);grantPermit(s.engine,school,{institution:'bld_bs_school'});
    await assert.rejects(s.run(school,'world_wildlife',{operation:'enlighten',target:id,permit:'ritual_permission:grant'}),/仪式|职业|认证/);
    const ok=structuredClone(doc),permit=grantPermit(s.engine,ok);
    const taught=await s.run(ok,'world_wildlife',{operation:'enlighten',target:id,permit},'teach1');
    assert.equal(taught.doc.state.minute,ok.state.minute+60);assert.equal(taught.doc.state.creatures[id].mind.points.mentor,25);
    assert.equal(taught.doc.state.creatures[id].mind.sources[0].institution,temple);
    await assert.rejects(s.run(taught.doc,'world_wildlife',{operation:'enlighten',target:id,permit},'teach2'),/今天已点化/);
    // T109 world clock now reaches the real consumer instead of an unimplemented error.
    const r=s.world.rules.worldClock.clocks[0];r.intervalDays=1;r.stages=[{name:'开灵',condition:{kind:'managed_granary'},effect:{kind:'awakening',target:id,points:100}}];
    const start=structuredClone(taught.doc),body=start.state.creatures[id];delete start.state.records[`world-clock:${r.id}`];
    const awakened=await s.wait(start,DAY-start.state.minute%DAY+5,'clock-day');
    const actor=awakened.state.creatures[id],row=awakened.state.records[`world-clock:${r.id}`];
    assert.equal(row.phase,1);assert.equal(actor.mind.awakened.kind,'clock');assert.match(actor.mind.awakened.sourceEvent,/world-clock:/);
    assert.equal(actor.mind.points.clock,100);assert.equal(actor.mind.points.mentor,25);
    for(const key of ['hp','maxHp','level','species','ecology','location','name'])assert.deepEqual(actor[key],body[key]);
    assert.deepEqual(awakened.state.created[id],start.state.created[id]);assert.equal(actor.owner,null);
    assert.equal(ecology(awakened).withdrawn,ecology(start).withdrawn);
    // An awakened individual no longer counts as wild stock or wild prey.
    const drop=s.engine.byId.get(fox).drops[0].item,scarce=structuredClone(awakened);
    for(const rec of Object.values(scarce.state.records).filter(x=>x.category==='ecology'))for(const p of Object.values(rec.populations))p.count=p.initial;
    ecology(scarce).count--;const gone=structuredClone(scarce);delete gone.state.creatures[id];
    const wild=structuredClone(scarce);delete wild.state.creatures[id].mind;
    assert.equal(wildlifePriceFactor(s.engine,scarce,drop,'loc_hw'),wildlifePriceFactor(s.engine,gone,drop,'loc_hw'));
    assert.notEqual(wildlifePriceFactor(s.engine,wild,drop,'loc_hw'),wildlifePriceFactor(s.engine,scarce,drop,'loc_hw'));
    const look=await s.run(awakened,'world_wildlife',{operation:'observe'},'look');
    assert.deepEqual(look.result.animals.find(a=>a.id===id).mind,{stage:'立意',sign:s.engine.rules.wildlifeAwakening.stages[1].sign,communicable:true});
    await assert.rejects(s.run(awakened,'world_pet',{operation:'tame',target:id}),/已立意/);
    await assert.rejects(s.run(awakened,'world_wildlife',{operation:'enlighten',target:id,permit}),/已经立意/);
    const stranger=structuredClone(awakened);stranger.state.creatures[id].mind.sources=[];
    await assert.rejects(s.run(stranger,'world_wildlife',{operation:'pact',target:id}),/没有往来/);
    const pact=await s.run(awakened,'world_wildlife',{operation:'pact',target:id},'pact');
    assert.deepEqual(pact.doc.state.creatures[id].companion.terms,s.engine.rules.wildlifeAwakening.pactTerms);assert.equal(pact.doc.state.creatures[id].owner,null);
    assert.equal(pact.doc.state.pets?.[id],undefined);
    await assert.rejects(s.run(pact.doc,'world_wildlife',{operation:'pact',target:id}),/已与你结缘/);
    // A declined clock effect (already awakened) keeps the phase and the mind unchanged.
    const retry=structuredClone(pact.doc);retry.state.records[`world-clock:${r.id}`].phase=0;
    const again=await s.wait(retry,DAY,'clock-again');assert.equal(again.state.records[`world-clock:${r.id}`].phase,0);
    assert.deepEqual(again.state.creatures[id].mind,pact.doc.state.creatures[id].mind);
});

test('灵地停留自然累积：长短步一致，旧宠物身份解除，存档重放恢复一致',async t=>{
    const s=setup('awaken-natural'),{doc,id}=await tracked(s);
    const start=structuredClone(doc),a=start.state.creatures[id];a.owner='player';a.location=temple;
    start.state.pets??={};start.state.pets[id]={petFormat:1,status:'留守',following:false,category:'support',since:start.state.minute};
    const day15=await s.wait(start,15*DAY,'d15');
    assert.equal(day15.state.creatures[id].mind.points.place,30);assert.equal(day15.state.creatures[id].mind.placeDays[temple],15);
    const view=(await s.run(day15,'world_pet',{operation:'inspect'},'pv')).result.pets.find(p=>p.id===id);
    assert.equal(view.mind.stage,'听息');assert.equal(day15.state.creatures[id].owner,'player');
    let long=start;for(let i=0;i<5;i++)long=await s.wait(long,11*DAY,`long${i}`);
    let split=start;for(let i=0;i<55;i++)split=await s.wait(split,DAY,`short${i}`);
    assert.deepEqual(long.state.creatures[id],split.state.creatures[id]);assert.deepEqual(long.state.pets[id],split.state.pets[id]);
    const actor=long.state.creatures[id];
    assert.equal(actor.mind.awakened.kind,'natural');assert.equal(actor.mind.awakened.formerOwner,'player');
    assert.equal(actor.owner,null);assert.equal(actor.companion.formerPet,true);assert.equal(long.state.pets[id].status,'已解除');
    assert.ok(actor.mind.points.place<=110&&actor.mind.points.item===0&&actor.mind.points.mentor===0);
    for(const key of ['hp','maxHp','level','species','ecology'])assert.deepEqual(actor[key],a[key]);
    assert.equal(ecology(long).withdrawn,ecology(start).withdrawn);
    const stopped=await s.wait(long,10*DAY,'after');assert.deepEqual(stopped.state.creatures[id].mind,actor.mind);
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'awaken-store-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const reducer=(c,input,options)=>s.engine.reduce(c,input,options),store=new CampaignStorage(directory,{reducer});
    await store.create({id:'awaken',worldVersion:s.engine.world.version,document:start});
    for(let i=0;i<3;i++)await store.transact('awaken',{id:`w${i}`,anchor:'a1',input:{tool:'world_time',args:{minutes:20*DAY},eventId:`w${i}`}},reducer);
    const saved=(await store.read('awaken')).document;
    assert.equal(saved.state.creatures[id].mind.awakened.kind,'natural');
    assert.deepEqual((await new CampaignStorage(directory,{reducer}).read('awaken')).document,saved);
    assert.deepEqual((await store.import(await store.export('awaken'),'copy')).document,saved);
});
