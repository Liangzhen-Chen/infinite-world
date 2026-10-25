import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
// Production installs the action composition root. Declare that prerequisite
// here as well, so another test importing A3 cannot change this file's result
// shape. The action receipt retains the native repair record ID in legacy.
import '../server-plugin/primitives-runtime.mjs';
import {CampaignStorage,applyPatches}from'../server-plugin/storage.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
import {catalogDefinition}from'../server-plugin/catalog.mjs';

const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function setup(){
    const world=await loadWorld(),engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'repair-test');
    document.state.location='bld_hw_mill';document.state.inventory.item_staff.durability=50;
    document.state.inventory.item_whittling_knife={quantity:1,quality:'木',durability:80,weight:0.2};
    document.state.skills.skill_life_6_core={proficiency:120,daily:{},breakthroughs:[]};
    const run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    return{world,engine,document,run};
}
async function outcome(run,c,args,success){
    for(let i=0;i<100;i++){
        const id=`repair_sample_${i}`,out=await run(c,'world_craft',{operation:'repair',...args},id);
        if(out.result.success===success)return{...out,id};
    }
    throw new Error('未取得所需维修检定样本');
}
test('错误维修工序不会伪报物品不可维修；拒绝不扣费，使用实际编号可继续操作',async()=>{
    const{engine,document,run}=await setup(),before=structuredClone(document);
    const plan=engine.rules.repairs.find(row=>row.item==='item_staff');
    await assert.rejects(run(document,'world_craft',{operation:'repair',item:'item_staff',repairPlan:'用小刀修整杖身'},'wrong_plan'),error=>error.message.includes(plan.id)&&error.message.includes('编号未识别'));
    assert.deepEqual(document,before);
    const result=await run(document,'world_craft',{operation:'repair',item:'item_staff',repairPlan:plan.id},'correct_plan');
    assert.equal(result.result.plan,plan.id);assert.ok(result.document.state.minute>document.state.minute);
});

test('维修误把物品名当单件编号时给出纠正方法，拒绝无副作用，省略后实际结算',async()=>{
    const{document,run}=await setup(),before=structuredClone(document);
    for(const instance of['旧木杖','item_staff'])await assert.rejects(run(document,'world_craft',{operation:'repair',item:'旧木杖',instance},'bad-instance'),/省略 instance，仅传 item/);
    assert.deepEqual(document,before);
    const repaired=await run(document,'world_craft',{operation:'repair',item:'旧木杖'},'correct-instance');
    assert.equal(repaired.document.state.player.coins,before.state.player.coins-2);
    assert.equal(repaired.document.state.minute,before.state.minute+20);
    assert.equal(repaired.document.state.inventory.item_staff.quantity,1);
    assert.ok(repaired.document.state.itemInstances[repaired.result.instance]);
});

test('维修先检查实际损坏、持有、技能、工具、费用与工作台，伪造工序和折断对象不花钱耗时',async()=>{
    const{world,engine,document,run}=await setup(),plans=structuredClone(engine.rules.repairs);
    for(const alter of[
        c=>delete c.state.inventory.item_staff,c=>c.state.inventory.item_staff.durability=0,
        c=>c.state.inventory.item_staff.durability=100,c=>c.state.inventory.item_staff.durability=99,
        c=>c.state.inventory.item_staff.quantity=2,c=>delete c.state.skills.skill_life_6_core,
        c=>delete c.state.inventory.item_whittling_knife,c=>c.state.inventory.item_whittling_knife.durability=0,
        c=>c.state.location='bld_hw_qingdeng',c=>c.state.player.coins=1,
        c=>c.state.buildings.bld_hw_mill={condition:0},c=>c.state.player.status='死亡',
    ]){
        const bad=structuredClone(document);alter(bad);const before=structuredClone(bad);
        await assert.rejects(run(bad,'world_craft',{operation:'repair',item:'旧木杖'},'invalid'));assert.deepEqual(bad,before);
    }
    await assert.rejects(run(document,'world_craft',{operation:'repair',item:'旧木杖',repairPlan:'repair_fake'},'fake'),/工序/);
    await assert.rejects(run(document,'world_craft',{operation:'repair',item:'旧木杖',recipe:'recipe_tool_handle'},'mixed'),/制造配方/);
    await assert.rejects(run(document,'world_craft',{operation:'repair',item:'削木小刀'},'knife'),/没有可用维修/);
    world.locations.find(row=>row.id==='bld_hw_mill').workstations[0].access='consent';
    const privateEngine=new WorldEngine(world);await assert.rejects(privateEngine.reduce(document,{tool:'world_craft',args:{operation:'repair',item:'旧木杖'},eventId:'private'}),/使用许可/);
    // 06 §6.7: registered clothing repair extends the catalog. Invalid requests
    // must still leave every real plan unchanged, including the new seam plan.
    assert.deepEqual(engine.rules.repairs,plans);
});

