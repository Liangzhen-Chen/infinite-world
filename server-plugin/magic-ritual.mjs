import {registerMagicEffect}from'./magic-effects.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {placed as placedStock,moveStock} from './stock.mjs';
declareLedgerWriter('magic-ritual');
import {recordCreatureResolution}from'./quest-wildlife.mjs';
import {environmentFeatures,localPlayerPoint,localSightClear,recordLocalContact}from'./environment.mjs';
import {areaTargetFacts}from'./magic-area.mjs';
import {assertMagicTargeting}from'./magic-targeting.mjs';
import {assertSpellConsent,hasSpellConsent,spellConsentActions}from'./magic-consent.mjs';
import {personMental}from'./entity-view.mjs';
import {resolveCreature}from'./wildlife.mjs';
import {applyProtectionPrimitive}from'./magic-primitives.mjs';
import {magicContractTrace,createBusinessContract}from'./contracts.mjs';
import {prepareRevivalMark}from'./revival.mjs';
import {monsterStats}from'./combat.mjs';
import {assertTrainingRitual}from'./training.mjs';
import {speciesInHabitat}from'./wildlife-range.mjs';

// These bounds enable authoring; they do not publish or teach spells.
export const ritualMechanisms=Object.freeze({
 lure:[1,0],reassign:[1,0],coordinate:[2,0],invite:[1,0],
 clean_altar:[100,0],witness_oath:[1,0],ritual_heal:[10,0],spirit_sense:[1,0],
 ward:[3,60],exorcise:[1,0],discipline:[10,90],faith_contract:[1,0],
 revival_mark:[1,90],restore:[20,0],faith_shield:[20,120],purify_area:[3,0],
 // T104: ferrying a low wandering soul, reading a habitat's spirit ledger, and a seven-day rite against new manifestations.
 ferry:[1,0],spirit_census:[1,0],consecrate:[1,10080],
});
const clone=x=>structuredClone(x),key=id=>`physical_feature:${id}`;
const actorPath=id=>id==='player'?['state','player']:['state',id.startsWith('npc_')?'npcs':'creatures',id];
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const number=(v,min,max,label)=>{if(!Number.isFinite(v)||v<min||v>max)throw Error(`${label}未登记或超出范围`);return v;};
const awake=a=>a&&!['死亡','濒死','昏迷'].includes(a.status)&&!a.scheduleTravel&&!a.cognitionTravel;
function divine(engine,a){
 if(a.spirit)return a.spirit.divine!==false;
 const def=engine.byId.get(a.species??a.boss),template=def?.template;
 return template!==undefined&&monsterStats({level:a.level??1,template,bossTier:def.tier??0},engine.rules).divine;
}
function feature(engine,id,location){
 const rows=environmentFeatures(engine).filter(r=>r.location===location&&(r.id===id||r.name===id));
 if(rows.length!==1)throw Error('须选择同地登记的真实对象');return rows[0];
}
function stateOf(d,row){
 const r=d.get('state','records',key(row.id));
 if(r&&(r.category!=='physical_feature'||r.id!==row.id||r.location!==row.location))throw Error('役灵仪式对象状态键冲突');
 return clone(r?.state??row.state??{});
}
const store=(d,row,state)=>d.set(['state','records',key(row.id)],{id:row.id,category:'physical_feature',location:row.location,state});
function authorization(d,args,action,subject,grantor,until){
 const id=[args.authorization,...args.authorizations??[]].find(id=>{
  const r=d.get('state','records',id);
  return r?.category==='authorization'&&r.action===action&&r.subject===subject&&r.grantor===grantor&&r.grantee==='player'&&!r.revoked&&Number.isSafeInteger(r.expires)&&r.expires>until;
 });
 if(!id)throw Error('缺少本人或所有者仍有效的自愿授权');return id;
}
function access(d,engine,row,c,args,until){
 const origin=localPlayerPoint(d);
 if(!point(row.position)||distance(origin,row.position)>c.rangeMeters||!localSightClear(d,engine,row.location,origin,row.position))throw Error('对象超出实际射程或视线');
 if(row.owner!=='player')return authorization(d,args,'environment_use',row.id,row.owner,until);
}
function life(d,engine,c,args,id,until,action='support_magic'){
 id=resolveCreature(engine,d,id);const a=d.get(...actorPath(id));
 if(!awake(a)||id!=='player'&&a.location!==d.get('state','location'))throw Error('仪式参与者须在场清醒且存活');
 assertMagicTargeting(d,engine,{...c,targeting:{lineOfSight:true}},args,id);
 let permission=null;
 if(spellConsentActions.includes(action)){
  permission=[args.authorization,...args.authorizations??[]].find(key=>hasSpellConsent(d,id,key,action,c,until));
  assertSpellConsent(d,engine,c,{...args,authorization:permission},id,action,until);
 }else permission=id==='player'?null:authorization(d,args,action,id,id,until);
 if(id!=='player'&&d.get('state','creatures',id)&&divine(engine,a))throw Error('仪式不能越过神性或未知灵体规则');
 return{id,actor:a,path:actorPath(id),permission};
}
function faithOf(d,id,deity){
 const f=d.get(...actorPath(id),'faith');
 const matches=deity.category==='tradition'?f?.institution===deity.id:f?.deity===deity.id;
 if(!f||!matches||f.church!==deity.church.name||f.taboo!==deity.taboo)throw Error('须核对真实信众、教派与戒律');return f;
}
function qualification(d,engine,args,until){
 const candidate=d.get('state','records',args.permit);
 if(candidate?.sourceType==='training'||String(args.permit).startsWith('ritual_permission:')){
  const {entry,tradition}=assertTrainingRitual(d,engine,args.permit,until);
  if(!entry.ritualOperations.includes(args.ritualOperation))throw Error('师承没有登记这一仪式的主持范围');
  return tradition;
 }
 const r=d.get('state','records',args.permit),deity=engine.byId.get(r?.deity);
 if(r?.category!=='authorization'||r.action!=='ritual_officiate'||r.subject!=='player'||r.grantee!=='player'||r.revoked||!Number.isSafeInteger(r.expires)||r.expires<=until||deity?.category!=='deity'||r.church!==deity.church?.name||r.profession!==deity.church.profession)throw Error('缺少与正式神祇教派相符的仪式资格');
 const roles=[d.get('state','professions','combat'),...d.get('state','professions','life')??[]];
 const grantor=engine.byId.get(r.grantor),issuerRoles=[grantor?.combatProfession,...grantor?.lifeProfessions??[]];
 if(!roles.some(id=>engine.byId.get(id)?.name===deity.church.profession)||!d.get('state','npcs',r.grantor)||!issuerRoles.some(id=>engine.byId.get(id)?.name===deity.church.profession))throw Error('主持者或授予者没有教派规定的实际职业');
 return deity;
}
export function validateRitualCatalog(c){
 const s=c.effectSpec,m=ritualMechanisms[s.operation],errors=[];
 if(!m)return['役灵仪式机制尚未接入'];
 if(s.power>m[0]||c.duration!==m[1]||!Number.isSafeInteger(c.minutes)||c.minutes<1||c.minutes>60||!Number.isFinite(c.rangeMeters)||c.rangeMeters<0||c.rangeMeters>10)errors.push('役灵仪式强度、期限或射程越过固定边界');
 if(['ritual_heal','restore'].includes(s.operation)&&!c.materials?.some(m=>m.item==='item_herb'&&m.amount>=1))errors.push('仪式治疗需要真实药材');
 if(s.operation==='ferry'&&(typeof s.destination!=='string'||!s.destination.startsWith('feature_')))errors.push('度亡须登记实际去向');
 if(s.operation==='consecrate'&&!['亡灵','妖怪'].includes(s.group))errors.push('安地法事须限定一类灵体');
 return errors;
}
function ownSummon(d,id,until){
 const e=d.get('state','effects',id),r=d.get('state','records',e?.contract);
 if(e?.kind!=='summon'||e.owner!=='player'||e.location!==d.get('state','location')||e.expires<=until||r?.category!=='summon_contract'||r.effect!==id||r.owner!=='player'||r.status!=='履行中')throw Error('需要在场且覆盖工序时限的自有役灵');
 return clone(e);
}
// Jobs store real feature/instance IDs, never an invented payload.
export function prepareSummonWork(d,c,args,{completion=false,task,power}={}){
 task??=({dust_servant:'clean',rubble_servant:'carry_rubble',paper_bird:'carry_paper'})[c.effectSpec.summonType];
 const until=d.get('state','minute')+(completion?0:c.minutes),location=d.get('state','location');
 const source=feature(this,args.target,location),s=stateOf(d,source);access(d,this,source,c,args,until);
 const job={task,target:source.id,...(args.destination?{destination:args.destination}:{}),...(args.source?{source:args.source}:{}),...(args.path?{path:[...args.path]}:{}),...(args.authorization?{authorization:args.authorization}:{}),authorizations:[...args.authorizations??[]]};
 power??=c.effectSpec.power;
 if(task==='clean'){
  number(s.dustGrams,0,100000,'普通浮尘');number(s.collectedDustGrams,0,100000,'收集灰尘');number(s.heavyWasteGrams,0,100000000,'厚重垃圾');
  if(s.dustGrams<=0)throw Error('没有可清扫的普通浮尘');
 }else if(task==='carry_rubble'){
  const dest=feature(this,args.destination,location),t=stateOf(d,dest);access(d,this,dest,c,args,until);
  if(dest.id===source.id||distance(source.position,dest.position)>c.rangeMeters)throw Error('搬运需要短程不同目的地');
  number(s.rubbleGrams,1,100000000,'碎石存量');number(t.rubbleGrams,0,100000000,'目的地碎石');number(t.capacityGrams,1,100000000,'承载容量');
  if(t.capacityGrams-t.rubbleGrams<Math.min(power,s.rubbleGrams))throw Error('目的地容量不足');job.destination=dest.id;
 }else if(task==='carry_paper'){
  const dest=feature(this,args.destination,location),t=stateOf(d,dest),u=d.get('state','itemInstances',args.source),item=this.byId.get(u?.item);
  access(d,this,dest,c,args,until);
  if(dest.id===source.id||!Array.isArray(s.contents)||!Array.isArray(t.contents)||!s.contents.includes(args.source)||t.contents.includes(args.source)||u?.owner!=='player'||u.status!=='袋内'||u.container!==source.id||!item?.tags?.includes('paper'))throw Error('须用source指定真实自有纸签单件及其容器');
  number(item.weight*1000,.001,power,'纸签载重');number(t.capacityKg,.001,5000,'目的容器容量');
  let weight=item.weight;for(const id of t.contents){const unit=d.get('state','itemInstances',id);if(!unit||unit.container!==dest.id||unit.status!=='袋内')throw Error('目的清单归属不符');weight+=number(this.byId.get(unit.item)?.weight,0,5000,'现有单件重量');}
  if(weight>t.capacityKg)throw Error('纸签目的容器容量不足');
  if(!Array.isArray(args.path)||args.path[0]!==source.id||args.path.at(-1)!==dest.id||args.path.length<2||args.path.length>8||new Set(args.path).size!==args.path.length)throw Error('纸签须有已知短路线');
  let meters=0;for(let i=1;i<args.path.length;i++){
   const a=feature(this,args.path[i-1],location),b=feature(this,args.path[i],location);access(d,this,a,c,args,until);access(d,this,b,c,args,until);
   meters+=distance(a.position,b.position);if(!localSightClear(d,this,location,a.position,b.position))throw Error('纸签路线被遮挡');
  }
  if(meters>c.rangeMeters)throw Error('纸签路线超过有限距离');job.destination=dest.id;
 }else throw Error('役灵未登记此任务');
 return{assignment:job};
}
export function applySummonWork(d,e,eventId,power=e.power){
 const args=e.assignment,c={minutes:1,rangeMeters:e.rangeMeters??10,effectSpec:{power},duration:0};
 prepareSummonWork.call(this,d,c,args,{completion:true,task:args.task,power});
 const source=feature(this,args.target,e.location),s=stateOf(d,source);
 if(args.task==='clean'){
  const grams=Math.min(power,s.dustGrams);s.dustGrams-=grams;s.collectedDustGrams+=grams;store(d,source,s);return{cleanedGrams:grams};
 }
 const dest=feature(this,args.destination,e.location),t=stateOf(d,dest);
 if(args.task==='carry_rubble'){
  const grams=Math.min(power,s.rubbleGrams);s.rubbleGrams-=grams;t.rubbleGrams+=grams;store(d,source,s);store(d,dest,t);return{carriedGrams:grams};
 }
 s.contents=s.contents.filter(id=>id!==args.source);t.contents.push(args.source);store(d,source,s);store(d,dest,t);
 const unit=d.get('state','itemInstances',args.source);moveStock(d,{from:placedStock(this,unit.container,unit.item),to:placedStock(this,dest.id,unit.item),amount:1,writer:'magic-ritual',eventId});
 d.set(['state','itemInstances',args.source,'container'],dest.id);return{paper:args.source,destination:dest.id,sourceEvent:eventId};
}
function nearbySpirits(d,engine,c){
 const location=d.get('state','location'),origin=localPlayerPoint(d);
 return Object.entries(d.get('state','creatures')??{}).filter(([id,a])=>{
  if(!awake(a)||a.location!==location||!a.spirit)return false;
  const f=areaTargetFacts(d,engine,id,location,origin);return f?.lineOfSight&&distance(f.point,origin)<=c.rangeMeters;
 });
}
export function prepareRitual(d,c,args,{completion=false}={}){
 const op=c.effectSpec.operation,until=d.get('state','minute')+(completion?0:c.minutes),location=d.get('state','location');
 const p={catalog:c,spec:c.effectSpec,args:clone(args),op,location,origin:localPlayerPoint(d)};
 if(op==='lure'){
  p.id=resolveCreature(this,d,args.target);const a=d.get('state','creatures',p.id),base=this.byId.get(a?.species);
  const f=areaTargetFacts(d,this,p.id,location,p.origin);
 if(!awake(a)||a.owner||!base?.wildlife||divine(this,a)||a.behavior?.phototaxis!==true||a.behavior?.hostile!==false||!f?.lineOfSight||distance(f.point,p.origin)>c.rangeMeters)throw Error('只能引导实际近处、无主且趋光的温顺动物');
  p.actor=a;return p;
 }
 if(['reassign','coordinate'].includes(op)){
  p.ids=[args.target,args.source];if(new Set(p.ids).size!==2)throw Error('需要两只不同自有役灵');
  p.summons=p.ids.map(id=>ownSummon(d,id,until));
  if(p.summons.some(e=>!e.assignment))throw Error('须有实际已登记工序');
  p.jobs=[];
  for(let i=0;i<2;i++){
   const e=p.summons[i],job=p.summons[op==='reassign'?1-i:i].assignment;
   if(!e.terms.tasks.includes(job.task))throw Error('改派不能改写根本契约能力');
   const prepared=prepareSummonWork.call(this,d,{...c,rangeMeters:e.rangeMeters??10},{...job,...args,target:job.target,source:job.source,destination:job.destination,path:job.path},{completion,task:job.task,power:e.power});
   p.jobs.push(prepared.assignment);
  }return p;
 }
 if(op==='invite'){
  p.id=args.target;p.actor=d.get('state','creatures',p.id);const spirit=p.actor?.spirit;
  if(!awake(p.actor)||!spirit||spirit.divine!==false||spirit.rank!==0||spirit.realm!=='other'||!spirit.invitation||typeof spirit.invitation.terms!=='string'||typeof spirit.invitation.willing!=='boolean')throw Error('没有已知、可回应的跨界来访者');
  if(typeof args.text!=='string'||args.text.length>80||!args.text.trim())throw Error('邀约需要明确有限条款');
  p.accepted=spirit.invitation.willing&&args.text===spirit.invitation.terms;
  number(spirit.invitation.visitMinutes,1,60,'邀约停留时限');
  if(!Number.isSafeInteger(spirit.invitation.visitMinutes))throw Error('邀约停留时限须为整分钟');
  if(p.accepted)p.permission=authorization(d,args,'realm_visit',p.id,p.id,until+spirit.invitation.visitMinutes);return p;
 }
 p.deity=qualification(d,this,{...args,ritualOperation:op},until);
 if(['spirit_census','consecrate'].includes(op)){
  p.habitat=this.rules.wildlife?.habitats.find(h=>h.location===location);
  if(!p.habitat)throw Error('这里没有登记的野外栖地，无从问灵或安地');
  p.species=speciesInHabitat(this.rules,this.world.monsters,p.habitat.id).filter(s=>s.nature?.spirit&&s.nature.reproduction==='manifest'&&s.wildlife?.manifest&&(op==='spirit_census'||s.nature.group===p.spec.group));
  if(!p.species.length)throw Error('此地没有登记的这类自行聚成的低阶灵体');
  if(op==='consecrate'&&Object.values(d.get('state','effects')??{}).some(e=>e.kind==='ritual'&&e.operation==='consecrate'&&e.habitat===p.habitat.id&&e.group===p.spec.group&&e.expires>d.get('state','minute')))throw Error('此地同类安地法事仍在期限内，不能叠加');
  return p;
 }
 if(op==='ferry'){
  p.id=resolveCreature(this,d,args.target);p.actor=d.get('state','creatures',p.id);
  const base=this.byId.get(p.actor?.species),s=p.actor?.spirit;
  if(!p.actor||!awake(p.actor)||p.actor.location!==location||p.actor.owner||!p.actor.ecology||base?.nature?.kind!=='游魂'||!s||s.divine!==false||s.rank!==0||s.realm!=='local')throw Error('度亡只适用于在场、无主的低阶游魂个体；不能用于活人、亡者遗体或复活');
  assertMagicTargeting(d,this,{...c,targeting:{lineOfSight:true}},args,p.id);
  p.tablet=environmentFeatures(this).find(r=>r.id===p.spec.destination);
  if(!p.tablet)throw Error('度亡去向未登记');return p;
 }
 if(['clean_altar','revival_mark'].includes(op)){
  p.row=feature(this,args.target,location);p.state=stateOf(d,p.row);access(d,this,p.row,c,args,until);
  if(p.row.kind!=='altar'||p.state.deity!==p.deity.id||p.state.church!==p.deity.church.name||!(p.state.integrity>0))throw Error('祭坛必须完整且属于本教派');
  if(op==='clean_altar'){number(p.state.contamination,1,100,'普通坛面污染');if(p.state.pollutionKind!=='ordinary')throw Error('净坛仅处理受托普通污染');}
  else p.revival=prepareRevivalMark.call(this,d,p.row.revivalLocation);return p;
 }
 if(op==='faith_contract'){
  const row=d.get('state','records',args.target);
  if(row?.category!=='contract'||row.deity!==p.deity.id||row.church!==p.deity.church.name)throw Error('只能查验本教派真实仪式契约');
  authorization(d,args,'ritual_contract',args.target,row.custodian,until);p.contract=magicContractTrace(d,args.target);return p;
 }
 if(op==='purify_area'){p.spirits=nearbySpirits(d,this,c).filter(([,a])=>a.spirit.divine===false&&a.spirit.rank===0&&a.spirit.nature==='malevolent');if(!p.spirits.length)throw Error('有限区域没有可确认的低阶邪秽');return p;}
 if(op==='exorcise'){
  p.id=resolveCreature(this,d,args.target);p.actor=d.get(...actorPath(p.id));
  if(!awake(p.actor)||p.id==='player'||divine(this,p.actor))throw Error('驱离需要实际在场且非神性目标');
  assertMagicTargeting(d,this,{...c,targeting:{lineOfSight:true}},args,p.id);
  const spirit=p.actor.spirit;
  if(spirit&&(spirit.divine!==false||spirit.rank!==0))throw Error('不能驱离神性、未知或高阶灵体');return p;
 }
 const action=['ritual_heal','restore'].includes(op)?'healing':op==='spirit_sense'?'mental_magic':op==='witness_oath'?'ritual_oath':'support_magic';
 Object.assign(p,life(d,this,c,args,args.target??'player',until,action));
 if(op==='spirit_sense'){
  p.mental=personMental(this,d.get('state'),p.id).value;
  number(p.mental.stress,0,100,'悲恸压力');p.spirits=nearbySpirits(d,this,c);return p;
 }
 if(['ritual_heal','restore'].includes(op)){
  faithOf(d,p.id,p.deity);const m=clone(p.actor.medical),w=m?.wounds?.find(w=>w.id===args.source);
  if(!w||w.closed||w.simple!==true||w.foreignBody||w.toxinUg>0||w.bleedingMlPerMinute>0)throw Error('仪式治疗须指定已止血且无异物毒素的简单浅伤');
  number(w.depthMm,.01,5,'浅伤深度');number(w.areaCm2,.01,20,'浅伤面积');number(m.bloodMl,1,10000,'血量');number(m.pain,0,10,'伤痛');number(p.actor.hp,1,p.actor.maxHp,'伤者生命');
  if(op==='restore'){
   const visits=m.care?.filter(r=>r.wound===w.id&&r.by==='player'&&r.completed===true&&Number.isSafeInteger(r.minute)&&r.minute<=d.get('state','minute'))??[];
   const days=new Set(visits.map(r=>Math.floor(r.minute/1440)));
   if(days.size<3||Math.max(...visits.map(r=>r.minute))-Math.min(...visits.map(r=>r.minute))<10080)throw Error('恢复需要跨七天至少三天的真实长期照护');
  }p.medical=m;p.wound=w.id;return p;
 }
 if(op==='witness_oath'){
  if(typeof args.text!=='string'||!args.text.trim()||args.text.length>80)throw Error('见证需要本人明确的有限誓言');return p;
 }
 if(op==='discipline'){
  const f=faithOf(d,p.id,p.deity),now=d.get('state','minute');
  if(!Number.isSafeInteger(f.observedSince)||f.observedSince>now-1440||!Number.isSafeInteger(f.lastBreach)||f.lastBreach>=f.observedSince)throw Error('守戒防护需要至少一天持续守戒');p.faith=clone(f);return p;
 }
 if(op==='faith_shield'){
  p.members=[...new Set(['player',p.id,args.source].filter(Boolean))];if(p.members.length<2||p.members.length>3)throw Error('共同护罩须二到三名实际自愿信众');
  p.participants=p.members.map(id=>{
   const member=life(d,this,c,args,id,until);faithOf(d,id,p.deity);number(member.actor.mental?.fatigue,0,79,'参与者疲劳');return member;
  }).filter((member,index,rows)=>rows.findIndex(r=>r.id===member.id)===index);
  if(p.participants.length<2)throw Error('共同护罩须不同的实际自愿信众');return p;
 }
 return p;
}
function put(d,p,id,extra={}){
 const now=d.get('state','minute');d.set(['state','effects',id],{kind:'ritual',operation:p.op,target:p.id,owner:'player',spell:p.catalog.id,power:p.spec.power,remaining:p.spec.power,location:p.location,started:now,expires:now+p.catalog.duration,deity:p.deity?.category==='tradition'?null:p.deity?.id,...(p.deity?.category==='tradition'?{institution:p.deity.id}:{}),...extra});return{effect:id,expires:now+p.catalog.duration};
}
export function recordRitualCare(d,prepared,result,eventId){
 if(!['hemostasis','clean_wound','pain','restore_tendon','ritual_heal'].includes(prepared.spec.operation)||result.effectFailed)return;
 const id=prepared.target??prepared.id,path=actorPath(id),m=d.get(...path,'medical'),wound=prepared.args?.source;
 if(!m?.wounds?.some(w=>w.id===wound))return;
 d.set([...path,'medical','care'],[...m.care??[],{wound,by:'player',completed:true,minute:d.get('state','minute'),source:eventId,operation:prepared.spec.operation}]);
}
export function applyRitual(d,initial,eventId){
 const p=prepareRitual.call(this,d,initial.catalog,initial.args,{completion:true});
 if(p.location!==initial.location||distance(p.origin,initial.origin)!==0)throw Error('施法期间位置改变，效果已回滚');
 const result={operation:p.op,target:p.id??p.row?.id};
 if(p.op==='lure'){
  d.set([...actorPath(p.id),'position'],[...p.origin]);recordLocalContact(d,this,p.id,eventId);return{...result,guided:true,position:p.origin};
 }
 if(p.op==='reassign'){
  for(let i=0;i<2;i++)d.set(['state','effects',p.ids[i],'assignment'],p.jobs[i]);return{...result,summons:p.ids,reassigned:true};
 }
 if(p.op==='coordinate'){
  const work=p.summons.map((e,i)=>{d.set(['state','effects',p.ids[i],'assignment'],p.jobs[i]);return applySummonWork.call(this,d,{...e,assignment:p.jobs[i]},eventId);});return{...result,summons:p.ids,work};
 }
 if(p.op==='invite'){
  const record=`invitation:${eventId}`;
  const now=d.get('state','minute');
  d.set(['state','records',record],{category:'realm_invitation',subject:p.id,terms:p.args.text,status:p.accepted?'已接受':'已拒绝',minute:now,expires:now+p.actor.spirit.invitation.visitMinutes,...(p.permission?{authorization:p.permission}:{}),source:eventId});
  if(p.accepted){d.set([...actorPath(p.id),'location'],p.location);d.set([...actorPath(p.id),'spirit','realm'],'local');recordLocalContact(d,this,p.id,eventId);}
  return{...result,record,accepted:p.accepted};
 }
 if(p.op==='clean_altar'){
  const removed=Math.min(p.spec.power,p.state.contamination);p.state.contamination-=removed;store(d,p.row,p.state);return{...result,removed};
 }
 if(p.op==='witness_oath'){
  const row=createBusinessContract(d,{kind:'oath',parties:[p.id],subject:p.args.text.trim(),quantity:1,deadline:null,business:null,cost:0,deity:p.deity.category==='tradition'?null:p.deity.id,...(p.deity.category==='tradition'?{institution:p.deity.id}:{}),church:p.deity.church.name,custodian:'player',witness:'player',voluntary:true},eventId);
  return{...result,contract:row.id,witnessed:true};
 }
 if(p.op==='faith_contract')return{...result,changes:p.contract.changes,parties:p.contract.parties};
 if(p.op==='revival_mark')return{...result,...put(d,p,eventId,{revivalLocation:p.revival.location,altar:p.row.id,church:p.deity.church.name}),revivalLocation:p.revival.location};
 if(['ritual_heal','restore'].includes(p.op)){
  const w=p.medical.wounds.find(w=>w.id===p.wound),healed=Math.min(p.spec.power,p.actor.maxHp-p.actor.hp);
  w.depthMm=Math.max(0,w.depthMm-(p.op==='restore'?2:1));if(w.depthMm===0){w.closed=true;w.areaCm2=0;}p.medical.pain=Math.max(0,p.medical.pain-1);
  d.set([...p.path,'medical'],p.medical);if(p.id==='player')this.health(d,{delta:healed},eventId);else d.set([...p.path,'hp'],p.actor.hp+healed);
  recordRitualCare(d,p,result,eventId);return{...result,healed,wound:p.wound,depthMm:w.depthMm};
 }
 if(p.op==='spirit_sense'){
  d.set([...p.path,'mental'],{...p.mental,stress:Math.max(0,p.mental.stress-1)});
  return{...result,spirits:p.spirits.map(([id,a])=>({id,lowRank:a.spirit.rank===0,divine:a.spirit.divine,nature:a.spirit.nature??'unknown'}))};
 }
 if(p.op==='ward')return{...result,...put(d,p,eventId,{authorization:p.permission})};
 if(p.op==='consecrate')return{...result,habitat:p.habitat.id,group:p.spec.group,species:p.species.map(s=>s.id),...put(d,p,eventId,{habitat:p.habitat.id,group:p.spec.group,species:p.species.map(s=>s.id)})};
 if(p.op==='spirit_census'){
  const rows=d.get('state','records',`ecology:${p.habitat.id}`)?.populations??{};
  return{...result,habitat:p.habitat.id,spirits:p.species.map(s=>{const r=rows[s.id]??{},present=Object.values(d.get('state','creatures')??{}).filter(a=>a.species===s.id&&a.location===p.habitat.location&&a.status!=='死亡'&&a.hp>0&&!a.owner).length;
   return{species:s.id,name:s.name,kind:s.nature.kind,nature:s.nature.spirit.nature,rank:s.nature.spirit.rank,unseen:r.count??s.wildlife.population,present,arisen:r.arisen??0,ferried:r.ferried??0,seasons:[...s.wildlife.manifest.seasons],cause:s.wildlife.manifest.cause};})};
 }
 if(p.op==='ferry'){
  // Terminal: the soul leaves the scene and the habitat ledger; nothing here revives anyone.
  const now=d.get('state','minute'),record=`spirit_ferry:${eventId}`,path=actorPath(p.id),ecology=`ecology:${p.actor.ecology}`,row=d.get('state','records',ecology)?.populations?.[p.actor.species];
  d.set(path,{...clone(p.actor),status:'已超度',hp:0,location:null,activity:'已超度',spirit:{...clone(p.actor.spirit),realm:'beyond',ferried:{record,minute:now,destination:p.tablet.id}}});
  d.remove(['state','records',`local_actor_position:${p.id}`]);
  if(row)d.set(['state','records',ecology,'populations',p.actor.species,'ferried'],(row.ferried??0)+1);
  const t=stateOf(d,p.tablet);t.names=[...(Array.isArray(t.names)?t.names:[]),{subject:p.id,name:p.actor.name,species:p.actor.species,minute:now,record}];store(d,p.tablet,t);
  d.set(['state','records',record],{category:'spirit_ferry',subject:p.id,species:p.actor.species,habitat:p.actor.ecology,from:p.location,destination:p.tablet.id,minute:now,revivable:false,source:eventId});
  recordCreatureResolution(d,this,{target:p.id,outcome:'ferried',eventId,location:p.location});
  return{...result,ferried:true,record,destination:p.tablet.id,revived:false};
 }
 if(['exorcise','purify_area'].includes(p.op)){
  const rows=p.op==='exorcise'?[[p.id,p.actor]]:p.spirits.slice(0,p.spec.power),expelled=[];
  for(const[id,a]of rows){
   if(a.spirit?.nature==='malevolent'){d.set([...actorPath(id),'location'],null);d.set([...actorPath(id),'activity'],'已驱离');d.remove(['state','records',`local_actor_position:${id}`]);expelled.push(id);recordCreatureResolution(d,this,{target:id,outcome:'expelled',eventId,location:p.location});}
   else{d.set([...actorPath(id),'hp'],Math.max(1,a.hp-1));d.set(['state','records',`ritual_harm:${eventId}`],{category:'ritual_harm',subject:id,damage:Math.min(1,a.hp-1),minute:d.get('state','minute'),source:eventId});return{...result,misidentified:true,harmed:id};}
  }return{...result,expelled};
 }
 if(['discipline','faith_shield'].includes(p.op)){
  const participants=p.op==='discipline'?[{id:p.id,permission:p.permission,actor:p.actor}]:p.participants;
  const shield=applyProtectionPrimitive(d,{spec:{kind:'protection',power:p.spec.power,damageTypes:['physical','shadow'],stacking:'strongest'},target:p.id,spell:p.catalog.id,duration:p.catalog.duration},eventId);
  const binding={operation:p.op,deity:p.deity.category==='tradition'?null:p.deity.id,...(p.deity.category==='tradition'?{institution:p.deity.id}:{}),church:p.deity.church.name,taboo:p.deity.taboo,location:p.location,members:participants.map(a=>({id:a.id,authorization:a.permission,observedSince:a.actor.faith.observedSince,lastBreach:a.actor.faith.lastBreach})),started:d.get('state','minute'),settled:d.get('state','minute')};
  d.set(['state','effects',eventId,'ritualBinding'],binding);
  if(p.op==='faith_shield')for(const a of participants)d.set([...actorPath(a.id),'mental','fatigue'],a.actor.mental.fatigue+10);
  return{...result,...shield,members:participants.map(a=>a.id)};
 }
 return result;
}
export function ritualProtectionValid(d,e,now=d.get('state','minute')){
 const b=e.ritualBinding;if(!b)return true;
 return b.members.every(m=>{
  const a=d.get(...actorPath(m.id)),f=a?.faith,r=m.authorization&&d.get('state','records',m.authorization);
  if(!awake(a)||!f||(b.institution?f.institution!==b.institution:f.deity!==b.deity)||f.church!==b.church||f.taboo!==b.taboo||f.lastBreach!==m.lastBreach||m.id!=='player'&&a.location!==b.location||m.id==='player'&&d.get('state','location')!==b.location)return false;
  if(m.id!=='player'&&(r?.category!=='authorization'||r.action!=='support_magic'||r.subject!==m.id||r.grantor!==m.id||r.grantee!=='player'||r.revoked||!Number.isSafeInteger(r.expires)||r.expires<=now))return false;
  return b.operation==='discipline'?f.observedSince===m.observedSince&&f.lastBreach<f.observedSince:f&&Number.isFinite(a.mental?.fatigue)&&a.mental.fatigue<90;
 });
}
export function advanceRituals(d,engine,after){
 // Contracts already run on each normal clock interval.
 for(const[id,r]of Object.entries(d.get('state','records')??{})){
  if(r.category!=='realm_invitation'||r.status!=='已接受')continue;
  const consent=d.get('state','records',r.authorization);
  if(after<r.expires&&consent?.category==='authorization'&&consent.action==='realm_visit'&&consent.subject===r.subject&&consent.grantor===r.subject&&consent.grantee==='player'&&!consent.revoked&&Number.isSafeInteger(consent.expires)&&consent.expires>after)continue;
  const a=d.get('state','creatures',r.subject);
  if(a?.spirit?.realm==='local'){d.set([...actorPath(r.subject),'location'],null);d.set([...actorPath(r.subject),'spirit','realm'],'other');d.remove(['state','records',`local_actor_position:${r.subject}`]);}
  d.set(['state','records',id],{...r,status:after>=r.expires?'已到期':'已撤销',ended:Math.min(after,r.expires)});
 }
 for(const[id,e]of Object.entries(d.get('state','effects')??{})){
  if(e.ritualBinding){
   const b=e.ritualBinding;
   if(!ritualProtectionValid(d,e,b.settled)){d.remove(['state','effects',id]);continue;}
   let until=Math.min(after,e.expires);
   for(const m of b.members){
    if(m.authorization)until=Math.min(until,d.get('state','records',m.authorization,'expires'));
    if(b.operation==='faith_shield')until=Math.min(until,b.settled+90-d.get(...actorPath(m.id),'mental','fatigue'));
   }
   const minutes=Math.max(0,until-b.settled);
   if(b.operation==='faith_shield')for(const m of b.members){const path=actorPath(m.id);d.set([...path,'mental','fatigue'],Math.min(100,d.get(...path,'mental','fatigue')+minutes));}
   d.set(['state','effects',id,'ritualBinding','settled'],until);
   if(!ritualProtectionValid(d,d.get('state','effects',id))||after>=e.expires)d.remove(['state','effects',id]);
  }
 }
 for(const[id,a]of Object.entries(d.get('state','creatures')??{})){
  const s=a.spirit;if(!s?.interference||s.divine!==false||s.rank!==0||s.nature!=='malevolent'||!awake(a))continue;
  const i=s.interference,actor=d.get(...actorPath(i.target)),location=i.target==='player'?d.get('state','location'):actor?.location;
  if(!Number.isSafeInteger(i.settled)||i.settled>after)throw Error('邪秽干扰时间状态损坏');
  number(i.remaining,0,100,'邪秽剩余干扰');number(i.stressPerMinute,.01,1,'邪秽干扰速度');
  const minutes=after-i.settled;d.set([...actorPath(id),'spirit','interference','settled'],after);
  if(!awake(actor)||a.location!==location)continue;
  const mental=personMental(engine,d.get('state'),i.target).value;
  let amount=Math.min(i.remaining,minutes*i.stressPerMinute),remaining=amount;
  const wards=Object.entries(d.get('state','effects')??{}).filter(([,w])=>w.kind==='ritual'&&w.operation==='ward'&&w.target===i.target&&w.started<=i.settled&&w.expires>i.settled&&w.remaining>0&&w.location===location).filter(([,w])=>{
   return hasSpellConsent(d,i.target,w.authorization,'support_magic',{id:w.spell,location:w.location},i.settled);
  }).sort((a,b)=>b[1].remaining-a[1].remaining||a[0].localeCompare(b[0]));
  const ward=wards[0];if(ward){const w=ward[1],r=d.get('state','records',w.authorization),until=Math.min(after,w.expires,i.target==='player'?Infinity:r.expires),absorbed=Math.min(w.remaining,amount,Math.max(0,until-i.settled)*i.stressPerMinute);remaining-=absorbed;d.set(['state','effects',ward[0],'remaining'],w.remaining-absorbed);}
  d.set([...actorPath(i.target),'mental'],{...mental,stress:Math.min(100,number(mental.stress,0,100,'受术者压力')+remaining)});
  d.set([...actorPath(id),'spirit','interference','remaining'],i.remaining-amount);
 }
}
// Spell effect family (dispatched by magic.mjs through magic-effects.mjs).
registerMagicEffect({kinds:['ritual'],validate:validateRitualCatalog,prepare(d,c,args){return prepareRitual.call(this,d,c,args);},apply(d,p,id){return applyRitual.call(this,d,p,id);}});
