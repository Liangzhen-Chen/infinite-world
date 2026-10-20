// A1 可做之事（06 §6.9.1、08 §8.2【可做之事】，L3 投影）：由注册表与玩家此刻能感知的场景派生
// “此处可做”、对象菜单（人/物/地点）与快捷栏，并把槽位的可选项（出路、对方存货、行囊、配方、欠账）填好。
// 这里的前置只决定菜单里出不出现；做得成做不成仍由引擎结算，拒绝时引擎给世界内原因。
import {loadActionRegistry,findAction,catalogRow,searchActions,CONSENT_PENDING} from './action-registry.mjs';
import {npcSchedule} from './npc-state.mjs';
import {exitsFrom,presentPeople,sceneLines,distanceText,loadTemplates} from './action-text.mjs';
import {derivedBankAt} from './finance-bank.mjs';
import {weatherTravel} from './weather.mjs';
import {currentShops} from './shop.mjs';
import {obligationRows,obligationView} from './obligation-state.mjs';
import {settlementPresent} from './obligation-presence.mjs';
import {primitiveActionRuntime} from './primitives.mjs';

const qty=value=>typeof value==='number'?value:value?.quantity??0;
export const QUICK=['交易','移动','等待','制作','账目','休息','观察'];
const CHOICES={walk:'步行',horse:'骑马',cart:'乘车',boat:'乘船',cash:'现付',credit:'赊账',repay:'还账',attack:'攻击',defend:'防守',flee:'脱离',shove:'推搡'};

