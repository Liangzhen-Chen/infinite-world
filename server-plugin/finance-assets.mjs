import {counterpart} from './credit.mjs';
import {workshopFund,coinRead,partyAccount} from './money.mjs';
import {financePath as rec,financeInt as int,financeBalance,financeChange,financeTransfer,financeEvent} from './finance-bank.mjs';
import {groupRepresentative,personHousehold,personOccupation,personBusiness,personConstraint,personOffices,placeSettlement} from './entity-view.mjs';
import {groupAccountView,ensureGroupAccount,groupAccountPath} from './group-account.mjs';
import {facilityView} from './facility-state.mjs';
import {laborTrade} from './labor-market.mjs';
import {standing} from './standing.mjs';
import {changeItems,produceItems,heldUnit,wearItem} from './items.mjs';
import {store,bag,bookStock,craftInput,craftOutput,recordCraft,priceRead,bagStock} from './stock.mjs';
import {declareLedgerWriter} from './ledger.mjs';
// S1b: 受雇制作（组织或个人库存）是 src:craft 制造守恒对：配方投入进 sink:consume，产出来自 src:craft。
declareLedgerWriter('finance-assets',{sources:{'src:craft':{'*':100000}},sinks:['sink:consume']});
import {registerCreditDefault,settleCreditCase} from './law.mjs';
import {assessTradeTax,tradeTax} from './finance-tax.mjs';

