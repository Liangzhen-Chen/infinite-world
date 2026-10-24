import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches,digest,persistable} from '../server-plugin/storage.mjs';
import {translateCall} from '../server-plugin/action-gateway.mjs';
import {resolvePlaytestCall} from './playtest-call.mjs';
import {turnCandidates} from '../server-plugin/action-constructor.mjs';
import {primitiveRuntime} from '../server-plugin/primitives-runtime.mjs';
import {createRoutingContext} from '../server-plugin/action-router.mjs';
import {readOnlyTools} from '../extension/tools.mjs';
import {parseTurn,modelToolResult} from '../extension/turn.mjs';
import {candidateSelectionRequest} from '../extension/turn-contract.mjs';
import {runPrelude} from './a3-setup/prelude.mjs';

const query=tool=>readOnlyTools.has(tool)||tool==='world_no_action';
const settled=result=>result?.receipt?result.receipt.status==='committed':result?.ok===true;
const estimatedTokens=value=>Math.ceil(Buffer.byteLength(JSON.stringify(value),'utf8')/3);
const selectionTokens=(preview,input)=>{const request=candidateSelectionRequest(preview,input);return estimatedTokens({messages:request.messages,tools:request.tools});};
const keys={world_move:['destination','mode'],world_trade:['operation','seller','buyer','item','quantity','service','days','payment'],world_learn:['entity','source','kind','mode','student'],world_practice:['skill'],world_craft:['operation','recipe','item','batches','quantity','maker'],world_combat:['target','intent','weapon','rounds'],world_time:['minutes','until','activity'],world_quest:['operation','quest'],world_field:['operation','location','skill','helper']};
function canonical(engine,tool,args={}){
 let call,family;try{family=translateCall(tool,args).tool;call=resolvePlaytestCall(tool,args);}catch{
  // A missing required slot must still be reported as the catalog action's
  // tool, rather than hiding it as an unknown world_act. This is a measurement
  // skeleton only: assessment never treats missing slots as executable.
  const definition=tool==='world_act'?primitiveRuntime.registry(engine).byId.get(args.action):null;
  if(!definition?.call?.tool)return {tool,args};
  family=definition.call.tool;
  call=resolvePlaytestCall(family,{...args.slots,...definition.call.fixed,...(definition.call.operation?{operation:definition.call.operation}:{})});
 }
 const values={};
 // Normalize actual engine defaults, not spelling differences in recordings.
 if(call.tool==='world_move')call.args={mode:'walk',...call.args};
 if(call.tool==='world_trade')call.args={operation:'trade',buyer:'player',quantity:1,payment:'cash',...call.args};
 if(call.tool==='world_learn')call.args={mode:'acquire',student:'player',...call.args};
 if(call.tool==='world_time')call.args={activity:'等待',...call.args};
 for(const key of keys[call.tool]??Object.keys(call.args))if(call.args[key]!==undefined){
  let value=call.args[key];
  if(typeof value==='string')try{value=engine.resolve(value);}catch{}
  values[key]=value;
 }
 return {tool:call.tool,args:values,family};
}
const sameTool=(call,want)=>call.tool===want.tool||want.toolOnly&&call.family===want.tool;
const matches=(call,want)=>sameTool(call,want)&&Object.entries(want.args).every(([key,value])=>isDeepStrictEqual(call.args[key],value));
const covers=(calls,expected)=>{
 const remaining=[...calls];
 return expected.every(want=>{const index=remaining.findIndex(call=>matches(call,want));if(index<0)return false;remaining.splice(index,1);return true;});
};
function missReason(expected,candidates){
 if(expected.every(want=>candidates.some(call=>!call.missing?.length&&matches(call,want))))return 'whole_intent_unresolved';
 if(expected.some(want=>!candidates.some(call=>sameTool(call,want))))return 'action_not_in_shortlist';
 if(expected.some(want=>candidates.some(call=>sameTool(call,want)&&call.missing?.length)))return 'required_slots_unresolved';
 return 'key_parameters_not_derived';
}
export function assessCandidates(engine,preview,expected){
 const candidates=preview.candidates.flatMap(row=>(row.steps??[{action:row.id,slots:row.slots}]).map(args=>({...canonical(engine,'world_act',args),complete:row.match?.complete===true,ref:row.ref,missing:row.missing})));
 const refs=[...new Set(candidates.map(row=>row.ref))];
 return {candidates,hit:expected.length>0&&refs.some(ref=>covers(candidates.filter(call=>call.ref===ref&&call.complete&&!call.missing?.length),expected)),coverageHit:expected.length>0&&covers(candidates.filter(call=>!call.missing?.length),expected)};
}
export function summarize(sessions){
 const sum=(rows,key)=>rows.reduce((n,s)=>n+(s[key]??0),0),groups=[...new Set(sessions.map(row=>row.id))].map(id=>{
  const rows=sessions.filter(row=>row.id===id),judgeable=sum(rows,'judgeable'),hits=sum(rows,'hits');
  const compared=rows.some(session=>session.rows.some(row=>typeof row.baselineHit==='boolean'));
  return {id,sessions:rows.length,total:sum(rows,'total'),restored:sum(rows,'restored'),judgeable,hits,hitRate:judgeable?hits/judgeable:null,coverageHits:sum(rows,'coverageHits'),baselineHits:compared?sum(rows,'baselineHits'):null,baselineCoverageHits:compared?sum(rows,'baselineCoverageHits'):null,openTurns:sum(rows,'openTurns'),openHits:sum(rows,'openHits')};
 });
 const missed=sessions.flatMap(s=>s.rows.filter(row=>row.judgeable&&!row.hit).map(row=>({round:s.round,scenario:s.id,index:row.index,reason:row.missReason}))),reasons={};
 for(const row of missed)reasons[row.reason]=(reasons[row.reason]??0)+1;
 const rows=sessions.flatMap(s=>s.rows),average=key=>{const values=rows.map(row=>row.tokens?.[key]).filter(Number.isFinite);return values.length?Math.round(values.reduce((n,value)=>n+value,0)/values.length):null;};
 return {total:sum(sessions,'total'),restored:sum(sessions,'restored'),judgeable:sum(sessions,'judgeable'),hits:sum(sessions,'hits'),hitRate:sum(sessions,'judgeable')?sum(sessions,'hits')/sum(sessions,'judgeable'):null,coverageHits:sum(sessions,'coverageHits'),openTurns:sum(sessions,'openTurns'),openHits:sum(sessions,'openHits'),groups,missReasons:reasons,tokens:{method:'ceil(UTF8 JSON bytes/3); selector messages+schema only, excludes shared static/scene/history and host processing; receipt raw versus existing model projection',selectionBefore:average('selectionBefore'),selectionAfter:average('selectionAfter'),receiptBefore:average('receiptBefore'),receiptAfter:average('receiptAfter')},sessions};
}
function expectedCalls(engine,step,turn){
 const tools=step.expectedTools??[];
 const calls=(turn.calls??[]).filter(c=>!query(c.tool)&&settled(c.result)).map(c=>({...canonical(engine,c.tool,c.args),originalTool:c.tool}));
 const expected=tools.length?calls.filter(c=>tools.includes(c.tool)||tools.includes(c.family)||tools.includes(c.originalTool)||tools.includes('world_act')):calls;
 for(const tool of tools.filter(tool=>!query(tool)&&tool!=='world_act'&&!expected.some(c=>c.tool===tool))){
  const args={};
  if(tool==='world_move'){const rule=(step.assertions??[]).find(rule=>rule.kind==='equals'&&rule.path==='state.location');if(rule)args.destination=rule.value;}
  expected.push({tool,args,toolOnly:!Object.keys(args).length});
 }
 return expected;
}
async function reduceCall(engine,document,call,eventId){
 const translated=translateCall(call.tool,call.args);
 const output=await engine.reduce(document,{tool:translated.tool,args:translated.args,eventId});
 return {...output,document:applyPatches(document,persistable(output.patches))};
}
async function eventTape(record,session){
 if(!record.budgetFile||!session.session?.campaignId)return null;
 const directory=path.join(path.dirname(record.budgetFile),'server','infinite-fields',session.session.campaignId);
 try{
  // load() is read-only and verifies the original snapshot and event hash chain.
  const stored=await new CampaignStorage(path.dirname(directory)).load(session.session.campaignId);
  const initial=JSON.parse(await fs.readFile(path.join(directory,'initial.json'),'utf8'));
  return {directory,initial,events:stored.events,cursor:0,expected:initial};
 }catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function differences(expected,actual,prefix='',rows=[]){
 if(isDeepStrictEqual(expected,actual)||rows.length>=12)return rows;
 if(expected&&actual&&typeof expected==='object'&&typeof actual==='object'){
  for(const key of new Set([...Object.keys(expected),...Object.keys(actual)]))differences(expected[key],actual[key],prefix?`${prefix}.${key}`:key,rows);
 }else rows.push({path:prefix,expected,actual});
 return rows;
}
export async function replayCandidates({record,scenarioDirectory=new URL('../tests/playtests/',import.meta.url),world=null,candidateFactory=turnCandidates,comparisonFactory=null}={}){
 world??=await loadWorld();const engine=new WorldEngine(world);
 const legacy=JSON.parse(await fs.readFile(new URL('../server-plugin/legacy/seed.json',import.meta.url),'utf8'));
 const sessions=[];
 for(const session of record.results??[]){
  const result={id:session.id,attempt:session.attempt,total:session.turns.length,restored:0,judgeable:0,hits:0,coverageHits:0,baselineHits:0,baselineCoverageHits:0,openTurns:0,openHits:0,rows:[],stopped:null};sessions.push(result);
  let scenario;
  try{scenario=JSON.parse(await fs.readFile(new URL(`${session.id}.json`,pathToDirectory(scenarioDirectory)),'utf8'));}catch(error){result.stopped={reason:'missing_scenario',detail:error.message};continue;}
  let tape;try{tape=await eventTape(record,session);}catch(error){result.stopped={reason:'event_log_unreadable',detail:error.message};continue;}
  if(!(tape?.initial.randomSeed??session.finalDocument?.randomSeed)){result.stopped={reason:'missing_seed'};continue;}
  if(scenario.initial?.requiresSession){result.stopped={reason:'external_prepared_session_not_in_record'};continue;}
  const seed=tape?.initial.randomSeed??session.finalDocument.randomSeed,name=tape?.initial.state.player.name??session.finalDocument.state.player.name;
  let document=scenario.initial?.mode==='legacy'?engine.initialFromLegacy(legacy,seed):engine.createCharacter(legacy,{name},seed);
  document.worldHash=digest(world);
  if(scenario.initial?.mode==='legacy')document.state.player.name=name;
  if(scenario.setup){
   if(Object.keys(scenario.setup).some(key=>key!=='prelude')){result.stopped={reason:'unsupported_setup',detail:'Only recorded real prelude actions may establish premises'};continue;}
   const prepared=await runPrelude(engine,document,scenario.setup.prelude??[]);if(prepared.unmet.length){result.stopped={reason:'setup_rejected',detail:prepared.unmet};continue;}document=prepared.document;
  }
  result.eventLog=tape?.directory??null;
  if(tape){
   // Verify opening premises against the archived initial snapshot. Today's
   // initializer may add derived records; retain those current rules and report
   // the difference rather than injecting an old or final state.
   result.initialSource='scenario_initializer_with_original_seed_verified_against_recorded_opening';
   result.initializerDifferences=differences(tape.initial.state,document.state);
  }else result.initialSource='scenario_initial_and_setup';
  const anchors=session.session?.chat?.filter(row=>row.is_user).map(row=>row.extra?.fields_anchor)??[];
  for(const turn of session.turns){
   const step=scenario.turns[turn.index],anchor=anchors[turn.index]??step?.anchor??`${session.id}-${session.attempt}-${turn.index}`;
   const sameScenario=step?.input===turn.input;
   if(['regenerate','deleteLast'].includes(turn.operation)){result.stopped={index:turn.index,reason:'rollback_record_needs_event_history'};break;}
   const location=/【地点】[^\n]*（([^）]+)）/.exec(turn.sceneBefore??'')?.[1];
   if(location&&location!==document.state.location){result.stopped={index:turn.index,reason:'before_location_mismatch',expected:location,actual:document.state.location};break;}
   const scoped=engine.scoped(document),preview=candidateFactory(scoped,document,turn.input,createRoutingContext(scoped,document));
   const oracle=sameScenario?step:{};
   const expectedAll=expectedCalls(scoped,oracle,turn),declaredOpen=(oracle.expectedTools??[]).includes('world_propose');
   const open=declaredOpen||expectedAll.some(call=>call.tool==='world_propose')||(turn.calls??[]).some(call=>call.tool==='world_propose'||call.tool==='world_act'&&call.args?.action==='open:proposal');
   const expected=expectedAll.filter(call=>call.tool!=='world_propose');
   const assessed=assessCandidates(scoped,preview,expected),{candidates}=assessed;
   const judgeable=expected.length>0&&!declaredOpen,hit=judgeable&&assessed.hit,coverageHit=judgeable&&assessed.coverageHit;
   const row={index:turn.index,input:turn.input,oracle:sameScenario?'frozen_scenario_and_calls':'settled_calls_only_scenario_text_changed',criterion:expected.some(call=>call.toolOnly)?'includes_tool_only_oracle':'settled_call_or_asserted_parameters',beforeHash:digest(document),location:document.state.location,minute:document.state.minute,expected,candidates,preview,judgeable,hit,coverageHit,missReason:judgeable&&!hit?missReason(expected,candidates):null,open,openSource:open?(declaredOpen?'scenario_expected_open':'recorded_open_attempt'):null,openHit:open&&preview.choices.some(c=>c.ref==='none'),replayedCalls:0};
   row.tokens={selectionAfter:selectionTokens(preview,turn.input),receiptBefore:estimatedTokens((turn.calls??[]).map(call=>call.result)),receiptAfter:estimatedTokens((turn.calls??[]).map(call=>modelToolResult(call.result)))};
   if(comparisonFactory){const before=comparisonFactory(scoped,document,turn.input,createRoutingContext(scoped,document));const baseline=assessCandidates(scoped,before,expected);row.baselineHit=judgeable&&baseline.hit;row.baselineCoverageHit=judgeable&&baseline.coverageHit;row.tokens.selectionBefore=selectionTokens(before,turn.input);if(row.baselineHit)result.baselineHits++;if(row.baselineCoverageHit)result.baselineCoverageHits++;}
   let failed=null;
   if(tape){
    while(tape.cursor<tape.events.length){
     const event=tape.events[tape.cursor];
     if(event.anchor!==anchor)break;
     if(event.kind!=='action'){failed={reason:'unsupported_event_kind',sequence:event.sequence,kind:event.kind};break;}
     try{
      const next=await engine.reduce(document,event.input);
      if(settled(event.result)!==settled(next.result)){failed={reason:'event_outcome_changed',sequence:event.sequence,input:event.input,recorded:event.result?.receipt?.status??event.result?.ok,current:next.result?.receipt?.status??next.result?.ok};break;}
      const actual=applyPatches(document,persistable(next.patches)),expectedState=applyPatches(tape.expected,event.patches);
      // Current rules may add derived perception or physical-unit records.
      // Keep the current reducer's state; old patches are an independent audit
      // comparison, never patches used to repair or manufacture the live state.
      if(!isDeepStrictEqual(expectedState.state,actual.state))row.ruleDifferences??={sequence:event.sequence,paths:differences(expectedState.state,actual.state).map(row=>row.path)};
      document=actual;tape.expected=expectedState;tape.cursor++;row.replayedCalls++;
     }catch(error){failed={reason:'recorded_event_rejected',sequence:event.sequence,input:event.input,detail:error.message};break;}
    }
    if(!failed&&tape.events[tape.cursor]?.anchor&&!anchors.slice(turn.index+1).includes(tape.events[tape.cursor].anchor))failed={reason:'unassigned_recorded_event',sequence:tape.events[tape.cursor].sequence,anchor:tape.events[tape.cursor].anchor};
   }else for(const [index,call] of (turn.calls??[]).entries()){
    if(query(call.tool))continue;
    const eventId=call.result?.receipt?.eventId??`${anchor}-${index}`;
    try{
     const next=await reduceCall(engine,document,call,eventId),was=settled(call.result),now=settled(next.result);
     if(was!==now){failed={reason:'call_outcome_changed',tool:call.tool,args:call.args,recorded:call.result?.receipt?.status??call.result?.ok,current:next.result?.receipt?.status??next.result?.ok,detail:next.result?.receipt?.reason??next.result?.error};break;}
     document=next.document;row.replayedCalls++;
    }catch(error){if(settled(call.result)){failed={reason:'settled_call_rejected',tool:call.tool,args:call.args,detail:error.message};break;}}
   }
   if(!tape&&!failed&&turn.turnResult){
    const args=turn.consistency?.tail?.args??turn.tail?.args??parseTurn(turn.reply,{location:document.state.location,startMinute:row.minute,minute:document.state.minute}).args;
    try{const next=await reduceCall(engine,document,{tool:'world_turn',args},turn.turnResult.receipt?.eventId??`turn_${anchor}`);document=next.document;}catch(error){failed={reason:'tail_rejected',detail:error.message};}
   }
   if(!failed){
    const differences=[];
    for(const [key,want,actual] of [['minute',turn.minute,document.state.minute],['location',turn.location,document.state.location],['player',turn.player,document.state.player]])if(want!==undefined&&!isDeepStrictEqual(want,actual))differences.push({key,expected:want,actual});
    if(differences.length)failed={reason:'after_state_mismatch',differences};
   }
   if(!tape&&!failed&&session.finalDocument.state.npcPlanning)failed={reason:'missing_server_event_log',detail:'calls omit committed npc_plan inputs; finalDocument confirms NPC planning. Later start states cannot be inferred.'};
   // The start state of this row is valid even if a subsequent call is no
   // longer accepted. Stop the rest of this session; never repair its state.
   result.rows.push(row);result.restored++;if(judgeable){result.judgeable++;if(hit)result.hits++;if(coverageHit)result.coverageHits++;}if(open){result.openTurns++;if(row.openHit)result.openHits++;}
   if(failed){result.stopped={index:turn.index,...failed};break;}
  }
  result.hitRate=result.judgeable?result.hits/result.judgeable:null;
  if(!result.stopped){
   result.finalStateDifferences=Object.keys(session.finalDocument.state).filter(key=>!isDeepStrictEqual(document.state[key],session.finalDocument.state[key]));
   result.finalStateMatches=result.finalStateDifferences.length===0;
  }
 }
 return {scope:'Current-engine execution of recorded calls from original initial/setup and random seed; before-state snapshots are never inferred from prose or final inventory. Hits require every expected tool and key parameter, no missing slots and complete intent. Coverage alone is not safe execution.',...summarize(sessions)};
}
function pathToDirectory(value){return value instanceof URL?value:new URL(`file:///${path.resolve(value).replaceAll('\\','/')}/`);}
export async function replayDirectory(directory,options={}){
 const entries=await fs.readdir(directory,{withFileTypes:true}),sessions=[];
 for(const entry of entries.filter(row=>row.isDirectory())){
  const full=path.join(directory,entry.name,'真实试玩.json'),failed=path.join(directory,entry.name,'真实试玩失败.json');
  let input;try{input=await fs.readFile(full,'utf8');}catch{try{input=await fs.readFile(failed,'utf8');}catch{continue;}}
  const report=await replayCandidates({record:JSON.parse(input),...options});
  sessions.push(...report.sessions.map(row=>({round:entry.name,...row})));
 }
 return summarize(sessions);
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const args=process.argv.slice(2),file=args[0]??'F:/dnd/logs/sessions/a3-playtest',output=args[1];
 const report=(await fs.stat(file)).isDirectory()?await replayDirectory(file):await replayCandidates({record:JSON.parse(await fs.readFile(file,'utf8'))});
 if(output)await fs.writeFile(output,JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,sessions:report.sessions.map(row=>({round:row.round,id:row.id,total:row.total,restored:row.restored,judgeable:row.judgeable,hits:row.hits,coverageHits:row.coverageHits,stopped:row.stopped&&{index:row.stopped.index,reason:row.stopped.reason,sequence:row.stopped.sequence,detail:row.stopped.detail}}))}));
}
