import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {finishContractTurn,noActionTool,publishedTurnText} from '../extension/turn-contract.mjs';
import {createPlaytestServer,runPlaytest} from '../tools/playtest-runner.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';
import {reviewResponse} from './helpers/consistency-response.mjs';
import {toolDefinitions} from '../extension/tools.mjs';
import {builderToolCall} from '../extension/tools.mjs';
import {parseTurn,modelToolAllowed,actionCompletion,toolResultWithClock,modelToolResult} from '../extension/turn.mjs';
import {isOutOfCharacter} from '../extension/prompt.mjs';

const fixtures=JSON.parse(await fs.readFile(new URL('./fixtures/turn-gate-real-replies.json',import.meta.url),'utf8')).cases;
const call=(name,args={},id='retry')=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const response=message=>({choices:[{finish_reason:'stop',message}]});

for(const fixture of fixtures)for(const outcome of ['settled','no-action','no-call']){
 test(`${fixture.id} 原零调用草稿：补跑 ${outcome}，发布与历史只收已审结果`,async()=>{
  // These archived replies lack original snapshots. This is orchestration
  // regression, not a fabricated historical world replay.
  const order=[],requests=[],history=[],diagnostics=[fixture.originalReply];let settled=false,sealed=0,executions=0;
  const safeText='尚未发生；请从候选选择或继续构造。';
  const gate=async()=>{assert.equal(sealed,0);order.push('gate');return {status:settled?'ready':'pending',safeText,candidates:[{id:'supported-action'}],facts:[],settlement:{status:settled?'settled':'pending'}};};
  const state={};
  const result=await finishContractTurn({playerText:fixture.input,draft:fixture.originalReply,gate,state,
   tools:[{type:'function',function:{name:'world_act',parameters:{type:'object',properties:{}}}}],messages:[{role:'user',content:fixture.input}],
   generate:async(body,label)=>{
    requests.push(body);order.push(label);assert.doesNotMatch(JSON.stringify(body),new RegExp(fixture.originalReply.slice(0,12)));
    if(label==='turn-retry-narration'){assert.equal(settled,true);return response({content:'正式回执后的叙述。'});}
    assert.equal(body.tool_choice,'required');assert.deepEqual(body.thinking,{type:'disabled'});assert.equal(body.stream,false);
    assert.ok(body.tools.some(tool=>tool.function.name===noActionTool.function.name));
    if(outcome==='no-action')return response({tool_calls:[call('world_no_action')]});
    if(outcome==='no-call')return response({content:'仍试图直接叙述'});
    return response({content:fixture.originalReply,tool_calls:[call('world_act',{action:'supported-action'})]});
   },
   execute:async()=>{order.push('execute');executions++;settled=true;return {ok:true,receipt:{status:'committed',eventId:'actual-event'}};},
   onTools:(assistant,results)=>{assert.equal(assistant.content,null);history.push(assistant,...results);},
   review:async draft=>{order.push('seal');sealed++;assert.equal(draft,outcome==='settled'?'正式回执后的叙述。':fixture.originalReply);return {status:settled?'verified':'pending',canCommit:settled,text:settled?draft:safeText,safeText:settled?undefined:safeText};}});
  history.push({role:'assistant',content:result.text});
  assert.equal(result.text,outcome==='settled'?'正式回执后的叙述。':safeText);
  assert.equal(executions,outcome==='settled'?1:0);assert.equal(sealed,1);
  assert.equal(requests.filter(body=>body.tool_choice==='required').length,1);assert.equal(state.retryStarted,true);
  assert.equal(result.retry.calls,outcome==='settled'?2:1);assert.equal(order.at(-1),'seal');
  assert.ok(!JSON.stringify(history).includes(fixture.originalReply));assert.equal(diagnostics[0],fixture.originalReply);
 });
}

