import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSoakTiming,explicitSoakTiming,summarizeSoakTiming} from '../tools/m3-soak-timing.mjs';
const replay={source:'replay',startMinute:540,expectedMinutes:36,elapsedMinutes:36,actionCount:1,actionMinutes:36,tailMinutes:0};

test('明确时长和定点等待由玩家原文提供期望，不使用主持实际选择的36分钟',()=>{
 for(const input of ['我等60分钟。','我原地等一小时，不做其他事情。','我等到今天10:00。']){
  const timing=assessSoakTiming(replay,{input});assert.equal(timing.expectedMinutes,60);assert.equal(timing.deviation,.4);assert.equal(timing.status,'measured');
 }
 assert.deepEqual(explicitSoakTiming('我在这里原地等两小时，不做其他事情。',540).range,[120,120]);
 for(const input of ['我先买面包，再等60分钟。','我在买完面包后等60分钟。','我等到明天上午。','我等到今天08:00。'])assert.equal(assessSoakTiming(replay,{input}).status,'unknown');
 const duplicate=assessSoakTiming({...replay,elapsedMinutes:70,actionMinutes:60,tailMinutes:10},{input:'我等60分钟。'});assert.equal(duplicate.expectedMinutes,60);assert.equal(duplicate.deviation,10/60);
});

test('普通交谈的5至20分钟是区间证据，范围内不虚构单一期望，未授权动作保持未知',()=>{
 for(const elapsedMinutes of [5,12,20]){
  const t=assessSoakTiming({...replay,elapsedMinutes,actionCount:0},{input:'你好。'});assert.equal(t.status,'bounded');assert.equal(t.expectedMinutes,null);assert.equal(t.withinExpectedRange,true);assert.equal(t.deviation,0);assert.equal(t.referenceMinutes,5);
 }
 const over=assessSoakTiming({...replay,elapsedMinutes:25,actionCount:0},{input:'我问林穗：“最近好吗？”'});assert.equal(over.deviation,.25);assert.equal(over.referenceMinutes,20);
 assert.equal(assessSoakTiming(replay,{input:'你好。'}).status,'unknown');
 assert.equal(assessSoakTiming({...replay,actionCount:0},{input:'买一个面包。',reply:'<q who="npc_a">好。</q>'}).status,'unknown');
});

test('未知回合和旧回放指标不能被已知子集0稀释，全零期望发生推进也不通过',()=>{
 const known=assessSoakTiming({...replay,elapsedMinutes:60},{input:'我等60分钟。'}),unknown=assessSoakTiming(replay,{input:'随便走走。'});
 const partial=summarizeSoakTiming([known,unknown]);assert.equal(partial.deviation,null);assert.equal(partial.knownDeviation,0);assert.equal(partial.coverage,.5);assert.equal(partial.pass,false);assert.equal(partial.status,'unknown');
 const old=summarizeSoakTiming([{source:'action-rules',covered:true,expectedMinutes:36,elapsedMinutes:36}]);assert.equal(old.covered,0);assert.equal(old.deviation,null);assert.equal(old.pass,false);
 assert.equal(summarizeSoakTiming([]).deviation,null);assert.equal(summarizeSoakTiming([]).pass,false);
 const out=assessSoakTiming({...replay,elapsedMinutes:1},{input:'（场外）解释一下规则。'});assert.equal(out.expectedMinutes,0);assert.equal(summarizeSoakTiming([out]).pass,false);
 assert.equal(summarizeSoakTiming([known]).pass,true);
});

test('13分钟短等与六小时误作六时辰分别保留玩家原文和实际偏差',()=>{
 const short=assessSoakTiming({...replay,elapsedMinutes:13},{input:'我等60分钟。'});
 assert.equal(short.expectedMinutes,60);assert.equal(short.deviation,47/60);assert.equal(summarizeSoakTiming([short]).pass,false);
 const doubled=assessSoakTiming({...replay,elapsedMinutes:720},{input:'我等六小时。'});
 assert.equal(doubled.expectedMinutes,360);assert.equal(doubled.deviation,1);assert.equal(summarizeSoakTiming([doubled]).pass,false);
});

test('明确等待后交谈分开核验，短等不能用额外交谈补齐总时间',()=>{
 const evidence=(waited,talked,tool='world_time')=>({...replay,elapsedMinutes:waited+talked,actionMinutes:waited,tailMinutes:talked,
  receipts:[{eventId:'wait',tool,args:{minutes:waited},declaredMinutes:waited,elapsedMinutes:waited}]});
 const input='我等60分钟，然后我问林穗：“最近好吗？”';
 for(const talked of [5,12,20]){
  const timing=assessSoakTiming(evidence(60,talked),{input});assert.equal(timing.status,'bounded');assert.equal(timing.deviation,0);
  assert.deepEqual(timing.expectedRange,[65,80]);assert.equal(timing.components.wait.expectedMinutes,60);assert.equal(summarizeSoakTiming([timing]).pass,true);
 }
 const shortened=assessSoakTiming(evidence(36,34),{input});assert.equal(shortened.elapsedMinutes,70);assert.equal(shortened.deviationMinutes,38);
 assert.equal(shortened.components.wait.deviationMinutes,24);assert.equal(shortened.components.dialogue.deviationMinutes,14);assert.equal(summarizeSoakTiming([shortened]).pass,false);
 const duplicate=assessSoakTiming(evidence(60,30),{input});assert.equal(duplicate.components.dialogue.deviationMinutes,10);
 const masked=assessSoakTiming(evidence(36,24),{input:'我等60分钟。'});assert.equal(masked.elapsedMinutes,60);assert.equal(masked.deviationMinutes,48);
 const countedTwice=assessSoakTiming(evidence(60,10),{input:'我等60分钟。'});assert.equal(countedTwice.components.dialogue.deviationMinutes,10);
 for(const row of [replay,evidence(60,10,'world_trade'),{...evidence(60,10),tailMinutes:0}])assert.equal(assessSoakTiming(row,{input}).status,'unknown');
 assert.equal(assessSoakTiming(evidence(60,10,'world_trade'),{input:'我等60分钟。'}).status,'unknown');
 assert.equal(explicitSoakTiming('我等到今天10:00，接着谢谢。',540).range[0],65);
 assert.equal(explicitSoakTiming('我等60分钟然后买面包。',540),null);
});
