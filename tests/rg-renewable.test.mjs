import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {settle,breedingLoss,baseRate,capacityOf,LOGISTIC_SPAN} from '../server-plugin/renewable.mjs';
import {logisticStock} from '../server-plugin/stock.mjs';

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const data=JSON.parse(read('world/ecology/renewables.json'));
const methods=data.methods;
// Seasons come from the world's own calendar, exactly as the engine computes them.
const engine=new WorldEngine(await loadWorld());
const calendar=minute=>engine.calendar(minute);
const seasonOfDay=day=>calendar(day*1440).season;
// TEST-ONLY fixtures: the real skill-to-spared-share function and the real species values are pending data (RG-B / calibration);
// these exercise the law's mechanics, not any calibration.
const spare=(method,ev)=>0.5*Math.min(1,Math.max(0,ev.skill));
const dens=[1,1,1,1];
const perennial={ratePerDay:0.02,regrowFrom:'root',restartUnits:1,seasonDensity:dens};
const annual={ratePerDay:0.02,regrowFrom:'seed',seedSeason:2,restartUnits:1,seasonDensity:dens};
const K=1000;
const fresh=(visible=K)=>({visible});
const run=(row,props,extra={})=>settle(row,{props,methods,capacity:K,calendar,spare,...extra});
const harvest=(day,method,quantity,skill=0,actor='gatherer-1')=>({day,method,quantity,skill,actor});

test('rg: seasons are the world calendar\'s, not a constant in the module', () => {
 assert.equal(seasonOfDay(20),0);assert.equal(seasonOfDay(100),1);assert.equal(seasonOfDay(200),2);assert.equal(seasonOfDay(300),3);
 assert.throws(()=>settle(fresh(),{props:perennial,methods,capacity:K,fromDay:0,toDay:1}),/a world calendar function is required/);
 // a different calendar moves the seed season with the same species data
 const late=minute=>({season:Math.floor(minute/1440)>=10?2:0});
 const early=fresh();settle(early,{props:annual,methods,capacity:K,calendar:late,spare,fromDay:0,toDay:11,harvests:[harvest(5,'cut_shoots',500,0)]});
 const inSeason=fresh();settle(inSeason,{props:annual,methods,capacity:K,calendar:late,spare,fromDay:0,toDay:11,harvests:[harvest(10,'cut_shoots',500,0)]});
 assert.equal(early.persistence,logisticStock({},'persistence',{reserve:500000,capacity:1e6,rate:annual.ratePerDay,from:5*1440,to:11*1440}),'half lost before the seed season, then six days of recovery');assert.equal(inSeason.persistence,1e6,'in the calendar\'s seed season');
});

test('rg: a world day is the only step — 1, 7 and 30 day steps give identical state across season edges', () => {
 // the density differs in seasons 0, 1 and 2 and the span crosses two season edges (days 90 and 180), where the anchor is rebuilt
 const props={...perennial,seasonDensity:[1,0.5,0.75,0.25]},HORIZON=200;
 assert.deepStrictEqual([0,89,90,179,180,199].map(seasonOfDay),[0,0,1,1,2,2]);
 const events=[harvest(3,'cut_shoots',400,0.5),harvest(40,'pull_whole',300,0.2,'gatherer-2'),harvest(41,'pick_leaf',50,1),harvest(89,'pick_leaf',20,0),harvest(90,'pick_leaf',20,0),harvest(95,'cut_shoots',200,0),harvest(170,'pull_whole',100,0.9),harvest(179,'pick_leaf',20,0),harvest(180,'cut_shoots',20,0)];
 const inside=(from,to)=>events.filter(ev=>ev.day>=from&&ev.day<to);
 const whole=fresh();const all=run(whole,props,{harvests:events,fromDay:0,toDay:HORIZON});
 for(const step of [1,7,30]){
  let row=fresh();const days=[];let regrown=0,taken=0;
  for(let from=0;from<HORIZON;from+=step){
   const to=Math.min(HORIZON,from+step);
   row=JSON.parse(JSON.stringify(row));            // the row round-trips through storage between steps
   const out=run(row,props,{harvests:inside(from,to),fromDay:from,toDay:to});
   days.push(...out.days);regrown+=out.regrown;taken+=out.taken;
  }
  assert.deepStrictEqual(row,whole,`step ${step}: row state`);
  assert.deepStrictEqual(days,all.days,`step ${step}: per-day series`);
  assert.equal(regrown,all.regrown);assert.equal(taken,all.taken);
 }
 assert.equal(all.taken,events.reduce((n,ev)=>n+ev.quantity,0),'every harvest found stock to take');
 assert.ok(all.regrown>0);
 // replay: the same inputs always give the same state (no hidden randomness)
 const again=fresh();assert.deepStrictEqual(run(again,props,{harvests:events,fromDay:0,toDay:HORIZON}).days,all.days);assert.deepStrictEqual(again,whole);
});

