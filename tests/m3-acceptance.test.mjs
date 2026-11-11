import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createPlaytestServer,preparePlaytestSession,runPlaytest} from '../tools/playtest-runner.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';
import {evaluateAssertions} from '../tools/playtest-assertions.mjs';
import {summarizeMemoryAcceptance,playtestAcceptance} from '../tools/playtest-metrics.mjs';

const load=id=>fs.readFile(new URL(`./playtests/${id}.json`,import.meta.url),'utf8').then(JSON.parse);
const memory=await load('m3_memory'),reconcile=await load('reconcile'),upgrade=await load('world_upgrade');

// Scripted clients exercise the real HTTP/storage paths, never call a provider,
// and deliberately provide no model measurements or narrative review scores.
function scriptedClient(scenario,api,session){
    let n=0;
    return {async generate({messages},label){
        const index=Number(label.slice(`${scenario.id}-1-`.length).split('-')[0]),step=scenario.turns[index];
        const start=messages.findLastIndex(m=>m.role==='user');
        const receipts=messages.slice(start+1).filter(m=>m.role==='tool');
        let tool,args;
        if(!receipts.length){
            const call=step.assertions.find(a=>a.kind==='calls');
            if(call){tool=call.tool;args=call.args;}
            else if(step.expectedTools?.includes('world_move')){tool='world_move';args={destination:step.input.includes('村口')?'河湾村':'青灯酒馆'};}
            else if(step.expectedTools?.includes('world_trade')){
                tool='world_trade';args=step.input.includes('面包')?{seller:'林穗',item:'面包',quantity:step.input.includes('两个')?2:1}:{seller:'林穗',service:'住宿',days:1};
            }
        }
        if(tool)return {choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:`script-${n++}`,type:'function',function:{name:tool,arguments:JSON.stringify(args)}}]}}]};
        const view=await api('read',{campaignId:session.campaignId});
        let content=scenario.id==='m3_memory'?'青灯酒馆。实际180铜。公共仓库和旧磨坊归村民共同体，陈柏保管钥匙。': '已核对。';
        for(const row of receipts){const result=JSON.parse(row.content);if(result.results)content+='\n'+result.results.map(hit=>hit.text).join('\n');}
        if(!step.input.startsWith('（场外）'))content+=`<回合 额外="0分" 地点="${view.document.state.location}" 在场=""/>`;
        return {choices:[{finish_reason:'stop',message:{content}}]};
    }};
}

async function offlineRun(t,scenario){
    const server=await createPlaytestServer({consistencyEnabled:false});t.after(()=>server.close());
    const session=await preparePlaytestSession({scenario,api:server.api,directory:server.directory})??{campaignId:(await server.api('create',{character:{name:'试玩者'}})).reference.campaignId};
    const result=await runPlaytest({scenario,api:server.api,client:scriptedClient(scenario,server.api,session),session,
        bundle:await loadPromptBundle(),countTokens:()=>100,historyWindow:{contextTokens:10000}});
    assert.equal(result.pass,true,JSON.stringify(result.turns.filter(turn=>turn.errors.length||turn.assertions.some(a=>!a.pass)).map(turn=>({index:turn.index,errors:turn.errors,failed:turn.assertions.filter(a=>!a.pass)}))));
    return {server,session,result};
}

test('M2–M5 正常HTTP：四种问法命中同一已登记事件，摘要遗漏与裁历史不丢失，固定事实每轮可用',async t=>{
    const {server,session,result}=await offlineRun(t,memory);
    assert.ok(!result.turns[0].visible.includes('雨檐蓝页'),'首轮概括确实遗漏笔记名');
    const summary=result.turns[2].sceneBefore.split('【历史摘要，低于当前状态与原始事件；不代表人物知情】')[1]?.split(/【[^】]+】/)[0]??'';
    assert.ok(!summary.includes('雨檐蓝页'),'实际历史摘要未包含目标事实');
    const hits=result.turns.flatMap(turn=>turn.assertions.filter(a=>a.kind==='searchHit'&&a.id==='memory_npc_hw_linsui::账簿厨房'));
    assert.equal(hits.length,8);assert.ok(hits.every(a=>a.pass));
    const exported=await server.api('export',{campaignId:session.campaignId});
    assert.equal(exported.events.filter(e=>e.input?.tool==='world_remember'&&e.input.args.key==='账簿厨房').length,1);
    assert.equal(result.turns.filter(turn=>turn.assertions.some(a=>a.kind==='historyTrimmed')).length,4);
    assert.ok(result.turns.every(turn=>turn.assertions.some(a=>a.kind==='sceneContains'&&a.pass)));
    assert.ok(result.session.chat.some(m=>m.extra?.fields_anchor==='m3-memory-original-query'),'原聊天保留被裁掉的请求历史');
    assert.equal(result.finalDocument.state.player.coins,180);
    const summaryMetrics=summarizeMemoryAcceptance([result],[memory]);
    assert.deepEqual(summaryMetrics.rows.filter(r=>r.pass).map(r=>r.id),['M2','M3','M4','M5']);
    assert.deepEqual(summaryMetrics.unmeasured,['M6','M7','M8','M9']);
    assert.equal(summaryMetrics.realModelMeasured,false);assert.equal(summaryMetrics.thresholdReached,false);
});

