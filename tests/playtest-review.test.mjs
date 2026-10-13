import test from'node:test';
import assert from'node:assert/strict';
import {reviewPlaytest}from'../tools/playtest-review.mjs';
import {readFileSync}from'node:fs';
const turns=Array.from({length:3},(_,index)=>({index,input:'付款',reply:'已经付清。',calls:[],assertions:[]}));
const scores={truth:50,agency:80,language:90,continuity:70};
test('第三轮真实坏引文只修一次，保留60分负评并只引真实visible正文',async()=>{
    const raw=JSON.parse(readFileSync(new URL('../docs/测试报告/M2-recheck-003/真实试玩.json',import.meta.url),'utf8'));
    const result=raw.results.find(r=>r.id==='npc_private'),original=result.review.parts.find(p=>p.start===5);
    const corrected=structuredClone(original.invalidReview);corrected.findings[0].quote=corrected.findings[0].quote.replace('</q>','');
    for(const change of [false,true]){
        let count=0;
        const review=await reviewPlaytest({async generate(body,label){
            const input=JSON.parse(body.messages[1].content),turn=input.turns[0].turn;
            if(turn!==5)return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({scores,findings:[]})}}]};
            count++;
            if(!label.endsWith(':format'))return {choices:[{finish_reason:'stop',message:{content:original.rawReview}}]};
            const correction=JSON.parse(body.messages.at(-1).content);assert.match(correction.instruction,/不重新评分/);
            const value=structuredClone(corrected);if(change)value.scores.language=100;
            return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]};
        }},result,{}, {previousReview:null});
        assert.equal(count,2);const part=review.parts.find(p=>p.start===5);
        assert.equal(part.rawReview,original.rawReview);assert.equal(part.correction.attempts,1);
        if(change){assert.equal(review.complete,false);assert.match(part.error,/不得改变原分数/);}
        else{assert.equal(review.complete,true);assert.equal(part.scores.language,60);assert.equal(part.findings[0].reason,corrected.findings[0].reason);assert.ok(result.turns[5].visible.includes(part.findings[0].quote));}
    }
});

test('评分坏JSON可按原问题修正；无法引用同一问题时保持未完成且不重抽',async()=>{
    const finding={turn:0,criterion:'truth',quote:'已经付清',reason:'未见交易记录'};
    const broken=JSON.stringify({scores,findings:[finding]}).slice(0,-1);
    let count=0;
    const repaired=await reviewPlaytest({async generate(body,label){count++;return {choices:[{finish_reason:'stop',message:{content:label.endsWith(':format')?JSON.stringify({scores,findings:[finding]}):broken}}]};}}, {turns:turns.slice(0,1)},{});
    assert.equal(count,2);assert.equal(repaired.complete,true);assert.deepEqual(repaired.parts[0].scores,scores);
    count=0;
    const missing=await reviewPlaytest({async generate(body,label){count++;return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({scores,findings:label.endsWith(':format')?[]:[{...finding,quote:'正文没有的话'}]})}}]};}}, {turns:turns.slice(0,1)},{});
    assert.equal(count,2);assert.equal(missing.complete,false);assert.match(missing.parts[0].error,/增删问题/);
});
test('分段评分核对引用，任何截断不生成整场分数；不会用零分替代未知',async()=>{
    let calls=0;
    const client={async generate(body){
        assert.equal(body.thinking.type,'enabled');assert.equal(body.max_tokens,12288);assert.equal(JSON.parse(body.messages[1].content).turns.length,1);
        if(calls++)return{choices:[{finish_reason:'length',message:{content:''}}]};
        return{choices:[{finish_reason:'stop',message:{content:JSON.stringify({scores,findings:[{turn:0,criterion:'truth',quote:'已经付清',reason:'未见交易记录'}]})}}]};
    }};
    const report=await reviewPlaytest(client,{id:'sample',attempt:1,turns},{});
    assert.equal(calls,3);assert.equal(report.complete,false);assert.equal(report.parts.length,3);assert.equal(report.scores,undefined);assert.match(report.parts[1].error,/length/);
    assert.equal(report.parts[1].rawReview,'');assert.equal(report.parts[1].finishReason,'length');
    const bad=await reviewPlaytest({async generate(){return{choices:[{finish_reason:'stop',message:{content:JSON.stringify({scores,findings:[{turn:0,criterion:'truth',quote:'编造引文',reason:'x'}]})}}]};}},{id:'bad',turns:turns.slice(0,1)},{});
    assert.equal(bad.complete,false);assert.match(bad.parts[0].error,/真实原句/);
    assert.equal(bad.parts[0].invalidReview.findings[0].quote,'编造引文');
});

