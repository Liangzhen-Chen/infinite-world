import test from 'node:test';
import assert from 'node:assert/strict';
import {consistencyReviewRequest,validateConsistencyResponse,reviewConsistency} from '../server-plugin/consistency-review.mjs';
import {claimFor,reviewPayload,reviewResponse} from './helpers/consistency-response.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';

const state={minute:540,location:'bld_granary',player:{coins:20},inventory:{},npcs:{npc_teacher:{location:'bld_granary'},npc_keeper:{location:'bld_granary'}}};
function input(draft,extra={}){return {draft,playerText:'我问现在的情况。',before:structuredClone(state),after:structuredClone(state),receipts:[],allowedEntities:[{id:'npc_teacher',name:'先生',kind:'person'},{id:'npc_keeper',name:'管事',kind:'person'},{id:'bld_granary',name:'粮仓',kind:'location'}],...extra};}
const publicFact=(id,kind,subject,object,value,time={at:540,until:720})=>({id,kind,subject,object,value,time,scope:{},knownBy:['player',subject],source:{type:'state',field:['state','records',id],version:{sequence:1,revision:0}}});
const availability=publicFact('availability:npc_keeper','availability','npc_keeper','bld_granary',{services:[],until:720});
const price=publicFact('quote:lesson','price','npc_teacher','lesson',{unitPrice:8});
// reviewCurrentFacts 的已报价记录公开给 player；其 subject 是报价者，
// 报价者可以重复自己的有效报价，不需要凭空添加 NPC 知情条目。
price.knownBy=['player'];
const reference=(payload,id,quote)=>{const source=payload.sources.find(source=>source.sourceId===id);return {sourceId:id,quote:quote??(source.text??payload.evidence.find(row=>row.id===source.evidenceId).text).slice(0,160)};};
const classify=(payload,extra)=>payload.segments.map((segment,index)=>claimFor(segment,typeof extra==='function'?extra(segment,index):extra));
async function reviewed(data,makeClaims){
 const saved=structuredClone(data);let calls=0;
 const result=await reviewConsistency(data,{client:{async generate(body){calls++;const payload=reviewPayload(body);return reviewResponse(body,[],makeClaims(payload));}}});
 assert.equal(calls,1);assert.deepEqual(data,saved);assert.equal(result.verified,true);return result;
}

test('无来源的两铜不够一堂与一堂八铜报价均为严重问题，不能空 issues 放行',async()=>{
 for(const draft of ['<q who="npc_teacher">两铜不够一堂。</q>','<q who="npc_teacher">一堂八铜。</q>']){
  const result=await reviewed(input(draft),payload=>classify(payload,{kind:'price',subject:'npc_teacher',predicate:'课程报价',object:'lesson',quantity:draft.includes('两')?2:8,verdict:'unsourced',reason:'本回合与现行事实均无课程报价来源'}));
  assert.ok(result.issues.some(issue=>issue.category==='fact'&&issue.severity==='error'));
  assert.equal(result.rewriteRequest.attempt,1);assert.equal(result.rewriteRequest.allowTools,false);
  assert.equal(result.claims.length,1);assert.equal(result.text,draft);
 }
});

test('暂停至12:00有来源放行，过去封仓因果与十二点保证开秤分别阻断',async()=>{
 const data=input('<q who="npc_keeper">目前交易暂停至12:00，粮仓今早因核账封仓，十二点保证开秤。</q>',{currentFacts:[availability]});
 const result=await reviewed(data,payload=>classify(payload,(_segment,index)=>({kind:'business',subject:'npc_keeper',predicate:index===0?'暂停':index===1?'封仓因果':'保证开秤',object:'bld_granary',time:{mode:index===0?'current':index===1?'past':'future',at:index===0?540:index===1?480:720,until:index===0?720:null},verdict:'supported',references:[reference(payload,availability.id,'"services":[]')],reason:'核对本时段营业事实'})));
 assert.equal(result.claims.length,3);assert.equal(result.issues.length,2);assert.ok(result.issues.every(issue=>issue.severity==='error'));
 assert.ok(!result.issues.some(issue=>issue.quote.includes('目前交易暂停')));
 assert.ok(result.issues.some(issue=>issue.quote.includes('今早')));assert.ok(result.issues.some(issue=>issue.quote.includes('保证开秤')));
 const good=input('目前交易暂停至12:00。',{currentFacts:[availability]});
 const accepted=await reviewed(good,payload=>classify(payload,{kind:'business',subject:'npc_keeper',predicate:'暂停',object:'bld_granary',time:{mode:'current',at:540,until:720},verdict:'supported',references:[reference(payload,availability.id)],reason:'同一主体同一时段的营业事实'}));
 assert.deepEqual(accepted.issues,[]);assert.equal(accepted.status,'verified');assert.equal(accepted.rewriteRequest,null);
});

