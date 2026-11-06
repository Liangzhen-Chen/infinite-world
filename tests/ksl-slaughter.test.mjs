import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadRuntimeWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {installEcologyDefinitions} from '../server-plugin/ecology-dynamics.mjs';
import {advanceHusbandry} from '../server-plugin/husbandry.mjs';
import {householdTool} from '../server-plugin/household-tools.mjs';
import {resolveMaterials,workmanshipNames,craftingParam} from '../server-plugin/item-class.mjs';

// Card SL: an owner slaughters their own beasts and shears living ones. What
// comes out is the species' body-derived carcass or coat (husbandry-traits);
// taking it is a craft (world/meta/mechanics/husbandry-takes.json) settled by
// Q's craftOutcome; someone else's beast is refused as theirs (K6).
const world=await loadRuntimeWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const speciesFile=JSON.parse(await fs.readFile('world/ecology/species.json','utf8'));
const byId=(w,id)=>w.monsters.find(m=>m.id===id);
const takes=world.husbandryTakes.takes;
const premise=(engine,document,setup)=>{const out=applyIntentSetup(engine,document,setup);assert.deepEqual(out.setupUnmet,[]);return out.document;};
const flow=(document,re)=>Object.entries(document.ledger.flows).filter(([k])=>re.test(k)).reduce((n,[,v])=>n+v,0);
const reduce=async(engine,document,tool,args,eventId)=>{const out=await engine.reduce(document,{tool,args,eventId});return {result:out.result,document:applyPatches(document,out.patches)};};
const farm=(engine,document,args,eventId)=>reduce(engine,document,'world_farm',args,eventId);
const HERD='population_ksl_player';
const rec=document=>document.state.records[`husbandry:${HERD}`];

function withNovel(attrs,{mass,diet='草食',tags=['beast','fur']}){
 const w=structuredClone(world),base=byId(w,'monster_bent_horn_goat');
 w.monsters.push({...structuredClone(base),id:'monster_ksl_novel',name:'试验兽',drops:[],diet,tags});
 const config=structuredClone(speciesFile);
 config.species.push({id:'monster_ksl_novel',husbandry:{feed:{item:'item_oats',perHead:0.2},birthPerHeadDay:0.001,bodyMassKg:mass,...attrs}});
 return installEcologyDefinitions(w,config);
}
// The pack carries what is taken (a goat carcass is ~22 kg against a 30 kg safe load),
// so a herd gets exactly the stored feed for the days it is kept.
function herd(species,count,{w=structuredClone(world),location='loc_hw',minute=1200,inventory={},skills={},capacity=count*3,days=0}={}){
 w.ecology.herds.push({id:HERD,name:'试验畜群',owner:'player',location,species,count,capacity});
 const engine=new WorldEngine(w);
 const document=premise(engine,engine.createCharacter(seed,{},`ksl-${species}`),{minute,location,inventory:{item_oats:days*Math.ceil(count*byId(w,species).husbandry.feed.perHead),...inventory},abilities:{skills}});
 return {engine,document};
}
const SKILLED={[takes.carcass.skill]:900,[takes.coat.skill]:900};
// Repeat with fresh event ids until the take succeeds (the check is seeded by the event id).
async function untilSuccess(engine,document,args,tag){
 for(let i=0;i<40;i++){const r=await farm(engine,document,args,`${tag}${i}`);if(r.result.success)return r;}
 throw Error('40 次都没成功');
}

