import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches}from'../server-plugin/storage.mjs';
import {planRuleStateMigration}from'../server-plugin/rule-state-migration.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
import {magicIlluminates}from'../server-plugin/magic-status.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function setup(){
    const world=await loadWorld(),engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'manufacturing-test');
    document.state.location='bld_hw_mill';document.state.inventory.item_wood={quantity:6,quality:'木',durability:100,weight:1};
    document.state.inventory.item_whittling_knife={quantity:1,quality:'木',durability:80,weight:0.2};
    document.state.skills.skill_life_6_core={proficiency:120,daily:{},breakthroughs:[]};document.state.recipes.recipe_wooden_pegs={source:{type:'teacher',id:'npc_hw_ayan'}};
    const run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    return{world,engine,document,run};
}
async function degree(run,c,args,wanted){
    for(let i=0;i<200;i++){const id=`manufacture_${i}`,out=await run(c,'world_craft',args,id);if(out.result.degree===wanted)return{...out,id};}
    throw new Error(`未观察到${wanted}`);
}
test('制造先校验配方知识、技能、真实工具、工作台与许可，失败结构检查不花钱耗时',async()=>{
    const{world,document,run}=await setup();
    for(const alter of[
        c=>delete c.state.recipes.recipe_wooden_pegs,c=>delete c.state.skills.skill_life_6_core,
        c=>delete c.state.inventory.item_whittling_knife,c=>c.state.inventory.item_whittling_knife.durability=0,
        c=>c.state.location='bld_hw_qingdeng',c=>c.state.buildings.bld_hw_mill={condition:0},c=>c.state.player.coins=1,
    ]){const c=structuredClone(document);alter(c);const before=structuredClone(c);await assert.rejects(run(c,'world_craft',{recipe:'recipe_wooden_pegs'},'bad'));assert.deepEqual(c,before);}
    world.locations.find(row=>row.id==='bld_hw_mill').workstations[0].access='consent';
    const engine=new WorldEngine(world);await assert.rejects(engine.reduce(document,{tool:'world_craft',args:{recipe:'recipe_wooden_pegs'},eventId:'no-license'}),/使用许可/);
});
test('成功制造真实扣料、工坊费和工具耐久，副产品入库，每件有稳定编号及署名',async()=>{
    const{document,run}=await setup();const out=await degree(run,document,{recipe:'recipe_wooden_pegs'},'成功');
    const c=out.document;assert.equal(c.state.inventory.item_wood.quantity,5);assert.equal(c.state.player.coins,178);
    assert.equal(c.state.workshopFunds.station_hw_mill_bench,2);assert.equal(c.state.minute,560);assert.equal(c.state.inventory.item_whittling_knife.durability,79);
    assert.equal(c.state.inventory.item_wooden_peg.quantity,4);assert.equal(c.state.inventory.item_wood_shavings.quantity,1);
    assert.equal(out.result.instances.length,5);assert.equal(new Set(out.result.instances).size,5);assert.equal(out.result.workmanship,'普通');
    for(const id of out.result.instances){const unit=c.state.itemInstances[id];assert.equal(unit.maker,'player');assert.equal(unit.makerName,'旅人');assert.equal(unit.owner,'player');assert.equal(unit.source,out.id);}
    assert.equal(c.state.crafted[out.result.receipt].byproducts[0].item,'item_wood_shavings');assert.equal(out.result.experience,30);
    assert.ok(c.state.skills.skill_life_6_core.proficiency>120);
    assert.deepEqual((await run(document,'world_craft',{recipe:'recipe_wooden_pegs'},out.id)).result,out.result);
});
test('失败仍扣耗材、租费、时间与磨损，大失败有配方伤害，回收比例精确，无成品或经验',async()=>{
    const{world,document}=await setup();const recipe=world.recipes.find(row=>row.id==='recipe_wooden_pegs');recipe.materials=[{item:'item_wood',amount:4}];recipe.failure={recoverFraction:0.5,injury:2};
    const engine=new WorldEngine(world),run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    for(const wanted of['失败','大失败']){
        const out=await degree(run,document,{recipe:'recipe_wooden_pegs'},wanted),c=out.document;
        assert.equal(c.state.inventory.item_wood.quantity,4);assert.equal(c.state.player.coins,178);assert.equal(c.state.minute,560);
        assert.equal(c.state.inventory.item_whittling_knife.durability,79);assert.equal(c.state.inventory.item_wooden_peg,undefined);
        assert.equal(c.state.player.hp,wanted==='大失败'?10:12);assert.equal(c.state.player.xp,0);assert.deepEqual(c.state.itemInstances,{});
        assert.deepEqual(out.result.salvage,[{item:'item_wood',amount:2}]);assert.equal(c.state.crafted[out.result.receipt].quantity,0);
    }
});
test('做工由成功档与手艺计算，区别真实单件耐久上限，不由模型指定',async()=>{
    const{document,run}=await setup();
    const rough=await degree(run,document,{recipe:'recipe_wooden_pegs',workmanship:'杰作'},'勉强成功');
    const fine=await degree(run,document,{recipe:'recipe_wooden_pegs'},'大成功');
    const peg=out=>out.document.state.itemInstances[out.document.state.inventory.item_wooden_peg.instances[0]];
    assert.equal(rough.result.workmanship,'粗糙');assert.equal(peg(rough).maxDurability,48);
    assert.equal(fine.result.workmanship,'精良');assert.equal(peg(fine).maxDurability,69);
});
test('交易、任务交付及到期送货保留制作者与单件归属，不凭空产生新单件',async()=>{
    const{document,run}=await setup();let c=(await degree(run,document,{recipe:'recipe_wooden_pegs'},'成功')).document;
    const ids=[...c.state.inventory.item_wooden_peg.instances];
    const originalHeld=c.state.npcs.npc_hw_ayan.inventory.item_wooden_peg;
    const originalStock=typeof originalHeld==='number'?originalHeld:originalHeld?.quantity??0;
    c=(await run(c,'world_trade',{seller:'player',buyer:'阿砚',item:'榫用木楔',quantity:1,instances:[ids[2]]},'sell')).document;
    assert.equal(c.state.itemInstances[ids[2]].owner,'npc_hw_ayan');assert.equal(c.state.itemInstances[ids[2]].makerName,'旅人');
    c=(await run(c,'world_quest',{operation:'publish',publisher:'阿砚',personal:true,grade:'D',reward:20,content:'补充木楔',objective:{type:'deliver',item:'item_wooden_peg',quantity:1}},'post')).document;
    c=(await run(c,'world_quest',{operation:'accept',quest:'quest_post'},'take')).document;
    c=(await run(c,'world_quest',{operation:'complete',quest:'quest_post'},'handin')).document;
    c=(await run(c,'world_promise',{promisor:'player',promisee:'阿砚',type:'送货',content:'再交一块木楔',item:'item_wooden_peg',quantity:1,deadline:c.state.minute+1},'delivery')).document;
    c=(await run(c,'world_time',{minutes:1},'deadline')).document;
    assert.equal(c.state.inventory.item_wooden_peg.quantity,1);assert.equal(c.state.npcs.npc_hw_ayan.inventory.item_wooden_peg.quantity,originalStock+3);
    assert.equal(ids.filter(id=>c.state.itemInstances[id].owner==='npc_hw_ayan').length,3);assert.equal(Object.keys(c.state.itemInstances).length,5);
    const before=structuredClone(c);await assert.rejects(run(c,'world_trade',{seller:'player',buyer:'阿砚',item:'榫用木楔',quantity:1,instances:[ids[2]]},'not-owned'),/没有选中/);assert.deepEqual(c,before);
});
test('制造单件可存储重启、导入和删消息回滚，规则分区1升2不改原登记与背包',async t=>{
    const{engine,document}=await setup();document.state.runtimeRuleVersion=1;document.state.revivalPoints={bld_hw_altar:{fee:0,source:'旧登记'}};
    const before=structuredClone(document),patches=planRuleStateMigration(document,engine.rules),migrated=applyPatches(document,patches);
    assert.equal(migrated.state.runtimeRuleVersion,2);assert.deepEqual(migrated.state.inventory,document.state.inventory);assert.deepEqual(migrated.state.revivalPoints,document.state.revivalPoints);assert.deepEqual(document,before);
    const dir=await fs.mkdtemp(path.join(tmpRoot(),'infinite-fields-craft-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
    const reducer=(c,input)=>engine.reduce(c,input),store=new CampaignStorage(dir,{reducer});await store.create({id:'craft',worldVersion:engine.world.version,document:migrated});
    await store.transact('craft',{id:'make',anchor:'made',input:{tool:'world_craft',args:{recipe:'recipe_wooden_pegs'},eventId:'manufacture_5'}},reducer);
    const view=await store.read('craft');
    assert.deepEqual((await new CampaignStorage(dir,{reducer}).read('craft')).document,view.document);
    assert.deepEqual((await store.import(await store.export('craft'),'copy')).document,view.document);
    assert.deepEqual((await store.reconcile('craft',[])).document,migrated);
});
test('照明绑定实际单件，卖掉后买回同种别件不恢复光，既有物品不伪造制作者',async()=>{
    const{world,document,run}=await setup();document.state.location='bld_hw_qingdeng';
    // This item-identity fixture supplies a second seller with an agreed offer.
    const seller=world.npcs.find(row=>row.id==='npc_hw_hezhou');
    seller.schedule={default:[{start:0,end:1440,location:'bld_hw_qingdeng',activity:'出售夹具中的木杖',services:['trade']}]};
    let cast;for(let i=0;i<50;i++){cast=await run(document,'world_cast',{spell:'照明术',target:'旧木杖'},`light_${i}`);if(cast.result.success)break;}
    let c=cast.document;const instance=c.state.inventory.item_staff.instances[0];assert.equal(c.state.itemInstances[instance].maker,null);
    const illuminated=c=>magicIlluminates({get:(...path)=>path.reduce((value,key)=>value?.[key],c)});
    assert.equal(illuminated(c),true);
    c=(await run(c,'world_trade',{seller:'player',buyer:'林穗',item:'旧木杖',quantity:1},'sell-staff')).document;assert.equal(illuminated(c),false);
    c.state.npcs.npc_hw_hezhou.inventory.item_staff={quantity:1,quality:'木',durability:100,weight:1};
    c=(await run(c,'world_trade',{seller:'贺舟',item:'旧木杖',quantity:1},'other-staff')).document;assert.equal(illuminated(c),false);
    c=(await run(c,'world_trade',{seller:'林穗',item:'旧木杖',quantity:1,instances:[instance]},'original-staff')).document;assert.equal(illuminated(c),true);
});
test('配方工作台、主副产品、工具耗材重叠、坏引用和失败参数越界阻止构建',async()=>{
    const{world}=await setup();assert.equal(validateWorld(world).ok,true);
    for(const alter of[
        w=>w.recipes[0].workstation='missing',w=>w.recipes[0].byproducts=[{item:'item_missing',amount:1}],w=>w.recipes[0].tools.push('item_wood'),
        w=>w.recipes[0].byproducts=[{item:w.recipes[0].output.item,amount:1}],w=>w.recipes[0].failure.recoverFraction=2,
        w=>w.recipes[0].byproducts[0].amount=201,
    ]){const bad=structuredClone(world);alter(bad);assert.equal(validateWorld(bad).ok,false);}
});