test('收费条件与制度缺来源阻断，转述或打算外壳不成为新报价豁免',async()=>{
 for(const [draft,kind,modality] of [['先交十铜才能入内。','fee-condition','fact'],['这里规定人人交税。','institution','reported'],['我打算一堂收八铜。','price','intention']]){
  const result=await reviewed(input(draft),payload=>classify(payload,{kind,modality,subject:'npc_teacher',predicate:'规定',object:'lesson',reason:'没有引擎出处'}));
  assert.equal(result.issues[0].severity,'error');assert.ok(result.rewriteRequest);
 }
});

test('既有谎言只证明旧说法，不能凭同一物品的谎言豁免无来源新报价',async()=>{
 const data=input('<q who="npc_teacher">一堂八铜。</q>',{knowledge:{npc_teacher:{lies:[{claims:['一堂课早已上完'],entities:['lesson']}]}}});
 data.allowedEntities.push({id:'lesson',name:'一堂',kind:'item'});
 const result=await reviewed(data,payload=>classify(payload,{kind:'price',subject:'npc_teacher',predicate:'报价',object:'lesson',quantity:8,reason:'旧谎言不提供价格来源'}));
 assert.equal(result.issues[0].severity,'error');
});

test('现行有效旧报价放行，历史台词或另一对象的报价不能补造价格',async()=>{
 const data=input('<q who="npc_teacher">一堂八铜。</q>',{currentFacts:[price],priorEvidence:[{kind:'chat',text:'先生上一轮说一堂八铜。'}]});
 const positive=await reviewed(data,payload=>classify(payload,{kind:'price',subject:'npc_teacher',predicate:'报价',object:'lesson',quantity:8,verdict:'supported',references:[reference(payload,price.id)],reason:'服务器有效旧报价'}));
 assert.deepEqual(positive.issues,[]);
 const alias=await reviewed({...data,draft:'<q who="先生">一堂八铜。</q>'},payload=>classify(payload,{kind:'price',subject:'npc_teacher',predicate:'报价',object:'lesson',quantity:8,verdict:'supported',references:[reference(payload,price.id)],reason:'同一报价者的登记称呼'}));
 assert.ok(alias.issues.some(issue=>issue.category==='meta'&&issue.severity==='warning'));
 assert.ok(!alias.issues.some(issue=>issue.severity==='error'),'登记称呼的协议警告不能误报为无来源价格');
 for(const override of [{sourceId:'prior:0'},{subject:'npc_keeper'},{object:'bread'}]){
  const checked=await reviewed(data,payload=>classify(payload,{kind:'price',subject:override.subject??'npc_teacher',predicate:'报价',object:override.object??'lesson',quantity:override.quantity??8,verdict:'supported',references:[reference(payload,override.sourceId??price.id)],reason:'不能继承另一项价格'}));
  assert.equal(checked.issues[0].severity,'error');
 }
 const affordability=await reviewed({...data,draft:'两铜不够一堂。'},payload=>classify(payload,{kind:'price',subject:'npc_teacher',predicate:'不足以支付',object:'lesson',quantity:2,verdict:'supported',references:[reference(payload,price.id)],reason:'两铜小于有来源的每堂八铜'}));
 assert.deepEqual(affordability.issues,[],'数值关系由逐句蕴含判断，不能强行要求报价里的所有数相等');
});

test('真实 NPC 拒绝按人物、请求与数量范围放行；旁人、扩量和旧许可均不能代替',async()=>{
 const data=input('<q who="npc_keeper">我拒绝借出这把钥匙。</q>',{receipts:[{tool:'world_dialogue',eventId:'decision-real',sequence:2,args:{npc:'npc_keeper',action:'request',item:'key',quantity:1},result:{ok:true,dialogue:{npc:'npc_keeper',action:'request',decision:{outcome:'refuse'}}}}]});
 const make=(payload,change={})=>{
  const source=payload.sources.find(source=>source.sourceId==='decision:0'),d=source.decision;
  return classify(payload,{kind:'decision',subject:'npc_keeper',predicate:'拒绝',object:null,verdict:'supported',references:[reference(payload,source.sourceId)],decision:{outcome:'refuse',request:d.request,scope:d.scope},reason:'本回合真实拒绝',...change});
 };
 const good=await reviewed(data,payload=>make(payload));assert.deepEqual(good.issues,[]);
 for(const alter of [payload=>({subject:'npc_teacher'}),payload=>{const d=payload.sources.find(s=>s.decision).decision;return {decision:{outcome:'refuse',request:{...d.request,args:{...d.request.args,quantity:20}},scope:d.scope}};},payload=>({references:[reference(payload,'before')]})]){
  const bad=await reviewed(data,payload=>make(payload,alter(payload)));assert.equal(bad.issues[0].category,'agency');assert.equal(bad.issues[0].severity,'error');
 }
});

