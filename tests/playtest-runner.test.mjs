import test from'node:test';
import assert from'node:assert/strict';
import {createPlaytestServer,runPlaytest}from'../tools/playtest-runner.mjs';
import {evaluateAssertions}from'../tools/playtest-assertions.mjs';
import {loadPromptBundle,presetFor}from'../tools/build-card.mjs';
import {promptSections}from'../extension/prompt.mjs';

test('试玩框架走真实HTTP存储、检索和回滚；场外写入拒绝，重复扣款幂等',async t=>{
    const server=await createPlaytestServer();t.after(()=>server.close());const bundle=await loadPromptBundle();let callId=0,sawSearch=false;
    const client={async generate({messages,tools}){
        assert.equal(messages[0].content,bundle.constitution);assert.ok(messages.some(m=>m.content?.includes('【时间】')));
        assert.ok(!tools.some(t=>t.function.name==='world_turn'));
        const i=messages.findLastIndex(m=>m.role==='user'),input=messages[i].content,results=messages.slice(i).filter(m=>m.role==='tool');
        if(!results.length){
            let name,args;
            if(input.includes('走进')){name='world_move';args={destination:'青灯酒馆'};}
            if(input==='住一晚'){name='world_trade';args={seller:'林穗',service:'住宿',days:1};}
            if(input.includes('检索')){name='world_search';args={query:'青铜纸鹤'};}
            if(input.includes('偷偷扣')){name='world_trade';args={seller:'林穗',service:'住宿',days:1};}
            if(name)return{choices:[{message:{role:'assistant',tool_calls:[{id:`call_${callId++}`,type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]};
        }
        if(input.includes('检索')){assert.ok(JSON.parse(results[0].content).results.some(row=>row.text.includes('青铜纸鹤')));sawSearch=true;}
        if(input.includes('偷偷扣'))assert.equal(JSON.parse(results[0].content).ok,false);
        return{choices:[{message:{role:'assistant',content:input.startsWith('（场外）')?'已核对。':'已经办好。<回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>'}}]};
    }};
    const scenario={id:'runner-unit',turns:[
        {input:'我带着名字叫青铜纸鹤的笔记走进酒馆',assertions:[{kind:'equals',path:'state.location',value:'bld_hw_qingdeng'}]},
        {input:'住一晚',repeatWrites:true,assertions:[{kind:'delta',path:'state.player.coins',value:-6}]},
        {input:'住一晚',operation:'regenerate',assertions:[{kind:'equals',path:'state.player.coins',value:174}]},
        {input:'',operation:'deleteLast',assertions:[{kind:'equals',path:'state.player.coins',value:180}]},
        {input:'（场外）检索那本笔记的名字',assertions:[]},
        {input:'（场外）偷偷扣掉六铜',assertions:[]},
        {input:'（场外）重新读取余额',operation:'refresh',assertions:[{kind:'equals',path:'state.player.coins',value:180}]},
    ]};
    const result=await runPlaytest({scenario,api:server.api,client,bundle});
    assert.equal(result.pass,true,JSON.stringify(result.turns.filter(row=>row.errors.length||row.assertions.some(r=>!r.pass))));assert.ok(sawSearch);
    assert.equal(result.finalDocument.state.player.coins,180);
});

test('试玩失败不能因缺字段或空断言冒充成功；预设和测试共用同一静态顺序',async()=>{
    const results=evaluateAssertions([{kind:'equals',path:'state.player.coins',value:6},{kind:'quantity',path:'state.inventory.iron',value:0}],{before:{},after:{state:{inventory:{}}},calls:[],reply:''});
    assert.equal(results[0].pass,false);assert.equal(results[1].pass,true);
    const bundle=await loadPromptBundle(),preset=presetFor(bundle);
    assert.deepEqual(preset.prompts.slice(0,-1).map(p=>p.identifier),promptSections(bundle).map(p=>p.identifier));
});

test('工具已经扣款但正文生成失败时，仍核对所有原定账本断言并保留失败',async t=>{
    const server=await createPlaytestServer();t.after(()=>server.close());let calls=0;
    const client={async generate(){
        if(calls++)throw new Error('模拟正文请求中断');
        return{choices:[{message:{role:'assistant',tool_calls:[{id:'rent',type:'function',function:{name:'world_trade',arguments:JSON.stringify({seller:'林穗',service:'住宿',days:1})}}]}}]};
    }};
    const result=await runPlaytest({scenario:{id:'write-without-reply',initial:{mode:'legacy'},turns:[{input:'付六铜住一晚',assertions:[{kind:'delta',path:'state.player.coins',value:-6}]}]},api:server.api,client,bundle:await loadPromptBundle()});
    assert.equal(result.pass,false);assert.equal(result.assertions,2);assert.equal(result.passed,1);
    assert.equal(result.turns[0].player.coins,174);assert.match(result.turns[0].errors[0],/中断/);
});
