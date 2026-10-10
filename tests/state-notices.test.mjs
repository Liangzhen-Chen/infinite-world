import test from 'node:test';
import assert from 'node:assert/strict';
import {stateNotices}from'../server-plugin/state-notices.mjs';
import {messageFeedback,visibleReply}from'../extension/message-view.mjs';

test('状态反馈包含玩家可见变化，不泄露幸运、NPC私产或其他人的效果',()=>{
    const before={player:{coins:12,hp:10,maxHp:10,mp:3,maxMp:5,attributes:{力量:10}},inventory:{staff:{quantity:1,durability:10}},npcs:{npc:{coins:100,trust:0,affection:0}},effects:{light:{target:'staff',spell:'light'}},pets:{},skills:{},records:{},minute:0};
    const after=structuredClone(before);after.player.coins=6;after.player.mp=5;after.player.luck=99;after.inventory.staff.durability=9;
    after.npcs.npc.coins=106;after.npcs.npc.secret='秘密计划';after.effects={secret:{target:'npc',spell:'不该出现的法术'}};after.minute=10;
    after.records.room={category:'contract',parties:['player','npc'],name:'住宿',status:'有效'};
    const result=stateNotices(before,after,id=>({staff:'木杖',light:'照明术'})[id]);const text=result.map(x=>x.text).join('\n');
    for(const expected of ['钱袋 -6铜，现有 6','魔力 +2，现有 5/5','木杖耐久 10 → 9','效果结束：照明术','住宿：有效','经过 10 分钟'])assert.ok(text.includes(expected),text);
    assert.doesNotMatch(text,/99|106|秘密|不该出现/);
});

test('反馈挂在对应回合最后一条叙述，跳过工具消息，撤销后不信任旧聊天缓存',()=>{
    const chat=[{is_user:true,extra:{fields_anchor:'a'}},{mes:'先看看'},{is_system:true,extra:{tool_invocations:[{}]}},{mes:'办好了',extra:{fields_notices:[{text:'旧缓存'}]}},{is_user:true,extra:{fields_anchor:'b'}}];
    const events=[{anchor:'a',notices:[{text:'已扣6铜'}]},{anchor:'b',notices:[{text:'已扣2铜'}]}];
    assert.deepEqual(messageFeedback(chat,events).messages.get(3),[{text:'已扣6铜'}]);
    assert.deepEqual(messageFeedback(chat,events).pending,[{text:'已扣2铜'}]);
    assert.equal(messageFeedback(chat,[]).messages.size,0);
    chat[0].extra.fields_invalidated=true;assert.equal(messageFeedback(chat,events).messages.size,0);
    assert.equal(visibleReply('<q who="npc">你好。</q><回合 额外="0分" 地点="酒馆"/>',{npc:'林穗'}),'林穗：你好。');
});
