import {npcContext,npcBackground} from './npc-memory.mjs';
import {npcCognitionView} from './npc-cognition.mjs';
import {isOutOfCharacter} from '../extension/prompt.mjs';
import {normalize} from './retrieval.mjs';
import {lieKnowledge} from './lies.mjs';

const pick=(row,keys)=>Object.fromEntries(keys.filter(key=>row[key]!==undefined).map(key=>[key,structuredClone(row[key])]));
const resultOf=event=>event.result?.result??event.result??{};
// Only settled output belongs to this turn. Proposed effects, previews and old
// dialogue/consent records cannot supply a missing action or NPC decision.
export function reviewTurnSettlement(input,receipts,applied){
 const before=input.before?.state??input.before??{},after=input.after?.state??input.after??{};
 const effects=[],decisions=[],settled=[];
 for(const [index,row] of receipts.entries()){
  const result=row.result,native=result.receipt;
  // Per-event applied is the service's actual before→after diff, including
  // consequences of a failed contest. A rejected proposal's native.applied,
  // in contrast, must never be treated as a completed player action.
  effects.push(...(row.applied??[]).map(effect=>({receipt:index,...effect})));
  if(row.applied?.length)settled.push(index);
  if(native&&native.status!=='committed'||result.ok===false)continue;
  if(!settled.includes(index))settled.push(index);
  effects.push(...(native?.applied??[]).map(effect=>({receipt:index,...effect})));
  const legacy=native?.legacy??result,dialogue=legacy.dialogue??result.dialogue;
  if(dialogue?.npc&&dialogue.decision?.outcome)decisions.push({receipt:index,npc:dialogue.npc,action:dialogue.action,...dialogue.decision});
  if(typeof legacy.decision==='string'&&(legacy.npc??legacy.from??row.args?.promisor))decisions.push({receipt:index,npc:legacy.npc??legacy.from??row.args.promisor,outcome:legacy.decision});
  if(native?.consent?.allowed&&native.consent.from&&native.consent.source)decisions.push({receipt:index,npc:native.consent.from,outcome:'agree',source:native.consent.source});
 }
 // Legacy callers supplied a whole-turn diff rather than per-event applied.
 if(settled.length&&!receipts.some(row=>Array.isArray(row.applied)))effects.push(...applied);
 const records=settled.length?Object.entries(after.records??{}).filter(([id,row])=>JSON.stringify(row)!==JSON.stringify(before.records?.[id])).map(([id,row])=>({id,...pick(row,['category','kind','author','location','active',...(row.category==='mark'?['intent','form','zone']:[])])})):[];
 const marks=records.filter(row=>row.category==='mark'&&row.active);
 for(const row of settled.length?after.consentEvents??[]:[])if(!(before.consentEvents??[]).some(old=>old.id===row.id)&&row.type==='consent_given')decisions.push({npc:row.from,outcome:'agree',source:row.id});
 return {receiptCount:receipts.length,settled,effects,decisions,marks,records};
}
// A completed long wait is a bounded absence, not the entire NPC biography.
// The movement destination tracks the player's actual location at that wait.
export function reviewRecallWindow(events,location,now){
 let playerLocation,window=null;
 for(const event of events){
  const result=resultOf(event),tool=event.input?.tool;
  if(result.ok===false)continue;
  if(tool==='world_move'&&result.destination)playerLocation=result.destination;
  if(tool==='world_time'&&result.elapsed>=1440&&Number.isSafeInteger(result.minute)&&result.minute<=now&&playerLocation&&playerLocation!==location)
   window={start:result.minute-result.elapsed,end:result.minute,sourceEvent:event.id,playerLocation};
 }
 return window;
}
function recallEvidence(state,id,events){
 const actions=Object.values(state.npcAutonomy?.actions??{}).filter(row=>row.npc===id&&row.kind==='craft'&&row.minute<=state.minute).sort((a,b)=>a.minute-b.minute||a.id.localeCompare(b.id));
 const location=actions.at(-1)?.location,window=location?reviewRecallWindow(events,location,state.minute):null;
 if(!window)return {scope:'reviewer-only',window:null,awareness:'unknown-window',actions:[]};
 const rows=actions.filter(row=>row.minute>window.start&&row.minute<=window.end),memories=state.npcs[id]?.memoryStream??[];
 const owned=rows.filter(row=>memories.some(memory=>memory.sourceEvent===row.id&&memory.participants?.includes(id)&&memory.sourceType==='亲历'&&!state.npcs[id]?.cognition?.blurred?.[memory.id]));
 const complete=rows.every(row=>typeof row.outcome?.success==='boolean'&&Number.isFinite(row.spent?.fee)&&Array.isArray(row.spent?.materials)&&row.spent.materials.every(material=>typeof material.item==='string'&&Number.isFinite(material.amount)));
 const materials={};for(const row of rows)for(const material of row.spent?.materials??[])materials[material.item]=(materials[material.item]??0)+material.amount;
 return {scope:'reviewer-only',window,awareness:complete&&owned.length===rows.length&&rows.length?'personal-record':'unknown',
  totals:complete?{attempts:rows.length,successes:rows.filter(row=>row.outcome?.success===true).length,failures:rows.filter(row=>row.outcome?.success===false).length,fee:rows.reduce((sum,row)=>sum+row.spent.fee,0),materials}:null,
  actions:rows.map(row=>pick(row,['id','npc','action','start','minute','location','outcome','spent','produced','summary']))};
}
export function reviewPlayerFacts(state){
 return {
  debts:Object.fromEntries(obligationRows(state).filter(r=>[r.debtor,r.creditor].includes('player')).map(r=>[r.legacyRecord??r.id,{...pick({...r,...state.records?.[r.legacyRecord]},['name','debtor','creditor','amount','paid','status','createdAt','deadline','overdueAt','paidAt']),resource:r.resource??'coin_river',outstanding:obligationView(state,r).owed,amountDue:obligationView(state,r).amountDue,closed:obligationView(state,r).closed}])),
  quests:Object.fromEntries(Object.entries(state.quests??{}).filter(([,q])=>q.taker==='player'||q.publisher==='player'||!q.taker).map(([id,q])=>[id,pick(q,['publisher','taker','name','content','status','grade','reward','objective','deadline','escrow'])])),
  authorizations:Object.fromEntries(Object.entries(state.records??{}).filter(([,r])=>r.category==='authorization'&&(r.grantee==='player'||r.grantor==='player')).map(([id,r])=>[id,pick(r,['action','subject','grantor','grantee','guests','scope','content','createdAt','expires','revoked','revokedAt','sourceEvent'])]))
 };
}

