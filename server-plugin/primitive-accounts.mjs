// L1 endpoint adapter shared by open bounds, adjudication and execution. Entity
// resolution establishes identity/visibility; this adapter only selects books.
import {accountKey,parseAccount,resourceKey,LEDGER_COIN,isSource,isSink} from './ledger.mjs';
import {partyAccount} from './money.mjs';
import {bag,store,settlementStock,stockItem,itemResource} from './stock.mjs';
import {actorId} from './npc-state.mjs';
import {groupAccountView} from './group-account.mjs';
import {reject} from './primitive-policy.mjs';

const self=new Set(['self','me','myself','i','我','自己','本人','自身','$actor']);
const person=(state,id)=>id==='player'||Object.hasOwn(state.npcs??{},id)||Object.hasOwn(state.creatures??{},id)||state.records?.[`protocol_assets:${id}`]?.category==='protocol_assets';
const group=(engine,state,id)=>groupAccountView(engine,state,id)||state.records?.[`organization:${id}`]?.category==='organization';
export function primitiveResourceItem(engine,resource){
 return engine.world.items.find(item=>itemResource(engine,item.id)===resource)?.id??null;
}
export function resolvePrimitiveTransfer(engine,document,effect,{actor='player'}={}){
 if(effect.op!=='transfer')return effect;
 const explicit={};
 for(const field of ['from','to'])if(typeof effect[field]==='string'&&effect[field].includes('|')){
  try{explicit[field]=parseAccount(effect[field]);}catch(error){reject('E-TRANSFER-ACCOUNT',error.message);}
 }
 // The individuation sink is one account family for every herd: a generic
 // "population" sink resource takes the herd account's own species resource.
 if(explicit.to?.owner==='sink:individuated'&&explicit.to.resource==='population'&&explicit.from?.resource?.startsWith('population_')){explicit.to={...explicit.to,resource:explicit.from.resource};effect={...effect,to:`sink:individuated|${explicit.from.resource}|${explicit.to.purpose}`};}
 let resource;
 try{resource=resourceKey(effect.resource===undefined?explicit.from?.resource??explicit.to?.resource:effect.resource==='coin'?LEDGER_COIN:itemResource(engine,effect.resource));}
 catch{reject('E-TRANSFER-RESOURCE','实体转移须指定有效资源，或由完整账户键提供资源');}
 if(Object.values(explicit).some(account=>account.resource!==resource))reject('E-TRANSFER-ENDPOINT','转移资源与两端账户资源必须一致');
 const state=document.state;
 const endpoint=field=>{
  const account=explicit[field],raw=account?.owner??effect[field];
  if(typeof raw!=='string'||!raw)reject('E-TRANSFER-ACCOUNT',`转移 ${field} 缺少实体或账户`);
  const id=actorId(engine.world,self.has(raw.trim().normalize('NFKC').toLowerCase())?actor:raw);
  // Explicit purposes remain explicit: escrow, source/sink permissions and
  // unsupported projections are still checked by their existing protocols.
  if(account)return accountKey(id,resource,account.purpose);
  if(isSource(id)||isSink(id))return accountKey(id,resource,'action');
  if(person(state,id))return resource===LEDGER_COIN?partyAccount(engine,state,id):bag(engine,id,resource);
  if(state.settlements?.[id]){
   if(resource===LEDGER_COIN)return partyAccount(engine,state,id);
   const stock=['food','wood','stone','iron'].find(name=>itemResource(engine,stockItem(engine,name))===resource);
   if(stock)return settlementStock(engine,id,stock);
   reject('E-TRANSFER-ACCOUNT',`聚落 ${id} 没有资源 ${resource} 的公仓用途`);
  }
  if(group(engine,state,id))return resource===LEDGER_COIN?partyAccount(engine,state,id):store(engine,id,resource);
  if(state.records?.[id]?.category==='bank'||engine.rules.economy?.credit?.banks?.some(bank=>bank.id===id))return accountKey(id,resource,'vault');
  reject('E-TRANSFER-ACCOUNT',`实体 ${id} 没有可用于 ${resource} 转移的账户；地点或设施须指定已登记的账户用途`);
 };
 return {...effect,...(effect.resource===undefined?{}:{resource}),from:endpoint('from'),to:endpoint('to')};
}

// Only projections already represented by the stock adapter are writable here.
// Managed food retains its agricultural batch/capacity protocol.
export function primitiveStockProjection(engine,state,key){
 const account=parseAccount(key),{owner,resource,purpose}=account,item=primitiveResourceItem(engine,resource);
 if(!item)reject('E-TRANSFER-RESOURCE',`未登记可转移物品资源：${resource}`);
 if(purpose==='inventory'&&person(state,owner))return {item,path:[...engine.bagPath(owner),item],inventory:true};
 if(purpose==='store'&&!state.settlements?.[owner]&&group(engine,state,owner)){
  const shared=groupAccountView(engine,state,owner);
  return {item,path:['state','records',`${shared?'faction-assets':'organization'}:${owner}`,'items',item],group:shared?owner:null};
 }
 if(state.settlements?.[owner]){
  const stock=['food','wood','stone','iron'].find(name=>settlementStock(engine,owner,name)===key);
  if(stock){
   if(stock==='food'&&state.records?.[`agriculture:${owner}`]?.mode==='managed')reject('E-TRANSFER-PROJECTION','托管粮仓须通过农事提粮或交粮协议保留批次、保质期与容量');
   return {item,path:['state','settlements',owner,stock],...(stock==='food'?{lot:{id:'stock',day:null,expiresDay:null,kind:null}}:{})};
  }
 }
 reject('E-TRANSFER-PROJECTION',`账户用途 ${purpose} 须通过对应资源协议转移`);
}
