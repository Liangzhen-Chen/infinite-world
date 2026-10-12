import {npcContext} from './npc-memory.mjs';
import {npcCognitionView} from './npc-cognition.mjs';

const pick=(row,keys)=>Object.fromEntries(keys.filter(key=>row[key]!==undefined).map(key=>[key,structuredClone(row[key])]));
const resultOf=event=>event.result?.result??event.result??{};
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
  quests:Object.fromEntries(Object.entries(state.quests??{}).filter(([,q])=>q.taker==='player'||q.publisher==='player').map(([id,q])=>[id,pick(q,['publisher','taker','name','content','status','grade','reward','objective','deadline'])])),
  authorizations:Object.fromEntries(Object.entries(state.records??{}).filter(([,r])=>r.category==='authorization'&&(r.grantee==='player'||r.grantor==='player')).map(([id,r])=>[id,pick(r,['action','subject','grantor','grantee','guests','content','createdAt','expires','revoked','revokedAt','sourceEvent'])]))
 };
}

// Reviewer-only evidence: global ledger truth is not a character's knowledge.
// The host scene/public catalog never receives this map. Cognition preserves
// blurred recollection and the provenance of unverified retellings.
export function reviewNpcKnowledge(engine,document,{before,receipts=[],events=[],draft='',query=''}={}){
 const state=document.state,ids=new Set();
 for(const snapshot of [before?.state??before,state])for(const [id,npc] of Object.entries(snapshot?.npcs??{}))if(npc.location===snapshot.location&&!npc.scheduleTravel&&!npc.cognitionTravel)ids.add(id);
 const mention=value=>{if(typeof value!=='string')return;try{const id=engine.resolve(value);if(state.npcs[id])ids.add(id);}catch{}};
 for(const match of draft.matchAll(/<q\s+who="([^"]+)"/g))mention(match[1]);
 for(const receipt of receipts)for(const source of [receipt.args,receipt.result])for(const key of ['npc','publisher','taker','promisor','promisee','seller','buyer','target','grantor','grantee'])mention(source?.[key]);
 const facts=reviewPlayerFacts(state),contracts=[...Object.entries(facts.quests).map(([id,row])=>({id,kind:'quest',row,parties:[row.publisher,row.taker],sourceEvent:id.replace(/^quest_/,'' )})),...Object.entries(facts.authorizations).map(([id,row])=>({id,kind:'authorization',row,parties:[row.grantor,row.grantee],sourceEvent:row.sourceEvent})),...Object.entries(state.obligations??{}).filter(([,row])=>[row.promisor,row.promisee].includes('player')).map(([id,row])=>({id,kind:'obligation',row,parties:[row.promisor,row.promisee],sourceEvent:id.replace(/^obl_/,'' )})),...Object.entries(state.records??{}).filter(([,row])=>row.category==='debt'&&[row.debtor,row.creditor].includes('player')).map(([id,row])=>({id,kind:'debt',row,parties:[row.debtor,row.creditor],sourceEvent:id.replace(/^debt_/,'' )}))];
 return Object.fromEntries([...ids].sort().flatMap(id=>{
  const context=npcContext(engine,document,id,`${query} ${draft}`);if(!context)return [];
  const cognition=npcCognitionView(engine,document,id),memories=cognition.memories.filter(row=>row.minute<=state.minute);
  const contractKnowledge=contracts.map(contract=>{
   const sources=new Set([contract.sourceEvent,...events.filter(event=>event.input?.args?.quest===contract.id||event.result?.quest===contract.id||event.input?.args?.authorization===contract.id).map(event=>event.id)]);
   const related=memories.filter(memory=>sources.has(memory.sourceEvent)||memory.id.endsWith(`:obligation_${contract.id}`));
   return {reference:contract.id,kind:contract.kind,party:contract.parties.includes(id),awareness:related.length?'recorded-memory':'no-recorded-channel',facts:pick(contract.row,['name','content','status','objective','reward','amount','deadline','subject','coins','item','quantity']),parties:contract.parties,memories:related.map(memory=>pick(memory,['id','sourceEvent','sourceType','heardFrom','minute','content','blurred','reliability','participants']))};
  });
  return [[id,{scope:'reviewer-only',present:state.npcs[id].location===state.location&&!state.npcs[id].scheduleTravel&&!state.npcs[id].cognitionTravel,known:context.known,unknown:context.unknown,memories:memories.map(memory=>pick(memory,['id','sourceEvent','sourceType','heardFrom','minute','content','blurred','reliability','participants'])),contracts:contractKnowledge,recall:recallEvidence(state,id,events)}]];
 }));
}
