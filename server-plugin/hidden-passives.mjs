import {preconditionFailure} from './precondition.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {personCareer} from './entity-view.mjs';

const active=o=>['待履行','进行中','有效','施工中'].includes(o.status);
const actor=(s,id)=>id==='player'?s.player:s.npcs?.[id]??s.creatures?.[id];
const records=s=>Object.values(s.records??{});
const intact=(e,s,id,predicate)=>Object.entries(id==='player'?s.inventory??{}:actor(s,id)?.inventory??{}).some(([item,bag])=>{
 if((bag.quantity??0)<1||bag.durability===0)return false;
 const units=(bag.instances??[]).map(i=>s.itemInstances?.[i]).filter(u=>u?.owner===id&&u.status==='持有'&&u.durability!==0);
 return units.some(u=>predicate(s.created?.[item]??e.byId.get(item),u))||(!bag.instances?.length&&predicate(s.created?.[item]??e.byId.get(item),bag));
});
export function escorting(s,id){
 return Object.values(s.obligations??{}).some(o=>active(o)&&o.deadline>s.minute&&(o.promisor===id||o.promisee===id)&&/护送/.test(o.content??'')&&Boolean(o.destination||o.location))||
 Object.values(s.quests??{}).some(q=>active(q)&&q.assignee===id&&q.type==='escort');
}
function breachUnpaid(s,id,since){
 return Object.entries(s.obligations??{}).some(([key,o])=>{
  if(o.status!=='违约'||(o.resolvedAt??o.deadline??0)<since||!(o.breachedBy??[o.promisor]).includes(id))return false;
  const payment=s.careers?.profession_hidden_03?.restitutions?.[key],p=s.obligations?.[payment];
  return !(p?.type==='付款'&&p.status==='已完成'&&p.promisor===id&&p.promisee===o.promisee&&p.coins>=Math.max(1,o.coins??0)&&(p.resolvedAt??-1)>=(o.resolvedAt??o.deadline??0));
 });
}
// The result is a view, never a stored bonus. Losing the profession or its
// required evidence takes effect on the very next read.
export function hiddenPassives(e,s,id='player'){
 const roles=personCareer(e,s,id).value.roles.filter(r=>e.byId.get(r)?.kind==='hidden');
 return roles.map(role=>{
  const definition=e.byId.get(role),rule=definition.passive??{},since=id==='player'?s.careers?.[role]?.certification?.minute??0:actor(s,id)?.certifications?.[role]?.minute??0;
  let reason=null;
  if(rule.condition==='peace'&&id==='player'&&(s.careerMetrics?.lastKill??-1)>=since&&s.minute-s.careerMetrics.lastKill<(definition.trigger?.minimum??0)*1440)reason='保护期内杀生';
  if(rule.condition==='maps'&&!intact(e,s,id,(b,u)=>Boolean(u.map||u.work&&s.works?.[u.work]?.kind==='map'||b?.map)))reason='未保管可核对的地图测稿';
  if(rule.domain==='survey'&&(id==='player'?s.location:actor(s,id)?.location)?.startsWith('bld_'))reason='野外测绘加成不用于室内';
  if(rule.condition==='restitution'&&breachUnpaid(s,id,since))reason='违约尚未完成补偿';
  if(rule.condition==='healthy_pets'&&Object.keys(s.pets??{}).some(key=>{const a=s.creatures?.[key];return a?.owner===id&&!isPhysicallyDead(e,s,key)&&(a.care?.sickness||(a.care?.hunger??0)>=(e.rules.petCare?.hungryThreshold??70));}))reason='自有宠物正在饥病';
  if(rule.condition==='wind'&&!records(s).some(r=>r.category==='air_weather'&&r.location===(id==='player'?s.location:actor(s,id)?.location)&&r.expires>s.minute))reason='缺少当前实际风向记录';
  if(rule.condition==='observations'&&!intact(e,s,id,(b,u)=>Boolean(u.map?.routes?.length||u.work&&s.works?.[u.work]?.routes?.length)))reason='缺少随身观测资料';
  if(rule.domain==='irrigation'&&Object.values(s.projects??{}).some(p=>/引水|水道/.test(p.name??'')&&p.funding==='public'&&p.owner===id&&!(p.beneficiaries?.length)))reason='公共引水被个人独占';
  // These are existing world-event facts, not model-provided eligibility flags.
  const events=records(s).filter(r=>r.category==='world_event'&&r.actor===id&&r.minute>=since);
  if(rule.condition==='sealed_delivery'&&events.some(r=>r.verb==='steal'&&Object.values(s.obligations??{}).some(o=>o.type==='送货'&&o.promisor===id&&o.item===r.item&&active(o))))reason='私拆受托货件';
  if(rule.condition==='surrender'&&(s.careerMetrics?.surrenderKills??[]).some(k=>k.actor===id&&k.minute>=since))reason='杀死已投降者';
  return {profession:role,...rule,active:!reason,reason,source:`catalog.${role}.passive + current state`};
 });
}

