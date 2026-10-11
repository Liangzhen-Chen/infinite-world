import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {reviewNpcKnowledge} from '../server-plugin/consistency-evidence.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';

const response=issues=>({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:'report_consistency_issues',arguments:JSON.stringify({issues})}}]}}]});
async function campaign(server,body={}){
 let view=await server.api('create',body);const campaignId=view.reference.campaignId;let index=0;
 return {campaignId,async read(){view=await server.api('read',{campaignId});return view;},async act(tool,args){const eventId=`setup-${++index}`;const result=await server.api('execute',{campaignId,anchor:eventId,eventId,tool,args,expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});return result;},async review(playerText,draft){const begun=await server.api('review/begin',{campaignId,anchor:'review-turn',playerText,expectedSequence:view.reference.sequence});return server.api('review/reply',{campaignId,token:begun.token,draft,expectedSequence:view.reference.sequence});}};
}

test('HTTP 审稿区分玩家的真实委托与不在场吴朔的知情范围',async t=>{
 const world=await loadWorld(),wushuo=world.npcs.find(n=>n.id==='npc_hw_wushuo');
 wushuo.schedule={default:[{start:0,end:1440,location:'loc_hw_northwood',activity:'守林',services:[]}]};
 let payload;const client={async generate(body){payload=JSON.parse(body.messages[1].content);return response([]);}};
 const server=await createPlaytestServer({world,consistencyClient:client});t.after(()=>server.close());const run=await campaign(server);
 const published=await run.act('world_quest',{operation:'publish',publisher:'npc_hw_linsui',grade:'D',personal:true,reward:20,content:'替酒馆备齐燕麦',objective:{type:'deliver',item:'item_oats',quantity:10}}),quest=published.result.quest;
 await run.act('world_quest',{operation:'accept',quest});
 await run.act('world_move',{destination:'loc_hw_northwood'});
 const view=await run.read();assert.equal(view.document.state.npcs.npc_hw_wushuo.location,'loc_hw_northwood');
 const review=await run.review('吴朔，你知道林穗给过我什么委托吗？','<q who="npc_hw_wushuo">我没听说，你得问她。</q><回合 额外="5分" 地点="loc_hw_northwood" 在场="npc_hw_wushuo"/>');
 assert.equal(review.verified,true);
 const global=JSON.parse(payload.evidence.find(e=>e.id==='after').text),known=JSON.parse(payload.evidence.find(e=>e.id==='knowledge:npc_hw_wushuo').text);
 assert.equal(global.quests[quest].content,'替酒馆备齐燕麦');assert.equal(global.quests[quest].status,'进行中');
 const contract=known.contracts.find(c=>c.reference===quest);assert.equal(contract.party,false);assert.equal(contract.awareness,'no-recorded-channel');assert.deepEqual(contract.memories,[]);
 assert.ok(!known.memories.some(m=>m.content.includes('替酒馆备齐燕麦')));
 // Reviewing does not teach the character the private contract.
 const after=await run.read();assert.deepEqual(after.document,view.document);
 const scene=await server.api('scene',{campaignId:run.campaignId,query:'吴朔 委托'});assert.ok(!scene.scene.includes('reviewer-only'));
});

