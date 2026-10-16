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
import{assembleTradesCandidate,tradesReviewRequest}from'../tools/w3-trades.mjs';
import{tradesPublicationFiles}from'../tools/w3-trades-publish.mjs';
import{w3Context}from'../tools/w3-content.mjs';
import{WorldEngine}from'../server-plugin/engine.mjs';
import{applyPatches}from'../server-plugin/storage.mjs';
import{validateWorld}from'../tools/validate-world.mjs';
// T159榆根里、裂炉营的库存与资源引用本批物品；回到本批之前的旧版须一并移出这批聚居地。
import {withoutMonsterSociety2} from '../tools/publish-monster-society-2.mjs';
import {withoutT142} from '../tools/t142-merge.mjs';
import {siteItemReferences} from '../server-plugin/sites.mjs';
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
    // Reconstruct the edition before this batch. Once published, loadWorld()
    // already contains these supplies and cannot stand in for an old edition.
    // T142九省纲要的远方文化与势力以本批之后的魔物社会人物为见证，是更晚的一批，一并投影掉。
    const old=withoutMonsterSociety2(withoutT142(world)),siteKept=siteItemReferences(world.locations),addedItems=new Set(bones.items.map(row=>row.id).filter(id=>!siteKept.has(id))),addedRecipes=new Set(bones.recipes.map(row=>row.id));
    delete old.festivals;// T108节日目录（材料引用本批物品）晚于本批。
    delete old.rules.tribalAwakening;// U11族群觉醒动态（挂靠魔物社会议事势力与各村人物）晚于本批，历史世界不含。
    old.items=old.items.filter(row=>!addedItems.has(row.id));old.recipes=old.recipes.filter(row=>!addedRecipes.has(row.id));
    for(const npc of old.npcs)for(const id of Object.keys(npc.inventory??{}))if(addedItems.has(id))delete npc.inventory[id];
    const oldEngine=new WorldEngine(old),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),document=oldEngine.initialFromLegacy(seed,'w3-trades-upgrade');
    document.worldHash=await registry.put(old);document.state.player.coins=319;
 document.state.npcs.npc_hw_duanyan.coins=731;document.state.npcs.npc_hw_duanyan.trust=19;
 delete document.state.npcs.npc_hw_duanyan.inventory.item_iron;
 document.state.npcs.npc_hw_duanyan.inventory.item_mining_pick=0;
    const before=structuredClone(document.state),next=assembleTradesCandidate(old,bones,lore);next.version='w3-trades-candidate';next.rules.version=next.version;
 await store.create({id:'old',worldVersion:world.version,document});const nextHash=await registry.put(next);
 await store.transact('old',{id:'update',input:{type:'world_upgrade',worldHash:nextHash,eventId:'update'}},store.reducer);
 const after=(await store.read('old')).document,engine=await registry.get(after.worldHash);
 assert.deepEqual(after.state.player,before.player);assert.deepEqual(after.state.inventory,before.inventory);
 // Stock update v1 adds only IDs absent from both the old edition and the save.
 const expectedStock=[];
 for(const[id,npc]of Object.entries(before.npcs)){const inventory=structuredClone(npc.inventory),oldNpc=old.npcs.find(row=>row.id===id),newNpc=next.npcs.find(row=>row.id===id);for(const[item,quantity]of Object.entries(newNpc.inventory)){if(Object.hasOwn(oldNpc.inventory,item)||Object.hasOwn(inventory,item))continue;inventory[item]=quantity;expectedStock.push({npc:id,item,quantity});}assert.deepEqual(after.state.npcs[id],{...npc,inventory});}
 assert.ok(expectedStock.length>0);assert.deepEqual(after.state.records.world_update_update.stockAdded,expectedStock);
 assert.equal(engine.byId.get('item_mining_pick').name,'普通矿镐');assert.ok(engine.byId.get('item_book_trades_iron').book.teaches.includes('recipe_w3b_drawer_pull'));
 const inventoryConflict=after.state.records.world_update_update.conflicts.find(row=>row.path.join('.')==='state.npcs.npc_hw_duanyan.inventory');
 assert.ok(inventoryConflict,'既有库存不被新开局供货计划覆盖，必须记录冲突');
 assert.equal(inventoryConflict.proposed.item_mining_pick,2);assert.equal(after.state.npcs.npc_hw_duanyan.inventory.item_mining_pick,0);assert.equal(after.state.npcs.npc_hw_duanyan.inventory.item_iron,undefined);
 await store.transact('old',{id:'repeat',input:{type:'world_upgrade',worldHash:nextHash,eventId:'repeat'}},store.reducer);
 const repeat=(await store.read('old')).document;assert.deepEqual(repeat.state.npcs,after.state.npcs);assert.deepEqual(repeat.state.records.world_update_repeat.stockAdded,[]);
});


test('发布计划只补本批缺失库存，不覆盖人物新增字段或已耗尽库存',()=>{
 const baseline=structuredClone(world.npcs);baseline[0].biography={futureField:'保留后续人物档'};
 baseline.find(row=>row.id==='npc_hw_duanyan').inventory.item_mining_pick=0;
 const before=structuredClone(baseline),candidate=assembleTradesCandidate(world,bones,lore),files=tradesPublicationFiles(candidate,bones,baseline);
 assert.deepEqual(baseline,before);assert.deepEqual(files.map(([file])=>file),['world/meta/items.json','world/meta/recipes.json','world/people/baseline.json']);
 const people=files[2][1];assert.equal(people.length,baseline.length);assert.deepEqual(people[0].biography,baseline[0].biography);
 assert.equal(people.find(row=>row.id==='npc_hw_duanyan').inventory.item_mining_pick,0);
 for(const old of before){const after=people.find(row=>row.id===old.id);for(const [key,value]of Object.entries(old))if(key!=='inventory')assert.deepEqual(after[key],value);for(const [item,quantity]of Object.entries(old.inventory))assert.deepEqual(after.inventory[item],quantity);}
});

test('L2 请求按目录份数明确克数换算，仍保留原文与矛盾报告要求',()=>{
 const entry=bones.recipes.find(row=>row.id==='recipe_w3b_honey_curd_spread'),draft={id:entry.id,process:'一份200克榛仁。'},context=w3Context(world,bones,entry);
 const request=tradesReviewRequest(entry,draft,context),payload=JSON.parse(request.messages[1].content);
 assert.deepEqual(payload.draft,draft);assert.deepEqual(payload.publishedFacts,JSON.parse(JSON.stringify(context)));
 assert.deepEqual(payload.materialUnits.find(row=>row.id==='item_hazelnut'),{id:'item_hazelnut',portions:1,gramsPerPortion:200,totalGrams:200});
 assert.match(request.messages[0].content,/须保留hard/);
});