test('修整既有单件实际收费计时磨损工具，有限恢复且未知制作者不被改成玩家',async()=>{
    const{document,run}=await setup(),out=await outcome(run,document,{item:'旧木杖',restore:100000,maxLoss:0,maker:'player'},true),c=out.document;
    assert.equal(out.result.notices.filter(row=>row.text==='旧木杖耐久 50 → 70').length,1);
    assert.ok(out.result.notices.some(row=>row.text==='旧木杖耐久上限现为 99'));
    assert.equal(c.state.player.coins,178);assert.equal(c.state.minute,document.state.minute+20);
    assert.equal(c.state.workshopFunds.station_hw_mill_bench,2);assert.equal(c.state.inventory.item_whittling_knife.durability,79);
    assert.equal(c.state.inventory.item_staff.quantity,1);assert.equal(c.state.inventory.item_staff.durability,70);
    const unit=c.state.itemInstances[out.result.instance];assert.equal(unit.maxDurability,99);assert.equal(unit.maker,null);assert.equal(unit.makerName,null);
    assert.equal(out.result.provenance.maker,null);assert.match(out.result.factSummary,/原制作者未知/);
    assert.deepEqual(out.result.before,{durability:50,maxDurability:100});assert.deepEqual(out.result.after,{durability:70,maxDurability:99});
    assert.equal(c.state.records[out.result.receipt.legacy.receipt].mechanic,'player');assert.equal(c.state.player.xp,document.state.player.xp);
    assert.equal(Object.keys(c.state.crafted??{}).length,0);assert.equal(c.state.inventory.item_wood,document.state.inventory.item_wood);
    assert.deepEqual((await run(document,'world_craft',{operation:'repair',item:'旧木杖',restore:100000,maxLoss:0,maker:'player'},out.id)),outWithoutId(out));
});
function outWithoutId({id,...out}){return out;}

test('维修失败仍扣租费时间与工具磨损，物品状态和耐久上限保留，不伪造恢复或成品',async()=>{
    const{document,run}=await setup(),out=await outcome(run,document,{item:'旧木杖'},false),c=out.document;
    assert.equal(c.state.player.coins,178);assert.equal(c.state.minute,document.state.minute+20);
    assert.equal(c.state.inventory.item_staff.durability,50);assert.equal(c.state.itemInstances[out.result.instance].maxDurability,100);
    assert.equal(c.state.inventory.item_whittling_knife.durability,79);assert.equal(out.result.restored,0);
    assert.deepEqual(out.result.before,out.result.after);assert.equal(c.state.records[out.result.receipt.legacy.receipt].success,false);
    assert.equal(c.state.player.xp,document.state.player.xp);assert.equal(Object.keys(c.state.crafted??{}).length,0);
});

