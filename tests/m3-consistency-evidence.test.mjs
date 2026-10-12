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

// Saved real failures; dates and original text remain immutable regression evidence.
const realFailures={
 "date": "2026-10-11T21:58:06.104Z",
 "source": "真实试玩.json",
 "offscreen": {
  "input": "若阿砚现在在场且醒着，我问他这十天自己忙了什么，有没有做成或做坏过东西；若不在就等到下次白天接待，等他实际到场后再问。不替他补做。",
  "replies": [
   "磨坊里亮起来了。阿砚已经站在矮凳旁，卷尺搭在膝上，正用一块布擦刨子的刃口。他抬头看见你，手上的动作没停。\n\n<q who=\"npc_hw_ayan\">你昨晚来过？木屑堆在门里侧，我早上推门差点踩着。</q>\n\n他把刨子搁回凳面，往轴边挪了半步。\n\n<q who=\"npc_hw_ayan\">这十天我没闲着。修了两根小工具的木柄，一把凿子的柄松了，还有把旧镰的握柄裂了，都是按长短削出来对上的。两回都成了，工坊那边收了两个铜。刃口我不敢乱磨，只把柄配齐。</q>\n\n他抿了下嘴，像是想起什么不太痛快的事。\n\n<q who=\"npc_hw_ayan\">试装的时候还是留了道刮痕，木楔塞得太急，口子边上蹭掉一小片。不碍用，可我看一眼就知道。手艺这东西，糊过去下次还得拆。</q>\n\n他朝承重座那边抬了抬下巴。\n\n<q who=\"npc_hw_ayan\">轴还是没动。料没到，箍也没配。我这几回量的是水位，顺磨痕摸过两遍，斜口从南边起。等段岩松手，我就拿尺去对模子。</q>\n\n他重新捡起卷尺，绕在指间。\n\n<q who=\"npc_hw_ayan\">你今天来，是要看哪样？</q>\n\n<回合 额外=\"15分\" 地点=\"bld_hw_mill\" 在场=\"npc_hw_ayan\"/>",
   "阿砚把卷尺往腰带上一别，弯腰从矮凳下面拖出两截短短的木头，都是削剩下的边角。\n\n<q who=\"npc_hw_ayan\">凿子柄那回，用的是工坊里攒的旧料，硬，出屑慢，我拿刨子推了半个时辰才顺。镰刀柄那截软些，是别人换下来的旧柄拆开，量着重新削的，两头留了余量，没舍得一次削到位。</q>\n\n他用拇指按了按那截硬木的断面。\n\n<q who=\"npc_hw_ayan\">料是边角料，不另算钱，工坊就收两铜一回。两回都是我自己的工夫，没拿公家的整料。这一点你问得对——料要是整根的，账要另走。</q>\n\n他顿了顿，把木头塞回凳下。\n\n<q who=\"npc_hw_ayan\">刮痕那回就是硬木，木楔塞急，边上蹭掉一层。我后来把余量留厚了，下一回就没再出。</q>\n\n他说完，抬眼看你，像是在等你说清为什么要一样一样地盘这些。\n\n<回合 额外=\"10分\" 地点=\"bld_hw_mill\" 在场=\"npc_hw_ayan\"/>"
  ],
  "window": {
   "start": 916,
   "end": 15316
  },
  "actions": [
   {
    "id": "npc_plan_9fc79fe23a3c89c50eeca9b4",
    "npc": "npc_hw_ayan",
    "kind": "craft",
    "action": {
     "kind": "craft",
     "recipe": "recipe_wooden_pegs"
    },
    "start": 543,
    "minute": 563,
    "location": "bld_hw_mill",
    "summary": "尝试削制榫用木楔，耗时20分钟，没有得到成品，工坊费2铜。",
    "outcome": {
     "die": 6,
     "modifier": 1,
     "total": 7,
     "degree": "失败",
     "difficulty": 10,
     "success": false
    },
    "spent": {
     "minutes": 20,
     "fee": 2,
     "materials": [
      {
       "item": "item_wood",
       "amount": 1
      }
     ]
    },
    "produced": []
   },
   {
    "id": "npc_daily_0_npc_hw_ayan",
    "npc": "npc_hw_ayan",
    "kind": "craft",
    "action": {
     "kind": "craft",
     "recipe": "recipe_tool_handle"
    },
    "start": 600,
    "minute": 630,
    "location": "bld_hw_mill",
    "summary": "尝试修整小工具木柄，耗时30分钟，制成小工具木柄1份，工坊费2铜。",
    "outcome": {
     "die": 11,
     "modifier": 1,
     "total": 12,
     "degree": "勉强成功",
     "difficulty": 10,
     "success": true,
     "workmanship": "粗糙"
    },
    "spent": {
     "minutes": 30,
     "fee": 2,
     "materials": [
      {
       "item": "item_wood",
       "amount": 1
      }
     ]
    },
    "produced": [
     {
      "item": "item_tool_handle",
      "amount": 1
     },
     {
      "item": "item_wood_shavings",
      "amount": 1
     }
    ]
   },
   {
    "id": "npc_daily_1_npc_hw_ayan",
    "npc": "npc_hw_ayan",
    "kind": "craft",
    "action": {
     "kind": "craft",
     "recipe": "recipe_tool_handle"
    },
    "start": 2040,
    "minute": 2070,
    "location": "bld_hw_mill",
    "summary": "尝试修整小工具木柄，耗时30分钟，没有得到成品，工坊费2铜。",
    "outcome": {
     "die": 2,
     "modifier": 1,
     "total": 3,
     "degree": "失败",
     "difficulty": 10,
     "success": false
    },
    "spent": {
     "minutes": 30,
     "fee": 2,
     "materials": [
      {
       "item": "item_wood",
       "amount": 1
      }
     ]
    },
    "produced": []
   },
   {
    "id": "npc_daily_2_npc_hw_ayan",
    "npc": "npc_hw_ayan",
    "kind": "craft",
    "action": {
     "kind": "craft",
     "recipe": "recipe_tool_handle"
    },
    "start": 3480,
    "minute": 3510,
    "location": "bld_hw_mill",
    "summary": "尝试修整小工具木柄，耗时30分钟，没有得到成品，工坊费2铜。",
    "outcome": {
     "die": 7,
     "modifier": 1,
     "total": 8,
     "degree": "失败",
     "difficulty": 10,
     "success": false
    },
    "spent": {
     "minutes": 30,
     "fee": 2,
     "materials": [
      {
       "item": "item_wood",
       "amount": 1
      }
     ]
    },
    "produced": []
   },
   {
    "id": "npc_daily_3_npc_hw_ayan",
    "npc": "npc_hw_ayan",
    "kind": "craft",
    "action": {
     "kind": "craft",
     "recipe": "recipe_tool_handle"
    },
    "start": 4920,
    "minute": 4950,
    "location": "bld_hw_mill",
    "summary": "尝试修整小工具木柄，耗时30分钟，没有得到成品，工坊费2铜。",
    "outcome": {
     "die": 5,
     "modifier": 1,
     "total": 6,
     "degree": "失败",
     "difficulty": 10,
     "success": false
    },
    "spent": {
     "minutes": 30,
     "fee": 2,
     "materials": [
      {
       "item": "item_wood",
       "amount": 1
      }
     ]
    },
    "produced": []
   },
   {
    "id": "npc_daily_5_npc_hw_ayan",
    "npc": "npc_hw_ayan",
    "kind": "craft",
    "action": {
     "kind": "craft",
     "recipe": "recipe_tool_handle"
    },
    "start": 7800,
    "minute": 7830,
    "location": "bld_hw_mill",
    "summary": "尝试修整小工具木柄，耗时30分钟，制成小工具木柄1份，工坊费2铜。",
    "outcome": {
     "die": 20,
     "modifier": 1,
     "total": 21,
     "degree": "大成功",
     "difficulty": 10,
     "success": true,
     "workmanship": "精良"
    },
    "spent": {
     "minutes": 30,
     "fee": 2,
     "materials": [
      {
       "item": "item_wood",
       "amount": 1
      }
     ]
    },
    "produced": [
     {
      "item": "item_tool_handle",
      "amount": 1
     },
     {
      "item": "item_wood_shavings",
      "amount": 1
     }
    ]
   },
   {
    "id": "npc_daily_6_npc_hw_ayan",
    "npc": "npc_hw_ayan",
    "kind": "craft",
    "action": {
     "kind": "craft",
     "recipe": "recipe_tool_handle"
    },
    "start": 9240,
    "minute": 9270,
    "location": "bld_hw_mill",
    "summary": "尝试修整小工具木柄，耗时30分钟，制成小工具木柄1份，工坊费2铜。",
    "outcome": {
     "die": 20,
     "modifier": 1,
     "total": 21,
     "degree": "大成功",
     "difficulty": 10,
     "success": true,
     "workmanship": "精良"
    },
    "spent": {
     "minutes": 30,
     "fee": 2,
     "materials": [
      {
       "item": "item_wood",
       "amount": 1
      }
     ]
    },
    "produced": [
     {
      "item": "item_tool_handle",
      "amount": 1
     },
     {
      "item": "item_wood_shavings",
      "amount": 1
     }
    ]
   },
   {
    "id": "npc_daily_7_npc_hw_ayan",
    "npc": "npc_hw_ayan",
    "kind": "craft",
    "action": {
     "kind": "craft",
     "recipe": "recipe_tool_handle"
    },
    "start": 10680,
    "minute": 10710,
    "location": "bld_hw_mill",
    "summary": "尝试修整小工具木柄，耗时30分钟，没有得到成品，工坊费2铜。",
    "outcome": {
     "die": 2,
     "modifier": 1,
     "total": 3,
     "degree": "失败",
     "difficulty": 10,
     "success": false
    },
    "spent": {
     "minutes": 30,
     "fee": 2,
     "materials": [
      {
       "item": "item_wood",
       "amount": 1
      }
     ]
    },
    "produced": []
   },
   {
    "id": "npc_daily_8_npc_hw_ayan",
    "npc": "npc_hw_ayan",
    "kind": "craft",
    "action": {
     "kind": "craft",
     "recipe": "recipe_tool_handle"
    },
    "start": 12120,
    "minute": 12150,
    "location": "bld_hw_mill",
    "summary": "尝试修整小工具木柄，耗时30分钟，没有得到成品，工坊费2铜。",
    "outcome": {
     "die": 8,
     "modifier": 1,
     "total": 9,
     "degree": "失败",
     "difficulty": 10,
     "success": false
    },
    "spent": {
     "minutes": 30,
     "fee": 2,
     "materials": [
      {
       "item": "item_wood",
       "amount": 1
      }
     ]
    },
    "produced": []
   },
   {
    "id": "npc_daily_10_npc_hw_ayan",
    "npc": "npc_hw_ayan",
    "kind": "craft",
    "action": {
     "kind": "craft",
     "recipe": "recipe_tool_handle"
    },
    "start": 15000,
    "minute": 15030,
    "location": "bld_hw_mill",
    "summary": "尝试修整小工具木柄，耗时30分钟，制成小工具木柄1份，工坊费2铜。",
    "outcome": {
     "die": 18,
     "modifier": 1,
     "total": 19,
     "degree": "成功",
     "difficulty": 10,
     "success": true,
     "workmanship": "普通"
    },
    "spent": {
     "minutes": 30,
     "fee": 2,
     "materials": [
      {
       "item": "item_wood",
       "amount": 1
      }
     ]
    },
    "produced": [
     {
      "item": "item_tool_handle",
      "amount": 1
     },
     {
      "item": "item_wood_shavings",
      "amount": 1
     }
    ]
   },
   {
    "id": "npc_plan_5406f8d43bdfb4eed0a677ee",
    "npc": "npc_hw_ayan",
    "kind": "craft",
    "action": {
     "kind": "craft",
     "recipe": "recipe_tool_handle"
    },
    "start": 15316,
    "minute": 15346,
    "location": "bld_hw_mill",
    "summary": "尝试修整小工具木柄，耗时30分钟，制成小工具木柄1份，工坊费2铜。",
    "outcome": {
     "die": 9,
     "modifier": 1,
     "total": 10,
     "degree": "勉强成功",
     "difficulty": 10,
     "success": true,
     "workmanship": "粗糙"
    },
    "spent": {
     "minutes": 30,
     "fee": 2,
     "materials": [
      {
       "item": "item_wood",
       "amount": 1
      }
     ]
    },
    "produced": [
     {
      "item": "item_tool_handle",
      "amount": 1
     },
     {
      "item": "item_wood_shavings",
      "amount": 1
     }
    ]
   }
  ]
 },
 "identity": {
  "input": "我把话题换成修一把用了很久的椅子。三位会先看哪里、怎么决定修不修？只讨论，不实际拿椅子开工。",
  "reply": "林穗先接过话，手掌在柜台边沿虚按了一下。\n\n<q who=\"npc_hw_linsui\">我不管木纹，先坐上去摇两下。哪条腿短、哪条腿跟地面不实，一摇就知道。再翻过来看榫眼——榫头如果还咬得住，紧一紧就行；要是眼子豁了，加固不如换料，早换早省。前厅那把断腿凳我修过三回，前两回只钉钉子，越钉越松。</q>\n\n阿砚从门边挪过来半步，指间还夹着木尺。\n\n<q who=\"npc_hw_ayan\">我量榫眼有多大、松了多少。松得浅能补楔，越过了榫肩就得重凿。看椅子值不值这块料，先看别处有没有暗裂——摸一圈座面的拼缝，缝里塞灰塞得进去，就是早该整了。</q>\n\n贺舟把草图纸对折，压在陶罐底下。\n\n<q who=\"npc_hw_hezhou\">我不急着动手。先问这椅子是谁的、用了多久、谁坐。主人舍不得的旧椅子，宁可慢修也别换料；要是本来就随手捡来的，做块新的还快些。修之前我会把裂缝画下来，让人先看清楚哪块是原样、哪块是我添的。</q>\n<回合 额外=\"15分\" 地点=\"bld_hw_qingdeng\" 在场=\"npc_hw_linsui,npc_hw_hezhou,npc_hw_shijin,npc_hw_ayan\"/>"
 }
};

