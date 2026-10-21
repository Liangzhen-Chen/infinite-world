// A1 事件流与方位文字（08 §8.5、06 §6.9.4，L3 投影）：模板按动词数据化（world/actions/locale/<locale>/events.json），
// 缺模板或槽位填不上时回落到界面分组默认、再到通用默认；方位由地点坐标确定性派生（与地图同一坐标约定：x 向东、y 向北）。
// 只读投影，不改状态；不含玩家感知之外的内容（场景只列与玩家同处、未在途的人物）。
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {appliedEffects} from './applied-effects.mjs';
import {npcAvailability} from './npc-schedule.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {localWeather} from './weather.mjs';

const LOCALES=fileURLToPath(new URL('../world/actions/locale/',import.meta.url));
export const BASE_LOCALE='zh-CN';
const cache=new Map();
const merge=(base,over)=>{const out={...base};for(const [k,v]of Object.entries(over??{}))out[k]=v&&typeof v==='object'&&!Array.isArray(v)&&base?.[k]&&typeof base[k]==='object'?merge(base[k],v):v;return out;};
// A locale directory overrides only the keys it writes; everything else comes from the base locale.
export function loadTemplates(locale=BASE_LOCALE){
 if(cache.has(locale))return cache.get(locale);
 const read=name=>{
  const directory=`${LOCALES}${name}/`;let files;
  try{files=fs.readdirSync(directory).filter(file=>file.endsWith('.json')).sort();}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(name===BASE_LOCALE&&!files.includes('events.json'))return null;
  // Core events first, then the action packs' locale fragments (e.g. open.json).
  files.sort((a,b)=>(a==='events.json'?-1:b==='events.json'?1:a.localeCompare(b)));
  return files.reduce((templates,file)=>merge(templates,JSON.parse(fs.readFileSync(directory+file,'utf8'))),{});
 };
 const base=read(BASE_LOCALE);if(!base)throw Error('缺少基础事件模板');
 const templates=locale===BASE_LOCALE?base:merge(base,read(locale)??{});
 cache.set(locale,templates);return templates;
}
// '{a}买了{b}' with vars; null when any placeholder has no value, so callers fall back to a coarser template.
export function fill(template,vars){
 if(typeof template!=='string')return null;let missing=false;
 const text=template.replace(/\{(\w+)\}/g,(_,key)=>{const v=vars[key];if(v===undefined||v===null||v==='')missing=true;return String(v??'');});
 return missing?null:text;
}
const placeOf=(engine,id)=>engine.byId.get(id)??null;
// Compass word from one location to another, or out/in along the containment tree.
const LOCAL_KM=1;
export function bearing(engine,from,to,templates=loadTemplates()){
 const a=placeOf(engine,from),b=placeOf(engine,to),d=templates.directions;
 if(!a||!b)return {word:'',km:null};
 const [ax,ay]=a.coordinates??[0,0],[bx,by]=b.coordinates??[0,0],dx=bx-ax,dy=by-ay,km=Math.hypot(dx,dy);
 // Containment reads as stepping out/in only within a settlement; a far place filed under a village is still a journey.
 if(a.parent===b.id&&km<LOCAL_KM)return {word:d.out,km,relation:'out'};
 if(km<1e-9)return {word:b.parent===a.id?d.in:d.here,km:0,relation:b.parent===a.id?'in':'here'};
 const sector=['e','ne','n','nw','w','sw','s','se'][Math.round(((Math.atan2(dy,dx)*180/Math.PI+360)%360)/45)%8];
 return {word:d[sector],km,relation:b.parent===a.id&&km<LOCAL_KM?'in':'route'};
}
// Distances are 里 (0.5 km) rounded for reading; under 0.1 km is "a few steps".
export function distanceText(km,templates=loadTemplates()){
 if(km===null||km===undefined)return '';
 if(km<0.1)return templates.units.distanceNear;
 const li=km*2;return fill(templates.units.distanceKm,{value:li>=10?Math.round(li):Math.round(li*10)/10});
}
export function durationText(minutes,templates=loadTemplates()){
 const h=Math.floor(minutes/60),m=minutes%60,u=templates.units;
 return h?(m?fill(u.hoursMinutes,{h,m}):fill(u.hoursOnly,{h})):fill(u.minutes,{minutes:m});
}
const clockText=minute=>`${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
function nameOf(engine,state,id){
 if(id==='player')return '你';
 if(typeof id!=='string')return id;
 return state?.npcs?.[id]?.name??state?.created?.[id]?.name??engine.byId.get(id)?.name??id;
}
const MODES={walk:'步行',horse:'骑马',cart:'乘车',boat:'乘船'};
// Template variables: arguments (entity ids become names), the receipt's plain fields, then derived slots.
function variables(engine,action,before,after,args,result,templates){
 const s=after.state,vars={label:action?.label??''};
 for(const [k,v]of Object.entries(result??{}))if(['string','number'].includes(typeof v))vars[k]=typeof v==='string'?nameOf(engine,s,v):v;
 for(const [k,v]of Object.entries(args??{}))if(['string','number'].includes(typeof v)&&k!=='operation')vars[k]=typeof v==='string'?(engine.byId.get(v)||s.npcs?.[v]?nameOf(engine,s,v):k==='mode'?MODES[v]??v:v):v;
 if(!vars.mode&&args?.destination)vars.mode=MODES.walk;
 const resolved=k=>{const raw=args?.[k];if(typeof raw!=='string')return;try{const id=engine.resolve(raw);vars[k]=nameOf(engine,s,id);}catch{}};
 for(const k of ['seller','buyer','target','item','destination','skill','recipe'])resolved(k);
 // A seller can explicitly permit a smaller cash purchase; describe the
 // settled quantity rather than the original requested quantity.
 if(result?.partial===true)vars.quantity=result.quantity;
 const elapsed=(s.minute??0)-(before.state.minute??0);
 vars.duration=durationText(Math.max(0,elapsed),templates);vars.clock=clockText(s.minute??0);vars.place=nameOf(engine,s,s.location);
 vars.actor=nameOf(engine,s,result?.actor??'player');
 return vars;
}
// Other people's purses appear only for the counterparties named in this action (the player cannot see anyone else's money move).
function effectLines(engine,before,after,effects,templates,counterparties=new Set()){
 const t=templates.effects,s=after.state,lines=[];
 for(const e of effects){
  if(e.op==='transfer'&&e.resource==='coin'&&e.holder!=='player'&&!counterparties.has(e.holder))continue;
  if(e.op==='transfer'&&e.resource==='coin')lines.push(fill(e.holder==='player'?(e.delta<0?t.coinOut:t.coinIn):(e.delta<0?t.otherCoinOut:t.otherCoinIn),{amount:Math.abs(e.delta),holder:nameOf(engine,s,e.holder)}));
  else if(e.op==='transfer'&&e.resource==='item'&&e.holder==='player')lines.push(fill(e.delta<0?t.itemOut:t.itemIn,{item:nameOf(engine,s,e.item),quantity:Math.abs(e.delta)}));
  else if(e.op==='move'){const b=bearing(engine,e.from,e.to,templates),names={place:nameOf(engine,s,e.to),from:nameOf(engine,s,e.from)};
   if(b.relation==='out'||b.relation==='in'||b.relation==='here'){lines.push(fill(b.relation==='out'?t.moveOut:t.moveIn,names));continue;}
   lines.push(fill(t.move,{place:nameOf(engine,s,e.to),from:nameOf(engine,s,e.from),direction:b.word,distance:b.relation==='route'?distanceText(b.km,templates):''})??fill(t.move.replace('{distance}',''),{place:nameOf(engine,s,e.to),from:nameOf(engine,s,e.from),direction:b.word}));}
  else if(e.op==='time')lines.push(fill(t.time,{duration:durationText(e.minutes,templates),clock:clockText(e.minute)}));
  else if(e.op==='vital')lines.push(e.holder==='player'?fill(t[`${e.need}${e.delta>0?'Up':'Down'}`],{amount:Math.abs(e.delta)}):fill(t[`other${e.need==='hp'?'Hp':'Mp'}${e.delta>0?'Up':'Down'}`],{holder:nameOf(engine,s,e.holder),amount:Math.abs(e.delta)}));
  else if(e.op==='status')lines.push(e.holder==='player'?fill(t.status,{to:e.to}):fill(e.to==='死亡'?t.otherDead:t.otherStatus,{holder:nameOf(engine,s,e.holder),to:e.to}));
  else if(e.op==='xp')lines.push(fill(e.delta>0?t.xpUp:t.xpDown,{amount:Math.abs(e.delta)}));
  else if(e.op==='level')lines.push(fill(e.to>e.from?t.levelUp:t.levelDown,{level:e.to}));
  else if(e.op==='durability')lines.push(fill(t.durability,{item:nameOf(engine,s,e.item),from:e.from,to:e.to}));
  else if(e.op==='corpse')lines.push(fill(e.items.length?t.corpseItems:t.corpse,{holder:nameOf(engine,s,e.holder),items:e.items.map(row=>`${nameOf(engine,s,row.item)}×${row.amount}`).join('、')}));
  else if(e.op==='obligation.create')lines.push(fill(t.obligation,{category:templates.categories[e.category]??e.category}));
 }
 return lines.filter(Boolean);
}
// Event-stream text for one settled action: one verb line, then one line per applied effect.
export function actionLines({engine,action,before,after,args,result,effects=appliedEffects(before,after,{result}),locale=BASE_LOCALE}){
 if(result?.receipt?.status==='pending')return {lines:['行动仍在等待裁决，尚未完成。'],effects:[]};
 if(result?.receipt?.status==='preview')return {lines:['这只是预览，行动尚未执行。'],effects:[]};
 if(result?.receipt&&result.receipt.status!=='committed')return {lines:[refusalLine(action,result.receipt.reason??'行动尚未完成',locale)],effects:[]};
 if(result?.dialogue)return {lines:[result.dialogue.text],effects};
 const templates=loadTemplates(locale),vars=variables(engine,action,before,after,args,result,templates);
 const entry=templates.events[action?.narration];
 const chain=[typeof entry==='object'?entry?.success:entry,templates.events[action?.verb],templates.groups[action?.group],templates.groups.default];
 const receipt=result?.receipt;
 const head=receipt?.check?.success===false?`你尝试${action?.label??'这样做'}，未能达到预期。`:
  receipt?.narrate?.mustNot?.length?`你尝试${action?.label??'这样做'}，部分效果未能发生。`:chain.map(t=>fill(t,vars)).find(Boolean)??action?.label??'';
 const counterparties=new Set();
 for(const k of ['seller','buyer','target','npc','teacher','authority']){const raw=args?.[k];if(typeof raw!=='string')continue;try{counterparties.add(engine.resolve(raw));}catch{}}
 const rest=effectLines(engine,before,after,effects,templates,counterparties);
 if(receipt?.fallback?.originalIntentFulfilled===false){
  // The mark exists; the player's original desired effect is not its result.
  rest.push('只留下了痕迹，原本设想的效果并未因此实现。');
  for(const reaction of receipt.mark?.reactions??[]){
   const event=after.state.records?.[`world_event:${reaction.event}`];
   if(event?.verb!=='tell'||event.actor!==reaction.observer||event.payload?.kind!=='mark_reaction'||event.payload.mark!==receipt.mark.entity)continue;
   if(event.target!=='player'&&event.actor!=='player'&&!event.witnesses?.includes('player'))continue;
   rest.push(fill(entry?.reaction,{observer:nameOf(engine,after.state,event.actor),text:event.payload.text})??`${nameOf(engine,after.state,event.actor)}：${event.payload.text}`);
  }
 }
 return {lines:[head,...(rest.length?rest:[templates.effects.nothing])],effects};
}
export function refusalLine(action,reason,locale=BASE_LOCALE){
 return fill(loadTemplates(locale).effects.refused,{label:action?.label??'这样做',reason:String(reason??'').replace(/^Error:\s*/,'')})??String(reason);
}
// Visible exits from here: routes touching this location plus the containing place, nearest first.
export function exitsFrom(engine,state,templates=loadTemplates()){
 const here=state.location,seen=new Set(),rows=[];
 for(const r of engine.world.routes){
  if(r.from!==here&&r.to!==here)continue;const to=r.from===here?r.to:r.from;if(seen.has(to)||!engine.byId.get(to))continue;seen.add(to);
  const b=bearing(engine,here,to,templates);rows.push({id:to,route:r.id,name:nameOf(engine,state,to),direction:b.word,relation:b.relation,km:r.lengthKm??b.km,modes:r.modes??['walk']});
 }
 return rows.sort((x,y)=>(x.km??0)-(y.km??0)||x.id.localeCompare(y.id));
}
export function presentPeople(engine,state){
 return Object.entries(state.npcs??{}).filter(([id,n])=>n.location===state.location&&!n.scheduleTravel&&!n.cognitionTravel&&!isPhysicallyDead(null,state,id))
  .map(([id,n])=>{let activity=null;try{activity=npcAvailability(engine,state,id).activity||null;}catch{activity=null;}return {id,name:nameOf(engine,state,id),activity:activity??(typeof n.activity==='string'&&n.activity?n.activity:null)};}).sort((a,b)=>a.id.localeCompare(b.id));
}
// 方位组织的场景文字（无 LLM 时由模板直接生成）：此处、在场的人、各方向的出路。
export function sceneLines(engine,document,locale=BASE_LOCALE){
 const t=loadTemplates(locale),sc=t.scene,s=document.state,place=placeOf(engine,s.location),parent=placeOf(engine,place?.parent);
 const lines=[fill(sc.header,{place:nameOf(engine,s,s.location),within:parent?fill(sc.within,{parent:parent.name}):''})??`【此处】${nameOf(engine,s,s.location)}`];
 const weather=engine.rules?.weather?localWeather(engine,document):null;
 if(weather)lines[0]+=`｜${weather.daylight?'白昼':'夜色已暗'}｜${weather.name}`;
 const people=presentPeople(engine,s);
 lines.push(people.length?sc.presentHeader+people.map(p=>p.activity?fill(sc.present,p):fill(sc.presentIdle,p)).join('；'):sc.nobody);
 const exits=exitsFrom(engine,s,t);
 lines.push(exits.length?sc.exitsHeader+exits.slice(0,10).map(e=>e.relation==='out'?fill(sc.exitOut,e):e.relation==='in'||e.relation==='here'?fill(sc.exitIn,e):fill(sc.exit,{...e,distance:distanceText(e.km,t)})).join('；'):sc.noExit);
 return lines;
}
