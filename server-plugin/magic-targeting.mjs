import {preconditionFailure} from './precondition.mjs';
import {noteOffense} from './offense-notes.mjs';
import {reject} from './action-rejection.mjs';
import {legalCodeAt} from './law-codes.mjs';
import {digest}from'./storage.mjs';
import {assertSpellConsent}from'./magic-consent.mjs';
// This boundary consumes trusted engine facts, never model-supplied coordinates.
export function validateTargeting(catalog){
 const t=catalog.targeting;if(!t)return[];const errors=[];
 if(!t||typeof t!=='object'||Array.isArray(t)||Object.keys(t).some(k=>!['lineOfSight','consent','permit'].includes(k)))return['施法目标边界含未知字段'];
 if(t.lineOfSight!==true)errors.push('新目标规则须声明视线边界');
 if(!Number.isFinite(catalog.rangeMeters)||catalog.rangeMeters<0||catalog.rangeMeters>100)errors.push('施法射程无效');
 if(t.consent!==undefined&&!['support_magic','mental_magic','healing'].includes(t.consent))errors.push('本人同意类别无效');
 if(t.permit!==undefined&&t.permit!=='mental_magic')errors.push('施法许可类别无效');
 return errors;
}
export function assertTargetFacts(catalog,facts){
 if(!facts||!Number.isFinite(facts.distanceMeters)||facts.distanceMeters<0||facts.lineOfSight!==true)reject('E-ACTION-SPATIAL-FACTS','缺少目标实际距离与无遮挡视线事实',{missing:['需要目标实际距离及无遮挡视线的空间事实'],repair:['先观察并接近目标，确认实际距离和无遮挡视线后重试']});
 if(facts.distanceMeters>catalog.rangeMeters)throw preconditionFailure('目标超过法术实际射程',{code:'E-ACTION-CAST-RANGE'});
}
export function assertMagicTargeting(d,engine,catalog,args,target){
 const t=catalog.targeting;if(!t)return;
 const errors=validateTargeting(catalog);if(errors.length)throw Error(errors.join('；'));
 // Foreign living targets await the shared scene resolver. Missing facts fail closed.
 const facts=target==='player'?{distanceMeters:0,lineOfSight:true}:engine.magicTargetFacts?.(d,target);
 assertTargetFacts(catalog,facts);
 const now=d.get('state','minute');
 if(t.consent&&target!=='player'){
  assertSpellConsent(d,engine,catalog,args,target,t.consent);
 }
 // Self consent does not replace a spell's explicit legal permit requirement.
 if(t.permit){
  const r=d.get('state','records',args.permit),location=d.get('state','location');
  const code=legalCodeAt(engine,location,d.get('state'));
  const delegated=code?.magicAuthorities?.some(a=>a.npc===r?.grantor&&a.locations.includes(location)&&a.actions.includes(t.permit));
  const receipt=r?.sourceEvent&&d.get('state','records',`magic_permission_source:${r.sourceEvent}`);
  const issued=r?.sourceType==='magic_permit'&&receipt&&digest(r)===digest(receipt.permission)&&r.law===code?.id&&r.createdAt<=now;
  if(!code||r?.category!=='authorization'||r.action!==t.permit||r.subject!=='player'||r.location!==location||(![...code.officers,...code.judges].includes(r.grantor)&&!(delegated&&issued))||r.revoked||!Number.isSafeInteger(r.expires)||r.expires<=now||(r?.sourceType==='magic_permit'||String(args.permit).startsWith('magic_permission:'))&&!issued)noteOffense(d,{act:'cast',victim:null,subject:{id:catalog.id,kind:'spell',permit:t.permit},actor:'player'});
 }
}
