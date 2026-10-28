import {recordsWhere} from './storage.mjs';
import {preconditionFailure} from './precondition.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {purse,escrow as escrowAccount,treasury as treasuryAccount,moveCoins,coinRead} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {holdWorks,settleWorks,BOOKED as STOCK_BOOKED,priceRead,bagStock,settlementStock} from './stock.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {syncHoldingRecord} from './holding-sources.mjs';
declareHoldingWriter('public-projects',{kinds:['appointed','permit','owns'],entities:['office']});
declareLedgerWriter('public-projects',{sinks:['sink:consume']});
// S1b: 工程备料的账本入口，供工具分派（activities）与推进注册表的旧工程路径使用。
export const holdProjectWorks=(d,engine,project,amounts,from,eventId)=>holdWorks(d,engine,project,amounts,{from,writer:'public-projects',eventId});
export const settleProjectWorks=(d,engine,p,eventId)=>settleWorks(d,engine,p,{writer:'public-projects',eventId});
import {entityTransition} from './entity-transitions.mjs';
import {playerOffices,spendPublic,refundPublic,authorityOf} from './governance.mjs';
import {milestone} from './progression.mjs';
import {npcHousehold,npcAgeAt} from './npc-life.mjs';
import {changeItems} from './items.mjs';
import {prepareFacilityProject} from './facility-state.mjs';
import {completeFacilityProject} from './facilities.mjs';
import {currentEmployment,projectAssignment,projectAssignmentId} from './employment-state.mjs';
import {registerEarnedClaim} from './obligation-claims.mjs';

// T125 public works. A sitting official (works deputy or village head) starts
// a project in their own village: materials leave the village stock and the
// whole wage bill is drawn from the village treasury into the project escrow,
// both under the office's monthly cap and the treasury reserve. Each day the
// named workers who are able to work are paid from that escrow and the work
// advances; on completion the unspent escrow returns to the treasury and a
// public facility is registered. Aborting returns unused materials and escrow.
const DAY=1440;
const text=n=>{if(typeof n!=='string'||!n.trim()||n.length>80)throw preconditionFailure('需要工程名称');return n.trim();};
const int=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw preconditionFailure(`${label}须在${min}到${max}之间`);return n;};
const able=n=>n&&!['濒死','昏迷','患病'].includes(n.status);
const awake=n=>able(n)&&!n.scheduleTravel&&!n.cognitionTravel&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
function within(engine,location,place){const seen=new Set();while(location&&!seen.has(location)){if(location===place)return true;seen.add(location);location=engine.byId.get(location)?.parent;}return false;}