test('纯姿态、感官、比喻和未裁决的玩家意图保留自由，不要求每个字都有来源',async()=>{
 const data=input('风声像细针，掌心微凉。先生抬起眼睛。你打算下次再来。');
 const result=await reviewed(data,payload=>classify(payload,(segment,index)=>index===3?{kind:'change',modality:'intention',subject:'player'}:{kind:'observation',modality:index===0?'figurative':'fact'}));
 assert.deepEqual(result.issues,[]);assert.equal(result.rewriteRequest,null);
});

test('伪 sourceId、伪造引文、错说话者和错原文位置全部拒绝验证',()=>{
 const data=input('<q who="npc_teacher">一堂八铜。</q>',{currentFacts:[price]}),payload=reviewPayload(data);
 const base=claimFor(payload.segments[0],{kind:'price',subject:'npc_teacher',predicate:'报价',object:'lesson',quantity:8,verdict:'supported',reason:'有效报价',references:[reference(payload,price.id)]});
 for(const change of [{references:[{sourceId:'quote:forged',quote:'8'}]},{references:[{sourceId:price.id,quote:'根本不存在的引文'}]},{speaker:'narrator'},{start:base.start+1}])assert.throws(()=>validateConsistencyResponse(reviewResponse(data,[],[{...base,...change}]),data),/真实证据|说话者|原文/);
});

test('空断言、漏句、句内遗漏被拒绝，重复文字和表情符号保持真实偏移',()=>{
 const data=input('风吹。<q who="npc_teacher">风吹。🙂掌心微凉。</q>'),payload=reviewPayload(data),claims=payload.segments.map(segment=>claimFor(segment));
 assert.equal(payload.segments[0].speaker,'narrator');assert.equal(payload.segments[1].speaker,'npc_teacher');
 assert.notEqual(payload.segments[0].start,payload.segments[1].start);
 assert.deepEqual(validateConsistencyResponse(reviewResponse(data,[],claims),data),[]);
 for(const missing of [[],claims.slice(1),claims.map((claim,index)=>index===2?{...claim,end:claim.end-2,quote:claim.quote.slice(0,-2)}:claim)])assert.throws(()=>validateConsistencyResponse(reviewResponse(data,[],missing),data),/覆盖不全/);
});

test('缺少 claims 的旧空问题响应不能取得 verified；只给一次格式修正且不改正文',async()=>{
 let calls=0;const data=input('风吹。'),result=await reviewConsistency(data,{client:{async generate(){calls++;return {choices:[{finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'report_consistency_issues',arguments:'{"issues":[]}'}}]}}]};}}});
 assert.equal(calls,2);assert.equal(result.verified,false);assert.equal(result.model.status,'failed');assert.equal(result.text,data.draft);assert.equal(result.model.correction.attempts,1);
});

test('格式修正可以修引文但不得把无来源价格改标为观察以消除负评',async()=>{
 const data=input('一堂八铜。',{currentFacts:[price]});
 for(const relabel of [false,true]){
  let calls=0;
  const result=await reviewConsistency(data,{client:{async generate(body){
   calls++;const payload=reviewPayload(body),wrong=calls===1;
   const claims=classify(payload,{kind:relabel&&!wrong?'observation':'price',subject:'npc_teacher',predicate:'报价',object:'lesson',quantity:8,verdict:'supported',reason:'同一价格判断',references:[reference(payload,price.id,wrong?'不存在的引文':undefined)]});
   return reviewResponse(body,[],claims);
  }}});
  assert.equal(calls,2);assert.equal(result.verified,!relabel);assert.equal(result.model.correction.attempts,1);
  if(relabel)assert.match(result.model.reason,/不得改变原断言/);else assert.deepEqual(result.issues,[]);
 }
});

test('结构化钱物核对保留实际入账数额，离屏私密效果不能从补充来源获得知情',async()=>{
 const data=input('你收到了十文。',{receipts:[{tool:'world_act',result:{ok:true,receipt:{status:'committed'}},applied:[{op:'transfer',resource:'coin',holder:'player',delta:10}]}]});
 const make=(payload,quantity=10)=>classify(payload,{kind:'change',subject:'player',predicate:'收到',object:'coin',quantity,verdict:'supported',references:[reference(payload,'settlement-effect:0')],reason:'本回合入账数额'});
 assert.deepEqual((await reviewed(data,payload=>make(payload))).issues,[]);
 assert.equal((await reviewed(data,payload=>make(payload,100))).issues[0].severity,'error');
 const privateData=input('先生的私房钱增加十文。',{receipts:[{tool:'world_time',result:{ok:true},applied:[{op:'transfer',resource:'coin',holder:'npc_teacher',delta:10}]}]});
 const hidden=await reviewed(privateData,payload=>classify(payload,{kind:'change',subject:'npc_teacher',predicate:'入账',object:'coin',quantity:10,verdict:'supported',references:[reference(payload,'settlement-effect:0')],reason:'未向玩家公开的离屏账目'}));
 assert.equal(hidden.issues[0].severity,'error');
});