test('rg: stripped patch recovers or not according to how it regrows and what the method destroys', () => {
 const grow=(row,props,from,to,harvests=[])=>run(row,props,{fromDay:from,toDay:to,harvests});
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
 // the restart base decides how fast a stripped-but-alive patch returns (species data, not a module constant)
 const slow=fresh(),quick=fresh(),fast={...perennial,restartUnits:50};
 grow(slow,perennial,0,1,[harvest(0,'cut_shoots',K,0)]);grow(slow,perennial,1,200);
 grow(quick,fast,0,1,[harvest(0,'cut_shoots',K,0)]);grow(quick,fast,1,200);
 assert.ok(quick.visible>slow.visible,`restartUnits 50: ${quick.visible} vs 1: ${slow.visible}`);
});

test('rg: sparing breeding plants (through the caller\'s spare function) leaves a healthier patch', () => {
 const results=[0,0.5,1].map(skill=>{
  const row=fresh();run(row,perennial,{fromDay:0,toDay:1,harvests:[harvest(0,'pull_whole',600,skill)]});
  const after=row.persistence;run(row,perennial,{fromDay:1,toDay:120});
  return {skill,after,visible:row.visible};
 });
 assert.ok(results[0].after<results[1].after&&results[1].after<results[2].after,JSON.stringify(results));
 assert.ok(results[0].visible<results[2].visible,JSON.stringify(results));
 // the module has no skill formula: without spare() a harvest fails loudly, and a spare outside [0,1] is refused
 assert.throws(()=>settle(fresh(),{props:perennial,methods,capacity:K,calendar,fromDay:0,toDay:1,harvests:[harvest(0,'pick_leaf',10,1)]}),/a spare[(]method, event[)] function is required/);
 for(const bad of [-0.1,1.1,NaN])assert.throws(()=>run(fresh(),perennial,{fromDay:0,toDay:1,spare:()=>bad,harvests:[harvest(0,'pick_leaf',10,1)]}),/spare must be within [[]0,1[\]]/);
 // a full-spare gatherer destroys nothing even when pulling plants out by the root
 const all=fresh();run(all,perennial,{fromDay:0,toDay:1,spare:()=>1,harvests:[harvest(0,'pull_whole',600,1)]});assert.equal(all.persistence,1e6);
});