test('场外不补跑；补跑故障保留模板；无行动不能夹带写操作',async()=>{
 let writes=0,requests=0;
 for(const mode of ['ooc','failure','mixed']){
  const result=await finishContractTurn({playerText:mode==='ooc'?'（场外）解释一下':'我只观察',draft:'未经验证的裁决',
   gate:async()=>({status:'pending',safeText:'尚未发生'}),
   tools:[{type:'function',function:{name:'write'}}],
   generate:async()=>{requests++;if(mode==='failure')throw Error('超时');return response({tool_calls:[call('world_no_action'),call('write',{},'other')]});},
   execute:async()=>{writes++;},review:async()=>({status:'pending',canCommit:false,safeText:'尚未发生'})});
  assert.equal(result.text,'尚未发生');assert.equal(result.retry.attempted,mode!=='ooc');
 }
 assert.equal(writes,0);assert.equal(requests,2);
 assert.equal(publishedTurnText({canCommit:false,text:'被拒原稿'},{safeText:'模板'}),'模板');
});

test('gate 可重复读取、检索仍开放，真实工具结算后唯一封口；旧版本与撤销继续拒绝',async t=>{
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());
 let view=await server.api('create',{});const campaignId=view.reference.campaignId,anchor='gate-preflight';
 const before=structuredClone(view.document);
 const begin=await server.api('review/begin',{campaignId,anchor,playerText:'我买一个面包',expectedSequence:view.reference.sequence,captureSearch:true});
 const request=()=>({campaignId,token:begin.token,expectedSequence:view.reference.sequence});
 const first=await server.api('review/gate',request());assert.equal(first.status,'pending');
 assert.deepEqual(await server.api('review/gate',request()),first);
 const file=path.join(server.directory,'infinite-fields',campaignId,'consistency',`${begin.token}.json`);
 const open=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(open.result,undefined);assert.equal(open.retrieval.sealed,undefined);assert.equal(open.retrieval.status,'open');
 assert.deepEqual((await server.api('read',{campaignId})).document,before);
 await server.api('search',{...request(),anchor,query:'林穗'});
 await server.api('execute',{campaignId,anchor,eventId:'bread',tool:'world_trade',args:{seller:'林穗',item:'面包',quantity:1},expectedSequence:view.reference.sequence});
 view=await server.api('read',{campaignId});
 const ready=await server.api('review/gate',request());assert.equal(ready.status,'ready');assert.equal(ready.settlement.settled.length,1);
 assert.ok(ready.facts.every(row=>row.knownBy.includes('player')));assert.ok(ready.settlement.facts.every(row=>row.knownBy.includes('player')));
 await assert.rejects(server.api('review/gate',{...request(),expectedSequence:0}),/变化/);
 const review=await server.api('review/reply',{...request(),draft:'原稿不能发布'});assert.ok(review.safeText);assert.equal(review.original,'原稿不能发布');
 await assert.rejects(server.api('review/gate',request()),/封口/);
 await server.api('reconcile',{campaignId,validAnchors:[]});
 await assert.rejects(server.api('review/gate',request()),/撤销|变化/);
});

test('runner 首轮零调用后 required 补跑真实等待，叙述在结算之后，原稿不进历史或索引',async t=>{
 const server=await createPlaytestServer({consistencyClient:{async generate(body){return reviewResponse(body);}}});t.after(()=>server.close());
 const requests=[],endpoints=[];const original='模型没有结算便宣称已等完。';
 const client={async generate(body){requests.push(body);
  if(body.tool_choice==='required')return response({tool_calls:[call('world_time',{minutes:10})]});
  if(body.tool_choice==='none')return response({content:'你原地休息了十分钟。<回合 额外="0分" 地点="bld_hw_qingdeng" 在场=""/>'});
  return response({content:original});
 }};
 const api=async(name,body)=>{endpoints.push({name,body:structuredClone(body)});return server.api(name,body);};
 const result=await runPlaytest({scenario:{id:'retry-wait',turns:[{input:'我原地休息十分钟。',assertions:[{kind:'elapsed',min:10,max:10}]}]},api,client,bundle:await loadPromptBundle(),countTokens:async()=>1});
 assert.deepEqual(result.turns[0].errors,[]);assert.equal(result.turns[0].toolRetry.calls,2);assert.equal(requests.length,3);
 assert.equal(result.turns[0].originalReply,original);assert.ok(!JSON.stringify(result.session).includes(original));
 assert.ok(!JSON.stringify(endpoints.filter(row=>row.name==='sync-index')).includes(original));
 const written=endpoints.filter(row=>row.name==='execute');assert.deepEqual(written.map(row=>row.body.tool),['world_time','world_turn']);
 assert.equal(endpoints.filter(row=>row.name==='review/reply').length,1);
 assert.equal(result.session.history.filter(row=>row.role==='tool').length,1);assert.equal(result.turns[0].assertions.every(row=>row.pass),true);
});