// Raw receipts establish settlement; chat establishes what was actually said.
// Neither source gives an unrelated character a new knowledge channel.
export function reviewHistoricalEvidence(engine,events,chat,{query='',draft=''}={}){
 if(!isOutOfCharacter(query))return [];
 const text=normalize(query+' '+draft),mentioned=engine.entities.filter(row=>[row.id,row.name,...row.aliases??[]].some(name=>name?.length>=2&&text.includes(normalize(name))));
 const related=value=>mentioned.some(row=>[row.id,row.name,...row.aliases??[]].some(name=>name?.length>=2&&normalize(value).includes(normalize(name))));
 const tools=[];
 if(/委托|报酬|经验/.test(text))tools.push('world_quest');
 if(/约定|送货|登记/.test(text))tools.push('world_promise');
 if(/购买|交易|付款|钱袋/.test(text))tools.push('world_trade');
 const rows=events.filter(event=>event.input?.tool&&event.input.tool!=='world_turn'&&(related(JSON.stringify(event))||tools.includes(event.input.tool))).map(event=>({kind:'historical-receipt',text:JSON.stringify({eventId:event.id,anchor:event.anchor,tool:event.input.tool,args:event.input.args,result:event.result})}));
 for(const message of chat??[])if(!message.is_system&&!message.extra?.tool_invocations&&!message.extra?.fields_invalidated&&typeof message.mes==='string'&&related(message.mes))rows.push({kind:'chat',text:JSON.stringify({speaker:message.name,isUser:message.is_user===true,text:message.mes})});
 return rows;
}

