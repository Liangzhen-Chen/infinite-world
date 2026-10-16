import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {CampaignStorage} from '../server-plugin/storage.mjs';
import {WorldRegistry} from '../server-plugin/world-registry.mjs';
import {archivedReducer} from '../server-plugin/archived-reducer.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {economyW3Journey} from '../world/design/economy-w3-journey.mjs';
import {assembleTradesCandidate} from '../tools/w3-trades.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
// T159榆根里、裂炉营的库存与资源引用本批物品；回到本批之前的旧版须一并移出这批聚居地。
import {withoutMonsterSociety2} from '../tools/publish-monster-society-2.mjs';
import {withoutT142} from '../tools/t142-merge.mjs';
import {siteItemReferences} from '../server-plugin/sites.mjs';
const world=await loadWorld(),bones=economyW3Journey(world),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const lore=[...bones.items.map(x=>({id:x.id,description:x.use,inspection:'检查可见损伤，不能确认的部位交由熟悉该器物者另检。',storage:x.shelfLifeDays===null?'干燥放置并避开重压，取用前检查接缝和受潮痕。':`保存上限${x.shelfLifeDays}天，按制作日核查。`})),...bones.recipes.map(x=>({id:x.id,process:x.processFacts}))];
// T142九省纲要的远方文化、势力和人物以魔物社会人物为见证，是更晚的一批，一并投影掉。
const oldWorld=withoutMonsterSociety2(withoutT142(world)),waveIds=new Set([...bones.items,...bones.recipes].map(x=>x.id));
delete oldWorld.rules.tribalAwakening;// U11族群觉醒动态（挂靠魔物社会议事势力与各村人物）晚于本批，历史世界不含。
oldWorld.items=oldWorld.items.filter(x=>!waveIds.has(x.id));oldWorld.recipes=oldWorld.recipes.filter(x=>!waveIds.has(x.id));for(const npc of oldWorld.npcs)for(const id of Object.keys(npc.inventory??{}))if(waveIds.has(id))delete npc.inventory[id];
const candidate=assembleTradesCandidate(oldWorld,bones,lore),engine=new WorldEngine(candidate);
const setup=()=>engine.initialFromLegacy(seed,'w3-journey');
const give=(c,id,quantity=1)=>{const item=engine.byId.get(id);c.state.inventory[id]={quantity,quality:item.quality,durability:item.durability,weight:item.weight};};

test('末批182物品85配方引用完整且产物质量价格受投入约束，每项有有限来源',()=>{
 assert.equal(bones.items.length,182);assert.equal(bones.recipes.length,85);assert.equal(validateWorld(candidate,{stage:'engine'}).ok,true);
 const ids=new Map(candidate.items.map(x=>[x.id,x]));
 for(const item of bones.items){assert.ok(!oldWorld.items.some(x=>x.id===item.id));if(item.acquisition.recipe)assert.ok(bones.recipes.some(r=>r.id===item.acquisition.recipe));else assert.ok(bones.supply.some(p=>p.npc===item.acquisition.seller&&p.stock[item.id]>0));}
 for(const r of bones.recipes){assert.ok(r.tools.every(id=>ids.has(id)));assert.ok(bones.items.some(i=>i.book?.teaches.includes(r.id)));assert.ok(candidate.locations.some(l=>l.workstations?.some(s=>s.kind===r.workstation)));
  const cost=r.materials.reduce((n,m)=>n+ids.get(m.item).basePrice*m.amount,0),mass=r.materials.filter(m=>!['item_charcoal','item_wood_shavings'].includes(m.item)).reduce((n,m)=>n+ids.get(m.item).weight*m.amount,0),product=ids.get(r.output.item);assert.ok(product.basePrice>=cost,r.id);assert.ok(product.weight<=mass+.0001,r.id);
 }
});

test('银品质工具20级门槛真实执行，指定工种加3而其他技能不受益',async()=>{
 const c=setup();give(c,'item_drawknife');c.state.player.level=19;c.state.skills.skill_life_6_core={proficiency:600,daily:{},breakthroughs:[]};
 const args={attribute:'敏捷',skill:'skill_life_6_core',tools:['item_drawknife'],difficulty:15},before=structuredClone(c);
 await assert.rejects(engine.reduce(c,{tool:'world_check',args,eventId:'underlevel'}),/等级不足/);assert.deepEqual(c,before);
 c.state.player.level=20;const right=await engine.reduce(c,{tool:'world_check',args,eventId:'wood-check'});assert.equal(right.result.toolBonus,3);
 c.state.skills.skill_life_3_core={proficiency:600,daily:{},breakthroughs:[]};const wrong=await engine.reduce(c,{tool:'world_check',args:{...args,skill:'skill_life_3_core'},eventId:'kitchen-check'});assert.equal(wrong.result.toolBonus,0);
});

