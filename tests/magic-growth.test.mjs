import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {validateMagicCatalog} from '../server-plugin/magic.mjs';
import {validateGrowthRules} from '../server-plugin/magic-growth.mjs';

const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const catalog={...source.spells[0],id:'spell_test_growth',name:'试验生长',skill:'skill_test_growth',stage:3,mp:36,minutes:1,duration:10080,rangeMeters:3,materials:[],difficulty:10,effectSpec:{kind:'growth',power:250,unit:'permille'}};
const farm=d=>d.state.records['agriculture:loc_bs_yupo'];
const resource=d=>d.state.records['physical_feature:feature_growth']?.state;
function conservation(d){
 const r=farm(d),s=d.state.settlements.loc_bs_yupo,l=r.ledger;
 assert.equal(r.batches.reduce((n,b)=>n+b.amount,0),s.food);
 assert.equal(r.field.seedBatches.reduce((n,b)=>n+b.amount,0),r.field.seedBank);
 assert.equal(l.openingFood+l.openingSeed+l.freshProduced+l.harvested+l.donated+l.seedDonated,s.food+r.field.seedBank+l.eaten+l.spoiled+l.overflow+l.seedSpent+l.sold);
 const state=resource(d);if(state){assert.equal(state.waterMl+state.growthConsumedWaterMl,1000000);assert.equal(state.nutrientMg+state.growthConsumedNutrientMg,100000);}
}
async function setup({plant=false,day=0}={}){
 const world=structuredClone(source);delete world.rules.settlementTrade;
 for(const n of world.npcs){delete n.tier;delete n.schedule;}
 world.rules.agriculture.crop.growthDays=10;world.rules.agriculture.crop.sowDays=[day,day];
 world.rules.agriculture.crop.minimumTemperatureC=-100;
 const p=world.rules.agriculture.settlements.find(p=>p.settlement==='loc_bs_yupo');p.areaUnits=10;p.initialSeed=12;p.growthFeature='feature_growth';
 const feature={id:'feature_growth',name:'试验已种田垄',kind:plant?'plant':'soil',owner:p.settlement,access:'public',position:[0,0],growth:{field:p.fieldId,settlement:p.settlement},
  state:{waterMl:1000000,capacityMl:1000000,nutrientMg:100000,toxinUg:17,pathogenRisk:30,saltMg:35,baseMoisturePercent:15}};
 world.locations.find(l=>l.id===p.fieldLocation).features??=[];world.locations.find(l=>l.id===p.fieldLocation).features.push(feature);
 world.spells.push(structuredClone(catalog));world.skills.push({id:catalog.skill,name:'试验种植魔法',attribute:'精神',profession:null});
 const engine=new WorldEngine(world),document=engine.createCharacter(legacy,{},'growth-tests');
 document.state.location=p.fieldLocation;document.state.player.maxMp=1000;document.state.player.mp=1000;
 document.state.spells[catalog.id]={source:{type:'fixture'}};document.state.skills[catalog.skill]={proficiency:200,daily:{},breakthroughs:[]};
 document.state.records.permit={category:'authorization',subject:p.fieldId,action:'growth_magic',grantor:p.manager,grantee:'player',expires:1000000};
 const run=async(doc,tool,args,id)=>{const out=await engine.reduce(doc,{tool,args,eventId:id});return{document:applyPatches(doc,out.patches),result:out.result,patches:out.patches};};
 const wait=async(doc,minutes,id)=>run(doc,'world_time',{minutes,activity:'等待'},id);
 const cast=async(doc,id,target=p.fieldId)=>run(doc,'world_cast',{spell:catalog.id,target,authorization:'permit'},id);
 let sown=document;for(let remaining=(day+1)*1440,i=0;remaining>0;i++){const minutes=Math.min(remaining,43200);sown=(await wait(sown,minutes,`sow-day-${i}`)).document;remaining-=minutes;}
 assert.equal(farm(sown).field.cohorts.length,1);assert.equal(farm(sown).ledger.seedSpent,12);
 // Continue growing without offscreen harvest so the public farm_harvest path
 // must actually collect the benefit. This fixture never changes user stock.
 p.farmWorkers=0;
 return{world,engine,p,feature,document,sown,run,wait,cast};
}
async function successfulCast(f,doc=f.sown,id='grow',target=f.p.fieldId){
 for(let i=0;i<20;i++){const out=await f.cast(doc,`${id}-${i}`,target);if(out.result.success)return out;}
 assert.fail('fixture cast never succeeded');
}
test('world_cast → world_time → farm_harvest produces earlier finite real grain, with water/nutrients/seed and source conserved',async()=>{
 const f=await setup(),cast=await successfulCast(f);assert.equal(cast.result.bonusPermille,250);assert.equal(cast.document.state.player.mp,f.sown.state.player.mp-36);
 assert.equal(farm(cast.document).ledger.harvested,0);assert.equal(resource(cast.document),undefined);
 const growth=(await f.wait(cast.document,7*1440,'grown')).document,normal=(await f.wait(f.sown,7*1440,'normal')).document;
 assert.equal(farm(growth).field.cohorts[0].ready,false);
 let matured=(await f.wait(growth,1440,'mature')).document;
 assert.equal(farm(matured).field.cohorts[0].ready,true);assert.equal(farm(normal).field.cohorts[0].ready,false);
 const c=farm(matured).field.cohorts[0],lease=farm(matured).field.growthLeases[0];
 assert.ok(c.growthBonusTicks>0&&c.growthBonusTicks<=10*1440000*.2);assert.equal(lease.waterMl,resource(matured).growthConsumedWaterMl);
 assert.equal(resource(matured).toxinUg,17);assert.equal(resource(matured).pathogenRisk,30);assert.equal(resource(matured).saltMg,35);
 assert.equal(matured.state.records.permit.action,'growth_magic');
 let grain=0;
 for(let i=0;i<30&&farm(matured).field.cohorts.length;i++){
  const out=await f.run(matured,'world_field',{operation:'farm_harvest'},`harvest-${i}`);matured=out.document;grain+=out.result.grain??0;conservation(matured);
 }
 assert.equal(farm(matured).field.cohorts.length,0);assert.ok(grain>0&&grain<=Math.floor(10*source.rules.agriculture.crop.yieldPerHa/100*1.3));
 assert.equal(matured.state.inventory.item_oats?.quantity??0,0);
 assert.ok(farm(matured).batches.some(b=>b.growthSources?.includes(lease.source)));
 assert.deepEqual(await f.cast(f.sown,lease.source),cast);
});
test('unplanted, missing water/nutrient state, absent materials and exact consent all reject before payment',async()=>{
 const f=await setup();
 for(const [edit,pattern] of [
  [d=>{farm(d).field.cohorts=[];},/种粮/],
  [d=>{farm(d).field.cohorts[0].seedSpent=0;},/种粮/],
  [d=>{delete d.state.records.permit;},/同意/],
  [d=>{d.state.records.permit.subject='another_field';},/同意/],
  [d=>{d.state.records.permit.revoked=true;},/同意/],
  [d=>{d.state.records.permit.expires=d.state.minute;},/同意/],
  [d=>{d.state.records['physical_feature:feature_growth']={id:'feature_growth',category:'physical_feature',location:f.p.fieldLocation,state:{waterMl:1,capacityMl:100}};},/营养/],
  [d=>{d.state.records['physical_feature:feature_growth']={id:'feature_growth',category:'physical_feature',location:f.p.fieldLocation,state:{waterMl:0,capacityMl:100,nutrientMg:100}};},/资源/],
  [d=>{d.state.location='loc_hw';},/距离/],
 ]){const doc=structuredClone(f.sown);edit(doc);const before=structuredClone(doc);await assert.rejects(f.cast(doc,'reject'),pattern);assert.deepEqual(doc,before);}
 f.world.spells.find(s=>s.id===catalog.id).materials=[{item:'item_oats',amount:1}];
 await assert.rejects(f.cast(f.sown,'material'),/缺少材料/);
});
test('plant binding uses actual crop cohorts; no unknown plants, diagnoses or field-wide free growth',async()=>{
 const f=await setup({plant:true}),out=await successfulCast(f,f.sown,'plant',f.feature.id);
 assert.equal(out.result.field,f.p.fieldId);const d=(await f.wait(out.document,1440,'plant-day')).document;
 assert.ok(farm(d).field.cohorts[0].growthBonusTicks>0);conservation(d);
 await assert.rejects(f.cast(f.sown,'unknown','unknown_plant'),/登记/);
 assert.ok(validateMagicCatalog({...catalog,effectSpec:{...catalog.effectSpec,cureDisease:true}}).length);
});
test('partial days, season crossing, large/small waits and JSON restart produce identical agricultural and resource ledgers',async()=>{
 const f=await setup({day:87}),out=await successfulCast(f);const input=out.document;
 const big=(await f.wait(input,12*1440+777,'big')).document;
 let small=structuredClone(input);
 for(let i=0;i<12;i++){small=(await f.wait(small,1440,`small-${i}`)).document;if(i===4)small=JSON.parse(JSON.stringify(small));}
 small=(await f.wait(small,777,'tail')).document;
 assert.deepEqual(farm(big),farm(small));assert.deepEqual(resource(big),resource(small));assert.deepEqual(big.state.settlements.loc_bs_yupo,small.state.settlements.loc_bs_yupo);conservation(big);conservation(small);
 assert.ok(farm(big).field.growthLeases[0].entries.some(e=>e.day>=90));
});
test('same field cooldown and lifetime cohort quota block repeated stacking, expired/revoked consent cannot backfill',async()=>{
 const f=await setup(),out=await successfulCast(f);
 await assert.rejects(f.cast(out.document,'stack'),/叠加|冷却/);
 const revoked=structuredClone(out.document);revoked.state.records.permit.revoked=true;
 const stopped=(await f.wait(revoked,7*1440,'revoked')).document;
 assert.equal(farm(stopped).field.growthLeases[0].usedTicks,0);assert.equal(resource(stopped),undefined);
 const expiry=structuredClone(out.document);expiry.state.records.permit.expires=expiry.state.minute+720;
 const expired=(await f.wait(expiry,7*1440,'expired')).document;
 assert.equal(farm(expired).field.growthLeases[0].usedTicks,720*250);conservation(expired);
 const capped=structuredClone(f.sown);farm(capped).field.cohorts[0].growthBonusTicks=10*1440000*.2;
 await assert.rejects(f.cast(capped,'over-cap'),/额度|不守恒/);
});
test('old or unregistered resource worlds get zero automatic crops, resources, effects or retroactive payouts',async()=>{
 const f=await setup(),old=structuredClone(f.sown);farm(old).mode='legacy';const before=structuredClone(old);
 await assert.rejects(f.cast(old,'legacy'),/旧账/);assert.deepEqual(old,before);
 delete f.p.growthFeature;await assert.rejects(f.cast(f.sown,'unbound'),/绑定/);
 assert.ok(validateGrowthRules({...source.rules.magicGrowth,maximumBonusPermille:201}).length);
 assert.ok(validateMagicCatalog({...catalog,duration:10081}).length);assert.ok(validateMagicCatalog({...catalog,effectSpec:{...catalog.effectSpec,power:251}}).length);
 const low=await setup();low.world.spells.find(s=>s.id===catalog.id).stage=0;
 await assert.rejects(low.cast(low.sown,'stage'),/阶段/);
});
test('exhausted real resources stop bonus, corrupt resource/conversion ledgers and unlimited lease durations reject atomically',async()=>{
 const f=await setup();f.feature.state.waterMl=1;f.feature.state.nutrientMg=1;
 const out=await successfulCast(f),end=(await f.wait(out.document,7*1440,'dry')).document,lease=farm(end).field.growthLeases[0];
 assert.equal(lease.usedTicks,144);assert.equal(resource(end).waterMl,0);assert.equal(resource(end).nutrientMg,0);
 assert.equal(lease.waterMl,1);assert.equal(lease.nutrientMg,1);assert.ok(lease.entries.some(e=>e.ticks===0));
 const missing=structuredClone(out.document);missing.state.records['physical_feature:feature_growth']={id:f.feature.id,category:'physical_feature',location:f.p.fieldLocation,state:{...f.feature.state}};delete resource(missing).nutrientMg;
 const missingBefore=structuredClone(missing);await assert.rejects(f.wait(missing,1440,'missing-state'),/营养/);assert.deepEqual(missing,missingBefore);
 for(const edit of [d=>{farm(d).field.growthLeases[0].waterMl++;},d=>{farm(d).field.growthLeases[0].until+=100000;},d=>{farm(d).field.growthLeases[0].waterMlPerAreaDay=1;}]){
  const doc=structuredClone(end);edit(doc);const input=structuredClone(doc);
  await assert.rejects(f.wait(doc,1440,'bad-ledger'),/不守恒|期限|规则/);assert.deepEqual(doc,input);
 }
});
test('repeated weekly casts share one crop lifetime budget and do not raise per-area base yield',async()=>{
 const f=await setup();f.world.rules.agriculture.crop.growthDays=40;f.world.rules.magicGrowth.maximumBonusPermille=100;
 let doc=f.sown;
 for(let i=0;i<3;i++){const out=await successfulCast(f,doc,`weekly-${i}`);doc=(await f.wait(out.document,10080,`week-${i}`)).document;}
 const c=farm(doc).field.cohorts[0],leases=farm(doc).field.growthLeases;
 assert.equal(c.ready,false);assert.equal(c.growthBonusTicks,40*1440000*.1);
 assert.equal(leases.reduce((n,l)=>n+l.usedTicks,0),c.growthBonusTicks);assert.equal(leases.length,3);
 assert.ok(c.qualitySum/c.qualityDays<=1.3);conservation(doc);
 await assert.rejects(f.cast(doc,'fourth'),/额度/);
 const matured=(await f.wait(doc,14*1440,'natural-finish')).document;assert.equal(farm(matured).field.cohorts[0].ready,true);conservation(matured);
});
test('CampaignStorage restart/export/import/replay preserves consumed resources and source quotas without reopening payouts',async t=>{
 const f=await setup(),sample=await successfulCast(f),directory=await fs.mkdtemp(path.join(os.tmpdir(),'fields-t37-growth-'));
 t.after(()=>{
  const root=path.resolve(os.tmpdir()),target=path.resolve(directory),relative=path.relative(root,target);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!path.basename(target).startsWith('fields-t37-growth-'))throw Error('拒绝清理非本测试目录');
  return fs.rm(target,{recursive:true,force:true});
 });
 const reducer=(d,input)=>f.engine.reduce(d,input),store=new CampaignStorage(directory,{reducer}),event=sample.result.sourceEvent;
 await store.create({id:'growth',worldVersion:f.engine.world.version,document:f.sown});
 await store.transact('growth',{id:event,anchor:'cast',input:{tool:'world_cast',args:{spell:catalog.id,target:f.p.fieldId,authorization:'permit'},eventId:event}},reducer);
 await store.transact('growth',{id:'settle',anchor:'settled',input:{tool:'world_time',args:{minutes:2880},eventId:'settle'}},reducer);
 const saved=(await store.read('growth')).document,restarted=(await new CampaignStorage(directory,{reducer}).read('growth')).document;
 assert.deepEqual(saved,restarted);assert.deepEqual((await store.import(await store.export('growth'),'copy')).document,saved);conservation(saved);
 const changed=structuredClone(f.world);changed.locations.find(l=>l.id===f.p.fieldLocation).features.find(row=>row.id===f.feature.id).state.waterMl=1;
 const engine=new WorldEngine(changed),out=await engine.reduce(restarted,{tool:'world_time',args:{minutes:1440},eventId:'restart-day'}),continued=applyPatches(restarted,out.patches);
 const uninterrupted=(await f.wait(saved,1440,'restart-day')).document;
 assert.deepEqual(farm(continued),farm(uninterrupted));assert.deepEqual(resource(continued),resource(uninterrupted));
 await store.transact('growth',{id:event,anchor:'cast',input:{tool:'world_cast',args:{spell:catalog.id,target:f.p.fieldId,authorization:'permit'},eventId:event}},reducer);
 assert.deepEqual((await store.read('growth')).document,saved);
 assert.deepEqual((await store.reconcile('growth',[])).document,f.sown);
});
test('formal world audit preserves the same existing release failures with/without optional growth limits',()=>{
 const withGrowth=validateWorld(source,{stage:'release'}),without=structuredClone(source);delete without.rules.magicGrowth;
 const old=validateWorld(without,{stage:'release'});
 assert.equal(withGrowth.ok,false);assert.deepEqual(withGrowth.errors,old.errors);
 assert.equal(withGrowth.errors.length,1192);
});