function recalledDocument(actions=realFailures.offscreen.actions){
 const id='npc_hw_ayan',n={location:'bld_hw_mill',activity:'测量磨轴',memoryStream:actions.map(a=>({id:a.id,sourceEvent:a.id,kind:'autonomy',minute:a.minute,participants:[id],content:a.summary,sourceType:'亲历',salience:3}))};
 return {state:{minute:16320,location:'bld_hw_mill',player:{name:'试玩者'},npcs:{[id]:n},npcAutonomy:{actions:Object.fromEntries(actions.map(a=>[a.id,a]))}}};
}
const absenceEvents=[{id:'depart',input:{tool:'world_move'},result:{destination:'loc_bs',minute:916}},{id:'ten-days',input:{tool:'world_time'},result:{minute:15316,elapsed:14400}},{id:'return',input:{tool:'world_move'},result:{destination:'bld_hw_mill',minute:15679}}];

test('保存的 N17 原文与8次制作、木8和16铜相矛盾，证据只取本次十天窗口',async()=>{
 const {deterministicConsistencyReview}=await import('../server-plugin/consistency-review.mjs');
 const engine=new WorldEngine(await loadWorld()),document=recalledDocument(),before=structuredClone(document);
 const knowledge=reviewNpcKnowledge(engine,document,{events:absenceEvents,draft:realFailures.offscreen.replies[0],query:realFailures.offscreen.input});
 const recall=knowledge.npc_hw_ayan.recall;
 assert.deepEqual(recall.window,{start:916,end:15316,sourceEvent:'ten-days',playerLocation:'loc_bs'});
 assert.deepEqual(recall.totals,{attempts:8,successes:3,failures:5,fee:16,materials:{item_wood:8}});
 assert.equal(recall.actions.length,8);assert.ok(!recall.actions.some(a=>a.minute===15346||a.minute===630));
 for(const draft of realFailures.offscreen.replies){const review=deterministicConsistencyReview({playerText:realFailures.offscreen.input,draft,before:document,after:document,knowledge,allowedEntities:engine.entities});assert.ok(review.issues.some(i=>i.category==='fact'&&i.severity==='error'),JSON.stringify(review));}
 const good='<q who="npc_hw_ayan">这十天试了八次，三次成功，五次失败，一共用了八份木料，工坊费合计十六铜。每次两铜，失败的也收了。</q>';
 assert.deepEqual(deterministicConsistencyReview({playerText:realFailures.offscreen.input,draft:good,before:document,after:document,knowledge,allowedEntities:engine.entities}).issues,[]);
 for(const claim of ['这十天八次成功。','这十天一共用了两份木料。'])assert.ok(deterministicConsistencyReview({playerText:realFailures.offscreen.input,draft:`<q who="npc_hw_ayan">${claim}</q>`,before:document,after:document,knowledge,allowedEntities:engine.entities}).issues.some(issue=>issue.category==='fact'));
 assert.deepEqual(document,before);
 const unknown=reviewNpcKnowledge(engine,document,{events:[],query:'十天'}).npc_hw_ayan.recall;assert.equal(unknown.awareness,'unknown-window');assert.equal(unknown.window,null);
 const incomplete=recalledDocument();delete incomplete.state.npcAutonomy.actions.npc_daily_1_npc_hw_ayan.spent.fee;
 const unproven=reviewNpcKnowledge(engine,incomplete,{events:absenceEvents,query:'十天'}).npc_hw_ayan.recall;assert.equal(unproven.awareness,'unknown');assert.equal(unproven.totals,null);
});

