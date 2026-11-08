import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {settle,draw,breedingLoss,baseRate,capacityOf,LN19} from '../server-plugin/renewable.mjs';

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const data=JSON.parse(read('world/ecology/renewables.json'));
const methods=data.methods;
// Test-only species values (the real species table is data; these exercise the law, not the calibration).
const perennial={ratePerDay:0.02,regrowFrom:'root',seedSeason:null};
const annual={ratePerDay:0.02,regrowFrom:'seed',seedSeason:2};
const K=1000;
const fresh=(visible=K)=>({visible});
const run=(row,props,extra={})=>settle(row,{props,methods,capacity:K,seed:'world-1',site:'siteA',...extra});
const harvest=(day,method,quantity,skill=0,actor='gatherer-1')=>({day,method,quantity,skill,actor});

test('rg: a world day is the only step — 1, 7 and 30 day steps give identical state', () => {
 const props={...perennial,seasonDensity:[1,1,0.5,0]};
 const events=[harvest(3,'cut_shoots',400,0.5),harvest(40,'pull_whole',300,0.2,'gatherer-2'),harvest(41,'pick_leaf',50,1),harvest(95,'cut_shoots',200,0),harvest(170,'pull_whole',100,0.9)];
 const noise=0.3,extra={harvests:events,noise,immigrationPerDay:0.0001};
 const whole=fresh();const all=run(whole,props,{...extra,fromDay:0,toDay:180});
 for(const step of [1,7,30]){
  let row=fresh();const days=[];let regrown=0,taken=0;
  for(let from=0;from<180;from+=step){
   row=JSON.parse(JSON.stringify(row));            // the row round-trips through storage between steps
   const out=run(row,props,{...extra,fromDay:from,toDay:Math.min(180,from+step)});
   days.push(...out.days);regrown+=out.regrown;taken+=out.taken;
  }
  assert.deepEqual(row,whole,`step ${step}: row state`);
  assert.deepEqual(days,all.days,`step ${step}: per-day series`);
  assert.equal(regrown,all.regrown);assert.equal(taken,all.taken);
 }
 assert.ok(all.taken>0&&all.regrown>0);
});

test('rg: stripped patch recovers or not according to how it regrows and what the method destroys', () => {
 const grow=(row,props,from,to,harvests=[],extra={})=>run(row,props,{fromDay:from,toDay:to,harvests,...extra});
 // perennial cut at the shoot resprouts from the root: back to capacity.
 let row=fresh();grow(row,perennial,0,1,[harvest(0,'cut_shoots',K,0)]);
 assert.equal(row.persistence>0,true);assert.ok(row.visible<=1);
 grow(row,perennial,1,2500);assert.ok(row.visible>=0.99*K,`resprouted: ${row.visible}`);
 // the same patch pulled out by the root is gone for good.
 row=fresh();grow(row,perennial,0,1,[harvest(0,'pull_whole',K,0)]);
 assert.equal(row.persistence,0);grow(row,perennial,1,2500);assert.equal(row.visible,0,'uprooted perennial stays extinct');
 // a seed-regenerated plant cut before it sheds seed leaves no offspring...
 row=fresh();grow(row,annual,0,1,[harvest(0,'cut_shoots',K,0)]);
 assert.equal(row.persistence,0);grow(row,annual,1,2500);assert.equal(row.visible,0);
 // ...but cut after the seed season (day 200 is season 2) the seed is already in the ground.
 row=fresh();grow(row,annual,0,200);grow(row,annual,200,201,[harvest(200,'cut_shoots',K,0)]);
 assert.equal(row.persistence,1e6);grow(row,annual,201,2700);assert.ok(row.visible>=0.99*K);
 // an immigration trickle restarts an extinct patch; without it nothing returns.
 row=fresh();grow(row,annual,0,1,[harvest(0,'cut_shoots',K,0)]);
 grow(row,annual,1,4000,[],{immigrationPerDay:0.001});assert.ok(row.visible>0.9*K,`immigration: ${row.visible}`);
});