export const isPublicProject=p=>p?.type==='工程'&&Boolean(p.public);
export function startPublicProject(d,engine,args,eventId,settlement){
    if(args.funding!==undefined&&!['private','public'].includes(args.funding))throw preconditionFailure('工程出资须为private或public');
    const state=d.get('state'),privateFunding=args.funding==='private',offices=playerOffices(state,{settlement,power:'public_project'},engine);
    if(!privateFunding&&!offices.length)throw preconditionFailure('没有在任官职授予本村公共工程权限');
    const name=text(args.name),days=int(args.days,1,365,'工期'),wood=int(args.wood??0,0,10000,'木料'),stone=int(args.stone??0,0,10000,'石料');
    const plan=prepareFacilityProject(engine,state,args,settlement),location=plan.location;
    if(privateFunding&&!plan.building&&plan.facilityType==='house')throw preconditionFailure('私人住宅新建须使用本人宅基批文');
    const owner=plan.building?(state.buildings?.[plan.building]?.owner??state.created?.[plan.building]?.owner??engine.byId.get(plan.building)?.owner):null;
    if(plan.building&&owner!==(privateFunding?'player':settlement))throw preconditionFailure('工程出资方没有该建筑的修缮扩建权');
    if(privateFunding&&!plan.building&&(state.created?.[location]??engine.byId.get(location))?.owner!=='player')throw preconditionFailure('私人新建须有本人名下场地；住宅使用宅基批文');
    if(!within(engine,location,settlement))throw preconditionFailure('工程地点不在本村');
    const beneficiaries=args.beneficiaries??[settlement];
    if(!privateFunding&&(!beneficiaries.includes(settlement)||beneficiaries.includes('player')))throw preconditionFailure('公款工程的受益人须为本村，不能是本人');
    const workers=[...new Set((args.workers??[]).map(w=>engine.resolve(w,'npc')))].sort();
    if(!workers.length||workers.length>20)throw preconditionFailure('需要1到20名实际做工的人');
    if(days*workers.length<plan.requiredWork)throw preconditionFailure('工程实际工时不足');
    for(const id of workers){
        const n=state.npcs[id];
        if(currentEmployment(state,id)||projectAssignment(state,id))throw preconditionFailure('做工的人已有未结束的雇佣排班');
        if(!isEffective(engine,state,id)||!awake(n)||n.location!==state.location)throw preconditionFailure('做工的人须当面在场且清醒');
        if(npcHousehold(engine,state,id)?.settlement!==settlement||(npcAgeAt(engine,state,id)??0)<18)throw preconditionFailure('做工的人须是本村成年住户');
    }
    if(args.consent!==true)throw preconditionFailure('做工的人须当面同意工期与工钱');
    const row=state.settlements[settlement];
    if(privateFunding){for(const [item,n]of [['item_wood',wood],['item_stone',stone]])if(n&&bagStock(d,engine,{point:'projects.stock',id:'player',item,legacy:()=>engine.quantity(d,'player',item)})<n)throw preconditionFailure('自备工程材料不足');}
    else if(priceRead(d,{point:'projects.supply',account:settlementStock(engine,settlement,'wood'),legacy:()=>row.wood??0})<wood||priceRead(d,{point:'projects.supply',account:settlementStock(engine,settlement,'stone'),legacy:()=>row.stone??0})<stone)throw preconditionFailure('公共工程材料不足');
    const wage=authorityOf(engine).treasury.wagePerWorkerDayCopper,bill=wage*workers.length*days;
    const project=`project_${eventId}`;
    let spend;
    if(privateFunding){
        if(coinRead(d,{point:'projects.cash',account:purse(engine,'player'),legacy:()=>state.player.coins})<bill)throw preconditionFailure('私人工程工钱不足');
        for(const [item,n]of [['item_wood',wood],['item_stone',stone]])if(n)changeItems(d,engine,'player',item,-n,{books:STOCK_BOOKED});
        holdWorks(d,engine,project,{wood,stone},{from:{party:'player'},writer:'public-projects',eventId:project});
        moveCoins(d,{from:purse(engine,'player'),to:escrowAccount(project),amount:bill,writer:'public-projects',eventId:project});d.set(['state','player','coins'],state.player.coins-bill);
    }else{
        spend=spendPublic(d,engine,{settlement,copper:bill,power:'public_project',purpose:`工程工钱 ${name}`,sourceEvent:project,books:{account:escrowAccount(project),writer:'public-projects',eventId:project}});
        d.set(['state','settlements',settlement,'wood'],row.wood-wood);if(stone)d.set(['state','settlements',settlement,'stone'],row.stone-stone);
        holdWorks(d,engine,project,{wood,stone},{from:{settlement},writer:'public-projects',eventId:project});
    }
    const office=offices[0];
    const p={id:project,type:'工程',creator:'player',name,settlement,location,remainingDays:days,days,wood,stone,status:'施工中',beneficiaries,sourceEvent:eventId,...plan,
        public:{office:office?.id,workers,wage,escrow:bill,...(privateFunding?{payer:'player'}:{month:spend.month,spend:spend.id}),workedDays:0,labor:{},paid:{},lostDays:0,
            // F083: progress and pay follow real on-site minutes. The plan is `days` days of 480 minutes: for work measured in
            // worker-days (a facility's requiredWork) every crew member's minutes count, otherwise a day counts for its busiest worker.
            requiredMinutes:days*(plan.requiredWork?workers.length:1)*480,minutesDone:0,minutes:{},attendance:{}},
        ...(!privateFunding?{civicApproval:{settlement,office:office.id,grantor:office.appointedBy,minute:state.minute,source:office.source}}:{}),
        ...(plan.requiredWork?{remainingWork:days*workers.length}:{})};
    d.set(['state','projects',project],p);
    for(const worker of workers)holdingSet(d,null,['state','records',projectAssignmentId(project,worker)],{id:projectAssignmentId(project,worker),category:'project_assignment',project,worker,settlement,location,starts:state.minute,status:'有效',source:eventId},'public-projects');
    return {project,escrow:bill,note:privateFunding?'自备材料与本人工钱已投入，按实际人工支付。':'工钱已从公账押入工程，按实际做工日付给本人；材料已从公共库存拨出。'};
}
function settleLabor(d,p,minute){
    for(const [npc,days]of Object.entries(p.public.labor)){
        const key=`civic_source:${p.id}:${npc}`;
        if(!d.get('state','records',key))holdingSet(d,null,['state','records',key],{category:'civic_contribution',sourceEvent:`${p.id}:${npc}`,settlement:p.settlement,subject:npc,kind:'project_labor',points:days,minute},'public-projects');
    }
}
function finish(d,engine,p,status,minute,eventId){
    const escrow=p.public.escrow;
    const next={...p,status,remainingDays:status==='已完成'?0:p.remainingDays,public:{...p.public,escrow:0},closedAt:minute};
    if(escrow){if(p.public.payer){moveCoins(d,{from:escrowAccount(p.id),to:purse(engine,'player'),amount:escrow,writer:'public-projects',eventId:`${p.id}:refund`});d.set(['state','player','coins'],d.get('state','player','coins')+escrow);}
    else refundPublic(d,{settlement:p.settlement,copper:escrow,month:p.public.month,purpose:`工程结余退回 ${p.name}`,sourceEvent:`${p.id}:refund`,books:{account:escrowAccount(p.id),writer:'public-projects',eventId:`${p.id}:refund`}});}
    if(status==='已完成'){next.facility=completeFacilityProject(d,engine,p,minute);settleWorks(d,engine,p,{writer:'public-projects',eventId:`${p.id}:works`});}
    else{
        // Materials go in evenly over the planned days; the unused share returns.
        const used=k=>Math.floor(p[k]*p.public.minutesDone/p.public.requiredMinutes),back={wood:p.wood-used('wood'),stone:p.stone-used('stone')};
        const s=d.get('state','settlements',p.settlement);
        settleWorks(d,engine,p,{returned:back,to:p.public.payer?{party:p.public.payer}:{settlement:p.settlement},writer:'public-projects',eventId:`${p.id}:works`});
        if(p.public.payer){for(const [item,n]of [['item_wood',back.wood],['item_stone',back.stone]])if(n)changeItems(d,engine,'player',item,n,{books:STOCK_BOOKED,carryExempt:true});}
        else{d.set(['state','settlements',p.settlement,'wood'],s.wood+back.wood);if(back.stone)d.set(['state','settlements',p.settlement,'stone'],(s.stone??0)+back.stone);}
        next.returned={...back,copper:escrow};
    }
    if(!p.public.payer)settleLabor(d,next,minute);
    d.set(['state','projects',p.id],next);
    for(const worker of p.public.workers){
        const id=projectAssignmentId(p.id,worker),row=d.get('state','records',id);
        if(row?.status==='有效')holdingSet(d,null,['state','records',id],{...row,status:'已结束',endedAt:minute},'public-projects');
    }
    if(status==='已完成'&&!p.public.payer)milestone(d,engine,'publicContribution',p.id,eventId);
    return next;
}
export function abortPublicProject(d,engine,args){
    const p=d.get('state','projects',args.project);
    if(!isPublicProject(p))throw preconditionFailure('没有这个公款工程');
    if(p.status!=='施工中')return {project:p.id,status:p.status,duplicate:true};
    if(!p.public.payer&&!playerOffices(d.get('state'),{settlement:p.settlement,power:'public_project'},engine).length)throw preconditionFailure('没有在任官职可中止本村工程');
    const row=finish(d,engine,p,'已中止',d.get('state','minute'));
    return {project:p.id,status:row.status,returned:row.returned};
}
// One step per elapsed midnight (F083). The crew's day is what the schedule really measured at the site
// (recordProjectAttendance): late arrival, absence, illness, levy or other duties cost exactly those minutes.
// Pay is the signed day wage pro rata to credited minutes (cumulative, so rounding never loses or invents
// copper); progress is the same credited minutes. Escrow was sized for the planned minutes, so it always covers it.
export function advancePublicProjects(d,engine,{before,after,id}){
    for(let day=Math.floor(before/DAY);day<Math.floor(after/DAY);day++){
        for(const [key,p]of Object.entries(d.get('state','projects')??{}).sort(([a],[b])=>a.localeCompare(b))){
            if(!isPublicProject(p)||p.status!=='施工中')continue;
            const pub=structuredClone(p.public),crew=pub.workers.length,workerDays=p.remainingWork!==undefined;
            const attended=pub.workers.map(w=>[w,pub.attendance?.[w]?.days?.[day]??0]).filter(([,m])=>m>0).sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0]));
            const left=pub.requiredMinutes-pub.minutesDone;
            const progress=Math.min(left,workerDays?attended.reduce((n,[,m])=>n+m,0):Math.max(0,...attended.map(([,m])=>m)));
            if(progress<=0){pub.lostDays++;d.set(['state','projects',key],{...p,public:pub});continue;}
            // Workers share a final partial day equally (smallest claim first); a duration project credits each at most the day's progress.
            let rest=progress;
            attended.forEach(([w,m],i)=>{
                const credit=Math.min(m,workerDays?Math.floor(rest/(attended.length-i)):progress);
                if(workerDays)rest-=credit;
                pub.minutes[w]=(pub.minutes[w]??0)+credit;
                const pay=Math.min(pub.escrow,Math.floor(pub.wage*pub.minutes[w]/480)-(pub.paid[w]??0));
                if(credit<=0||pay<=0)return;
                const state=d.get('state');
                moveCoins(d,{from:escrowAccount(key),to:purse(engine,w),amount:pay,writer:'public-projects',eventId:`${key}:${day}`});d.set(['state','npcs',w,'coins'],(state.npcs[w].coins??0)+pay);
                registerEarnedClaim(d,engine,{id:`public_wage:${key}:${day}:${w}`,kind:'wage',debtor:p.public.payer??p.settlement,creditor:w,amount:pay,paid:pay,status:'已还清',createdAt:(day+1)*DAY,deadline:(day+1)*DAY,location:p.location,source:key,project:key,minutes:credit});
                pub.escrow-=pay;pub.paid[w]=(pub.paid[w]??0)+pay;
            });
            for(const w of pub.workers)if((pub.minutes[w]??0)>=480)pub.labor[w]=Math.floor(pub.minutes[w]/480);
            pub.workedDays++;pub.minutesDone+=progress;
            const remaining=pub.requiredMinutes-pub.minutesDone;
            const next={...p,public:pub,remainingDays:Math.ceil(remaining/(480*(workerDays?crew:1))),...(workerDays?{remainingWork:Math.ceil(remaining/480)}:{})};
            if(remaining<=0)finish(d,engine,next,'已完成',(day+1)*DAY,id);
            else d.set(['state','projects',key],next);
        }
    }
}

