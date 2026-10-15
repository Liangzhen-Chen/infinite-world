import {ensureGroupAccount} from './group-account.mjs';
import {groupRepresentative,personView} from './entity-view.mjs';
import {standingLedger} from './standing.mjs';
import {templeById} from './faith-catalog.mjs';
import {factionRelations} from './reputation-registry.mjs';
import {clockRoll,clockTransaction} from './world-clock.mjs';
import {registerEffect,assertEffect as assertTableEffect,applyEffect as applyTableEffect,hookedEffects} from './effects.mjs';

const DAY=1440,accountPath=id=>['state','records',`faction-assets:${id}`],clockPath=id=>['state','records',`faction-clock:${id}`];
const uint=n=>Number.isSafeInteger(n)&&n>=0;
// B4/B5 may publish runtime stages on the faction's clock or in rules.
// Existing trigger/stageEffects prose is deliberately not an executable plan.
export function factionClockRules(engine){
 if(engine.replaying&&engine.replayResult?.factionClockVersion!==1)return [];
 const configured=engine.rules.factionClock;
 if(configured&&(configured.version!==1||!Array.isArray(configured.clocks)))throw Error('势力时钟规则版本无效');
 return [...configured?.clocks??[],...(engine.world.factions??[]).filter(f=>f.clock?.stages).map(f=>({...f.clock,faction:f.id}))];
}
function faction(engine,id){
 const t=String(id).startsWith('temple:')?templeById(engine,id):null;
 const f=engine.world.factions?.find(f=>f.id===id)??(t?{id:t.id,name:t.name,leader:t.teacher,contactAnchor:t.seat,resources:{treasuryCopper:0,items:{}}}:null);
 if(!f)throw Error(`未登记势力：${id}`);return f;
}
function assertCost(engine,cost={}){
 if(!cost||typeof cost!=='object'||Array.isArray(cost)||Object.keys(cost).some(k=>!['coins','items'].includes(k))||
  cost.items!==undefined&&(!cost.items||typeof cost.items!=='object'||Array.isArray(cost.items))||
  !uint(cost.coins??0)||Object.entries(cost.items??{}).some(([id,n])=>!engine.world.items.some(i=>i.id===id)||!uint(n)))throw Error('势力资源代价无效');
}
// K6: relation/dispute/trade are faction-only kinds in the unified effect table;
// engine.factionEffectConsumers and the shared kinds resolve through it too.
function assertEffect(engine,effect){return assertTableEffect(engine,effect,'faction');}
const effects=stage=>stage.effects??[stage.effect];
// D1: commissions a stage posts (U17 quest_post) are quest-source data in
// rules.questSources.commissions, kept apart from the K6 effect table.
const commissions=(engine,owner,stage)=>(engine.rules.questSources?.commissions??[]).filter(c=>c.owner===owner&&c.stage===stage).flatMap(c=>c.effects);
const stageEffects=(engine,rule,stage)=>[...effects(stage),...hookedEffects(engine,'faction',rule.id,stage.id),...commissions(engine,rule.id,stage.id)];
export function assertFactionClockRules(engine){
 const ids=new Set();
 for(const rule of factionClockRules(engine)){
  const f=faction(engine,rule.faction);
  if(!rule.id||ids.has(rule.id)||!rule.source||!engine.world.locations.some(l=>l.id===rule.settlement)||
   ![1,7,30].includes(rule.intervalDays)||!Number.isFinite(rule.probability)||rule.probability<0||rule.probability>1||
   !['once','year'].includes(rule.cycle??'once')||!Array.isArray(rule.stages)||!rule.stages.length)throw Error('势力时钟来源、地点或日周周期无效');
  ids.add(rule.id);assertCost(engine,{coins:f.resources?.treasuryCopper,items:f.resources?.items});
  if(!uint(f.resources?.treasuryCopper))throw Error('势力初始公库未登记');
  const stageIds=new Set();
  for(const stage of rule.stages){
   if(!stage.id||stageIds.has(stage.id))throw Error('势力阶段编号缺失或重复');stageIds.add(stage.id);
   const c=stage.condition;
   if(!['always','asset','relation','dispute','record','intervention','motion'].includes(c?.kind))throw Error('势力阶段条件未实现');
   if(c.kind==='motion'&&(typeof c.id!=='string'||!c.id.startsWith('society_motion:')||c.statuses!==undefined&&(!Array.isArray(c.statuses)||!c.statuses.length||c.statuses.some(v=>!['议事中','通过','否决'].includes(v)))))throw Error('议题阶段条件无效');
   if(c.kind==='asset')assertCost(engine,c.minimum);
   if(c.kind==='relation'){faction(engine,c.target);if(!Number.isSafeInteger(c.minimum)||Math.abs(c.minimum)>100)throw Error('势力关系阈值无效');}
   if(c.kind==='dispute'){faction(engine,c.target);if(!c.id||!['open','settled','escalated'].includes(c.status))throw Error('势力争端条件无效');}
   if(['record','intervention'].includes(c.kind)&&(!c.id||c.kind==='record'&&(!c.field||!['string','boolean','number'].includes(typeof c.equals))))throw Error('势力阶段证据条件无效');
   assertCost(engine,stage.cost);
   if(!effects(stage).length)throw Error('势力阶段缺少效果');
   for(const effect of stageEffects(engine,rule,stage)){if(effect.target===rule.faction&&['trade','relation','dispute'].includes(effect.kind))throw Error('势力效果不能以自身为对手');assertEffect(engine,effect);}
  }
  for(const action of rule.interventions??[]){
   if(!action.id||!engine.world.locations.some(l=>l.id===action.location)||!Number.isSafeInteger(action.minutes)||action.minutes<1||action.minutes>1440||
    !['pause','resume','redirect'].includes(action.effect)||!stageIds.has(action.stage)||action.effect==='redirect'&&!stageIds.has(action.nextStage))throw Error('势力干预参数无效');
   if(action.difficulty!==undefined&&(!Number.isSafeInteger(action.difficulty)||action.difficulty<1||!['力量','敏捷','体质','智力','精神','魅力'].includes(action.attribute)))throw Error('势力干预检定无效');
   if(action.representative&&![f.leader,...f.coreMembers??[]].includes(action.representative))throw Error('势力干预代表不属于该组织');
   assertCost(engine,action.cost);
  }
  // A contact without a representative is the faction's registration point
  // (contactAnchor): enquiries and contributions are lodged, nobody is summoned.
  if(rule.contact&&(!engine.world.locations.some(l=>l.id===rule.contact.location)||rule.contact.representative!==undefined&&![f.leader,...f.coreMembers??[]].includes(rule.contact.representative)))throw Error('势力供资接点未登记代表');
 }
 const published=factionClockRules(engine);// Hooks for clocks absent from this world stay inert.
 for(const h of published.length?engine.rules.effectTable?.hooks??[]:[])if(h.source==='faction'&&published.some(r=>r.id===h.owner&&!r.stages.some(s=>s.id===h.stage)))throw Error(`效果挂接的势力时钟阶段未登记：${h.owner}`);
 for(const c of published.length?engine.rules.questSources?.commissions??[]:[]){
  if(!Array.isArray(c.effects)||!c.effects.length||c.effects.some(e=>e.kind!=='quest_post'))throw Error(`势力委托只能登记 quest_post：${c.owner}`);
  if(published.some(r=>r.id===c.owner&&!r.stages.some(s=>s.id===c.stage)))throw Error(`势力委托的时钟阶段未登记：${c.owner}`);
 }
}
function ensureAccount(d,engine,id){
 if(!d.get(...accountPath(id))){
  const f=faction(engine,id);assertCost(engine,{coins:f.resources?.treasuryCopper,items:f.resources?.items});
  if(!uint(f.resources?.treasuryCopper))throw Error('势力初始公库未登记');
 }
 return ensureGroupAccount(d,engine,id);
}
function affordable(row,cost={}){return row.coins>=(cost.coins??0)&&Object.entries(cost.items??{}).every(([id,n])=>(row.items[id]??0)>=n);}
function changeAssets(d,engine,id,cost,sign,event){
 const row=ensureAccount(d,engine,id),items={...row.items};
 for(const [item,n]of Object.entries(cost.items??{}))items[item]=(items[item]??0)+sign*n;
 const coins=row.coins+sign*(cost.coins??0);if(!uint(coins)||Object.values(items).some(n=>!uint(n)))throw Error('势力资源不足或溢出');
 d.set(accountPath(id),{...row,coins,items,ledger:[...row.ledger,{...event,coins:sign*(cost.coins??0),items:Object.fromEntries(Object.entries(cost.items??{}).map(([id,n])=>[id,sign*n]))}]});
}
// Used by effect consumers that carry their own outcome price.
export function spendFactionAssets(d,engine,id,cost,event){
 assertCost(engine,cost);const row=ensureAccount(d,engine,id);if(!affordable(row,cost))return false;
 changeAssets(d,engine,id,cost,-1,event);return true;
}
// U17: an unpaid commission's escrow goes back to the faction treasury.
export function creditFactionAssets(d,engine,id,cost,event){assertCost(engine,cost);changeAssets(d,engine,id,cost,1,event);}
export function initializeFactionClocks(d,engine,minute,end=minute){
 assertFactionClockRules(engine);
 for(const rule of factionClockRules(engine))if(!d.get(...clockPath(rule.id))){
  if(rule.triggerRecord&&!d.get('state','records',rule.triggerRecord,'active'))continue;
  const nextAt=(Math.floor(minute/DAY/rule.intervalDays)+1)*rule.intervalDays*DAY;if(nextAt>end)continue;
  ensureAccount(d,engine,rule.faction);
  d.set(clockPath(rule.id),{category:'faction_clock',id:rule.id,faction:rule.faction,phase:0,year:Math.floor(minute/DAY/360)+1,initializedAt:nextAt,nextAt,paused:false,history:[],interventions:[]});
 }
}
export function nextFactionClockMinute(state,now){return Math.min(Infinity,...Object.values(state.records??{}).filter(r=>r.category==='faction_clock'&&r.nextAt>now).map(r=>r.nextAt));}
function condition(d,rule,clock,assets){
 const c=rule.stages[clock.phase].condition;
 switch(c.kind){
 case 'always':return true;
 case 'asset':return affordable(assets,c.minimum);
 case 'relation':return (assets.relations[c.target]??0)+(standingLedger(d.get('state'),rule.faction,c.target)?.value??0)>=c.minimum;
 case 'dispute':return assets.disputes[`${c.target}:${c.id}`]?.status===c.status;
 case 'record':return d.get('state','records',c.id,c.field)===c.equals;
 case 'intervention':return clock.interventions.some(e=>e.choice===c.id&&e.success);
 case 'motion':return (c.statuses??['通过','否决']).includes(d.get('state','records',c.id,'status'));
 }
}
function applyEffect(d,engine,effect,context){
 const result=applyTableEffect(d,engine,effect,context,'faction');
 if(!result||typeof result.applied!=='boolean')throw Error(`势力效果缺少 applied 回执：${effect.kind}`);
 return result;
}
const owned=(engine,effect)=>faction(engine,effect.target);
import {assessTradeTax} from './finance-tax.mjs';
registerEffect('trade',{sources:['faction'],
 validate(engine,effect){owned(engine,effect);if(!engine.world.items.some(i=>i.id===effect.item)||!Number.isSafeInteger(effect.quantity)||effect.quantity<1||!uint(effect.unitPrice))throw Error('势力交易参数无效');},
 apply(d,engine,effect,{faction:owner,sourceEvent,minute}){
  const seller=ensureAccount(d,engine,owner),buyer=ensureAccount(d,engine,effect.target),payment=effect.quantity*effect.unitPrice;
  if(!uint(payment))throw Error('势力交易金额溢出');
  if(!affordable(seller,{items:{[effect.item]:effect.quantity}})||!affordable(buyer,{coins:payment}))return {applied:false,reason:'交易对手资金或卖方库存不足'};
  const event={sourceEvent,minute,kind:'trade',counterparty:effect.target};
  changeAssets(d,engine,owner,{items:{[effect.item]:effect.quantity}},-1,event);changeAssets(d,engine,effect.target,{items:{[effect.item]:effect.quantity}},1,{...event,counterparty:owner});
  changeAssets(d,engine,effect.target,{coins:payment},-1,{...event,counterparty:owner});changeAssets(d,engine,owner,{coins:payment},1,event);
  const location=faction(engine,owner).contactAnchor;
  if(location)assessTradeTax(d,engine,{seller:owner,cost:payment,location,sourceEvent});
  return {applied:true,...effect,payment};
 }});
