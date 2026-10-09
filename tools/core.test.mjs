import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCampaign,commit,cast,roll,addMemory,search,promptFor,restoreToAnchors} from '../SillyTavern/public/scripts/extensions/third-party/infinite-fields/core.js';
const seed=JSON.parse(fs.readFileSync(new URL('../SillyTavern/public/scripts/extensions/third-party/infinite-fields/seed.json',import.meta.url)));

test('租房扣款与契约原子提交，重复重试不会双扣',()=>{
    const c=createCampaign(seed);
    const action={transaction_id:'rent',reason:'支付一晚房钱',player:{coins_delta:-6},minutes:10,records:[{category:'contract',name:'客房',content:'林穗已收到6铜，允许入住一晚',status:'已履行'}]};
    commit(c,action);commit(c,action);
    assert.equal(c.state.player.coins,174);assert.equal(c.state.minute,550);assert.equal(c.journal.length,1);
    const previous=JSON.stringify(c);
    assert.throws(()=>commit(c,{...action,transaction_id:'unaffordable',player:{coins_delta:-1000},items:[{item:'铁料',delta:5}]}));
    assert.equal(JSON.stringify(c),previous);
});
test('缺材料时施法拒绝且不会先扣MP',()=>{
    const c=createCampaign(seed);
    commit(c,{transaction_id:'learn',reason:'已支付教学费并完成学习',spells:[{name:'修补术',mp:3,materials:[{item:'树脂',amount:1}],duration:0,effect:'修补小木器'}]});
    assert.throws(()=>cast(c,{transaction_id:'cast-failed',spell:'修补术',target:'木碗'}));
    assert.equal(c.state.player.mp,10);
    cast(c,{transaction_id:'light',spell:'照明术',target:'旧木杖'});
    assert.equal(c.state.player.mp,9);
    assert.throws(()=>cast(c,{transaction_id:'unknown',spell:'空间移动',target:'王都'}));
});
test('时间推进实际结算村庄生产与口粮，停玩不推进',()=>{
    const c=createCampaign(seed);
    commit(c,{transaction_id:'day',reason:'经过一个完整游戏日',minutes:1440});
    assert.equal(c.state.settlement.food,407);assert.equal(c.state.settlement.wood,30);
    const restored=JSON.parse(JSON.stringify(c));
    assert.equal(restored.state.minute,1980);
});
test('摘要没有包含旧经历时，长期事实和原始对话仍能找回',()=>{
    const c=createCampaign(seed);
    addMemory(c,{subject:'林穗',key:'借用厨房',content:'第三日归还蓝色账簿后，林穗允许旅人借用酒馆厨房。',keywords:['蓝色账簿','厨房']});
    const chat=[{name:'林穗',mes:'我的旧账簿是蓝色封皮，夹着一张雁渡船票。',is_user:false},...Array.from({length:80},()=>({name:'旅人',mes:'我继续沿官道赶路。',is_user:true})),{name:'旅人',mes:'林穗的旧账簿是什么颜色，夹着什么？',is_user:true}];
    chat[80].extra={memory:'近期正在长途旅行。'};
    const results=search(c,chat,'林穗 账簿 船票');
    assert.ok(results.some(v=>v.text.includes('雁渡船票')));
    assert.ok(promptFor(c,chat).includes('蓝色'));
    assert.equal(chat.length,82);
});
test('战役删除支线后可重建账本，手动固定事实不随支线消失',()=>{
    const c=createCampaign(seed);
    addMemory(c,{subject:'玩家固定',key:'背景',content:'旅人来自雁渡',pinned:true},null);
    commit(c,{transaction_id:'a',reason:'买粮',player:{coins_delta:-3},items:[{item:'干粮',delta:1}]},'a');
    commit(c,{transaction_id:'b',reason:'第二次买粮',player:{coins_delta:-3},items:[{item:'干粮',delta:1}]},'b');
    const restored=restoreToAnchors(seed,c.journal,new Set(['a']));
    assert.equal(restored.state.player.coins,177);assert.equal(restored.state.inventory.干粮,4);
    assert.ok(restored.memories['玩家固定::背景'].pinned);
});
test('本地骰子记录不能借重试改变结果',()=>{
    const c=createCampaign(seed),request={check_id:'lie',purpose:'说服房东赊账',difficulty:15,modifier:2};
    const result=roll(c,request,()=>0.6);
    assert.equal(result.die,13);assert.equal(result.total,15);assert.equal(result.success,true);
    assert.equal(roll(c,request,()=>0).die,13);
    assert.throws(()=>roll(c,{...request,difficulty:5}));
});
test('模型更新长期事实不会取消用户固定，重新载入仍有记录',()=>{
    const c=createCampaign(seed);
    addMemory(c,{subject:'旅人',key:'经历',content:'曾帮助林穗修窗',pinned:true});
    addMemory(c,{subject:'旅人',key:'经历',content:'曾帮助林穗修窗，并归还工具',pinned:false});
    const reloaded=JSON.parse(JSON.stringify(c));
    assert.ok(reloaded.memories['旅人::经历'].pinned);
    assert.equal(reloaded.journal.filter(v=>v.type==='memory').length,2);
});
test('正式职业与宠物名额由本地规则验证，NPC移动可以实际入账',()=>{
    const c=createCampaign(seed);
    commit(c,{transaction_id:'profession',reason:'导师认证完成',professions:{combat:'法师',life:['园艺师','地理师'],hidden:[]}});
    assert.throws(()=>commit(c,{transaction_id:'third',reason:'新增职业',professions:{life:['园艺师','地理师','商人']}}));
    assert.deepEqual(c.state.professions.life,['园艺师','地理师']);
    commit(c,{transaction_id:'guide',reason:'吴朔实际带路',minutes:60,location:'北林边',relationships:[{name:'吴朔',location:'北林边',activity:'正在带旅人识别兽迹'}]});
    assert.equal(c.state.npcs.吴朔.location,'北林边');
    assert.match(c.state.npcs.吴朔.activity,/带旅人/);
    assert.throws(()=>commit(c,{transaction_id:'pets',reason:'契约已签订',pets:Array.from({length:6},(_,i)=>({name:`伙伴${i}`,category:'战斗',status:'活跃',notes:'已驯化'}))}));
    assert.deepEqual(c.state.pets,{});
});