test('制造后修整、转售和买回保留原编号与署名，磨损上限逐次降低，其他单件不受影响',async()=>{
    const{document,run}=await setup();document.state.recipes.recipe_tool_handle={source:{type:'fixture'}};
    document.state.inventory.item_wood={quantity:2,quality:'木',durability:100,weight:1};
    let made;for(let i=0;i<100;i++){
        const sample=await run(document,'world_craft',{recipe:'recipe_tool_handle'},`make_handle_${i}`);if(sample.result.success){made=sample;break;}
    }
    assert.ok(made);let c=made.document;const originalId=c.state.inventory.item_tool_handle.instances[0],original=structuredClone(c.state.itemInstances[originalId]);
    c.state.itemInstances[originalId].durability=50;c.state.inventory.item_tool_handle.durability=50;
    const first=await outcome(run,c,{instance:originalId},true);c=first.document;
    assert.equal(first.result.instance,originalId);assert.equal(c.state.itemInstances[originalId].maxDurability,original.maxDurability-1);
    for(const field of['maker','makerName','recipe','source','workmanship','minute'])assert.equal(c.state.itemInstances[originalId][field],original[field]);
    c=(await run(c,'world_trade',{seller:'player',buyer:'阿砚',item:'小工具木柄',quantity:1,instances:[originalId]},'sell_repaired')).document;
    await assert.rejects(run(c,'world_craft',{operation:'repair',instance:originalId},'not_owned'),/持有|归属/);
    c=(await run(c,'world_trade',{seller:'阿砚',item:'小工具木柄',quantity:1,instances:[originalId]},'buy_repaired')).document;
    const second=await outcome(run,c,{instance:originalId},true);c=second.document;
    assert.equal(c.state.itemInstances[originalId].maxDurability,original.maxDurability-2);assert.equal(c.state.itemInstances[originalId].maker,'player');
    const secondId='unit_other_handle';c.state.itemInstances[secondId]={...original,id:secondId,durability:30};
    c.state.inventory.item_tool_handle.quantity=2;c.state.inventory.item_tool_handle.instances.push(secondId);
    const otherBefore=structuredClone(c.state.itemInstances[originalId]);
    c=(await outcome(run,c,{instance:secondId},true)).document;
    assert.deepEqual(c.state.itemInstances[originalId],otherBefore);assert.equal(c.state.itemInstances[secondId].durability,50);
    await assert.rejects(run(c,'world_craft',{operation:'repair',item:'小工具木柄'},'ambiguous'),/单件/);
    await assert.rejects(run(c,'world_craft',{operation:'repair',item:'旧木杖',instance:secondId},'wrong_item'),/不一致/);
});

test('维修不会重置先前耐久上限，后续魔法也不能恢复永久损耗',async()=>{
    const{world,document}=await setup();document.state.inventory.item_staff.maxDurability=70;document.state.inventory.item_staff.durability=60;
    const light=world.spells[0];world.items.find(row=>row.id==='item_staff').tags=['metal'];
    world.spells.push({...light,id:'spell_repair_fixture',name:'修理夹具术',mp:1,duration:0,effectSpec:{kind:'repair',power:100},materials:[]});
    document.state.spells.spell_repair_fixture={source:{type:'fixture'}};
    const engine=new WorldEngine(world),run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    const out=await outcome(run,document,{item:'旧木杖'},true);let c=out.document;
    assert.equal(c.state.itemInstances[out.result.instance].maxDurability,69);assert.equal(c.state.inventory.item_staff.durability,69);
    c.state.itemInstances[out.result.instance].durability=60;c.state.inventory.item_staff.durability=60;
    for(let i=0;i<100;i++){
        const cast=await run(c,'world_cast',{spell:'spell_repair_fixture',target:'旧木杖'},`repair_magic_${i}`);
        if(cast.result.success){c=cast.document;assert.equal(cast.result.repaired,9);break;}
    }
    assert.equal(c.state.itemInstances[out.result.instance].durability,69);assert.equal(c.state.itemInstances[out.result.instance].maxDurability,69);
});

