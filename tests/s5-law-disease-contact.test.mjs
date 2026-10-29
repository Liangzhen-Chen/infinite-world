import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {populationHealth,takePopulation,addPopulation,advancePopulationDisease} from '../server-plugin/population-health.mjs';
import {advanceHusbandry} from '../server-plugin/husbandry.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const species='monster_leaf_hare',habitat='habitat_hw_wood',key=`ecology:${habitat}`;
function fixture({infection=.2,recovery=.1,mortality=0,target=species,splitHerd=false,modifiers=[]}={}){
 const w=structuredClone(world);
 if(splitHerd){
  // Reaccount the authored herd into two shares, without changing its physical
  // population, owner, species, location or total capacity. This is the small
  // split fixture explicitly required by K11, not additional world content.
  const row=w.ecology.herds.find(r=>r.species===target);row.count/=2;row.capacity/=2;
  w.ecology.herds.push({...row,id:`${row.id}:split`});
 }
 // Zero means no intervention: registering an active add0 would deliberately
 // invoke the registry's fixed-point modifier path and quantize the authored
 // 1/7 course. The nominal-course anchor must read the untouched native rule.
 for(const [name,value]of Object.entries({infection,recovery,mortality}))if(value)w.derived.modifiers.push({id:`contact-${name}`,pack:'core',target:`health:${name}Rate`,stage:'add',value,when:`target == '${target}'`});
 w.derived.modifiers.push(...modifiers);
 // K60 published hare range, with capacity controls held fixed for this
 // contact experiment. All disease changes still use the native daily clock.
 w.derived.modifiers.push({id:'contact-territory',pack:'core',target:'ecology:territoryCapacity',stage:'max',value:1});
 w.derived.modifiers.push({id:'contact-competition',pack:'core',target:'ecology:competition',stage:'min',value:0,when:`holder == '${target}'`});
 const engine=new WorldEngine(w),document=engine.createCharacter(seed,{},'s5-law-contact');
 return {engine,document,s:engine.byId.get(target)};
}
const pool=(S=90,I=10,R=0)=>({count:S+I+R,health:{S,I,R}});
const sum=rows=>rows.reduce((h,p)=>{const b=populationHealth(p);for(const k of ['S','I','R'])h[k]+=b[k];return h;},{S:0,I:0,R:0});
function step(f,p,K=100){return advancePopulationDisease(f.engine.primitiveDraft(f.document),f.engine,p,'loc_hw_northwood',f.s,K);}
function prepare(f,facts,extra={}){
 const out=applyIntentSetup(f.engine,f.document,{minute:1200,facts,...extra});assert.deepEqual(out.setupUnmet,[]);return out.document;
}
async function wait(f,document,minutes,id){const r=await f.engine.reduce(document,{tool:'world_time',args:{minutes},eventId:id});return applyPatches(document,r.patches);}

test('K11 hand anchor: density I/K, rational .8 remainder, and stable legacy credit',()=>{
 const f=fixture(),p=pool();assert.equal(step(f,p),0);
 // beta .2/day * S90 * I10 / K100 = 1.8 infections; I10*.1=1 recovery.
 assert.deepEqual(p.health,{S:89,I:10,R:1});
 assert.deepEqual(p.diseaseRemainders['disease:infection'],{numerator:'4',denominator:'5'});
 // K doubles the physical room at unchanged N: .9 infections, not 1.8.
 const roomy=pool();step(f,roomy,200);assert.deepEqual(roomy.health,{S:90,I:9,R:1});
 assert.deepEqual(roomy.diseaseRemainders['disease:infection'],{numerator:'9',denominator:'10'});
 // Old cumulative 9.8 already paid 9 bodies; only .8 remains, never another9.
 const old=pool();old.accruals={'disease:infection':{numerator:'49',denominator:'5'}};step(f,old);
 assert.deepEqual(old.health,{S:88,I:11,R:1});
 assert.deepEqual(old.diseaseRemainders['disease:infection'],{numerator:'3',denominator:'5'});
 // The authored seven-day cold course is a ratio, not the rounded decimal
 // approximation of1/7. Exactly seven opening cases recover one body.
 const nominal=fixture({infection:0,recovery:0,mortality:0}),seven={...pool(0,7),disease:'disease:cold'};
 step(nominal,seven);assert.deepEqual(seven.health,{S:0,I:6,R:1});
});