// Reviewer-only evidence: global ledger truth is not a character's knowledge.
// The host scene/public catalog never receives this map. Cognition preserves
// blurred recollection and the provenance of unverified retellings.
function routineIntervals(engine,document,id,before,receipts){
 const previous=before?.state??before,state=document.state,start=previous?.minute,end=state.minute;
 if(!Number.isSafeInteger(start)||end<=start||!receipts.length||receipts.some(r=>r.tool!=='world_time'||r.result?.ok===false))return [];
 // Both snapshots plus the uninterrupted wait establish only this interval.
 if(receipts.reduce((n,r)=>n+(r.result?.elapsed??0),0)!==end-start)return [];
 const initial=npcBackground(engine,{state:previous},id),final=npcBackground(engine,document,id);
 const slot=initial?.schedule.slots.find(row=>row.start<=start&&end<row.end);
 if(!slot||!initial.schedule.current||!final?.schedule.current||initial.schedule.current.location!==final.schedule.current.location)return [];
 const overlaps=(from,to)=>Number.isFinite(from)&&Number.isFinite(to)&&from<end&&to>start;
 for(const snapshot of [previous,state]){
  if(Object.values(snapshot.effects??{}).some(e=>e.target===id&&overlaps(e.started,e.expires)&&
      (e.kind==='water_earth'&&e.operation==='bind_water'||e.kind==='mind_space'&&e.operation==='sleep'&&e.sleeping)))return [];
  if(Object.values(snapshot.obligations??{}).some(o=>[o.promisor,o.promisee].includes(id)&&overlaps(o.departures?.[id]??o.start,o.deadline)))return [];
  if(Object.values(snapshot.npcAutonomy?.tasks??{}).some(t=>t.npc===id&&overlaps(t.start,t.finish)))return [];
 }
 return [{start,end,location:slot.location,activity:slot.activity,source:'before/after + world_time receipts',limit:'仅确认该时段活动，不证明完成数量或具体进度'}];
}
export function reviewNpcKnowledge(engine,document,{before,receipts=[],events=[],draft='',query=''}={}){
 const state=document.state,ids=new Set();
 for(const snapshot of [before?.state??before,state])for(const [id,npc] of Object.entries(snapshot?.npcs??{}))if(npc.location===snapshot.location&&!npc.scheduleTravel&&!npc.cognitionTravel)ids.add(id);
 const mention=value=>{if(typeof value!=='string')return;try{const id=engine.resolve(value);if(state.npcs[id])ids.add(id);}catch{}};
 for(const match of draft.matchAll(/<q\s+who="([^"]+)"/g))mention(match[1]);
 for(const receipt of receipts)for(const source of [receipt.args,receipt.result])for(const key of ['npc','publisher','taker','promisor','promisee','seller','buyer','target','grantor','grantee'])mention(source?.[key]);
 const facts=reviewPlayerFacts(state),contracts=[...Object.entries(facts.quests).map(([id,row])=>({id,kind:'quest',row,parties:[row.publisher,row.taker],sourceEvent:id.replace(/^quest_/,'' )})),...Object.entries(facts.authorizations).map(([id,row])=>({id,kind:'authorization',row,parties:[row.grantor,row.grantee],sourceEvent:row.sourceEvent})),...Object.entries(state.obligations??{}).filter(([,row])=>[row.promisor,row.promisee].includes('player')).map(([id,row])=>({id,kind:'obligation',row,parties:[row.promisor,row.promisee],sourceEvent:id.replace(/^obl_/,'' )})),...Object.entries(state.records??{}).filter(([,row])=>row.category==='debt'&&[row.debtor,row.creditor].includes('player')).map(([id,row])=>({id,kind:'debt',row,parties:[row.debtor,row.creditor],sourceEvent:id.replace(/^debt_/,'' )}))];
 return Object.fromEntries([...ids].sort().flatMap(id=>{
  const context=npcContext(engine,document,id,`${query} ${draft}`);if(!context)return [];
  context.background.schedule.intervals=routineIntervals(engine,document,id,before,receipts);
  const cognition=npcCognitionView(engine,document,id),memories=cognition.memories.filter(row=>row.minute<=state.minute);
  const contractKnowledge=contracts.map(contract=>{
   const sources=new Set([contract.sourceEvent,...events.filter(event=>event.input?.args?.quest===contract.id||event.result?.quest===contract.id||event.input?.args?.authorization===contract.id).map(event=>event.id)]);
   const related=memories.filter(memory=>sources.has(memory.sourceEvent)||memory.id.endsWith(`:obligation_${contract.id}`));
   return {reference:contract.id,kind:contract.kind,party:contract.parties.includes(id),awareness:related.length?'recorded-memory':'no-recorded-channel',facts:pick(contract.row,['name','content','status','objective','reward','amount','deadline','subject','coins','item','quantity']),parties:contract.parties,memories:related.map(memory=>pick(memory,['id','sourceEvent','sourceType','heardFrom','minute','content','blurred','reliability','participants']))};
  });
  return [[id,{scope:'reviewer-only',present:state.npcs[id].location===state.location&&!state.npcs[id].scheduleTravel&&!state.npcs[id].cognitionTravel,known:context.known,unknown:context.unknown,background:context.background,memories:memories.map(memory=>pick(memory,['id','sourceEvent','sourceType','heardFrom','minute','content','blurred','reliability','participants'])),contracts:contractKnowledge,recall:recallEvidence(state,id,events),...(lieKnowledge(state,id).length?{lies:lieKnowledge(state,id)}:{})}]];
 }));
}
import {obligationRows,obligationView} from './obligation-state.mjs';