test('来源目录不复制全局账本，避免绕过纯文字改写已有的隐私脱敏',()=>{
 const data=input('风吹。');data.after.quests={secret:{publisher:'npc_teacher',content:'未公开的任务内容',reward:19}};
 const payload=reviewPayload(data),ledger=JSON.parse(payload.evidence.find(row=>row.id==='after').text);
 assert.equal(ledger.quests.secret.content,'未公开的任务内容');
 for(const row of payload.sources.filter(source=>source.evidenceId)){
  assert.equal(row.text,undefined);assert.ok(payload.evidence.some(evidence=>evidence.id===row.evidenceId));
 }
 assert.ok(!JSON.stringify(payload.sources).includes('未公开的任务内容'));
});

test('真实只读历史结果的执行时刻不冒充被查询的历史事件时刻',async()=>{
 const data=input('今早八点核过账。',{receipts:[{tool:'world_read',result:{ok:true,history:[{minute:480,event:'核账'}]}}]});
 const result=await reviewed(data,payload=>classify(payload,{kind:'history',subject:'npc_keeper',predicate:'核账',object:'bld_granary',time:{mode:'past',at:480,until:null},verdict:'supported',references:[reference(payload,'receipt:0:query:0')],reason:'只读结果给出八点历史记录'}));
 assert.deepEqual(result.issues,[]);
});

test('本轮新物理痕迹由结构化 change 核验，预览不是已经发生的效果',async()=>{
 const data=input('桌上留下了新的刮痕。',{preview:{status:'candidate',candidates:[{effect:'mark'}]}});
 const result=await reviewed(data,payload=>classify(payload,{kind:'change',subject:'player',predicate:'留下物理痕迹',object:'table',verdict:'supported',references:[reference(payload,'turn-preview')],reason:'没有真实物理痕迹结算'}));
 assert.equal(result.issues[0].severity,'error');assert.ok(result.rewriteRequest);
});

test('HTTP 无来源报价只允许一次无工具文字改写与复审，仍失败退模板且不重做结算',async t=>{
 for(const fail of [false,true]){
  let reviews=0,rewrites=0;
  const bad='一堂八铜。',good='微风掠过衣角。';
  const client={async generate(body,label){
   if(label.startsWith('consistency-rewrite:')){rewrites++;assert.equal(body.tools,undefined);return {choices:[{finish_reason:'stop',message:{content:fail?bad:good}}]};}
   reviews++;const payload=reviewPayload(body);
   return reviewResponse(body,[],classify(payload,segment=>segment.quote.includes('八铜')?{kind:'price',subject:'npc_hw_linsui',predicate:'课程报价',object:'lesson',quantity:8,reason:'没有课程价格来源'}:{}));
  }};
  const server=await createPlaytestServer({aiProfile:'T3'/*this scenario supplies a model client*/,consistencyClient:client});t.after(()=>server.close());let view=await server.api('create',{});const campaignId=view.reference.campaignId;
  const begun=await server.api('review/begin',{campaignId,anchor:'claim-rewrite',playerText:'我稍候一分钟，看看周围。',expectedSequence:view.reference.sequence});
  await server.api('execute',{campaignId,anchor:'claim-rewrite',eventId:'wait-once',tool:'world_time',args:{minutes:1},expectedSequence:view.reference.sequence});
  view=await server.api('read',{campaignId});const saved=structuredClone(view.document),events=await server.api('export',{campaignId});
  const result=await server.api('review/reply',{campaignId,token:begun.token,draft:bad,expectedSequence:view.reference.sequence});
  assert.equal(rewrites,1);assert.equal(reviews,2);assert.equal(result.canCommit,!fail);assert.equal(result.attempts,1);assert.equal(result.rewritten,!fail);
  if(fail){assert.equal(result.text,result.safeText);assert.doesNotMatch(result.safeText,/一堂八铜/);assert.ok(result.issues.some(issue=>issue.severity==='error'));}else assert.match(result.text,/微风掠过衣角/);
  assert.deepEqual((await server.api('read',{campaignId})).document,saved);assert.deepEqual(await server.api('export',{campaignId}),events);
 }
});
