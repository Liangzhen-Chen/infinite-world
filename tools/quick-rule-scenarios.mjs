import assert from'node:assert/strict';
import {applyPatches}from'../server-plugin/storage.mjs';
import {inspectionClaimErrors,manufacturingClaimErrors,repairClaimErrors}from'./narrative-claims.mjs';

// Preparation uses ordinary rules. Failed candidate rolls are isolated fixtures,
// never retries of an active player's action or an altered save.
async function prepareLesson(engine,document,entity){
    for(let attempt=0;attempt<100;attempt++){
        const out=await engine.reduce(document,{tool:'world_learn',args:{entity,source:'阿砚'},eventId:`prepare_lesson_${entity}_${attempt}`});
        if(out.result.success)return applyPatches(document,out.patches);
    }
    throw new Error('场景准备未获得成功学习样本');
}
export function ruleScenarios(engine){
    const execute=async(c,tool,args,eventId)=>applyPatches(c,(await engine.reduce(c,{tool,args,eventId})).patches);
    return[
        {id:'WorkshopRepair',input:'我用买好的削木小刀，在磨坊的木工台修整这根磨损的旧木杖，先做一次。',
            setup:async c=>{
                c.state.location='bld_hw_mill';c=await prepareLesson(engine,c,'skill_life_6_core');
                c=await execute(c,'world_trade',{seller:'阿砚',item:'item_whittling_knife',quantity:1},'prepare_repair_knife');
                // Fixture begins with ordinary wear; preparation does not ask the model to forge damage.
                c.state.inventory.item_staff.durability=50;return c;
            },
            context:'已学会木工并实际买入小刀，旧木杖当前耐久50/100。通过world_catalog查询其维修工序后，用world_craft operation repair、item旧木杖执行一次。维修工序已登记，使用费2铜、20分钟、小刀磨损1。按工具回执叙述成功或失败，不另付重复费用或生成新木杖。',
            assert:(c,{initial,startMinute,reply})=>{
                const receipts=Object.values(c.state.records).filter(row=>row.category==='repair');assert.equal(receipts.length,1);
                const receipt=receipts[0],unit=c.state.itemInstances[receipt.instance];assert.equal(receipt.plan,'repair_staff_trim');
                assert.equal(receipt.fee,2);assert.equal(receipt.station,'station_hw_mill_bench');assert.equal(receipt.minutes,20);
                assert.equal(c.state.player.coins,initial.state.player.coins-2);assert.equal(c.state.minute,startMinute+20);
                assert.equal(c.state.inventory.item_whittling_knife.durability,initial.state.inventory.item_whittling_knife.durability-1);
                assert.equal(c.state.inventory.item_staff.quantity,1);assert.equal(unit.maker,null);
                assert.equal(unit.durability,receipt.success?70:50);assert.equal(unit.maxDurability,receipt.success?99:100);
                assert.equal(c.state.inventory.item_staff.durability,unit.durability);
                assert.equal(c.state.player.xp,initial.state.player.xp);assert.equal(Object.keys(c.state.crafted??{}).length,0);
                assert.deepEqual(repairClaimErrors(reply,{maker:unit.maker}),[],'维修不能把未知原制作者写成玩家署名');
            }},
        {id:'OpposedCheck',input:'我跟阿砚进行一次不伤人的掰手腕，谁都不让着谁。',
            setup:c=>{c.state.location='bld_hw_mill';},
            context:'这是力量对抗，使用world_check的opponent引用阿砚，不指定固定difficulty。不能用攻击工具伤人，按双方实际结果叙述。',
            assert:(c,{initial})=>{
                const checks=Object.entries(c.state.checks).filter(([id])=>id.startsWith('quick_OpposedCheck_'));
                assert.equal(checks.length,1);const result=checks[0][1];assert.equal(result.opponent.npc,'npc_hw_ayan');
                assert.equal(result.opponent.attribute,'力量');assert.equal(result.opponent.modifier,0);
                const rank=die=>die===20?1:die===1?-1:0;
                assert.equal(result.success,rank(result.die)===rank(result.opponent.die)?result.total>result.opponent.total:rank(result.die)>rank(result.opponent.die));
                assert.equal(c.state.player.hp,initial.state.player.hp);assert.equal(c.state.npcs.npc_hw_ayan.hp,initial.state.npcs.npc_hw_ayan.hp);
            }},
        {id:'PromisedAssistance',input:'阿砚已经答应帮我判断这块木料适不适合削木楔，现在我和他一起检查。',
            setup:async c=>{
                c.state.location='bld_hw_mill';c=await prepareLesson(engine,c,'skill_life_6_core');
                c=await execute(c,'world_trade',{seller:'阿砚',item:'item_wood',quantity:1},'prepare_inspection_wood');
                return execute(c,'world_promise',{promisor:'阿砚',type:'协助',attribute:'敏捷',skill:'skill_life_6_core',content:'协助检查木料',deadline:c.state.minute+60},'prepare_assistance');
            },
            context:'当前已有真实协助义务obl_prepare_assistance，属性敏捷、技能skill_life_6_core，承诺者阿砚在场且木工熟练度120。用world_check执行普通难度15，helpers引用该义务，不再创建或重复承诺。只是查看与触摸已购入的木料，不下刀；失败表现为判断不出或无法确认，不消耗和损毁木料。',
            assert:(c,{initial,reply})=>{
                const obligation=c.state.obligations.obl_prepare_assistance;assert.equal(obligation.status,'已完成');
                const check=c.state.checks[obligation.completion.source];assert.ok(check);
                assert.equal(check.helpers.length,1);assert.equal(check.helpers[0].npc,'npc_hw_ayan');
                assert.equal(check.helpers[0].obligation,'obl_prepare_assistance');
                assert.equal(check.helpers[0].bonus,check.helpers[0].success?2:0);
                assert.ok(c.state.npcs.npc_hw_ayan.developments.some(row=>row.type==='协助行动'));
                assert.deepEqual(c.state.inventory,initial.state.inventory);
                assert.deepEqual(inspectionClaimErrors(reply),[],'检查木料不能虚构毁物、工具或现代建筑');
            }},
        {id:'WorkshopCraft',input:'我用已经学会的配方和手里的小刀，在这个工作台削一批榫用木楔。',
            setup:async c=>{
                c.state.location='bld_hw_mill';c=await prepareLesson(engine,c,'recipe_wooden_pegs');
                for(const item of['item_whittling_knife','item_wood'])c=await execute(c,'world_trade',{seller:'阿砚',item,quantity:1},`prepare_buy_${item}`);
                return c;
            },
            context:'配方recipe_wooden_pegs已学会，已实际购入削木小刀和木料。磨坊木工台使用费2铜；world_craft一次处理扣料、付费、工具损耗与20分钟，不再交易重复支付。结果可能失败，按回执叙述。',
            assert:(c,{initial,startMinute,reply})=>{
                const receipts=Object.values(c.state.crafted);assert.equal(receipts.length,1);const receipt=receipts[0];
                assert.equal(receipt.recipe,'recipe_wooden_pegs');assert.equal(receipt.fee,2);assert.equal(receipt.station,'station_hw_mill_bench');
                assert.equal(c.state.player.coins,initial.state.player.coins-2);assert.equal(c.state.minute,startMinute+20);
                assert.equal(c.state.inventory.item_wood?.quantity??0,initial.state.inventory.item_wood.quantity-1);
                assert.equal(c.state.inventory.item_whittling_knife.durability,79);
                const success=['勉强成功','成功','大成功'].includes(receipt.degree);
                assert.equal(receipt.quantity,success?4:0);assert.equal(receipt.instances.length,success?5:0);
                for(const id of receipt.instances){const item=c.state.itemInstances[id];assert.equal(item.maker,'player');assert.equal(item.makerName,initial.state.player.name);assert.equal(item.owner,'player');}
                if(success)assert.equal(c.state.inventory.item_wood_shavings.quantity,1);
                assert.deepEqual(manufacturingClaimErrors(reply,{feePaid:2,recovery:0,success}),[],'制造叙事须符合实际收费和回收');
            }},
    ];
}
