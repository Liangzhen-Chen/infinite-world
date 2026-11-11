import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld,loadRuntimeWorld} from '../tools/load-world.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {entries,reviewDraftFor,validateDraft} from '../tools/creatures-mixed-content.mjs';
import {readMixedPublication,mergeMixedPublication,publishMixed} from '../tools/publish-creatures-mixed.mjs';
import {species as designed,places,items,batchIds} from '../world/design/creatures-mixed.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {bossCounter} from '../server-plugin/bosses.mjs';
import {affinityMultipliers} from '../server-plugin/creature-nature.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {buildBatch,withoutSites} from '../tools/w5-sites.mjs';
import {sites,priorNoMechanics} from '../world/design/w5-sites-1.mjs';

const loaded=await loadWorld(),publication=await readMixedPublication(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
// T113 completed this batch's five places later. Replay T154 before those
// patches, retaining every unrelated location and later batch unchanged.
const patches=buildBatch(sites.filter(s=>s.existing&&batchIds.places.includes(s.id)),loaded).patches;
const world=withoutSites(loaded,{locations:[],routes:[],patches},priorNoMechanics);
const published=world.monsters.filter(m=>batchIds.species.includes(m.id)),held=publication.held;
const newIds={monsters:new Set(batchIds.species),items:new Set(batchIds.items),locations:new Set(batchIds.places),habitats:new Set(batchIds.habitats),routes:new Set(places.map(p=>p.route.id))};
const before=structuredClone(world);
before.monsters=before.monsters.filter(m=>!newIds.monsters.has(m.id));before.items=before.items.filter(i=>!newIds.items.has(i.id));
before.locations=before.locations.filter(l=>!newIds.locations.has(l.id));before.routes=before.routes.filter(r=>!newIds.routes.has(r.id));
before.rules.wildlife.habitats=before.rules.wildlife.habitats.filter(h=>!newIds.habitats.has(h.id));
const settlements=['loc_hw','loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban','loc_bs'];
const habitatOf=s=>world.rules.wildlife.habitats.find(h=>h.id===s.wildlife.habitat);
// Held species may be appended by a later supplement, so catalog order is not compared.
// T102/T157等后续批次在本批之后追加物品、地点、路线与首领；剔除本批再合并会把本批排到末尾，同样按编号比较。
const sortId=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
// K1在本批发布后给全体物种补了性状标签tags；本批候选不含该字段，比较时只对本批物种剔除tags（正式目录须有tags另行核对）。
// nature.metabolism（物种代谢系数）同 tags 是发布后补的结构化字段：骨架与候选刻意不含，登记在正式目录；比较时只对本批物种剔除该键，nature 其余键仍逐键比较。
const untag=m=>newIds.monsters.has(m.id)?(({tags,...row})=>row.nature?{...row,nature:(({metabolism,...n})=>n)(row.nature)}:row)(m):m;
const norm=w=>({...w,monsters:sortId(w.monsters.map(untag)),items:sortId(w.items),locations:sortId(w.locations),routes:sortId(w.routes),bosses:sortId(w.bosses),rules:{...w.rules,wildlife:{...w.rules.wildlife,habitats:sortId(w.rules.wildlife.habitats)}}});
const insideHours=([a,b])=>a<b?a+30:(a+30)%1440;
function setup(seed,mutate){
 const w=mutate?structuredClone(world):world;if(mutate)mutate(w);
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},seed);doc.state.creatures??={};
 doc.state.player.hp=10000;doc.state.player.maxHp=10000;
 const run=async(d,tool,args,id)=>{const out=await engine.reduce(d,{tool,args,eventId:id});return{doc:applyPatches(d,out.patches),result:out.result};};
 return{engine,doc,run};
}
async function contact(s,label){
 const {engine,doc,run}=setup(`t154-${label}-${s.id}`),h=habitatOf(s);
 doc.state.location=h.location;doc.state.minute=1440*10+insideHours(s.wildlife.activeHours);
 for(let i=0;i<60;i++){const out=await run(doc,'world_wildlife',{operation:'track',species:s.id},`${label}-${i}`);if(out.result.success)return{engine,doc:out.doc,before:doc,run,found:out.result.found,h};}
 throw Error(`未能追踪 ${s.id}`);
}

