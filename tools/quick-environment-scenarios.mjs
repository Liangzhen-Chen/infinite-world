import assert from'node:assert/strict';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {spellBlueprints}from'../world/design/spell-blueprints.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {waterTransferClaimErrors}from'./narrative-claims.mjs';

export function environmentScenarios(sourceEngine){
    const world=structuredClone(sourceEngine.world),bones=spellBlueprints().filter(row=>['irrigate','clear_silt'].includes(row.mechanism));
    for(const bone of bones){world.spells.push(bone);world.skills.push({id:bone.skill,name:bone.name,attribute:'精神',profession:'profession_mage'});}
    const engine=new WorldEngine(world),fixtureScope='隔离规则夹具：注入两个已知水法术测试模型工具理解，不是正式目录或正常学习取得证据';
    const prepare=c=>{
        c.state.location='loc_hw_dock';c.state.player.mp=40;c.state.player.maxMp=40;
        for(const bone of bones){c.state.spells[bone.id]={source:{type:'fixture'}};c.state.skills[bone.skill]={proficiency:120,daily:{},breakthroughs:[]};}return c;
    };
    return[
        {id:'WaterIrrigation',engine,fixtureScope,input:'我只施放一次已经学会的引水术，把凹池里的水沿这条沟引向菜圃。',setup:prepare,
            context:'已知法术spell_water_04引水术，只有一次施法，不提前检定、不另造沟渠。可查当前feature目录，target是feature_hw_channel。实际流量由既有30000毫升水、70%堵塞和田垄容量计算；不能凭空增加水或把净水/消毒效果加到引水术。',
            assert:(c,{initial,startMinute,reply})=>{
                const checks=Object.entries(c.state.checks).filter(([id])=>id.startsWith('quick_WaterIrrigation_'));assert.equal(checks.length,1);
                const success=checks[0][1].success,source=c.state.records['physical_feature:feature_hw_pool']?.state,
                    target=c.state.records['physical_feature:feature_hw_plot']?.state;
                assert.equal(source?.waterMl??30000,success?24000:30000);assert.equal(target?.waterMl??0,success?6000:0);
                assert.equal((source?.waterMl??30000)+(target?.waterMl??0),30000);assert.equal(c.state.minute,startMinute+1);
                assert.equal(c.state.player.mp,initial.state.player.mp-4);assert.equal(c.state.player.coins,initial.state.player.coins);
                assert.deepEqual(waterTransferClaimErrors(reply),[],'引水不能虚构沟内另存水');
            }},
        {id:'CarrySilt',engine,fixtureScope,input:'沟里的泥已经松好了。我把其中一公斤搬到沟旁指定堆泥地，只搬这一趟。',
            setup:async c=>{
                c=prepare(c);
                for(let i=0;i<100;i++){
                    const out=await engine.reduce(c,{tool:'world_cast',args:{spell:'spell_water_06',target:'feature_hw_channel'},eventId:`prepare_silt_${i}`});
                    if(out.result.success)return applyPatches(c,out.patches);
                }
                throw new Error('未取得独立清渠准备样本');
            },
            context:'引水沟feature_hw_channel已有2000克松动泥，但8000克泥仍在沟中，堵塞仍70%。用world_environment carry_silt搬1000克到feature_hw_silt_heap，只做一次。成功后泥才离开沟，失败也花20分钟；不重施法、不接额外任务。',
            assert:(c,{initial,startMinute})=>{
                const checks=Object.entries(c.state.checks).filter(([id])=>id.startsWith('quick_CarrySilt_'));assert.equal(checks.length,1);
                const success=checks[0][1].success,channel=c.state.records['physical_feature:feature_hw_channel'].state,
                    heap=c.state.records['physical_feature:feature_hw_silt_heap']?.state;
                assert.equal(channel.siltGrams,success?7000:8000);assert.equal(heap?.siltGrams??0,success?1000:0);
                assert.equal(channel.siltGrams+(heap?.siltGrams??0),8000);assert.equal(channel.blockagePercent,success?61.25:70);
                assert.equal(c.state.minute,startMinute+20);assert.equal(c.state.player.mp,initial.state.player.mp);assert.equal(c.state.player.coins,initial.state.player.coins);
            }},
    ];
}