const DAY=1440,MONTH=30*DAY;
import {ASSET_OPERATIONS} from './finance-operations.mjs';
export {ASSET_OPERATIONS};
const all=d=>Object.values(d.get('state','records')??{}),base=(e,s,id)=>s.created?.[id]??e.byId.get(id);
const alive=(s,id)=>s.npcs?.[id]&&!['死亡','濒死','昏迷','患病'].includes(s.npcs[id].status);
function ownsWorkshop(state,id){return state.buildings?.[id]?.owner==='player'||allState(state).some(r=>r.kind==='lease'&&r.subject===id&&r.parties?.[0]==='player'&&r.status==='有效'&&r.deadline>state.minute);}
function ownedPlace(d,e,args,allowLease=false){
    const id=e.resolve(args.location??d.get('state','location')),place=base(e,d.get('state'),id),asset=d.get('state','buildings',id);
    if(id!==d.get('state','location')||!place||!(allowLease?ownsWorkshop(d.get('state'),id):asset?.owner==='player')||asset?.condition<=0)throw Error('须在本人合法持有且完好的房屋、田地或铺面签约');
    return {id,place,asset};
}
export function rentalNeed(e,state,tenant,subject){
    const p=base(e,state,subject),occupation=personOccupation(e,state,tenant).value??'',h=personHousehold(e,state,tenant).value;
    if(!p||!alive(state,tenant)||personConstraint(e,state,tenant)||allState(state).some(r=>r.kind==='asset_lease'&&r.tenant===tenant&&r.status==='有效'&&r.deadline>state.minute))return null;
    const type=/田|耕|农地/.test(p.purpose??p.name)?'field':/铺|店|商|工坊/.test(p.purpose??p.name)?'commercial':'home';
    const home=h?.homeLocation??base(e,state,tenant)?.home?.location,work=personBusiness(e,state,tenant);
    const damaged=home&&state.buildings?.[home]?.condition<=0;
    if(type==='home'){
        const definition=base(e,state,home),capacity=definition?.lodging?.rooms??definition?.rooms?.length??Infinity;
        if(home&&!damaged&&(h?.members?.length??1)<=capacity)return null;
    }else if(type==='field'){
        if(!/农|耕|种|佃/.test(occupation))return null;
        if(Object.entries(state.buildings??{}).some(([id,r])=>r.owner===tenant&&/田|耕/.test(base(e,state,id)?.purpose??'')))return null;
    }else if(!/商|掌柜|匠|织|铁|陶|工坊/.test(occupation)&&!work?.open.value)return null;
    return {kind:type,reason:type==='home'?(damaged?'原住房损毁':home?'原住房拥挤':'无可用住房'):type==='field'?'农事需要田地':'经营需要铺面',oldHome:home??null,
        settlement:placeSettlement(e,state,subject).value};
}
const allState=s=>Object.values(s.records??{});
function netAssets(d,e,id){
    const actor=d.get(...e.actorPath(id)),account=groupAccountView(e,d.get('state'),id);
    const goods=account?.items??actor?.inventory??{};
    // S1c: 现款与库存读账户（势力库存在 store，个人行囊在 bag），公式不变。
    const stock=Object.entries(goods).reduce((n,[item,v])=>n+priceRead(d,{point:'assets.goods',account:account?.items?store(e,id,item):bag(e,id,item),legacy:()=>typeof v==='number'?v:v.quantity??0})*(e.byId.get(item)?.basePrice??0),0);
    if(!account&&!actor&&d.get(...rec(`organization:${id}`))?.category!=='organization')throw Error('资金当事人不存在');
    const cash=coinRead(d,{point:'assets.cash',account:partyAccount(e,d.get('state'),id),legacy:()=>financeBalance(d,e,id)});
    const debt=all(d).filter(r=>r.category==='debt'&&r.debtor===id).reduce((n,r)=>n+Math.max(0,r.amount-r.paid),0);
    return Math.max(1,cash+stock-debt);
}
export function operatingProfit(d,e,issuer){
    const recorded=d.get(...rec(`finance_profit:${issuer}`))?.net??0;
    const ledger=groupAccountView(e,d.get('state'),issuer)?.ledger??d.get(...rec(`organization:${issuer}`),'ledger')??[];
    const lots=new Map(Object.entries(e.world.factions?.find(f=>f.id===issuer)?.resources?.items??{}).map(([id,quantity])=>[id,[{quantity,price:e.byId.get(id)?.basePrice??0}]])),events=new Map();let net=recorded;
    for(const l of ledger){
        if(l.kind==='商税'){net+=l.coins??0;continue;}
        if(l.kind==='stage_cost'){net+=(l.coins??0)+Object.entries(l.items??{}).reduce((v,[id,q])=>v+q*(e.byId.get(id)?.basePrice??0),0);continue;}
        if(l.kind!=='trade')continue;
        const key=l.sourceEvent,event=events.get(key)??{coins:0,items:{}};event.coins+=l.coins??0;
        for(const [id,q]of Object.entries(l.items??{}))event.items[id]=(event.items[id]??0)+q;
        events.set(key,event);
    }
    for(const event of events.values()){
        const acquired=Object.entries(event.items).filter(([,q])=>q>0),sold=Object.entries(event.items).filter(([,q])=>q<0);
        if(acquired.length){const value=acquired.reduce((n,[id,q])=>n+q*(e.byId.get(id)?.basePrice??0),0);for(const [id,quantity]of acquired){const stock=lots.get(id)??[];stock.push({quantity,price:-event.coins*(e.byId.get(id)?.basePrice??0)/Math.max(1,value)});lots.set(id,stock);}}
        if(!sold.length)continue;
        let basis=0;
        for(const [id,q]of sold){const stock=lots.get(id)??[];let remaining=-q;while(remaining&&stock.length){const n=Math.min(remaining,stock[0].quantity);basis+=n*stock[0].price;stock[0].quantity-=n;remaining-=n;if(!stock[0].quantity)stock.shift();}basis+=remaining*(e.byId.get(id)?.basePrice??0);lots.set(id,stock);}
        net+=event.coins-basis;
    }
    return Math.floor(net);
}
// Real deliveries consume inventory basis once. Credit sales recognize income
// when the existing debt is repaid; purchases retain their actual lot prices.
export function recordFinanceSale(d,e,{buyer,seller,item,quantity,cost,tax=0,eventId,paid=true,settledBasis}){
    if(settledBasis===undefined&&buyer!=='player'&&d.get('state','npcs',buyer)){
        const key=`finance_profit:${buyer}`,old=d.get(...rec(key))??{category:'finance_profit',issuer:buyer,net:0,lots:{},entries:[]};
        const opening=bagStock(d,e,{point:'assets.basis',id:buyer,item,legacy:()=>e.quantity(d,buyer,item)})-quantity,prior=old.lots[item]??(opening>0?[{quantity:opening,price:e.byId.get(item)?.basePrice??0}]:[]);
        d.set(rec(key),{...old,lots:{...old.lots,[item]:[...prior,{quantity,price:cost/quantity}]}});
    }
    if(seller==='player'||!d.get('state','npcs',seller))return;
    const key=`finance_profit:${seller}`,old=d.get(...rec(key))??{category:'finance_profit',issuer:seller,net:0,lots:{},entries:[]},lots=structuredClone(old.lots[item]??[]);
    let remaining=settledBasis===undefined?quantity:0,basis=settledBasis??0;while(remaining&&lots.length){const n=Math.min(remaining,lots[0].quantity);basis+=n*lots[0].price;remaining-=n;lots[0].quantity-=n;if(!lots[0].quantity)lots.shift();}
    basis+=remaining*(e.byId.get(item)?.basePrice??0);
    if(!paid){d.set(rec(key),{...old,lots:{...old.lots,[item]:lots}});return basis;}
    const profit=Math.floor(cost-basis-tax);
    d.set(rec(key),{...old,net:old.net+profit,lots:{...old.lots,[item]:lots},entries:[...old.entries,{sourceEvent:eventId,minute:d.get('state','minute'),revenue:cost,cost:basis,tax,profit}]});
    return basis;
}
function payDividend(d,e,row,at){
    const profit=operatingProfit(d,e,row.issuer),eligible=Math.max(0,Math.floor((profit-row.baselineProfit)*row.share/100)-row.distributed);
    const paid=Math.min(eligible,financeBalance(d,e,row.issuer));
    if(paid)financeTransfer(d,e,row.issuer,row.holder,paid,`${row.id}:${at}`);
    const next={...row,distributed:row.distributed+paid,nextDividend:at+MONTH,payments:[...row.payments,{minute:at,paid,profit,eligible}]};d.set(rec(row.id),next);
    if(paid)financeEvent(d,e,{id:`${row.id}:${at}`,actor:row.issuer,target:row.holder,value:paid,minute:at,location:row.location,tags:['dividend']});
    return next;
}
export function workerSkill(e,s,id,recipe){const n=s.npcs[id],p=base(e,s,id);return Math.max(n?.proficiencies?.[recipe.skill]??0,p?.proficiencies?.[recipe.skill]??0,n?.skills?.[recipe.skill]?.proficiency??0);}
function employmentAccount(d,e,owner){const g=groupAccountView(e,d.get('state'),owner);if(g)return g;const r=d.get(...rec(`organization:${owner}`));return r?.category==='organization'?r:null;}
export function employmentStock(d,e,owner,item){const g=employmentAccount(d,e,owner);return g?g.items?.[item]??0:e.quantity(d,owner,item);}
export function changeEmploymentStock(d,e,owner,item,delta,eventId,books){
    const g=groupAccountView(e,d.get('state'),owner);
    if(!g){const org=d.get(...rec(`organization:${owner}`));if(org?.category==='organization'){
        const quantity=(org.items?.[item]??0)+delta;if(quantity<0)throw Error('组织实际库存不足');
        bookStock(d,e,store(e,owner,item),delta,books);
        d.set(rec(`organization:${owner}`),{...org,items:{...org.items,[item]:quantity},ledger:[...org.ledger??[],{kind:'employment_production',items:{[item]:delta},sourceEvent:eventId}]});return;
    }return changeItems(d,e,owner,item,delta,{books});}
    const row=ensureGroupAccount(d,e,owner),quantity=(row.items[item]??0)+delta;if(quantity<0)throw Error('组织实际库存不足');
    bookStock(d,e,store(e,owner,item),delta,books);
    d.set(groupAccountPath(owner),{...row,items:{...row.items,[item]:quantity},ledger:[...row.ledger,{kind:'employment_production',items:{[item]:delta},sourceEvent:eventId}]});
}
// Shared F1 production: validate the complete batch before consuming anything.
export function employmentProductionPlan(d,e,row,{minutes=480,maximum=Infinity}={}){
    const s=d.get('state'),recipe=base(e,s,row.recipe),owner=row.owner??'player';
    if(!recipe?.materials?.length||!recipe.output)return {reason:'配方已不可用'};
    const skill=workerSkill(e,s,row.worker,recipe),facility=facilityView(e,s,row.location);
    if(skill<(recipe.minimumProficiency??0))return {reason:'当前技能不足'};
    if(facility?.factor===0||s.buildings?.[row.location]?.condition<=0)return {reason:'工坊已停用'};
    const toolsOwner=employmentAccount(d,e,owner)?row.worker:owner;
    let batches=Math.min(50,Math.floor(minutes/recipe.minutes*(1+skill/3000)),Math.floor(200/recipe.output.quantity),maximum);
    for(const p of recipe.byproducts??[])batches=Math.min(batches,Math.floor(200/p.amount));
    for(const m of recipe.materials)batches=Math.min(batches,Math.floor(employmentStock(d,e,owner,m.item)/m.amount));
    for(const tool of recipe.tools??[]){const held=heldUnit(d,e,toolsOwner,tool);if(!held||(held.durability??e.byId.get(tool)?.durability)<=0)return {reason:'缺少完好工具'};batches=Math.min(batches,Math.floor((held.durability??e.byId.get(tool)?.durability)/Math.max(1,recipe.toolWear??1)));}
    const place=base(e,s,row.location),station=recipe.workstation?(facility?.workstations??place?.workstations)?.find(st=>st.kind===recipe.workstation):null;
    if(recipe.location&&recipe.location!==row.location||recipe.workstation&&(!station||station.access!=='public'&&station.owner!==owner))return {reason:'工作台使用权已失效'};
    if(!batches)return {reason:'缺少可用材料或工时'};
    const fee=station?.owner===owner?0:(station?.fee??0)*batches;
    if(financeBalance(d,e,owner)<fee)return {reason:'工作台费用不足'};
    const quality=skill>=2100?'杰作':skill>=1500?'优秀':skill>=900?'精良':skill>=300?'普通':'粗糙';
    return {recipe,owner,toolsOwner,skill,batches,fee,station,quality};
}
export function settleEmploymentProduction(d,e,row,at,plan){
    const {recipe,owner,toolsOwner,skill,batches,fee,station,quality}=plan,eventId=`${row.id}:${at}`;
    if(fee){if(station.owner)financeTransfer(d,e,owner,station.owner,fee,`${eventId}:station`);else{financeChange(d,e,owner,-fee,`${eventId}:station`,{account:workshopFund(station.id),writer:'finance-bank',eventId});d.set(['state','workshopFunds',station.id],(d.get('state','workshopFunds',station.id)??0)+fee);}}
    for(const m of recipe.materials)changeEmploymentStock(d,e,owner,m.item,-m.amount*batches,eventId,craftInput('finance-assets',eventId));
    for(const tool of recipe.tools??[])wearItem(d,e,toolsOwner,tool,(recipe.toolWear??1)*batches);
    const instances=[],products=[recipe.output,...(recipe.byproducts??[]).map(p=>({item:p.item,quantity:p.amount}))];
    for(const p of products){
        if(employmentAccount(d,e,owner))changeEmploymentStock(d,e,owner,p.item,p.quantity*batches,eventId,craftOutput('finance-assets',eventId));
        else instances.push(...produceItems(d,e,p.item,p.quantity*batches,{eventId,recipe:recipe.id,workmanship:quality,owner,maker:row.worker,books:craftOutput('finance-assets',eventId)}));
    }
    recordCraft(d,{recipe:recipe.id,batches,inputs:Object.fromEntries(recipe.materials.map(m=>[m.item,m.amount*batches])),outputs:Object.fromEntries(products.map(p=>[p.item,p.quantity*batches])),writer:'finance-assets',eventId});
    return {minute:at,fee,batches,quality,skill,instances,quantity:recipe.output.quantity*batches};
}
function fairWage(e,s,worker,recipe){const skill=workerSkill(e,s,worker,recipe),regard=standing(e,s,worker,'player');return Math.ceil(e.rules.economy.wageCopperPerHalfDay[0]*2*(1+skill/3000)*(regard<0?1.2:1));}
export function assetTrade(d,e,args,id){
    if(args.operation?.startsWith('labor_'))return laborTrade(d,e,args,id);
    const op=args.operation,state=d.get('state'),now=state.minute,location=state.location;
    if(op==='asset_inspect'){
        const subject=args.location?e.resolve(args.location):location;
        return {tax:tradeTax(e,state,subject),tariff:tradeTax(e,state,subject,'tariff'),tenants:Object.keys(state.npcs).map(tenant=>({tenant,need:rentalNeed(e,state,tenant,subject)})).filter(r=>r.need),
            contracts:all(d).filter(r=>['equity','asset_lease','workshop'].includes(r.kind)),operations:[...ASSET_OPERATIONS],
            note:'invest:business组织或seller商人,quantity股份%；share_transfer:contract,buyer；rent_out:location,coins月租；workshop:item配方,coins日薪；workshop_terms调整工资。'};
    }
    if(op==='invest'){
        const issuer=args.business?e.resolve(args.business):e.resolve(args.seller),representative=args.business?groupRepresentative(e,state,issuer,args.seller):issuer;
        if(!representative)throw Error('组织没有现任签约代表');counterpart(d,e,representative,{consent:args.consent});
        if(!args.business&&!personBusiness(e,state,issuer)?.open.value)throw Error('对方没有当前可经营的商号');
        const share=int(args.quantity,1,90,'股份百分比'),sold=all(d).filter(r=>r.kind==='equity'&&r.issuer===issuer).reduce((n,r)=>n+r.share,0);
        if(sold+share>90)throw Error('发行股份超过可转让比例');
        const value=Math.ceil(netAssets(d,e,issuer)*share/(100-share)),cost=int(args.coins??value,Math.max(1,Math.ceil(value*.8)),Math.max(1,Math.ceil(value*1.5)),'入股对价');
        financeTransfer(d,e,'player',issuer,cost,id);const key=`equity:${id}`;
        const row={category:'contract',kind:'equity',id:key,issuer,holder:'player',share,stake:cost,baselineProfit:operatingProfit(d,e,issuer),distributed:0,nextDividend:now+MONTH,payments:[],status:'有效',location,createdAt:now,source:id};d.set(rec(key),row);
        return {contract:key,issuer,share,cost};
    }
    if(op==='dividend'||op==='share_transfer'){
        const row=d.get(...rec(args.contract));if(row?.kind!=='equity'||row.holder!=='player'||row.status!=='有效')throw Error('需要本人持有的有效股份契约');
        if(op==='dividend'){
            if(now<row.nextDividend)throw Error('尚未到分红期');return payDividend(d,e,row,now);
        }
        const buyer=counterpart(d,e,args.buyer,{consent:args.consent}),share=int(args.quantity??row.share,1,row.share,'转让股份');
        if(buyer===row.issuer)throw Error('发行方回购须另签减资条款，不能形成自有股份');
        const value=Math.max(1,Math.ceil(netAssets(d,e,row.issuer)*share/100)),cost=int(args.coins??value,Math.max(1,Math.ceil(value*.8)),Math.ceil(value*1.5),'转让价款');
        financeTransfer(d,e,buyer,'player',cost,id);
        // Accrued undistributed entitlements transfer with the shares.
        const part=share/row.share,transferred={...row,id:`equity:${id}`,holder:buyer,share,stake:Math.floor(row.stake*part),distributed:Math.floor(row.distributed*part),source:id};
        d.set(rec(row.id),{...row,share:row.share-share,stake:row.stake-transferred.stake,distributed:row.distributed-transferred.distributed,status:share===row.share?'已转让':'有效'});d.set(rec(transferred.id),transferred);
        return {contract:transferred.id,buyer,share,cost};
    }
    if(op==='rent_out'){
        const {id:subject}=ownedPlace(d,e,args),tenant=counterpart(d,e,args.seller,{consent:args.consent}),need=rentalNeed(e,state,tenant,subject);
        if(!need)throw Error('对方当前没有对应住房或经营租赁需求');
        if(all(d).some(r=>r.kind==='asset_lease'&&r.subject===subject&&r.status==='有效'&&r.deadline>now))throw Error('资产已出租');
        const days=int(args.days??30,1,360,'租赁天数'),anchor=e.rules.economy.rentalCopperPerWeek*4*(need.kind==='commercial'?2:1),rent=int(args.coins??anchor,Math.ceil(anchor*.8),Math.ceil(anchor*1.5),'每月租金');
        const initial=Math.ceil(rent*Math.min(days,30)/30);financeTransfer(d,e,tenant,'player',initial,id);
        const key=`asset_lease:${id}`,row={category:'contract',kind:'asset_lease',id:key,subject,tenant,owner:'player',use:need.kind,settlement:need.settlement,oldHome:need.oldHome,
            monthlyRent:rent,paid:initial,status:'有效',createdAt:now,deadline:now+days*DAY,nextRent:now+MONTH,location,source:id};d.set(rec(key),row);
        return {contract:key,tenant,rent,paid:initial,need};
    }
    if(op==='workshop'){
        const {id:subject,place}=ownedPlace(d,e,args,true),worker=counterpart(d,e,args.seller,{consent:args.consent}),recipe=e.byId.get(e.resolve(args.item,'recipe'));
        if(!recipe?.materials?.length||!recipe.output||recipe.minutes>480)throw Error('配方须有真实材料且工序可在一日内完成');
        const skills=base(e,state,worker)?.skills??[];
        const knows=Array.isArray(skills)?skills.includes(recipe.skill):Object.hasOwn(skills,recipe.skill);
        if(workerSkill(e,state,worker,recipe)<(recipe.minimumProficiency??0)||!(knows||state.npcs[worker].proficiencies?.[recipe.skill]))throw Error('工人未掌握配方所需技能');
        if(recipe.location&&recipe.location!==subject||recipe.workstation&&!place.workstations?.some(s=>s.kind===recipe.workstation&&(s.access==='public'||s.owner==='player')))throw Error('铺面没有合法可用的配方工作台');
        if(all(d).some(r=>r.kind==='workshop'&&r.worker===worker&&['有效','要求加薪','罢工'].includes(r.status)))throw Error('工人已有未结束的雇佣合同');
        if(personConstraint(e,state,worker)||state.npcs[worker].levy||state.npcs[worker].caring)throw Error('工人受拘押、服役或照护义务约束');
        if(personOffices(e,state,worker).length)throw Error('现任公职不能被私人工坊排班覆盖');
        if(Object.values(state.projects??{}).some(p=>p.status==='施工中'&&p.public?.workers?.includes(worker)))throw Error('工人已有公款工程排班');
        const wage=int(args.coins??fairWage(e,state,worker,recipe),1,1e6,'日薪'),days=int(args.days??30,1,360,'雇佣天数'),key=`workshop:${id}`;
        const row={category:'contract',kind:'workshop',id:key,worker,owner:'player',recipe:recipe.id,location:subject,wage,status:'有效',createdAt:now,deadline:now+days*DAY,
            starts:(Math.floor(now/DAY)+1)*DAY+480,nextWork:(Math.floor(now/DAY)+1)*DAY+1020,paid:0,produced:0,shifts:[],source:id};d.set(rec(key),row);return {contract:key,worker,wage,recipe:recipe.id};
    }
    const row=d.get(...rec(args.contract));if(row?.kind!=='workshop'||row.owner!=='player'||!['有效','要求加薪','罢工'].includes(row.status))throw Error('需要尚未结束的本人工坊雇佣合同');
    if(row.location!==location)throw Error('须到工坊修改或解除雇佣');
    if(op==='dismiss'){d.set(rec(row.id),{...row,status:'已解雇',endedAt:now});return {contract:row.id,status:'已解雇'};}
    if(op==='workshop_terms'){
        if(e.resolve(args.seller)!==row.worker)throw Error('须由原雇工同意新工钱');counterpart(d,e,row.worker,{consent:args.consent});
        const wage=int(args.coins,1,1e6,'新日薪');d.set(rec(row.id),{...row,wage,status:'有效',raiseRequestedAt:null,amendments:[...row.amendments??[],{wage,minute:now,source:id}]});return {contract:row.id,wage};
    }
    throw Error('未知资产操作');
}
function rentDue(d,e,row,at){
    const key=`debt_rent:${row.id}:${at}`,amount=Math.ceil(row.monthlyRent*Math.min(MONTH,row.deadline-at)/MONTH),paid=Math.min(amount,financeBalance(d,e,row.tenant));
    if(paid)financeTransfer(d,e,row.tenant,'player',paid,key);
    if(paid<amount){
        const debt={category:'debt',kind:'rent',debtor:row.tenant,creditor:'player',amount,paid,status:'待偿还',createdAt:at,deadline:at+e.rules.economy.credit.loan.defaultGraceMinutes,source:row.source,contract:row.id,location:row.location};d.set(rec(key),debt);
    }
    d.set(rec(row.id),{...row,paid:row.paid+paid,nextRent:at+MONTH});
    financeEvent(d,e,{id:key,actor:row.tenant,target:'player',value:paid,minute:at,location:row.location,tags:['rent']});
}
function workshopShift(d,e,row,at){
    const s=d.get('state'),recipe=base(e,s,row.recipe),worker=s.npcs[row.worker],regard=standing(e,s,row.worker,'player'),wage=fairWage(e,s,row.worker,recipe);
    const end=(status,reason)=>{d.set(rec(row.id),{...row,status,reason,nextWork:at+DAY,...(['已辞工','已到期'].includes(status)?{endedAt:at}:{})});};
    if(!alive(s,row.worker)||regard< -40||row.raiseRequestedAt&&at-row.raiseRequestedAt>=3*DAY)return end('已辞工','工人无法继续或不再接受现有工钱');
    if(base(e,s,row.worker)?.schedule?.restDays?.includes(e.calendar(at).day)){d.set(rec(row.id),{...row,nextWork:at+DAY});return;}
    if(personConstraint(e,s,row.worker,at)||worker.levy||worker.caring||worker.scheduleTravel||worker.cognitionTravel||worker.location!==row.location)return end('罢工','工人未到工坊或受拘押、服役、照护、在途限制');
    const start=Math.floor(at/DAY)*DAY+480;
    try{e.assertNpcObligationAction(d,[row.worker],{start,minutes:540,kind:'employment'});e.assertNpcAutonomyAction(s,[row.worker],{start,minutes:540});}
    catch(error){if(!/冲突|自主工作/.test(error.message))throw error;return end('罢工','本班与已有义务冲突');}
    if(!ownsWorkshop(s,row.location)||s.buildings?.[row.location]?.condition<=0)return end('罢工','工坊产权或状态不再可用');
    if(row.wage<wage&&row.raiseRequestedAt)return end('罢工','加薪要求尚未解决');
    if(financeBalance(d,e,'player')<row.wage)return end('罢工','雇主付不起本班工钱');
    const plan=employmentProductionPlan(d,e,{...row,owner:'player'});
    if(plan.reason)return end('罢工',plan.reason);
    if(financeBalance(d,e,'player')<row.wage+plan.fee)return end('罢工','工钱与工作台费用不足');
    financeTransfer(d,e,'player',row.worker,row.wage,`${row.id}:${at}`);
    const {quantity,...shift}=settleEmploymentProduction(d,e,{...row,owner:'player'},at,plan),eventId=`${row.id}:${at}`;
    const next={...row,nextWork:at+DAY,paid:row.paid+row.wage,produced:row.produced+quantity,status:row.wage<wage?'要求加薪':'有效',
        ...(row.wage<wage?{raiseRequestedAt:at,requestedWage:wage}:{}),shifts:[...row.shifts,{...shift,wage:row.wage}]};d.set(rec(row.id),next);
    financeEvent(d,e,{id:eventId,actor:row.worker,target:'player',minute:at,location:row.location,value:row.wage,tags:['workshop']});
}
export function advanceFinanceAssets(d,e,minute){
    for(const initial of all(d)){
        if(initial.kind==='equity'&&initial.status==='有效')for(let at=initial.nextDividend;at<=minute;at+=MONTH)payDividend(d,e,d.get(...rec(initial.id)),at);
        if(initial.kind==='asset_lease'&&initial.status==='有效'){
            for(let at=initial.nextRent;at<=minute&&at<initial.deadline;at+=MONTH)rentDue(d,e,d.get(...rec(initial.id)),at);
            if(minute>=initial.deadline)d.set(rec(initial.id),{...d.get(...rec(initial.id)),status:'已到期'});
        }
        if(initial.kind==='workshop'&&!initial.laborMarket&&['有效','要求加薪','罢工'].includes(initial.status)){
            for(let at=initial.nextWork;at<=minute&&at<initial.deadline;at+=DAY){const row=d.get(...rec(initial.id));if(!['有效','要求加薪','罢工'].includes(row.status))break;workshopShift(d,e,row,at);}
            if(minute>=initial.deadline&&['有效','要求加薪','罢工'].includes(d.get(...rec(initial.id),'status')))d.set(rec(initial.id),{...d.get(...rec(initial.id)),status:'已到期'});
        }
    }
    for(const [id,row]of Object.entries(d.get('state','records')??{}))if(row.kind==='rent'&&row.category==='debt'&&row.amount>row.paid&&row.deadline<=minute&&!row.defaulted){
        const legalCase=registerCreditDefault(d,e,{debt:id,row,value:row.amount-row.paid,minute:row.deadline});d.set(rec(id),{...row,status:'逾期',defaulted:{case:legalCase,remaining:row.amount-row.paid,minute:row.deadline}});
    }
}
