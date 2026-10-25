import {preconditionFailure} from './precondition.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {personView,personMental}from'./entity-view.mjs';
import {standing}from'./standing.mjs';
import {relationView}from'./npc-relations.mjs';
import {intelligenceOf}from'./npc-intelligence.mjs';
import {registerIncident}from'./law.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {consent,applyConsentEvent} from './action-consent.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
declareHoldingWriter('magic-consent',{kinds:['permit']});

export const spellConsentActions=['mental_magic','support_magic','healing'];
export function spellConsentGrant(d,target,authorization,action,catalog,until=d.get('state','minute'),engine){
 if(target==='player')return {id:null,expires:Infinity,kind:'self'};
 const state=d.get('state'),r=state.records?.[authorization];
 const purpose=catalog?.id??catalog?.effectSpec?.operation??action;
 const legacy=r?.category==='authorization'&&r.action===action&&r.subject===target&&r.grantor===target&&r.grantee==='player'&&!r.revoked&&r.endedAt===undefined&&Number.isSafeInteger(r.expires)&&r.expires>until&&
  (r.createdAt===undefined||r.createdAt<=d.get('state','minute'))&&(!r.scope?.spell||r.scope.spell===catalog?.id)&&(!r.scope?.location||r.scope.location===(catalog?.location??d.get('state','location')));
 // Old category-wide grants keep their scope. New grants use exact purposes;
 // neither an unrelated authorization nor proposal consent:true is evidence:
 // consent() is shown only the one legacy grant, never the whole record set.
 const authorizationRecords=legacy?[[authorization,{...r,purpose:r.purpose??[purpose]}]]:[];
 const events=state.consentEvents??[];
 const selected=authorization?events.filter(e=>e.id===authorization||e.type==='consent_revoked'):events;
 // Continuous consumers may settle an interval whose start precedes now.
 // An already observed revocation still takes effect immediately.
 const at=Math.min(state.minute,until);
 const consentEvents=selected.map(e=>e.type==='consent_revoked'&&e.at<=state.minute?{...e,at:Math.min(e.at,at)}:e);
 const document={...d.document,state:{...state,minute:at,consentEvents}};
 const permission=consent({engine,document,authorizationRecords,emergencyConsent:()=>({allowed:false})},target,'player',action,{purpose,until,onRefusal:'abort'});
 if(!permission.allowed)return null;
 const event=events.find(e=>e.id===permission.source);
 return {id:permission.source,expires:event?.until??r?.expires??Infinity,kind:permission.kind};
}
export const hasSpellConsent=(...args)=>Boolean(spellConsentGrant(...args));
export function emergencyHealing(d,engine,target,catalog){
 const rule=engine.rules.law?.emergencyHealing,code=engine.rules.law?.codes?.find(c=>c.locations.includes(catalog?.location??d.get('state','location')));
 const a=d.get('state',target==='player'?'player':target.startsWith('npc_')?'npcs':'creatures',...(target==='player'?[]:[target]));
 return Boolean(rule&&code&&rule.laws.includes(code.id)&&rule.statuses.includes(a?.status)&&rule.operations.includes(catalog?.effectSpec?.operation??catalog?.effectSpec?.kind));
}
export function assertSpellConsent(d,engine,catalog,args,target,action,until=d.get('state','minute')){
 if(hasSpellConsent(d,target,args.authorization,action,catalog,until,engine)||action==='healing'&&emergencyHealing(d,engine,target,catalog))return;
 if(args.force===true&&target!=='player')return;
 throw preconditionFailure(action==='healing'?'需要本人同意：照护或病症观察须验证本人有效同意与授权；濒死急救除外':'施法需要本人同意：须本人自愿同意且授权仍有效',{code:'E-ACTION-CAST-CONSENT'});
}
export function spellConsentPermission(d,engine,args,eventId){
 if(!['grant_access','revoke_access'].includes(args.operation))return null;
 const old=d.get('state','records',args.authorization),events=d.get('state','consentEvents')??[];
 const native=events.find(e=>e.id===args.authorization&&e.type==='consent_given');
 const action=args.location??args.destination??old?.action??native?.scope;
 if(!spellConsentActions.includes(action))return null;
 const target=engine.resolve(args.promisor,'npc'),now=d.get('state','minute');
 if(args.promisee!==undefined&&engine.resolve(args.promisee)!=='player'||args.guests?.length)throw preconditionFailure('施法同意只由本人给玩家，不能代替他人同意');
 if(args.operation==='revoke_access'){
  if(native&&!old){
   if(native.from!==target||native.to!=='player'||native.scope!==action)throw preconditionFailure('只有原签发本人能撤销同意');
   if(d.get('state','npcs',target,'location')!==d.get('state','location'))throw preconditionFailure('撤销同意须本人在场');
   if(events.some(e=>e.type==='consent_revoked'&&e.consent===native.id&&e.at<=now))return{authorization:native.id,consent:native,duplicate:true};
   const row=applyConsentEvent(d,{engine,document:d.document},{actor:target,eventId:`${eventId}:consent`,verb:'consent_revoked',to:'player',payload:{consent:native.id}});
   return{authorization:native.id,consent:row};
  }
  if(old?.category!=='authorization'||old.action!==action||old.subject!==target||old.grantor!==target||old.grantee!=='player')throw preconditionFailure('只有原签发本人能撤销同意');
  if(d.get('state','npcs',target,'location')!==d.get('state','location'))throw preconditionFailure('撤销同意须本人在场');
  if(old.revoked)return{authorization:args.authorization,consent:old,duplicate:true};
  const row={...old,revoked:true,revokedAt:now,revokedBy:target};holdingSet(d,null,['state','records',args.authorization],row,'magic-consent');return{authorization:args.authorization,consent:row};
 }
 if(typeof args.content!=='string'||!args.content.trim()||args.content.length>1200)throw preconditionFailure('施法同意须明确用途');
 const minutes=args.minutes??60;if(!Number.isSafeInteger(minutes)||minutes<1||minutes>1440)throw preconditionFailure('同意期限须为1至1440分钟');
 const spell=args.skill?engine.resolve(args.skill,'spell'):null;
 if(spell&&spellConsentAction(engine.byId.get(spell))!==action)throw preconditionFailure('指定法术不在请求同意的类别内');
 const decision=personSpellConsent(engine,d.get('state'),target,action,{document:d.document,spell});
 if(['refuse','defer'].includes(decision.decision)||args.consent!==true)return{target,action,...decision,registered:false};
 if(minutes>decision.conditions.maximumMinutes||decision.conditions.specificSpell&&!spell)return{target,action,...decision,registered:false};
 const authorization=`permission_${eventId}`,row={category:'authorization',action,subject:target,grantor:target,grantee:'player',createdAt:now,expires:now+minutes,revoked:false,
  scope:{location:d.get('state','location'),...(spell?{spell}:{})},content:args.content.trim(),sourceEvent:eventId};
 if(d.get('state','records',authorization))throw preconditionFailure('同意登记编号已存在');
 holdingSet(d,null,['state','records',authorization],row,'magic-consent');d.say(`${engine.byId.get(target).name}明确同意所述施法用途，可随时撤销`);
 return{target,action,...decision,registered:true,authorization,consent:row};
}
export function spellConsentAction(c){
 const s=c.effectSpec??{};
 if(s.kind==='area')return spellConsentAction({...c,effectSpec:s.effect});
 if(c.targeting?.consent)return c.targeting.consent;
 if(s.kind==='heal'||s.kind==='care'||['ritual_heal','restore'].includes(s.operation))return'healing';
 if(s.kind==='relief'||s.mental||['illusion','compulsion'].includes(s.status)||['sense_mind','sleep','memory_guard','rest_bless','comfort','spirit_sense'].includes(s.operation))return'mental_magic';
 if(s.kind==='protection'||s.kind==='status'&&!['fear','dazzle'].includes(s.status)||['ward','discipline','faith_shield','warm'].includes(s.operation))return'support_magic';
 return null;
}
export function recordSpellViolation(d,engine,c,args,target,eventId){
 if(!target||target==='player'||!d.get('state','npcs',target)&&!d.get('state','creatures',target))return null;
 const s=c.effectSpec??{},rules=engine.rules.law?.spellConsent;
 if(!rules)return null;
 const grave=s.status==='compulsion'?'compulsion':rules.memoryOperations.includes(s.operation)?'memory_tampering':null;
 const action=spellConsentAction(c),consented=action&&hasSpellConsent(d,target,args.authorization,action,c,d.get('state','minute'),engine);
 if(!grave&&(args.force!==true||!action||consented||action==='healing'&&emergencyHealing(d,engine,target,c)))return null;
 const location=c.location??d.get('state','location'),offense=grave??'unconsented_magic',witnesses=Object.entries(d.get('state','npcs')??{}).filter(([id,a])=>a.location===location&&!isPhysicallyDead(engine,d,id)&&!['濒死','昏迷'].includes(a.status)&&!/睡眠|熟睡/.test(a.activity??'')).map(([id])=>id);
 return registerIncident(d,engine,{victim:target,offense,witnesses,eventId,location,optional:true});
}