test('rg: loud failures — harvest outside the interval, missing seasonDensity, unknown effect', () => {
 assert.throws(()=>run(fresh(),perennial,{fromDay:5,toDay:10,harvests:[harvest(4,'pick_leaf',1,0)]}),/harvest day 4 is outside [[]5,10[)]/);
 assert.throws(()=>run(fresh(),perennial,{fromDay:5,toDay:10,harvests:[harvest(10,'pick_leaf',1,0)]}),/harvest day 10 is outside [[]5,10[)]/);
 assert.throws(()=>run(fresh(),{...perennial,seasonDensity:null},{fromDay:0,toDay:1}),/seasonDensity is missing or pending/);
 const {seasonDensity,...noDensity}=perennial;
 assert.throws(()=>run(fresh(),noDensity,{fromDay:0,toDay:1}),/seasonDensity is missing or pending/);
 assert.throws(()=>run(fresh(),{...perennial,seasonDensity:[1,1,1]},{fromDay:270,toDay:271}),/no valid entry for season 3/);
 assert.throws(()=>run(fresh(),{...perennial,seasonDensity:[1,1,1,-1]},{fromDay:270,toDay:271}),/no valid entry for season 3/);
 const odd={...methods,odd:{kills:'burn',takesSeed:false}};
 assert.throws(()=>settle(fresh(),{props:perennial,methods:odd,capacity:K,calendar,spare,fromDay:0,toDay:1,harvests:[harvest(0,'odd',10,0)]}),/unknown harvest effect burn/);
 assert.throws(()=>breedingLoss(perennial,{kills:'burn'},0),/unknown harvest effect burn/);
 assert.throws(()=>breedingLoss({regrowFrom:'seed',seedSeason:null},methods.cut_shoots,0),/seedSeason is missing or pending/);
});

test('rg: damage is the share of the breeding population, not of the visible stock', () => {
 // near-empty patch with living roots: pulling the few plants that stand must not wipe out the whole patch
 const row={visible:5};run(row,perennial,{fromDay:0,toDay:1,harvests:[harvest(0,'pull_whole',5,0)]});
 // exact: 5/1000 of the population is lost = 5000 ppm, then one day of logistic recovery from 995000 ppm
 const recovered=logisticStock({},'persistence',{reserve:995000,capacity:1e6,rate:perennial.ratePerDay,from:0,to:1440});
 assert.equal(row.persistence,recovered);assert.ok(row.persistence>0.99e6);
 // the damage depends only on the take over the population, so a full patch gives the identical persistence
 const full=fresh();run(full,perennial,{fromDay:0,toDay:1,harvests:[harvest(0,'pull_whole',5,0)]});
 assert.equal(full.persistence,row.persistence);
 // several takes on one day from a near-empty patch: every take is a share of what is left of the population, so 20+20+10 of
 // 1000 leave 950000 ppm (an old visible-stock denominator would give 20/50, 20/30, 10/10 = extinction)
 const staged={visible:50};run(staged,perennial,{fromDay:0,toDay:1,harvests:[harvest(0,'pull_whole',20,0),harvest(0,'pull_whole',20,0),harvest(0,'pull_whole',10,0)]});
 const expected=logisticStock({},'persistence',{reserve:950000,capacity:1e6,rate:perennial.ratePerDay,from:0,to:1440});
 // exact: PPM·taken/capacity per take = 20000+20000+10000 ppm = 950000 left, then one day of recovery from exactly that
 assert.equal(staged.persistence,expected);
 assert.ok(staged.persistence>0.9e6);
 // pulling the entire population by the root is extinction
 const all=fresh();run(all,perennial,{fromDay:0,toDay:1,harvests:[harvest(0,'pull_whole',K,0)]});
 assert.equal(all.persistence,0);
 // a take larger than what the damaged population could carry also ends it
 const damaged={visible:K,persistence:4e5};run(damaged,perennial,{fromDay:0,toDay:1,harvests:[harvest(0,'pull_whole',K,0)]});
 assert.equal(damaged.persistence,0);
});

test('rg: many tiny takes accumulate exactly (no per-take rounding up to a ppm)', () => {
 // capacity 1e8: each take of 1 unit is 1e-8 of the population = 0.01 ppm. 250 takes = 2.5 ppm: the patch loses 2 ppm (floor of the exact total),
 // not 250 ppm (what rounding each take up to a whole ppm would give), and the result does not depend on how the takes are grouped.
 const takes=n=>Array.from({length:n},()=>harvest(0,'pull_whole',1,0));
 const row=fresh();run(row,perennial,{capacity:1e8,fromDay:0,toDay:1,harvests:takes(250)});
 assert.equal(row.persistence,1e6-2);
 const split=fresh();run(split,perennial,{capacity:1e8,fromDay:0,toDay:1,harvests:takes(100)});
 const rest=JSON.parse(JSON.stringify(split));run(rest,perennial,{capacity:1e8,fromDay:1,toDay:2,harvests:takes(150).map(ev=>({...ev,day:1}))});
 const one=fresh();run(one,perennial,{capacity:1e8,fromDay:0,toDay:2,harvests:[...takes(100),...takes(150).map(ev=>({...ev,day:1}))]});
 assert.deepStrictEqual(rest,one,'grouping the same takes over the same days does not change the state');
});