test('same contact group split/merge preserves bodies and all pending disease credits',()=>{
 const f=fixture({mortality:.03}),whole=pool(),source=pool(),shard={count:0};
 step(f,whole);step(f,source);
 const before=structuredClone(source),none=takePopulation(source,0);assert.deepEqual(none,{S:0,I:0,R:0});assert.deepEqual(source,before);
 addPopulation(shard,takePopulation(source,37));assert.deepEqual(sum([source,shard]),whole.health);
 // Shared K100 and shared I: splitting accounts never creates two epidemics.
 for(let day=0;day<30;day++){
  step(f,whole);step(f,[source,shard]);assert.deepEqual(sum([source,shard]),whole.health);
  assert.equal(source.count+shard.count,whole.count);
  assert.equal((source.diseaseDeaths??0)+(shard.diseaseDeaths??0),whole.diseaseDeaths);
 }
 addPopulation(source,takePopulation(shard,shard.count));assert.equal(shard.count,0);
 step(f,whole);step(f,source);assert.deepEqual(source.health,whole.health);
 // A genuinely isolated S-only space has no source, unlike the shared group.
 const isolated=[pool(90,0),pool(0,10)];for(const p of isolated)step(f,p,50);
 assert.equal(isolated[0].health.S,90);
 assert.throws(()=>takePopulation(source,source.count+1),/无效/);
 assert.throws(()=>populationHealth({count:2,health:{S:1,I:0,R:0}}),/不守恒/);
});

test('merging fractional credits can settle a whole body; shard traversal preserves cohort identity',()=>{
 const f=fixture(),a=pool(),b=pool();step(f,a);step(f,b);
 // Each has .8 pending infections. Reuniting them must keep1.6, not reduce
 // modulo1 before the next physical day. S178,I20,K200 ->3.56 +1.6 =5.16.
 addPopulation(a,takePopulation(b,b.count));assert.deepEqual(a.diseaseRemainders['disease:infection'],{numerator:'8',denominator:'5'});
 step(f,a,200);assert.deepEqual(a.health,{S:173,I:23,R:4});
 assert.deepEqual(a.diseaseRemainders['disease:infection'],{numerator:'4',denominator:'25'});
 const lethal=fixture({infection:0,recovery:0,mortality:.25}),left={...pool(0,2),id:'a'},right={...pool(0,2),id:'b'};
 const reversed=[structuredClone(right),structuredClone(left)];step(lethal,[left,right]);step(lethal,reversed);
 assert.deepEqual(reversed.find(r=>r.id==='a'),left);assert.deepEqual(reversed.find(r=>r.id==='b'),right);
});

test('no source, R-effective below one, zero contact space, immune recovery and imported cases',()=>{
 const f=fixture(),healthy=pool(90,0,10);for(let day=0;day<10;day++)step(f,healthy);
 assert.deepEqual(healthy.health,{S:90,I:0,R:10});
 const emptyRoom=pool();step(f,emptyRoom,0);assert.deepEqual(emptyRoom.health,{S:90,I:9,R:1});
 const low=fixture({infection:.05,recovery:.5}),p=pool(90,10);
 for(let day=0;day<30;day++)step(low,p);assert.equal(p.health.I,0);assert.ok(p.health.R>=10);
 const immune=pool(0,0,100),arriving=pool(0,10);addPopulation(immune,takePopulation(arriving,10));
 for(let day=0;day<30;day++)step(f,immune);assert.equal(immune.health.S,0);assert.equal(immune.count,110);assert.ok(immune.health.R>=109);
 const susceptible=pool(90,0);addPopulation(susceptible,{S:0,I:10,R:0});step(f,susceptible);assert.equal(susceptible.health.S,89);
 const bad=pool(),snapshot=structuredClone(bad);bad.disease='disease:missing';
 assert.throws(()=>step(f,bad),/未登记/);assert.deepEqual(bad,{...snapshot,disease:'disease:missing'});
 assert.throws(()=>step(f,pool(),-1),/接触容量无效/);
});