export function personSpellConsent(engine,state,id,action,{document={state},spell=null}={}){
    const view=personView(engine,state,id),a=state.npcs?.[id]??state.creatures?.[id];
    const stance=standing(engine,state,id),relation=relationView(engine,state,id,'player'),level=intelligenceOf(engine,state,id)?.level??0;
    const refuse=reason=>({decision:'refuse',reason});
    if(!view||!a||view.location.value!==state.location||a.scheduleTravel||a.cognitionTravel)return refuse('本人不在场');
    if(!view.simulation.value||(view.age.value??0)<18||level<1||isPhysicallyDead(engine,state,id)||['濒死','昏迷'].includes(a.status)||/睡眠|熟睡|睡觉/.test(a.activity??''))return refuse('本人当前无法明确表达同意');
    const mental=personMental(engine,state,id).value;
    if(view.constraint||relation.fear>=30||mental.stress>=80||Object.values(state.effects??{}).some(e=>e.target===id&&e.kind==='status'&&e.expires>state.minute&&e.remainingUses!==0&&['fear','illusion','compulsion'].includes(e.status)))return refuse('拘束或恐惧下不能登记自愿同意');
    if(stance<=-30||relation.trust<=-40)return refuse('本人不信任施法者');
    const injured=a.status==='患病'||a.hp<(a.maxHp??a.hp)||a.medical?.wounds?.some(w=>!w.closed)||a.health?.illness;
    const threshold=action==='mental_magic'?40:action==='support_magic'?10:injured?-10:20;
    if(stance<threshold-30)return refuse('本人认为此时没有接受该类施法的必要');
    const spec=engine.byId.get(spell)?.effectSpec;
    const decision=npcDecision(subjectiveView(engine,document,id),{kind:action,from:'player',tags:['spell',spec?.kind,spec?.operation].filter(Boolean)});
    if(['refuse','defer'].includes(decision.outcome))return{decision:decision.outcome,reason:decision.reason,trace:decision.trace};
    const conditional=stance<threshold||level>=3||action==='mental_magic';
    return {decision:conditional?'conditional':'agree',reason:conditional?'只接受指定法术和短期用途':'本人愿意接受所述用途',trace:decision.trace,
        conditions:{specificSpell:conditional,maximumMinutes:conditional?(level>=3?30:60):1440}};
}