test('rg: grouping the same takes on one day gives bit-identical state (damage is strictly additive)', () => {
 // For one method and one spare the loss is PPM·loss·(1−spare)·taken/capacity, added rationally: the total is floor(PPM·loss·(1−spare)·Σtaken/capacity)
 // however the takes are split. (Computing it from the persistence would carry 1 ulp of float noise per take and let groupings differ by a ppm.)
 const groupings=[[50],[20,20,10],[10,10,10,10,10],[1,49],[33,17],[7,13,5,25],Array(50).fill(1)];
 for(const [capacity,skill] of [[K,0],[K,0.3],[777,0],[777,0.9],[123457,0.45]]){
  const rows=groupings.map(groups=>{
   const row=fresh(),harvests=groups.map(quantity=>harvest(0,'pull_whole',quantity,skill));
   run(row,perennial,{capacity,fromDay:0,toDay:1,harvests});return row;
  });
  rows.forEach((row,i)=>assert.deepStrictEqual(row,rows[0],`capacity ${capacity}, skill ${skill}: grouping ${JSON.stringify(groupings[i])}`));
  assert.ok(rows[0].persistence<1e6&&rows[0].persistence>0);
 }
 // the exact total, not a tolerance: 50 of 1000 at no spare is 50000 ppm
 const exact=fresh();run(exact,perennial,{fromDay:0,toDay:1,harvests:[harvest(0,'pull_whole',50,0)]});
 const grouped=fresh();run(grouped,perennial,{fromDay:0,toDay:1,harvests:[harvest(0,'pull_whole',20,0),harvest(0,'pull_whole',20,0),harvest(0,'pull_whole',10,0)]});
 const expected=logisticStock({},'persistence',{reserve:950000,capacity:1e6,rate:perennial.ratePerDay,from:0,to:1440});
 assert.equal(exact.persistence,expected);assert.equal(grouped.persistence,expected);
 // a take that reaches the whole breeding population is the capped case: extinction, however it was grouped
 const reach=fresh();run(reach,perennial,{fromDay:0,toDay:1,harvests:[harvest(0,'pull_whole',600,0),harvest(0,'pull_whole',400,0)]});
 assert.equal(reach.persistence,0);
});

test('rg: botany and entry state are validated even when nothing stands to be taken', () => {
 const odd={...methods,odd:{kills:'burn',takesSeed:false}};
 assert.throws(()=>settle({visible:0},{props:perennial,methods:odd,capacity:K,calendar,spare,fromDay:0,toDay:1,harvests:[harvest(0,'odd',10,0)]}),/unknown harvest effect burn/);
 const seeded={...annual,seedSeason:null};
 assert.throws(()=>run({visible:0},seeded,{fromDay:0,toDay:1,harvests:[harvest(0,'cut_shoots',10,0)]}),/seedSeason is missing or pending/);
 assert.throws(()=>run({visible:0},{...perennial,regrowFrom:'spores'},{fromDay:0,toDay:1,harvests:[harvest(0,'cut_shoots',10,0)]}),/species regrowFrom must be root or seed/);
 for(const bad of [2e6,-1,0.5,NaN])assert.throws(()=>run({visible:5,persistence:bad},perennial,{fromDay:0,toDay:1}),/row[.]persistence must be an integer within/);
 for(const ok of [0,1,999999,1e6])assert.doesNotThrow(()=>run({visible:5,persistence:ok},perennial,{fromDay:0,toDay:1}));
});