test('维修记录、费用与单件状态经存储重启、导出导入和删消息回滚一致，旧格式无需新增必填字段',async t=>{
    const{engine,document,run}=await setup(),sample=await outcome(run,document,{item:'旧木杖'},true);
    const directory=await fs.mkdtemp(path.join(tmpRoot(),'infinite-fields-repair-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const reducer=(c,input)=>engine.reduce(c,input),store=new CampaignStorage(directory,{reducer});
    await store.create({id:'repair',worldVersion:engine.world.version,document});
    await store.transact('repair',{id:'repair_event',anchor:'repaired',input:{tool:'world_craft',args:{operation:'repair',item:'旧木杖'},eventId:sample.id}},reducer);
    const view=await store.read('repair');assert.equal(view.document.state.runtimeRuleVersion,2);
    assert.deepEqual(view.document.state.itemInstances,sample.document.state.itemInstances);
    assert.deepEqual((await new CampaignStorage(directory,{reducer}).read('repair')).document,view.document);
    assert.deepEqual((await store.import(await store.export('repair'),'repair_copy')).document,view.document);
    assert.deepEqual((await store.reconcile('repair',[])).document,document);
});

test('维修计划通过物品公开目录可查询，坏引用、重复工序、非法耐久与自修工具阻止构建',async()=>{
    const{world,engine,document}=await setup(),before=structuredClone(document);
    const read=catalogDefinition(engine,document,{entity:'旧木杖'});assert.equal(read.repairs[0].id,'repair_staff_trim');assert.deepEqual(document,before);
    assert.equal(validateWorld(world).ok,true);
    for(const alter of[
        w=>w.rules.repairs[0].item='item_missing',w=>w.rules.repairs.push(w.rules.repairs[0]),
        w=>w.rules.repairs[0].skill='skill_missing',w=>w.rules.repairs[0].tools=['item_missing'],
        w=>w.rules.repairs[0].tools=['item_tool_handle'],w=>w.rules.repairs[0].materials=[{item:'item_tool_handle',amount:1}],
        w=>w.rules.repairs[0].workstation='unbuilt',w=>w.rules.repairs[0].restore=0,
        w=>w.rules.repairs[0].maxLoss=100,w=>w.rules.repairs[0].minutes=0,
    ]){const bad=structuredClone(world);alter(bad);assert.equal(validateWorld(bad).ok,false);}
});

test('维修耗时中到期交付对象或工具保留归属，不在玩家背包复制物品或向已移交对象追加维修',async()=>{
    const{document,run}=await setup(),sample=await outcome(run,document,{item:'旧木杖'},true);
    const targetDue=await run(document,'world_promise',{promisor:'player',promisee:'阿砚',type:'送货',content:'交付旧木杖',item:'旧木杖',quantity:1,deadline:document.state.minute+5},'due_staff');
    const stopped=await run(targetDue.document,'world_craft',{operation:'repair',item:'旧木杖'},sample.id),c=stopped.document;
    assert.equal(stopped.result.checkSuccess,true);assert.equal(stopped.result.success,false);assert.equal(stopped.result.restored,0);
    assert.match(stopped.result.completionFailure,/交付/);assert.equal(c.state.inventory.item_staff,undefined);
    const unit=c.state.itemInstances[stopped.result.instance];assert.equal(unit.owner,'npc_hw_ayan');assert.equal(unit.durability,50);assert.equal(unit.maxDurability,100);
    assert.equal(c.state.obligations.obl_due_staff.status,'已完成');assert.equal(c.state.player.coins,178);
    const toolDue=await run(document,'world_promise',{promisor:'player',promisee:'阿砚',type:'送货',content:'归还小刀',item:'削木小刀',quantity:1,deadline:document.state.minute+5},'due_knife');
    const finished=await run(toolDue.document,'world_craft',{operation:'repair',item:'旧木杖'},sample.id);
    assert.equal(finished.result.success,true);assert.equal(finished.document.state.inventory.item_whittling_knife,undefined);
    assert.equal(finished.result.spent.toolWear[0].after,79);assert.equal(finished.document.state.obligations.obl_due_knife.status,'已完成');
});
