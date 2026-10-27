import {recordsWhere} from './storage.mjs';
import {createHash} from 'node:crypto';
import {weatherAt} from './weather.mjs';
import {facilityRuntime} from './facility-state.mjs';
import {assertEffect,applyEffect,clockTransaction,assertEffectTable} from './effects.mjs';
export {clockTransaction};

const DAY=1440,path=id=>['state','records',`world-clock:${id}`];
// Rolls are keyed by campaign, clock and absolute tick. Tool IDs and the number
// of calls never change the random stream or weather's own seeded sequence.
export function clockRoll(seed,id,day){return createHash('sha256').update(JSON.stringify([seed,id,day])).digest().readUInt32LE(0)/2**32;}
// K6: stage effects are validated and applied by the unified effect table.
export function assertClockEffect(engine,effect){return assertEffect(engine,effect,'world');}
export function applyClockEffect(d,engine,effect,context){return applyEffect(d,engine,effect,context,'world');}
function condition(d,engine,c,rule,at,clock){
 const state=d.get('state'),farm=state.records?.[`agriculture:${rule.settlement}`],year=Math.floor(at/DAY/360);
 switch(c.kind){
 case 'managed_granary':return {met:farm?.mode==='managed',evidence:`agriculture:${rule.settlement}`};
 case 'delivered_trade':{
  const events=Object.entries(state.records??{}).filter(([,r])=>r.category==='settlement_trade'&&r.deliveredFood>0&&
   [r.seller,r.buyer].includes(rule.settlement)&&Math.floor(r.dispatchAt/DAY/360)===year&&r.entries?.some(e=>e.phase==='arrival'&&e.minute<=at)).map(([id])=>id);
  return {met:events.length>=c.minimum,value:events.length,evidence:events};
 }
 case 'harvest':{const value=(farm?.ledger?.harvested??0)-(clock.harvestBaseline??0);return {met:value>=c.minimum,value,evidence:`agriculture:${rule.settlement}`};}
 case 'wildlife_population':{
  const value=state.records?.[`ecology:${c.habitat}`]?.populations?.[c.species]?.count;
  return {met:Number.isFinite(value)&&value>=c.minimum,value:value??null,evidence:`ecology:${c.habitat}`};
 }
 case 'weather':{const w=weatherAt(engine,d.document.randomSeed,rule.settlement,at);return {met:w?.kind===c.kindIs,value:w?.kind??null,evidence:'seeded-weather'};}
 default:throw Error(`世界时钟不支持触发条件：${c.kind}`);
 }
}
export function assertWorldClockRules(engine){
 assertEffectTable(engine);
 const rules=engine.rules.worldClock;if(!rules)return;
 const ids=new Set();if(rules.version!==1||!Array.isArray(rules.clocks))throw Error('世界时钟规则版本无效');
 for(const r of rules.clocks){
  if(!r.id||ids.has(r.id)||!r.source||!engine.world.locations.some(l=>l.id===r.settlement)||
   !engine.world.cultures?.some(c=>c.id===r.culture)||!engine.world.factions?.some(f=>f.id===r.faction)||
   !Number.isSafeInteger(r.intervalDays)||r.intervalDays<1||!Number.isFinite(r.probability)||r.probability<0||r.probability>1||
   r.cycle!=='year'||!r.stages?.length)throw Error('世界时钟来源、周期或概率无效');
  ids.add(r.id);
  for(const s of r.stages){
   if(!['managed_granary','delivered_trade','harvest','wildlife_population','weather'].includes(s.condition?.kind))throw Error('世界时钟未知条件，拒绝推进');
   if(['delivered_trade','harvest','wildlife_population'].includes(s.condition.kind)&&(!Number.isSafeInteger(s.condition.minimum)||s.condition.minimum<1))throw Error('世界时钟条件阈值无效');
   assertClockEffect(engine,s.effect);
  }
 }
}
export function initializeWorldClocks(d,engine,minute,end=minute){
 assertWorldClockRules(engine);
 for(const r of engine.rules.worldClock?.clocks??[])if(!d.get(...path(r.id))){
  const day=Math.floor(minute/DAY),nextDay=(Math.floor(day/r.intervalDays)+1)*r.intervalDays;
  if(nextDay*DAY>end)continue;
  d.set(path(r.id),{category:'world_clock',id:r.id,phase:0,year:Math.floor(day/360)+1,initializedAt:nextDay*DAY,nextAt:nextDay*DAY,history:[]});
 }
}
// Public price evidence is visible at the existing granary counter. Neither
// distant phase state nor a faction's private plan is included in scene facts.
export function worldClockScene(engine,document){
 const profile=engine.rules.agriculture?.settlements.find(p=>p.counter===document.state.location);
 if(!profile)return '';
 const item=engine.rules.settlementTrade?.item;if(!item)return '';
 const quote=facilityRuntime().currentTradeQuote(engine,document,{item,location:profile.settlement});
 return `本日登记粮价：${engine.byId.get(item)?.name??item}每份${quote.listPrice}铜；按现有余粮和路线核价。`;
}
export function nextWorldClockMinute(state,now){return Math.min(Infinity,...recordsWhere(state.records,'category','world_clock').filter(r=>r.category==='world_clock'&&r.nextAt>now).map(r=>r.nextAt));}
export function advanceWorldClocks(d,engine,at){
 for(const r of engine.rules.worldClock?.clocks??[]){
  let row=d.get(...path(r.id));if(!row)continue;
  if(row.nextAt<at)throw Error('世界时钟越过未处理的日期');
  if(row.nextAt!==at)continue;
  const year=Math.floor(at/DAY/360)+1;
  const harvested=d.get('state','records',`agriculture:${r.settlement}`,'ledger','harvested')??0;
  row={...row,phase:row.year===year?row.phase:0,harvestBaseline:row.year===year?row.harvestBaseline??harvested:harvested,year,nextAt:at+r.intervalDays*DAY,lastAt:at};
  const stage=r.stages[row.phase];
  if(stage){
   const trigger=condition(d,engine,stage.condition,r,at,row),roll=clockRoll(d.document.randomSeed,r.id,at/DAY);
   if(trigger.met&&roll<r.probability){
    const sourceEvent=`world-clock:${r.id}:${at}`;
    const effect=clockTransaction(d,tx=>applyClockEffect(tx,engine,stage.effect,{settlement:r.settlement,faction:r.faction,minute:at,sourceEvent}));
    if(effect.applied)row={...row,phase:row.phase+1,history:[...row.history,{minute:at,phase:row.phase+1,name:stage.name,trigger,roll,sourceEvent,effect:{...stage.effect,...effect}}]};
   }
   row.lastTrigger=trigger;row.lastRoll=roll;
  }
  d.set(path(r.id),row);
 }
}
