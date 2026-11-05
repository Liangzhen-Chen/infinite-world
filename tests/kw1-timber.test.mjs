// 卡 W1：材料替代的通用规则——替代品必须具备原物品的全部用途类别（item-use-tags.substitutable.requireAllClasses）。
// 木料（燃料 + 木材）能顶木炭去烧；木炭只有燃料一类，顶不了木料去做木柄、木楔。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {itemClasses,resolveMaterials} from '../server-plugin/item-class.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(structuredClone(world));
const view=doc=>({get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
// 锻炉配方里同时有木柄（木料）和炉火（木炭）的那一类：按材料类别找，不点名配方。
const forge=world.recipes.filter(r=>r.workstation==='smithing'&&r.materials.some(m=>m.item==='item_wood')&&r.materials.some(m=>m.item==='item_charcoal'));

test('木材类按木作配方投入的木质原料成批标注；木炭、刨屑不是木材',()=>{
  assert.ok(itemClasses(engine,'item_wood').includes('timber')&&itemClasses(engine,'item_wood').includes('fuel'));
  for(const id of ['item_charcoal','item_wood_shavings'])assert.ok(!itemClasses(engine,id).includes('timber'),id);
  assert.ok(forge.length>0,'世界里有木柄加炉火的锻炉配方');
});

test('缺木料时，木柄配方不会用木炭做成；缺木炭时，锻炉配方可以烧木料',()=>{
  for(const r of forge){
    const wood=r.materials.filter(m=>m.item==='item_wood').reduce((n,m)=>n+m.amount,0),coal=r.materials.filter(m=>m.item==='item_charcoal').reduce((n,m)=>n+m.amount,0);
    // 只有木炭：木料那一行照原样留着（由制作入口报缺），不落到木炭上
    let doc=engine.createCharacter(seed,{},`kw1-coal-${r.id}`);delete doc.state.inventory.item_wood;doc.state.inventory.item_charcoal=coal+wood+5;
    let rows=resolveMaterials(view(doc),engine,'player',r.materials);
    assert.ok(rows.filter((row,i)=>r.materials[i].item==='item_wood').every(row=>row.item==='item_wood'),`${r.id} ${JSON.stringify(rows)}`);
    // 只有木料：炉火那一行改烧木料，木柄那一行仍是木料，两行合计要够数
    doc=engine.createCharacter(seed,{},`kw1-wood-${r.id}`);delete doc.state.inventory.item_charcoal;doc.state.inventory.item_wood=wood+coal;
    rows=resolveMaterials(view(doc),engine,'player',r.materials);
    assert.ok(rows.filter((row,i)=>r.materials[i].item==='item_charcoal').every(row=>row.item==='item_wood'&&row.class==='fuel'),`${r.id} ${JSON.stringify(rows)}`);
  }
});

test('真实制作入口：木楔缺木料、只有木炭时被拒绝，木炭不被扣',async()=>{
  const e=new WorldEngine(structuredClone(world)),doc=e.initialFromLegacy(seed,'kw1-peg');
  doc.state.location='bld_hw_mill';delete doc.state.inventory.item_wood;doc.state.inventory.item_charcoal={quantity:6,quality:'木',durability:100,weight:0.25};
  doc.state.inventory.item_whittling_knife={quantity:1,quality:'木',durability:80,weight:0.2};
  doc.state.skills.skill_life_6_core={proficiency:120,daily:{},breakthroughs:[]};doc.state.recipes.recipe_wooden_pegs={source:{type:'teacher',id:'npc_hw_ayan'}};
  await assert.rejects(e.reduce(doc,{tool:'world_craft',args:{recipe:'recipe_wooden_pegs'},eventId:'kw1-peg-coal'}),/缺少木料/);
  // 有木料就照常做（对照：量具本身是好的）
  doc.state.inventory.item_wood={quantity:2,quality:'木',durability:100,weight:2};
  const out=await e.reduce(doc,{tool:'world_craft',args:{recipe:'recipe_wooden_pegs'},eventId:'kw1-peg-wood'});
  const after=applyPatches(doc,out.patches);
  assert.equal(after.state.inventory.item_charcoal.quantity,6,'木炭没被当木料扣掉');
  assert.equal(after.state.inventory.item_wood?.quantity??0,1);
});
