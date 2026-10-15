import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {generateCounty,remoteWorld} from '../server-plugin/remote-generation.mjs';
import {legalCodeAt,miningJurisdiction} from '../server-plugin/law-codes.mjs';
import {adjudicateLegalCase} from '../server-plugin/law.mjs';
import {locationTraits} from '../server-plugin/traits.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const ORE='item_iron_ore',HOME_POLITY='law_royal_xichui';
// Every place a pick can reach: own minerals, the mining table, or a deposit-bearing terrain.
function reachable(w){
 const r=w.rules.extraction.mining;
 return w.locations.flatMap(p=>{const tags=locationTraits(p).tags,dep=p.minerals??r.locations?.[p.id]??r.terrain.find(t=>tags.includes(t.tag))?.minerals;
  const owner=dep?.find(s=>s.owner)?.owner??p.owner;return dep&&owner?[{id:p.id,owner}]:[];});
}
function remoteState(counties){
 const state={records:{},npcs:{},remote:{},minute:600};
 for(const county of counties){const skeleton=generateCounty(world,county,'R10A');state.remote[county]={county,skeleton,profiles:{}};for(const p of skeleton.people)state.npcs[p.id]={status:'正常',location:p.location,activity:'办公',occupation:p.occupation,coins:1000};}
 return state;
}
// A campaign on the given world, optionally with remote counties expanded.
function campaign(edit=()=>{},counties=[]){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}edit(w);
 let doc=new WorldEngine(w).createCharacter(seed,{},'r10a-mining');
 doc.state.minute=600;doc.state.player.level=100;doc.state.player.coins=5000;
 doc.state.inventory.item_mining_pick={quantity:1,quality:w.items.find(i=>i.id==='item_mining_pick').quality,durability:100};
 for(const n of Object.values(doc.state.npcs))Object.assign(n,{location:'loc_capital',activity:'闲谈',status:'正常'});
 if(counties.length){const s=remoteState(counties);doc.state.remote=s.remote;Object.assign(doc.state.npcs,s.npcs);for(const n of Object.values(s.npcs))n.location='loc_capital';}
 // The campaign engine overlays expanded counties itself; views read the same overlay.
 const base=new WorldEngine(w),engine=counties.length?new WorldEngine(remoteWorld(w,doc.state)):base;
 const event=label=>{for(let n=0;;n++){const id=`${label}_${n}`;if(createHash('sha256').update(`${doc.randomSeed}:${id}:d20`).digest().readUInt32LE(0)%20+1===20)return id;}};
 const mine=async(location,label)=>{doc.state.location=location;const out=await base.reduce(doc,{tool:'world_field',args:{operation:'site_mine',item:ORE},eventId:event(label)});doc=applyPatches(doc,out.patches);return out.result;};
 const place=(id,location)=>Object.assign(doc.state.npcs[id],{location,activity:'当值',status:'正常'});
 const draft=()=>({document:doc,get:(...p)=>p.reduce((o,k)=>o?.[k],{state:doc.state}),set:(p,v)=>{let o={state:doc.state};for(const k of p.slice(0,-1))o=o[k]??={};o[p.at(-1)]=v;},say:()=>{}});
 return {w,engine,mine,place,draft,get doc(){return doc;}};
}
// Convict on a confession so the sentence is the code's own reading of the offense.
function sentence(f,caseId){
 const row=structuredClone(f.doc.state.records[caseId]),code=legalCodeAt(f.engine,row.location,f.doc.state);
 row.evidence=[...row.evidence,{kind:'confession',subject:'player',minute:f.doc.state.minute}];f.doc.state.records[caseId]=row;
 return adjudicateLegalCase(f.draft(),f.engine,row,code,code.judges[0],`${caseId}:judge`).judgment.fine;
}

test('本地所有可开采的有主地点都派生出法域：五村读本村法典并以西陲王国法典补罪名，自治营地读本会规矩，无法院的白石镇只读政体条文',()=>{
 const engine=new WorldEngine(world),seen={code:0,faction:0,polity:0};
 for(const {id}of reachable(world)){
  const j=miningJurisdiction(engine,{},id);seen[j.kind]++;
  if(j.kind==='code'){assert.match(j.law,/^law_(hw|yp|wt|lq|sb)_property$/,id);assert.equal(j.template,HOME_POLITY,id);assert.deepEqual(j.penalty,world.rules.law.templates.find(t=>t.id===HOME_POLITY).penalties.illegal_mining);}
  else if(j.kind==='faction'){assert.match(j.faction,/^faction_ms_/,id);assert.ok(j.rule.standing<0);}
  else{assert.equal(j.law,HOME_POLITY,id);assert.equal(j.executable,false);assert.match(id,/^(loc_bs|bld_bs_|site_w5_)/,id);}
 }
 assert.ok(seen.code&&seen.faction&&seen.polity,JSON.stringify(seen));
 assert.equal(world.rules.law.activityPenalties.illegal_mining,undefined,'盗采不再有全局默认刑罚');
});

