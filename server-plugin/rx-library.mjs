// L1 RX library. Functions close over native current data; results contain
// data copies only. NPC decisions use the NPC's subjective view, never truth
// injected by an action proposal, and never return its private decision trace.
import {RXError} from './rx.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
import {capacity,canAct,actionReader} from './action-capacity.mjs';
import {authority} from './action-authority.mjs';
import {consent} from './action-consent.mjs';
import {aliveHoldings} from './holdings.mjs';

const invalid=message=>{throw new RXError('E-RX-TYPE',message);};
export function createRXLibrary(engine,document,{observer='player',context={engine,document}}={}){
 const now=document.state.minute;
 const signatures={
  days:{args:['number'],returns:'number'},season:{args:[],returns:'number'},month:{args:[],returns:'number'},
  holds:{args:['string','string','string'],returns:'boolean'},
  capacity:{args:['string','string'],returns:{level:'string',reason:'string'}},
  canAct:{args:['string','string'],returns:{allowed:'boolean',reason:'string'}},
  authority:{args:['string','string','string'],returns:{allowed:'boolean',reason:'string'}},
  consent:{returns:{allowed:'boolean',kind:'string',check:'string'}},
  npcDecision:{returns:{outcome:'string',reason:'string'}}
 };
 const functions={
  days(since){if(!Number.isSafeInteger(since))invalid('days requires an integer minute');return Number((BigInt(now)-BigInt(since))*10000n/1440n)/10000;},
  season:()=>engine.calendar(now).season,month:()=>engine.calendar(now).month,
  holds:(actor,kind,subject)=>aliveHoldings(actionReader(document),{holder:actor,kind,subject}).length>0,
  capacity(actor,family){const r=capacity(context,actor,family);return {level:r.level,reason:r.reason??''};},
  canAct(actor,family){const r=canAct(context,actor,family);return {allowed:r.allowed,reason:r.reason??''};},
  authority(actor,op,target){const r=authority(context,actor,op,target);return {allowed:r.allowed,reason:r.reason??''};},
  consent(from,to,scope,options={}){
   if([from,to,scope].some(value=>typeof value!=='string')||!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['purpose','until','onRefusal'].includes(key)))invalid('consent requires parties, scope and optional purpose/expiry data');
   const r=consent(context,from,to,scope,options);return {allowed:r.allowed,kind:r.kind,check:r.check??''};
  },
  npcDecision(target,request){
   if(typeof target!=='string'||target==='player'||!document.state.npcs?.[target]&&!document.state.creatures?.[target]||!request||typeof request!=='object'||Array.isArray(request))invalid('npcDecision requires a current NPC and request data');
   const decision=npcDecision(subjectiveView(engine,document,target),{...request,from:observer});
   return {outcome:decision.outcome,reason:decision.reason};
  }
 };
 return {signatures,functions};
}
