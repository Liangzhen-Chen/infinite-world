import {digest} from './storage.mjs';
import {npcObligationAt} from './npc-obligations.mjs';
import {npcAutonomyBusy} from './npc-autonomy.mjs';
import {recordFestivalRelations} from './npc-relations.mjs';

const DAY=1440,path=id=>['state','records',id],safe=n=>Number.isSafeInteger(n)&&n>=0;
const awake=n=>n&&!['死亡','濒死','昏迷','患病','睡眠'].includes(n.status)&&!n.scheduleTravel&&!n.cognitionTravel&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
// Only already published village customs are adapted here. The 24 W5 draft
// candidates are never imported and this adapter does not promote customs.
export function localFestivalCalendar(engine){
 return (engine.world.settlementProfiles??[]).flatMap(p=>(p.details?.calendar?.festivals??[]).map((f,i)=>({
  ...f,id:`custom:${p.id}:${i}`,settlement:p.id,source:`world/geo/settlements.json#${p.id}/calendar/${i}`,kind:'local-custom'
 })));
}
const when=(f,year)=>((year-1)*360+(f.month-1)*30+f.day-1)*DAY+720;
const occurrence=(f,year)=>`festival:${f.id}:${year}`;
function custom(engine,id){const f=localFestivalCalendar(engine).find(f=>f.id===id);if(!f||f.status!=='custom-only'||!engine.byId.has(f.location)||!engine.world.npcs.some(n=>n.id===f.host))throw Error('节俗没有已发布日期、地点与组织者来源；候选节日不可执行');return f;}
function available(engine,state,id,location,at){
 if(id==='player')return state.location===location&&awake(state.player);
 return engine.world.npcs.some(n=>n.id===id)&&state.npcs[id]?.location===location&&awake(state.npcs[id])&&
  !npcObligationAt(state,id,at)&&!npcAutonomyBusy(state,id)&&!state.player.companions?.includes(id);
}
function local(d,f){if(d.get('state','location')!==f.location)throw Error('须在登记节俗场所办理，远方消息不能代替现场同意');}
function agreement(d,row,who){
 const a=row.agreements.find(a=>a.person===who),source=a&&d.get(...path(`festival-source:${a.sourceEvent}`));
 return a&&source?.category==='festival_agreement'&&source.festival===row.id&&digest(source.agreement)===digest(a)&&a.createdAt<row.due&&a.expires>row.due&&a.budget===row.cost;
}
export function festivalAction(d,args,eventId){
 const now=d.get('state','minute');
 if(args.operation==='festival_inspect'){
  const calendar=localFestivalCalendar(this).filter(f=>f.location===d.get('state','location'));
  return {calendar,events:Object.values(d.get('state','records')??{}).filter(r=>r.category==='festival'&&calendar.some(f=>f.id===r.custom)),actionScope:{kind:'instant'}};
 }
 if(args.operation==='festival_plan'){
  const f=custom(this,args.festival);local(d,f);
  const year=args.year??this.calendar(now).year;if(!Number.isSafeInteger(year)||year<1)throw Error('节俗年份无效');
  const due=when(f,year),id=occurrence(f,year);if(due<=now||due-now>360*DAY)throw Error('只能预约未来一年内的实际节俗日期');
  if(d.get(...path(id)))throw Error('该年节俗已有预约或结果，不能重复组织');
  if(args.authorization!==undefined)throw Error('现有公账报告授权没有节庆支出权限，不能扣公款');
  const cost=args.cost??0;if(!safe(cost)||cost>1000000)throw Error('组织费无效');
  const supplier=cost?this.resolve(args.supplier,'npc'):null;
  if(cost&&(supplier===f.host||!available(this,d.get('state'),supplier,f.location,now)))throw Error('收费服务者须为另一个真实在场人物');
  const row={category:'festival',id,custom:f.id,kind:f.kind,name:f.name,source:f.source,settlement:f.settlement,location:f.location,
   host:f.host,year,due,cost,supplier,status:'planned',agreements:[],enrolled:[],participants:[],paidCopper:0,createdAt:now,sourceEvent:eventId};
  d.set(path(id),row);return {festival:id,event:row,note:'组织者须明确授权自己的组织费；收费者和每位参加者须分别在场同意。此预约不改变作息或保证到场。'};
 }
 const row=d.get(...path(args.festival));if(row?.category!=='festival')throw Error('没有该节俗预约');
 const f=custom(this,row.custom);local(d,f);
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
  if(![row.host,row.supplier].includes(who))throw Error('只有组织者和收费服务者可确认组织费');
  if(row.agreements.some(a=>a.person===who))return {festival:row.id,duplicate:true};
  const a={person:who,budget:row.cost,payer:row.host,payee:row.supplier,scope:'own-coins-only',createdAt:now,expires:row.due+1,sourceEvent:eventId};
  d.set(path(`festival-source:${eventId}`),{category:'festival_agreement',festival:row.id,agreement:a});
  d.set(path(row.id),{...row,agreements:[...row.agreements,a]});return {festival:row.id,agreement:a};
 }
 if(args.operation==='festival_join'){
  if(row.enrolled.includes(who))return {festival:row.id,duplicate:true};
  d.set(path(row.id),{...row,enrolled:[...row.enrolled,who]});return {festival:row.id,participant:who};
 }
 throw Error('未知节俗操作');
}
export function nextFestivalMinute(state,engine,now){
 const pending=Object.values(state.records??{}).filter(r=>r.category==='festival'&&r.status==='planned'&&r.due>now).map(r=>r.due);
 const year=engine.calendar(now).year;
 for(const f of localFestivalCalendar(engine)){const at=when(f,year);pending.push(at>now?at:when(f,year+1));}
 return Math.min(Infinity,...pending);
}
export function advanceFestivals(d,engine,at){
 const year=engine.calendar(at).year,state=d.get('state');
 for(const f of localFestivalCalendar(engine)){
  if(when(f,year)!==at)continue;
  const id=occurrence(f,year),old=d.get(...path(id));if(old&&old.status!=='planned')continue;
  const row=old??{category:'festival',id,custom:f.id,kind:f.kind,name:f.name,source:f.source,settlement:f.settlement,location:f.location,host:f.host,year,due:at,cost:0,participants:[],paidCopper:0};
  let reason=null,status='held',participants=[];
  if(!old){status='not-scheduled';reason='只有当地节俗日期，没有组织与费用授权';}
  else if(!agreement(d,row,row.host)||row.cost&&!agreement(d,row,row.supplier)){status='unauthorized';reason='组织或收费授权缺失、到期或来源不成立';}
  else if(!available(engine,state,row.host,row.location,at)||row.cost&&!available(engine,state,row.supplier,row.location,at)){status='unavailable';reason='组织者或收费服务者未实际到场或正忙';}
  else{
   participants=row.enrolled.filter(id=>id!==row.host&&id!==row.supplier&&available(engine,state,id,row.location,at));
   if(!participants.length){status='no-attendance';reason='没有已同意且实际到场的参加者';}
   else if(!safe(state.npcs[row.host]?.coins)||state.npcs[row.host].coins<row.cost){status='insufficient-funds';reason='组织者自有现金不足，不动公共粮钱或补造库存';}
   else if(row.cost&&!safe(state.npcs[row.supplier]?.coins)){status='unavailable';reason='收费者现金账未知';}
  }
  const done={...row,status,reason,participants:status==='held'?[row.host,...participants]:[],paidCopper:status==='held'?row.cost:0,resolvedAt:at,resultEvent:`festival-result:${id}`};
  if(done.paidCopper){
   d.set(['state','npcs',row.host,'coins'],state.npcs[row.host].coins-row.cost);
   d.set(['state','npcs',row.supplier,'coins'],state.npcs[row.supplier].coins+row.cost);
  }
  d.set(path(id),done);
  if(status==='held'){
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
