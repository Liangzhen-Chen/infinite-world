import fs from 'node:fs/promises';
import {DeepSeekClient}from'./deepseek-client.mjs';
import {parseTurn}from'../extension/turn.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {loadWorld}from'./load-world.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
const client=new DeepSeekClient({budgetYuan:1}),engine=new WorldEngine(await loadWorld());
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const tools=[{type:'function',function:{name:'world_turn',description:'提交本回合实际时间，普通聊天10分钟，地点不变。',parameters:{type:'object',properties:{startMinute:{type:'integer'},minutes:{type:'integer'},location:{type:'string'},present:{type:'array',items:{type:'string'}}},required:['startMinute','minutes','location','present'],additionalProperties:false}}}];
const cases=['我向林穗打听今天桥头有没有赶集。','我问林穗，住一周还是三十五铜吗？','我仔细看看窗边摆着什么。','我和林穗聊聊雨天的生意。','我问林穗，旧磨坊今天开不开。'];
const samples=[];
for(const protocol of ['tail','tool'])for(let i=0;i<cases.length;i++){
    const document=engine.initialFromLegacy({state:seed.state,memories:seed.memories},`protocol-${i}`);
    const guide=protocol==='tail'?'末尾必须附且只附一次：<回合 时长="10分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>。':'本回合必须且仅调用一次 world_turn，起始分钟540、时长10、地点bld_hw_qingdeng、在场npc_hw_linsui；调用成功后给出正文，不能再次调用。';
    const messages=[{role:'system',content:`你是中文剑与魔法游戏主持人。普通对话只描述玩家能见闻的场景，不能替玩家行动。林穗是河湾青灯酒馆老板，务实干脆，客房6铜一晚、35铜一周。现在9点，春季下雨。未知的事情不编造确定事实。回复80到160字。${guide}`},{role:'user',content:cases[i]}];
    const response=await client.generate({messages,...(protocol==='tool'?{tools}:{}),max_tokens:500,temperature:0.8},`turn-${protocol}-${i}`);
    const message=response.choices?.[0]?.message;let compliant=false,error=null,reply=message?.content??'',elapsed=0;
    try{
        if(protocol==='tail'){
            const parsed=parseTurn(reply,{location:'bld_hw_qingdeng',startMinute:540});
            const outcome=await engine.reduce(document,{tool:'world_turn',eventId:'turn',args:parsed.args});
            elapsed=applyPatches(document,outcome.patches).state.minute-540;compliant=parsed.valid&&elapsed===10;
        }else{
            const calls=message?.tool_calls??[];
            if(calls.length===1&&calls[0].function.name==='world_turn'){
                const outcome=await engine.reduce(document,{tool:'world_turn',eventId:'turn',args:JSON.parse(calls[0].function.arguments)});
                elapsed=applyPatches(document,outcome.patches).state.minute-540;
                messages.push(message,{role:'tool',tool_call_id:calls[0].id,content:JSON.stringify(outcome.result)});
                const final=await client.generate({messages,tools,max_tokens:500,temperature:0.8},`turn-tool-final-${i}`);
                reply=final.choices?.[0]?.message?.content??'';compliant=elapsed===10&&Boolean(reply)&&!(final.choices?.[0]?.message?.tool_calls?.length);
            }
        }
    }catch(e){error=e.message;}
    samples.push({protocol,input:cases[i],compliant,elapsed,error,reply,measurement:response.measurement});
    console.log(`${protocol} ${i+1}/${cases.length}: ${compliant?'合规':'不合规'}`);
}
const totals=Object.fromEntries(['tail','tool'].map(protocol=>{const selected=samples.filter(row=>row.protocol===protocol);return [protocol,{passed:selected.filter(row=>row.compliant).length,total:selected.length,rate:selected.filter(row=>row.compliant).length/selected.length}];}));
const selected=totals.tail.rate>=totals.tool.rate?'tail':'tool';
const report={date:'2026-10-10',scope:'仅比较普通对话回合协议，小样本不能替代完整场景验收',totals,selected,costUpperYuan:client.spent,samples};
await fs.writeFile('docs/测试报告/阶段1回合协议实验.json',JSON.stringify(report,null,2));console.log(JSON.stringify({totals,selected,costUpperYuan:client.spent}));
