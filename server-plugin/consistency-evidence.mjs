import {npcContext} from './npc-memory.mjs';
import {npcCognitionView} from './npc-cognition.mjs';

const pick=(row,keys)=>Object.fromEntries(keys.filter(key=>row[key]!==undefined).map(key=>[key,structuredClone(row[key])]));
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
 const facts=reviewPlayerFacts(state),contracts=[...Object.entries(facts.quests).map(([id,row])=>({id,kind:'quest',row,parties:[row.publisher,row.taker],sourceEvent:id.replace(/^quest_/,'' )})),...Object.entries(facts.authorizations).map(([id,row])=>({id,kind:'authorization',row,parties:[row.grantor,row.grantee],sourceEvent:row.sourceEvent})),...Object.entries(state.obligations??{}).filter(([,row])=>[row.promisor,row.promisee].includes('player')).map(([id,row])=>({id,kind:'obligation',row,parties:[row.promisor,row.promisee],sourceEvent:id.replace(/^obl_/,'' )}))];
 return Object.fromEntries([...ids].sort().flatMap(id=>{
  const context=npcContext(engine,document,id,`${query} ${draft}`);if(!context)return [];
  const cognition=npcCognitionView(engine,document,id),memories=cognition.memories.filter(row=>row.minute<=state.minute);
  const contractKnowledge=contracts.map(contract=>{
   const sources=new Set([contract.sourceEvent,...events.filter(event=>event.input?.args?.quest===contract.id||event.result?.quest===contract.id||event.input?.args?.authorization===contract.id).map(event=>event.id)]);
   const related=memories.filter(memory=>sources.has(memory.sourceEvent)||memory.id.endsWith(`:obligation_${contract.id}`));
   return {reference:contract.id,kind:contract.kind,party:contract.parties.includes(id),awareness:related.length?'recorded-memory':'no-recorded-channel',memories:related.map(memory=>pick(memory,['id','sourceEvent','sourceType','heardFrom','minute','content','blurred','reliability']))};
  });
  return [[id,{scope:'reviewer-only',known:context.known,unknown:context.unknown,memories:context.memories.map(memory=>pick(memory,['id','sourceEvent','sourceType','heardFrom','minute','content','blurred','reliability'])),contracts:contractKnowledge}]];
 }));
}