test('slaughtering own heads yields the body-derived carcass of each species, books the herd down, no wild XP',async()=>{
 const novel=withNovel({coat:'wool'},{mass:30});
 for(const [species,w,heads] of [['monster_bent_horn_goat',undefined,1],['monster_oat_pheasant',undefined,2],['monster_ksl_novel',novel,1]]){
  const {engine,document}=herd(species,6,{...(w?{w}:{}),inventory:{item_kitchen_knife:1},skills:SKILLED});
  const s=byId(engine.world,species),parts=s.husbandry.yields.carcass;
  assert.ok(parts.length,`${species} 有由体型推出的胴体部分`);
  const before=structuredClone(document);
  const {result,document:after}=await untilSuccess(engine,document,{operation:'husbandry_slaughter',target:HERD,quantity:heads},`sl-${species}-`);
  assert.equal(rec(after).count,rec(before).count-heads);assert.equal(rec(after).slaughtered,heads);
  assert.equal(flow(after,new RegExp(`^sink:death\\|population_${species}\\|slaughter`)),heads);
  assert.deepEqual(result.obtained.map(o=>[o.item,o.quantity]),parts.map(p=>[p.item,p.amount*heads]));
  assert.deepEqual(result.lost,[]);
  for(const p of parts)assert.equal(after.state.inventory[p.item].quantity-(before.state.inventory[p.item]?.quantity??0),p.amount*heads);
  // Every part unit names the herd it came from and its owner.
  const unit=after.state.itemInstances[result.obtained[0].instances[0]];
  assert.equal(unit.recipe.population,HERD);assert.equal(unit.recipe.owner,'player');assert.equal(unit.maker,HERD);
  assert.equal(result.experience,0);assert.equal(after.state.player.experience,before.state.player.experience);
  assert.equal(after.state.minute-before.state.minute>=result.minutes,true);
  assert.deepEqual(reconcile(engine,after).mismatches,[]);
 }
 // A heavier body of the same build gives a larger carcass.
 const heavier=withNovel({coat:'wool'},{mass:60}),small=byId(novel,'monster_ksl_novel'),big=byId(heavier,'monster_ksl_novel');
 const kg=(s,w)=>s.husbandry.yields.carcass.reduce((n,p)=>n+p.amount*w.items.find(i=>i.id===p.item).weight,0);
 assert.ok(kg(big,heavier)>1.8*kg(small,novel));
});

test('a cut tool by use class, not by id: any cutting tool works, none is refused before time is spent',async()=>{
 const {engine,document}=herd('monster_bent_horn_goat',4,{skills:SKILLED});
 await assert.rejects(farm(engine,document,{operation:'husbandry_slaughter',target:HERD},'no-knife'),/cut/);
 const shears=premise(engine,document,{inventory:{item_leather_shears:1}});
 const {result}=await untilSuccess(engine,shears,{operation:'husbandry_slaughter',target:HERD,tool:'item_leather_shears'},'shears');
 assert.equal(result.tool,'item_leather_shears');
});

test('another household\'s herd and another\'s beast are refused as theirs; nothing changes',async()=>{
 const engine=new WorldEngine(structuredClone(world));
 const document=premise(engine,engine.createCharacter(seed,{},'ksl-theft'),{minute:1200,location:'bld_hw_home_21',inventory:{item_kitchen_knife:1}});
 const goats='population_hw_home21_goats';
 await assert.rejects(farm(engine,document,{operation:'husbandry_slaughter',target:goats},'theirs'),/谢堇.*毁坏他人财物/);
 await assert.rejects(farm(engine,document,{operation:'husbandry_collect',target:goats,item:'item_raw_goat_hair'},'theirs-hair'),/所有权/);
});

test('an owned individual led out of the herd is slaughtered the same way; its body is closed',async()=>{
 const {engine,document:d0}=herd('monster_bent_horn_goat',6,{location:'loc_hw_fields',inventory:{item_kitchen_knife:1},skills:SKILLED});
 const d1=structuredClone(d0);d1.state.player.level=30;d1.state.player.hp=500;d1.state.player.maxHp=500;
 // Leading one head out of the herd is the existing K7 individuation.
 const {document:settled}=await reduce(engine,d1,'world_time',{minutes:60},'settle');
 // The blow that leads a head out is seeded by its event id; take a lead whose
 // head is still alive, so the slaughter below always runs on a living beast.
 let led=null,id=null;
 for(let i=0;i<10&&!led;i++){
  const {document:next}=await reduce(engine,settled,'world_combat',{target:HERD},`lead${i}`);
  const head=Object.keys(next.state.creatures).find(k=>next.state.creatures[k].herd===HERD);
  if(next.state.creatures[head].hp>0){led=next;id=head;}
 }
 assert.ok(led,'牵出的那头仍活着');
 const {result,document:after}=await untilSuccess(engine,led,{operation:'husbandry_slaughter',target:id},'one');
 const parts=byId(engine.world,'monster_bent_horn_goat').husbandry.yields.carcass;
 assert.deepEqual(result.obtained.map(o=>[o.item,o.quantity]),parts.map(p=>[p.item,p.amount]));
 assert.equal(after.state.creatures[id].hp,0);assert.equal(after.state.creatures[id].corpse?.status,'已取材');
 assert.equal(after.state.itemInstances[result.obtained[0].instances[0]].recipe.creature,id);
 await assert.rejects(farm(engine,after,{operation:'husbandry_slaughter',target:id},'again'),/活着/);
 assert.deepEqual(reconcile(engine,after).mismatches,[]);
});

