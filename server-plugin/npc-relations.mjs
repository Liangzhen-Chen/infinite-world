const clamp=(n,min=-100,max=100)=>Math.max(min,Math.min(max,n));
const actor=(state,id)=>id==='player'?state.player:state.npcs[id];
const path=id=>id==='player'?['state','player']:['state','npcs',id];
const full=(engine,id)=>engine.byId.get(id)?.tier==='full';
const enabled=(engine,a,b)=>full(engine,a)||full(engine,b);
const dimensions=['trust','affection','respect','fear','romance','competition'];
export function relationView(engine,state,from,to){
 const current=actor(state,from)?.relationships?.[to];
 const base=engine.byId.get(from)?.relationships?.find?.(row=>row.with===to);
 const initial=to==='player'?actor(state,from):base;
 return {trust:initial?.trust??0,affection:initial?.affection??0,respect:0,fear:0,romance:0,competition:0,favors:[],evidenceKeys:[],...structuredClone(current??{})};
}
function applyEvidence(d,engine,evidence){
 if(!enabled(engine,evidence.from,evidence.to)||!actor(d.get('state'),evidence.from)||!actor(d.get('state'),evidence.to))return null;
 const row=relationView(engine,d.get('state'),evidence.from,evidence.to);
 if(row.evidenceKeys.includes(evidence.key))return {duplicate:true,from:evidence.from,to:evidence.to,evidence:evidence.key,delta:{}};
 const delta={};for(const dimension of dimensions){
  const before=row[dimension],change=evidence.delta[dimension]??0;
  row[dimension]=clamp(before+change,['fear','romance'].includes(dimension)?0:-100);if(row[dimension]!==before)delta[dimension]=row[dimension]-before;
 }
 if(evidence.favor&&!row.favors.some(f=>f.id===evidence.key))row.favors.push({id:evidence.key,debtor:evidence.from,creditor:evidence.to,what:evidence.favor,sourceEvent:evidence.sourceEvent,minute:evidence.minute,status:'未还'});
 row.evidenceKeys.push(evidence.key);d.set([...path(evidence.from),'relationships',evidence.to],row);
 // Existing credit and UI readers use these two fields for NPC -> player.
 if(evidence.from!=='player'&&evidence.to==='player')for(const key of ['trust','affection'])d.set([...path(evidence.from),key],row[key]);
 const developments=actor(d.get('state'),evidence.from)?.developments??[];
 d.set([...path(evidence.from),'developments'],[...developments,{eventType:evidence.eventType,source:evidence.sourceEvent,evidence:evidence.key,with:evidence.to,minute:evidence.minute,delta}]);
 return {from:evidence.from,to:evidence.to,evidence:evidence.key,delta};
}
function register(d,engine,evidence){
 const old=d.get('state','relationEvidence',evidence.key);
 if(old)return applyEvidence(d,engine,old);
 if(!enabled(engine,evidence.from,evidence.to)||evidence.from===evidence.to)return null;
 d.set(['state','relationEvidence',evidence.key],evidence);return applyEvidence(d,engine,evidence);
}

