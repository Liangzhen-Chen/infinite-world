// A1 已应用效果（06 §6.5 第 7 步回执的 applied、08 §8.4）：一次结算前后状态之差，按原语形状列出
// （钱与物的转移、移动、时间、身体、新立的义务）。事件流文字与一致性审查都只读这份列表，
// 叙述因此只能等于引擎实际应用的效果。纯函数，不改状态。
const qty=value=>typeof value==='number'?value:value?.quantity??0;
const stateOf=value=>value?.state??value??{};

function bagDelta(before={},after={}){
 const out=[];
 for(const id of new Set([...Object.keys(before),...Object.keys(after)])){const delta=qty(after[id])-qty(before[id]);if(delta)out.push([id,delta]);}
 return out.sort(([a],[b])=>a.localeCompare(b));
}
// Effects on the player and on every NPC whose purse or bag changed. Order: transfers, move, time, body, obligations.
export function appliedEffects(beforeDocument,afterDocument){
 const b=stateOf(beforeDocument),a=stateOf(afterDocument),effects=[];
 const coin=(holder,delta)=>{if(delta)effects.push({op:'transfer',resource:'coin',holder,delta});};
 const items=(holder,rows)=>{for(const [item,delta]of rows)effects.push({op:'transfer',resource:'item',holder,item,delta});};
 coin('player',(a.player?.coins??0)-(b.player?.coins??0));items('player',bagDelta(b.inventory,a.inventory));
 for(const id of Object.keys(a.npcs??{}).sort()){
  const before=b.npcs?.[id],after=a.npcs[id];if(!before||before===after)continue;
  coin(id,(after.coins??0)-(before.coins??0));items(id,bagDelta(before.inventory,after.inventory));
 }
 if(b.location!==a.location)effects.push({op:'move',holder:'player',from:b.location,to:a.location});
 if((a.minute??0)!==(b.minute??0))effects.push({op:'time',minutes:(a.minute??0)-(b.minute??0),minute:a.minute});
 for(const key of ['hp','mp']){const delta=(a.player?.[key]??0)-(b.player?.[key]??0);if(delta)effects.push({op:'vital',holder:'player',need:key,delta});}
 if(a.player?.status!==b.player?.status)effects.push({op:'status',holder:'player',from:b.player?.status,to:a.player?.status});
 for(const [id,row]of Object.entries(a.records??{}).sort(([x],[y])=>x.localeCompare(y)))
  if(!b.records?.[id]&&['contract','debt','loan'].includes(row?.category??row?.kind))effects.push({op:'obligation.create',id,category:row.category??row.kind,...(row.amount!==undefined?{amount:row.amount}:{}),...(row.expires!==undefined?{expires:row.expires}:{})});
 return effects;
}
// The player's own net money and goods in a list of effects (what a narration may claim the player paid or got).
export function playerLedger(effects){
 const coins=effects.filter(e=>e.op==='transfer'&&e.resource==='coin'&&e.holder==='player').reduce((n,e)=>n+e.delta,0);
 const items={};for(const e of effects)if(e.op==='transfer'&&e.resource==='item'&&e.holder==='player')items[e.item]=(items[e.item]??0)+e.delta;
 return {coins,items};
}
