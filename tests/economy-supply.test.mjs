import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {economyFoundation}from'../world/design/economy-foundation.mjs';
import {assembleEconomy}from'../tools/economy-content.mjs';
import {applyEconomySupply,economySupplyPlan}from'../world/design/economy-supply.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function suppliedWorld(){
 const world=await loadWorld(),bones=economyFoundation(world),lore=bones.items.map(row=>({id:row.id,
   description:(row.book?'阅读本册需识字100，核对已有工序。':'')+'工坊按来料和订单备货，收货时先核对实际材质、大小与数量。把器物放稳，观察边缘有无磨损与裂口，再按对应的用途操作。搬动时避开锐边和受潮的外层，发现松动要先找出位置；仅凭外观难以确定内里情况，需要试用时另取少量来料。',
   inspection:'沿边缘查看破损与受潮征兆，手摸可见的接缝与表面，记录不能确认的情况，再决定是否继续使用。无法只凭表面保证所有内部情况。',
   storage:`放在干燥或冷凉处，避免压坏与受潮，${row.shelfLifeDays===null?'查看实际破损情况':`保存上限${row.shelfLifeDays}天，按批次日期核对`}，取用后重新收好，受损时另行处理。`}));
 return applyEconomySupply(assembleEconomy(world,bones,lore));
}
test('初始供货有限、引用完整，已有数量和制作者记录不覆盖，重建不补回零库存',async()=>{
 const world=await suppliedWorld(),before=structuredClone(world);
 assert.equal(validateWorld(world,{stage:'engine'}).ok,true);
 const sold=world.npcs.find(row=>row.id==='npc_hw_luqing');sold.inventory.item_book_forge_nails={quantity:0,instances:[],source:'已售罄'};
 const old=world.npcs.find(row=>row.id==='npc_hw_ayan');assert.equal(old.inventory.item_wood,20);
 const candidate=applyEconomySupply(world);assert.deepEqual(candidate,world);assert.equal(before.npcs.find(row=>row.id===sold.id).inventory.item_book_forge_nails,1);
 assert.ok(economySupplyPlan.every(row=>Object.values(row.stock).every(n=>Number.isSafeInteger(n)&&n>0)));
});
test('从真实初始NPC库存买书、买料与工具后学习制造，扣钱和供货者货物，不凭空给物',async()=>{
 const world=await suppliedWorld(),engine=new WorldEngine(world);
 let c=engine.initialFromLegacy(seed,'economy-supply');c.state.player.coins=400;
 c.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};
 const act=async(tool,args,eventId)=>{const step=await engine.reduce(c,{tool,args,eventId});c=applyPatches(c,step.patches);return step.result;};
 c.state.location='bld_hw_school';
 await act('world_trade',{seller:'npc_hw_luqing',item:'item_book_forge_nails',quantity:1},'buy-book');
 assert.equal(c.state.npcs.npc_hw_luqing.inventory.item_book_forge_nails,undefined);
 await assert.rejects(act('world_trade',{seller:'npc_hw_luqing',item:'item_book_forge_nails',quantity:1},'book-sold-out'),/库存不足/);
 const lessonStart=structuredClone(c);let learned;
 for(let n=0;n<100;n++){
   const step=await engine.reduce(lessonStart,{tool:'world_learn',args:{entity:'recipe_forge_nails',source:'item_book_forge_nails'},eventId:`read-${n}`});
   if(step.result.success){learned=applyPatches(lessonStart,step.patches);break;}
 }
 assert.ok(learned);c=learned;c.state.location='bld_hw_forge';
 for(const[item,quantity]of[['item_iron',1],['item_charcoal',2],['item_smith_hammer',1],['item_smith_tongs',1]])await act('world_trade',{seller:'npc_hw_duanyan',item,quantity},`buy-${item}`);
 assert.equal(c.state.npcs.npc_hw_duanyan.inventory.item_iron.quantity,7);
 const before=structuredClone(c);let crafted;
 for(let n=0;n<100;n++){
   const step=await engine.reduce(before,{tool:'world_craft',args:{recipe:'recipe_forge_nails'},eventId:`forge-${n}`});
   if(step.result.success){crafted={document:applyPatches(before,step.patches),result:step.result};break;}
 }
 assert.ok(crafted);assert.equal(crafted.document.state.inventory.item_iron_nail.quantity,40);
 assert.equal(crafted.document.state.player.coins,before.state.player.coins-4);
 assert.equal(crafted.document.state.inventory.item_iron,undefined);assert.equal(crafted.document.state.inventory.item_charcoal,undefined);
 assert.equal(crafted.result.instances.length,40);assert.equal(crafted.document.state.minute,before.state.minute+80);
});