test('重复和缺失回合不能生成完整评分',async()=>{
    const client={async generate(){assert.fail('回合缺失时不调用模型');}};
    for(const invalid of [[],[turns[0],turns[0]],[turns[0],turns[2]]])assert.equal((await reviewPlaytest(client,{turns:invalid},{})).complete,false);
});

test('跨段回顾仍提供早先付款证据，避免把窗口外真实事件判为编造',async()=>{
    const history=Array.from({length:5},(_,index)=>({...turns[0],index,sceneBefore:'严辙在场；本人旧事：曾修过车轴',sceneBeforeReply:'阿砚本人近期经历：木楔制成，工坊费2铜',turnResult:{elapsed:5},calls:index===0?[{tool:'world_trade',args:{seller:'林穗',service:'住宿'},result:{ok:true,cost:6}}]:[]}));
    let calls=0;
    const report=await reviewPlaytest({async generate(body){
        const input=JSON.parse(body.messages[1].content);
        assert.match(input.turns[0].sceneBefore,/严辙在场/);assert.match(input.turns[0].sceneBeforeReply,/工坊费2铜/);assert.equal(input.turns[0].turnResult.elapsed,5);
        if(calls++===4){assert.equal(input.turns[0].turn,4);assert.equal(input.previous[0].calls[0].result.cost,6);}
        return{choices:[{finish_reason:'stop',message:{content:JSON.stringify({scores,findings:[]})}}]};
    }},{id:'historical-payment',turns:history},{});
    assert.equal(calls,5);assert.equal(report.complete,true);
});

test('单回合缺响应仍未完成，续跑保留已完成负评及旧两回合评分',async()=>{
    const negative={start:0,count:2,scores:{...scores,truth:0},findings:[{turn:0,criterion:'truth',quote:'已经付清',reason:'未见交易'}]};
    const result={id:'resume',turns,review:{complete:false,parts:[negative,{start:2,count:1,error:'fetch failed'}]}};
    let calls=0;
    const failed=await reviewPlaytest({async generate(body){calls++;assert.equal(JSON.parse(body.messages[1].content).turns[0].turn,2);throw Error('fetch failed');}},result,{});
    assert.equal(calls,1);assert.equal(failed.complete,false);assert.deepEqual(failed.parts[0],negative);assert.equal(failed.scores,undefined);
    const restored=await reviewPlaytest({async generate(){calls++;return{choices:[{finish_reason:'stop',message:{content:JSON.stringify({scores,findings:[]})}}]};}},result,{});
    assert.equal(calls,2);assert.equal(restored.complete,true);assert.equal(restored.scores.truth,50/3);assert.deepEqual(restored.parts[0],negative);
});

test('T64原始length评分仍未完成，已完成7/9盲辨不重抽',async()=>{
    const raw=JSON.parse(readFileSync(new URL('../docs/测试报告/M2-recheck/真实试玩.json',import.meta.url),'utf8'));
    const shove=raw.results.find(r=>r.id==='npc_shove'),truncated=shove.review.parts.find(p=>p.finishReason==='length');
    assert.equal(truncated.start,4);let calls=0;
    const reviewed=await reviewPlaytest({async generate(body){
        calls++;const input=JSON.parse(body.messages[1].content);assert.equal(input.turns.length,1);assert.equal(body.max_tokens,12288);
        if(input.turns[0].turn===4)return{choices:[{finish_reason:truncated.finishReason,message:{content:truncated.rawReview}}]};
        return{choices:[{finish_reason:'stop',message:{content:JSON.stringify({scores,findings:[]})}}]};
    }},shove,{}, {previousReview:null});
    assert.equal(calls,9);assert.equal(reviewed.complete,false);assert.equal(reviewed.scores,undefined);assert.equal(reviewed.parts[4].finishReason,'length');
    const voices=raw.results.find(r=>r.id==='npc_voices');
    const preserved=await reviewPlaytest({async generate(){assert.fail('已完成负评不能重抽');}},voices,{});
    assert.equal(preserved.complete,true);assert.equal(preserved.voiceBlind.pass,false);assert.equal(preserved.voiceBlind.correct,7);assert.equal(preserved.voiceBlind.total,9);
});