test('rg: step sizes agree when harvests fall on step edges and season edges (perennial and seed-regenerated)', () => {
 const density=[1,0.5,0.75,0.25],HORIZON=200;   // seasons 0, 1, 2 differ; edges at days 90 and 180
 const agree=(props,events,label)=>{
  const whole=fresh();run(whole,props,{harvests:events,fromDay:0,toDay:HORIZON});
  for(const step of [1,7,30,45]){
   let row=fresh();
   for(let from=0;from<HORIZON;from+=step){const to=Math.min(HORIZON,from+step);row=JSON.parse(JSON.stringify(row));run(row,props,{harvests:events.filter(ev=>ev.day>=from&&ev.day<to),fromDay:from,toDay:to});}
   assert.deepStrictEqual(row,whole,`${label}: step ${step}`);
  }
  return whole;
 };
 // The growth-rate edge at day 90 (season 0 to 1 densities differ) is covered by the perennial variant's events on days 89 and 90 and
 // its dense per-day path; keep events on both sides of every season edge there whenever the event set changes.
 // events on block first days (7, 14, 30, 60, 90, 180), on block last days (69 ends a 7-day block, 89 and 179 end season blocks) and two on one day
 const perennialEvents=[harvest(7,'cut_shoots',200,0.4),harvest(14,'pull_whole',100,0),harvest(30,'pick_leaf',60,1),harvest(30,'pull_whole',40,0.2,'gatherer-2'),harvest(60,'cut_shoots',150,0.1),harvest(69,'pick_leaf',25,0),harvest(89,'pull_whole',30,0),harvest(90,'cut_shoots',100,0.5),harvest(179,'pick_leaf',20,0),harvest(180,'cut_shoots',40,0)];
 const whole=agree({...perennial,seasonDensity:density},perennialEvents,'perennial');
 assert.ok(whole.persistence<1e6&&whole.visible>0);
 // seed-regenerated: a cut just before the seed season (day 179, season 1) costs offspring, a cut on its first day (day 180, season 2) does not
 const seedProps={...annual,seasonDensity:density};
 const both=agree(seedProps,[harvest(179,'cut_shoots',300,0),harvest(180,'cut_shoots',300,0)],'seed, both sides of the seed season');
 const after=agree(seedProps,[harvest(180,'cut_shoots',300,0)],'seed, first day of the seed season only');
 assert.equal(after.persistence,1e6,'no offspring lost after the seed season starts');
 assert.ok(both.persistence<1e6,'the day-179 cut lost offspring');
});

test('rg: spare is checked even when nothing is taken, and a failing settle leaves the row untouched', () => {
 assert.throws(()=>settle({visible:0},{props:perennial,methods,capacity:K,calendar,fromDay:0,toDay:1,harvests:[harvest(0,'pick_leaf',5,0)]}),/a spare[(]method, event[)] function is required/);
 assert.throws(()=>run({visible:0},perennial,{spare:()=>2,fromDay:0,toDay:1,harvests:[harvest(0,'pick_leaf',5,0)]}),/spare must be within [[]0,1[\]]/);
 // the failure comes on day 3, after three days of growth have been computed
 const row=fresh(100),before=structuredClone(row);
 assert.throws(()=>run(row,perennial,{fromDay:0,toDay:5,harvests:[harvest(0,'pick_leaf',10,0),harvest(3,'no-such-method',1,0)]}),/unknown harvest method no-such-method/);
 assert.deepStrictEqual(row,before,'row is exactly as before the failed call');
 const noDays=fresh(100);assert.throws(()=>run(noDays,{...perennial,seasonDensity:[1,1,1]},{fromDay:260,toDay:300}),/no valid entry for season 3/);
 assert.deepStrictEqual(noDays,fresh(100));
});