function context(engine,document){
 const s=document.state,place=engine.byId.get(s.location),templates=loadTemplates();
 const name=id=>s.npcs?.[id]?.name??s.created?.[id]?.name??engine.byId.get(id)?.name??id;
 const people=presentPeople(engine,s),present=new Set(people.map(p=>p.id));
 const stations=new Set((place?.workstations??[]).map(w=>w.kind));
 const recipes=(engine.world.recipes??[]).filter(r=>(!r.learningRequired||s.recipes?.[r.id])&&(!r.workstation||stations.has(r.workstation)));
 let bank=null;try{bank=derivedBankAt(engine,s,s.location);}catch{bank=null;}
 const debts=obligationRows(s).filter(r=>r.debtor==='player'&&(!r.resource||['coin_river','core:coin_river'].includes(r.resource))&&obligationView(s,r).owed>0)
  .map(r=>{const seller=r.bank&&r.bank===bank?.id?bank.keepers.find(id=>present.has(id)):r.creditor;
   return{id:r.legacyRecord??r.id,creditor:r.creditor,seller,reachable:Boolean(seller&&present.has(seller)&&settlementPresent(engine,s,'player',r.creditor)),remaining:obligationView(s,r).owed};});
 const lodging=place?.lodging?.host&&(place.lodging.rooms??0)>0?place.lodging:null;
 // 路况：本季封路、天气封路或当下天气（与地图同一算法），步行计。
 const season=engine.calendar(s.minute).season;
 const exits=exitsFrom(engine,s,templates).map(e=>{const edge=engine.world.routes.find(r=>r.id===e.route);if(!edge?.lengthKm)return e;
  let w={};try{w=weatherTravel(engine,document.randomSeed,edge,'walk',s.minute)??{};}catch{w={};}
  return {...e,condition:edge.closedSeasons?.includes(season)?'本季封路':w.closed?'天气封路':w.weather??null};});
 return {engine,s,place,name,people,present,recipes,debts,bank,lodging,exits,templates,
  inventory:Object.entries(s.inventory??{}).filter(([,v])=>qty(v)>0).map(([id,v])=>({id,name:name(id),quantity:qty(v)})),
  skills:Object.keys(s.skills??{}).map(id=>({id,name:name(id)}))};
}
function stockOf(ctx,npc){return Object.entries(ctx.s.npcs?.[npc]?.inventory??{}).filter(([,v])=>qty(v)>0).map(([id,v])=>({id,name:ctx.name(id),quantity:qty(v)}));}
// Named projection checks used by registry preconditions.
function holds(ctx,condition,target){
 switch(condition){
  case 'present(target)':return Boolean(target&&ctx.present.has(target));
  case 'sells(target)':return Boolean(target&&stockOf(ctx,target).length);
  case 'hasItems':return ctx.inventory.length>0;
  case 'lodging(here)':return Boolean(ctx.lodging);
  case 'bank(here)':return Boolean(ctx.bank);
  case 'knowsRecipe':return ctx.recipes.length>0;
  case 'hasDebt':return ctx.debts.some(r=>r.reachable);
  case 'playerObligation':return obligationRows(ctx.s).some(r=>[r.debtor,r.creditor,r.promisor,r.promisee].includes('player'));
  case 'pendingMedicalVisit':return Object.values(ctx.s.records??{}).some(r=>r.patient==='player'&&(r.status==='排队'||r.status==='预约'&&r.start>ctx.s.minute));
  case 'investmentCounterparty':return ctx.people.length>0;
  case 'hasSkill':return ctx.skills.length>0;
  case 'outdoors(here)':return !String(ctx.s.location).startsWith('bld_');
  case 'exit(destination)':return ctx.exits.length>0;
  default:return true;// unknown names never hide an action; the engine decides
 }
}
function options(ctx,source,target){
 switch(source){
  case 'exits':return ctx.exits.map(e=>({value:e.id,label:`${e.name}（${e.direction}${e.relation==='route'?distanceText(e.km,ctx.templates):''}${e.condition?`，${e.condition}`:''}）`}));
  case 'target.stock':return target?stockOf(ctx,target).map(r=>({value:r.id,label:`${r.name}（存${r.quantity}）`})):[];
  case 'inventory':return ctx.inventory.map(r=>({value:r.id,label:`${r.name}×${r.quantity}`}));
  case 'recipes':return ctx.recipes.map(r=>({value:r.id,label:r.name}));
  case 'skills':return ctx.skills.map(r=>({value:r.id,label:r.name}));
  case 'debts':return ctx.debts.filter(r=>r.reachable).map(r=>({value:r.id,label:`欠${ctx.name(r.creditor)} ${r.remaining}文`,fill:{seller:r.seller}}));
  default:return null;
 }
}
// A catalog row for the interface: slot choices resolved here, the target slot pre-filled.
// An action that needs the other party's agreement is shown but not executable until A2's NPC decision,
// unless the legacy path decides by itself: a host on trade duty rents rooms, a bank desk lends against a pledge.
function consentPending(ctx,action,fill){
 if(!action.consent)return false;
 if(action.consent.from==='self')return false;// the player is the one acted on: their own consent, nobody else's
 if(action.consent.from==='party')return fill[action.consent.slot]!==undefined&&fill[action.consent.slot]!=='player';
 if(action.id==='core:trade.lodge'&&fill.seller){let schedule=null;try{schedule=npcSchedule(ctx.engine,ctx.s,fill.seller);}catch{schedule=null;}return Boolean(schedule)&&!JSON.stringify(schedule).includes('"trade"');}
 if(action.id==='core:trade.borrow'&&ctx.bank&&fill.seller===ctx.bank.keepers?.[0])return false;
 return true;
}
function actionPermission(ctx,action,slots){
 const runtime=primitiveActionRuntime();
 if(typeof runtime?.actionPermission!=='function'||action.readOnly||action.projection)return null;
 if(action.slots.some(slot=>slot.required&&!slot.consent&&slots[slot.name]===undefined))return null;
 // A3-A7 owns normalization, capacity, custody and legacy restrictions.
 // Missing connectors are visible query failures, never invented denials.
 // /actions already supplies a scoped engine. Use A7's native implementation
 // directly, since the WorldEngine wrapper scopes a root engine once more.
 try{return runtime.actionPermission(ctx.engine,ctx.document,{action:action.id,slots});}
 catch(error){return {allowed:null,error:error.message};}
}
function offer(ctx,action,target){
 const fill={};
 const slots=action.slots.map(slot=>{
  const row={name:slot.name,kind:slot.kind,...(slot.entity?{entity:slot.entity}:{}),...(slot.required?{required:true}:{}),...(slot.consent?{consent:true}:{}),...(slot.default!==undefined?{default:slot.default}:{}),...(slot.presets?{presets:slot.presets}:{})};
  if(slot.fill==='target'&&target)fill[slot.name]=target;
  if(slot.fill==='host'&&ctx.lodging)fill[slot.name]=ctx.lodging.host;
  if(slot.fill==='banker'&&ctx.bank?.keepers?.[0])fill[slot.name]=ctx.bank.keepers[0];
  let choices=typeof slot.options==='string'?options(ctx,slot.options,target):Array.isArray(slot.options)?slot.options.map(v=>({value:v,label:slot.optionLabels?.[v]??CHOICES[v]??v})):null;
  // Entity selectors are a projection of what the player can reach, never an
  // invitation to type a hidden catalogue id. Explicit stock/recipe lists win.
  if(choices===null&&slot.kind==='entity'){
   if(['person','npc','agent'].includes(slot.entity))choices=ctx.people.map(p=>({value:p.id,label:p.name}));
   else if(slot.entity==='item')choices=ctx.inventory.map(i=>({value:i.id,label:`${i.name}×${i.quantity}`}));
   else if(['place','location'].includes(slot.entity))choices=ctx.exits.map(e=>({value:e.id,label:`${e.direction} ${e.name}`}));
   else if(slot.entity==='skill')choices=ctx.skills.map(s=>({value:s.id,label:s.name}));
  }
  // Existing array inputs use only currently reachable people and owned units.
  if(slot.kind==='object'){
   if(['helpers','workers','guests','beneficiaries'].includes(slot.name))choices=ctx.people.map(p=>({value:p.id,label:p.name}));
   else if(slot.name==='skills')choices=ctx.skills.map(s=>({value:s.id,label:s.name}));
   else if(slot.name==='tools')choices=ctx.inventory.map(i=>({value:i.id,label:i.name}));
   else if(slot.name==='instances')choices=ctx.inventory.flatMap(i=>(ctx.s.inventory[i.id]?.instances??[]).filter(id=>ctx.s.itemInstances?.[id]?.owner==='player'&&ctx.s.itemInstances[id].status==='持有').map(id=>({value:id,label:`${i.name}（${id}）`})));
   if(choices!==null)row.multiple=true;
  }
  if(choices)row.options=choices;
  return row;
 });
 const selected={...fill};
 for(const slot of action.slots)if(selected[slot.name]===undefined&&slot.default!==undefined&&slot.default!=='dawn')selected[slot.name]=slot.default;
 const permission=actionPermission(ctx,action,selected);
 for(const slot of slots)if(slot.options&&!slot.multiple)for(const option of slot.options){
  const check=actionPermission(ctx,action,{...selected,[slot.name]:option.value,...option.fill});
  if(check)option.permission=check;
 }
 return {...catalogRow(action),slots,fill,...(action.call?.tool&&slots.some(slot=>slot.kind==='object'&&!slot.multiple)?{inputTool:action.call.tool}:{}),...(permission?{permission}:{}),...(action.ui?.quick?{quick:action.ui.quick}:{}),
  ...(permission?.allowed===false?{blocked:permission.reason}:consentPending(ctx,action,fill)?{blocked:CONSENT_PENDING}:{})};
}
// A keeper's sold-out restock goods and the day the next delivery comes (shop cycle data; L4 何时到货).
function restockNotes(engine,ctx,keeper){
 let shop=null;try{shop=currentShops(engine,ctx.s).find(row=>row.keeper===keeper)??null;}catch{shop=null;}
 if(!shop)return [];
 const today=Math.floor(ctx.s.minute/1440),stock=ctx.s.npcs?.[keeper]?.inventory??{};
 let next=today+1;while((next-shop.firstDay)%shop.cycleDays!==0||next<shop.firstDay)next++;
 return shop.restock.filter(r=>qty(stock[r.item])===0).map(r=>({item:r.item,name:ctx.name(r.item),nextMinute:next*1440,next:engine.calendar(next*1440).text.replace(/ \d\d:\d\d$/,'')}));
}
const kindOf=(ctx,engine,id)=>ctx.present.has(id)?'npc':ctx.inventory.some(r=>r.id===id)?'item':id===ctx.s.location||ctx.exits.some(e=>e.id===id)?'place':null;
// world_actions / /actions：此处可做（无 target）、对某对象可做（target）、按关键词检索（query）。
export function worldActions(engine,document,{target=null,query=null,limit=24,registry=loadActionRegistry()}={}){
 const ctx={...context(engine,document),document};
 let id=null;
 if(target){try{id=engine.resolve(String(target));}catch{id=ctx.people.find(p=>p.name===target)?.id??ctx.inventory.find(r=>r.name===target)?.id??null;}}
 const kind=id?kindOf(ctx,engine,id):null;
 // A globally resolvable name is not evidence of current access. In particular
 // search must not use a remote person's private stock to populate selectors.
 if(!kind)id=null;
 const visible=a=>(a.preconditions??[]).every(c=>holds(ctx,c,id));
 let actions;
 if(query)actions=searchActions(registry,query,{limit,include:['quick','here','target:npc','target:place','target:item','search','llm']}).map(a=>offer(ctx,a,id));
 else if(id)actions=registry.actions.filter(a=>a.visibility.catalog===`target:${kind}`&&visible(a)).map(a=>offer(ctx,a,id));
 else actions=registry.actions.filter(a=>(a.visibility.catalog==='here'||a.visibility.catalog==='quick'||a.ui?.quick)&&visible(a)).map(a=>offer(ctx,a,null));
 const quick=QUICK.map(label=>{const a=registry.actions.find(x=>x.ui?.quick===label);return a?{label,action:a.id,available:visible(a)||a.ui.quick==='交易'}:null;}).filter(Boolean);
 return {location:{id:ctx.s.location,name:ctx.name(ctx.s.location)},...(id?{target:{id,kind,name:ctx.name(id),...(kind==='npc'?{soldOut:restockNotes(engine,ctx,id)}:{})}}:{}),
  scene:sceneLines(engine,document),actions:actions.slice(0,limit),quick,texts:{refused:ctx.templates.effects.refused},
  objects:{people:ctx.people.map(p=>({id:p.id,name:p.name,activity:p.activity,sells:stockOf(ctx,p.id).length>0})),
   exits:ctx.exits.map(e=>{const move=registry.byId?.get('core:move'),permission=move?actionPermission(ctx,move,{destination:e.id,mode:'walk'}):null;return {id:e.id,name:e.name,direction:e.direction,distance:e.relation==='route'?distanceText(e.km,ctx.templates):'',modes:e.modes,...(e.condition?{condition:e.condition}:{}),...(permission?{permission}:{})};}),
   items:ctx.inventory}};
}
export {findAction};
