import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {normalizeReplyProtocol,parseTurn,fullyTimedWait} from '../extension/turn.mjs';
import {visibleReply} from '../extension/message-view.mjs';
import {reviewConsistency,consistencyReviewRequest,deterministicConsistencyReview} from '../server-plugin/consistency-review.mjs';
import {createPlaytestServer,runPlaytest} from '../tools/playtest-runner.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';

const root=new URL('../docs/测试报告/M2-recheck-003/',import.meta.url);
const report=JSON.parse(await fs.readFile(new URL('真实试玩.json',root),'utf8'));
const budget=JSON.parse(await fs.readFile(new URL('persistent-budget.json',root),'utf8'));
const recorded=label=>Object.values(budget.requests).find(row=>row.label===label);
const response=issues=>({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:'report_consistency_issues',arguments:JSON.stringify({issues})}}]}}]});
const reply=content=>({choices:[{finish_reason:'stop',message:{content}}]});
const cases=['npc_delivery','npc_home_visit','npc_offscreen','npc_shove'].map(id=>({id,turn:report.results.find(row=>row.id===id).turns.at(-1)}));
function savedInput(row){
 const p=JSON.parse(row.request.messages[1].content),evidence=new Map(p.evidence.map(e=>[e.id,e]));
 const json=id=>JSON.parse(evidence.get(id).text);
 return {draft:p.rawDraft,playerText:p.playerText,before:json('before'),after:json('after'),clock:json('clock'),
  allowedEntities:json('registry'),blocklist:json('blocklist'),scene:evidence.get('scene')?.text,retrieval:evidence.has('retrieval')?json('retrieval'):undefined,
  receipts:p.evidence.filter(e=>e.id.startsWith('receipt:')).map(e=>JSON.parse(e.text)),
  knowledge:Object.fromEntries(p.evidence.filter(e=>e.id.startsWith('knowledge:')).map(e=>[e.id.slice(10),JSON.parse(e.text)])),
  priorEvidence:p.evidence.filter(e=>e.id.startsWith('prior:')).map(e=>({kind:e.kind,text:e.text}))};
}

test('第三轮四场原稿仅规范尾注，120/60/14400/10分钟不追加，原正文不改',()=>{
 for(const {id,turn} of cases){
  const wait=turn.calls.find(row=>row.tool==='world_time'),clock={...wait.result.turnClock,location:turn.location,present:turn.consistency.tail.args.present};
  const original=turn.originalReply,normalized=normalizeReplyProtocol(original,{clock,playerText:turn.input,receipts:turn.calls});
  const parsed=parseTurn(normalized.text,clock);
  assert.equal(parsed.valid,true,id);assert.equal(parsed.args.extraMinutes,0,id);
  assert.equal(parsed.visible,parseTurn(original,clock).visible,id);
  assert.equal(normalized.changed,id!=='npc_home_visit');assert.equal(normalized.originalTail.visible,parsed.visible);
  assert.equal(normalizeReplyProtocol(normalized.text,{clock,playerText:turn.input,receipts:turn.calls}).changed,false);
 }
});