test('rg: with no harvests the daily settlement equals one logisticStock call over the whole span', () => {
 const start=100,base=perennial.restartUnits,limit=K+base,rate=perennial.ratePerDay;
 // constant rate and capacity: the anchor never rebases, so both sample the same continuous curve and floor the same value (exact)
 const days=200,row=fresh(start),out=run(row,perennial,{fromDay:0,toDay:days});
 const ref={},refValue=Math.max(start,logisticStock(ref,'stock',{reserve:start+base,capacity:limit,rate,from:0,to:days*1440})-base);
 assert.equal(out.visible,refValue);assert.equal(out.regrown,refValue-start);
 // seasonal density: the rate changes at season edges and the anchor is rebased from the continuous value (the visible stock is the floor
 // of that value, so the rebase adds exactly zero); within a season the daily path keeps the same anchor and evaluates the same
 // expression as one call per season span, so the two are bit-identical.
 // Boundary of this check: no harvests, so capacity and persistence are constant. With damage the capacity changes daily, the anchor is
 // rebuilt every day and the result is the day-by-day path (step independence is covered by the 1/7/30-day test), not a single call.
 const props={...perennial,seasonDensity:[1,0.5,1,0.25]},total=400,seasonal=fresh(start);run(seasonal,props,{fromDay:0,toDay:total});
 const refRow={};let value=start,edge=0;
 for(let day=1;day<=total;day++){
  if(day===total||seasonOfDay(day)!==seasonOfDay(edge)){
   const factor=props.seasonDensity[seasonOfDay(edge)];
   value=Math.max(value,logisticStock(refRow,'stock',{reserve:value+base,capacity:limit,rate:rate*factor,from:edge*1440,to:day*1440})-base);edge=day;
  }
 }
 assert.equal(seasonal.visible,value,`daily ${seasonal.visible} vs per-season ${value}`);
 assert.ok(seasonal.visible>start,'the patch grew');
});

test('rg: harvesting before the seed season destroys offspring, after it does not (cut and fruit)', () => {
 assert.equal(seasonOfDay(20),0);assert.equal(seasonOfDay(200),2);
 const persistenceAfter=(method,day)=>{const row=fresh();run(row,annual,{fromDay:0,toDay:day});
  run(row,annual,{fromDay:day,toDay:day+1,harvests:[harvest(day,method,500,0)]});return row.persistence;};
 // half the plants lost their offspring (500000 ppm), then one day of recovery from exactly that
 const lost=(value,day)=>value===logisticStock({},'persistence',{reserve:500000,capacity:1e6,rate:annual.ratePerDay,from:day*1440,to:(day+1)*1440});
 assert.ok(lost(persistenceAfter('cut_shoots',20),20),'cut before seed: half the plants lost their seed');
 assert.equal(persistenceAfter('cut_shoots',200),1e6,'cut after seed: nothing lost');
 assert.ok(lost(persistenceAfter('pick_fruit',20),20),'fruit picked before seed sheds takes the seed');
 assert.equal(persistenceAfter('pick_fruit',200),1e6);
 assert.equal(persistenceAfter('pick_leaf',20),1e6,'leaves do not carry the seed');
 // the botany table itself
 assert.equal(breedingLoss(perennial,methods.cut_shoots,0),0);assert.equal(breedingLoss(perennial,methods.pull_whole,3),1);
 assert.equal(breedingLoss(annual,methods.pull_whole,2),0);assert.equal(breedingLoss(annual,methods.fell_tree,1),1);
 assert.equal(breedingLoss(perennial,methods.pick_fruit,0),0);
});

