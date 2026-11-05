// 卡 W1：用途按类别接到各消费点——制作燃料（玩家与 NPC 同一条 resolveMaterials）、公仓收粮、钓饵、仪式治疗用药。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {withAgricultureRules} from '../world/design/agriculture-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {creatureTraits} from '../server-plugin/traits.mjs';
import {resolveMaterials,isItemClass} from '../server-plugin/item-class.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const view=doc=>({get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
const qty=(doc,item)=>{const v=doc.state.inventory[item];return typeof v==='number'?v:v?.quantity??0;};
async function run(engine,doc,tool,args,eventId){const out=await engine.reduce(doc,{tool,args,eventId});return{document:applyPatches(doc,out.patches),result:out.result};}

test('制作：配方写刨屑、行囊只有木炭时，检查与扣料都落到木炭，账本守恒',async()=>{
  const engine=new WorldEngine(structuredClone(world)),initial=engine.createCharacter(seed,{},'kw1-crisp');
  const recipe=world.recipes.find(r=>r.id==='recipe_w3_oat_crisp');
  const doc=applyIntentSetup(engine,initial,{location:'bld_hw_qingdeng',inventory:{item_oat_flour:1,item_water:1,item_charcoal:1,item_cooking_pot:1,item_kitchen_knife:1}}).document;
  doc.state.skills[recipe.skill]={proficiency:300,daily:{},breakthroughs:[]};doc.state.recipes[recipe.id]={source:{type:'fixture'}};
  delete doc.state.inventory.item_wood_shavings;
  assert.equal(qty(doc,'item_wood_shavings'),0);
  const out=await run(engine,doc,'world_craft',{recipe:recipe.id},'kw1-crisp-1');
  assert.equal(qty(out.document,'item_charcoal'),0,'木炭被烧掉');
  assert.ok(out.result.spent.materials.some(m=>m.item==='item_charcoal'),JSON.stringify(out.result.spent));
  assert.ok(!out.result.spent.materials.some(m=>m.item==='item_wood_shavings'));
  assert.deepEqual(auditLedger(out.document.ledger),[]);
  // 盐不是燃料：只有盐时照样报缺刨屑
  const salty=structuredClone(doc);delete salty.state.inventory.item_charcoal;salty.state.inventory.item_salt={quantity:3};
  await assert.rejects(engine.reduce(salty,{tool:'world_craft',args:{recipe:recipe.id},eventId:'kw1-crisp-salt'}),/缺少干木刨屑/);
});

test('NPC 制作与玩家同一条材料落实：NPC 只有木炭时刨屑行落到木炭',()=>{
  const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(seed,{},'kw1-npc');
  const id=Object.keys(doc.state.npcs).sort()[0];doc.state.npcs[id].inventory={item_charcoal:{quantity:2}};
  const rows=resolveMaterials(view(doc),engine,id,[{item:'item_wood_shavings',amount:1}]);
  assert.equal(rows[0].item,'item_charcoal');
});

test('公仓收任何谷物：行囊只有小麦时捐粮按重量折成本仓计量，账本守恒；非谷物拒收',async()=>{
  const engine=new WorldEngine(withAgricultureRules(structuredClone(world))),c=engine.createCharacter(seed,{},'kw1-grain');
  c.state.location='bld_hw_council';c.state.minute=Math.floor(c.state.minute/1440)*1440+540;
  Object.assign(c.state.npcs.npc_hw_chenbai,{location:'bld_hw_council',status:'正常',activity:'办公'});
  delete c.state.inventory.item_oats;c.state.inventory.item_wheat_grain={quantity:3};
  const rec=d=>d.state.records['agriculture:loc_hw'];
  assert.equal(rec(c)?.mode,"managed");
  const food=c.state.settlements.loc_hw.food;
  const out=await run(engine,c,'world_farm',{operation:'donate',quantity:2},'kw1-donate');
  const unit=engine.byId.get(engine.rules.agriculture.grainItem).weight,w=engine.byId.get('item_wheat_grain').weight;
  assert.equal(qty(out.document,'item_wheat_grain'),1);
  assert.equal(out.document.state.settlements.loc_hw.food-food,Math.floor(2*w/unit));
  assert.equal(rec(out.document).ledger.donated-rec(c).ledger.donated,Math.floor(2*w/unit));
  assert.deepEqual(auditLedger(out.document.ledger),[]);
  await assert.rejects(engine.reduce(c,{tool:'world_farm',args:{operation:'donate',quantity:1,item:'item_salt'},eventId:'kw1-salt'}),/只收谷物/);
});

test('钓饵按类别：行囊只有谷粒钓饵（不是规则登记的蚯蚓饵）时照样抛竿并耗掉它；指定非饵被拒',async()=>{
  const engine=new WorldEngine(structuredClone(world)),initial=engine.createCharacter(seed,{},'kw1-bait');
  const rule=world.rules.extraction.fishing,other=world.items.find(i=>i.id!==rule.bait.item&&isItemClass(engine,i.id,'bait')).id;
  const fish=world.monsters.filter(s=>s.wildlife&&creatureTraits(s).tags.includes('fish'));
  const habitat=world.rules.wildlife.habitats.find(h=>fish.some(s=>initial.state.records[`ecology:${h.id}`]?.populations[s.id]?.count>0));
  const out0=applyIntentSetup(engine,initial,{location:habitat.location,inventory:{[rule.tool]:1,[other]:2,item_water:2}});assert.deepEqual(out0.setupUnmet,[]);
  const doc=out0.document;delete doc.state.inventory[rule.bait.item];
  const out=await run(engine,doc,'world_field',{operation:'wildlife_fish'},'kw1-fish');
  assert.equal(qty(out.document,other),1);
  const named=await run(engine,doc,'world_field',{operation:'wildlife_fish',item:other},'kw1-fish-named');
  assert.equal(qty(named.document,other),1);
  await assert.rejects(engine.reduce(doc,{tool:'world_field',args:{operation:'wildlife_fish',item:'item_salt'},eventId:'kw1-fish-salt'}),/不能当钓饵/);
  const none=structuredClone(doc);delete none.state.inventory[other];
  await assert.rejects(engine.reduce(none,{tool:'world_field',args:{operation:'wildlife_fish'},eventId:'kw1-fish-none'}),/钓饵不足/);
});
