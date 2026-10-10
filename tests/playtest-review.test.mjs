import test from'node:test';
import assert from'node:assert/strict';
import {reviewPlaytest}from'../tools/playtest-review.mjs';
const turns=Array.from({length:3},(_,index)=>({index,input:'付款',reply:'已经付清。',calls:[],assertions:[]}));
const scores={truth:50,agency:80,language:90,continuity:70};
test('分段评分核对引用，任何截断不生成整场分数；不会用零分替代未知',async()=>{
    let calls=0;
    const client={async generate(body){
        assert.equal(body.thinking.type,'enabled');assert.ok(JSON.parse(body.messages[1].content).turns.length<=2);
        if(calls++)return{choices:[{finish_reason:'length',message:{content:''}}]};
        return{choices:[{finish_reason:'stop',message:{content:JSON.stringify({scores,findings:[{turn:0,criterion:'truth',quote:'已经付清',reason:'未见交易记录'}]})}}]};
    }};
    const report=await reviewPlaytest(client,{id:'sample',attempt:1,turns},{});
    assert.equal(report.complete,false);assert.equal(report.parts.length,2);assert.equal(report.scores,undefined);assert.match(report.parts[1].error,/length/);
    const bad=await reviewPlaytest({async generate(){return{choices:[{finish_reason:'stop',message:{content:JSON.stringify({scores,findings:[{turn:0,criterion:'truth',quote:'编造引文',reason:'x'}]})}}]};}},{id:'bad',turns:turns.slice(0,1)},{});
    assert.equal(bad.complete,false);assert.match(bad.parts[0].error,/真实原句/);
    assert.equal(bad.parts[0].invalidReview.findings[0].quote,'编造引文');
});

test('跨段回顾仍提供早先付款证据，避免把窗口外真实事件判为编造',async()=>{
    const history=Array.from({length:5},(_,index)=>({...turns[0],index,calls:index===0?[{tool:'world_trade',args:{seller:'林穗',service:'住宿'},result:{ok:true,cost:6}}]:[]}));
    let calls=0;
    const report=await reviewPlaytest({async generate(body){
        const input=JSON.parse(body.messages[1].content);
        if(calls++===2){assert.equal(input.turns[0].turn,4);assert.equal(input.previous[0].calls[0].result.cost,6);}
        return{choices:[{finish_reason:'stop',message:{content:JSON.stringify({scores,findings:[]})}}]};
    }},{id:'historical-payment',turns:history},{});
    assert.equal(calls,3);assert.equal(report.complete,true);
});
