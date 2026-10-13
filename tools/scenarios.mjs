import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {DeepSeekClient}from'./deepseek-client.mjs';
import {toolDefinitions}from'./tool-definitions.mjs';
import {resolveToolCall,modelToolCall}from'../extension/tools.mjs';
import {loadWorld}from'./load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {parseTurn,toolResultWithClock,lookupToolResult}from'../extension/turn.mjs';
import {catalogDefinition}from'../server-plugin/catalog.mjs';
import {readStateSection}from'../extension/state-read.mjs';
import {ruleScenarios}from'./quick-rule-scenarios.mjs';
import {environmentScenarios}from'./quick-environment-scenarios.mjs';
import {petScenarios}from'./quick-pet-scenarios.mjs';
import {lawScenarios}from'./quick-law-scenarios.mjs';
import {weatherScenarios}from'./quick-weather-scenarios.mjs';
import {agricultureScenarios}from'./quick-agriculture-scenarios.mjs';
import {wildlifeScenarios}from'./quick-wildlife-scenarios.mjs';
import {bossScenarios}from'./quick-boss-scenarios.mjs';
import {migrationScenarios}from'./quick-migration-scenarios.mjs';
import {farmPestsScenarios}from'./quick-farm-pests-scenarios.mjs';
if(!process.env.DEEPSEEK_API_KEY)throw new Error('未执行：DEEPSEEK_API_KEY 环境变量未配置，不能读取酒馆密钥文件');
if(!process.argv.includes('--quick'))throw new Error('当前运行器仅支持开发快速场景，完整11.3/11.4验收尚未实现');
const engine=new WorldEngine(await loadWorld()),client=new DeepSeekClient({budgetYuan:30}),tools=await toolDefinitions();
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const scenarios=[
    {id:'L1',input:'我数出六枚铜币交给林穗，住一晚。',assert:c=>{assert.equal(c.state.player.coins,174);assert.ok(Object.values(c.state.records).some(r=>r.category==='contract'));}},
    {id:'G1',input:'我对旧木杖施放已经学会的照明术。',assert:c=>assert.equal(c.state.player.mp,9)},
    {id:'T1',input:'我问林穗，今天雨是不是一直没停。',assert:c=>assert.ok(c.state.minute-540>=5&&c.state.minute-540<=20)},
    {id:'F8',input:'（场外）我现在有多少铜币？',assert:c=>{assert.equal(c.state.minute,540);assert.equal(c.state.player.coins,180);}},
    {id:'LearningTeacher',input:'我交两枚铜币给陆青，请他教我基础识字。',
        setup:c=>{c.state.location='bld_hw_school';},
        context:'此刻在河湾学堂，陆青可教skill_literacy，学费2铜、一次60分钟。用world_learn实际执行，不能先以world_trade重复付费。',
        assert:c=>{assert.equal(c.state.player.coins,178);assert.equal(c.state.npcs.npc_hw_luqing.coins,202);assert.equal(c.state.minute,600);
            assert.ok(Object.values(c.state.learning).some(record=>record.entity==='skill_literacy'&&record.source.id==='npc_hw_luqing'&&record.cost===2));}},
    {id:'NpcNightTeacher',input:'我想现在请陆青教识字。如果他已经休息就算了，不等到明天，也不先交钱。',
        setup:c=>{c.state.minute=1380;c.state.location='bld_hw_school';c.state.npcs.npc_hw_luqing.location='bld_hw_school';},
        context:'授课是否开放以人物实际作息及工具回执为准。玩家没有同意等待到次日。',
        assert:(c,{initial,reply})=>{assert.equal(c.state.player.coins,initial.state.player.coins);assert.deepEqual(c.state.learning,initial.state.learning);
            assert.ok(c.state.minute>=1380&&c.state.minute<=1400,'拒绝授课不应偷偷等到明天或花一节课时间');assert.match(reply,/休息|睡|明天|授课时间/);}},
    {id:'NpcOverdueMemory',input:'林穗，我之前欠你的房钱还清了吗？只问这一件事，先不交钱。',
        setup:async c=>{
            for(const [tool,args,eventId]of [['world_trade',{seller:'林穗',service:'住宿',payment:'credit',creditMinutes:60},'memory_rent'],['world_time',{minutes:60},'memory_late']]){
                const out=await engine.reduce(c,{tool,args,eventId});c=applyPatches(c,out.patches);
            }
            c.state.location=c.state.npcs.npc_hw_linsui.location;return c;
        },
        assert:(c,{initial,reply})=>{assert.equal(c.state.player.coins,initial.state.player.coins);assert.equal(c.state.records.debt_memory_rent.status,'逾期');assert.match(reply,/(六|6)(枚|个)?铜/);assert.match(reply,/逾期|没还|未还|还没|欠|到期/);}},
    {id:'NpcRecallPurchase',input:'林穗，上次我在你这里买的吃食是什么来着？我有点记不清了，今天先不买。',
        setup:async c=>{
            const bought=await engine.reduce(c,{tool:'world_trade',args:{seller:'林穗',item:'面包',quantity:1},eventId:'memory_bread'});c=applyPatches(c,bought.patches);
            for(let i=0;i<4;i++){
                const out=await engine.reduce(c,{tool:'world_trade',args:{seller:'林穗',service:'住宿'},eventId:`memory_room_${i}`});c=applyPatches(c,out.patches);
            }
            return c;
        },
        assert:(c,{initial,reply})=>{assert.equal(c.state.player.coins,initial.state.player.coins);assert.deepEqual(c.state.inventory,initial.state.inventory);assert.match(reply,/面包/);}},
    {id:'GrowthAllocation',input:'把刚升级获得的两个属性点都加到体质上。',
        setup:async c=>{
            for(let i=0;i<2;i++){
                let out=await engine.reduce(c,{tool:'world_quest',args:{operation:'publish',publisher:'林穗',grade:'D',personal:true,reward:20,content:'补一份干粮',objective:{type:'deliver',item:'item_ration',quantity:1}},eventId:`prepare_publish_${i}`});
                c=applyPatches(c,out.patches);const quest=out.result.quest;
                for(const operation of['accept','complete']){out=await engine.reduce(c,{tool:'world_quest',args:{operation,quest},eventId:`prepare_${operation}_${i}`});c=applyPatches(c,out.patches);}
            }
            return c;
        },
        context:'两次实际交付任务已按150、75经验结算，升至2级，待分配点为2。玩家已明确选择体质。使用world_attributes实际分配，不能声称分配后直接回血。',
        assert:(c,{reply})=>{assert.equal(c.state.player.level,2);assert.equal(c.state.player.attributes.体质,12);assert.equal(c.state.player.freeAttributePoints,0);assert.equal(c.state.player.maxHp,20);assert.equal(c.state.player.hp,12);assert.equal(c.state.player.xp,25);assert.ok(!reply.includes('12/16'),'回复重复了分配前的生命上限');}},
    {id:'RevivalRegistration',input:'我在这里登记复活点，支付规定的登记费。',
        setup:c=>{c.state.location='bld_bs_shrine';c.state.player.level=5;c.state.player.coins=100;},
        context:'你在白石归途殿bld_bs_shrine，等级5，登记费30铜、耗时15分钟。用world_revival登记，费用由工具处理，不用world_trade重复交钱。',
        assert:c=>{assert.equal(c.state.player.revivalAnchor,'bld_bs_shrine');assert.equal(c.state.player.coins,70);assert.equal(c.state.shrineTreasuries.bld_bs_shrine,30);assert.equal(c.state.minute,555);assert.ok(c.state.revivalPoints.bld_bs_shrine);}},
    ...ruleScenarios(engine),
    ...environmentScenarios(engine),
    ...petScenarios(engine),
    ...lawScenarios(engine),
    ...weatherScenarios(engine),
    ...agricultureScenarios(engine,seed),
    ...wildlifeScenarios(engine),
    ...bossScenarios(engine),
    ...migrationScenarios(engine),
    ...farmPestsScenarios(engine,seed),
];
const repeatOption=process.argv.indexOf('--repeat');
const repetitions=repeatOption<0?1:Number(process.argv[repeatOption+1]);
if(!Number.isInteger(repetitions)||repetitions<1||repetitions>10)throw new Error('快速场景重复次数必须为1–10');
const results=[];
const onlyOption=process.argv.indexOf('--only'),only=onlyOption<0?null:process.argv[onlyOption+1]?.split(',');
if(onlyOption>=0&&(!only?.length||only.some(id=>!scenarios.some(row=>row.id===id))))throw new Error('指定的快速场景不存在');
const selected=only?scenarios.filter(row=>only.includes(row.id)):scenarios;
const currentHints=value=>value.replace(/world_(weather|farm|wildlife|environment|lair|pet|summon|crime)\s+(?:operation\s+)?([a-z_]+)/g,(_,name,operation)=>{
    const call=modelToolCall(`world_${name}`,{operation});return`${call.tool} operation ${call.args.operation}`;
});
for(const scenario of selected.flatMap(scenario=>Array.from({length:repetitions},(_,attempt)=>({...scenario,attempt:attempt+1})))){
    const activeEngine=scenario.engine??engine;
    let document=activeEngine.initialFromLegacy({state:seed.state,memories:seed.memories},`quick-${scenario.id}`,{prepare:!scenario.prepareBeforeR1}),counter=0,reply='',error=null;
    const events=[],messages=[];
    try{
    const prepared=await scenario.setup?.(document);if(prepared)document=prepared;
    const initial=structuredClone(document),startMinute=document.state.minute;
    const present=Object.keys(document.state.npcs).filter(id=>document.state.npcs[id].location===document.state.location);
    messages.push({role:'system',content:`你是中文游戏主持人。所有财物变化必须先调用工具成功后叙述。只回应本次意图，不替玩家安排下一步。普通回复末尾附<回合 额外="10分" 地点="${document.state.location}" 在场="${present.join(',')}"/>，额外只写工具耗时以外的对话或停留时间；已由工具完成的行动写0分。场外问题不写工具或尾注，不推进时间。林穗愿意出租普通客房，一晚6铜，一周35铜。施法只能使用当前已经学会的法术，消耗按目录与回执结算。${currentHints(scenario.context??'')}当前场景：\n${activeEngine.scene(document,scenario.input)}`},{role:'user',content:scenario.input});
        for(let recursion=0;recursion<8;recursion++){
            const response=await client.generate({messages,tools,max_tokens:900,temperature:0.8},`${scenario.id}-${recursion}`),message=response.choices?.[0]?.message;
            if(!message)throw new Error('模型没有返回消息');messages.push(message);
            if(!message.tool_calls?.length){reply=message.content??'';break;}
            for(const call of message.tool_calls){
                const args=JSON.parse(call.function.arguments);let result;
                if(call.function.name==='world_read')result=readStateSection(document.state,args.section,args.npc);
                else if(call.function.name==='world_search')result={results:[]};
                else if(call.function.name==='world_catalog')result=await lookupToolResult(()=>catalogDefinition(activeEngine,document,args));
                else if(scenario.id==='F8')result={ok:false,error:'场外提问不能写入状态'};
                else{
                    const input={...resolveToolCall(call.function.name,args),eventId:`quick_${scenario.id}_${counter++}`};
                    try{const output=await activeEngine.reduce(document,input);document=applyPatches(document,output.patches);result=toolResultWithClock(output.result,{startMinute,minute:document.state.minute});events.push({input,result});}
                    catch(e){result={ok:false,error:e.message};}
                }
                messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
            }
        }
        if(!reply)throw new Error('工具递归超过上限或未返回正文');
        if(scenario.id!=='F8'){
            const parsed=parseTurn(reply,{location:document.state.location,startMinute,minute:document.state.minute});
            const output=await activeEngine.reduce(document,{tool:'world_turn',args:parsed.args,eventId:`finish_${scenario.id}`});document=applyPatches(document,output.patches);
        }
        scenario.assert(document,{initial,startMinute,reply,events});
    }catch(e){error=e.message;}
    results.push({id:scenario.id,attempt:scenario.attempt,fixtureScope:scenario.fixtureScope??'源世界与旧角色快照的开发场景',input:scenario.input,pass:!error,error,reply,events,player:document.state.player,minute:document.state.minute,...(error?{failedDialogue:messages}:{})});
    console.log(`${scenario.id} 第${scenario.attempt}次: ${error?'失败 '+error:'通过'}`);
}
const report={date:'2026-10-10',scope:`当前引擎${selected.length}个快速场景，各跑${repetitions}次；${only?'定向复核，不代表全部快速场景；':''}不代表完整11.3/11.4验收`,availableScenarios:scenarios.length,selectedScenarios:selected.map(row=>row.id),pass:results.every(r=>r.pass),costUpperYuan:client.spent,results};
await fs.mkdir('docs/测试报告/最新',{recursive:true});
await fs.writeFile('docs/测试报告/最新/快速场景.json',JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