// ---------------------------------------------------------------- housing (T126)
// A sitting village head writes housing rules for an NPC steward: which of the
// village's registered plots, the fee (bounded by the plot's published fee) and
// the term. Applications are filed at the village hall; each day at 10:00 the
// steward handles due applications by those rules alone. A fit applicant pays
// the plot fee into the village account and receives a permit to one free slot;
// an applicant outside the rules is returned. Ground rent falls due yearly and
// is collected on the same daily round. Approval is not construction: the
// permit holder builds separately with their own materials.
const PROCESS_MINUTE=600,YEAR=360*DAY;
const rec=id=>['state','records',id];
function plotsOf(engine,settlement){return Object.values(authorityOf(engine)?.plots??{}).filter(p=>p.settlement===settlement);}
function plotByArg(engine,settlement,arg){
    const plots=plotsOf(engine,settlement),place=()=>{try{return engine.resolve(arg);}catch{return null;}};
    const id=arg&&(plots.find(p=>p.id===arg||p.name===arg)?.id??plots.find(p=>p.location===place())?.id);
    const plot=plots.find(p=>p.id===id);if(!plot)throw preconditionFailure('不是本村登记的宅基地块');
    return plot;
}
function adultResident(engine,state,id,settlement){return npcHousehold(engine,state,id)?.settlement===settlement&&(npcAgeAt(engine,state,id)??0)>=18&&isEffective(engine,state,id);}
export function grantHousingSteward(d,engine,args,eventId,settlement,hall){
    const state=d.get('state');
    if(!playerOffices(state,{settlement,power:'steward'},engine).length)throw preconditionFailure('没有在任村长官职，未登记建房审批与派管事的权限');
    if(state.location!==hall)throw preconditionFailure('须在本村登记议事屋当面交代');
    const steward=engine.resolve(args.steward,'npc'),n=state.npcs[steward];
    if(!isEffective(engine,state,steward)||!awake(n)||n.location!==hall||!adultResident(engine,state,steward,settlement)||args.consent!==true)throw preconditionFailure('管事须为在场清醒的本村成年住户并明确同意');
    const office=authorityOf(engine).offices.office_village_steward;
    const plots=args.plot?[plotByArg(engine,settlement,args.plot)]:plotsOf(engine,settlement);
    const fees=Object.fromEntries(plots.map(p=>{
        const fee=args.proposedFee??p.feeCopper;
        if(!Number.isSafeInteger(fee)||fee<0||fee>p.feeCopper*2)throw preconditionFailure(`宅基费须在0到${p.feeCopper*2}铜之间`);
        return [p.id,fee];
    }));
    const minutes=Math.min(args.minutes??office.termDays*DAY,office.termDays*DAY);
    if(!Number.isSafeInteger(minutes)||minutes<DAY)throw preconditionFailure('管事期限至少一日');
    const id=`housing_steward:${eventId}`;if(d.get(...rec(id)))throw preconditionFailure('事务编号已占用');
    const row={category:'housing_steward',id,settlement,grantor:'player',steward,hall,rules:{plots:plots.map(p=>p.id),fees,eligibility:'resident'},
        createdAt:state.minute,expires:state.minute+minutes,revoked:false,source:office.source,sourceEvent:eventId};
    holdingSet(d,null,rec(id),row,'public-projects');syncHoldingRecord(d,engine,id,{writer:'public-projects',eventId});
    entityTransition(d,engine,{id:`${id}:appoint`,verb:'appoint',actor:'player',target:steward,location:hall,office:'office_village_steward',summary:`${engine.byId.get(steward)?.name??steward}受任宅基管事`});
    return {authorization:id,steward:row};
}
export function revokeHousingSteward(d,a,engine){
    if(a.revoked)return {authorization:a.id,steward:a,duplicate:true};
    if(!playerOffices(d.get('state'),{settlement:a.settlement,power:'steward'},engine).length)throw preconditionFailure('只有在任村长可撤回管事');
    const row={...a,revoked:true,revokedAt:d.get('state','minute')};holdingSet(d,null,rec(a.id),row,'public-projects');syncHoldingRecord(d,engine,a.id,{writer:'public-projects'});
    entityTransition(d,engine,{id:`${a.id}:dismiss`,verb:'dismiss',actor:'player',target:a.steward,location:a.hall,office:'office_village_steward',summary:`${engine.byId.get(a.steward)?.name??a.steward}不再担任宅基管事`});
    return {authorization:a.id,steward:row};
}
export function fileHousingApplication(d,engine,args,eventId,settlement,a){
    const state=d.get('state');
    if(state.location!==a.hall)throw preconditionFailure('须在本村登记议事屋递交建房申请');
    const applicant=!args.speaker||args.speaker==='player'?'player':engine.resolve(args.speaker,'npc');
    if(applicant!=='player'&&((!isEffective(engine,state,applicant)||!awake(state.npcs[applicant]))||state.npcs[applicant].location!==a.hall||args.consent!==true))throw preconditionFailure('申请人须本人在场并同意');
    const plot=plotByArg(engine,settlement,args.plot);
    const now=state.minute,day=Math.floor(now/DAY),due=now<day*DAY+PROCESS_MINUTE?day*DAY+PROCESS_MINUTE:(day+1)*DAY+PROCESS_MINUTE;
    const id=`housing_application:${eventId}`;if(d.get(...rec(id)))throw preconditionFailure('事务编号已占用');
    const row={category:'housing_application',id,settlement,applicant,plot:plot.id,authorization:a.id,steward:a.steward,status:'待管事办理',due,filedAt:now,sourceEvent:eventId};
    holdingSet(d,null,rec(id),row,'public-projects');return {application:id,pending:row,note:'管事在约定办理时刻按村长写定的规矩处理；批准只给宅基，不代建。'};
}
const permits=(state,plot)=>Object.values(state.records??{}).filter(r=>r.category==='housing_permit'&&r.plot===plot&&r.status!=='已收回');
const coinsOf=(state,who)=>who==='player'?state.player.coins:state.npcs[who]?.coins??0;
function pay(d,who,settlement,copper){
    moveCoins(d,{from:purse(null,who),to:treasuryAccount(settlement),amount:copper,writer:'public-projects'});
    const p=who==='player'?['state','player','coins']:['state','npcs',who,'coins'];
    d.set(p,d.get(...p)-copper);d.set(['state','settlements',settlement,'treasury'],d.get('state','settlements',settlement,'treasury')+copper);
}
function handle(d,engine,r,at){
    const state=d.get('state'),a=state.records[r.authorization],plot=authorityOf(engine).plots[r.plot],returned=reason=>{holdingSet(d,null,rec(r.id),{...r,status:'已退回',decidedAt:at,reason},'public-projects');};
    const s=state.npcs[r.steward];
    if(a?.employment){const job=state.records[a.employment];
        if(!job?.domainSteward||job.worker!==r.steward||job.owner!==a.grantor||!['有效','要求加薪'].includes(job.status)||job.deadline<=at)return returned('管事雇佣已停止');
        if(!job.shifts?.some(shift=>shift.minute===at&&shift.paid===shift.earned&&shift.paid>0)){holdingSet(d,null,rec(r.id),{...r,due:at+DAY},'public-projects');return;}
    }
    // A steward who cannot work today leaves the file for tomorrow.
    if(!isEffective(engine,d,r.steward)||!s||['濒死','昏迷','患病'].includes(s.status)){if(!isEffective(engine,d,r.steward))returned('管事已故或失效，申请退回');else holdingSet(d,null,rec(r.id),{...r,due:r.due+DAY,delays:(r.delays??0)+1},'public-projects');return;}
    if(!a||a.revoked||a.expires<=at)return returned('管事授权已撤回或到期');
    if(!playerOffices(state,{settlement:r.settlement,power:'housing'},engine).length)return returned('授权的村长已不在任，管事无权批准');
    if(!a.rules.plots.includes(r.plot))return returned('所申地块不在村长写定的范围内');
    const resident=r.applicant==='player'?state.records[`civic_resident:${r.settlement}:player`]?.category==='civic_resident':adultResident(engine,state,r.applicant,r.settlement);
    if(!resident)return returned('申请人不是本村登记居民');
    const slot=permits(state,r.plot).length;
    if(slot>=plot.slots)return returned('地块已无空余宅基');
    const fee=a.rules.fees[r.plot];
    if(coinsOf(state,r.applicant)<fee)return returned('申请人当场交不出宅基费');
    pay(d,r.applicant,r.settlement,fee);
    const permit=`housing_permit:${r.id.slice('housing_application:'.length)}`;
    holdingSet(d,null,rec(permit),{category:'housing_permit',id:permit,settlement:r.settlement,plot:r.plot,location:plot.location,slot:slot+1,holder:r.applicant,steward:r.steward,
        feePaid:fee,annualRentCopper:plot.annualRentCopper,rentDue:at+YEAR,arrears:0,materials:plot.materials,buildDays:plot.buildDays,status:'已批准',approvedAt:at,application:r.id},'public-projects');
    holdingSet(d,null,rec(`housing_fee:${r.id}`),{category:'housing_fee',settlement:r.settlement,payer:r.applicant,copper:fee,kind:'宅基费',minute:at,permit,sourceEvent:r.id},'public-projects');
    holdingSet(d,null,rec(r.id),{...r,status:'已批准',decidedAt:at,permit},'public-projects');
}
export function processEmployedHousing(d,engine,contract,at){
 for(const r of Object.values(d.get('state','records')??{}))if(r.category==='housing_application'&&r.status==='待管事办理'&&r.filedAt<=at&&d.get('state','records',r.authorization)?.employment===contract.id)handle(d,engine,r,at);
}
function collectRent(d,p,at){
    const state=d.get('state'),due=p.annualRentCopper+p.arrears;
    if(coinsOf(state,p.holder)>=due){
        pay(d,p.holder,p.settlement,due);
        holdingSet(d,null,rec(`housing_fee:${p.id}:${p.rentDue}`),{category:'housing_fee',settlement:p.settlement,payer:p.holder,copper:due,kind:'地租',minute:at,permit:p.id,sourceEvent:p.id},'public-projects');
        holdingSet(d,null,rec(p.id),{...p,arrears:0,rentDue:p.rentDue+YEAR},'public-projects');
    }else holdingSet(d,null,rec(p.id),{...p,arrears:due,rentDue:p.rentDue+YEAR,lastUnpaid:at},'public-projects');
}
const housingDue=state=>[...recordsWhere(state.records,'category','housing_application'),...recordsWhere(state.records,'category','housing_permit')].flatMap(r=>r.category==='housing_application'&&r.status==='待管事办理'?[r.due]:r.category==='housing_permit'&&r.status!=='已收回'?[r.rentDue]:[]);
export function nextHousingMinute(state,now){return Math.min(Infinity,...housingDue(state).filter(m=>m>now));}
export function advanceHousing(d,engine,{after}){
    for(let guard=0;guard<10000;guard++){
        const rows=Object.values(d.get('state','records')??{}).filter(r=>r.category==='housing_application'&&r.status==='待管事办理'&&r.due<=after||r.category==='housing_permit'&&r.status!=='已收回'&&r.rentDue<=after)
            .sort((a,b)=>(a.due??a.rentDue)-(b.due??b.rentDue)||a.id.localeCompare(b.id));
        if(!rows.length)return;
        const r=rows[0];
        if(r.category==='housing_application')handle(d,engine,r,r.due);else collectRent(d,r,r.rentDue);
    }
}
// Construction is the holder's own: their materials, the plot's build days.
export function startHouse(d,engine,args,eventId,permitId){
    const p=d.get(...rec(permitId)),state=d.get('state');
    const holder=args.speaker&&args.speaker!=='player'?engine.resolve(args.speaker,'npc'):'player';
    if(p?.category!=='housing_permit'||p.holder!==holder)throw preconditionFailure('没有本人名下的宅基批文');
    if(holder!=='player'&&((!isEffective(engine,state,holder)||!awake(state.npcs[holder]))||state.npcs[holder].location!==state.location||args.consent!==true))throw preconditionFailure('建房人须本人在场同意');
    if(p.status!=='已批准')throw preconditionFailure('这块宅基已开工或已收回');
    if(state.location!==p.location)throw preconditionFailure('须到宅基所在地开工');
    for(const [item,n]of [['item_wood',p.materials.wood],['item_stone',p.materials.stone]])if(n&&engine.quantity(d,holder,item)<n)throw preconditionFailure('自备建房材料不足');
    for(const [item,n]of [['item_wood',p.materials.wood],['item_stone',p.materials.stone]])if(n)changeItems(d,engine,holder,item,-n,{books:STOCK_BOOKED});
    const project=`project_${eventId}`;holdWorks(d,engine,project,p.materials,{from:{party:holder},writer:'public-projects',eventId});
    d.set(['state','projects',project],{id:project,type:'建房',creator:holder,name:text(args.name??'自家宅屋'),settlement:p.settlement,location:p.location,permit:p.id,facilityType:'house',material:p.materials.stone>p.materials.wood?'stone':'wood',
        remainingDays:p.buildDays,days:p.buildDays,wood:p.materials.wood,stone:p.materials.stone,status:'施工中',sourceEvent:eventId});
    holdingSet(d,null,rec(p.id),{...p,status:'施工中',project},'public-projects');
    return {project,note:'自备材料已投入；按宅基工期逐日施工。'};
}
export function advanceHouses(d,engine,{before,after}){
    const days=Math.floor(after/DAY)-Math.floor(before/DAY);if(!days)return;
    for(const [key,p]of Object.entries(d.get('state','projects')??{}).sort(([a],[b])=>a.localeCompare(b))){
        if(p.type!=='建房'||p.status!=='施工中')continue;
        if(p.creator!=='player'&&((!isEffective(engine,d,p.creator)||!able(d.get('state','npcs',p.creator)))||d.get('state','npcs',p.creator,'levy')||d.get('state','npcs',p.creator,'caring')))continue;
        const hired=Object.values(d.get('state','records')??{}).some(r=>r.laborMarket===1&&r.project===key);
        const remainingDays=hired?Math.ceil(p.remainingWork??p.remainingDays):Math.max(0,p.remainingDays-days);
        if(remainingDays){d.set(['state','projects',key],{...p,remainingDays});continue;}
        const id=completeFacilityProject(d,engine,p);
        holdingSet(d,null,['state','buildings',id,'permit'],p.permit,'public-projects');
        d.set(['state','projects',key],{...p,remainingDays:0,status:'已完成',facility:id});settleWorks(d,engine,p,{writer:'public-projects',eventId:`${key}:works`});
        holdingSet(d,null,rec(p.permit),{...d.get(...rec(p.permit)),status:'已建成',building:id},'public-projects');
    }
}
