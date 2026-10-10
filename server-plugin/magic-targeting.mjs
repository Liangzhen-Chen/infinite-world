// This boundary consumes trusted engine facts, never model-supplied coordinates.
export function validateTargeting(catalog){
 const t=catalog.targeting;if(!t)return[];const errors=[];
 if(!t||typeof t!=='object'||Array.isArray(t)||Object.keys(t).some(k=>!['lineOfSight','consent','permit'].includes(k)))return['施法目标边界含未知字段'];
 if(t.lineOfSight!==true)errors.push('新目标规则须声明视线边界');
 if(!Number.isFinite(catalog.rangeMeters)||catalog.rangeMeters<0||catalog.rangeMeters>100)errors.push('施法射程无效');
 if(t.consent!==undefined&&!['support_magic','mental_magic'].includes(t.consent))errors.push('本人同意类别无效');
 if(t.permit!==undefined&&t.permit!=='mental_magic')errors.push('施法许可类别无效');
 return errors;
}
export function assertTargetFacts(catalog,facts){
 if(!facts||!Number.isFinite(facts.distanceMeters)||facts.distanceMeters<0||facts.lineOfSight!==true)throw Error('缺少目标实际距离与无遮挡视线事实');
 if(facts.distanceMeters>catalog.rangeMeters)throw Error('目标超过法术实际射程');
}
export function assertMagicTargeting(d,engine,catalog,args,target){
 const t=catalog.targeting;if(!t)return;
 const errors=validateTargeting(catalog);if(errors.length)throw Error(errors.join('；'));
 // Foreign living targets await the shared scene resolver. Missing facts fail closed.
 const facts=target==='player'?{distanceMeters:0,lineOfSight:true}:engine.magicTargetFacts?.(d,target);
 assertTargetFacts(catalog,facts);
 const now=d.get('state','minute');
 if(t.consent&&target!=='player'){
  const r=d.get('state','records',args.authorization);
  if(r?.category!=='authorization'||r.action!==t.consent||r.subject!==target||r.grantor!==target||r.grantee!=='player'||r.revoked||!Number.isSafeInteger(r.expires)||r.expires<=now)throw Error('施法需要本人仍有效的自愿同意');
 }
 if(t.permit){
  const r=d.get('state','records',args.permit),location=d.get('state','location');
  const code=engine.rules.law?.codes.find(c=>c.locations.includes(location));
  if(!code||r?.category!=='authorization'||r.action!==t.permit||r.subject!=='player'||r.location!==location||![...code.officers,...code.judges].includes(r.grantor)||r.revoked||!Number.isSafeInteger(r.expires)||r.expires<=now)throw Error('精神施法需要当地实际颁发且仍有效的许可');
 }
}
