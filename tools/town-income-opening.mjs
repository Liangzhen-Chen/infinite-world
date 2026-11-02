// TI1b: reproducible authored opening from the formal world's existing inputs.
// Run after changes to the roster, recipes, prices or opening policy.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {townHouseholds,townLaborMinutes} from '../server-plugin/town-income.mjs';
import {digest} from '../server-plugin/storage.mjs';
import {FACILITY_TYPES} from '../server-plugin/facility-state.mjs';
import bodyBalance from '../world/rules/tables/balance/body.json' with {type:'json'};

export async function deriveTownOpening(world,policy,sid){
 const engine=new WorldEngine(world),profile=world.settlementProfiles.find(r=>r.id===sid),homes=townHouseholds(engine,sid);
 const fact=(value,basis)=>({value,basis}),byId=engine.byId;
 // These links describe the actual production process, never a wage or asset
 // amount attached to an occupation. Every cost below reads its recipe rows.
 const processes=new Map(policy.livelihoodProcesses.map(r=>[r.livelihood,r.process]));
 const recipes=new Map([...world.recipes,...world.rules.repairs].map(r=>[r.id,r]));
 const restByWork=new Map([...world.residents,...world.npcs].filter(p=>p.schedule?.restDays).map(p=>[p.occupation,p.schedule.restDays]));
 const {daysPerMonth,monthsPerYear}=world.rules.calendar,yearDays=daysPerMonth*monthsPerYear;
 const marketDays=profile.details?.calendar?.marketDays??world.rules.calendar.marketDays;
 const gaps=marketDays.map((day,i)=>i?day-marketDays[i-1]:daysPerMonth-marketDays.at(-1)+day),interval=Math.max(...gaps);
 const dailyNeed=(world.balance?.body??bodyBalance).rows.find(r=>r.key==='person/satiety').drainPerHour.light*24;
 const food=byId.get('item_ration'),unitSatiety=food.nutrition.satiety;
 const wages=world.rules.economy.dailyIncomeBySkillStage[0],wage=(wages[0]+wages[1])/2;
 let annualLaborMinutes=0;
 const households=homes.map(h=>{
  const adults=h.members.filter(p=>p.age>=world.rules.npcLife.adultAge),labor=[];
  for(const p of adults){
   const rest=p.schedule?.restDays??restByWork.get(p.occupation)??[],days=yearDays-rest.filter(day=>day>=1&&day<=daysPerMonth).length*monthsPerYear;
   const capacity=townLaborMinutes(engine,p);annualLaborMinutes+=capacity*days;
   labor.push({person:p.id,minutesPerDay:capacity,workDays:days,restDays:rest});
  }
  const required=[...new Set(adults.map(p=>processes.get(p.occupation)).filter(Boolean))].map(id=>recipes.get(id));
  const toolIds=[...new Set(required.flatMap(r=>r.tools??[]))],tools=toolIds.map(item=>({item,quantity:1,unitPrice:byId.get(item).basePrice}));
  const materials=required.flatMap(r=>r.materials.map(m=>({recipe:r.id,item:m.item,quantity:m.amount,unitPrice:byId.get(m.item).basePrice})));
  const facilities=[...new Set(required.map(r=>r.workstation).filter(Boolean))].map(kind=>{
   const spec=FACILITY_TYPES.workshop,woodPrice=byId.get('item_wood').basePrice,stonePrice=byId.get('item_stone').basePrice;
   const value=spec.wood*woodPrice+spec.stone*stonePrice+spec.work*wage;
   return {kind,value,wood:spec.wood,woodPrice,stone:spec.stone,stonePrice,workDays:spec.work,wage,basis:'FACILITY_TYPES.workshop建造材料与工日的重置估值；不是转移现有公共建筑产权；同户同类只计一次'};
  });
  const capital=tools.reduce((n,r)=>n+r.unitPrice*r.quantity,0)+materials.reduce((n,r)=>n+r.unitPrice*r.quantity,0)+facilities.reduce((n,r)=>n+r.value,0);
  const maxUnits=Math.floor(h.members.length*dailyNeed*interval/unitSatiety),roll=Number(BigInt('0x'+digest([profile.populationSeed,h.id,'opening-rations']).slice(0,12))%BigInt(maxUnits+1));
  const existingSatiety=h.members.reduce((n,p)=>n+Object.entries(p.inventory??{}).reduce((m,[id,v])=>m+(typeof v==='number'?v:v.quantity??0)*(byId.get(id)?.nutrition?.satiety??0),0),0);
  const units=Math.max(0,roll-Math.ceil(existingSatiety/unitSatiety));
  return {household:h.id,livelihood:required.length?'craft':'labor',assetClass:'',basis:`${h.pending?'populationHouseholds(engine, settlement)稳定人口计划':'world/people/households.json成员'}；生计→${required.map(r=>r.id).join(',')||'无物品生产配方的劳力服务'}→工具、公共工位使用周转、一期材料；不是按职业直接赋权。`,
   weight:fact(Math.max(1,Math.ceil(capital)),'max(1, ceil(capital.value))；劳力户取最低1'),
   capital:fact(capital,`tools ${tools.reduce((n,r)=>n+r.unitPrice*r.quantity,0)} + facilities ${facilities.reduce((n,r)=>n+r.value,0)} + materials ${materials.reduce((n,r)=>n+r.unitPrice*r.quantity,0)}；价格world/meta/items.json basePrice；设施FACILITY_TYPES.workshop`),
   production:{recipes:required.map(r=>r.id),tools,facilities,materials},labor,
   tenure:h.tenure??'按稳定人口计划待生成住宅；不推定产权或金额租约',land:[],
   inventory:[{item:food.id,quantity:fact(units,`上集已付款剩余口粮：hash(${profile.populationSeed},${h.id},opening-rations) mod ${maxUnits+1} = ${roll}，扣已存在可食库存折合${Math.ceil(existingSatiety/unitSatiety)}份；人口${h.members.length}×${dailyNeed}饱食/日×最大集期间隔${interval}日÷${unitSatiety}；无农地，无留种/实物租税`)}]};
 });
 const capitals=households.filter(h=>h.capital.value>0).map(h=>h.capital.value).sort((a,b)=>a-b);
 const q=p=>capitals[Math.max(0,Math.ceil(capitals.length*p)-1)]??0,low=q(1/3),high=q(2/3);
 for(const h of households)h.assetClass=h.capital.value===0?'labor':h.capital.value<=low?'small':h.capital.value<=high?'middle':'large';
 const annualIncome=annualLaborMinutes/480*wage,money=Math.floor(annualIncome*policy.cashHoldingMonths/monthsPerYear);
 return {settlement:sid,money:fact(money,`劳力年分钟${annualLaborMinutes}/480 × 日工价中位(${wages.join('+')})/2=${wage} × 现金持有${policy.cashHoldingMonths}/${monthsPerYear}；年${yearDays}日，按本人或同工种既有restDays扣休息日；现钱2351及公库12000计入M，只分余额。历史购粮已付款，不重复扣现钱。`),
  assetClasses:['labor','small','middle','large'].map(id=>({id,weight:fact(1,`分档只分组；实际权重读逐户capital，正资本1/3分位${low}、2/3分位${high}；劳力户最低1`)})),households,
  land:fact(0,'world/people/households.json 无白石农地登记；granary:false。不把住宅登记变成农地。'),
  leases:fact(null,'各户tenure逐字沿用households.json；未知租金和期限保持未知，不产生金额租债。'),grain:[],
  inventoryBatches:fact(null,'历史集市购买口粮写逐户inventory；未登记制造日期，不伪造批次。'),
  tools:fact(households.reduce((n,h)=>n+h.production.tools.reduce((s,r)=>s+r.quantity*r.unitPrice,0),0),'生计配方需求估值，详逐户production；不是可领取的新库存，原有工具不重复发放。'),
  operatingCapital:fact(households.reduce((n,h)=>n+h.capital.value,0),'逐户工具、设施重置估值与一期材料之和；不重复发行原有物品。'),unresolved:['leases.amount/term','inventoryBatches.date'],
  calculation:{yearDays,annualLaborMinutes,laborEquivalent:annualLaborMinutes/yearDays/480,annualIncome,wage,cashHoldingMonths:policy.cashHoldingMonths,marketInterval:interval,dailySatiety:dailyNeed,foodSatiety:unitSatiety,quantiles:{low,high}}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const world=await loadWorld(),policy=JSON.parse(await fs.readFile(new URL('../world/rules/town-income.json',import.meta.url),'utf8'));
 const opening={version:1,basis:'TI1b：由正式世界人口、日历、工价、配方、物价和暂定现金持有规则派生；tools/town-income-opening.mjs 可重算；仅新开档genesis。',settlements:[await deriveTownOpening(world,policy,'loc_bs')]};
 await fs.writeFile(new URL('../world/economy/town-income.json',import.meta.url),JSON.stringify(opening,null,2)+'\n');
 console.log(JSON.stringify(opening.settlements[0].calculation));
}
