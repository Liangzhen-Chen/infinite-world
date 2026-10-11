import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAssertions} from '../tools/playtest-assertions.mjs';
import {reviewPlaytest,playtestAutonomyEvidence} from '../tools/playtest-review.mjs';
import {prepareVoiceBlind,reviewVoiceBlind} from '../tools/playtest-voice-blind.mjs';

const scores={truth:100,agency:100,language:100,continuity:100};
const respond=value=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
const action={id:'npc_daily_1_ayan',npc:'npc_hw_ayan',kind:'craft',start:150,minute:180,location:'bld_hw_mill',
 action:{kind:'craft',recipe:'recipe_tool_handle'},spent:{minutes:30,fee:2,materials:[{item:'item_wood',amount:1}]},outcome:{success:false,degree:'失败'},produced:[]};
const rule={kind:'newRecordsDuringTurn',path:'state.npcAutonomy.actions',where:{npc:'npc_hw_ayan',kind:'craft'},min:1};
const state=(minute,actions)=>({state:{minute,npcAutonomy:{actions}}});

test('N17只接受期间新增的已结算行动，旧记录、回填旧时间和未来记录不能抵数，规则制作同样有效',()=>{
 const before=state(100,{old:{...action,id:'old',minute:90}}),after=state(200,{...before.state.npcAutonomy.actions,
  backfill:{...action,id:'backfill',minute:99},future:{...action,id:'future',minute:201},wrongNpc:{...action,id:'other',npc:'npc_other'},fresh:action});
 const [result]=evaluateAssertions([rule],{before,after,calls:[],reply:''});
 assert.equal(result.pass,true);assert.equal(result.actual.count,1);assert.deepEqual(result.actual.records,[action]);
 for(const records of [{old:{...action,id:'old',minute:180}},{backfill:{...action,id:'backfill',minute:100}},{future:{...action,id:'future',minute:201}}]){
  assert.equal(evaluateAssertions([rule],{before,after:state(200,records),calls:[],reply:''})[0].pass,false);
 }
 result.actual.records[0].spent.fee=999;assert.equal(after.state.npcAutonomy.actions.fresh.spent.fee,2,'证据不是原状态可写引用');
});

test('N17跨段评分附实际spent/outcome且不给早先回合未来证据',async()=>{
 const checked=evaluateAssertions([rule],{before:state(100,{}),after:state(200,{fresh:action}),calls:[],reply:''});
 const turns=Array.from({length:5},(_,index)=>({index,input:'只听经历',reply:'木柄做坏了一回。',calls:[],assertions:index===2?checked:[]}));
 assert.deepEqual(playtestAutonomyEvidence({turns})[0].records,[action]);
 let count=0;
 const report=await reviewPlaytest({async generate(body){const input=JSON.parse(body.messages[1].content);
  if(count++===0)assert.deepEqual(input.autonomyEvidence,[]);
  else{assert.equal(input.autonomyEvidence[0].records[0].spent.fee,2);assert.equal(input.autonomyEvidence[0].records[0].spent.materials[0].amount,1);assert.equal(input.autonomyEvidence[0].records[0].outcome.success,false);}
  return respond({scores,findings:[]});
 }},{id:'npc_offscreen',requirements:['N17'],turns},{});
 assert.equal(report.complete,true);assert.equal(count,3);
});

const world={npcs:[
 {id:'npc_a',name:'林穗',tier:'full',voice:{register:'先谈价钱',accent:'河谷口音',habits:['说清房钱']},secret:'不能进入审稿候选的暗号',knowledge:{known:['私人账本']}},
 {id:'npc_b',name:'贺舟',tier:'full',voice:{register:'先征询记录许可',habits:['听人自己说']},inventory:{宝物:9}},
 {id:'npc_c',name:'施锦',tier:'full',voice:{register:'先说田里的活',habits:['看天气安排活计']},goals:{short:['私密目标']}}
]};
const config={speakers:['npc_a','npc_b','npc_c'],turns:[0,1],minimumPerSpeaker:2};
const lines=['房钱先说清，坐下慢慢谈。','我能把这段记下来吗？','云压得低，先把晒着的收进来。'];
const voiceResult=()=>({id:'npc_voices',attempt:1,requirements:['N12'],turns:[0,1].map(index=>({index,input:'林穗、贺舟、施锦按顺序说',calls:[],assertions:[],sceneBefore:'私密场景不可进入盲辨',
 reply:config.speakers.map((id,i)=>`<q who="${id}">${lines[i]}</q>`).join('旁白：林穗看着贺舟。'),errors:[]}))});
