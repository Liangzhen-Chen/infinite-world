import {setup,draft,DAY,once,ok,missing} from '../harness.mjs';
import {applyFacilityInteraction,advanceFacilityFire,damageFacility,completeFacilityProject} from '../../../server-plugin/facilities.mjs';
import {facilityView} from '../../../server-plugin/facility-state.mjs';
import {resolveInteraction} from '../../../server-plugin/interactions.mjs';
import {traitsOf} from '../../../server-plugin/traits.mjs';
import {openLedger} from '../../../server-plugin/ledger.mjs';
import {resyncBooks} from '../../helpers/ledger-sync.mjs';
import {regionalTradePrice} from '../../../server-plugin/settlement-trade.mjs';
import {agricultureAction} from '../../../server-plugin/agriculture.mjs';
import {leaseState} from '../../../server-plugin/contract-state.mjs';
import {reconcile} from '../../helpers/ledger-audit.mjs';
import {initialThermalState} from '../../../server-plugin/magic-object.mjs';
import {advanceNpcSchedules} from '../../../server-plugin/npc-schedule.mjs';
import {adjudicateLegalCase,lawAction} from '../../../server-plugin/law.mjs';
import {legalCodeAt} from '../../../server-plugin/law-codes.mjs';
import {faithAction,advanceFaith} from '../../../server-plugin/faith.mjs';
import {SEAT,T,HOST} from '../../helpers/faith.mjs';
import {handOatsScarcity} from '../../helpers/hand-targets.mjs';

export function fireScene(){
 const s=setup(),{engine,w}=s;delete w.rules.weather;
 // negligent_fire belongs to this fire scenario's settlement law, not the shared village charter.
 const localLaw=engine.world.rules.law?.codes?.find(code=>code.locations?.includes('loc_hw'));
 if(localLaw)localLaw.penalties.negligent_fire={baseFine:10,valueMultiplier:0};
 const d=draft(s.doc),forge='bld_hw_forge',warehouse='bld_hw_council';d.engine=engine;d.original=s.doc;
 d.set(['state','minute'],600);d.set(['state','location'],'loc_hw');
 const place=(id,x,y,extra={})=>{const existing=engine.byId.get(id),b={...existing,id,name:id,type:'bld',parent:'loc_hw',scope:'loc_hw',material:'wood',facilityType:'house',owner:'player',position:[x,y],access:{mode:'public'},...extra};if(existing)Object.assign(existing,b);else d.set(['state','created',id],b);return id;};
 place(forge,0,0,{windVector:[6,0],windKmh:22,owner:'npc_hw_duanyan'});place(warehouse,10,0,{facilityType:'granary'});
 place('bld_fire_up',-10,0);place('bld_fire_far',50,0);place('bld_fire_stone',11,1,{material:'stone'});
 const farm=d.get('state','records','agriculture:loc_hw');
 // The same public account contains two physical warehouses. Seed is separate.
 const r=structuredClone(farm);r.mode='managed';r.batches=[{id:'fire_grain',amount:6000,harvestDay:0,expiresDay:180,kind:'grain',warehouse},{id:'safe_grain',amount:2000,harvestDay:0,expiresDay:180,kind:'grain',warehouse:'bld_fire_far'}];
 d.set(['state','records','agriculture:loc_hw'],r);d.set(['state','settlements','loc_hw','food'],8000);
 d.document.ledger=openLedger(engine,d.document);
 const ignite=()=>applyFacilityInteraction(d,engine,forge,resolveInteraction('fire',traitsOf(engine,d.get('state'),forge)),{minute:600,sourceEvent:'test:fire'});
 return {...s,d,forge,warehouse,place,ignite};
}