test('crowding saturates exposed cohorts without overriding another cohorts zero susceptibility',()=>{
 const f=fixture({infection:1,recovery:0,mortality:0,modifiers:[{id:'contact-protection',pack:'core',target:'health:infectionRate',stage:'mul',value:0,when:"subject == 'protected'"}]}),exposed={...pool(1,100),id:'exposed'},protectedPool={...pool(100,0),id:'protected'};
 // I100/K1 gives unit probability after saturation in exposed S1. The local
 // protection correction makes the other S100 ineligible, even in one space.
 advancePopulationDisease(f.engine.primitiveDraft(f.document),f.engine,[exposed,protectedPool],['exposed','protected'],f.s,1);
 assert.deepEqual(exposed.health,{S:0,I:101,R:0});assert.deepEqual(protectedPool.health,{S:100,I:0,R:0});
});

test('native wildlife daily clock matches long wait, save/resume and population ledger',async()=>{
 const f=fixture(),opening=f.document.state.records[key].populations[species];
 // Real opening forest condition lowers published K60 to floor59.x=59:
 // beta .2 * S20 * I8 /59 = 32/59;
 // day1 has zero infections and zero recoveries; credits survive the save.
 const document=prepare(f,[{path:['state','records',key,'populations',species],value:{...opening,health:{S:20,I:8,R:2}}}]);
 const first=await wait(f,document,240,'first');const p=first.state.records[key].populations[species];
 assert.deepEqual(p.health,{S:20,I:8,R:2});assert.deepEqual(p.diseaseRemainders['disease:infection'],{numerator:'32',denominator:'59'});
 const long=await wait(f,document,3*1440,'long');let short=JSON.parse(JSON.stringify(first));
 for(let i=0;i<2;i++)short=await wait(f,short,1440,`short-${i}`);
 short=await wait(f,short,1200,'same-end');
 assert.deepEqual(short.state.records[key].populations[species],long.state.records[key].populations[species]);
 assert.deepEqual(reconcile(f.engine,long),{mismatches:[],lots:[],drift:[],audit:[]});
 assert.deepEqual(document.state.records[key].populations[species].health,{S:20,I:8,R:2});
});

test('native husbandry shares co-located species exposure and keeps real death ledger writes',()=>{
 const original=world.ecology.herds[0],f=fixture({target:original.species,infection:.8,recovery:0,mortality:.5,splitHerd:true});
 const a=f.document.state.records[`husbandry:${original.id}`],b=f.document.state.records[`husbandry:${original.id}:split`];
 // All two opening infections are in A; B is susceptible. Separate disease
 // clocks would wrongly give B no exposure. Four original bodies, total K12.
 const document=prepare(f,[{path:['state','records',`husbandry:${a.id}`],value:{...a,health:{S:0,I:2,R:0}}},{path:['state','records',`husbandry:${b.id}`],value:{...b,health:{S:2,I:0,R:0}}}]);
 const draft=f.engine.primitiveDraft(document);advanceHusbandry(draft,f.engine,0);
 const afterA=draft.get('state','records',`husbandry:${a.id}`),afterB=draft.get('state','records',`husbandry:${b.id}`);
 assert.equal(afterA.diseaseDeaths,1);assert.equal(afterA.count,1);
 // K = two actual capacity shares, shared opening I2, beta .8 + cold .2 =1. No independent
 // no-source early return for B. Infection credit is pooled then distributed.
 assert.ok(BigInt(afterB.diseaseRemainders['disease:infection'].numerator)>0n);
 assert.deepEqual(reconcile(f.engine,draft.document),{mismatches:[],lots:[],drift:[],audit:[]});
 // Compare with the same four original animals kept in one account. The
 // disease flow, physical K12 and final S/I/R must survive the storage split.
 const whole=fixture({target:original.species,infection:.8,recovery:0,mortality:.5});
 const herd=whole.document.state.records[`husbandry:${original.id}`];
 const unsplit=prepare(whole,[{path:['state','records',`husbandry:${original.id}`],value:{...herd,health:{S:2,I:2,R:0}}}]);
 const wd=whole.engine.primitiveDraft(unsplit);advanceHusbandry(wd,whole.engine,0);
 const final=wd.get('state','records',`husbandry:${original.id}`);
 assert.deepEqual(sum([afterA,afterB]),final.health);assert.equal(afterA.diseaseDeaths+afterB.diseaseDeaths,final.diseaseDeaths);
 assert.deepEqual(reconcile(whole.engine,wd.document),{mismatches:[],lots:[],drift:[],audit:[]});
});
