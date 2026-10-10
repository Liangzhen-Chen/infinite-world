import test from'node:test';
import assert from'node:assert/strict';
import {inspectionClaimErrors,manufacturingClaimErrors,repairClaimErrors,waterTransferClaimErrors}from'../tools/narrative-claims.mjs';

test('引水叙事不能在有限转移之外虚构其余水存进沟里，不误判原水源或明确否定',()=>{
    assert.ok(waterTransferClaimErrors('其余被七成堵塞的淤泥拦住、滞在沟中。').length);
    assert.ok(waterTransferClaimErrors('剩余的水积在沟内。').length);
    assert.deepEqual(waterTransferClaimErrors('其余水仍留在原来的凹池，沟里没有另外存水。'),[]);
    assert.deepEqual(waterTransferClaimErrors('剩余的水没有留在沟中。'),[]);
});

test('维修叙事保留未知制作者，不把实际维修者误写成原制作者',()=>{
    assert.ok(repairClaimErrors('编号和你的署名都没变。',{maker:null}).length);
    assert.ok(repairClaimErrors('它的制作者是你。',{maker:null}).length);
    assert.deepEqual(repairClaimErrors('原制作者未知，你只做了这次维修。',{maker:null}),[]);
    assert.deepEqual(repairClaimErrors('没有你的署名，制作者未知。',{maker:null}),[]);
    assert.deepEqual(repairClaimErrors('编号和你的署名都没变。',{maker:'player'}),[]);
});
test('检查叙事捕获已观察的毁物和虚构工具，不误判未来建议或明确未动刀',()=>{
    for(const reply of['木料完好，没有下刀，也没有削下任何木屑。','最终没能得出能让你放心下刀的结论。','真要削，得先找个角下刀试试才知道。','木料没有裂成两半。'])assert.deepEqual(inspectionClaimErrors(reply),[]);
    for(const reply of['木料啪地裂成两半。','你手里的凿刀一滑。','木料一滑，边角磕在棱上，崩掉一小片。','磨盘基座的水泥棱。'])assert.ok(inspectionClaimErrors(reply).length);
});
test('制造叙事发现已收费却否认收费、零回收却声称回收，不误判真实废料描述',()=>{
    const outcome={feePaid:2,recovery:0,success:false};
    assert.ok(manufacturingClaimErrors('工作台使用费2铜尚未结算，因为没有成品。',outcome).length);
    assert.ok(manufacturingClaimErrors('回收下来只够零碎木屑。',outcome).length);
    assert.ok(manufacturingClaimErrors('回收到的只有些刨花碎屑。',outcome).length);
    assert.deepEqual(manufacturingClaimErrors('没有回收到任何可用材料。',outcome),[]);
    assert.deepEqual(manufacturingClaimErrors('工作台收了2铜，材料全废，地上留下碎木片。',outcome),[]);
});