// Only the reducer calls this after a successful action. No narrator-supplied
// story or arbitrary source string creates a ledger entry here.
export function recordNpcRelationEvidence(d,engine,before,tool,args,detail,eventId){
 if(!engine.world.npcs.some(n=>n.tier==='full'))return [];
 const after=d.get('state'),pending=[];
 const add=(key,sourceEvent,eventType,from,to,minute,delta,extra={})=>pending.push({key,sourceEvent,eventType,from,to,minute,delta,...extra});
 for(const [id,o]of Object.entries(after.obligations??{})){
  const old=before.obligations?.[id];if(!old||old.status===o.status||!['已完成','违约'].includes(o.status))continue;
  const minute=o.resolvedAt??o.completion?.minute??(['付款','送货'].includes(o.type)?o.deadline:after.minute);
  const people=[o.promisor,o.promisee],kept=o.keptBy??(o.status==='已完成'?[o.promisor]:[]),breached=o.breachedBy??(o.status==='违约'?[o.promisor]:[]);
  for(const who of kept){const observer=people.find(x=>x!==who);add(`obligation:${id}:kept:${who}`,id,'信守约定',observer,who,minute,{trust:3,respect:1,...(['会面','等候'].includes(o.type)?{affection:1}:{})},['带路','协助'].includes(o.type)?{favor:`${o.content}；依据${id}的实际完成记录`}:{});}
  // Kindness on top of keeping one's word: real help raises regard, and a
  // delivery nobody paid for is a gift (npcLife.kindness; none when absent).
  const kind=engine.rules?.npcLife?.kindness;
  if(kind&&o.status==='已完成')for(const who of kept){
   const observer=people.find(x=>x!==who);
   if(kind.help&&['带路','协助'].includes(o.type))add(`obligation:${id}:help:${who}`,id,'帮忙',observer,who,minute,{...kind.help});
   const paid=Object.values(after.obligations).some(x=>x.type==='付款'&&x.promisor===o.promisee&&x.promisee===o.promisor&&Math.abs((x.createdAt??0)-(o.createdAt??0))<=1440)
    ||Object.values(after.records??{}).some(r=>r.category==='debt'&&r.debtor===o.promisee&&r.creditor===o.promisor);
   if(kind.gift&&o.type==='送货'&&who===o.promisor&&!paid)add(`obligation:${id}:gift`,id,'送礼',observer,who,minute,{...kind.gift});
  }
  for(const who of breached){const observer=people.find(x=>x!==who);add(`obligation:${id}:breached:${who}`,id,'违约',observer,who,minute,{trust:-5,affection:-1,respect:-1},{reason:o.reason??'未履行约定'});}
 }
 for(const [id,debt]of Object.entries(after.records??{})){
  const old=before.records?.[id];if(debt.category!=='debt'||!old||debt.status===old.status)continue;
  if(debt.status==='逾期'&&old.status==='待偿还'&&debt.amount>debt.paid&&debt.deadline<=after.minute)add(`debt:${id}:overdue`,id,'违约',debt.creditor,debt.debtor,debt.overdueAt??debt.deadline,{trust:-5,affection:-1});
  if(debt.status==='已还清'&&old.paid<old.amount&&debt.paid===debt.amount){
   const paid=debt.paid-old.paid,debtorBefore=actor(before,debt.debtor),debtorAfter=actor(after,debt.debtor),creditorBefore=actor(before,debt.creditor),creditorAfter=actor(after,debt.creditor);
   if(debtorBefore?.coins-debtorAfter?.coins>=paid&&creditorAfter?.coins-creditorBefore?.coins>=paid){
    const onTime=old.status!=='逾期'&&(debt.paidAt??after.minute)<=debt.deadline;
    add(`debt:${id}:paid`,id,onTime?'信守约定':'逾期补款',debt.creditor,debt.debtor,debt.paidAt??after.minute,{trust:onTime?3:0,respect:1});
   }
  }
 }
 if(tool==='trade'&&args.payment!=='repay'&&detail.cost>0&&!detail.debt){
  const resolve=x=>{try{return engine.resolve(x);}catch{return null;}};
  const buyer=detail.buyer??resolve(args.buyer??'player'),seller=detail.seller??resolve(args.seller);
  if(buyer&&seller&&actor(before,buyer)?.coins-actor(after,buyer)?.coins>=detail.cost&&actor(after,seller)?.coins-actor(before,seller)?.coins>=detail.cost){
   add(`trade:day:${Math.floor(after.minute/1440)}:${seller}:${buyer}`,eventId,'交易',seller,buyer,after.minute,{trust:1});
  }
 }
 if(['combat','conflict'].includes(tool)&&detail.target){
  const target=detail.target,old=actor(before,target),now=actor(after,target);
  const harm=(old?.hp??now?.maxHp)-now?.hp;
  if(old&&now&&harm>=0&&now.hp===detail.targetHp)add(`conflict:${eventId}:${target}`,eventId,'冲突',target,'player',after.minute,{trust:-5,affection:-3,fear:harm>0?Math.min(5,Math.max(1,Math.ceil(harm/5))):0});
 }
 const incident=after.records?.[detail.case];
 if(tool==='crime'&&detail.target&&incident?.category==='legal_case'&&!before.records?.[detail.case]&&incident.offender==='player'&&incident.victim===detail.target&&Array.isArray(detail.witnesses))for(const who of new Set(detail.witnesses)){
  if(before.npcs[who]?.location===before.location&&incident.evidence?.some(e=>e.kind==='eyewitness'&&e.witness===who&&e.identified))add(`crime:${eventId}:${who}`,eventId,'欺骗',who,'player',after.minute,{trust:-5,affection:-2,fear:1});
 }
 if(tool==='learn'&&detail.success&&detail.teacher&&before.npcs[detail.teacher]?.location===before.location){
  add(`learn:${eventId}:${detail.teacher}`,eventId,'帮助','player',detail.teacher,after.minute,{respect:2});
 }
 return pending.sort((a,b)=>a.minute-b.minute||a.key.localeCompare(b.key)).map(e=>register(d,engine,e)).filter(Boolean);
}