const predictions=input=>input.samples.map(s=>({sampleId:s.id,candidateId:s.text.includes('房钱')?'candidate_1':s.text.includes('记下来')?'candidate_2':'candidate_3',reason:'用词与所给风格一致'}));

test('N12只发送打乱纯台词和公开风格，本地保留答案；真实误辨与unknown均不通过',async()=>{
 const result=voiceResult(),prepared=prepareVoiceBlind(result,world,config,{shuffleSeed:'fixed-test'});
 assert.ok(prepared.samples.some((s,i)=>s.speaker!==config.speakers[i%3]),'样本不沿原人物顺序排队');
 const safeClient={async generate(body){const text=JSON.stringify(body),input=JSON.parse(body.messages[1].content);
  for(const excluded of ['npc_a','npc_b','npc_c','expected','answer','sceneBefore','不能进入审稿候选的暗号','私人账本','私密目标','旁白','按顺序说'])assert.ok(!text.includes(excluded),excluded);
  assert.deepEqual(Object.keys(input).sort(),['candidates','samples']);assert.ok(input.samples.every(s=>Object.keys(s).sort().join(',')==='id,text'));
  assert.ok(input.candidates.every(c=>Object.keys(c).sort().join(',')==='id,name,style'));
  return respond({predictions:predictions(input)});
 }};
 const good=await reviewVoiceBlind(safeClient,result,world,config);assert.equal(good.pass,true);assert.equal(good.correct,6);
 for(const candidateId of ['candidate_2','unknown']){
  const bad=await reviewVoiceBlind({async generate(body){const rows=predictions(JSON.parse(body.messages[1].content));const target=rows.find(r=>r.candidateId==='candidate_1');target.candidateId=candidateId;return respond({predictions:rows});}},result,world,config);
  assert.equal(bad.complete,true);assert.equal(bad.pass,false);assert.equal(bad.correct,5);
 }
});

test('N12缺人、只有具名正文、嵌套标签、截断及重复答案保留未通过，不用猜测补提取',async()=>{
 for(const mutate of [r=>r.turns[1].reply=r.turns[1].reply.replace(/<q who="npc_c">[\s\S]*?<\/q>/,''),r=>r.turns[0].reply='林穗：房钱先说清。',r=>r.turns[0].reply=r.turns[0].reply.replace(lines[0],'<b>房钱</b>')]){
  const result=voiceResult();mutate(result);let called=false;
  const report=await reviewVoiceBlind({async generate(){called=true;}},result,world,config);assert.equal(report.complete,false);assert.equal(report.pass,false);assert.equal(called,false);
 }
 for(const client of [{async generate(){return{choices:[{finish_reason:'length'}]};}},{async generate(body){const rows=predictions(JSON.parse(body.messages[1].content));rows[1]=rows[0];return respond({predictions:rows});}}]){
  const report=await reviewVoiceBlind(client,voiceResult(),world,config);assert.equal(report.complete,false);assert.equal(report.pass,false);
 }
});

test('N12正式review流程另发独立盲辨请求，结果供逐N验收读取',async()=>{
 let blindCalls=0;
 const report=await reviewPlaytest({async generate(body,label){
  if(label.endsWith('-voice-blind')){blindCalls++;const input=JSON.parse(body.messages[1].content);assert.equal(input.previous,undefined);return respond({predictions:predictions(input)});}
  return respond({scores,findings:[]});
 }},voiceResult(),{blindVoice:config},{world});
 assert.equal(blindCalls,1);assert.equal(report.complete,true);assert.equal(report.voiceBlind.pass,true);
 const absent=await reviewPlaytest({async generate(){return respond({scores,findings:[]});}},voiceResult(),{},{world});
 assert.equal(absent.complete,false);assert.equal(absent.voiceBlind.pass,false);
});