test('rg: a skilled gatherer spares breeding plants; the same take leaves a healthier patch', () => {
 const results=[0,0.5,1].map(skill=>{
  const row=fresh();run(row,perennial,{fromDay:0,toDay:1,harvests:[harvest(0,'pull_whole',600,skill)]});
  const after=row.persistence;run(row,perennial,{fromDay:1,toDay:120});
  return {skill,after,visible:row.visible};
 });
 assert.ok(results[0].after<results[1].after&&results[1].after<results[2].after,JSON.stringify(results));
 assert.ok(results[0].visible<results[2].visible,JSON.stringify(results));
 // individual variation: deterministic per (seed, site, day, actor), never random between replays.
 const noisy=seed=>{const row=fresh();settle(row,{props:perennial,methods,capacity:K,seed,site:'siteA',fromDay:0,toDay:1,noise:0.5,harvests:[harvest(0,'pull_whole',600,0.6)]});return row.persistence;};
 assert.equal(noisy('s1'),noisy('s1'));
 assert.equal(new Set(['s1','s2','s3','s4','s5','s6'].map(noisy)).size>1,true,'different worlds give different individuals');
 assert.notEqual(draw('s','a',1,'x'),draw('s','a',2,'x'));assert.notEqual(draw('s','a',1,'x'),draw('s','a',1,'y'));
 const plain=seed=>{const row=fresh();settle(row,{props:perennial,methods,capacity:K,seed,site:'siteA',fromDay:0,toDay:1,noise:0,harvests:[harvest(0,'pull_whole',600,0.6)]});return row.persistence;};
 assert.equal(plain('s1'),plain('s2'),'noise 0 does not depend on the seed');
});

test('rg: harvesting before the seed season destroys offspring, after it does not (cut and fruit)', () => {
 const persistenceAfter=(method,day)=>{const row=fresh();run(row,annual,{fromDay:0,toDay:day});
  const before=row.persistence;run(row,annual,{fromDay:day,toDay:day+1,harvests:[harvest(day,method,500,0)]});return {before,after:row.persistence};};
 const lost=r=>r.after>=5e5&&r.after<6e5;   // half the plants lost their offspring, then one day of recovery
 assert.ok(lost(persistenceAfter('cut_shoots',20)),'cut before seed: half the plants lost their seed');
 assert.equal(persistenceAfter('cut_shoots',200).after,1e6,'cut after seed: nothing lost');
 assert.ok(lost(persistenceAfter('pick_fruit',20)),'fruit picked before seed sheds takes the seed');
 assert.equal(persistenceAfter('pick_fruit',200).after,1e6);
 assert.equal(persistenceAfter('pick_leaf',20).after,1e6,'leaves do not carry the seed');
 // the botany table itself
 assert.equal(breedingLoss(perennial,methods.cut_shoots,0),0);assert.equal(breedingLoss(perennial,methods.pull_whole,3),1);
 assert.equal(breedingLoss(annual,methods.pull_whole,2),0);assert.equal(breedingLoss(annual,methods.fell_tree,1),1);
 assert.equal(breedingLoss(perennial,methods.pick_fruit,0),0);
});

test('rg: ledger conservation — visible_end = visible_start + regrown − taken, postings reproduce it', () => {
 const props={...perennial,seasonDensity:[1,1,0.5,0.1]};
 const events=[];for(let day=0;day<300;day+=7)events.push(harvest(day,['cut_shoots','pick_leaf','pull_whole'][(day/7)%3],150+day%90,(day%10)/10,`g${day%3}`));
 const row=fresh(700),start=row.visible;
 const out=run(row,props,{fromDay:0,toDay:400,harvests:events,noise:0.2,immigrationPerDay:0.0005});
 assert.equal(row.visible,start+out.regrown-out.taken);
 const posted=out.ledger.reduce((n,p)=>n+(p.to==='reserve'?p.amount:0)-(p.from==='reserve'?p.amount:0),0);
 assert.equal(start+posted,row.visible);
 let running=start;
 for(const day of out.days){running+=day.regrown-day.taken;assert.equal(day.visible,running);assert.ok(day.visible>=0&&Number.isSafeInteger(day.visible));}
 assert.ok(out.ledger.every(p=>(p.from==='src:regrowth'&&p.to==='reserve')||(p.from==='reserve'&&p.to==='gatherer')));
 // a take can never exceed what stands, and stock never shrinks by itself.
 const small=fresh(5);const r=run(small,perennial,{fromDay:0,toDay:1,harvests:[harvest(0,'pick_leaf',999,0)]});
 assert.equal(r.taken,5);assert.ok(small.visible>=0);
 const sat=fresh(K);const s=run(sat,perennial,{fromDay:0,toDay:50});assert.equal(s.regrown,0);assert.equal(sat.visible,K);
});