registerEffect('relation',{sources:['faction'],
 validate(engine,effect){owned(engine,effect);if(!Number.isSafeInteger(effect.delta)||Math.abs(effect.delta)>100)throw Error('势力关系变化无效');},
 apply(d,engine,effect,{faction:owner}){
  const account=ensureAccount(d,engine,owner),score=Math.max(-100,Math.min(100,(account.relations[effect.target]??0)+effect.delta));
  d.set(accountPath(owner),{...account,relations:{...account.relations,[effect.target]:score}});
  return {applied:true,...effect,score};
 }});
registerEffect('dispute',{sources:['faction'],
 validate(engine,effect){owned(engine,effect);if(!effect.id||!['open','settled','escalated'].includes(effect.status))throw Error('势力争端阶段无效');},
 apply(d,engine,effect,{faction:owner,sourceEvent,minute}){
  const account=ensureAccount(d,engine,owner),key=`${effect.target}:${effect.id}`;
  d.set(accountPath(owner),{...account,disputes:{...account.disputes,[key]:{status:effect.status,sourceEvent,minute}}});
  return {applied:true,...effect};
 }});
export function advanceFactionClocks(d,engine,at){
 for(const rule of factionClockRules(engine)){
  let row=d.get(...clockPath(rule.id));if(!row)continue;
  if(row.nextAt<at)throw Error('势力时钟越过未处理的日期');if(row.nextAt!==at)continue;
  const year=Math.floor(at/DAY/360)+1;
  row={...row,nextAt:at+rule.intervalDays*DAY,lastAt:at,...(rule.cycle==='year'&&row.year!==year?{phase:0,paused:false,interventions:[]}:{}),year};
  const stage=rule.stages[row.phase],roll=clockRoll(d.document.randomSeed,rule.id,at/DAY);row.lastRoll=roll;
  if(stage&&!row.paused){
   const assets=ensureAccount(d,engine,rule.faction),met=condition(d,rule,row,assets);row.lastCondition=met;
   if(met&&roll<rule.probability){
    const sourceEvent=`faction-clock:${rule.id}:${at}`,context={faction:rule.faction,settlement:rule.settlement,minute:at,sourceEvent,scope:'regional',stage:stage.id};
    const receipt=clockTransaction(d,tx=>{
     if(!affordable(assets,stage.cost))return {applied:false,reason:'阶段资源不足'};
     changeAssets(tx,engine,rule.faction,stage.cost??{},-1,{sourceEvent,minute:at,kind:'stage_cost',stage:stage.id});
     const results=[];
     for(const effect of stageEffects(engine,rule,stage)){const result=applyEffect(tx,engine,effect,context);if(!result.applied)return result;results.push(result);}
     return {applied:true,effects:results};
    });
    row.blocked=receipt.applied?null:receipt.reason??'效果条件未满足';
    if(receipt.applied){
     const event={category:'faction_event',...context,name:stage.name??stage.id,cost:stage.cost??{},effects:receipt.effects};
     d.set(['state','records',sourceEvent],event);
     row={...row,phase:row.phase+1,history:[...row.history,event]};
    }
   }
  }
  d.set(clockPath(rule.id),row);
 }
}
function requireContact(d,engine,contact,faction){
 if(!contact||d.get('state','location')!==contact.location)throw Error('势力操作需要到登记地点');
 if(contact.representative){
  const id=groupRepresentative(engine,d.get('state'),faction,contact.representative),view=id&&personView(engine,d.get('state'),id),actor=view&&d.get(...view.actorPath.value);
  if(!actor||actor.location!==contact.location||actor.scheduleTravel||actor.cognitionTravel||actor.status!=='正常'||/睡眠|睡觉|熟睡/.test(actor.activity??''))throw Error('势力代表未清醒在场');
  engine.assertNpcObligationAction(d,[id],{minutes:contact.minutes??0});
 }
}
export function factionClockAction(d,args,eventId){
 assertFactionClockRules(this);
 // Naming the faction is enough when it publishes a single clock.
 const owner=args.faction?this.resolve(args.faction,'faction'):null,rules=factionClockRules(this).filter(r=>(args.clock===undefined||r.id===args.clock)&&(!owner||r.faction===owner));
 const rule=args.clock!==undefined||owner&&rules.length===1?rules[0]:undefined;
 if(!rule)throw Error('没有已发布的可执行势力时钟');
 const before=d.get('state','minute');initializeFactionClocks(d,this,before,before+rule.intervalDays*DAY);
 const row=d.get(...clockPath(rule.id));
 if(!row){
  if(args.operation!=='faction_inspect')throw Error('教派尚无实际争夺，时钟未启动');
  requireContact(d,this,rule.contact,rule.faction);return {faction:rule.faction,clock:rule.id,phase:0,dormant:true,choices:[]};
 }
 const stage=rule.stages[row.phase];
 if(args.operation==='faction_inspect'){
  requireContact(d,this,rule.contact,rule.faction);
  const assets=ensureAccount(d,this,rule.faction);
  return {faction:rule.faction,clock:rule.id,phase:row.phase,paused:row.paused,treasury:assets.coins,items:assets.items,...(stage?.name?{stage:stage.name}:{}),choices:(rule.interventions??[]).filter(a=>a.stage===stage?.id).map(a=>({id:a.id,...(a.name?{name:a.name}:{}),location:a.location,cost:a.cost??{},minutes:a.minutes}))};
 }
 if(args.operation==='faction_contribute'){
  requireContact(d,this,rule.contact,rule.faction);
  const coins=args.coins??0,item=args.item?this.resolve(args.item,'item'):null,quantity=args.quantity??0;
  const cost={coins,items:item?{[item]:quantity}:{}};assertCost(this,cost);
  if(!coins&&!quantity||quantity&&!item)throw Error('供资必须有实际钱物');
  if(item&&d.get('state','inventory',item,'instances')?.length)throw Error('势力区域物资账不接收具单件身份的物品');
  payPlayer(d,this,cost);changeAssets(d,this,rule.faction,cost,1,{sourceEvent:eventId,minute:before,kind:'player_contribution'});
  this.advance(d,5,eventId);return {faction:rule.faction,clock:rule.id,cost};
 }
 if(args.operation!=='faction_intervene')throw Error('未知势力操作');
 const action=rule.interventions?.find(a=>a.id===args.choice&&a.stage===stage?.id);
 if(!action)throw Error('当前阶段没有该干预办法');
 requireContact(d,this,action,rule.faction);payPlayer(d,this,action.cost??{});
 const check=action.difficulty===undefined?{success:true}:this.check(d,{attribute:action.attribute,difficulty:action.difficulty},eventId);
 const entry={choice:action.id,stage:stage.id,sourceEvent:eventId,minute:before,cost:action.cost??{},success:check.success};
 const updated={...row,interventions:[...row.interventions,entry]};
 if(check.success){
  if(action.effect==='redirect')updated.phase=rule.stages.findIndex(s=>s.id===action.nextStage);
  else updated.paused=action.effect==='pause';
 }
 d.set(clockPath(rule.id),updated);this.advance(d,action.minutes,eventId);
 return {faction:rule.faction,clock:rule.id,...entry,phase:d.get(...clockPath(rule.id),'phase'),...check};
}
function payPlayer(d,engine,cost){
 if(d.get('state','player','coins')<(cost.coins??0)||Object.entries(cost.items??{}).some(([id,n])=>engine.quantity(d,'player',id)<n))throw Error('玩家干预或供资资源不足');
 d.set(['state','player','coins'],d.get('state','player','coins')-(cost.coins??0));
 for(const [item,n]of Object.entries(cost.items??{}))if(n)engine.itemDelta(d,'player',item,-n);
}