test('展开的远方郡按各自统治政体的九省法典立案：王国寒炉与赭牙部盟的盗采分别判罚',async()=>{
 const counties=['county_hanlu_tongji','county_hanlu_zheya'];
 const f=campaign(w=>{w.rules.law.templates.find(t=>t.id==='law_orcmoot').penalties.illegal_mining={baseFine:31,valueMultiplier:3};},counties);
 for(const county of counties){const state=remoteState([county]);
  for(const {id}of reachable(remoteWorld(world,state)).filter(r=>r.id.includes(county.replace('county_','')))){
   const j=miningJurisdiction(f.engine,f.doc.state,id),ruler=world.regions.find(r=>r.id===county).ruler.polity;
   assert.equal(j.kind,'code',id);assert.equal(j.polity,ruler.startsWith('王国')?'王国':ruler,id);
  }
 }
 const fines={};
 for(const [county,polity,template]of [['county_hanlu_tongji','王国','law_royal_hanlu'],['county_hanlu_zheya','赭牙部盟','law_orcmoot']]){
  const sk=f.doc.state.remote[county].skeleton,district=sk.locations.find(l=>l.owner===sk.seat&&l.parent===sk.seat).id;
  f.engine.rules.extraction.mining.locations[district]=[{item:ORE,reserve:5,recoveryDays:0}];
  const code=legalCodeAt(f.engine,district,f.doc.state);assert.equal(code.template,template);f.place(code.officers[0],district);
  const out=await f.mine(district,county);
  assert.equal(out.success,true);assert.equal(out.illegal,true);assert.equal(out.jurisdiction.law,code.id);assert.equal(out.jurisdiction.polity,polity);
  const row=f.doc.state.records[out.case];assert.equal(row.law,code.id);assert.equal(row.offense,'illegal_mining');assert.equal(row.victim,sk.seat);
  fines[polity]=sentence(f,out.case);
 }
 const ore=world.items.find(i=>i.id===ORE).basePrice;
 assert.deepEqual(fines,{'王国':15+ore*2,'赭牙部盟':31+ore*3});
});

test('五村盗采按西陲王国法典判罚，不读全局默认；政体条文缺罪名时明确拒绝',async()=>{
 const owner='npc_hw_linsui',officer='npc_hw_gucen';
 const f=campaign(w=>{w.rules.extraction.mining.locations.loc_hw_gate=[{item:ORE,reserve:3,owner,recoveryDays:0}];
  w.rules.law.templates.find(t=>t.id===HOME_POLITY).penalties.illegal_mining={baseFine:17,valueMultiplier:1};
  w.rules.law.activityPenalties.illegal_mining={baseFine:999,valueMultiplier:9};});
 f.place(owner,'loc_hw_gate');f.place(officer,'loc_hw_gate');
 const out=await f.mine('loc_hw_gate','hw');
 assert.equal(out.jurisdiction.law,'law_hw_property');assert.deepEqual(out.jurisdiction.penalty,{baseFine:17,valueMultiplier:1});
 assert.equal(sentence(f,out.case),17+world.items.find(i=>i.id===ORE).basePrice);
 delete f.engine.rules.law.templates.find(t=>t.id===HOME_POLITY).penalties.illegal_mining;
 const before=f.doc.state.records[`mineral:loc_hw_gate:${ORE}`];
 await assert.rejects(f.mine('loc_hw_gate','hw_missing'),/law_hw_property 缺少illegal_mining罪名/);
 assert.deepEqual(f.doc.state.records[`mineral:loc_hw_gate:${ORE}`],before);
});

test('自治营地无法典：被看见时按共炉议规矩降立场、不立案；规矩缺失时明确拒绝而不借用五村法典',async()=>{
 const f=campaign(),adit='site_ms_ll_adit',witness='npc_ms_ll_yajin';
 const before=standing(f.engine,f.doc.state,'faction_ms_lielu','player');
 const unseen=await f.mine(adit,'unseen');
 assert.equal(unseen.jurisdiction.kind,'faction');assert.equal(unseen.jurisdiction.witnessed,false);assert.equal(unseen.case,null);
 assert.equal(standing(f.engine,f.doc.state,'faction_ms_lielu','player'),before);
 f.place(witness,adit);
 const seen=await f.mine(adit,'seen');
 assert.equal(seen.jurisdiction.faction,'faction_ms_lielu');assert.equal(seen.jurisdiction.standing,-15);assert.equal(seen.case,null);
 assert.equal(standing(f.engine,f.doc.state,'faction_ms_lielu','player'),before-15);
 assert.ok(!Object.values(f.doc.state.records).some(r=>r.category==='legal_case'));
 delete f.engine.rules.law.autonomy.factions.faction_ms_lielu;
 await assert.rejects(f.mine(adit,'no_custom'),/faction_ms_lielu 缺少illegal_mining规矩/);
});

test('旧战役world_upgrade保留原有变化，升级后自治营地盗采按新规矩处理',async()=>{
 const old=structuredClone(world);delete old.rules.law.autonomy;old.rules.law.activityPenalties.illegal_mining={baseFine:15,valueMultiplier:2};
 const oldEngine=new WorldEngine(old);let doc=oldEngine.createCharacter(seed,{},'r10a-upgrade');
 doc.state.player.coins=777;doc.state.records['mineral:site_ms_ll_adit:item_iron_ore']={category:'mineral',location:'site_ms_ll_adit',item:ORE,initial:30,reserve:28,extracted:2,recovered:0,updatedAt:0};
 const saved=structuredClone(doc),incoming=compatibleWorld(old,world).world;
 const plan=planWorldUpgrade(doc,old,incoming,{worldHash:'r10a-edition',eventId:'r10a-upgrade'});doc=applyPatches(doc,plan.patches);
  assert.deepEqual(doc.state.player,saved.state.player);assert.deepEqual(Object.fromEntries(Object.entries(doc.state.records).filter(([k])=>!k.startsWith('world_update_'))),saved.state.records);assert.deepEqual(doc.state.inventory,saved.state.inventory);
 const engine=new WorldEngine(incoming);
 assert.equal(miningJurisdiction(engine,doc.state,'site_ms_ll_adit').faction,'faction_ms_lielu');
 assert.throws(()=>miningJurisdiction(oldEngine,doc.state,'site_ms_ll_adit'),/缺少illegal_mining规矩/);
});