test('检索结果不混入系统用语，拒绝仅调用搜索但未命中或回复遗漏事实的伪通过',async t=>{
    const server=await createPlaytestServer({consistencyEnabled:false});t.after(()=>server.close());
    const session=await preparePlaytestSession({scenario:memory,api:server.api,directory:server.directory});
    const noise='【系统】以账本为准，world_trade 老板娘账簿厨房，事件编号 fake。';
    await server.api('sync-index',{...session,start:0,total:1,messages:[{is_user:false,is_system:true,mes:noise}]});
    for(const step of memory.turns.filter(s=>s.requirements.includes('M3'))){
        const rule=step.assertions.find(a=>a.kind==='searchHit'),result=await server.api('search',{...session,query:rule.query});
        assert.equal(evaluateAssertions([rule],{calls:[{tool:'world_search',args:{query:rule.query},result}],reply:''})[0].pass,true);
        for(const bad of [{results:[]},{results:[{id:rule.id,text:rule.text},{id:'noise',text:noise}]}]){
            assert.equal(evaluateAssertions([rule],{calls:[{tool:'world_search',args:{query:rule.query},result:bad}],reply:''})[0].pass,false);
        }
        assert.equal(evaluateAssertions(step.assertions.filter(a=>a.kind==='replyContains'),{calls:[],reply:'已经检索。'})[0].pass,false);
    }
});

test('M6–M8 正常HTTP：编辑改量、重生成单次记账、删除回滚及刷新持久一致',async t=>{
    const {result}=await offlineRun(t,reconcile);
    assert.equal(result.finalDocument.state.player.coins,174);
    assert.equal(result.finalDocument.state.inventory.item_bread?.quantity??0,0);
    const report=summarizeMemoryAcceptance([result],[reconcile]);
    assert.ok(report.rows.filter(r=>['M6','M7','M8'].includes(r.id)).every(r=>r.pass));
    assert.equal(report.thresholdReached,false);
});

test('M9 正常HTTP旧世界导入后自动升级，关系、钱物及记忆保留并可继续行动',async t=>{
    const {server,session,result}=await offlineRun(t,upgrade);
    // 新值 172：180−住宿6−面包账单1−面包账单1。第一笔：单价 2×供需比(25/45=0.555556，已离开下限.5)×关系 .99895=1.10994，零售，截断=1（旧：2×.5×.99895 截断=0）；
    // 第二笔：供需比 25/44=0.568182，深度 1+.2/45，单价 2×0.568182×1.004444×.99895=1.14022，截断=1。180−6−1−1=172。
    // 与 tests/playtests/world_upgrade.json 记录的 173（第一笔后）/172（第二笔后）一致（该文件按同一设计变化重推，提交 ad59698f、bb70871d，且同一次运行内通过）。
    // 对应设计变化：面包饱腹改推导 + 卖家份额分摊使供需比离开下限（PLAN.md:584、591③、316③、563②）；李白 11-11 (a)（PLAN.md:540）。
    // 证据：F:/dnd/docs/审查记录/市场价格-探针输出-mkt-5.txt，复算 市场价格-独立复算-A.md、-B.md（m3-acceptance-M9）。断言仍为精确相等。
    assert.equal(result.finalDocument.state.player.coins,172);
    assert.equal(result.finalDocument.state.inventory.item_bread.quantity,2);
    const view=await server.api('read',session),anchor='m9-followup-search';
    const begun=await server.api('review/begin',{...session,anchor,playerText:'（场外）检索更新前的住宿。',expectedSequence:view.reference.sequence,captureSearch:true});
    const searched=await server.api('search',{...session,anchor,token:begun.token,expectedSequence:view.reference.sequence,query:'青灯酒馆 付六铜住宿 面包'});
    assert.ok(searched.results.some(hit=>hit.id==='memory_player::旧版住宿'));
    const report=summarizeMemoryAcceptance([result],[upgrade]);assert.equal(report.rows.find(r=>r.id==='M9').pass,true);
    assert.equal(report.longMemory.measured,false);
});

test('缺会话不得把M9或受控记忆改成普通新档；未测、缺断言和重复attempt不算通过',async()=>{
    const api=()=>assert.fail('必需会话缺失时不能创建新档');
    for(const scenario of [memory,upgrade])await assert.rejects(runPlaytest({scenario,api}),/必须先准备/);
    const empty=summarizeMemoryAcceptance([], [memory,reconcile,upgrade]);
    assert.equal(empty.measured,0);assert.equal(empty.thresholdReached,false);assert.equal(empty.longMemory.pass,false);
    const result={id:memory.id,attempt:1,turns:memory.turns.map((step,index)=>({index,input:step.input,errors:[],assertions:step.assertions.map(a=>({...a,pass:true,actual:null}))}))};
    assert.equal(summarizeMemoryAcceptance([result,result],[memory]).measured,0);
    const omitted=structuredClone(result);omitted.turns[3].assertions=[];
    assert.equal(summarizeMemoryAcceptance([omitted],[memory]).rows.find(r=>r.id==='M3').measured,false);
    const failed=structuredClone(result);failed.turns[3].assertions[0].pass=false;
    assert.equal(summarizeMemoryAcceptance([failed],[memory]).rows.find(r=>r.id==='M3').pass,false);
    // Existing M2 gate and general release gate retain their meanings.
    assert.equal(playtestAcceptance({milestone:'M2',complete:true,m2:{thresholdReached:true},toolSelection:{complete:true,hasSelectedAction:true}}),true);
    assert.equal(playtestAcceptance({milestone:'M2',complete:true,m2:{thresholdReached:false},m3:{thresholdReached:true},toolSelection:{complete:true,hasSelectedAction:true}}),false);
    assert.equal(playtestAcceptance({milestone:'release-ledger',releaseLedgerPass:false,m3:{thresholdReached:true}}),false);
});