test('明确等待后交谈可计时，失败或未足量等待不能套用零时长，回退保持parseTurn语义',()=>{
 const clock={location:'bld_hw_mill',startMinute:540,minute:600,present:['npc_hw_ayan']},receipts=[{tool:'world_time',args:{minutes:60},result:{ok:true,elapsed:60}}];
 const raw='等完了。<回合 额外="5分" 地点="bld_hw_mill" 在场="npc_hw_ayan"/>';
 const input={clock,receipts,playerText:'我等一小时，然后问阿砚忙了什么。'};
 assert.equal(fullyTimedWait(input),false);assert.equal(normalizeReplyProtocol(raw,input).text,raw);
 assert.equal(fullyTimedWait({...input,playerText:'我等一小时。',receipts:[{...receipts[0],result:{ok:false}}]}),false);
 assert.equal(fullyTimedWait({...input,playerText:'我等一小时。',clock:{...clock,minute:590}}),false);
 for(const value of ['正文无尾注','正文<回合 额外="坏" 地点="bld_hw_mill"/>']){
  const normalized=normalizeReplyProtocol(value,{clock:{...clock,minute:540},receipts:[],playerText:'我看看。'});
  assert.equal(parseTurn(normalized.text,{...clock,minute:540}).args.extraMinutes,10);
 }
 const mismatched=normalizeReplyProtocol('正文<回合 额外="5分" 地点="loc_bs" 在场="npc_unknown,npc_hw_ayan"/>',input);
 assert.equal(parseTurn(mismatched.text,clock).valid,true);assert.deepEqual(mismatched.args.present,['npc_hw_ayan']);assert.equal(mismatched.args.location,clock.location);
 assert.equal(normalizeReplyProtocol('场外回答',{clock,outOfCharacter:true}).text,'场外回答');
});

test('原home_visit审稿自认11:35无误不能触发正文改写，请求给出实际时刻与差值',async()=>{
 const saved=recorded('consistency:b26e7db20827e2cab545'),input=savedInput(saved);let calls=0;
 const result=await reviewConsistency(input,{client:{async generate(body){
  calls++;const clock=JSON.parse(JSON.parse(body.messages[1].content).evidence.find(row=>row.id==='clock').text);
  assert.equal(clock.currentTime,'11:35');assert.equal(clock.elapsedMinutes,60);return saved.response;
 }}});
 assert.equal(calls,1);assert.equal(result.verified,true);assert.equal(result.rewriteRequest,null);assert.deepEqual(result.issues,[]);
 const genuine={category:'time',severity:'error',quote:'现在十一点三十五分',reason:'账本实际是11:45',evidence:[{id:'clock',quote:'"minute":705'}]};
 const rejected=await reviewConsistency({...input,clock:{...input.clock,minute:705}},{client:{generate:async()=>response([genuine])}});
 assert.equal(rejected.issues[0].severity,'error');assert.ok(rejected.rewriteRequest);
 const permissionIssue={...genuine,quote:'现在十一点三十五分，进入筛种院的许可已在十点五十五分到期。',reason:'当前时间本身无误，但许可仍有效，正文错误称到期。',evidence:[{id:'after',quote:'"minute":695'}]};
 const permission=await reviewConsistency(input,{client:{generate:async()=>response([permissionIssue])}});
 assert.equal(permission.issues[0].severity,'error');assert.ok(permission.rewriteRequest,'正确时刻不能掩盖同句其他时间矛盾');
});

test('原删字段引文只修审查一次，保留warning与原响应；完整负评不重抽',async()=>{
 const saved=recorded('consistency:5a40820384c49847ea99'),input=savedInput(saved),originalIssue=JSON.parse(saved.response.choices[0].message.tool_calls[0].function.arguments).issues[0];
 let calls=0;
 const result=await reviewConsistency(input,{client:{async generate(body,label){
  calls++;if(calls===1)return saved.response;
  assert.match(label,/:format$/);assert.match(body.messages.at(-1).content,/不重新审稿/);
  return response([{...originalIssue,evidence:[{id:'registry',quote:'"name":"行囊"'}]}]);
 }}});
 assert.equal(calls,2);assert.equal(result.verified,true);assert.equal(result.issues[0].severity,'warning');assert.equal(result.rewriteRequest,null);
 assert.equal(result.model.correction.attempts,1);assert.equal(result.model.rawResponse,JSON.stringify(saved.response.choices));
 assert.ok(result.model.correction.rawResponse.includes('warning'));
 let completeCalls=0;await reviewConsistency(input,{client:{async generate(){completeCalls++;return response([{...originalIssue,evidence:[{id:'registry',quote:'"name":"行囊"'}]}]);}}});assert.equal(completeCalls,1);
});

