// Safe carry load (数值方案 §2.4 attr.carry): a body-derived limit, never stored.
// base = table.base + table.perStrength * strength; the 'body:carry' derived slot
// may add temporary modifiers on top, but never past the table's own ceiling
// (bounds.base[1] + bounds.perStrength[1] * strength). Helpers (companions,
// hired hands, a ridden mount) share a load only when it exceeds the body's own limit.
import attributeBalance from '../world/rules/tables/balance/attributes.json' with {type:'json'};
import {derived} from './derived.mjs';
import {currentEmployment} from './employment-state.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {reject} from './action-rejection.mjs';

const EPS=1e-9,DOWN=['濒死','昏迷','失能','死亡'];
const table=engine=>(engine.world.balance?.attributes??attributeBalance).params.find(r=>r.id==='attr.carry');
const round=n=>Math.round(n*1000)/1000;
function strengthOf(engine,state,actor){
 const row=actor==='player'?state.player:state.npcs?.[actor],base=state.created?.[actor]??engine.byId.get(actor);
 return row?.attributes?.力量??base?.attributes?.力量??attributeBalance.params.find(r=>r.id==='attr.initial').value.base;
}
export function safeCarryKg(d,engine,actor='player'){
 const {value,bounds}=table(engine),strength=strengthOf(engine,d.get('state'),actor);
 const base=value.base+value.perStrength*strength,ceiling=bounds.base[1]+bounds.perStrength[1]*strength;
 return Math.min(ceiling,Math.max(0,derived(engine,d.document,'body:carry',actor,{base})));
}
export function carriedKg(d,engine,actor='player'){
 let kg=0;
 for(const [item,held] of Object.entries(d.get(...engine.bagPath(actor))??{})){
  const object=held&&typeof held==='object',quantity=object?held.quantity??0:held;
  kg+=quantity*((object?held.weight:undefined)??engine.byId.get(item)?.weight??0);
 }
 return kg;
}
const spare=(d,engine,actor)=>Math.max(0,safeCarryKg(d,engine,actor)-carriedKg(d,engine,actor));
// Real, already-consenting helpers only: followers who are not captives, the player's
// current hired hands, and the mount the player is riding.
export function carryHelpers(d,engine){
 const s=d.get('state'),here=s.location,out=[];
 const captives=new Set(Object.values(s.records??{}).filter(r=>r?.captive?.by==='player').map(r=>r.subject));
 const ids=new Set(s.player?.companions??[]);
 for(const [id,npc] of Object.entries(s.npcs??{}))if(npc.location===here&&currentEmployment(s,id)?.parties?.includes('player'))ids.add(id);
 for(const id of ids){
  const npc=s.npcs?.[id];
  if(!npc||npc.location!==here||captives.has(id)||DOWN.includes(npc.status)||isPhysicallyDead(engine,d,id))continue;
  const kg=spare(d,engine,id);if(kg>0)out.push({id,kind:'helper',name:engine.byId.get(id)?.name??id,kg});
 }
 const mount=s.player?.mount,animal=mount&&s.creatures?.[mount],definition=mount&&engine.byId.get(mount);
 const rule=definition?.tamingRule??(definition?.monster?engine.byId.get(definition.monster)?.tamingRule:undefined);
 if(animal&&rule&&animal.location===here&&animal.hp>0){
  const kg=Math.max(0,rule.carryKg-rule.riderWeightKg);if(kg>0)out.push({id:mount,kind:'mount',name:definition?.name??mount,kg});
 }
 return out;
}
// Throws a rejection with the shortfall; a no-op for anyone but the player and for loads that fit.
export function assertCanCarry(d,engine,actor,addKg,label=''){
 if(actor!=='player'||!(addKg>EPS))return;
 const own=safeCarryKg(d,engine,actor),load=carriedKg(d,engine,actor),after=load+addKg;
 if(after<=own+EPS)return;
 const helpers=carryHelpers(d,engine),shared=helpers.reduce((sum,h)=>sum+h.kg,0);
 if(after<=own+shared+EPS)return;
 const over=round(after-own-shared);
 reject('E-ACTION-PRECONDITION',`拿不动：${label}${round(addKg)}公斤，加上身上已有的${round(load)}公斤共${round(after)}公斤，超出你的安全负重${round(own)}公斤${shared>0?`（同行搭手另可分担${round(shared)}公斤）`:''}，还差${over}公斤`,{
  missing:[`还差${over}公斤的承载力`],
  repair:['先放下或存放一些随身物品','请同行同伴或雇工搭手（须在身边且自己还有余力）','借坐骑驮运'],
 });
}
// Read-only view for the personal sheet: derived on every read, never saved.
export function carryLoad(engine,document){
 const d={document,get:(...path)=>path.reduce((v,k)=>v?.[k],document)};
 const safeKg=safeCarryKg(d,engine),load=carriedKg(d,engine);
 return {safeKg:round(safeKg),carriedKg:round(load),spareKg:round(Math.max(0,safeKg-load)),helperKg:round(carryHelpers(d,engine).reduce((sum,h)=>sum+h.kg,0))};
}
