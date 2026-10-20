// Native routing policy (06 §6.8). Never executes a proposal's declared result.
import {MemoryIndex,bm25TermScore} from './retrieval.mjs';

const tokenizer=new MemoryIndex();
const multiset=values=>{const out=new Map();for(const value of values)out.set(value,(out.get(value)??0)+1);return out;};
export function signatureJaccard(left,right){
 const a=multiset(left),b=multiset(right);let common=0,total=0;
 for(const key of new Set([...a.keys(),...b.keys()])){common+=Math.min(a.get(key)??0,b.get(key)??0);total+=Math.max(a.get(key)??0,b.get(key)??0);}
 return total?common/total:0;
}
export function effectSignature(effects,{kindOf=()=>null,bindings={}}={}){
 const bind=value=>value&&typeof value==='object'&&value.slot?bindings[value.slot]:value;
 return effects.map(effect=>{
  const target=bind(effect.target??effect.entity??effect.subject??effect.to);
  const slot=(effect.target??effect.entity??effect.subject??effect.to)?.slot;
  const kind=kindOf(target)??(slot?bindings[`kind:${slot}`]:null)??'*';
  const resource=effect.op==='transfer'?String(bind(effect.from)??'').split('|')[1]:null;
  return JSON.stringify([effect.op,kind,effect.field??effect.resource??resource??effect.verb??effect.status??effect.type??'']);
 }).sort();
}
function actionSignature(action,context,slots){
 if(Array.isArray(action.signature))return [...action.signature].sort();
 const effects=Array.isArray(action.outcomes)?action.outcomes:action.outcomes?.success??action.outcomes?.accepted;
 if(!effects)return []; // Legacy definitions need authored signatures, not guessed intent IDs.
 const bindings={...slots};for(const slot of action.slots??[])if(slot.entity)bindings[`kind:${slot.name}`]=slot.entity;
 return effectSignature(effects,{...context,bindings});
}
function textScores(actions,intent){
 const query=new Set(tokenizer.terms(intent)),rows=actions.map(action=>{
  const fields=[action.label,action.verb,...action.synonyms??[],...action.llm?.examples??[]].filter(Boolean);
  const terms=fields.flatMap(text=>tokenizer.terms(text));return {terms,frequencies:multiset(terms)};
 });
 const df=new Map();for(const row of rows)for(const term of row.frequencies.keys())df.set(term,(df.get(term)??0)+1);
 const average=rows.reduce((sum,row)=>sum+row.terms.length,0)/Math.max(1,rows.length);
 // Normalize each term against its theoretical saturation, not the best candidate:
 // an unrelated sole candidate must not acquire a perfect text score.
 const maximum=[...query].reduce((sum,term)=>sum+bm25TermScore(1e9,df.get(term)??0,rows.length,average,average),0);
 return rows.map(row=>maximum?[...query].reduce((sum,term)=>sum+bm25TermScore(row.frequencies.get(term)??0,df.get(term)??0,rows.length,row.terms.length,average),0)/maximum:0);
}
const fits=(action,participants,kindOf)=>Object.entries(action.participants??{}).every(([role,types])=>{
 if(role==='others')return true; // A1 participant slot names, not a kind predicate.
 const entity=participants[role];if(types==='player')return entity==='player';
 const allowed=Array.isArray(types)?types:[types];return entity!==undefined&&allowed.includes(kindOf(entity));
});
export function routeAction(proposal,registry,context){
 if(typeof context?.visible!=='function'||typeof context.kindOf!=='function'||typeof context.slotsFor!=='function')throw Error('Routing requires native visibility, kinds and slot extraction');
 const participants={...proposal.participants,actor:context.actor??'player'};
 // No source, check, effects, consent or cost from a proposal can replace the definition.
 const actions=registry.actions.filter(a=>!a.readOnly&&!a.projection&&fits(a,participants,context.kindOf)&&context.visible(a,participants));
 const texts=textScores(actions,proposal.intent??''),signature=effectSignature(proposal.effects??[],context);
 const candidates=actions.map((action,index)=>{
  const slots=context.slotsFor(action,proposal)??{},missing=(action.slots??[]).filter(s=>s.required&&slots[s.name]===undefined&&action.call?.fixed?.[s.name]===undefined).map(s=>s.name);
  const signatureScore=signatureJaccard(signature,actionSignature(action,context,slots)),textScore=texts[index];
  return {id:action.id,score:.6*signatureScore+.4*textScore,signatureScore,textScore,slots,missing};
 }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 const best=candidates[0],matched=best&&best.score>=.7;
 return {signature,candidates,routed:matched&&!best.missing.length?best.id:null,needsSlots:matched&&best.missing.length?{action:best.id,missing:best.missing}:null,nearest:best??null};
}