test('本批正式发布：中西各九的设计，已过L2者入正式目录，未过者留置；合并幂等且冲突拒绝',()=>{
 assert.equal(designed.length,18);
 assert.equal(designed.filter(s=>s.nature.lineage==='中式').length,9);assert.equal(designed.filter(s=>s.nature.lineage==='西式').length,9);
 for(const kind of ['狐妖','木精','游魂','僵尸','灵兽','哥布林','兽人','巨魔','骷髅','元素体','魔兽'])assert.ok(designed.some(s=>s.nature.kind===kind),kind);
 assert.ok(items.length<=6);assert.equal(validateWorld(world).ok,true);
 assert.deepEqual(published.map(m=>m.id).sort(),publication.monsters.map(m=>m.id).sort());
 for(const id of held){assert.ok(!world.monsters.some(m=>m.id===id));assert.ok(['species','pair'].includes(entries.find(e=>e.id===id||e.parts?.some(p=>p.id===id))?.category));}
 assert.deepEqual([...published.map(m=>m.id),...held].sort(),[...batchIds.species].sort());
 assert.ok(published.filter(m=>m.template<=2).length>=12);
 for(const m of published)assert.ok(Array.isArray(m.tags)&&m.tags.length,`${m.id}.tags`);
 for(const m of published){const d=designed.find(s=>s.id===m.id),u=untag(m);for(const k of Object.keys(d))assert.deepEqual(u[k],d[k],`${m.id}.${k}`);}// 与 norm 同口径剔发布后补字段（tags、nature.metabolism），骨架其余键逐键比较
 assert.deepEqual(norm(mergeMixedPublication(before,publication)),norm(world));assert.deepEqual(mergeMixedPublication(world,publication),world);
 const bad=structuredClone(world);bad.monsters.find(m=>m.id===published[0].id).habits+='异文';assert.throws(()=>mergeMixedPublication(bad,publication),/冲突/);
 // Old reviewed species keep their exact text.
 for(const m of before.monsters)assert.deepEqual(world.monsters.find(x=>x.id===m.id),m);
});

test('六个聚落周边都有步行可达的活动区，每处至少两种本批生物可接触',()=>{
 for(const settlement of settlements){
  const near=published.filter(s=>{const loc=habitatOf(s).location;return world.routes.some(r=>r.modes.includes('walk')&&r.lengthKm<=8&&[r.from,r.to].includes(settlement)&&[r.from,r.to].includes(loc));});
  assert.ok(near.length>=2,`${settlement}: ${near.map(s=>s.name)}`);
 }
 for(const p of places){const l=world.locations.find(l=>l.id===p.id);assert.ok(l&&!l.habitat&&!l.route);assert.ok(world.rules.wildlife.habitats.some(h=>h.id===p.habitat.id&&h.location===p.id));}
});

test('每种可正常追踪接触：从未见种群扣一只，灵体带灵体状态，接触不开战不掉落',async t=>{
 for(const s of published)await t.test(s.id,async()=>{
  const {doc,before:b,found,h}=await contact(s,'track'),actor=doc.state.creatures[found.id],pop=d=>d.state.records[`ecology:${h.id}`].populations[s.id];
  assert.equal(actor.species,s.id);assert.equal(actor.location,h.location);assert.ok(s.levelRange[0]<=actor.level&&actor.level<=s.levelRange[1]);
  assert.equal(pop(doc).count,pop(b).count-1);assert.equal(pop(doc).withdrawn,pop(b).withdrawn+1);
  assert.equal(doc.state.player.hp,b.state.player.hp);assert.deepEqual(doc.state.inventory,b.state.inventory);
  if(s.nature.spirit)assert.deepEqual(actor.spirit,{divine:false,rank:s.nature.spirit.rank,nature:s.nature.spirit.nature,realm:'local'});else assert.equal(actor.spirit,undefined);
 });
});