test('outsiders take less and worse: the same craftOutcome law as manufacturing',async()=>{
 const {engine,document}=herd('monster_bent_horn_goat',40,{inventory:{item_kitchen_knife:1}});
 const skilled=premise(engine,document,{abilities:{skills:SKILLED}});
 const names=workmanshipNames(engine),cap=names.indexOf(craftingParam(engine,'workmanship.shortfall').noSkill);
 const sample=async(doc,tag)=>{const out=[];for(let i=0;i<12;i++){const {result}=await farm(engine,doc,{operation:'husbandry_slaughter',target:HERD},`${tag}${i}`);
  const got=result.obtained.reduce((n,o)=>n+o.quantity,0),lost=result.lost.reduce((n,o)=>n+o.quantity,0);out.push({kept:got/(got+lost),tier:result.workmanship?names.indexOf(result.workmanship):null,result});}return out;};
 const novice=await sample(document,'novice'),expert=await sample(skilled,'expert');
 assert.ok(novice.every(r=>r.result.standing==='noSkill'&&(r.tier===null||r.tier<=cap)),'外行出品不超过 shortfall 封顶档');
 assert.ok(expert.some(r=>r.tier!==null&&r.tier>cap),'熟手能出高于外行封顶的档');
 const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
 assert.ok(mean(novice.map(r=>r.kept))<=mean(expert.map(r=>r.kept)),'外行损耗不少于熟手');
 assert.ok(novice.some(r=>r.kept<1)||mean(novice.map(r=>r.tier??0))<mean(expert.map(r=>r.tier??0)));
});

test('shearing: a coated species grows a coat by season, sheds past a coat-year, is shorn with a cut tool; a bare one has none',async()=>{
 const spring=herd('monster_bent_horn_goat',40,{skills:SKILLED,days:10});
 const grow=async({engine,document},tag)=>(await reduce(engine,document,'world_time',{minutes:1440*10},tag)).document;
 const a=await grow(spring,'spring'),engine=spring.engine;
 // One day's coat growth on the production daily settlement, a spring day against a
 // summer day (the date and the herds' last settled day are premises).
 const big=herd('monster_bent_horn_goat',400,{days:2}),opened=await grow(big,'open');
 const dayGrowth=day=>{
  const facts=Object.entries(opened.state.records).filter(([,r])=>r.category==='husbandry').map(([k,r])=>({path:['state','records',k],value:{...r,lastDay:day-1,produce:{},batches:[],stock:{}}}));
  const doc=premise(big.engine,opened,{minute:day*1440+600,inventory:{item_oats:200},facts});
  const d=big.engine.primitiveDraft(doc);advanceHusbandry(d,big.engine,day);
  return d.get('state','records',`husbandry:${HERD}`).produce.item_raw_goat_hair;
 };
 const springDay=dayGrowth(20),summerDay=dayGrowth(110),coat=takes.coat.seasonGrowth;
 assert.ok(summerDay<springDay,`夏季长毛慢：春 ${springDay} 夏 ${summerDay}`);
 assert.ok(Math.abs(coat.reduce((a,b)=>a+b,0)/coat.length-1)<1e-12,'四季平均为 1，年毛量不变');
 await assert.rejects(farm(engine,a,{operation:'husbandry_collect',target:HERD,item:'item_raw_goat_hair'},'no-shears'),/cut/);
 const armed=premise(engine,a,{inventory:{item_leather_shears:1}});
 const {result,document:shorn}=await untilSuccess(engine,armed,{operation:'husbandry_collect',target:HERD,item:'item_raw_goat_hair',quantity:2},'shear');
 assert.equal(result.obtained[0].quantity,2);
 const unit=shorn.state.itemInstances[result.obtained[0].instances[0]];
 assert.equal(unit.recipe.population,HERD);assert.equal(unit.recipe.owner,'player');
 assert.equal(rec(shorn).produce.item_raw_goat_hair,rec(armed).produce.item_raw_goat_hair-2);
 assert.deepEqual(reconcile(engine,shorn).mismatches,[]);
 // Milk is still a plain pickup: the take law names only crafted sources.
 const milk=await farm(engine,a,{operation:'husbandry_collect',target:HERD,item:'item_goat_milk'},'milk');
 assert.equal(milk.result.success,true);assert.equal(milk.result.tool,undefined);
 // A feathered bird has no coat product.
 const birds=herd('monster_oat_pheasant',40,{inventory:{item_leather_shears:1},days:10});
 assert.ok(!byId(birds.engine.world,'monster_oat_pheasant').husbandry.yields.alive.some(r=>r.from==='coat'));
 await assert.rejects(farm(birds.engine,(await grow(birds,'birds')),{operation:'husbandry_collect',target:HERD,item:'item_raw_goat_hair'},'bird-hair'),/畜产物/);
 // Past holdDays of growth the coat sheds; the shed hair leaves the books as decay.
 const w=structuredClone(world);w.husbandryTakes.takes.coat.holdDays=3;
 const short=herd('monster_bent_horn_goat',40,{w,days:10});
 const old=await grow(short,'shed'),row=rec(old),per=byId(short.engine.world,'monster_bent_horn_goat').husbandry.yields.alive.find(r=>r.from==='coat').perHeadDay;
 assert.ok(row.shed>0&&row.produce.item_raw_goat_hair<=Math.floor(row.count*per*3));
 assert.equal(flow(old,/^sink:decay\|item_raw_goat_hair\|shed/),row.shed);
 assert.deepEqual(reconcile(short.engine,old).mismatches,[]);
});

