import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {DeepSeekClient} from '../tools/deepseek-client.mjs';
import {createPlaytestServer,runPlaytest} from '../tools/playtest-runner.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';
import {candidateSelectionRequest,selectedCandidateCall,confirmTurnCandidates} from '../extension/turn-contract.mjs';
import {modelContextProjection,modelToolResult} from '../extension/turn.mjs';
import {modelActionCatalog,estimateModelActionTokens,builderToolCall} from '../extension/tools.mjs';

const response=ref=>({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'confirm',type:'function',function:{name:'world_confirm',arguments:JSON.stringify({ref})}}]}}]});
async function fixture(t,input){
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());
 const view=await server.api('create',{}),campaignId=view.reference.campaignId;
 const begun=await server.api('review/begin',{campaignId,anchor:'confirm',playerText:input,expectedSequence:view.reference.sequence});
 return {server,view,campaignId,preview:begun.preview,async execute(name,args){const routed=name==='world_act'?builderToolCall(args.action,args.slots):{tool:name,args};return server.api('execute',{campaignId,anchor:'confirm',eventId:'confirmed',expectedSequence:view.reference.sequence,...routed});}};
}

test('普通购买：只读生成3–5候选、参数来自场景与原话，strict引用确认后真实结算',async t=>{
 const input='我买两个面包',f=await fixture(t,input),before=structuredClone(f.view.document);
 assert.ok(f.preview.candidates.length>=3&&f.preview.candidates.length<=5);
 const candidate=f.preview.candidates.find(row=>row.id==='core:trade.buy'&&row.slots.item==='item_bread');
 assert.ok(candidate);assert.equal(candidate.slots.seller,'npc_hw_linsui');assert.equal(candidate.slots.quantity,2);
 assert.ok(f.preview.choices.some(row=>row.ref==='none'));
 assert.deepEqual((await f.server.api('read',{campaignId:f.campaignId})).document,before);
 const request=candidateSelectionRequest(f.preview,input),fn=request.tools[0].function;
 assert.ok(f.preview.candidates.every(row=>row.match.input===input));
 assert.ok(!request.messages[0].content.includes('"input"'),'引擎原话校验值不重复发送给模型，匹配依据仍保留');
 assert.ok(request.messages[0].content.includes('"basis"'));
 assert.equal(fn.strict,true);assert.deepEqual(fn.parameters.required,['ref']);assert.equal(fn.parameters.additionalProperties,false);
 assert.deepEqual(request.tool_choice,{type:'function',function:{name:'world_confirm'}});assert.equal(request.thinking.type,'disabled');
 const result=await confirmTurnCandidates({preview:f.preview,playerText:input,generate:async()=>response(candidate.ref),execute:f.execute});
 assert.equal(result.status,'executed');assert.equal(result.result.result.receipt.status,'committed');
 const after=(await f.server.api('read',{campaignId:f.campaignId})).document;
 const quantity=row=>typeof row==='number'?row:row?.quantity??0;
 assert.equal(quantity(after.state.inventory.item_bread)-quantity(before.state.inventory.item_bread),2);
 assert.ok(after.state.player.coins<before.state.player.coins);
});

test('不存在引用、额外参数、夹带动作及缺槽均不执行，唯一匹配也必须模型确认',async t=>{
 const input='等10分钟',f=await fixture(t,input);let generated=0,executed=0;
 const candidate=f.preview.candidates.find(row=>row.match.complete);
 assert.equal(f.preview.candidates.filter(row=>row.match.complete).length,1);
 for(const selection of [{ref:'missing'},{ref:candidate.ref,slots:{minutes:100}},{ref:candidate.ref,action:'core:time'},{ref:'no_action'}])assert.throws(()=>selectedCandidateCall(f.preview,input,selection));
 await confirmTurnCandidates({preview:f.preview,playerText:input,generate:async()=>{generated++;return response(candidate.ref);},execute:async(name,args)=>{executed++;assert.equal(name,'world_act');assert.deepEqual(args,{action:'core:time',slots:{minutes:10}});return {ok:true};}});
 assert.equal(generated,1);assert.equal(executed,1);
 const missing=await fixture(t,'等待');
 const row=missing.preview.candidates.find(row=>row.match.complete);
 assert.ok(row.missing.includes('minutes'));assert.throws(()=>selectedCandidateCall(missing.preview,'等待',{ref:row.ref}),/缺槽/);
 assert.equal(selectedCandidateCall(missing.preview,'等待',{ref:'clarify'}),null);
});

for(const input of ['我用歌声安抚这头狼','把池水净化后卖掉','我用歌声攻击这头狼'])test(`创意原意保留；近似项禁止替代：${input}`,async t=>{
 const f=await fixture(t,input);assert.ok(!f.preview.candidates.some(row=>row.match.complete));
 const near=f.preview.candidates[0];assert.equal(near.match.input,input);assert.ok(near.match.basis);
 assert.throws(()=>selectedCandidateCall(f.preview,input,{ref:near.ref}),/完整原意/);
 let actual;
 const result=await confirmTurnCandidates({preview:f.preview,playerText:input,generate:async()=>response('none'),execute:async(name,args)=>{actual={name,args};return f.execute(name,args);}});
 assert.deepEqual(actual,{name:'world_act',args:{action:'open:proposal',slots:{intent:input}}});
 assert.equal(result.result.result.receipt.routing.proposal.intent,input);
});