test('高阶钢凿配方缺磨石不扣料，制造成功后消耗规定投入并磨损工具',async()=>{
 const c=setup(),r=bones.recipes.find(x=>x.id==='recipe_w3c_broad_steel_chisel');c.state.location='bld_hw_forge';c.state.player.level=40;c.state.player.coins=1000;c.state.skills[r.skill]={proficiency:1200,daily:{},breakthroughs:[]};c.state.professions.life.push(engine.byId.get(r.skill).profession);c.state.recipes??={};c.state.recipes[r.id]={learned:true};
 for(const m of r.materials)give(c,m.item,m.amount);for(const id of r.tools)give(c,id);delete c.state.inventory.item_honing_stone;
 const before=structuredClone(c);await assert.rejects(engine.reduce(c,{tool:'world_craft',args:{recipe:r.id},eventId:'missing-stone'}),/工具/);assert.deepEqual(c,before);give(c,'item_honing_stone');
 let result;for(let n=0;n<100;n++){const out=await engine.reduce(c,{tool:'world_craft',args:{recipe:r.id},eventId:`chisel-${n}`});if(out.result.success){result=out;break;}}
 assert.ok(result);const after=applyPatches(c,result.patches);assert.equal(result.result.produced[0].item,'item_broad_steel_chisel');assert.equal(result.result.produced[0].amount,1);for(const m of r.materials)assert.equal(after.state.inventory[m.item],undefined);
 assert.equal(after.state.inventory.item_honing_stone.durability,c.state.inventory.item_honing_stone.durability-2);assert.equal(after.state.player.coins,c.state.player.coins-4);assert.equal(after.state.minute,c.state.minute+300);
});

test('白金刺剑低于40级不能交锋，高阶器械不附未实现参数',async()=>{
 const c=setup();c.state.location='bld_hw_qingdeng';c.state.player.level=39;give(c,'item_estoc');const before=structuredClone(c);
 await assert.rejects(engine.reduce(c,{tool:'world_combat',args:{target:'npc_hw_hezhou',weapon:'item_estoc'},eventId:'low-estoc'}),/需要40级/);assert.deepEqual(c,before);
 for(const item of bones.items.filter(x=>x.combat))assert.ok(Object.keys(item.combat).every(k=>['attack','defense','hit'].includes(k)));
});


test('world_upgrade引入末批装备和配方且保留已变化的钱物关系',async t=>{
 const root=await fs.mkdtemp(path.join(tmpRoot(),'w3-journey-upgrade-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 // T113/T114/W5 遗迹据点晚于本批且引用本批物品：与 w2-s* 剥离器同口径，旧版保留据点仍引用的物品（siteItemReferences）。
 const siteKept=siteItemReferences(oldWorld.locations),upgradeOld=structuredClone(oldWorld);upgradeOld.items.push(...world.items.filter(x=>siteKept.has(x.id)&&!upgradeOld.items.some(y=>y.id===x.id)));
 const registry=new WorldRegistry(path.join(root,'worlds')),store=new CampaignStorage(path.join(root,'saves'),{reducer:archivedReducer(registry)}),oldEngine=new WorldEngine(upgradeOld),doc=oldEngine.initialFromLegacy(seed,'journey-upgrade');
 doc.worldHash=await registry.put(upgradeOld);doc.state.player.coins=321;doc.state.npcs.npc_hw_yanzhe.coins=799;doc.state.npcs.npc_hw_yanzhe.trust=17;delete doc.state.npcs.npc_hw_yanzhe.inventory.item_clay;doc.state.npcs.npc_hw_yanzhe.inventory.item_alum_grain=0;
 const before=structuredClone(doc.state),next=structuredClone(candidate);next.version='journey-check';next.rules.version=next.version;const hash=await registry.put(next);
 await store.create({id:'old',worldVersion:upgradeOld.version,document:doc});await store.transact('old',{id:'upgrade',input:{type:'world_upgrade',worldHash:hash,eventId:'upgrade'}},store.reducer);
 const after=(await store.read('old')).document,e=await registry.get(after.worldHash);assert.deepEqual(after.state.player,before.player);assert.deepEqual(after.state.inventory,before.inventory);
 // Stock update v1 preserves spent supplies and adds this batch's absent IDs once.
 const expectedStock=[];
 for(const[id,npc]of Object.entries(before.npcs)){const inventory=structuredClone(npc.inventory),oldNpc=upgradeOld.npcs.find(row=>row.id===id),newNpc=next.npcs.find(row=>row.id===id);for(const[item,quantity]of Object.entries(newNpc.inventory)){if(Object.hasOwn(oldNpc.inventory,item)||Object.hasOwn(inventory,item))continue;inventory[item]=quantity;expectedStock.push({npc:id,item,quantity});}assert.deepEqual(after.state.npcs[id],{...npc,inventory});}
 assert.ok(expectedStock.length>0);assert.deepEqual(after.state.records.world_update_upgrade.stockAdded,expectedStock);
 assert.equal(after.state.npcs.npc_hw_yanzhe.inventory.item_clay,undefined);assert.equal(after.state.npcs.npc_hw_yanzhe.inventory.item_alum_grain,0);
 assert.equal(e.byId.get('item_estoc').quality,'白金');assert.equal(e.byId.get('recipe_w3c_broad_steel_chisel').minutes,300);assert.equal(e.byId.get('item_book_journey_metal').book.teaches.length,12);
 assert.ok(after.state.records.world_update_upgrade.conflicts.some(x=>x.path.join('.')==='state.npcs.npc_hw_yanzhe.inventory'));
 await store.transact('old',{id:'repeat',input:{type:'world_upgrade',worldHash:hash,eventId:'repeat'}},store.reducer);
 const repeat=(await store.read('old')).document;assert.deepEqual(repeat.state.npcs,after.state.npcs);assert.deepEqual(repeat.state.records.world_update_repeat.stockAdded,[]);
});