const scenario=once(async()=>{
 const S=fireScene(),{engine,d,forge,warehouse}=S;
 // One neighbourhood contains the working forge, its actual public grain
 // batches and the damaged worship hall used for the fundraising below.
 S.place(SEAT,12,2,{capacity:12,owner:T});
 d.set(['state','inventory','item_oats'],{quantity:4500});resyncBooks(engine,d.document);
 d.set(['state','inventory','item_wood'],{quantity:10});d.set(['state','inventory','item_stone'],{quantity:10});
 const price=regionalTradePrice(d,engine,'item_oats','loc_hw',600),seed=JSON.stringify(d.get('state','records','agriculture:loc_hw','field'));
 const who='npc_hw_duanyan',officer='npc_hw_gucen',f=engine.world.locations.find(b=>b.id===forge).features.find(f=>f.id==='feature_hw_forge_hearth');
 const thermal=initialThermalState({fuelMg:4000},f.thermalModel,600);thermal.burning=true;
 d.set(['state','records',`physical_feature:${f.id}`],{id:f.id,category:'physical_feature',location:forge,state:{thermal}});
 for(const [id,n]of Object.entries(d.get('state','npcs')))if(id!==who&&id!==officer&&n.location===forge)d.set(['state','npcs',id,'location'],'loc_hw');
 d.set(['state','npcs',who,'location'],forge);d.set(['state','npcs',who,'coins'],100000);d.set(['state','npcs',officer,'location'],forge);d.set(['state','npcs',officer,'activity'],'巡查');resyncBooks(engine,d.document);
 engine.byId.get(who).schedule={default:[{start:0,end:620,location:forge,activity:'打铁',services:['craft']},{start:620,end:1440,location:'loc_hw',activity:'休息',services:[]}]};
 d.set(['state','location'],'loc_hw');advanceNpcSchedules(d,engine,600,620);
 const origin=`unattended_furnace:${f.id}:620`,started=Boolean(d.get('state','records',origin)&&d.get('state','buildings',forge,'burning')&&d.get('state','npcs',who,'location')!==forge);
 advanceFacilityFire(d,engine,{after:680});
 const direction=facilityView(engine,d.get('state'),warehouse).burning&&!facilityView(engine,d.get('state'),'bld_fire_up').burning&&!facilityView(engine,d.get('state'),'bld_fire_far').burning&&!facilityView(engine,d.get('state'),'bld_fire_stone').burning;
 advanceFacilityFire(d,engine,{after:860});
 // Actual rain extinguishes the damaged forge, warehouse and worship hall.
 const weather=structuredClone(setup().w.rules.weather);weather.regions=[{...weather.regions[0],locations:['loc_hw'],indoor:[]}];weather.seasonalWeights=weather.seasonalWeights.map(()=>[0,0,1,0,0,0]);S.w.rules.weather=weather;
 advanceFacilityFire(d,engine,{after:920});delete S.w.rules.weather;
 const lost=8000-d.get('state','settlements','loc_hw','food'),sunk=d.get('ledger','flows','sink:destroy|item_oats|fire')??0;
 const signed=regionalTradePrice(d,engine,'item_oats','loc_hw',800),scarce=regionalTradePrice(d,engine,'item_oats','loc_hw',DAY+600);
 const stableSeed=seed===JSON.stringify(d.get('state','records','agriculture:loc_hw','field'));
 // Replenishment is an actual donation out of the donor's opening inventory.
 d.set(['state','minute'],2*DAY+600);d.set(['state','location'],warehouse);d.set(['state','npcs','npc_hw_chenbai','location'],warehouse);d.set(['state','npcs','npc_hw_chenbai','activity'],'仓务');
 const originalAdvance=engine.advance;engine.advance=()=>{};
 try{agricultureAction.call(engine,d,{operation:'donate',settlement:'loc_hw',quantity:lost},'e06:replenish');}finally{engine.advance=originalAdvance;}
 const restored=regionalTradePrice(d,engine,'item_oats','loc_hw',2*DAY+600);
 // 补回后的价不再等于开局价：目标持有随日变化（距收获少两天，目标少两天餐口）。按手推：价 = 目录基价 3 × 运输因子 1 × 夹取后的稀缺度，稀缺度 = handOatsScarcity（需求 ÷ 供给，不调被测原语）。
 const [floor,cap]=engine.rules.economy.priceFactorLimits.region,hand=handOatsScarcity(engine,d.get('state'),d.get('state','settlements','loc_hw','food')),restoredExpected=3*Math.min(cap,Math.max(floor,hand.ratio));
 const audited=reconcile(engine,d.document),balanced=Object.values(audited).every(a=>a.length===0);
 const lease={subject:warehouse,createdAt:0,deadline:120*DAY,monthlyRent:400,status:'有效'};
 damageFacility(d,engine,warehouse,facilityView(engine,d.get('state'),warehouse).condition-20,{sourceEvent:'e06:lease'});const stopped=leaseState(engine,d.get('state'),lease).monthlyRent===0;
 completeFacilityProject(d,engine,{id:'e06:repair:lease',building:warehouse,projectWork:'repair'},2*DAY+650);const resumed=leaseState(engine,d.get('state'),lease).monthlyRent===400;
 const fireCase=Object.values(d.get('state','records')).find(r=>r.category==='legal_case'&&r.offense==='negligent_fire'&&r.building===warehouse);
 let compensated=false;
 if(fireCase){const code=legalCodeAt(engine,warehouse,d.get('state')),verdict=adjudicateLegalCase(d,engine,fireCase,code,code.judges[0],'e06:judgment');
  d.set(['state','location'],code.court);d.set(['state','npcs',officer,'location'],code.court);
  const cash=d.get('state','player','coins'),payment=lawAction.call(engine,d,{operation:'pay',case:fireCase.id,authority:officer},'e06:compensation');compensated=verdict.convicted&&payment.recovered>0&&d.get('state','player','coins')-cash===payment.recovered;}
 // The same damaged hall has no free incense income. Outside fundraising is
 // paid by a real donor, and the host must spend actual days on the repair.
 const damaged=facilityView(engine,d.get('state'),SEAT).condition;
 d.set(['state','location'],SEAT);d.set(['state','npcs',HOST,'location'],SEAT);d.set(['state','npcs',HOST,'activity'],'修缮');
 const beforeCash=d.get('state','player','coins');
 const give=args=>faithAction.call(engine,d,{operation:'faith_give',org:T,choice:'repair',...args},`e06:donation:${args.item}`);
 give({coins:100,item:'item_wood',quantity:10});give({item:'item_stone',quantity:10});
 const p=faithAction.call(engine,d,{operation:'faith_use',org:T,choice:'repair',consent:true},'e06:temple:start'),underConstruction=d.get('state','buildings',SEAT,'condition')===damaged;
 advanceFaith(d,engine,{before:2*DAY+600,after:6*DAY,id:'e06:temple:work'});
 const repaired=damaged<60&&beforeCash-d.get('state','player','coins')===100&&p.remainingWork>=2&&underConstruction&&d.get('state','buildings',SEAT,'condition')===100;
 return {direction,stock:lost>0&&sunk===lost&&stableSeed&&scarce>price&&signed===price&&Math.abs(restored-restoredExpected)<=1e-9&&balanced,lease:stopped&&resumed,repaired,compensated,started,
  details:{lost,sunk,price,scarce,restored,signed,case:fireCase?.id,repair:p.id,damaged,templeCondition:d.get('state','buildings',SEAT,'condition'),repairWork:p.remainingWork,templePaid:beforeCash-d.get('state','player','coins'),repairState:d.get('state','records',`faith_repair:${T}`)}};
});

export default [
 ['E06-1',1,'蔓延受风向和间距影响，不会无差别烧全镇','direction'],
 ['E06-2',2,'粮仓存粮损失，当地粮价短期上涨','stock'],
 ['E06-3',3,'租约按毁损条款处理，未修复期间停收租金','lease'],
 ['E06-4',4,'庙的偏殿受损后香火下降，可发起募捐修缮','repaired'],
 ['E06-5',5,'铁匠可能被追究失火责任，赔偿邻舍','compensated'],
 ['E06-6',6,'起火时铁匠按日程不在铺内（起火源接 NPC 日程）','started'],
].map(([id,no,text,key])=>({id,event:'E06',no,text,async check(){const s=await scenario();return (s[key]?ok:missing)(JSON.stringify({behavior:key,passed:s[key],...s.details}));}}));