test('保存的 N12 原文不能用阿砚代替点名的施锦，其他人物可以继续说自己的附加意见',async()=>{
 const {deterministicConsistencyReview}=await import('../server-plugin/consistency-review.mjs');
 const engine=new WorldEngine(await loadWorld()),input={playerText:realFailures.identity.input.replace('三位','林穗、贺舟、施锦三位'),draft:realFailures.identity.reply,allowedEntities:engine.entities};
 assert.ok(deterministicConsistencyReview(input).issues.some(i=>i.category==='agency'&&i.quote.includes('npc_hw_ayan')));
 input.draft+='<q who="npc_hw_shijin">我先看椅脚有没有受潮。</q>';assert.ok(!deterministicConsistencyReview(input).issues.some(i=>i.category==='agency'));
});

test('私密任务和债务的全局事实不授予无关人物知识，亲历与合法听说保留来源',async()=>{
 const {deterministicConsistencyReview}=await import('../server-plugin/consistency-review.mjs');
 const engine=new WorldEngine(await loadWorld()),id='npc_hw_wushuo',document={state:{minute:600,location:'loc_hw_northwood',player:{name:'试玩者'},npcs:{[id]:{location:'loc_hw_northwood',memoryStream:[]}},quests:{quest_private:{publisher:'npc_hw_linsui',taker:'player',content:'替酒馆备齐燕麦',status:'进行中',objective:{item:'item_oats',quantity:10}}},records:{debt_private:{category:'debt',debtor:'player',creditor:'npc_hw_linsui',amount:6,deadline:606}}}};
 const judge=(text,playerText='我还没告诉他酒馆里的事。')=>deterministicConsistencyReview({playerText,draft:'<q who="'+id+'">'+text+'</q>',before:document,after:document,knowledge:reviewNpcKnowledge(engine,document),allowedEntities:engine.entities}).issues;
 assert.ok(judge('林穗让你送十份燕麦。').some(i=>i.category==='knowledge'&&i.severity==='error'));
 assert.ok(judge('你欠林穗六铜房钱。').some(i=>i.category==='knowledge'));
 assert.deepEqual(judge('不知道，你们酒馆的事没人跟我说过。'),[]);
 assert.deepEqual(judge('你要送十份燕麦？'),[]);
 assert.ok(judge('听说林穗让你送十份燕麦。').some(i=>i.category==='knowledge'),'无渠道不能借听说外壳泄漏私密内容');
 assert.ok(judge('林穗让你送十份燕麦。','我告诉林穗：这十份燕麦还没送到。').some(i=>i.category==='knowledge'),'告知另一人物不能授予吴朔知识');
 assert.deepEqual(judge('我今天要送燕麦给邻居。'),[],'同种货物的无关日常不能被判成玩家私密委托');
 assert.deepEqual(judge('听说你要送十份燕麦，我还得问问林穗。','我告诉吴朔：林穗托我送十份燕麦。'),[]);
 document.state.npcs[id].memoryStream=[{id:'heard',sourceEvent:'private',minute:590,participants:['player','npc_hw_linsui'],sourceType:'听说',heardFrom:'npc_hw_linsui',content:'林穗托玩家送十份燕麦。',salience:3}];
 assert.deepEqual(judge('听林穗说，你要送十份燕麦。'),[]);
 assert.ok(judge('我亲眼看见林穗让你送十份燕麦。').some(i=>i.category==='knowledge'));
 document.state.npcs[id].memoryStream[0].sourceType='目击';assert.deepEqual(judge('我亲眼看见林穗让你送十份燕麦。'),[]);
});