test('原坏JSON只修审查一次，保留具体经历warning；两次失效仍unverified',async()=>{
 const saved=recorded('consistency:255286e88651242129e7'),input=savedInput(saved);let calls=0;
 const malformed=saved.response.choices[0].message.tool_calls[0].function.arguments;
 const recovered=JSON.parse(malformed.replace('2"}]}, {"id": "after"','2"}, {"id": "after"')).issues;
 assert.equal(recovered.length,5);
 const fixed=response(recovered.map(issue=>({...issue,evidence:[{id:'retrieval',quote:'"calls":[]'}]})));
 const result=await reviewConsistency(input,{client:{async generate(){return ++calls===1?saved.response:fixed;}}});
 assert.equal(calls,2);assert.equal(result.status,'issues');assert.equal(result.verified,true);assert.equal(result.issues.length,5);assert.equal(result.issues[1].quote,recovered[1].quote);assert.equal(result.model.correction.attempts,1);
 calls=0;const failed=await reviewConsistency(input,{client:{async generate(){calls++;return saved.response;}}});
 assert.equal(calls,2);assert.equal(failed.verified,false);assert.equal(failed.status,'unverified');assert.equal(failed.model.rawResponse,JSON.stringify(saved.response.choices));
 calls=0;const dropped=await reviewConsistency(input,{client:{async generate(){return ++calls===1?saved.response:response([]);}}});
 assert.equal(calls,2);assert.equal(dropped.verified,false);assert.match(dropped.model.reason,/不得删除/);
});

test('格式修正不能通过删除原有负评变成通过',async()=>{
 const saved=recorded('consistency:5a40820384c49847ea99');let calls=0;
 const result=await reviewConsistency(savedInput(saved),{client:{async generate(){return ++calls===1?saved.response:response([]);}}});
 assert.equal(calls,2);assert.equal(result.verified,false);assert.match(result.model.reason,/不得删除/);
});

test('未闭合q只在显示层补边界，登记人物显示姓名，原文仍可追溯',()=>{
 const turn=report.results.find(row=>row.id==='npc_private').turns[5],raw=turn.originalReply??turn.reply;
 assert.match(raw,/<q /);assert.ok(raw.split('<q ').length>raw.split('</q>').length);
 const visible=visibleReply(raw,{npc_hw_wushuo:'吴朔',npc_hw_linsui:'林穗'});
 assert.doesNotMatch(visible,/<q|who=|npc_hw_/);assert.match(visible,/吴朔：|林穗：/);assert.equal(turn.originalReply??turn.reply,raw);
 assert.equal(visibleReply('<q who="npc_hw_ayan">一句。<q who="npc_hw_linsui">两句。</q>',{npc_hw_ayan:'阿砚',npc_hw_linsui:'林穗'}),'阿砚：一句。林穗：两句。');
});

