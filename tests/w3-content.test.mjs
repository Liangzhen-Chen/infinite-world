import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {economyW3} from '../world/design/economy-w3.mjs';
import {assembleW3,validateW3Draft,w3Context,chineseNumber} from '../tools/w3-content.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches} from '../server-plugin/storage.mjs';
import {WorldRegistry} from '../server-plugin/world-registry.mjs';
import {archivedReducer} from '../server-plugin/archived-reducer.mjs';

const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const world=await loadWorld(),bones=economyW3(world);
const lore=[...bones.items.map(row=>({id:row.id,description:row.use,inspection:'检查接合、边角与表面，若有开裂或污损则另行处理。',storage:row.shelfLifeDays===null?'置于通风干燥处，避免长期受潮与挤压。':`保存上限${row.shelfLifeDays}天，核对制成日期并注意受潮征兆。`})),...bones.recipes.map(row=>({id:row.id,process:row.processFacts}))];
const candidate=assembleW3(world,bones,lore);

test('W3首批工序原料价格和质量守恒，所有配方都有教师或书本来源',()=>{
  for(const recipe of bones.recipes){
    assert.ok(recipe.teachers.length || bones.items.some(row=>row.book?.teaches.includes(recipe.id)));
    const product=bones.items.find(row=>row.id===recipe.output.item);
    const cost=recipe.materials.reduce((sum,row)=>sum+world.items.find(x=>x.id===row.item).basePrice*row.amount,0);
    assert.ok(product.basePrice>=cost,recipe.id);
    const mass=recipe.materials.filter(row=>!['item_charcoal','item_wood_shavings'].includes(row.item)).reduce((sum,row)=>sum+world.items.find(x=>x.id===row.item).weight*row.amount,0);
    const outputMass=product.weight+(recipe.byproducts??[]).reduce((sum,row)=>sum+world.items.find(x=>x.id===row.item).weight*row.amount,0);
    assert.ok(mass>=outputMass,recipe.id);
  }
});

test('L1拒绝数字保存期矛盾、额外骨架字段、规则泄漏；短文字只告警',()=>{
  const entry=bones.items[0],good={id:entry.id,description:'用燕麦制成的薄片，烘干后可以泡汤。',inspection:'检查霉点。',storage:`保存上限${entry.shelfLifeDays}天。`},block={names:[],realPeople:[]};
  const check=validateW3Draft(good,entry,block);assert.deepEqual(check.errors,[]);assert.ok(check.warnings.length);
  assert.ok(validateW3Draft({...good,storage:'保存上限99天。'},entry,block).errors.length);
  assert.ok(validateW3Draft({...good,basePrice:0},entry,block).errors.length);
  assert.ok(validateW3Draft({...good,description:'主持人不要让玩家制造。'},entry,block).errors.length);
  assert.ok(validateW3Draft({...good,description:'由npc_hw_yanzhe售卖。'},entry,block).errors.some(x=>x.includes('内部实体编号')));
  assert.ok(validateW3Draft({...good,description:'重量8公斤。'},entry,block).errors.length);
  assert.ok(validateW3Draft({...good,description:'重量8斤。'},entry,block).errors.length);
  assert.deepEqual(validateW3Draft({...good,description:'重量'+entry.weight*2+'斤。'},entry,block).errors,[]);
});

test('L1核对中文时辰、息和材料单位，不能把一份两公斤铁料写成一公斤',()=>{
  assert.equal(chineseNumber('一百三十'),130);assert.equal(chineseNumber('零点二'),.2);assert.equal(chineseNumber('半'),.5);
  const food={id:'item_unit_sample',name:'单位测试样品',weight:.15,basePrice:1,shelfLifeDays:1};
  const prose={id:food.id,description:'整份重零点一五千克。',inspection:'查看当前外观。',storage:'1天内使用。'};
  assert.deepEqual(validateW3Draft(prose,food,{names:[],realPeople:[]}).errors,[]);
  assert.ok(validateW3Draft({...prose,description:'整份重零点一六千克。'},food,{names:[],realPeople:[]}).errors.length);
  const entry=bones.recipes.find(row=>row.id==='recipe_w3_fire_poker'),context=w3Context(world,bones,entry),block={names:[],realPeople:[]};
  const check=process=>validateW3Draft({id:entry.id,process},entry,block,context).errors;
  assert.ok(check('取一公斤铁坯入炉，全程80分钟。').some(row=>row.includes('重量')));
  assert.ok(check('取两公斤铁坯入炉，全程八十息。').some(row=>row.includes('耗时')));
  assert.ok(check('取两公斤铁坯入炉，全程一个时辰。').some(row=>row.includes('耗时')));
  assert.deepEqual(check('取两公斤铁坯入炉，全程八十分钟。'),[]);
  assert.deepEqual(check('取两公斤铁坯入炉，加热约20分钟，锻打30分钟，余时冷却；全程八十分钟。'),[]);
});

test('world_upgrade引入W3目录且既有财物保留，升级后新工序可制造署名单件',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'w3-upgrade-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  // Remove only this wave from the fixture world so the test remains a genuine
  // addition after the source catalogue itself has been published.
  const oldWorld=structuredClone(world),ids=new Set([...bones.items,...bones.recipes].map(row=>row.id));
  oldWorld.items=oldWorld.items.filter(row=>!ids.has(row.id));oldWorld.recipes=oldWorld.recipes.filter(row=>!ids.has(row.id));
  for(const npc of oldWorld.npcs)for(const id of ids)delete npc.inventory?.[id];
  const registry=new WorldRegistry(path.join(root,'worlds')),store=new CampaignStorage(path.join(root,'saves'),{reducer:archivedReducer(registry)});
  const oldEngine=new WorldEngine(oldWorld),document=oldEngine.initialFromLegacy(seed,'w3-fixture');
  document.worldHash=await registry.put(oldWorld);document.state.player.coins=333;
  document.state.location='bld_hw_mill';document.state.skills.skill_life_6_core={proficiency:250,daily:{},breakthroughs:[]};
  document.state.recipes??={};document.state.recipes.recipe_w3_wood_spoon={learned: true};
  for(const [item,quantity]of [['item_wood',2],['item_whittling_knife',1]]){const definition=oldEngine.byId.get(item);document.state.inventory[item]={quantity,quality:definition.quality,durability:definition.durability,weight:definition.weight};}
  await store.create({id:'old',worldVersion:oldWorld.version,document});
  const next=structuredClone(candidate);next.version='w3-fixture-next';next.rules.version=next.version;
  const nextHash=await registry.put(next);await store.transact('old',{id:'w3-update',input:{type:'world_upgrade',worldHash:nextHash,eventId:'w3-update'}},store.reducer);
  const after=(await store.read('old')).document;assert.deepEqual(after.state.player,document.state.player);assert.deepEqual(after.state.inventory,document.state.inventory);
  const engine=await registry.get(after.worldHash);assert.equal(engine.byId.get('item_wood_spoon').name,'偏柄木匙');
  let result;
  for(let index=0;index<100;index++){const tryResult=await engine.reduce(after,{tool:'world_craft',args:{recipe:'recipe_w3_wood_spoon'},eventId:`w3-craft-${index}`});if(tryResult.result.success){result=tryResult;break;}}
  assert.ok(result);const made=applyPatches(after,result.patches);
  assert.equal(made.state.inventory.item_wood.quantity,1);assert.equal(result.result.produced.find(row=>row.item==='item_wood_spoon').amount,1);
  assert.equal(made.state.crafted[result.result.receipt].maker,'player');assert.equal(result.result.spent.feePaid,2);
});
