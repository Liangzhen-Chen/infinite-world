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
import {obligationRows}from'../server-plugin/obligation-state.mjs';
import {subjectiveView}from'../server-plugin/subjective-view.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const original=JSON.parse(await fs.readFile(new URL('../docs/测试报告/M2-recheck/真实试玩.json',import.meta.url),'utf8'));
const recheck=JSON.parse(await fs.readFile(new URL('../docs/测试报告/M2-recheck-003/真实试玩.json',import.meta.url),'utf8'));
const scenario=async id=>{
    const script=JSON.parse(await fs.readFile(new URL(`./playtests/${id}.json`,import.meta.url),'utf8'));
    // A3 causal: trust has one live value in the relation ledger. Keep the
    // original trust bounds, adapting only the legacy assertion's read path.
    for(const turn of script.turns)for(const rule of turn.assertions??[])
        if(/^state\.npcs\.[^.]+\.trust$/.test(rule.path??''))rule.path=rule.path.replace(/\.trust$/,'.relationships.player.trust');
    return script;
};
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
    ]);
    assert.equal(r.doc.state.location,'bld_hw_qingdeng');
    assert.deepEqual(r.script.turns[2].expectedTools,['world_promise']);
    await r.step(3,[['world_time',{minutes:1}]]);
    await r.step(4,[['world_move',{destination:'bld_hw_council'}]]);
    const before=structuredClone(r.doc.state),total=state=>state.player.coins+state.npcs.npc_hw_linsui.coins;
    await r.step(5,[['world_time',{until:{dayOffset:0,hour:11,minute:0}}]]);
    assert.equal(total(r.doc.state),total(before));
    assert.equal(qty(r.doc.state.inventory.item_bread)+qty(r.doc.state.npcs.npc_hw_linsui.inventory.item_bread),
        qty(before.inventory.item_bread)+qty(before.npcs.npc_hw_linsui.inventory.item_bread));
    assert.equal(r.turns.filter(t=>t.calls.some(c=>c.tool==='world_move'&&c.args.destination==='bld_hw_council')).length,1);
    await r.step(6);await r.step(7,[['world_time',{minutes:5}]]);
    assert.equal(qty(r.doc.state.npcs.npc_hw_linsui.inventory.item_bread),5);
    const measured=toolSelectionMetrics([{id:r.script.id,turns:r.turns}],[r.script]);
    assert.equal(measured.zeroSelectionErrors,true);assert.ok(measured.parameterOpportunities>=3);assert.equal(measured.targetOpportunities,1);
});

test('原home_visit顺序入宅→完整60分钟等待至许可过期→离宅→旧许可拒绝',async()=>{
    const r=await replay('npc_home_visit');
    await r.step(0,[['world_move',{destination:'loc_hw_fields'}],['world_time',{minutes:30}]]);await r.step(1);
    const issued=await r.step(2,[['world_promise',{operation:'grant_access',promisor:'npc_hw_miaozhen',location:'bld_hw_home_15',minutes:60,content:'独自进屋看旧筛架，只看不取物'}]]);
    assert.equal(r.doc.state.location,'loc_hw_fields');
    assert.match(r.script.turns[2].input,/本轮只取得许可.*下一轮再进屋/);
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
    await r.step(2);
    // 15 §15.1.1 与主观视图设计：统一义务账本保存债务，屋外旁观者仍不因此获知。
    const debt=obligationRows(r.doc.state).find(row=>row.debtor==='player'&&row.creditor==='npc_hw_linsui');
    assert.ok(debt,'赊账债务进入统一义务表');assert.equal(debt.creditor,'npc_hw_linsui');
    for(const npc of ['npc_hw_wushuo','npc_hw_chenbai','npc_hw_gucen']){
        const view=subjectiveView(r.engine,r.doc,npc);
        assert.ok(!view.self.obligations.some(row=>row.id===debt.id),`${npc} 对该债务无认知`);
    }
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
    await r.step(3,[['world_move',{destination:'loc_hw_northwood'}]]);
    const beforeArrival=structuredClone(r.doc.state);
    await r.step(4,[['world_move',{destination:'bld_hw_council'}]]);
    assert.match(r.script.turns[4].input,/本轮不购买、不付款.*下一轮再买粮/);
    assert.equal(r.doc.state.player.coins,beforeArrival.player.coins);
    assert.deepEqual(r.doc.state.inventory,beforeArrival.inventory);
    assert.equal(r.doc.state.settlements.loc_hw.food,beforeArrival.settlements.loc_hw.food);
    assert.equal(r.doc.state.settlements.loc_hw.treasury,beforeArrival.settlements.loc_hw.treasury);
    const beforeBuy=structuredClone(r.doc.state),coins=state=>state.player.coins+state.settlements.loc_hw.treasury;
    const grain=state=>qty(state.inventory.item_oats)+state.settlements.loc_hw.food;
    await r.step(5,[['world_field',{operation:'farm_buy',settlement:'loc_hw',quantity:10}]]);
    assert.equal(coins(r.doc.state),coins(beforeBuy));assert.equal(grain(r.doc.state),grain(beforeBuy));
    assert.deepEqual(r.script.turns[5].expectedTools,['world_field']);
    await r.step(6,[['world_move',{destination:'bld_hw_qingdeng'}]]);
    await r.step(7,[['world_quest',{operation:'complete',quest}]]);
    await r.step(8);await r.step(9);await r.step(10);
    const measured=toolSelectionMetrics([{id:r.script.id,turns:r.turns}],[r.script]);
    assert.equal(measured.zeroSelectionErrors,true);
});

