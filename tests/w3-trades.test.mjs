import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import os from'node:os';
import path from'node:path';
import{CampaignStorage}from'../server-plugin/storage.mjs';
import{WorldRegistry}from'../server-plugin/world-registry.mjs';
import{archivedReducer}from'../server-plugin/archived-reducer.mjs';
import{loadWorld}from'../tools/load-world.mjs';
import{economyW3Trades}from'../world/design/economy-w3-trades.mjs';
import{assembleTradesCandidate}from'../tools/w3-trades.mjs';
import{WorldEngine}from'../server-plugin/engine.mjs';
import{applyPatches}from'../server-plugin/storage.mjs';
import{validateWorld}from'../tools/validate-world.mjs';
const world=await loadWorld(),bones=economyW3Trades(world);
const lore=[...bones.items.map(row=>({id:row.id,description:row.use,inspection:'检查可见磨损与裂口，记录不能确认之处。',storage:row.shelfLifeDays===null?'干燥放置并避开磕碰，实际破损另行检查。':`保存上限${row.shelfLifeDays}天。`})),...bones.recipes.map(row=>({id:row.id,process:row.processFacts}))];

test('下一批手工骨架没有悬空原料工具，成品价格与重量受投入约束，每项都有来源',()=>{
 const ids=new Map([...world.items,...bones.items].map(row=>[row.id,row]));
 assert.equal(new Set(bones.items.map(row=>row.id)).size,bones.items.length);
 for(const item of bones.items){if(item.acquisition.recipe)assert.ok(bones.recipes.some(row=>row.id===item.acquisition.recipe));else assert.ok(bones.supply.some(plan=>plan.npc===item.acquisition.seller&&plan.stock[item.id]>0));}
 for(const row of bones.recipes){assert.ok(row.tools.every(id=>ids.has(id)));assert.ok(row.materials.every(x=>ids.has(x.item)));
  const cost=row.materials.reduce((sum,x)=>sum+ids.get(x.item).basePrice*x.amount,0);assert.ok(ids.get(row.output.item).basePrice*row.output.quantity>=cost,row.id);
  const mass=row.materials.filter(x=>!['item_charcoal','item_wood_shavings'].includes(x.item)).reduce((sum,x)=>sum+ids.get(x.item).weight*x.amount,0);assert.ok(mass>=ids.get(row.output.item).weight*row.output.quantity,row.id);
  assert.ok(bones.items.some(item=>item.book?.teaches.includes(row.id)),row.id);
 }
 const candidate=assembleTradesCandidate(world,bones,lore);assert.equal(validateWorld(candidate,{stage:'engine'}).ok,true);
 const before=structuredClone(candidate);before.npcs.find(row=>row.id==='npc_hw_duanyan').inventory.item_mining_pick=0;
 assert.deepEqual(assembleTradesCandidate(before,bones,lore),before,'重建不得补回已耗尽的库存');
});

test('候选矿镐从段岩真实有限库存购买，双方铜币与镐数量守恒且售罄拒绝',async()=>{
 const candidate=assembleTradesCandidate(world,bones,lore),engine=new WorldEngine(candidate),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
 let c=engine.initialFromLegacy(seed,'w3-trades-pick');c.state.location='bld_hw_forge';
 const initialPlayer=c.state.player.coins,initialNpc=c.state.npcs.npc_hw_duanyan.coins;
 const buy=async eventId=>{const step=await engine.reduce(c,{tool:'world_trade',args:{seller:'段岩',item:'普通矿镐',quantity:1},eventId});c=applyPatches(c,step.patches);return step.result;};
 await buy('pick-one');assert.equal(c.state.inventory.item_mining_pick.quantity,1);assert.equal(c.state.npcs.npc_hw_duanyan.inventory.item_mining_pick.quantity,1);
 await buy('pick-two');assert.equal(c.state.inventory.item_mining_pick.quantity,2);assert.equal(c.state.npcs.npc_hw_duanyan.inventory.item_mining_pick,undefined);
 assert.equal(c.state.player.coins,initialPlayer-56);assert.equal(c.state.npcs.npc_hw_duanyan.coins,initialNpc+56);
 const before=structuredClone(c);await assert.rejects(buy('pick-three'),/库存不足/);assert.deepEqual(c,before);
});


test('候选 world_upgrade 保留已交易库存和人物变化，新的书及配方目录可检索',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'w3-trades-upgrade-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const registry=new WorldRegistry(path.join(root,'worlds')),store=new CampaignStorage(path.join(root,'saves'),{reducer:archivedReducer(registry)});
 const oldEngine=new WorldEngine(world),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),document=oldEngine.initialFromLegacy(seed,'w3-trades-upgrade');
 document.worldHash=await registry.put(world);document.state.player.coins=319;
 document.state.npcs.npc_hw_duanyan.coins=731;document.state.npcs.npc_hw_duanyan.trust=19;
 delete document.state.npcs.npc_hw_duanyan.inventory.item_iron;
 const before=structuredClone(document.state),next=assembleTradesCandidate(world,bones,lore);next.version='w3-trades-candidate';next.rules.version=next.version;
 await store.create({id:'old',worldVersion:world.version,document});const nextHash=await registry.put(next);
 await store.transact('old',{id:'update',input:{type:'world_upgrade',worldHash:nextHash,eventId:'update'}},store.reducer);
 const after=(await store.read('old')).document,engine=await registry.get(after.worldHash);
 assert.deepEqual(after.state.player,before.player);assert.deepEqual(after.state.inventory,before.inventory);assert.deepEqual(after.state.npcs.npc_hw_duanyan,before.npcs.npc_hw_duanyan);
 for(const[id,npc]of Object.entries(before.npcs)){const {inventory,...fields}=npc;const {inventory:updatedInventory,...updatedFields}=after.state.npcs[id];assert.deepEqual(updatedFields,fields);for(const[item,stock]of Object.entries(inventory))assert.deepEqual(updatedInventory[item],stock);}
 assert.equal(engine.byId.get('item_mining_pick').name,'普通矿镐');assert.ok(engine.byId.get('item_book_trades_iron').book.teaches.includes('recipe_w3b_drawer_pull'));
 const inventoryConflict=after.state.records.world_update_update.conflicts.find(row=>row.path.join('.')==='state.npcs.npc_hw_duanyan.inventory');
 assert.ok(inventoryConflict,'既有库存不被新开局供货计划覆盖，必须记录冲突');
 assert.equal(inventoryConflict.proposed.item_mining_pick,2);assert.equal(after.state.npcs.npc_hw_duanyan.inventory.item_mining_pick,undefined);
});