test('赶路进入新活动区会按时段遭遇本批生物，遭遇不默认开战',async()=>{
 const mist=published.filter(s=>s.wildlife.habitat==='habitat_wt_mist_flat').map(s=>s.id);let seen=null;
 for(let i=0;i<300&&!seen;i++){
  const {doc,run}=setup(`t154-move-${i}`);doc.state.location='loc_bs_weiting';doc.state.minute=1440*10+22*60;
  const out=await run(doc,'world_move',{destination:'loc_wild_wt_mist'},'arrive');
  if(out.result.encounter?.kind==='present'&&mist.includes(out.result.encounter.species))seen={doc,out};
 }
 assert.ok(seen,'三百个种子内没有遭遇');
 const {doc,out}=seen,e=out.result.encounter,actor=out.doc.state.creatures[e.target];
 assert.equal(actor.location,'loc_wild_wt_mist');assert.match(e.description,/尚未开战/);
 assert.equal(out.doc.state.player.hp,doc.state.player.hp);assert.deepEqual(out.doc.state.inventory,doc.state.inventory);
});

test('弱点与抗性进入实际交锋倍率，非弱点按常规',async t=>{
 for(const s of published)await t.test(s.id,async()=>{
  const {engine,doc,found}=await contact(s,'affinity'),d={get:(...p)=>p.reduce((v,k)=>v?.[k],doc)};
  for(const tactic of s.nature.affinity.weak)assert.equal(bossCounter(d,engine,found.id,tactic).damageMultiplier,affinityMultipliers.weak);
  for(const tactic of s.nature.affinity.resist)assert.equal(bossCounter(d,engine,found.id,tactic).damageMultiplier,affinityMultipliers.resist);
  for(const tactic of ['armed','unarmed','magic_fire','magic_cold','magic_wind','magic_earth'].filter(x=>![...s.nature.affinity.weak,...s.nature.affinity.resist].includes(x)))assert.equal(bossCounter(d,engine,found.id,tactic).damageMultiplier,1);
 });
 const soul=published.find(s=>s.id==='monster_mist_flat_soul'),{doc,run,found}=await contact(soul,'combat');
 const hit=await run(doc,'world_combat',{target:found.id,intent:'attack'},'hit');assert.deepEqual(hit.result.affinity&&{tactic:hit.result.affinity.tactic,effect:hit.result.affinity.effect},{tactic:'unarmed',effect:'resist'});
});

test('取材：有材料的物种按工具耗材取得登记物品；文明族群与有实体亡灵没有猎物材料',async t=>{
 for(const s of published)await t.test(s.id,async()=>{
  const {doc,run,found}=await contact(s,'gather'),g=s.wildlife.gather;
  Object.assign(doc.state.creatures[found.id],{hp:0,status:'死亡',corpse:{status:'未取材',killedBy:'player',source:'test',expires:doc.state.minute+2880,items:structuredClone(s.drops)}});
  if(g.tool)doc.state.inventory[g.tool]={quantity:1,quality:'木',durability:100,weight:.3};
  for(const c of g.consumes)doc.state.inventory[c.item]={quantity:c.amount*40,quality:'木',durability:100,weight:.25};
  if(!s.drops.length){await assert.rejects(run(doc,'world_wildlife',{operation:'gather',target:found.id},'none'),/没有登记可加工材料/);assert.ok(s.nature.civilized||s.nature.group==='亡灵');return;}
  assert.equal(s.nature.civilized,false);
  let out;for(let i=0;i<40;i++){out=await run(doc,'world_wildlife',{operation:'gather',target:found.id},`g${i}`);if(out.result.success)break;}
  assert.equal(out.result.success,true);for(const drop of s.drops)assert.equal(out.doc.state.inventory[drop.item].quantity,(doc.state.inventory[drop.item]?.quantity??0)+drop.amount);
 });
 for(const s of published.filter(s=>s.nature.civilized)){assert.deepEqual(s.drops,[]);assert.ok(s.nature.exchange.every(id=>world.items.some(i=>i.id===id)));assert.equal(s.taming.possible,false);}
});

