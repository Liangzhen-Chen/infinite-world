import {digest} from './storage.mjs';
import {npcObligationAt} from './npc-obligations.mjs';
import {npcAutonomyBusy} from './npc-autonomy.mjs';
import {recordFestivalRelations} from './npc-relations.mjs';
import {changeItems} from './items.mjs';
import {applyEffects,hookedEffects} from './effects.mjs';

const DAY=1440,path=id=>['state','records',id],safe=n=>Number.isSafeInteger(n)&&n>=0;
const awake=n=>n&&!['死亡','濒死','昏迷','患病','睡眠'].includes(n.status)&&!n.scheduleTravel&&!n.cognitionTravel&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
// Only already published village customs are adapted here. The 24 W5 draft
// candidates are never imported and this adapter does not promote customs.
export function localFestivalCalendar(engine){
 return (engine.world.settlementProfiles??[]).flatMap(p=>(p.details?.calendar?.festivals??[]).map((f,i)=>({
  ...f,id:`custom:${p.id}:${i}`,settlement:p.id,source:`world/geo/settlements.json#${p.id}/calendar/${i}`,kind:'local-custom'
 })));
}
const when=(f,year)=>((year-1)*360+(f.month-1)*30+f.day-1)*DAY+(f.runtime?.startMinute??720);
const occurrence=(f,year)=>`festival:${f.id}:${year}`;
// Published runtime contract: active, host, kind (market/ritual), startMinute,
// durationMinutes, minimumParticipants; resourceNeeds use owner='host' or an
// actual actor ID. sourceCustom links the same published local custom. Drafts
// and regional_unmapped venues never enter this executable calendar.
export function validateFestivalRuntime(world){
 const errors=[],ids=new Set(),customs=localFestivalCalendar({world}),linked=new Set();
 for(const f of world.festivals??[]){
  if(!f.id||ids.has(f.id))errors.push(`${f.id}:节日编号重复或缺失`);ids.add(f.id);
  if(f.runtime?.status!=='active')continue;
  const r=f.runtime,c=f.calendar,v=f.venue,location=world.locations.find(l=>l.id===v?.location);
  if(!f.id?.startsWith('festival_')||!f.name||!c||!safe(c.month)||c.month<1||c.month>12||!safe(c.day)||c.day<1||c.day>30||
   v?.precision!=='existing_location'||!location||!world.npcs.some(n=>n.id===r.host)||!['market','ritual'].includes(r.kind)||
   !safe(r.startMinute)||!safe(r.durationMinutes)||r.durationMinutes<1||r.startMinute+r.durationMinutes>DAY||
   !safe(r.minimumParticipants)||r.minimumParticipants<1||!Array.isArray(f.resourceNeeds))errors.push(`${f.id}:正式节日日期、场地或运行参数无效`);
  if(r.effects!==undefined&&(!Array.isArray(r.effects)||r.effects.some(e=>typeof e?.kind!=='string')))errors.push(`${f.id}:节日效果须为效果表条目`);
  for(const n of f.resourceNeeds??[])if(!world.items.some(i=>i.id===n.item)||!safe(n.quantity)||n.quantity<1||n.quantity>100000||
   !['host','player',...world.npcs.map(p=>p.id)].includes(n.owner))errors.push(`${f.id}:节日材料或物主无效`);
  if(r.sourceCustom){const old=customs.find(x=>x.id===r.sourceCustom);
   if(!old||linked.has(r.sourceCustom)||old.location!==v?.location||old.host!==r.host||old.month!==c?.month||old.day!==c?.day)errors.push(`${f.id}:地方节俗同源引用无效或重复`);
   linked.add(r.sourceCustom);
  }
 }
 return errors;
}
export function festivalCalendar(engine){
 const official=(engine.world.festivals??[]).filter(f=>f.runtime?.status==='active').map(f=>({...f,
  id:f.runtime.sourceCustom??f.id,publishedId:f.id,month:f.calendar.month,day:f.calendar.day,host:f.runtime.host,location:f.venue.location,
  settlement:engine.byId.get(f.venue.location)?.scope,source:`world/lore/festivals.json#${f.id}`,kind:f.runtime.kind,practice:f.custom,formal:true}));
 const linked=new Set(official.map(f=>f.id));return [...localFestivalCalendar(engine).filter(f=>!linked.has(f.id)),...official];
}
function custom(engine,id){const f=festivalCalendar(engine).find(f=>f.id===id||f.publishedId===id);if(!f||!f.formal&&f.status!=='custom-only'||!engine.byId.has(f.location)||!engine.world.npcs.some(n=>n.id===f.host))throw Error('节俗没有已发布日期、地点与组织者来源；候选节日不可执行');return f;}
const needs=f=>(f.resourceNeeds??[]).map(n=>({item:n.item,quantity:n.quantity,owner:n.owner==='host'?f.host:n.owner}));
const matches=(f,row)=>row.definition===digest(f)&&row.host===f.host&&row.location===f.location&&row.kind===f.kind&&
 row.due===when(f,row.year)&&row.endsAt===row.due+f.runtime?.durationMinutes&&digest(row.resources)===digest(needs(f));