const matchers={
 wildlife_observe:/巢区|野兽观察|追踪野兽/,survey:/测绘|测量地图/,metalwork:/金属工艺|锻造/,rock_survey:/岩层|裂谷勘查/,
 irrigation:/灌溉|修复水道/,book_repair:/书页修复|修补书页/,healing:/自愿治疗/,sailing:/航路|帆具/,
 contract:/契约核对/,medicine:/药材配伍/,ritual:/精神仪式.*核对/,delivery:/递送路线/,anchor:/锚点校准/,
 summon:/役灵协调/,dyke:/堤道修筑|筑堤/,ferment:/发酵温控/,disarm:/近处缴械/,repair:/器物修缮/,
 bees:/蜂群照护/,rune_copy:/符文抄写/,coast:/海岸物候/,public_pact:/公共议约/,old_array:/遗阵辨读/,
 accounts:/账目核对/,recovery:/慢伤照护/,teaching:/跨族群教学/,backlash:/低阶魔力反噬/,escort:/险路护送/,
};
// Only a real action establishes a domain. contextReason is already the
// existing world_check description; it cannot stand in for missing evidence.
export function passiveDomain(e,s,args={}){
 if(args.passiveDomain)return args.passiveDomain; // internal callers only
 const action=e.npcObligationAction??{},a=action.args??{},tool=action.tool;
 const spell=tool==='cast'?e.byId.get(e.resolve(a.spell,'spell')):null,spec=spell?.effectSpec;
 if(tool==='research'&&a.operation==='survey')return 'survey';
 if(tool==='research'&&a.operation==='copy'){
  const u=s.itemInstances?.[a.project],book=u?.book??e.byId.get(a.project)?.book;
  if(book?.teaches?.some(x=>x.startsWith('spell_')))return 'rune_copy';
 }
 if(tool==='craft'&&a.operation==='repair')return 'repair';
 if(tool==='craft'){
  const recipe=a.recipe?e.byId.get(e.resolve(a.recipe,'recipe')):null,role=e.byId.get(recipe?.skill)?.profession;
  if(role==='profession_life_5')return 'metalwork';
  if(role==='profession_life_21')return 'ferment';
  if(role==='profession_life_19')return 'medicine';
 }
 if(tool==='wildlife'&&a.operation==='track')return 'wildlife_observe';
 if(tool==='farm'&&a.operation==='repair')return 'irrigation';
 if(tool==='cast'){
  if((spec?.kind==='heal'||spec?.kind==='care'&&['hemostasis','close_wound','clean_wound','disease_sense','pain','stabilize','parasite','restore_tendon'].includes(spec.operation))&&a.target&&a.target!=='player')return spec.operation==='restore_tendon'?'recovery':'healing';
  if(spec?.kind==='mind_space'&&spec.operation==='calibrate_anchor')return 'anchor';
  if(spec?.kind==='ritual'&&spec.operation==='coordinate')return 'summon';
  if(['summon','summon_contract'].includes(spec?.kind)&&Object.values(s.effects??{}).some(x=>x.kind==='summon'&&x.owner==='player'&&x.expires>s.minute))return 'summon';
 }
 if(tool==='check'&&args.skill){
  const b=e.byId.get(args.skill),text=args.contextReason??'';
  return Object.entries(matchers).find(([domain,re])=>re.test(text)&&domainSkills[domain]?.includes(b?.profession??b?.id))?.[0]??null;
 }
 return null;
}
const life=n=>`profession_life_${n}`;
const domainSkills={wildlife_observe:[life(1)],survey:[life(11)],metalwork:[life(5)],rock_survey:[life(11),life(17)],irrigation:[life(0),life(7)],book_repair:[life(22)],healing:[life(19)],sailing:[life(2),life(11)],contract:[life(12)],medicine:[life(19),life(8)],ritual:['profession_monk','profession_priest'],delivery:[life(11)],anchor:['profession_mage'],summon:['profession_summoner'],dyke:[life(7)],ferment:[life(21)],disarm:['profession_warrior'],repair:[life(5),life(6)],bees:[life(9)],rune_copy:[life(22)],coast:[life(11),life(2)],public_pact:[life(12)],old_array:['profession_mage'],accounts:[life(12)],recovery:[life(19)],teaching:[life(22)],backlash:['profession_mage'],escort:[life(1),life(11)]};
export function hiddenCheckBonus(e,s,id,domain){
 if(!domain)return {bonus:0,professions:[]};
 let rows=hiddenPassives(e,s,id).filter(r=>r.active&&r.domain===domain&&r.checkBonus);
 if(['book_repair','rune_copy'].includes(domain)&&!intact(e,s,id,(b,u)=>{const book=u.book??b?.book;return book?.author&&book.edition!==undefined&&book.copyAllowed!==false;}))rows=[];
 if(domain==='contract'&&!records(s).some(r=>r.category==='contract'&&r.parties?.includes(id)&&r.consent!==false&&((r.witnesses?.length??0)>=2||r.signedTerms&&r.parties.length>=2&&r.parties.every(who=>who===id||actor(s,who)?.location===(id==='player'?s.location:actor(s,id)?.location)&&!isPhysicallyDead(e,s,who)&&actor(s,who)?.status!=='昏迷'&&actor(s,who)?.status!=='濒死'))))rows=[];
 if(domain==='public_pact'&&!records(s).some(r=>r.category==='organization_proposal'&&r.status==='通过'&&r.deciders?.length&&r.deciders.every(who=>r.votes?.some(v=>v.voter===who&&v.opinion==='approve'))))rows=[];
 if(domain==='delivery'&&!Object.values(s.obligations??{}).some(o=>o.type==='送货'&&o.promisor===id&&active(o)&&o.location&&o.promisee&&o.item))rows=[];
 if(domain==='anchor'&&(!records(s).some(r=>r.category==='known_anchor')||e.npcObligationAction?.tool!=='cast'&&!records(s).some(r=>r.category==='authorization'&&r.grantee===id&&r.action==='anchor_calibrate'&&!r.revoked&&r.expires>s.minute)))rows=[];
 if(domain==='summon'&&!Object.values(s.effects??{}).some(x=>x.kind==='summon'&&x.owner===id&&x.expires>s.minute))rows=[];
 if(domain==='bees'&&!Object.entries(s.creatures??{}).some(([creatureId,a])=>!isPhysicallyDead(e,s,creatureId)&&a.location===(id==='player'?s.location:actor(s,id)?.location)&&/蜂/.test(e.byId.get(a.species)?.name??a.name??'')))rows=[];
 if(domain==='dyke'&&!Object.values(s.projects??{}).some(p=>p.type==='工程'&&p.creator===id&&p.sourceEvent&&(p.wood||p.stone)&&/堤|水道/.test(p.name??'')))rows=[];
 if(domain==='disarm'){
  const requested=e.npcObligationAction?.args?.opponent?.npc;
  let target;try{target=requested?e.resolve(requested,'npc'):null;}catch{target=null;}
  const other=s.npcs?.[target];
  if(!other||other.location!==(id==='player'?s.location:actor(s,id)?.location)||!Object.entries(other.inventory??{}).some(([item,b])=>(b.quantity??b)>0&&(e.byId.get(item)?.combat?.attack??0)>0))rows=[];
 }
 if(domain==='escort'&&!escorting(s,id))return {bonus:0,professions:[]};
 return {bonus:rows.reduce((n,r)=>n+r.checkBonus,0),professions:rows.map(r=>r.profession)};
}
export function observationTime(e,s,id,domain){
 if(domain!=='rock_survey'||!hiddenPassives(e,s,id).some(r=>r.active&&r.domain===domain))return 0;
 const noisy=records(s).some(r=>r.category==='heard_sound'&&r.subject===id&&r.minute===s.minute&&r.volume>=60);
 return (e.rules.wildlife?.trackMinutes??10)*(noisy?2:1);
}
export function hiddenCombat(e,s,id='player',intent='attack'){
 const rows=hiddenPassives(e,s,id).filter(r=>r.active);
 return {defense:escorting(s,id)?rows.reduce((n,r)=>n+(r.defenseBonus??0),0):0};
}
export function petTrustGain(e,s,target,amount){
 if(s.creatures?.[target]?.owner!=='player')return amount;
 return amount*(1+hiddenPassives(e,s).filter(r=>r.active).reduce((n,r)=>n+(r.trustMultiplier??0),0));
}
export function compensateHidden(d,e,role,payment,id){
 if(role!=='profession_hidden_03'||!d.get('state','professions','hidden')?.includes(role))throw preconditionFailure('该隐藏职业没有违约补偿规则');
 const s=d.get('state'),p=s.obligations?.[payment];
 if(p?.type!=='付款'||p.status!=='已完成'||p.promisor!=='player'||!(p.coins>0))throw preconditionFailure('补偿须引用本人实际履行的付款承诺');
 const matches=Object.entries(s.obligations??{}).filter(([,o])=>o.status==='违约'&&(o.breachedBy??[o.promisor]).includes('player')&&o.promisee===p.promisee&&p.coins>=Math.max(1,o.coins??0)&&(p.resolvedAt??-1)>=(o.resolvedAt??o.deadline??0));
 if(!matches.length)throw preconditionFailure('付款与违约对象、金额或时间不符');
 if(Object.values(s.careers?.[role]?.restitutions??{}).includes(payment))throw preconditionFailure('这笔补偿已经使用');
 const [key]=matches.find(([k])=>!s.careers?.[role]?.restitutions?.[k])??[];if(!key)throw preconditionFailure('违约已经补偿');
 d.set(['state','careers',role,'restitutions',key],payment);return {profession:role,compensated:key,payment,sourceEvent:id};
}
