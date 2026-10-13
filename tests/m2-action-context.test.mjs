import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {loadPromptBundle}from'../tools/build-card.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {readStateSection}from'../extension/state-read.mjs';
import {evaluateAssertions}from'../tools/playtest-assertions.mjs';
import {toolSelectionMetrics}from'../tools/playtest-metrics.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const original=JSON.parse(await fs.readFile(new URL('../docs/测试报告/M2-recheck/真实试玩.json',import.meta.url),'utf8'));
const scenario=async id=>JSON.parse(await fs.readFile(new URL(`./playtests/${id}.json`,import.meta.url),'utf8'));
const qty=value=>typeof value==='number'?value:value?.quantity??0;
async function replay(id){
    const script=await scenario(id),engine=new WorldEngine(world);
    let doc=engine.createCharacter(seed,{},id);
    const turns=[];
    const step=async(index,actions=[])=>{
        const before=structuredClone(doc),calls=[];
        for(const [tool,args]of actions){
            const eventId=`${id}-${index}-${calls.length}`;let result;
            if(tool==='world_read')result=readStateSection(doc.state,args.section,args.npc);
            else{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);result=out.result;}
            calls.push({tool,args,result});
        }
        const assertions=evaluateAssertions(script.turns[index].assertions,{before,after:doc,calls,reply:''});
        assert.deepEqual(assertions.filter(row=>!row.pass),[],`${id} turn ${index}`);
        turns.push({index,input:script.turns[index].input,calls,assertions});
        return calls;
    };
    return{engine,script,step,turns,get doc(){return doc;}};
}

test('原courier顺序查询库存→两份立约→移动等候→当面交付，仅扣钱转物一次',async()=>{
    const r=await replay('npc_courier');
    await r.step(0,[['world_move',{destination:'bld_hw_qingdeng'}]]);
    const read=await r.step(1,[['world_read',{section:'人物',npc:'npc_hw_linsui'}]]);
    assert.equal(qty(read[0].result.npc_hw_linsui.inventory.item_bread),6);
    await r.step(2,[
        ['world_promise',{type:'送货',promisor:'npc_hw_linsui',item:'item_bread',quantity:1,location:'bld_hw_council',deadline:660,content:'十一点在村务屋交一份面包'}],
        ['world_promise',{type:'付款',promisor:'player',promisee:'npc_hw_linsui',coins:2,deadline:660,content:'十一点当面付两铜'}],
        ['world_move',{destination:'bld_hw_council'}],
    ]);
    await r.step(3,[['world_time',{minutes:1}]]);
    await r.step(4,[['world_move',{destination:'bld_hw_council'}]]);
    await r.step(5,[['world_time',{until:{dayOffset:0,hour:11,minute:0}}]]);
    await r.step(6);await r.step(7,[['world_time',{minutes:5}]]);
    assert.equal(qty(r.doc.state.npcs.npc_hw_linsui.inventory.item_bread),5);
    const measured=toolSelectionMetrics([{id:r.script.id,turns:r.turns}],[r.script]);
    assert.equal(measured.zeroSelectionErrors,true);assert.ok(measured.parameterOpportunities>=3);assert.equal(measured.targetOpportunities,1);
});

test('原home_visit顺序入宅→完整60分钟等待至许可过期→离宅→旧许可拒绝',async()=>{
    const r=await replay('npc_home_visit');
    await r.step(0,[['world_move',{destination:'loc_hw_fields'}],['world_time',{minutes:30}]]);await r.step(1);
    const issued=await r.step(2,[['world_promise',{operation:'grant_access',promisor:'npc_hw_miaozhen',location:'bld_hw_home_15',minutes:60,content:'独自进屋看旧筛架，只看不取物'}]]);
    const authorization=issued[0].result.authorization;
    await r.step(3,[['world_move',{destination:'bld_hw_home_15',authorization}]]);await r.step(4);
    const start=r.doc.state.minute;
    await r.step(5,[['world_time',{minutes:60,activity:'等待'}]]);assert.equal(r.doc.state.minute,start+60);
    await r.step(6,[['world_move',{destination:'河湾村'}]]);
    const before=structuredClone(r.doc);
    await assert.rejects(r.engine.reduce(r.doc,{tool:'world_move',args:{destination:'bld_hw_home_15',authorization},eventId:'expired'}),/有效许可/);
    assert.deepEqual(r.doc,before);await r.step(7);await r.step(8);
    await assert.rejects(r.engine.reduce(r.doc,{tool:'world_move',args:{destination:'loc_hw_village_center'},eventId:'invented'}),/未登记/);
});

test('原private顺序赊账→保密不建会面→去北林→逾期，屋外人物没有欠款认知',async()=>{
    const r=await replay('npc_private');await r.step(0,[['world_move',{destination:'bld_hw_qingdeng'}]]);
    await r.step(1,[['world_trade',{seller:'npc_hw_linsui',service:'住宿',days:1,payment:'credit',creditMinutes:60}]]);
    await r.step(2);assert.deepEqual(r.doc.state.obligations,{});
    await r.step(3,[['world_move',{destination:'loc_hw_northwood'}]]);
    await r.step(4,[['world_time',{minutes:120}]]);await r.step(5);await r.step(6);await r.step(7);
    assert.ok(!(r.doc.state.npcs.npc_hw_wushuo.memoryStream??[]).some(row=>row.kind==='debt'));
    const read=readStateSection(r.doc.state,'人物','npc_hw_wushuo');assert.equal(read.npc_hw_wushuo.cognition,undefined);
    // Real meetings still reserve time; a privacy instruction does not weaken this guarantee.
    const atInn=await replay('npc_private');await atInn.step(0,[['world_move',{destination:'bld_hw_qingdeng'}]]);
    const out=await atInn.engine.reduce(atInn.doc,{tool:'world_promise',args:{type:'会面',promisor:'npc_hw_linsui',minutes:60,content:'当面谈一小时'},eventId:'real-meeting'});
    const meeting=applyPatches(atInn.doc,out.patches);
    await assert.rejects(atInn.engine.reduce(meeting,{tool:'world_move',args:{destination:'loc_hw_northwood'},eventId:'leave-meeting'}),/会面时段冲突/);
});