test('带路先答复留在原地，出发轮才登记同行并移动；到达后履约解队',async()=>{
    const r=await replay('guide');await r.step(0,[['world_move',{destination:'loc_hw_northwood'}]]);
    const before=structuredClone(r.doc.state);await r.step(1);
    assert.match(r.script.turns[1].input,/本轮只等.*不登记同行、不出发/);
    assert.deepEqual(r.doc.state,before);
    await r.step(2,[
        ['world_promise',{type:'带路',promisor:'npc_hw_wushuo',destination:'site_beilin_tower',content:'带路到废观测塔'}],
        ['world_move',{destination:'site_beilin_tower'}],
    ]);
    assert.deepEqual(r.doc.state.player.companions,[]);
    await r.step(3);await r.step(4);
    await r.step(5,[['world_move',{destination:'loc_hw'}]]);
    await r.step(6,[['world_move',{destination:'loc_bs'}]]);await r.step(7);
    assert.equal(toolSelectionMetrics([{id:r.script.id,turns:r.turns}],[r.script]).zeroSelectionErrors,true);
});

test('第三轮买粮提前执行的四条失败仍保留，输入修正不冒充真实复验',()=>{
    const turns=recheck.results.find(row=>row.id==='npc_quest_social').turns;
    assert.ok(turns[4].calls.some(call=>call.tool==='world_field'&&call.args.operation==='farm_buy'));
    const failed=turns[5].assertions.filter(row=>!row.pass);
    assert.equal(failed.length,4);assert.ok(failed.every(row=>row.actual===0));
    assert.deepEqual(failed.map(({kind,path,tool})=>path??tool),[
        'state.player.coins','state.settlements.loc_hw.treasury','state.settlements.loc_hw.food','world_field']);
});

test('粮仓公开调用断言核对原操作及参数，拒绝失败、错数量和未知操作',async()=>{
    const s=await scenario('npc_quest_social'),rule=s.turns[5].assertions.find(row=>row.kind==='calls');
    const call={tool:'world_field',args:{operation:'farm_buy',settlement:'loc_hw',quantity:10},result:{ok:true}};
    const pass=value=>evaluateAssertions([rule],{before:{},after:{},calls:[value],reply:''})[0].pass;
    assert.equal(pass(call),true);
    assert.equal(pass({...call,result:{ok:false}}),false);
    assert.equal(pass({...call,args:{...call.args,quantity:9}}),false);
    assert.equal(pass({...call,args:{...call.args,operation:'farm_donate'}}),false);
    assert.equal(pass({...call,args:{...call.args,operation:'unknown'}}),false);
    const measure=value=>toolSelectionMetrics([{id:s.id,turns:[{index:5,input:s.turns[5].input,calls:[value],assertions:[]}]}],[s]);
    assert.equal(measure(call).zeroSelectionErrors,true);
    assert.equal(measure({...call,args:{...call.args,quantity:9}}).parameterWrong,1);
    assert.equal(measure({...call,args:{...call.args,operation:'unknown'}}).unroutable,1);
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

test('静态提示及工具定义估算遵守统一硬上限',async()=>{
    const bundle=await loadPromptBundle();assert.ok(bundle.budget.estimatedTokens<=bundle.budget.limit,JSON.stringify(bundle.budget));
});