test('runner 三条真实零调用原稿均被 pending 模板替换，无行动和零返回均只补跑一次',async t=>{
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());
 const bundle=await loadPromptBundle();
 for(const fixture of fixtures)for(const noAction of [true,false]){
  const synced=[];let calls=0;
  const client={async generate(body){calls++;
   return response(body.tool_choice==='required'?(noAction?{tool_calls:[call('world_no_action')]}:{content:fixture.originalReply}):{content:fixture.originalReply});
  }};
  const result=await runPlaytest({scenario:{id:`${fixture.id}-${noAction}`,turns:[{input:fixture.input,assertions:[{kind:'elapsed',min:0,max:0}]}]},
   api:async(name,body)=>{if(name==='sync-index')synced.push(structuredClone(body));return server.api(name,body);},
   client,bundle,countTokens:async()=>1});
  assert.deepEqual(result.turns[0].errors,[]);assert.equal(calls,2);assert.equal(result.turns[0].consistency.status,'pending');
  assert.equal(result.turns[0].reply,result.turns[0].consistency.safeText);assert.equal(result.turns[0].toolRetry.calls,1);
  assert.ok(!JSON.stringify(result.session).includes(fixture.originalReply));assert.ok(!JSON.stringify(synced).includes(fixture.originalReply));
  const exported=await server.api('export',{campaignId:result.session.campaignId});assert.equal(exported.events.length,0);
 }
});

test('界面行动补叙严格绑定 eventId/sequence，禁止尾注与混入另一界面行动',async t=>{
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());
 let view=await server.api('create',{});const campaignId=view.reference.campaignId;
 const start=await server.api('review/begin',{campaignId,anchor:null,eventId:'ui-wait',playerText:'界面选择休息十分钟',expectedSequence:view.reference.sequence});
 await server.api('execute',{campaignId,anchor:null,eventId:'ui-wait',tool:'world_time',args:{minutes:10},expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});
 const body={campaignId,token:start.token,expectedSequence:view.reference.sequence};
 assert.equal((await server.api('review/gate',body)).status,'ready');
 const reviewed=await server.api('review/reply',{...body,draft:'你休息了十分钟。'});
 await assert.rejects(server.api('execute',{campaignId,anchor:null,eventId:'ui-tail',tool:'world_turn',args:reviewed.tail.args,reviewId:start.token,expectedSequence:view.reference.sequence}),/不一致/);
 const next=await server.api('review/begin',{campaignId,anchor:null,eventId:'ui-next',playerText:'下一行动',expectedSequence:view.reference.sequence});
 await server.api('execute',{campaignId,anchor:null,eventId:'ui-other',tool:'world_time',args:{minutes:1},expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});
 await assert.rejects(server.api('review/gate',{campaignId,token:next.token,expectedSequence:view.reference.sequence}),/混入/);
});