test('历史私宅许可进入 before/after 摘要，审稿无需本轮重签或重放授权',async t=>{
 let payload;const server=await createPlaytestServer({consistencyClient:{async generate(body){payload=JSON.parse(body.messages[1].content);return response([]);}}});t.after(()=>server.close());
 const run=await campaign(server,{character:{name:'拜访者'}});await run.act('world_move',{destination:'loc_hw_fields'});await run.act('world_time',{minutes:30});
 const granted=await run.act('world_promise',{operation:'grant_access',promisor:'npc_hw_miaozhen',location:'bld_hw_home_15',minutes:60,content:'进屋查看旧筛架'}),authorization=granted.result.authorization;
 const before=await run.read();const review=await run.review('我刚才得到的拜访许可还有效吗？','<q who="npc_hw_miaozhen">刚才准你看筛架的许可还有效。</q><回合 额外="5分" 地点="loc_hw_fields" 在场="npc_hw_miaozhen"/>');
 assert.equal(review.verified,true);assert.equal(review.rewritten,false);assert.deepEqual(review.issues,[]);
 for(const id of ['before','after']){const state=JSON.parse(payload.evidence.find(e=>e.id===id).text);assert.equal(state.authorizations[authorization].grantor,'npc_hw_miaozhen');assert.equal(state.authorizations[authorization].revoked,false);assert.ok(state.authorizations[authorization].expires>state.minute);}
 assert.ok(!payload.evidence.some(e=>e.id.startsWith('receipt:')),'这是后续回合，不依赖重签许可');
 const knowledge=JSON.parse(payload.evidence.find(e=>e.id==='knowledge:npc_hw_miaozhen').text),contract=knowledge.contracts.find(c=>c.reference===authorization);
 assert.equal(contract.awareness,'recorded-memory');assert.equal(contract.party,true);assert.ok(contract.memories.some(m=>m.sourceType==='亲历'));
 assert.deepEqual((await run.read()).document,before.document);
});

test('审稿专用人物知识不进入纯文字改写提示，已有严重问题仍改写并复核',async t=>{
 const world=await loadWorld(),secret='审稿专用测试暗号苇舟';world.npcs.find(n=>n.id==='npc_hw_wushuo').knowledge.known.push({fact:secret});
 let reviewed=0,rewritten=0;const client={async generate(body,label){
  if(label.startsWith('consistency-rewrite:')){rewritten++;const payload=JSON.parse(body.messages.at(-1).content);assert.ok(!JSON.stringify(body).includes(secret));assert.ok(!payload.evidence.some(e=>e.id.startsWith('knowledge:')));return {choices:[{finish_reason:'stop',message:{content:'<q who="npc_hw_linsui">你先坐。</q><回合 额外="5分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>'}}]};}
  reviewed++;const payload=JSON.parse(body.messages[1].content);assert.ok(payload.evidence.some(e=>e.id==='knowledge:npc_hw_wushuo'&&e.text.includes(secret)));return response([]);
 }};
 const server=await createPlaytestServer({world,consistencyClient:client});t.after(()=>server.close());const run=await campaign(server);
 const result=await run.review('我问林穗能不能坐下。','<q who="npc_unregistered">你先坐。</q><q who="npc_hw_wushuo">稍等。</q><回合 额外="5分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>');
 assert.equal(result.verified,true,JSON.stringify(result));assert.equal(result.rewritten,true);assert.equal(reviewed,2);assert.equal(rewritten,1);
});

test('审稿沿用人物遗忘及转述视图，不能从原始记忆偷偷补回精确数额',async()=>{
 const engine=new WorldEngine(await loadWorld()),document={state:{minute:600,location:'bld_hw_qingdeng',player:{name:'旅人'},npcs:{npc_hw_linsui:{location:'bld_hw_qingdeng',memoryStream:[{id:'heard-private',sourceEvent:'past-trade',kind:'trade',minute:540,participants:['player','npc_hw_linsui'],content:'玩家付了918铜，私有原始细节',sourceType:'听说',heardFrom:'npc_hw_hezhou',reliability:'未经亲历核实',salience:3}],cognition:{blurred:{'heard-private':{content:'玩家曾办理过交易，具体数额记不清'}}}}}}};
 const knowledge=reviewNpcKnowledge(engine,document,{query:'交易'}).npc_hw_linsui;
 assert.equal(knowledge.memories.length,1);assert.equal(knowledge.memories[0].blurred,true);assert.equal(knowledge.memories[0].sourceType,'听说');assert.equal(knowledge.memories[0].heardFrom,'npc_hw_hezhou');assert.ok(!JSON.stringify(knowledge).includes('918'));assert.ok(!JSON.stringify(knowledge).includes('私有原始细节'));
});