test('rg: ledger conservation — visible_end = visible_start + regrown − taken, postings reproduce it', () => {
 const props={...perennial,seasonDensity:[1,1,0.5,0.1]};
 const events=[];for(let day=0;day<300;day+=7)events.push(harvest(day,['cut_shoots','pick_leaf','pull_whole'][(day/7)%3],150+day%90,(day%10)/10,`g${day%3}`));
 const row=fresh(700),start=row.visible;
 const out=run(row,props,{fromDay:0,toDay:400,harvests:events});
 assert.equal(row.visible,start+out.regrown-out.taken);
 const posted=out.ledger.reduce((n,p)=>n+(p.to==='reserve'?p.amount:0)-(p.from==='reserve'?p.amount:0),0);
 assert.equal(start+posted,row.visible);
 let running=start;
 for(const day of out.days){running+=day.regrown-day.taken;assert.equal(day.visible,running);assert.ok(day.visible>=0&&Number.isSafeInteger(day.visible));}
 assert.ok(out.ledger.every(p=>(p.from==='src:regrowth'&&p.to==='reserve')||(p.from==='reserve'&&p.to==='gatherer')));
 assert.ok(out.taken>0&&out.regrown>0&&out.taken===out.ledger.filter(p=>p.to==='gatherer').reduce((n,p)=>n+p.amount,0));
 // a take can never exceed what stands, and stock never shrinks by itself.
 const small=fresh(5);const r=run(small,perennial,{fromDay:0,toDay:1,harvests:[harvest(0,'pick_leaf',999,0)]});
 assert.equal(r.taken,5);assert.ok(small.visible>=0);
 const sat=fresh(K);const s=run(sat,perennial,{fromDay:0,toDay:50});assert.equal(s.regrown,0);assert.equal(sat.visible,K);
});

test('rg: pending data is refused, never defaulted; every filled value has a source and a published basis', () => {
 assert.equal(data.schema,'ecology/renewables@1');
 const rules=JSON.parse(read('world/meta/rules.json')).forestWater,yields=JSON.parse(read('world/rules/tables/balance/yields.json')).params;
 assert.match(data.pending.spare,/spare/);
 for(const [id,m] of Object.entries(methods)){
  assert.deepStrictEqual(Object.keys(m).sort(),['basis','calibration','kills','source','takesSeed'],`${id}: only fields the module reads, no unsourced cap`);
  assert.ok(['root','shoot','none'].includes(m.kills)&&typeof m.takesSeed==='boolean'&&m.source&&m.basis,id);
 }
 for(const s of data.species){
  assert.ok(s.id&&s.kind&&Array.isArray(s.items)&&Array.isArray(s.pending),s.id);
  assert.equal('seasonDensityParam' in s,false,`${s.id}: no field the module does not read`);
  // pending lists exactly the required fields still unknown
  const missing=['standingPerKm2','restartUnits','regrowFrom','seasonDensity'].filter(f=>s[f]===null||s[f]===undefined);
  if(s.ratePerDay==null&&s.maturityDays==null)missing.unshift('ratePerDay','maturityDays');
  if(s.regrowFrom==='seed'&&s.seedSeason==null)missing.push('seedSeason');
  assert.deepStrictEqual([...s.pending].sort(),[...missing].sort(),`${s.id}: pending is exactly the unknown required fields`);
  if(s.regrowFrom!=='seed')assert.equal('seedSeason' in s,false,`${s.id}: seedSeason only for seed-regenerated species`);
  for(const field of ['ratePerDay','maturityDays','standingPerKm2','restartUnits','regrowFrom','seedSeason','seasonDensity']){
   if(s[field]!==null&&s[field]!==undefined)assert.ok(s.sources?.[field],`${s.id}.${field} has a stated source`);
  }
  assert.equal(s.restartUnits,null,`${s.id}: no basis for a restart base yet`);
  if(s.id.startsWith('forest.')){
   const kind=s.id.split('.')[1];
   assert.equal(s.ratePerDay,rules.forest.species[kind].growthPerDay,`${s.id} rate comes from the published forest rule`);
   assert.equal(s.standingPerKm2,rules.forest.stockPerKm2);
   assert.deepStrictEqual(s.seasonDensity,[1,1,1,1],`${s.id}: forest-water applies one rate all year`);
   assert.deepStrictEqual(s.pending,['restartUnits']);
  }
  const tableId=s.sources?.seasonDensity?.match(/herb[.][a-z]+[.]seasonDensity/)?.[0];
  if(tableId)assert.deepStrictEqual(s.seasonDensity,yields.find(p=>p.id===tableId)?.value,`${s.id} density equals the table entry ${tableId}`);
  // the module refuses every real species until its pending fields are filled
  // settle checks the rate first, then the restart base: the message names the first pending field
  const first=s.ratePerDay==null&&s.maturityDays==null?'species needs ratePerDay or maturityDays':'restartUnits is missing or pending';
  assert.throws(()=>settle(fresh(),{props:s,methods,capacity:K,calendar,spare,fromDay:0,toDay:1}),new RegExp(first),s.id);
  assert.equal(s.ratePerDay!=null&&s.maturityDays!=null,false,`${s.id}: ratePerDay and maturityDays are alternatives`);
  if(s.standingPerKm2===null)assert.throws(()=>capacityOf(s,1),/standingPerKm2 is missing or pending/);
 }
 assert.deepStrictEqual(data.species.filter(s=>s.pending.length===0).map(s=>s.id),[],'no species is runnable yet');
 assert.deepStrictEqual(data.species.filter(s=>s.seasonDensity&&!s.id.startsWith('forest.')).map(s=>s.id).sort(),['herb.honeysuckle','herb.plantain']);
 assert.equal(capacityOf(data.species.find(s=>s.id==='forest.broadleaf'),2),100000);
 assert.equal(baseRate({maturityDays:100}),LOGISTIC_SPAN/100);
 // maturityDays is the logistic 5%→95% time: starting at 5% of capacity, after maturityDays at baseRate the stock is at 95% (derived, not fitted)
 const span=baseRate({maturityDays:100}),curve={};
 const at95=logisticStock(curve,'x',{reserve:50000,capacity:1000000,rate:span,from:0,to:100*1440});
 assert.equal(at95,950000,'5% to 95% in maturityDays');
 // half of the maturity time from 5%: the logistic is at exactly half of capacity (K/2)
 assert.equal(logisticStock({},'x',{reserve:50000,capacity:1000000,rate:span,from:0,to:50*1440}),500000,'halfway through maturity the stock is at K/2');
 assert.throws(()=>baseRate(data.species.find(s=>s.id==='herb.generic')),/species needs ratePerDay or maturityDays/);
 assert.throws(()=>baseRate({ratePerDay:0.1,maturityDays:10}),/ratePerDay and maturityDays are alternatives: give only one/);
});