test('实际 afterReply 接点：等待改写时隐藏且隔离原稿，通过后只提交一次尾注',{timeout:15000},async t=>{
 const requests=[],endpoints=[];let release,entered;
 const held=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
 const final='<q who="npc_hw_linsui">面包给你。</q><回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>';
 const server=await createPlaytestServer({consistencyClient:{async generate(body,label){
  requests.push({body,label});
  if(label.startsWith('consistency-rewrite:')){entered();await held;return response({content:final});}
  return reviewResponse(body);
 }}});t.after(()=>server.close());
 let view=await server.api('create',{});const campaignId=view.reference.campaignId,anchor='actual-after-reply';
 const session={...await server.api('review/begin',{campaignId,anchor,playerText:'我付钱买一个面包',expectedSequence:view.reference.sequence,captureSearch:true}),chatId:'fixture'};
 const startMinute=view.document.state.minute;
 await server.api('execute',{campaignId,anchor,eventId:'trade',tool:'world_trade',args:{seller:'林穗',item:'面包',quantity:1},expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});
 const original='<q who="npc_unregistered">面包给你。</q><回合 额外="0分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>';
 const message={mes:original,swipes:['已验证的旧版本',original],swipe_id:1},chat=[{mes:'开场'},{is_user:true,mes:'我付钱买一个面包',extra:{fields_anchor:anchor}},message];
 const context={chat,chatId:'fixture',saveChat:async()=>{assert.ok(!JSON.stringify(chat).includes(original));}};
 const text={hidden:false},classes=new Set();
 const element={setAttribute:()=>{},classList:{remove:name=>classes.delete(name),add:name=>classes.add(name)},querySelector:()=>null};
 const env={active:()=>true,get view(){return view;},set view(value){view=value;},mode:'normal',blocked:null,ctx:()=>context,turnStart:startMinute,reviewTurn:session,
  reviewing:new WeakMap(),reviewEdits:new WeakMap(),WAITING:'正在核对',reviewsPending:0,indexedMessages:[],
  document:{querySelector:()=>element},render:()=>{text.hidden=message.extra?.fields_narration_pending==='sync';},
  getActionModes:()=>({intent:'propose',narration:'sync'}),getSettings:()=>({}),toolDefinitions,modelToolAllowed,parseTurn,isOutOfCharacter,
  anchor:()=>env.reviewTurn.anchor,finishContractTurn,publishedTurnText,controlledGenerate:()=>{throw Error('本测试已有裁决，不应补跑');},
  api:async(name,body)=>{endpoints.push({name,body});return server.api(name,body);},
  execute:async(tool,args,eventId,reviewId)=>{
   endpoints.push({name:'execute',body:{tool}});
   const result=await server.api('execute',{campaignId,anchor:env.reviewTurn.anchor,tool,args,eventId,reviewId,expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});return result;
  },syncHistory:async()=>{assert.ok(!JSON.stringify(chat).includes(original));},actionError:()=>{},renderCandidates:()=>{}};
 const source=await fs.readFile(new URL('../extension/runtime.js',import.meta.url),'utf8');
 const actual=source.slice(source.indexOf('async function afterReply(index){'),source.indexOf('\nfunction renderCandidates('));
 const afterReply=new Function('env',`with(env){${actual};return afterReply;}`)(env);
 const first=afterReply(2),duplicate=afterReply(2);await started;
 assert.equal(text.hidden,true);assert.equal(message.mes,env.WAITING);assert.ok(!JSON.stringify(chat).includes(original));
 assert.equal(message.swipes[0],'已验证的旧版本');assert.equal(message.swipes[1],env.WAITING);
 assert.equal(endpoints.filter(row=>row.body?.tool==='world_turn').length,0);
 release();await Promise.all([first,duplicate]);
 assert.equal(message.mes,final);assert.equal(message.extra.fields_consistency.status,'verified');assert.equal(message.extra.fields_consistency.attempts,1);
 assert.equal(message.swipes[0],'已验证的旧版本');assert.equal(message.swipes[1],final);
 assert.equal(text.hidden,false);assert.equal(classes.has('fields-review-visible'),true);
 assert.equal(endpoints.filter(row=>row.body?.tool==='world_turn').length,1);assert.equal(requests.length,3);
 assert.equal(env.reviewsPending,0);
 // The browser's second normalization scenario must retain the fact that its
 // five-minute tail was normalized, with the original only in diagnostics.
 const waitAnchor='actual-wait',input='我原地休息十分钟，不再聊天。';
 context.chat.push({is_user:true,mes:input,extra:{fields_anchor:waitAnchor}});env.turnStart=view.document.state.minute;
 env.reviewTurn={...await server.api('review/begin',{campaignId,anchor:waitAnchor,playerText:input,expectedSequence:view.reference.sequence}),chatId:'fixture'};
 await server.api('execute',{campaignId,anchor:waitAnchor,eventId:'wait',tool:'world_time',args:{minutes:10},expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});
 const waiting={mes:'<q who="npc_hw_linsui">歇好了。<回合 额外="5分" 地点="bld_hw_qingdeng" 在场="npc_hw_linsui"/>'};context.chat.push(waiting);
 await afterReply(context.chat.length-1);
 assert.equal(waiting.extra.fields_consistency.protocol.changed,true);assert.match(waiting.mes,/额外="0分"/);
 assert.equal(waiting.extra.fields_consistency.original,undefined);
 // Root of the pre-existing browser false/true failure: a later explicit
 // execute must not reopen the completed anchor merely to clear UI feedback.
 Object.assign(env,{queue:fn=>fn(),load:async()=>{},ensureReviewTurn:()=>{throw Error('旧锚点已经封口');},persist:async()=>{},refresh:async()=>{},
  actionCompletion,toolResultWithClock,modelToolResult,ambientAudio:{noteAction:()=>{}},recordFeed:()=>{},fail:error=>{throw error;}});
 const executeSource=source.slice(source.indexOf('async function execute(tool,'),source.indexOf('// A1 界面动作'));
 const actualExecute=new Function('env',`with(env){${executeSource};return execute;}`)(env);
 const beforeLater=view.document.state.minute,later=await actualExecute('world_time',{minutes:1},'after-publication');
 assert.notEqual(later.ok,false);assert.equal(view.document.state.minute,beforeLater+1);
 assert.equal(endpoints.findLast(row=>row.name==='execute').body.anchor,null);
});