test('rg: pending data is refused, never defaulted; the table has a basis for every filled value', () => {
 assert.equal(data.schema,'ecology/renewables@1');
 const rules=JSON.parse(read('world/meta/rules.json')).forestWater,yields=JSON.parse(read('world/rules/tables/balance/yields.json')).params;
 let filled=0,pending=0;
 for(const s of data.species){
  assert.ok(s.id&&s.kind&&Array.isArray(s.items)&&Array.isArray(s.pending),s.id);
  for(const field of ['ratePerDay','maturityDays','standingPerKm2','regrowFrom','seedSeason','seasonDensity','seasonDensityParam']){
   if(!(field in s))continue;
   const has=s[field]!==null&&s[field]!==undefined;
   if(has){filled++;assert.ok(s.sources?.[field],`${s.id}.${field} has a stated source`);assert.equal(s.pending.includes(field),false,`${s.id}.${field} filled but listed pending`);}
   else if(!s.sources?.[field]||field!=='seasonDensity'){assert.ok(s.pending.includes(field)||s.sources?.[field],`${s.id}.${field} is null: pending or explained`);}
  }
  pending+=s.pending.length;
  if(s.id.startsWith('forest.')){
   const kind=s.id.split('.')[1];
   assert.equal(s.ratePerDay,rules.forest.species[kind].growthPerDay,`${s.id} rate comes from the published forest rule`);
   assert.equal(s.standingPerKm2,rules.forest.stockPerKm2);
  }
  if(s.seasonDensityParam)assert.ok(yields.some(p=>p.id===s.seasonDensityParam),`${s.id} density table entry exists`);
  if(s.pending.some(f=>['ratePerDay','maturityDays'].includes(f))&&s.ratePerDay===null&&s.maturityDays===null)assert.throws(()=>baseRate(s),/ratePerDay or maturityDays/);
  if(s.standingPerKm2===null)assert.throws(()=>capacityOf(s,1),/standingPerKm2/);
 }
 assert.ok(filled>0&&pending>0);
 assert.equal(capacityOf(data.species.find(s=>s.id==='forest.broadleaf'),2),100000);
 assert.ok(Math.abs(baseRate({maturityDays:100})-LN19/100)<1e-15);
 for(const [id,m] of Object.entries(methods)){
  assert.ok(['root','shoot','none'].includes(m.kills)&&typeof m.takesSeed==='boolean'&&m.leaveCap>=0&&m.leaveCap<=1&&m.source&&m.basis,id);
 }
 assert.throws(()=>settle(fresh(),{props:data.species.find(s=>s.id==='herb.generic'),methods,capacity:K,fromDay:0,toDay:1}),/ratePerDay or maturityDays/);
 assert.throws(()=>settle(fresh(),{props:{ratePerDay:0.01,regrowFrom:'seed',seedSeason:null},methods,capacity:K,fromDay:0,toDay:1,harvests:[harvest(0,'cut_shoots',1,0)]}),/seedSeason/);
});

test('rg: the module source names no resource, item, site or species', () => {
 const source=read('server-plugin/renewable.mjs').split(String.fromCharCode(10)).map(line=>line.split('//')[0]).join(String.fromCharCode(10));
 assert.deepEqual(source.match(/(?:^|[^A-Za-z0-9_])(?:item|loc|bld|npc|skill|site|res)_[a-z0-9_]+/g)??[],[]);
 const names=[...data.species.flatMap(s=>[s.id,...s.items]),...Object.keys(methods)];
 for(const name of names){
  const word=new RegExp('(^|[^A-Za-z0-9_.])'+name.split('.').join('[.]')+'($|[^A-Za-z0-9_])');
  assert.equal(word.test(source),false,'module mentions '+name);
 }
 assert.equal(/if *[(].*(?:forest|herb|water|reed|fruit)/i.test(source),false,'no per-class branches');
});
