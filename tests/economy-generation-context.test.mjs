import test from'node:test';
import assert from'node:assert/strict';
import {loadWorld}from'../tools/load-world.mjs';
import {economyFoundation}from'../world/design/economy-foundation.mjs';
import {economyGenerationContext}from'../tools/economy-generation-context.mjs';
test('起草上下文按单件隔离，只有书籍具有阅读要求，工作台不变成必备织机',async()=>{
 const world=await loadWorld(),bones=economyFoundation(world),get=id=>economyGenerationContext(world,bones,bones.items.find(row=>row.id===id));
 const cloth=get('item_linen_cloth'),sack=get('item_book_sew_sack'),resin=get('item_resin'),herb=get('item_herb');
 assert.equal(cloth.readingRequirements,undefined);assert.equal(cloth.requiredCount,1);
 assert.equal(sack.readingRequirements.minimumLiteracy,100);assert.equal(sack.readingRequirements.minutes,120);
 assert.equal(sack.readingRequirements.location,null);assert.equal(sack.readingRequirements.pageCount,null);assert.equal(sack.readingRequirements.checkAttribute,'智力');
 assert.equal(sack.recipes[0].workplace,'织坊手工工作台');assert.ok(!sack.recipes[0].tools.some(row=>row.id==='item_loom'));
 assert.ok(!JSON.stringify(resin).includes('药草'));assert.ok(herb.notes.some(row=>row.includes('未辨明')));
 assert.equal(resin.storageFacts.limitDays,180);assert.equal(herb.storageFacts.limitDays,7);
 const candle=get('item_wax_candle');assert.ok(candle.recipes.some(row=>row.id==='recipe_dip_candles'));
 assert.ok(!candle.recipes[0].materials.some(row=>row.item==='item_charcoal'));
 assert.equal(candle.recipes[0].fuels.find(row=>row.item==='item_charcoal').role,'炉火燃料，只供燃烧');
 const hinge=get('item_iron_hinge');assert.equal(hinge.recipes[0].byproducts[0].name,'铁边料小块');assert.equal(hinge.recipes[0].byproducts[0].unitWeightKg,.2);
});