const required=(engine,f,row)=>[...new Set([row.host,...(row.cost?[row.supplier]:[]),...needs(f).map(n=>n.owner),engine.byId.get(row.location)?.owner].filter(Boolean))];
function venueAvailable(engine,state,f){
 const l=engine.byId.get(f.location),hours=l.openHours,offset=(f.runtime?.startMinute??720),end=offset+(f.runtime?.durationMinutes??1);
 return !(state.buildings?.[f.location]?.condition===0)&&!(l.access?.mode==='private'&&!l.owner)&&
  (!hours||hours[0]===hours[1]||(offset>=hours[0]&&end<=hours[1]));
}
function available(engine,state,id,location,at){
 if(id==='player')return state.location===location&&awake(state.player);
 return engine.world.npcs.some(n=>n.id===id)&&state.npcs[id]?.location===location&&awake(state.npcs[id])&&
  !npcObligationAt(state,id,at)&&!npcAutonomyBusy(state,id)&&!state.player.companions?.includes(id);
}
function local(d,f){if(d.get('state','location')!==f.location)throw Error('须在登记节俗场所办理，远方消息不能代替现场同意');}
function agreement(d,row,who){
 const a=row.agreements.find(a=>a.person===who),source=a&&d.get(...path(`festival-source:${a.sourceEvent}`));
 return a&&source?.category==='festival_agreement'&&source.festival===row.id&&digest(source.agreement)===digest(a)&&a.createdAt<row.due&&a.expires>row.due&&a.budget===row.cost&&(!row.formal||a.definition===row.definition);
}
function enrollment(d,row,who){
 if(!row.formal)return row.enrolled.includes(who);
 const a=row.enrollments?.find(a=>a.person===who),source=a&&d.get(...path(`festival-source:${a.sourceEvent}`));
 return a&&source?.category==='festival_consent'&&source.festival===row.id&&digest(source.agreement)===digest(a)&&a.definition===row.definition&&a.createdAt<row.due;
}
export function festivalScheduleAt(engine,state,npcId,minute,slot){
 if(!state||!engine.world.festivals?.length)return slot;
 const d={get:(...p)=>p.slice(1).reduce((x,k)=>x?.[k],state)};
 for(const row of Object.values(state.records??{})){
  if(row.category!=='festival'||!row.formal||!['planned','held'].includes(row.status)||minute>=row.endsAt)continue;
  if(row.status==='planned'){const f=festivalCalendar(engine).find(f=>f.id===row.custom);if(!f?.formal||!matches(f,row))continue;}
  const attending=row.status==='held'?row.participants.includes(npcId)||row.supplier===npcId:
   (row.host===npcId||row.supplier===npcId||enrollment(d,row,npcId))&&agreement(d,row,row.host);
  if(!attending)continue;
  if(minute<row.due){if(slot)slot={...slot,until:Math.min(slot.until,row.due)};continue;}
  if(row.status==='planned'&&(!awake(state.npcs[npcId])||state.npcs[npcId]?.location!==row.location))continue;
  return {start:row.due%DAY,end:row.endsAt%DAY,location:row.location,activity:row.status==='planned'?state.npcs[npcId].activity:`参加${row.name}${row.kind==='market'?'集市':'仪式'}`,
   services:row.kind==='market'&&engine.byId.get(npcId)?.serviceCatalog?.some(s=>s.kind==='trade')?['trade']:[],
   production:false,festival:row.id,until:row.endsAt,variant:'festival'};
 }
 return slot;
}
export function festivalAction(d,args,eventId){
 const now=d.get('state','minute');
 if(args.operation==='festival_inspect'){
  const calendar=festivalCalendar(this).filter(f=>f.location===d.get('state','location'));
  return {calendar,events:Object.values(d.get('state','records')??{}).filter(r=>r.category==='festival'&&calendar.some(f=>f.id===r.custom)),actionScope:{kind:'instant'}};
 }
 if(args.operation==='festival_plan'){
  const f=custom(this,args.festival);local(d,f);
  const year=args.year??this.calendar(now).year;if(!Number.isSafeInteger(year)||year<1)throw Error('节俗年份无效');
  const due=when(f,year),id=occurrence(f,year);if(due<=now||due-now>360*DAY)throw Error('只能预约未来一年内的实际节俗日期');
  if(f.formal&&!venueAvailable(this,d.get('state'),f))throw Error('节日场地不可用或不在开放窗口');
  if(d.get(...path(id)))throw Error('该年节俗已有预约或结果，不能重复组织');
  if(args.authorization!==undefined)throw Error('现有公账报告授权没有节庆支出权限，不能扣公款');
  const cost=args.cost??0;if(!safe(cost)||cost>1000000)throw Error('组织费无效');
  const supplier=cost?this.resolve(args.supplier,'npc'):null;
  if(cost&&(supplier===f.host||!available(this,d.get('state'),supplier,f.location,now)))throw Error('收费服务者须为另一个真实在场人物');
  const row={category:'festival',id,custom:f.id,kind:f.kind,name:f.name,source:f.source,settlement:f.settlement,location:f.location,
   host:f.host,year,due,cost,supplier,status:'planned',agreements:[],enrolled:[],participants:[],paidCopper:0,createdAt:now,sourceEvent:eventId,
   ...(f.formal?{formal:true,publishedId:f.publishedId,definition:digest(f),endsAt:due+f.runtime.durationMinutes,resources:needs(f),enrollments:[]}:{} )};
  d.set(path(id),row);return {festival:id,event:row,note:'组织者、物主及收费者须各自明确授权；每位参加者须在场同意，举办时仍核对场地、物资与实际到场。'};
 }
 const row=d.get(...path(args.festival));if(row?.category!=='festival')throw Error('没有该节俗预约');
 const f=args.operation==='festival_cancel'?row:custom(this,row.custom);local(d,f);
 if(row.formal&&args.operation!=='festival_cancel'&&!matches(f,row))throw Error('已授权节日参数变化，须取消原预约');
 if(row.status!=='planned'||now>=row.due)throw Error('该节俗已结束，不能改写结果');
 const who=args.speaker==='player'?'player':this.resolve(args.speaker,'npc');
 if(!available(this,d.get('state'),who,f.location,now))throw Error('当事人须真实在场且可以行动');
 if(args.operation==='festival_cancel'){
  if(who!==row.host||args.consent!==true)throw Error('只有组织者明确同意才可取消');
  const reason=typeof args.content==='string'?args.content.trim():'';if(!reason||reason.length>1200)throw Error('取消需要实际原因');
  const ended={...row,status:'cancelled',reason,resolvedAt:now};d.set(path(row.id),ended);return {festival:row.id,event:ended};
 }
 if(args.consent!==true)throw Error('需要本人明确同意，不为未到场者代答');
 if(args.operation==='festival_authorize'){
  if(!(row.formal?required(this,f,row):[row.host,row.supplier]).includes(who))throw Error('只有组织者、物主、场地主与收费服务者可确认');
  if(row.agreements.some(a=>a.person===who))return {festival:row.id,duplicate:true};
  const a={person:who,budget:row.cost,payer:row.host,payee:row.supplier,scope:row.formal?'own-coins-items-and-venue':'own-coins-only',createdAt:now,expires:row.due+1,sourceEvent:eventId,
   ...(row.formal?{definition:row.definition,resources:row.resources.filter(n=>n.owner===who)}:{})};
  d.set(path(`festival-source:${eventId}`),{category:'festival_agreement',festival:row.id,agreement:a});
  d.set(path(row.id),{...row,agreements:[...row.agreements,a]});return {festival:row.id,agreement:a};
 }
 if(args.operation==='festival_join'){
  if(row.enrolled.includes(who))return {festival:row.id,duplicate:true};
  const a={person:who,definition:row.definition,createdAt:now,sourceEvent:eventId};
  if(row.formal)d.set(path(`festival-source:${eventId}`),{category:'festival_consent',festival:row.id,agreement:a});
  d.set(path(row.id),{...row,enrolled:[...row.enrolled,who],...(row.formal?{enrollments:[...row.enrollments,a]}:{})});return {festival:row.id,participant:who};
 }
 throw Error('未知节俗操作');
}
export function nextFestivalMinute(state,engine,now){
 const pending=Object.values(state.records??{}).filter(r=>r.category==='festival'&&r.status==='planned'&&r.due>now).map(r=>r.due);
 const year=engine.calendar(now).year;
 for(const f of festivalCalendar(engine)){const at=when(f,year);pending.push(at>now?at:when(f,year+1));}
 for(const r of Object.values(state.records??{}))if(r.category==='festival'&&r.status==='held'&&r.endsAt>now)pending.push(r.endsAt);
 return Math.min(Infinity,...pending);
}
export function advanceFestivals(d,engine,at){
 const year=engine.calendar(at).year;
 const calendar=festivalCalendar(engine);
 for(const old of Object.values(d.get('state','records')??{}))if(old.category==='festival'&&old.status==='planned'&&old.due===at&&!calendar.some(f=>f.id===old.custom)){
  d.set(path(old.id),{...old,status:'unavailable',reason:'已预约节日不再有正式运行来源',resolvedAt:at,resultEvent:`festival-result:${old.id}`});
 }
 for(const f of calendar){
  const state=d.get('state');
  if(when(f,year)!==at)continue;
  const id=occurrence(f,year),old=d.get(...path(id));if(old&&old.status!=='planned')continue;
  const row=old??{category:'festival',id,custom:f.id,kind:f.kind,name:f.name,source:f.source,settlement:f.settlement,location:f.location,host:f.host,year,due:at,cost:0,participants:[],paidCopper:0};
  let reason=null,status='held',participants=[];
  if(!old){status='not-scheduled';reason='只有当地节俗日期，没有组织与费用授权';}
  else if(f.formal&&!row.formal||row.formal&&(!f.formal||!matches(f,row)||!venueAvailable(engine,state,f))){status='unavailable';reason='已授权节日参数变化或场地不可用';}
  else if(!(row.formal?required(engine,f,row):[row.host,...(row.cost?[row.supplier]:[])]).every(who=>agreement(d,row,who))){status='unauthorized';reason='组织、材料、场地或收费授权缺失、到期或来源不成立';}
  else if(!available(engine,state,row.host,row.location,at)||row.cost&&!available(engine,state,row.supplier,row.location,at)){status='unavailable';reason='组织者或收费服务者未实际到场或正忙';}
  else{
   participants=row.enrolled.filter(id=>id!==row.host&&id!==row.supplier&&enrollment(d,row,id)&&available(engine,state,id,row.location,at));
   if(participants.length<(f.runtime?.minimumParticipants??1)){status='no-attendance';reason='没有足够已同意且实际到场的参加者';}
   else if(!safe(state.npcs[row.host]?.coins)||state.npcs[row.host].coins<row.cost){status='insufficient-funds';reason='组织者自有现金不足，不动公共粮钱或补造库存';}
   else if(row.cost&&!safe(state.npcs[row.supplier]?.coins)){status='unavailable';reason='收费者现金账未知';}
   else if(row.formal){
    const totals=new Map();for(const n of row.resources){const key=`${n.owner}:${n.item}`;totals.set(key,{...n,quantity:(totals.get(key)?.quantity??0)+n.quantity});}
    if([...totals.values()].some(n=>!available(engine,state,n.owner,row.location,at)||!['player',row.host,row.supplier,...participants].includes(n.owner)||engine.quantity(d,n.owner,n.item)<n.quantity)){
     status='insufficient-resources';reason='已同意物主未到场或实际材料不足，不补造库存';
    }else try{
     const actors=[row.host,...participants,...(row.supplier?[row.supplier]:[])];
     engine.assertNpcObligationAction(d,actors,{start:at,minutes:f.runtime.durationMinutes,location:row.location});
     engine.assertNpcAutonomyAction(state,actors,{start:at,minutes:f.runtime.durationMinutes});
    }catch{status='unavailable';reason='参加者在活动窗口已有义务或工作';}
   }
  }
  const consumed=[];
  if(status==='held'&&row.formal)for(const n of row.resources){const result=changeItems(d,engine,n.owner,n.item,-n.quantity);consumed.push({...n,...result});}
  const done={...row,status,reason,participants:status==='held'?[row.host,...participants]:[],paidCopper:status==='held'?row.cost:0,resolvedAt:at,resultEvent:`festival-result:${id}`,...(row.formal?{consumed}:{})};
  // K6: a held festival applies its published runtime effects and any effect-table
  // hooks as one transaction; festivals without effects keep their exact record.
  const festivalEffects=status==='held'?[...f.runtime?.effects??[],...hookedEffects(engine,'festival',f.publishedId??f.id)]:[];
  if(festivalEffects.length){
   const receipt=applyEffects(d,engine,festivalEffects,{settlement:f.settlement,faction:null,minute:at,sourceEvent:done.resultEvent},'festival');
   done.effects=receipt.applied?receipt.effects:[];if(!receipt.applied)done.effectsBlocked=receipt.reason??'效果条件未满足';
  }
  if(done.paidCopper){
   d.set(['state','npcs',row.host,'coins'],state.npcs[row.host].coins-row.cost);
   d.set(['state','npcs',row.supplier,'coins'],state.npcs[row.supplier].coins+row.cost);
  }
  d.set(path(id),done);
  if(status==='held'){
   if(row.formal)for(const person of [...done.participants,row.supplier].filter(id=>id&&id!=='player'&&engine.byId.get(id)?.schedule))
    d.set(['state','npcs',person,'activity'],`参加${row.name}${row.kind==='market'?'集市':'仪式'}`);
   recordFestivalRelations(d,engine,done);
   for(const person of done.participants.filter(id=>id!=='player'&&engine.byId.get(id)?.tier==='full')){
    const stream=d.get('state','npcs',person,'memoryStream')??[];
    if(!stream.some(m=>m.id===done.resultEvent))d.set(['state','npcs',person,'memoryStream'],[...stream,{
     id:done.resultEvent,sourceEvent:done.resultEvent,kind:'festival',minute:at,location:row.location,participants:done.participants,
     sourceType:'亲历',content:`参加${row.name}的当地节俗活动。${f.practice}`,salience:3
    }]);
   }
  }
 }
}
export function festivalScene(engine,document){
 return Object.values(document.state.records??{}).filter(r=>r.category==='festival'&&r.location===document.state.location&&r.resolvedAt<=document.state.minute)
  .sort((a,b)=>b.resolvedAt-a.resolvedAt).slice(0,3).map(r=>`${engine.calendar(r.due).text} ${r.name}：${r.status==='held'?'已举行当地节俗活动':r.reason}。`).join('\n');
}
