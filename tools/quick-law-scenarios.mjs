import assert from 'node:assert/strict';
import {applyPatches}from'../server-plugin/storage.mjs';

export function lawScenarios(engine){
    const guard='npc_hw_gucen',judge='npc_hw_chenbai';
    const prepareCrime=async c=>{
        c.state.location='loc_hw_gate';
        for(let i=0;i<100;i++){
            const out=await engine.reduce(c,{tool:'world_crime',args:{operation:'steal',target:guard,coins:10},eventId:`prepare_law_theft_${i}`});
            if(out.result.success)return applyPatches(c,out.patches);
        }
        throw new Error('未找到开发场景的成功偷窃检定');
    };
    const newest=c=>Object.values(c.state.records).find(row=>row.category==='legal_case');
    return[
        {id:'CrimeTheft',input:'我只试一次，偷偷从顾岑身上扒取10铜，不做其他动作。',
            setup:c=>{c.state.location='loc_hw_gate';return c;},
            context:'顾岑npc_hw_gucen在村口，有真实钱币。只使用world_crime steal target该NPC coins10，实际5分钟。成败与目击按工具，不能先用world_check再重复犯罪检定，不能自行加逮捕、赔偿、交罚款或改关系。整回合5分钟。',
            assert:(c,{initial,startMinute})=>{
                const row=newest(c);assert.ok(row);const amount=row.stolen?.coins??0;
                assert.equal(c.state.player.coins,initial.state.player.coins+amount);assert.equal(c.state.npcs[guard].coins,initial.state.npcs[guard].coins-amount);
                assert.equal(amount,row.offense==='theft'?10:0);assert.equal(c.state.minute,startMinute+5);assert.equal(row.judgment,undefined);
            }},
        {id:'LawConfession',input:'我向顾岑自认刚才偷了他的10铜，请他受理这起案件；先不要替我缴款或选择刑罚。',
            fixtureScope:'源规则与真实NPC；开场案件由真实偷窃处理器构造，不是自然多回合取得证明',setup:prepareCrime,
            context:'world_law inspect可查已有legal_case编号，顾岑仍在场。明确自认用world_law confess authority npc_hw_gucen，实际15分钟。自认只增加证据并受理，未审理、未交款、未监禁；不追加偷窃。整回合15分钟。',
            assert:(c,{initial,startMinute})=>{
                const row=newest(c);assert.equal(row.reported,true);assert.ok(row.evidence.some(e=>e.kind==='confession'));
                assert.equal(row.judgment,undefined);assert.equal(c.state.player.coins,initial.state.player.coins);assert.equal(c.state.minute,startMinute+15);
            }},
        {id:'LawHearing',input:'请陈柏审理我已经自认的这起偷窃案件，先作裁定，我还没有选择交款还是服役。',
            fixtureScope:'源规则与真实NPC；前置偷窃、自认与移动均用引擎构造，只核对本次审理理解',
            setup:async c=>{
                c=await prepareCrime(c);const row=newest(c);
                let out=await engine.reduce(c,{tool:'world_law',args:{operation:'confess',case:row.id,authority:guard},eventId:'prepare_confession'});c=applyPatches(c,out.patches);
                out=await engine.reduce(c,{tool:'world_move',args:{destination:'bld_hw_council'},eventId:'prepare_court_move'});return applyPatches(c,out.patches);
            },
            context:'当前位置bld_hw_council，陈柏npc_hw_chenbai是真实在场法定审判者。用world_law inspect查案件，再hear authority陈柏，60分钟。偷取10铜、法典罚款10+价值10共20铜，赔偿10铜另算；只裁定，不自动pay或labor/prison。整回合60分钟。',
            assert:(c,{initial,startMinute,reply})=>{
                const row=newest(c);assert.equal(row.status,'已裁定');assert.equal(row.judgment.fine,20);assert.equal(row.judgment.compensation,10);
                assert.equal(row.finePaid,undefined);assert.equal(c.state.player.coins,initial.state.player.coins);assert.equal(c.state.minute,startMinute+60);
                assert.ok(!/十倍|10倍|古岑/.test(reply),'本案是一倍赃值罚款，受害人名为顾岑；不能用错误倍数或错名覆盖回执');
            }},
    ];
}
