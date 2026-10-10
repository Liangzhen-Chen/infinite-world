import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {DeepSeekClient}from'./deepseek-client.mjs';
import {toolDefinitions}from'./tool-definitions.mjs';
import {loadWorld}from'./load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {parseTurn}from'../extension/turn.mjs';
if(!process.env.DEEPSEEK_API_KEY)throw new Error('未执行：DEEPSEEK_API_KEY 环境变量未配置，不能读取酒馆密钥文件');
if(!process.argv.includes('--quick'))throw new Error('当前运行器仅支持阶段1快速场景，完整11.3/11.4验收尚未实现');
const engine=new WorldEngine(await loadWorld()),client=new DeepSeekClient({budgetYuan:60}),tools=await toolDefinitions();
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const scenarios=[
    {id:'L1',input:'我数出六枚铜币交给林穗，住一晚。',assert:c=>{assert.equal(c.state.player.coins,174);assert.ok(Object.values(c.state.records).some(r=>r.category==='contract'));}},
    {id:'G1',input:'我对旧木杖施放已经学会的照明术。',assert:c=>assert.equal(c.state.player.mp,9)},
    {id:'T1',input:'我问林穗，今天雨是不是一直没停。',assert:c=>assert.ok(c.state.minute-540>=5&&c.state.minute-540<=20)},
    {id:'F8',input:'（场外）我现在有多少铜币？',assert:c=>{assert.equal(c.state.minute,540);assert.equal(c.state.player.coins,180);}},
];
const repeatOption=process.argv.indexOf('--repeat');
const repetitions=repeatOption<0?1:Number(process.argv[repeatOption+1]);
if(!Number.isInteger(repetitions)||repetitions<1||repetitions>10)throw new Error('快速场景重复次数必须为1–10');
const results=[];
for(const scenario of scenarios.flatMap(scenario=>Array.from({length:repetitions},(_,attempt)=>({...scenario,attempt:attempt+1})))){
    let document=engine.initialFromLegacy({state:seed.state,memories:seed.memories},`quick-${scenario.id}`),counter=0,reply='',error=null;
    const events=[];
    const messages=[{role:'system',content:`你是中文游戏主持人。所有财物变化必须先调用工具成功后叙述。只回应本次意图，不替玩家安排下一步。普通回复末尾附<回合 时长="10分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>，时长是整回合总耗时，包括工具已推进的时间。场外问题不写工具或尾注，不推进时间。林穗愿意出租普通客房，一晚6铜，一周35铜。施法只消耗现有照明术。当前场景：\n${engine.scene(document,scenario.input)}`},{role:'user',content:scenario.input}];
    try{
        for(let recursion=0;recursion<8;recursion++){
            const response=await client.generate({messages,tools,max_tokens:900,temperature:0.8},`${scenario.id}-${recursion}`),message=response.choices?.[0]?.message;
            if(!message)throw new Error('模型没有返回消息');messages.push(message);
            if(!message.tool_calls?.length){reply=message.content??'';break;}
            for(const call of message.tool_calls){
                const args=JSON.parse(call.function.arguments);let result;
                if(call.function.name==='world_read')result=args.section?document.state[args.section]:{player:document.state.player,location:document.state.location};
                else if(call.function.name==='world_search')result={results:[]};
                else if(scenario.id==='F8')result={ok:false,error:'场外提问不能写入状态'};
                else{
                    const input={tool:call.function.name,args,eventId:`quick_${scenario.id}_${counter++}`};
                    try{const output=await engine.reduce(document,input);document=applyPatches(document,output.patches);result=output.result;events.push({input,result});}
                    catch(e){result={ok:false,error:e.message};}
                }
                messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
            }
        }
        if(!reply)throw new Error('工具递归超过上限或未返回正文');
        if(scenario.id!=='F8'){
            const parsed=parseTurn(reply,{location:document.state.location,startMinute:540});
            const output=await engine.reduce(document,{tool:'world_turn',args:parsed.args,eventId:`finish_${scenario.id}`});document=applyPatches(document,output.patches);
        }
        scenario.assert(document);
    }catch(e){error=e.message;}
    results.push({id:scenario.id,attempt:scenario.attempt,input:scenario.input,pass:!error,error,reply,events,player:document.state.player,minute:document.state.minute,...(error?{failedDialogue:messages}:{})});
    console.log(`${scenario.id} 第${scenario.attempt}次: ${error?'失败 '+error:'通过'}`);
}
const report={date:'2026-10-10',scope:`阶段1四个快速场景，各跑${repetitions}次；不代表完整11.3/11.4验收`,pass:results.every(r=>r.pass),costUpperYuan:client.spent,results};
await fs.writeFile(`docs/测试报告/快速场景-${Date.now()}.json`,JSON.stringify(report,null,2));
await fs.writeFile('docs/测试报告/阶段1快速场景.json',JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
