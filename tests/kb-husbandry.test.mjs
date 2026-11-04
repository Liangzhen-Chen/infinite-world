import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {installEcologyDefinitions} from '../server-plugin/ecology-dynamics.mjs';

// Card B: husbandry products, feed and culling follow species attributes and
// rule tables; no species carries a product list.
const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const speciesFile=JSON.parse(await fs.readFile('world/ecology/species.json','utf8'));
const byId=(w,id)=>w.monsters.find(m=>m.id===id);
const tagged=(w,id,tag)=>(w.items.find(i=>i.id===id)?.tags??[]).includes(tag);
const run=async(engine,document,tool,args,eventId)=>{const out=await engine.reduce(document,{tool,args,eventId});return applyPatches(document,out.patches);};
const wait=(engine,document,minutes,id)=>run(engine,document,'world_time',{minutes},id);
const premise=(engine,document,setup)=>{const out=applyIntentSetup(engine,document,setup);assert.deepEqual(out.setupUnmet,[]);return out.document;};
const flow=(document,re)=>Object.entries(document.ledger.flows).filter(([k])=>re.test(k)).reduce((n,[,v])=>n+v,0);

// A never-seen species described only by attributes, installed by the real
// loader step. Nothing in it names an item except its feed.
function withNovel(attrs,{mass=60,diet='草食',tags=['beast','fur']}={}){
 const w=structuredClone(world),base=byId(w,'monster_bent_horn_goat');
 w.monsters.push({...structuredClone(base),id:'monster_kb_novel',name:'试验兽',drops:[],diet,tags});
 const config=structuredClone(speciesFile);
 config.species.push({id:'monster_kb_novel',husbandry:{feed:{item:'item_oats',perHead:0.2},birthPerHeadDay:0.001,bodyMassKg:mass,...attrs}});
 return installEcologyDefinitions(w,config);
}

test('a new species given only attributes yields milk, fibre and a body-sized carcass',()=>{
 const w=withNovel({lactation:0.002,coat:'wool'}),s=byId(w,'monster_kb_novel');
 const alive=Object.fromEntries(s.husbandry.yields.alive.map(r=>[r.from,r]));
 assert.ok(tagged(w,alive.lactation.item,'milk'));assert.ok(tagged(w,alive.coat.item,'wool'));
 // 60 kg x 0.002 kg/kg/day over the item's weight.
 assert.ok(Math.abs(alive.lactation.perHeadDay-60*0.002/w.items.find(i=>i.id===alive.lactation.item).weight)<1e-12);
 const kinds=s.drops.map(d=>w.items.find(i=>i.id===d.item).tags);
 assert.ok(kinds.some(t=>t.includes('meat')));assert.ok(kinds.some(t=>t.includes('hide')));
 // Twice the body, (about) twice the carcass.
 const big=byId(withNovel({lactation:0.002,coat:'wool'},{mass:120}),'monster_kb_novel');
 const weight=(sp,ww)=>sp.drops.reduce((n,d)=>n+d.amount*ww.items.find(i=>i.id===d.item).weight,0);
 assert.ok(weight(big,w)>1.8*weight(s,w));
 // A bird lays; no lactation or coat attribute means no milk or fibre.
 const bird=byId(withNovel({layingIntervalDays:2,coat:'feather'},{mass:2,diet:'杂食',tags:['bird','feather']}),'monster_kb_novel');
 assert.deepEqual(bird.husbandry.yields.alive.map(r=>r.from),['laying']);
 assert.ok(bird.drops.some(d=>tagged(w,d.item,'feather')));assert.ok(!bird.drops.some(d=>tagged(w,d.item,'hide')));
 const bare=byId(withNovel({},{mass:undefined}),'monster_kb_novel');
 assert.deepEqual(bare.husbandry.yields.alive,[]);
});

test('authored species keep their attribute-derived goat milk and pheasant eggs',()=>{
 const goat=byId(world,'monster_bent_horn_goat'),bird=byId(world,'monster_oat_pheasant');
 assert.ok(!speciesFile.species.some(s=>s.husbandry?.yields),'species data carries no product list');
 assert.deepEqual(goat.husbandry.yields.alive.map(r=>[r.item,r.perHeadDay>0]),[['item_goat_milk',true],['item_raw_goat_hair',true]]);
 assert.deepEqual(bird.husbandry.yields.alive.map(r=>r.item),['item_pheasant_egg']);
 assert.ok(goat.drops.some(d=>d.item==='item_rawhide'));
});

function playerHerd(species,count,capacity,setup){
 const w=structuredClone(world);
 w.ecology.herds.push({id:'population_kb_player',name:'试验畜群',owner:'player',location:'loc_hw',species,count,capacity});
 const engine=new WorldEngine(w);
 return {engine,document:premise(engine,engine.createCharacter(seed,{},'kb-herd'),{minute:1200,location:'loc_hw',...setup})};
}
const rec=document=>document.state.records['husbandry:population_kb_player'];