test('非繁殖亡灵与元素体按登记季节生成恢复，繁殖物种仍需两只同类',async()=>{
 const {engine,doc,run}=setup('t154-manifest');let d=doc;
 const manifest=published.filter(s=>s.wildlife.manifest),breeding=published.find(s=>s.id==='monster_moss_back_troll');
 for(const s of manifest){const p=d.state.records[`ecology:${s.wildlife.habitat}`].populations[s.id];p.withdrawn+=p.count;p.count=0;}
 const tp=d.state.records[`ecology:${breeding.wildlife.habitat}`].populations[breeding.id];tp.withdrawn+=tp.count-1;tp.count=1;
 const season0=engine.calendar(d.state.minute).season;
 for(let i=0;i<3;i++){const out=await run(d,'world_time',{minutes:7*1440},`week${i}`);d=out.doc;}
 const season=engine.calendar(d.state.minute).season;assert.equal(season,season0);
 for(const s of manifest){const p=d.state.records[`ecology:${s.wildlife.habitat}`].populations[s.id];
  if(s.wildlife.manifest.seasons.includes(season)){assert.ok(p.arisen>0&&p.count===p.arisen,s.id);}else assert.equal(p.count,0,s.id);
  assert.equal(p.born,0);assert.equal(p.initial+p.born+(p.arisen??0)+(p.immigrated??0)-(p.emigrated??0)-p.predated-p.starved-p.withdrawn,p.count);}
 const after=d.state.records[`ecology:${breeding.wildlife.habitat}`].populations[breeding.id];assert.equal(after.count,1);assert.equal(after.born,0);
 assert.ok(manifest.some(s=>!s.wildlife.manifest.seasons.includes(season))||manifest.every(s=>s.wildlife.manifest.seasons.length===4));
});

test('灵体在巢穴迁入生成时同样进入实际灵体状态',async()=>{
 const soul=published.find(s=>s.id==='monster_mist_flat_soul');
 const {doc,run}=setup('t154-lair',w=>{const b=structuredClone(w.bosses.find(b=>b.id==='boss_mud_tusk'));
  Object.assign(b,{id:'boss_t154_probe',name:'试验巢主',lair:'loc_wild_wt_mist'});b.residence={...b.residence,id:'lair_t154_probe',location:'loc_wild_wt_mist',habitat:'habitat_wt_mist_flat',replacementSpecies:[soul.id],vacancyDays:1,minionCount:0};w.bosses.push(b);});
 const r=doc.state.records['lair:lair_t154_probe'];assert.ok(r);Object.assign(r,{status:'空置',occupant:null,vacantSince:0,reoccupyAfter:0});
 const out=await run(doc,'world_time',{minutes:1440},'settle'),lair=out.doc.state.records['lair:lair_t154_probe'];
 assert.equal(lair.occupant?.definition,soul.id);const actor=out.doc.state.creatures[lair.occupant.actor];
 assert.deepEqual(actor.spirit,{divine:false,rank:0,nature:'malevolent',realm:'local'});assert.equal(actor.lair,'lair_t154_probe');
});

test('旧战役升级追加本批栖地与种群，钱物、旧个体与旧种群计数保留',async()=>{
 const oldEngine=new WorldEngine(before),old=oldEngine.createCharacter(legacy,{},'t154-old');
 old.state.records['ecology:habitat_hw_wood'].populations.monster_red_ear_fox.count-=1;old.state.records['ecology:habitat_hw_wood'].populations.monster_red_ear_fox.withdrawn+=1;
 const incoming=compatibleWorld(before,world).world,plan=planWorldUpgrade(old,before,incoming,{worldHash:'t154-edition',eventId:'upgrade'}),up=applyPatches(old,plan.patches);
 assert.deepEqual(up.state.player,old.state.player);assert.deepEqual(up.state.inventory,old.state.inventory);assert.deepEqual(up.state.creatures??{},old.state.creatures??{});
 assert.deepEqual(up.state.records['ecology:habitat_hw_wood'].populations.monster_red_ear_fox,old.state.records['ecology:habitat_hw_wood'].populations.monster_red_ear_fox);
 for(const s of published){const p=up.state.records[`ecology:${s.wildlife.habitat}`]?.populations[s.id];assert.ok(p,s.id);assert.equal(p.count,s.wildlife.population);assert.equal(p.initial,s.wildlife.population);}
 for(const h of batchIds.habitats)assert.equal(up.state.records[`ecology:${h}`].category,'ecology');
 const again=planWorldUpgrade(up,world,compatibleWorld(world,world).world,{worldHash:'t154-edition',eventId:'again'});
 const eco=d=>Object.fromEntries(Object.entries(d.state.records).filter(([k])=>k.startsWith('ecology:')));assert.deepEqual(eco(applyPatches(up,again.patches)),eco(up));
});