test('shorn goat hair stands in for generic animal hair in a brush; plain fibre does not; the brush traces to the herd',async()=>{
 const recipe=world.recipes.find(r=>r.materials.some(m=>m.item==='item_raw_animal_hair'));
 const {engine,document}=herd('monster_bent_horn_goat',40,{skills:{...SKILLED,[recipe.skill]:900},inventory:{item_leather_shears:1},days:4});
 const grown=(await reduce(engine,document,'world_time',{minutes:1440*4},'grow')).document;
 const {result,document:shorn}=await untilSuccess(engine,grown,{operation:'husbandry_collect',target:HERD,item:'item_raw_goat_hair'},'shear');
 const hair=result.obtained[0].instances[0];
 const at=structuredClone(shorn);at.state.location='bld_hw_mill';
 let c=premise(engine,at,{inventory:{...Object.fromEntries(recipe.materials.filter(m=>m.item!=='item_raw_animal_hair').map(m=>[m.item,m.amount])),...Object.fromEntries((recipe.tools??[]).map(t=>[t,1]))}});
 c.state.recipes[recipe.id]={source:{type:'teacher',id:'npc_hw_ayan'}};
 const view={get:(...p)=>p.reduce((o,k)=>o?.[k],c)};
 assert.deepEqual(resolveMaterials(view,engine,'player',recipe.materials).find(r=>r.authored==='item_raw_animal_hair')?.item,'item_raw_goat_hair');
 // Flax is fibre but not hair: it cannot stand in.
 const flax=structuredClone(c);delete flax.state.inventory.item_raw_goat_hair;flax.state.inventory.item_flax={quantity:5,quality:'木',durability:100,weight:engine.byId.get('item_flax').weight};
 const flaxView={get:(...p)=>p.reduce((o,k)=>o?.[k],flax)};
 assert.equal(resolveMaterials(flaxView,engine,'player',recipe.materials).find(r=>r.item==='item_raw_animal_hair')?.item,'item_raw_animal_hair');
 await assert.rejects(engine.reduce(flax,{tool:'world_craft',args:{recipe:recipe.id},eventId:'flax-brush'}),/缺少/);
 // The real craft consumes the shorn unit; it names the herd and owner it came from.
 let crafted=null;
 for(let i=0;i<20&&!crafted;i++){const out=await engine.reduce(c,{tool:'world_craft',args:{recipe:recipe.id},eventId:`brush${i}`});const next=applyPatches(c,out.patches);if(out.result.success){crafted=next;}}
 assert.ok(crafted,'毛刷制成');
 const used=crafted.state.itemInstances[hair];
 assert.equal(used.status,'已消耗');assert.equal(used.recipe.population,HERD);
});