test('实际宿主传输接点：流式被阻止，原稿在交给宿主前隔离，受控 quiet 请求保持可用',async()=>{
 const source=await fs.readFile(new URL('../extension/runtime.js',import.meta.url),'utf8');
 const original=fixtures[1].originalReply,session={chatId:'fixture'};let sent=0;
 const env={window:{},location:{origin:'http://fixture'},active:()=>true,view:{},mode:'normal',reviewTurn:session,WAITING:'正在核对',reviewsPending:0,blocked:null,
  controlledRequest:null,ctx:()=>({chatId:'fixture'}),getActionModes:()=>({intent:'propose',narration:'sync'}),
  originalFetch:async()=>{sent++;return new Response(JSON.stringify(response({content:original})),{headers:{'Content-Type':'application/json'}});}};
 const transport=source.slice(source.indexOf('window.fetch=async function'),source.indexOf('\nasync function load(){'));
 const guarded=new Function('env',`with(env){${transport};return window.fetch;}`)(env);
 const request=type=>({method:'POST',body:JSON.stringify({type,stream:false})});
 const data=await (await guarded('/api/backends/chat-completions/generate',request('normal'))).json();
 assert.equal(data.choices[0].message.content,env.WAITING);assert.equal(session.draft,original);
 assert.ok(!JSON.stringify(data).includes(original));
 await assert.rejects(guarded('/api/backends/chat-completions/generate',{body:JSON.stringify({type:'normal',stream:true})}),/非流式/);
 assert.equal(sent,1);
 env.reviewsPending=1;env.controlledRequest={tool_choice:'required',thinking:{type:'disabled'},stream:false};
 await assert.rejects(guarded('/api/backends/chat-completions/generate',request('normal')),/仍在核对/);
 const quiet=await (await guarded('/api/backends/chat-completions/generate',request('quiet'))).json();assert.equal(quiet.choices[0].message.content,original);
 let settingsHook;env.context={eventTypes:{CHAT_COMPLETION_SETTINGS_READY:'settings'},eventSource:{on:(_event,callback)=>{settingsHook=callback;}}};
 const settings=source.slice(source.indexOf('context.eventSource.on(context.eventTypes.CHAT_COMPLETION_SETTINGS_READY'),source.indexOf("context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY"));
 new Function('env',`with(env){${settings}}`)(env);
 const normal={type:'normal',tool_choice:'auto'};settingsHook(normal);assert.equal(normal.tool_choice,'auto');
 const controlled={type:'quiet',include_reasoning:true};settingsHook(controlled);
 assert.equal(controlled.tool_choice,'required');assert.equal(controlled.include_reasoning,false);assert.equal(controlled.stream,false);
});