test('原shove顺序自认→有充分证据逮捕押解→在场审理，交易暂停不阻断司法',async()=>{
    const r=await replay('npc_shove');await r.step(0,[['world_move',{destination:'bld_hw_qingdeng'}]]);
    const combat=await r.step(1,[['world_combat',{target:'npc_hw_linsui',intent:'shove'}]]);await r.step(2);
    const caseId=combat[0].result.case;
    const actions=[['world_time',{minutes:10,activity:'休息'}]];
    // If the exchange is lethal, the same explicit wait also handles registered revival.
    const initial=await r.engine.reduce(r.doc,{tool:'world_time',args:actions[0][1],eventId:'preview-rest'});
    if(applyPatches(r.doc,initial.patches).state.player.status==='死亡')actions.push(['world_time',{minutes:30}]);
    await r.step(3,actions);await r.step(4,[['world_move',{destination:'loc_hw_gate'}]]);
    assert.match(r.engine.scene(r.doc,'顾岑办理案件'),/当前交易\/授课：暂停/);
    const confessed=await r.step(5,[['world_law',{operation:'confess',case:caseId,authority:'npc_hw_gucen'}]]);
    assert.equal(confessed[0].result.evidenceScore,2);
    await r.step(6,[['world_law',{operation:'arrest',case:caseId,authority:'npc_hw_gucen'}]]);
    const before=structuredClone(r.doc);
    await assert.rejects(r.engine.reduce(r.doc,{tool:'world_move',args:{destination:'loc_hw'},eventId:'escape'}),/羁押/);assert.deepEqual(r.doc,before);
    await r.step(7,[['world_law',{operation:'hear',case:caseId,authority:'npc_hw_chenbai'}]]);await r.step(8);
    assert.equal(r.doc.state.records[caseId].status,'已裁定');
});

test('委托输入明确分两轮，发布托管后才另行承接，原公开断言保留',async()=>{
    const r=await replay('npc_quest_social');await r.step(0,[['world_move',{destination:'bld_hw_qingdeng'}]]);
    assert.match(r.script.turns[1].input,/本轮只发布/);
    const published=await r.step(1,[['world_quest',{operation:'publish',publisher:'npc_hw_linsui',personal:true,grade:'D',reward:20,content:'买十份燕麦交给林穗',objective:{type:'deliver',item:'item_oats',quantity:10,location:'bld_hw_qingdeng'}}]]);
    const quest=published[0].result.quest;
    assert.equal(r.doc.state.quests[quest].status,'公开');assert.equal(r.doc.state.quests[quest].escrow,20);
    await r.step(2,[['world_quest',{operation:'accept',quest}]]);assert.equal(r.doc.state.quests[quest].status,'进行中');
});

test('旧失败对象保留21条账本失败；新增参数机会暴露16分钟及错司法操作',async()=>{
    const ids=['npc_courier','npc_home_visit','npc_private','npc_quest_social','npc_shove'];
    const originals=original.results.filter(row=>ids.includes(row.id));
    const failed=originals.flatMap(row=>row.turns.flatMap(turn=>turn.assertions.filter(a=>!a.pass)));
    assert.equal(failed.length,21);
    const home=await scenario('npc_home_visit'),measured=originals.find(row=>row.id===home.id);
    const wait=toolSelectionMetrics([{id:home.id,turns:measured.turns.filter(t=>t.index===5)}],[home]);
    assert.equal(wait.parameterOpportunities,1);assert.equal(wait.parameterWrong,1);assert.equal(wait.rows[0].parameterErrors[0].actualArgs.minutes,16);
    const shove=await scenario('npc_shove'),oldShove=originals.find(row=>row.id===shove.id);
    const law=toolSelectionMetrics([{id:shove.id,turns:oldShove.turns.filter(t=>t.index===6)}],[shove]);
    assert.equal(law.wrong,1);assert.equal(law.missed,1);
    const wrongOperation={...oldShove.turns[6],calls:[{tool:'world_law',args:{operation:'confess'}}]};
    assert.equal(toolSelectionMetrics([{id:shove.id,turns:[wrongOperation]}],[shove]).parameterWrong,1);
    const privateScript=await scenario('npc_private'),oldPrivate=originals.find(row=>row.id===privateScript.id).turns[2];
    assert.equal(evaluateAssertions(privateScript.turns[2].assertions,{before:{},after:{},calls:oldPrivate.calls,reply:''}).find(a=>a.kind==='calls').pass,false);
});

test('静态提示及工具定义估算保留12000硬上限，本卡不超过11800 token',async()=>{
    const bundle=await loadPromptBundle();assert.equal(bundle.budget.limit,12000);assert.ok(bundle.budget.estimatedTokens<=11800,JSON.stringify(bundle.budget));
});