test('what the pack cannot carry stays where it was cut, the owner\'s, and is picked up later without a new check',async()=>{
 const parts=byId(world,'monster_bent_horn_goat').husbandry.yields.carcass;
 // A herd: two goats (~44 kg) against a 30 kg load; the rest goes into the herd's store with its workmanship.
 const {engine,document}=herd('monster_bent_horn_goat',6,{inventory:{item_kitchen_knife:1},skills:SKILLED});
 const {result,document:after}=await untilSuccess(engine,document,{operation:'husbandry_slaughter',target:HERD,quantity:2},'heavy');
 assert.ok(result.leftBehind?.length,'背不动的部分留下');
 for(const p of parts)assert.equal((result.obtained.find(o=>o.item===p.item)?.quantity??0)+(result.leftBehind.find(o=>o.item===p.item)?.quantity??0),p.amount*2);
 for(const r of result.leftBehind){
  assert.equal(rec(after).produce[r.item]-(rec(document).produce[r.item]??0),r.quantity);
  assert.ok(rec(after).batches.some(b=>b.item===r.item&&b.workmanship===result.workmanship));
 }
 assert.deepEqual(reconcile(engine,after).mismatches,[]);
 // Later, with room in the pack (the carried meat eaten or sold: a premise), the owner collects it.
 const r0=result.leftBehind[0],light=premise(engine,after,{inventory:Object.fromEntries(result.obtained.map(o=>[o.item,0]))});
 const back=await farm(engine,light,{operation:'husbandry_collect',target:HERD,item:r0.item,quantity:1},'collect-left');
 assert.equal(back.result.success,true);
 assert.equal(back.document.state.itemInstances[back.result.obtained[0].instances[0]].workmanship,result.workmanship);
 // An individual: its parts stay on its dressed body; the owner picks them up, another may not.
 const field=herd('monster_bent_horn_goat',6,{location:'loc_hw_fields',inventory:{item_kitchen_knife:1,item_oats:40},skills:SKILLED});
 const d1=structuredClone(field.document);d1.state.player.level=30;d1.state.player.hp=500;d1.state.player.maxHp=500;
 const {document:settled}=await reduce(field.engine,d1,'world_time',{minutes:60},'settle');
 let led=null,id=null;
 for(let i=0;i<10&&!led;i++){const {document:next}=await reduce(field.engine,settled,'world_combat',{target:HERD},`lead${i}`);const head=Object.keys(next.state.creatures).find(k=>next.state.creatures[k].herd===HERD);if(next.state.creatures[head].hp>0){led=next;id=head;}}
 assert.ok(led,'牵出的那头仍活着');
 const cut=await untilSuccess(field.engine,led,{operation:'husbandry_slaughter',target:id},'body');
 const body=cut.document.state.creatures[id].corpse;
 assert.ok(cut.result.leftBehind?.length);assert.equal(body.status,'已分割');
 assert.deepEqual(body.items,cut.result.leftBehind.map(r=>({item:r.item,amount:r.quantity})));
 const theirs=premise(field.engine,cut.document,{facts:[{path:['state','creatures',id,'corpse','owner'],value:'npc_hw_xiejin'}]});
 await assert.rejects(reduce(field.engine,theirs,'world_wildlife',{operation:'gather',target:id},'not-mine'),/谢堇.*不能拿走/);
 const unloaded=premise(field.engine,cut.document,{inventory:{item_oats:0,...Object.fromEntries(cut.result.obtained.map(o=>[o.item,0]))}});
 const picked=await reduce(field.engine,unloaded,'world_wildlife',{operation:'gather',target:id},'pick');
 assert.equal(picked.result.success,true);
 assert.deepEqual(picked.result.obtained.map(o=>[o.item,o.quantity]),cut.result.leftBehind.map(r=>[r.item,r.quantity]));
 assert.equal(picked.document.state.creatures[id].corpse.status,'已取材');
 const unit=picked.document.state.itemInstances[picked.result.obtained[0].instances[0]];
 assert.equal(unit.recipe.creature,id);assert.equal(unit.workmanship,cut.result.workmanship);
 assert.equal(picked.document.state.minute,unloaded.state.minute,'纯拾取不耗时、不检定');
});

test('household tools: at home one may use a tool any member of the household holds there; a house with none has none',async()=>{
 const engine=new WorldEngine(structuredClone(world));
 const document=premise(engine,engine.createCharacter(seed,{},'ksl-house'),{minute:1200});
 const d=engine.primitiveDraft(document);
 // 段家 (house_hw_04, the forge): 段禾 holds no blade, 段岩 at home does.
 const lent=householdTool(d,engine,'cut',undefined,'npc_hw_duanhe');
 assert.equal(lent.holder,'npc_hw_duanyan');assert.ok((engine.byId.get(lent.item).tags??[]).includes('cut'));
 assert.equal(householdTool(d,engine,'cut',undefined,'npc_hw_duanyan').holder,'npc_hw_duanyan','自己有就用自己的');
 // 陶家 (house_hw_06): nobody in the house holds a cutting tool.
 assert.throws(()=>householdTool(d,engine,'cut',undefined,'npc_hw_taozhi'),e=>e.code==='E-ACTION-TOOL');
 // Away from home a member's tool is out of reach.
 const away=premise(engine,document,{facts:[{path:['state','npcs','npc_hw_duanhe','location'],value:'loc_hw'}]});
 assert.throws(()=>householdTool(engine.primitiveDraft(away),engine,'cut',undefined,'npc_hw_duanhe'),e=>e.code==='E-ACTION-TOOL');
});