test('cut feed: fewer births and products, hunger then starvation; restored feed brings growth back',async()=>{
 let {engine,document}=playerHerd('monster_oat_pheasant',400,3000,{inventory:{item_oats:200}});
 document=await wait(engine,document,240+1440*8,'fed');
 const fed=structuredClone(rec(document));
 assert.ok(fed.born>0&&fed.count>400);assert.equal(fed.fed,1);
 document=premise(engine,document,{inventory:{item_oats:0}});
 const cutDay=Math.floor(document.state.minute/1440);
 document=await wait(engine,document,1440*6,'cut');
 const cut=rec(document);
 assert.equal(cut.born,fed.born,'no births without feed');
 assert.ok(!cut.batches.some(b=>b.day>cutDay),'no eggs without feed');
 assert.ok(cut.hungerHeadDays>0&&cut.starvationDeaths>0&&cut.count<fed.count);
 assert.ok(flow(document,/^sink:death\|population_monster_oat_pheasant\|starvation/)===cut.starvationDeaths);
 document=premise(engine,document,{inventory:{item_oats:400}});
 document=await wait(engine,document,1440*8,'restored');
 assert.ok(rec(document).count>cut.count&&rec(document).born>cut.born);assert.equal(rec(document).hungryDays,0);
 assert.deepEqual(reconcile(engine,document).mismatches,[]);
});

test('partial feed scales births and products by the fed share',async()=>{
 const a=playerHerd('monster_oat_pheasant',400,3000,{inventory:{item_oats:200}}),b=playerHerd('monster_oat_pheasant',400,3000,{inventory:{item_oats:10}});
 const full=await wait(a.engine,a.document,240,'d1'),half=await wait(b.engine,b.document,240,'d1');
 assert.equal(rec(half).fed,0.5);
 assert.ok(rec(half).produce.item_pheasant_egg<rec(full).produce.item_pheasant_egg);
 assert.equal(half.state.inventory.item_oats?.quantity??0,0);
});

test('a full pen does not grow; the player herd is not culled for the player',async()=>{
 let {engine,document}=playerHerd('monster_oat_pheasant',400,400,{inventory:{item_oats:200}});
 document=await wait(engine,document,240+1440*5,'full');
 assert.equal(rec(document).count,400);assert.equal(rec(document).culled??0,0);
});

test('an NPC herder grazes the commons and culls the surplus of a full pen into meat, from real ledger sources',async()=>{
 const w=structuredClone(world);
 w.ecology.herds.push({id:'population_kb_npc',name:'试验雉群',owner:'npc_hw_xiejin',location:'bld_hw_home_21',species:'monster_oat_pheasant',count:400,capacity:400});
 const engine=new WorldEngine(w);
 let document=premise(engine,engine.createCharacter(seed,{},'kb-npc'),{minute:1200});
 document=await wait(engine,document,240+1440*5,'npc');
 const row=document.state.records['husbandry:population_kb_npc'],goats=document.state.records['husbandry:population_hw_home21_goats'];
 assert.equal(row.count,400);assert.ok(row.culled>0);assert.equal(row.fed,1);assert.equal(goats.fed,1);
 assert.ok(flow(document,/^sink:consume\|item_pasture_forage\|husbandry_grazing/)>0);
 assert.ok(flow(document,/^src:regrowth\|item_pasture_forage/)>=flow(document,/^sink:consume\|item_pasture_forage/));
 const meat=byId(engine.world,'monster_oat_pheasant').drops.find(d=>tagged(engine.world,d.item,'meat'));
 assert.equal(flow(document,new RegExp(`^src:husbandry\\|${meat.item}\\|`)),meat.amount*row.culled);
 assert.equal(flow(document,/^sink:death\|population_monster_oat_pheasant\|cull/),row.culled);
 assert.equal(flow(document,/^src:import\|item_pasture_forage/),0);
 assert.deepEqual(reconcile(engine,document).mismatches,[]);
});

test('slaughtering an owned head (K7 individuation) leaves a body-derived carcass that skins into meat, hide and bone',async()=>{
 // A herd kept on the field habitat, where the existing corpse-gathering law applies.
 const w=structuredClone(world);
 w.ecology.herds.push({id:'population_kb_player',name:'试验羊群',owner:'player',location:'loc_hw_fields',species:'monster_bent_horn_goat',count:6,capacity:40});
 const engine=new WorldEngine(w);
 let document=premise(engine,engine.createCharacter(seed,{},'kb-slaughter'),{minute:1200,location:'loc_hw_fields',inventory:{item_kitchen_knife:1,item_water:2}});
 document.state.player.level=30;document.state.player.hp=500;document.state.player.maxHp=500;
 document=await wait(engine,document,60,'settle');
 let out=await engine.reduce(document,{tool:'world_combat',args:{target:'population_kb_player'},eventId:'strike0'});document=applyPatches(document,out.patches);
 const id=Object.keys(document.state.creatures).find(k=>document.state.creatures[k].herd==='population_kb_player');
 assert.equal(rec(document).count,5);
 for(let i=1;i<40&&document.state.creatures[id].status!=='死亡';i++){out=await engine.reduce(document,{tool:'world_combat',args:{target:id},eventId:`strike${i}`});document=applyPatches(document,out.patches);}
 const goat=byId(engine.world,'monster_bent_horn_goat');
 assert.deepEqual(document.state.creatures[id].corpse.items,goat.drops);
 let skinned;for(let i=0;i<60;i++){skinned=applyPatches(document,(await engine.reduce(document,{tool:'world_wildlife',args:{operation:'gather',target:id},eventId:`skin${i}`})).patches);if(skinned.state.creatures[id].corpse.status==='已取材')break;}
 for(const drop of goat.drops)assert.equal(skinned.state.inventory[drop.item].quantity,drop.amount);
 assert.ok(goat.drops.some(d=>tagged(engine.world,d.item,'meat'))&&goat.drops.some(d=>tagged(engine.world,d.item,'hide')));
 assert.equal(skinned.ledger.accounts['population_kb_player|population_monster_bent_horn_goat|population'],5);
 assert.deepEqual(reconcile(engine,skinned).mismatches,[]);
});