test('模型投影去引擎元数据但保留拒因、成本、效果、缺槽和来源；目录仍≤1200 token',async t=>{
 const f=await fixture(t,'等待');
 const receipt={status:'committed',source:{kind:'catalog',id:'core:time'},cost:{time:10},applied:[{op:'time',minutes:10}],reason:'真实原因',missing:['target'],worldEventVersion:2,replayMetadata:{secret:'internal'},afterHash:'internal',sequence:12};
 const raw={receipt,version:1,otherVersion:2,scene:{lawVersion:7,source:'world law'}};
 const result=modelToolResult(raw),text=JSON.stringify(result);
 assert.doesNotMatch(text,/Version|version|afterHash|replayMetadata|sequence/);
 for(const key of ['status','source','cost','applied','reason','missing'])assert.deepEqual(result.receipt[key],receipt[key]);
 assert.equal(modelContextProjection(raw).scene.source,'world law');assert.equal(raw.receipt.worldEventVersion,2);
 const menu=modelActionCatalog(await f.server.api('actions',{campaignId:f.campaignId,query:'买'}));
 assert.ok(estimateModelActionTokens(menu)<=1200);
});

test('离线runner首个请求必须strict确认，叙述阶段不能另造动作参数',async t=>{
 const server=await createPlaytestServer({consistencyClient:null});t.after(()=>server.close());let requests=0;
 const result=await runPlaytest({scenario:{id:'confirm-wait',turns:[{input:'等10分钟',assertions:[{kind:'elapsed',min:10,max:10}]}]},api:server.api,bundle:await loadPromptBundle(),countTokens:async()=>1,
  client:{async generate(body){requests++;if(requests===1){assert.equal(body.tools[0].function.strict,true);assert.equal(body.tool_choice.function.name,'world_confirm');return response('c1');}assert.equal(body.tool_choice,'none');return {choices:[{finish_reason:'stop',message:{content:'你等待了十分钟。<回合 额外="0分" 地点="bld_hw_qingdeng" 在场=""/>'}}]};}}});
 assert.deepEqual(result.turns[0].errors,[]);assert.equal(requests,2);
 assert.ok(result.turns[0].assertions.every(row=>row.pass));
});

test('直连选择请求使用Beta strict端点，仍是Flash非思考（离线fetch桩）',async t=>{
 const previousFetch=globalThis.fetch,previousKey=process.env.DEEPSEEK_API_KEY;
 const directory=await fs.mkdtemp(path.join(tmpRoot(),'confirm-http-'));
 t.after(async()=>{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;await fs.rm(directory,{recursive:true,force:true});});
 process.env.DEEPSEEK_API_KEY='offline-confirm-fixture';
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.deepseek.com/beta/chat/completions');
  const request=JSON.parse(options.body);assert.equal(request.model,'deepseek-flash');assert.equal(request.thinking.type,'disabled');
  assert.equal(request.tools[0].function.strict,true);assert.deepEqual(request.tools[0].function.parameters.required,['ref']);
  return {ok:true,json:async()=>({...response('none'),usage:{prompt_tokens:10,completion_tokens:2,prompt_cache_hit_tokens:0,prompt_cache_miss_tokens:10}})};
 };
 const client=new DeepSeekClient({budgetYuan:1,logFile:path.join(directory,'usage.jsonl')});
 await client.generate(candidateSelectionRequest({candidates:[]},'唱歌安抚狼'),'offline');
});

test('实际宿主传输：首次strict确认转引擎参数；后续叙述夹带动作被拦',async t=>{
 const input='等10分钟',f=await fixture(t,input),session={chatId:'fixture',preview:f.preview};let sent=0;
 const env={window:{},location:{origin:'http://fixture'},active:()=>true,view:{},mode:'normal',reviewTurn:session,WAITING:'待审',reviewsPending:0,blocked:null,
  ctx:()=>({chatId:'fixture',chat:[{is_user:true,mes:input}]}),getActionModes:()=>({intent:'propose',narration:'sync'}),candidateSelectionRequest,selectedCandidateCall,
  originalFetch:async(_input,options)=>{sent++;const body=JSON.parse(options.body);
   if(sent===1){assert.equal(body.tools.length,1);assert.equal(body.tools[0].function.strict,true);assert.equal(body.tool_choice.function.name,'world_confirm');assert.equal(body.include_reasoning,false);}
   else {assert.deepEqual(body.tools,[]);assert.equal(body.tool_choice,'none');}
   return new Response(JSON.stringify(sent===1?response('c1'):{choices:[{message:{tool_calls:[{id:'forged',function:{name:'world_act',arguments:'{"action":"core:time","slots":{"minutes":999}}'}}]}}]}),{headers:{'Content-Type':'application/json'}});
  }};
 const source=await fs.readFile(new URL('../extension/runtime.js',import.meta.url),'utf8');
 const transport=source.slice(source.indexOf('window.fetch=async function'),source.indexOf('\nasync function load(){'));
 const guarded=new Function('env',`with(env){${transport};return window.fetch;}`)(env);
 const request=()=>guarded('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify({stream:false})});
 const first=await (await request()).json(),call=first.choices[0].message.tool_calls[0];
 assert.equal(call.function.name,'world_act');assert.deepEqual(JSON.parse(call.function.arguments),{action:'core:time',slots:{minutes:10}});
 assert.equal(session.confirmed,true);
 const second=await (await request()).json();assert.deepEqual(second.choices[0].message.tool_calls,[]);
});