test('实际 act 接点：先显示界面结算模板，异步补叙绑定该事件，不借聊天尾注',{timeout:15000},async t=>{
 const server=await createPlaytestServer({consistencyClient:{async generate(body){return reviewResponse(body);}}});t.after(()=>server.close());
 let view=await server.api('create',{}),release,requested,finished;
 const barrier=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{requested=resolve;}),done=new Promise(resolve=>{finished=resolve;});
 const context={chatId:'ui-fixture',chatMetadata:{},saveChat:async()=>{if(context.chatMetadata.fields_event_feed?.[0]?.narration)finished();}};
 const endpoints=[];
 const env={get view(){return view;},set view(value){view=value;},generating:false,reviewsPending:0,blocked:null,FEED:'fields_event_feed',ctx:()=>context,
  queue:fn=>fn(),load:async()=>{},getActionModes:()=>({intent:'propose',narration:'async'}),builderToolCall,actionCompletion,readStateSection:()=>{},
  api:async(name,body)=>{endpoints.push({name,body});return server.api(name,body);},
  recordFeed:lines=>{const entry={lines};context.chatMetadata.fields_event_feed=[entry];return entry;},
  ambientAudio:{noteAction:()=>{}},persist:async()=>{},refresh:async()=>{},render:()=>{},
  publishedTurnText,turnFactsPrompt:(await import('../extension/turn-contract.mjs')).turnFactsPrompt,
  controlledGenerate:async body=>{assert.equal(body.tool_choice,'none');requested();await barrier;return response({content:'你歇了十分钟。<回合 额外="0分" 地点="bld_hw_qingdeng" 在场=""/>'});}};
 const source=await fs.readFile(new URL('../extension/runtime.js',import.meta.url),'utf8');
 // act 依赖其上方的模块级未结动作表（s5ca 635ac008 起），一并取真实源码，不在 env 里另造。
 const actual=source.slice(source.indexOf('const unsettledActs='),source.indexOf('\nasync function modelActions('));assert.ok(actual.includes('async function act(action,'));
 const act=new Function('env',`with(env){${actual};return act;}`)(env);
 const result=await act('core:time',{minutes:10},{eventId:'ui-bound-action'});assert.notEqual(result.ok,false);await started;
 const entry=context.chatMetadata.fields_event_feed[0];assert.match(entry.lines.join('\n'),/10分钟/);
 assert.equal(entry.eventId,'ui-bound-action');assert.equal(entry.sequence,view.reference.sequence);
 assert.equal(endpoints.find(row=>row.name==='execute').body.anchor,null);
 assert.equal(endpoints.find(row=>row.name==='review/begin').body.eventId,'ui-bound-action');
 release();await done;
 assert.match(entry.lines.join('\n'),/歇了十分钟/);assert.equal(entry.narration.eventId,'ui-bound-action');
 assert.equal(endpoints.filter(row=>row.name==='execute').length,1);
 const exported=await server.api('export',{campaignId:view.reference.campaignId});assert.equal(exported.events.length,1);assert.equal(exported.events[0].anchor,null);
});
