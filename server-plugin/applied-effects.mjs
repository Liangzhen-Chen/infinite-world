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
// Effects on the player and on every NPC whose purse or bag changed. Order: transfers, move, time, body, obligations,
// then growth (experience, level), wear on carried gear, and what happened to the one the action was aimed at.
// `result` is the engine's receipt for the action: its `target` names who was acted on (a fight's opponent, a spell's subject),
// whose hit points, status and corpse are listed too; nobody else's body is, so time passing never floods the list.
export function appliedEffects(beforeDocument,afterDocument,{result=null}={}){
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
 growthEffects(b,a,effects,result);
 wearEffects(b,a,effects);
 targetEffects(b,a,effects,result);
 return effects;
}
function growthEffects(b,a,effects,result){
 const level=[b.player?.level,a.player?.level];
 let xp=(a.player?.xp??0)-(b.player?.xp??0);
 // Experience restarts from the remainder at a level-up, so the receipt's own gain is the amount applied then.
 if(level[0]!==level[1]&&Number.isFinite(result?.experience))xp=result.experience;
 if(xp)effects.push({op:'xp',holder:'player',delta:xp});
 if(level[0]!==undefined&&level[1]!==undefined&&level[0]!==level[1])effects.push({op:'level',holder:'player',from:level[0],to:level[1]});
}
// Durability of gear the player carries, before and after (a blade dulls by the stroke).
function wearEffects(b,a,effects){
 for(const id of Object.keys(a.inventory??{}).sort()){
  const was=b.inventory?.[id]?.durability,now=a.inventory[id]?.durability;
  if(Number.isFinite(was)&&Number.isFinite(now)&&was!==now)effects.push({op:'durability',holder:'player',item:id,from:was,to:now});
 }
}
function targetEffects(b,a,effects,result){
 const id=typeof result?.target==='string'?result.target:null;
 if(!id)return;
 const before=b.creatures?.[id]??b.npcs?.[id],after=a.creatures?.[id]??a.npcs?.[id];
 if(!before||!after||before===after)return;
 const hp=(after.hp??0)-(before.hp??0);if(hp)effects.push({op:'vital',holder:id,need:'hp',delta:hp});
 if(after.status!==before.status)effects.push({op:'status',holder:id,from:before.status,to:after.status});
 if(after.corpse&&!before.corpse)effects.push({op:'corpse',holder:id,items:(after.corpse.items??[]).map(row=>({item:row.item,amount:row.amount??1}))});
}
// The player's own net money and goods in a list of effects (what a narration may claim the player paid or got).
export function playerLedger(effects){
 const coins=effects.filter(e=>e.op==='transfer'&&e.resource==='coin'&&e.holder==='player').reduce((n,e)=>n+e.delta,0);
 const items={};for(const e of effects)if(e.op==='transfer'&&e.resource==='item'&&e.holder==='player')items[e.item]=(items[e.item]??0)+e.delta;
 return {coins,items};
}