export function applyNpcRelation(d,engine,args,eventId){
 const from=engine.resolve(args.from??args.subject??args.npc),to=engine.resolve(args.to??args.target??'player');
 if(!enabled(engine,from,to))return null;
 if(args.notes!==undefined)throw new Error('基础人设只读，变化应追加发展记录');
 if(!actor(d.get('state'),from)||!actor(d.get('state'),to)||from===to)throw new Error('关系双方必须是不同的真实人物');
 const romantic=args.romance||args.romanceDelta||args.eventType==='恋慕';
 if(romantic){
  const minor=id=>{const base=engine.byId.get(id),current=actor(d.get('state'),id);return base?.flags?.minor||base?.minor||base?.age<18||current?.age<18;};
  if(minor(from)||minor(to))throw new Error('未成年人物拒绝恋爱关系写入');
  throw new Error('没有可核验的恋慕事件，不能通过关系工具生成恋慕');
 }
 if(!args.sourceEvent)throw new Error('关系变化缺少来源事件');
 const candidates=Object.values(d.get('state','relationEvidence')??{}).filter(e=>(e.key===args.sourceEvent||e.sourceEvent===args.sourceEvent)&&e.from===from&&e.to===to&&e.eventType===args.eventType);
 if(!candidates.length)throw new Error('来源事件没有对应双方及类型的已核验证据');
 if(dimensions.some(key=>args[`${key}Delta`]!==undefined)||args.favor!==undefined)throw new Error('关系幅度由实际事件确定，不能手填加分或欠情');
 return {npc:from,from,to,changes:candidates.map(e=>applyEvidence(d,engine,e)),relationship:relationView(engine,d.get('state'),from,to)};
}
// Family events from npc-life: both people must be adults before any romance
// enters the ledger; the evidence key keeps replays from counting twice.
export function recordLifeRelation(d,engine,evidence,isMinor){
 if(evidence.delta.romance&&(isMinor(evidence.from)||isMinor(evidence.to)))throw new Error('未成年人物拒绝恋爱关系写入');
 return register(d,engine,evidence);
}
export function recordFestivalRelations(d,engine,event){
 if(event.status!=='held'||d.get('state','records',event.id)?.resultEvent!==event.resultEvent)return;
 for(const from of event.participants)for(const to of event.participants){
  if(from===to)continue;
  register(d,engine,{key:`${event.resultEvent}:${from}:${to}`,sourceEvent:event.resultEvent,eventType:'共同参加节俗',
   from,to,minute:event.resolvedAt,delta:{trust:1,respect:1,...(engine.rules?.npcLife?.kindness?.festival??{})}});
 }
}
