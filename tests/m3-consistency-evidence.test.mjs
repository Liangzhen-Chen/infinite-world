import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {reviewNpcKnowledge,reviewHistoricalEvidence} from '../server-plugin/consistency-evidence.mjs';
import {consistencyReviewRequest,deterministicConsistencyReview,reviewConsistency} from '../server-plugin/consistency-review.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';

const response=issues=>({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:'report_consistency_issues',arguments:JSON.stringify({issues})}}]}}]});
const m2Report=JSON.parse(await fs.readFile(new URL('../docs/测试报告/M2-recheck/真实试玩.json',import.meta.url),'utf8'));
test('审查共享往来来源；只为已重建且未被覆盖的等待时段提供作息活动',async()=>{
 const engine=new WorldEngine(await loadWorld()),before=engine.initialFromLegacy(JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),'routine-evidence');
 const id='npc_hw_shijin';before.state.minute=600;before.state.npcs[id]={location:'loc_hw_fields',status:'正常'};before.state.location='loc_hw_fields';
 const after=structuredClone(before);after.state.minute=630;
 const receipts=[{tool:'world_time',result:{ok:true,elapsed:30,minute:630}}];
 const read=(doc=after)=>reviewNpcKnowledge(engine,doc,{before,receipts,query:'施锦 林穗 陈柏',draft:`<q who="${id}">平常筛种粒。</q>`});
 const knowledge=read(),routine=knowledge[id].background.schedule;
 assert.equal(routine.slots.find(s=>s.start===540).activity,'翻晒与筛看自家种粒');
 assert.deepEqual(routine.intervals.map(r=>[r.start,r.end]),[[600,630]]);assert.match(routine.intervals[0].limit,/不证明完成数量/);
 for(const mutate of [d=>d.state.npcs[id].status='昏迷',d=>d.state.npcs[id].scheduleTravel={arrive:650},
  d=>d.state.player.companions=[id],d=>d.state.obligations={mid:{promisor:id,promisee:'player',start:610,deadline:620,status:'已完成'}},
  d=>d.state.npcAutonomy={tasks:{mid:{npc:id,start:610,finish:620,status:'已完成'}}},
  d=>d.state.effects={mid:{target:id,kind:'mind_space',operation:'sleep',sleeping:true,started:610,expires:620}}]){
  const blocked=structuredClone(after);mutate(blocked);assert.deepEqual(read(blocked)[id].background.schedule.intervals,[]);
 }
 assert.deepEqual(reviewNpcKnowledge(engine,after,{draft:`<q who="${id}">今早翻过了。</q>`})[id].background.schedule.intervals,[]);
 const relations=reviewNpcKnowledge(engine,before,{draft:'<q who="npc_hw_linsui">该问陈柏。</q>',query:'林穗 陈柏'}).npc_hw_linsui.background.relations;
 assert.equal(relations.find(r=>r.with==='npc_hw_chenbai').note,'按账目核对酒馆的公用支出');
 const winter=structuredClone(before);winter.state.minute=270*1440+600;
 const winterSource=reviewNpcKnowledge(engine,winter,{query:'林穗',draft:'<q who="npc_hw_linsui">冬日备餐。</q>'}).npc_hw_linsui.background.schedule.slots[0].source;
 assert.match(winterSource,/schedule.seasonal.3.default/);
});
async function campaign(server,body={}){
 let view=await server.api('create',body);const campaignId=view.reference.campaignId;let index=0;
 return {campaignId,async read(){view=await server.api('read',{campaignId});return view;},async act(tool,args){const eventId=`setup-${++index}`;const result=await server.api('execute',{campaignId,anchor:eventId,eventId,tool,args,expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});return result;},async review(playerText,draft,anchor='review-turn'){const begun=await server.api('review/begin',{campaignId,anchor,playerText,expectedSequence:view.reference.sequence});return server.api('review/reply',{campaignId,token:begun.token,draft,expectedSequence:view.reference.sequence});}};
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

test('T97 五条保存原文：库存矛盾归事实，空约定、普通否认及两条历史核对不算泄漏',async()=>{
 const engine=new WorldEngine(await loadWorld());let checked=0;
 for(const id of ['npc_courier','npc_delivery','npc_quest_social']){
  const run=m2Report.results.find(row=>row.id===id),document=run.finalDocument;
  const events=run.turns.flatMap((turn,index)=>(turn.calls??[]).filter(call=>!['world_read','world_search'].includes(call.tool)).map((call,i)=>({id:`saved-${index}-${i}`,anchor:`saved-${index}`,input:{tool:call.tool,args:call.args},result:call.result})));
  for(const turn of run.turns){
   const findings=turn.consistency?.issues?.filter(issue=>issue.category==='knowledge')??[];
   for(const finding of findings){
    checked++;
    const input={playerText:turn.input,draft:turn.reply,before:document,after:document,receipts:turn.calls??[],allowedEntities:engine.entities,
     knowledge:reviewNpcKnowledge(engine,document,{draft:turn.reply,query:turn.input}),priorEvidence:reviewHistoricalEvidence(engine,events,run.session.chat,{query:turn.input,draft:turn.reply})};
    const result=await reviewConsistency(input,{client:{async generate(body){
     const payload=JSON.parse(body.messages[1].content),system=body.messages[0].content;
     assert.match(system,/场外核账没有人物获得新知识/);assert.match(system,/privateContent/);
     if(finding.quote.includes('150经验')){
      assert.ok(payload.evidence.some(row=>row.kind==='historical-receipt'&&JSON.parse(row.text).result.experience===150));
     }
     if(finding.quote.includes('回答也是不知道'))assert.ok(payload.evidence.some(row=>row.kind==='chat'&&row.text.includes('npc_hw_wushuo')&&/不知道|没听/.test(row.text)));
     if(finding.quote.includes('登记未成立'))assert.deepEqual(JSON.parse(payload.evidence.find(row=>row.id==='after').text).obligations,{});
     return response([]);
    }}});
    assert.equal(result.verified,true);assert.ok(!result.issues.some(issue=>issue.category==='knowledge'));
    if(finding.quote.includes('面包没有现成'))assert.ok(result.issues.some(issue=>issue.category==='fact'&&issue.severity==='error'));
    else assert.ok(!result.issues.some(issue=>issue.severity==='error'),JSON.stringify(result.issues));
   }
  }
 }
 assert.equal(checked,5);
});

test('T97 未承接委托的登记及托管可核账，原始聊天和历史工具回执只进入场外审稿',async t=>{
 let payload;const server=await createPlaytestServer({consistencyClient:{async generate(body){payload=JSON.parse(body.messages[1].content);return response([]);}}});t.after(()=>server.close());
 const run=await campaign(server),published=await run.act('world_quest',{operation:'publish',publisher:'npc_hw_linsui',grade:'D',personal:true,reward:20,content:'替酒馆备齐燕麦',objective:{type:'deliver',item:'item_oats',quantity:10}});
 const answer='<q who="npc_hw_wushuo">不知道，我没听说。</q>';
 await server.api('sync-index',{campaignId:run.campaignId,start:0,total:1,messages:[{is_user:false,mes:answer}]});
 await run.review('（场外）核对林穗的委托托管和吴朔原答复。','（场外）林穗已发布委托，吴朔原话说不知道。');
 const ledger=JSON.parse(payload.evidence.find(row=>row.id==='after').text);
 assert.equal(ledger.quests[published.result.quest].reward,20);assert.equal(ledger.quests[published.result.quest].escrow,20);assert.equal(ledger.quests[published.result.quest].taker,null);
 assert.ok(payload.evidence.some(row=>row.kind==='historical-receipt'&&row.text.includes('world_quest')));
 assert.ok(payload.evidence.some(row=>row.kind==='chat'&&JSON.parse(row.text).text===answer));
 await run.review('我看看眼前。','眼前没有变化。<回合 额外="0分" 地点="loc_hw_square" 在场=""/>','in-world');
 assert.ok(!payload.evidence.some(row=>row.id.startsWith('prior:')));
 const before=await run.read();await server.api('reconcile',{campaignId:run.campaignId,validAnchors:[]});
 await run.read();await run.review('（场外）核对林穗的委托。','（场外）没有登记委托。','after-rollback');
 assert.ok(!payload.evidence.some(row=>row.kind==='historical-receipt'&&row.text.includes('world_quest')));
 assert.notDeepEqual((await run.read()).document,before.document);
});

test('T97 knowledge响应必须指出原句私密内容和对应无渠道人物，真实泄密仍报error',async()=>{
 const engine=new WorldEngine(await loadWorld()),id='npc_hw_wushuo',document={state:{minute:600,location:'loc_hw_northwood',npcs:{[id]:{location:'loc_hw_northwood',memoryStream:[]}},quests:{quest_secret:{publisher:'npc_hw_linsui',content:'替酒馆备齐燕麦',objective:{item:'item_oats',quantity:10},reward:20,status:'公开'}}}};
 const input={playerText:'我没告诉吴朔委托内容。',draft:'<q who="npc_hw_wushuo">林穗让你送十份燕麦。</q>',before:document,after:document,allowedEntities:engine.entities,knowledge:reviewNpcKnowledge(engine,document)};
 const issue={category:'knowledge',severity:'error',quote:'林穗让你送十份燕麦',reason:'吴朔没有获知这份私人委托的渠道',subject:id,privateContent:'送十份燕麦',evidence:[{id:`knowledge:${id}`,quote:'"awareness":"no-recorded-channel"'}]};
 const checked=await reviewConsistency(input,{client:{generate:async()=>response([issue])}});
 assert.equal(checked.verified,true);assert.ok(checked.issues.some(row=>row.category==='knowledge'&&row.severity==='error'&&row.subject===id&&row.privateContent));
 for(const changed of [{subject:undefined},{privateContent:undefined},{privateContent:'别的秘密'},{subject:'npc_hw_linsui'}]){
  const invalid=await reviewConsistency(input,{client:{generate:async()=>response([{...issue,...changed}])}});assert.equal(invalid.verified,false);assert.equal(invalid.model.status,'failed');
 }
 const ooc=await reviewConsistency({...input,playerText:'（场外）核对吴朔原话。'},{client:{generate:async()=>response([issue])}});assert.equal(ooc.model.status,'failed');
 assert.ok(consistencyReviewRequest(input).tools[0].function.parameters.properties.issues.items.oneOf.some(row=>row.required.includes('subject')&&row.required.includes('privateContent')));
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
 // 05 §5.4: author knowledge seeds belong to the knowledge set alongside
 // witnessed/told memories. Keep exact membership and the blurred-memory
 // provenance/privacy counterexamples rather than assuming no world seeds.
 const {npcRumorSeeds}=await import('../server-plugin/npc-rumors.mjs');
 assert.deepEqual(knowledge.memories.map(m=>m.id).sort(),['heard-private',...npcRumorSeeds(engine,'npc_hw_linsui').map(m=>m.id)].sort());
 const heard=knowledge.memories.find(m=>m.id==='heard-private');
 assert.equal(heard.blurred,true);assert.equal(heard.sourceType,'听说');assert.equal(heard.heardFrom,'npc_hw_hezhou');assert.ok(!JSON.stringify(knowledge).includes('918'));assert.ok(!JSON.stringify(knowledge).includes('私有原始细节'));
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

test('HTTP 同一私密委托中，普通感知与否认不授予知识，确定披露仍阻止提交',async t=>{
 const world=await loadWorld(),id='npc_hw_wushuo';
 world.npcs.find(n=>n.id===id).schedule={default:[{start:0,end:1440,location:'loc_hw_northwood',activity:'守林',services:[]}]};
 let calls=0,rewrites=0,leak=false;
 const badDraft='<q who="npc_hw_wushuo">林穗让你送十份燕麦。</q><回合 额外="5分" 地点="loc_hw_northwood" 在场="npc_hw_wushuo"/>';
 const client={async generate(body,label){
  if(label.startsWith('consistency-rewrite:')){
   rewrites++;return {choices:[{finish_reason:'stop',message:{content:badDraft}}]};
  }
  assert.ok(label.startsWith('consistency:'));calls++;
  assert.match(body.messages[0].content,/无记录渠道不能靠“听说”外壳获得知识/);
  const payload=JSON.parse(body.messages[1].content),evidence=payload.evidence.find(e=>e.id===`knowledge:${id}`);
  const known=JSON.parse(evidence.text),contract=known.contracts.find(c=>c.kind==='quest');
  assert.equal(known.present,true);assert.equal(contract.awareness,'no-recorded-channel');
  assert.deepEqual(contract.memories,[]);assert.equal(contract.party,false);
  return response(leak?[{category:'knowledge',severity:'error',quote:'林穗让你送十份燕麦',
   subject:id,privateContent:'林穗让你送十份燕麦',
   reason:'未记录获知渠道的确定委托内容',evidence:[{id:evidence.id,quote:'"awareness":"no-recorded-channel"'}]}]:[]);
 }};
 const server=await createPlaytestServer({world,consistencyClient:client});t.after(()=>server.close());
 const run=await campaign(server);
 const published=await run.act('world_quest',{operation:'publish',publisher:'npc_hw_linsui',grade:'D',personal:true,reward:20,content:'替酒馆备齐燕麦',objective:{type:'deliver',item:'item_oats',quantity:10}});
 await run.act('world_quest',{operation:'accept',quest:published.result.quest});
 await run.act('world_move',{destination:'loc_hw_northwood'});const saved=await run.read();
 const query='吴朔，你亲眼看见我刚才在酒馆做了什么吗？我还没把事情告诉他。';
 const good=await run.review(query,'<q who="npc_hw_wushuo">我没看见。我记的是自己两眼看到的东西，别人嘴里的话我一般不往外传。</q>门边的纸片露出一角，具体内容看不清。<回合 额外="5分" 地点="loc_hw_northwood" 在场="npc_hw_wushuo"/>');
 assert.equal(good.verified,true);assert.equal(good.canCommit,true);assert.equal(good.rewritten,false);assert.deepEqual(good.issues,[]);
 assert.deepEqual((await run.read()).document,saved.document);
 // Actual private content remains blocked after the one permitted rewrite.
 leak=true;
 const bad=await run.review(query,badDraft,'private-leak-turn');
 assert.equal(bad.verified,false);assert.equal(bad.canCommit,false);
 assert.ok(bad.issues.some(issue=>issue.category==='knowledge'&&issue.severity==='error'));
 assert.equal(bad.rewritten,false);assert.equal(bad.attempts,1);assert.equal(rewrites,1);
 assert.equal(calls,3);assert.deepEqual((await run.read()).document,saved.document);
});
