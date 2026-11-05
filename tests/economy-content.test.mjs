import test from'node:test';
import assert from'node:assert/strict';
import {loadWorld}from'../tools/load-world.mjs';
import {economyFoundation}from'../world/design/economy-foundation.mjs';
import {assembleEconomy,auditEconomyLore,sampleRows,loreIssues,contentHash,checkEconomyPublication,verifyEconomyReviews,economyItemRequest}from'../tools/economy-content.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import fs from'node:fs/promises';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const fixtureLore=bone=>({id:bone.id,description:(bone.book?'阅读本册需识字100，按实际步骤核对工序。':'')+'当地工坊依来料制作与备货，收货时核对实际材质和数量，使用前查看边缘破损与受潮痕迹。工具按自身用途操作，食物按对应步骤准备。缺口或霉迹需要先辨别，不能只凭外观断定内部情况，无法确认时另行询问供货者。',inspection:'沿物品可见边缘检查破损和受潮痕迹，无法从表面保证所有内部情况，记录不能确认的部分后再决定是否使用。',storage:`放置在与用途相符的干燥或冷凉地方，避免受潮与重压，${bone.shelfLifeDays===null?'按批次来源检查受损征兆':`保存上限${bone.shelfLifeDays}天，按批次日期核对`}，受损时另行处理。`});
test('经济骨架的配方有真实工具、材料价格和学习来源；成品不低于材料，缝袋不从纤维凭空织布',async()=>{
 const world=await loadWorld(),bones=economyFoundation(world),items=new Map(bones.items.map(row=>[row.id,row]));
 for(const recipe of bones.recipes){assert.ok(items.has(recipe.output.item));for(const item of recipe.tools)assert.ok(items.has(item));
    const cost=recipe.materials.reduce((sum,row)=>sum+items.get(row.item).basePrice*row.amount,0);assert.ok(items.get(recipe.output.item).basePrice*recipe.output.quantity>=cost);
 }
 const sack=bones.recipes.find(row=>row.id==='recipe_sew_sack');assert.ok(sack.materials.some(row=>row.item==='item_linen_cloth'));assert.ok(!sack.materials.some(row=>row.item==='item_flax'));
 assert.ok(sack.tools.includes('item_sewing_needle'));assert.ok(bones.items.some(row=>row.book?.teaches.includes(sack.id)));
});
test('实际提交schema绑定单件编号与保存字段，模型另造时限或改编号不能提交',async()=>{
 const bones=economyFoundation(await loadWorld()),staff=bones.items.find(row=>row.id==='item_staff'),herb=bones.items.find(row=>row.id==='item_herb');
 const request=economyItemRequest(staff);assert.equal(request.validate({items:[fixtureLore(staff)]}),true);
 for(const storage of['收在阴凉干燥处，最多存180天，避免重压受潮，取用后再收好。','收在阴凉干燥处，最多存三十天，避免重压受潮，取用后再收好。'])assert.equal(request.validate({items:[{...fixtureLore(staff),storage}]}),false);
 assert.equal(request.validate({items:[fixtureLore(staff),fixtureLore(staff)]}),false);
 assert.equal(request.validate({items:[{...fixtureLore(staff),id:'item_wrong'}]}),false);
 const short=economyItemRequest(herb);assert.equal(short.validate({items:[fixtureLore(herb)]}),true);
 assert.equal(short.validate({items:[{...fixtureLore(herb),storage:fixtureLore(herb).storage.replace('7天','17天')}]}),false);
});
test('草稿不能覆盖价格重量或增加字段；未知现代材料拒绝，原世界对象不变',async()=>{
 const world=await loadWorld(),before=structuredClone(world),bones=economyFoundation(world),lore=bones.items.map(fixtureLore);
 const candidate=assembleEconomy(world,bones,lore);assert.deepEqual(world,before);assert.equal(candidate.items.find(row=>row.id==='item_staff').basePrice,4);
 for(const patch of[{basePrice:0},{weight:0},{id:'item_missing'}]){const bad=structuredClone(lore);Object.assign(bad[0],patch);assert.throws(()=>assembleEconomy(world,bones,bad));}
 assert.ok(loreIssues({...lore[0],description:'石蜡是本目录中的基础燃料。'},bones.items[0]).length);
 assert.deepEqual(loreIssues({...lore[0],description:'它不是无限通用施法媒介，也不能保证治愈任何疾病。'},bones.items[0]),[]);
 assert.ok(loreIssues({...lore[0],description:'它拥有无限魔力，使用后保证治愈。'},bones.items[0]).length);
});
test('近乎相同的说明阻止自动质量通过；抽样固定且不依赖文本评分',async()=>{
 const bones=economyFoundation(await loadWorld()),rows=bones.items.slice(0,2).map(row=>({...fixtureLore(row),description:'这件物品供当地工坊日常使用，保存与检查遵循当前批次来源记录。'.repeat(4)}));
 assert.ok(auditEconomyLore(rows,bones).errors.some(row=>row.type==='similarity'));
 assert.deepEqual(sampleRows(bones.items,20261210),sampleRows(bones.items,20261210));assert.equal(new Set(sampleRows(bones.items,20261210).map(row=>row.id)).size,10);
});
test('候选目录的书本学习和铁件制造确实执行，缺锤不扣料，成功只生成规定数量并收工坊费',async()=>{
 const world=await loadWorld(),bones=economyFoundation(world),candidate=assembleEconomy(world,bones,bones.items.map(fixtureLore)),engine=new WorldEngine(candidate);
 let c=engine.initialFromLegacy(seed,'economy-candidate');c.state.location='bld_hw_forge';
 const give=(id,quantity)=>{const item=engine.byId.get(id);c.state.inventory[id]={quantity,quality:item.quality,durability:item.durability,weight:item.weight};};
 c.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};give('item_book_forge_nails',1);give('item_iron',1);give('item_charcoal',2);give('item_smith_tongs',1);
 let learned;for(let n=0;n<100;n++){const result=await engine.reduce(c,{tool:'world_learn',args:{entity:'recipe_forge_nails',source:'item_book_forge_nails'},eventId:`lesson_${n}`});if(result.result.success){learned=applyPatches(c,result.patches);break;}}
 assert.ok(learned);c=learned;const before=structuredClone(c);
 await assert.rejects(engine.reduce(c,{tool:'world_craft',args:{recipe:'recipe_forge_nails'},eventId:'no-hammer'}),/工具/);assert.deepEqual(c,before);
 give('item_smith_hammer',1);let made;
 for(let n=0;n<100;n++){const result=await engine.reduce(c,{tool:'world_craft',args:{recipe:'recipe_forge_nails'},eventId:`nails_${n}`});if(result.result.success){made={document:applyPatches(c,result.patches),result:result.result};break;}}
 assert.ok(made);assert.equal(made.document.state.inventory.item_iron_nail.quantity,40);assert.equal(made.result.instances.length,40);assert.equal(made.result.spent.feePaid,4);
 assert.equal(made.document.state.player.coins,c.state.player.coins-4);assert.equal(made.document.state.inventory.item_iron,undefined);assert.equal(made.document.state.inventory.item_charcoal,undefined);
 assert.equal(made.document.state.minute,c.state.minute+80);assert.equal(made.document.state.npcs.npc_hw_duanyan.coins,c.state.npcs.npc_hw_duanyan.coins+4);
});
test('旧草稿的新事实校验会失败，人工评分不足或哈希改变也拒绝，不重写原输出',async()=>{
 const world=await loadWorld(),bones=economyFoundation(world);
 // Old text is kept as evidence; added checks must reject its actual defects.
 const lore=JSON.parse(await fs.readFile(new URL('./fixtures/content/rejected-economy-lore.json',import.meta.url),'utf8'));
 assert.equal(auditEconomyLore(lore,bones).ok,false);
 const source={runId:'fixture',sourceWorldHash:contentHash(world),boneHash:contentHash(bones),reviewSeeds:[20261210,20261211],bones};
 assert.throws(()=>checkEconomyPublication(world,source,lore,[]),/人工验收|自动审查/);
 const reviews=Array.from({length:Math.ceil(lore.length/50)},(_,batch)=>({batch,seed:source.reviewSeeds[batch],runId:'fixture',approved:true,boneHash:source.boneHash,loreHash:contentHash(lore),
    sample:sampleRows(lore.slice(batch*50,batch*50+50),20261210+batch).map(row=>({id:row.id,hash:contentHash(row),scores:[2,4,4,4,4,4],notes:'刻意不合格的测试评分，不能发布'}))}));
 assert.throws(()=>verifyEconomyReviews(source,lore,reviews),/人工样本不合格/);
 assert.throws(()=>verifyEconomyReviews({...source,reviewSeeds:[20261211,20261212]},lore,reviews),/随机样本版本/);
 assert.throws(()=>verifyEconomyReviews({...source,reviewSeeds:undefined},lore,reviews),/随机抽样种子/);
 assert.throws(()=>checkEconomyPublication(world,source,lore,reviews),/自动审查/);
 assert.throws(()=>checkEconomyPublication(world,{...source,sourceWorldHash:'different'},lore,reviews),/来源不符/);
});
test('重复编译经济目录稳定且不丢后续器物、配方或其他工作台',async()=>{
 const world=await loadWorld(),bones=economyFoundation(world),lore=bones.items.map(fixtureLore);
 const once=assembleEconomy(world,bones,lore),extended=structuredClone(once);
 extended.items.push({...extended.items.find(row=>row.id==='item_wood'),id:'item_future_wood',name:'测试后续木料',aliases:[]});
 extended.recipes.push({...extended.recipes[0],id:'recipe_future_pegs',name:'测试后续木楔',aliases:[]});
 // K5：工位来自设备；一处地点每类工位只有一件，后续另加的是另一类设备（原为同类第二张手写木工台）。
 extended.locations.find(row=>row.id==='bld_hw_mill').fixtures.push({fixture:'forge',id:'station_future_forge',fee:7});
 const rebuilt=economyFoundation(extended);assert.deepEqual(rebuilt,bones);
 const twice=assembleEconomy(extended,rebuilt,lore);
 assert.deepEqual(twice,extended);assert.equal(twice.items.length,world.items.length+1);assert.equal(twice.recipes.length,world.recipes.length+1);
 assert.equal(new Set(twice.items.map(row=>row.id)).size,twice.items.length);
 assert.equal(new Set(twice.recipes.map(row=>row.id)).size,twice.recipes.length);
 // Existing stations must receive the current hand-authored fee too.
 const bench=place=>place.locations.find(row=>row.id==='bld_hw_mill').fixtures.find(row=>row.id==='station_hw_mill_bench');
 bench(extended).fee=99;
 assert.equal(bench(assembleEconomy(extended,bones,lore)).fee,2);
});
test('保存上限逐项进入说明，null不凭空加期限，开发保证措辞拒绝',async()=>{
 const bones=economyFoundation(await loadWorld()),resin=bones.items.find(row=>row.id==='item_resin'),staff=bones.items.find(row=>row.id==='item_staff');
 assert.deepEqual(loreIssues(fixtureLore(resin),resin),[]);
 for(const storage of['未设固定保存天数，收在阴凉处，避免炉火与雨水。','保存上限18天，盖紧收好。','保存上限1180天，盖紧收好。','保存上限180天，但没有固定保存期限。'])assert.ok(loreIssues({...fixtureLore(resin),storage},resin).length);
 assert.deepEqual(loreIssues({...fixtureLore(staff),storage:'放在干燥架上，避免压弯与火烤，雨天检查杖头受潮与开裂。'},staff),[]);
 assert.deepEqual(loreIssues({...fixtureLore(resin),description:'对照书籍目录核对配方章节，先读作者写下的材料说明。'},resin),[],'书本真实目录不等于开发目录索引');
 for(const description of['不会直接赠送成品。','不会额外复制一份粮食。','不把目录里的技能编号当作等级。'])assert.ok(loreIssues({...fixtureLore(resin),description},resin).length);
 const candle=bones.items.find(row=>row.id==='item_wax_candle');
 assert.ok(loreIssues({...fixtureLore(candle),description:'蜡液倒入细模，放棉灯芯浇成小烛。'},candle).length);
 assert.deepEqual(loreIssues({...fixtureLore(candle),description:'麻芯反复浸挂蜡液，放凉后得到小烛。'},candle),[]);
 assert.deepEqual(loreIssues({...fixtureLore(candle),description:'采用麻芯反复浸挂蜡液，不用棉灯芯浇模。'},candle),[]);
 const herb=bones.items.find(row=>row.id==='item_herb');
 assert.ok(loreIssues({...fixtureLore(herb),description:'失水的药草仍可煮汤，可给烤肉提香。'},herb).length);
 assert.deepEqual(loreIssues({...fixtureLore(herb),description:'这些药草种类未辨明，不能煮汤或喂动物，先逐枝核对外观。'},herb),[]);
 for(const storage of['存放上限180天。','最多三十天，盖好收存。','最多存360天。'])assert.ok(loreIssues({...fixtureLore(staff),storage},staff).length);
 assert.deepEqual(loreIssues({...fixtureLore(staff),storage:'最长九十天需取出复查杆身，每30天擦拭一次。'},staff),[],'检查间隔不当成报废期限');
 const book=bones.items.find(row=>row.id==='item_book_spin_wool');
 assert.ok(loreIssues({...fixtureLore(book),description:'全册共一百二十页，阅读要120分钟。'},book).length);
 assert.ok(loreIssues({...fixtureLore(book),description:'识字者可以阅读本册，初读要120分钟。'},book).length);
});