test('四种真实等待经HTTP共同提交路径只计时一次，重读不重新审稿',async t=>{
 for(const {id,turn} of cases){
  let reviewCalls=0;
  const client={async generate(){reviewCalls++;return response([]);}},server=await createPlaytestServer({consistencyClient:client});t.after(()=>server.close());
  let view=await server.api('create',{});const campaignId=view.reference.campaignId,anchor=id;
  if(id==='npc_delivery'){
   await server.api('execute',{campaignId,anchor:'go',eventId:'go',tool:'world_move',args:{destination:'旧磨坊'},expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});
  }
  const before=view.document.state.minute,begun=await server.api('review/begin',{campaignId,anchor,playerText:turn.input,expectedSequence:view.reference.sequence});
  const minutes=turn.calls[0].args.minutes;
  await server.api('execute',{campaignId,anchor,eventId:'wait',tool:'world_time',args:{minutes},expectedSequence:view.reference.sequence});view=await server.api('read',{campaignId});
  // Use the original full prose, including unsupported experiences. The fake
  // reviewer tests protocol plumbing only, not acceptance of those facts.
  const request={campaignId,token:begun.token,draft:turn.originalReply,expectedSequence:view.reference.sequence},review=await server.api('review/reply',request);
  assert.equal(review.canCommit,true,id);assert.equal(review.tail.valid,true);assert.equal(review.tail.args.extraMinutes,0);assert.equal(review.original,turn.originalReply);assert.equal(review.attempts,0);
  const commit={campaignId,anchor,eventId:`turn_${anchor}`,tool:'world_turn',args:review.tail.args,reviewId:review.reviewId,expectedSequence:review.sequence};
  await assert.rejects(server.api('execute',{...commit,args:{...commit.args,extraMinutes:5}}),/不一致/);
  await server.api('execute',commit);assert.equal((await server.api('execute',commit)).duplicate,true);
  assert.equal((await server.api('read',{campaignId})).document.state.minute-before,minutes);
  assert.deepEqual(await server.api('review/reply',request),review);assert.equal(reviewCalls,1);
  const record=JSON.parse(await fs.readFile(path.join(server.directory,'infinite-fields',campaignId,'consistency',`${review.reviewId}.json`),'utf8'));
  assert.equal(record.result.original,turn.originalReply);assert.equal(record.result.text,review.text);
 }
});

test('runner消费同一规范正文，坏审稿响应在服务端阻止提交',async t=>{
 let generated=0;const {turn}=cases.find(row=>row.id==='npc_shove');
 const narrator={async generate(){return ++generated===1?{choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'wait',function:{name:'world_time',arguments:'{"minutes":10}'}}]}}]}:reply(turn.originalReply);}};
 const server=await createPlaytestServer({consistencyClient:{generate:async()=>response([])}});t.after(()=>server.close());
 const result=await runPlaytest({scenario:{id:'t146-wait',initial:{mode:'legacy'},turns:[{input:turn.input,assertions:[{kind:'elapsed',min:10,max:10}]}]},api:server.api,client:narrator,bundle:await loadPromptBundle()});
 assert.deepEqual(result.turns[0].errors,[]);assert.equal(result.turns[0].consistency.tail.args.extraMinutes,0);assert.equal(result.turns[0].originalReply,turn.originalReply);assert.match(result.turns[0].reply,/额外="0分"/);
 const invalidServer=await createPlaytestServer({consistencyClient:{generate:async()=>({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'report_consistency_issues',arguments:'{bad'}}]}}]})}});t.after(()=>invalidServer.close());
 const created=await invalidServer.api('create',{}),campaignId=created.reference.campaignId,begun=await invalidServer.api('review/begin',{campaignId,anchor:'invalid',playerText:'我看看。',expectedSequence:created.reference.sequence});
 const checked=await invalidServer.api('review/reply',{campaignId,token:begun.token,draft:'看看。',expectedSequence:created.reference.sequence});
 assert.equal(checked.status,'unverified');assert.equal(checked.canCommit,false);
 await assert.rejects(invalidServer.api('execute',{campaignId,anchor:'invalid',eventId:'tail',tool:'world_turn',args:checked.tail.args,reviewId:checked.reviewId,expectedSequence:checked.sequence}),/不一致/);
});

test('未经规范化的重复计时依然为error，失败移动与私密泄漏保留原有固定拒绝',()=>{
 const input=savedInput(recorded('consistency:255286e88651242129e7'));
 const repeated={...input,draft:input.draft.replace('额外="0分"','额外="5分"')};
 assert.ok(deterministicConsistencyReview(repeated).issues.some(row=>row.category==='time'&&row.severity==='error'));
 const request=consistencyReviewRequest(input);for(const branch of request.tools[0].function.parameters.properties.issues.items.oneOf)assert.equal(branch.properties.quote.maxLength,120);
 assert.match(request.messages[0].content,/直接矛盾须引用相反记录/);
});