test('rg: the module source names no resource, item, site or species, no calendar constant and no defaults', () => {
 const source=read('server-plugin/renewable.mjs').split(String.fromCharCode(10)).map(line=>line.split('//')[0]).join(String.fromCharCode(10));
 assert.deepStrictEqual(source.match(/(?:^|[^A-Za-z0-9_])(?:item|loc|bld|npc|skill|site|res)_[a-z0-9_]+/g)??[],[]);
 const names=[...data.species.flatMap(s=>[s.id,...s.items]),...Object.keys(methods)];
 for(const name of names){
  const word=new RegExp('(^|[^A-Za-z0-9_.])'+name.split('.').join('[.]')+'($|[^A-Za-z0-9_])');
  assert.equal(word.test(source),false,'module mentions '+name);
 }
 assert.equal(/if *[(].*(?:forest|herb|water|reed|fruit)/i.test(source),false,'no per-class branches');
 assert.equal(/(^|[^0-9.])(360|90|30)([^0-9]|$)/.test(source),false,'no year/season length constants');
 assert.equal(source.includes('crypto')||source.includes('Math.random'),false,'no randomness');
 assert.equal(/Math[.](log|exp|pow|sqrt|sin|cos|tan|hypot|atan2|acos)/.test(source),false,'transcendental math only through det-math (bit-exact across platforms)');
 assert.ok(source.includes("from './det-math.mjs'"));
 assert.equal(/leaveCap|seasonDensity[^;]*[?][?]|density[^;]*[?][?]/.test(source),false,'no skill constant or silent density default');
});