test('L1拒绝写繁殖的亡灵、漏写弱点和把文明族群写成猎物材料',()=>{
 for(const e of entries)assert.deepEqual(validateDraft(reviewDraftFor(e),e).errors,[]);
 const soul=entries.find(e=>e.id==='monster_mist_flat_soul'),orc=entries.find(e=>e.id==='monster_split_tusk_orc');
 assert.match(validateDraft({...reviewDraftFor(soul),habits:reviewDraftFor(soul).habits+'春天产下幼崽。'},soul).errors.join(),/繁殖/);
 assert.match(validateDraft({...reviewDraftFor(soul),threat:'夜里别下滩。驱邪、净场的法事能把它驱离。'},soul).errors.join(),/弱点|抗性/);
 assert.match(validateDraft({...reviewDraftFor(orc),materials:'可剥取一张兽皮。'},orc).errors.join(),/猎物/);
});

test('隔离正式发布与重发零写；候选与L4篡改在写入前拒绝',async t=>{
 const root=await fs.mkdtemp(path.join(tmpRoot(),'dnd-t154-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 // A3 archives actions and ontology; carry those inputs into the isolated edition so the full-world equality still checks every field.
 // S5-06: retain the approved ecology catalog in the isolated edition and exact roundtrip.
 for(const folder of ['meta','people','geo','lore','rules','templates','actions','ontology','ecology'])await fs.cp(path.resolve('world',folder),path.join(root,folder),{recursive:true});
 await fs.mkdir(path.join(root,'drafts'));await fs.cp(path.resolve('world/drafts/creatures-mixed'),path.join(root,'drafts/creatures-mixed'),{recursive:true});
 const write=async(file,value)=>fs.writeFile(path.join(root,file),JSON.stringify(value));
 // This fixture writes hydrated rows back to source files; biome metadata
 // stays exclusively in its original file, as it does in the real world.
 const biomes=JSON.parse(await fs.readFile(path.join(root,'geo/biomes.json'),'utf8'));
 const locations=before.locations.map(row=>{const out={...row};for(const key of Object.keys(biomes.locations?.[row.id]??{}))delete out[key];return out;});
 await write('meta/monsters.json',before.monsters);await write('meta/items.json',before.items);await write('geo/locations.json',locations);await write('geo/routes.json',before.routes);await write('meta/rules.json',before.rules);
 const preview=await publishMixed({root});assert.equal(preview.published,false);assert.equal(preview.changed.length,5);
 await publishMixed({root,publish:true});assert.deepEqual(norm(await loadRuntimeWorld(root)),norm(world));assert.deepEqual((await publishMixed({root,publish:true})).changed,[]);
 const stored=JSON.parse(await fs.readFile(path.join(root,'geo/locations.json'),'utf8'));
 for(const row of stored)for(const key of Object.keys(biomes.locations?.[row.id]??{}))assert.equal(Object.hasOwn(row,key),false,`${row.id}.${key}`);
 // Conflicting sources are still rejected; the publisher must preserve the
 // source split rather than make the loader accept duplicate biome fields.
 const originalLocations=await fs.readFile(path.join(root,'geo/locations.json'),'utf8'),id=Object.keys(biomes.locations)[0];
 stored.find(row=>row.id===id).biome=['无名'];await write('geo/locations.json',stored);
 await assert.rejects(loadWorld(root),/群落数据与地点自带字段重复/);await fs.writeFile(path.join(root,'geo/locations.json'),originalLocations);
 for(const [name,mutate,pattern]of [['candidate.json',r=>r.monsters[0].habits+='异文',/候选/],['batch-0.json',r=>r.l4.wave[0].scores[0]=2,/评分/],['batch-0.json',r=>r.l4.approved=false,/L4/]]){
  const p=path.join(root,'drafts/creatures-mixed',name),original=await fs.readFile(p,'utf8'),r=JSON.parse(original);mutate(r);await fs.writeFile(p,JSON.stringify(r));await assert.rejects(publishMixed({root,publish:true}),pattern);await fs.writeFile(p,original);
 }
});
