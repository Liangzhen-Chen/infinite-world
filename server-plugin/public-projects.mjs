import {purse,escrow as escrowAccount,treasury as treasuryAccount,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('public-projects');
import {entityTransition} from './entity-transitions.mjs';
import {playerOffices,spendPublic,refundPublic,authorityOf} from './governance.mjs';
import {milestone} from './progression.mjs';
import {npcHousehold,npcAgeAt} from './npc-life.mjs';
import {changeItems} from './items.mjs';
import {prepareFacilityProject} from './facility-state.mjs';
import {completeFacilityProject} from './facilities.mjs';
import {currentEmployment,employmentReservation} from './employment-state.mjs';

// T125 public works. A sitting official (works deputy or village head) starts
// a project in their own village: materials leave the village stock and the
// whole wage bill is drawn from the village treasury into the project escrow,
// both under the office's monthly cap and the treasury reserve. Each day the
// named workers who are able to work are paid from that escrow and the work
// advances; on completion the unspent escrow returns to the treasury and a
// public facility is registered. Aborting returns unused materials and escrow.
const DAY=1440;
const text=n=>{if(typeof n!=='string'||!n.trim()||n.length>80)throw Error('需要工程名称');return n.trim();};
const int=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`${label}须在${min}到${max}之间`);return n;};
const able=n=>n&&!['死亡','濒死','昏迷','患病'].includes(n.status);
const awake=n=>able(n)&&!n.scheduleTravel&&!n.cognitionTravel&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
function within(engine,location,place){const seen=new Set();while(location&&!seen.has(location)){if(location===place)return true;seen.add(location);location=engine.byId.get(location)?.parent;}return false;}

export const isPublicProject=p=>p?.type==='工程'&&Boolean(p.public);
export function startPublicProject(d,engine,args,eventId,settlement){
    if(args.funding!==undefined&&!['private','public'].includes(args.funding))throw Error('工程出资须为private或public');
    const state=d.get('state'),privateFunding=args.funding==='private',offices=playerOffices(state,{settlement,power:'public_project'},engine);
    if(!privateFunding&&!offices.length)throw Error('没有在任官职授予本村公共工程权限');
    const name=text(args.name),days=int(args.days,1,365,'工期'),wood=int(args.wood??0,0,10000,'木料'),stone=int(args.stone??0,0,10000,'石料');
    const plan=prepareFacilityProject(engine,state,args,settlement),location=plan.location;
    if(privateFunding&&!plan.building&&plan.facilityType==='house')throw Error('私人住宅新建须使用本人宅基批文');
    const owner=plan.building?(state.buildings?.[plan.building]?.owner??state.created?.[plan.building]?.owner??engine.byId.get(plan.building)?.owner):null;
    if(plan.building&&owner!==(privateFunding?'player':settlement))throw Error('工程出资方没有该建筑的修缮扩建权');
    if(privateFunding&&!plan.building&&(state.created?.[location]??engine.byId.get(location))?.owner!=='player')throw Error('私人新建须有本人名下场地；住宅使用宅基批文');
    if(!within(engine,location,settlement))throw Error('工程地点不在本村');
    const beneficiaries=args.beneficiaries??[settlement];
    if(!privateFunding&&(!beneficiaries.includes(settlement)||beneficiaries.includes('player')))throw Error('公款工程的受益人须为本村，不能是本人');
    const workers=[...new Set((args.workers??[]).map(w=>engine.resolve(w,'npc')))].sort();
    if(!workers.length||workers.length>20)throw Error('需要1到20名实际做工的人');
    if(days*workers.length<plan.requiredWork)throw Error('工程实际工时不足');
    for(const id of workers){
        const n=state.npcs[id];
        if(currentEmployment(state,id))throw Error('做工的人已有未结束的雇佣排班');
        if(!awake(n)||n.location!==state.location)throw Error('做工的人须当面在场且清醒');
        if(npcHousehold(engine,state,id)?.settlement!==settlement||(npcAgeAt(engine,state,id)??0)<18)throw Error('做工的人须是本村成年住户');
    }
    if(args.consent!==true)throw Error('做工的人须当面同意工期与工钱');
    const row=state.settlements[settlement];
    if(privateFunding){for(const [item,n]of [['item_wood',wood],['item_stone',stone]])if(n&&engine.quantity(d,'player',item)<n)throw Error('自备工程材料不足');}
    else if((row.wood??0)<wood||(row.stone??0)<stone)throw Error('公共工程材料不足');
    const wage=authorityOf(engine).treasury.wagePerWorkerDayCopper,bill=wage*workers.length*days;
    const project=`project_${eventId}`;
    let spend;
    if(privateFunding){
        if(state.player.coins<bill)throw Error('私人工程工钱不足');
        for(const [item,n]of [['item_wood',wood],['item_stone',stone]])if(n)changeItems(d,engine,'player',item,-n);
        moveCoins(d,{from:purse(engine,'player'),to:escrowAccount(project),amount:bill,writer:'public-projects',eventId:project});d.set(['state','player','coins'],state.player.coins-bill);
    }else{
        spend=spendPublic(d,engine,{settlement,copper:bill,power:'public_project',purpose:`工程工钱 ${name}`,sourceEvent:project,books:{account:escrowAccount(project),writer:'public-projects',eventId:project}});
        d.set(['state','settlements',settlement,'wood'],row.wood-wood);if(stone)d.set(['state','settlements',settlement,'stone'],row.stone-stone);
    }
    const office=offices[0];
    const p={id:project,type:'工程',creator:'player',name,settlement,location,remainingDays:days,days,wood,stone,status:'施工中',beneficiaries,sourceEvent:eventId,...plan,
        public:{office:office?.id,workers,wage,escrow:bill,...(privateFunding?{payer:'player'}:{month:spend.month,spend:spend.id}),workedDays:0,labor:{},paid:{},lostDays:0},
        ...(!privateFunding?{civicApproval:{settlement,office:office.id,grantor:office.appointedBy,minute:state.minute,source:office.source}}:{}),
        ...(plan.requiredWork?{remainingWork:days*workers.length}:{})};
    d.set(['state','projects',project],p);
    return {project,escrow:bill,note:privateFunding?'自备材料与本人工钱已投入，按实际人工支付。':'工钱已从公账押入工程，按实际做工日付给本人；材料已从公共库存拨出。'};
}
function settleLabor(d,p,minute){
    for(const [npc,days]of Object.entries(p.public.labor)){
        const key=`civic_source:${p.id}:${npc}`;
        if(!d.get('state','records',key))d.set(['state','records',key],{category:'civic_contribution',sourceEvent:`${p.id}:${npc}`,settlement:p.settlement,subject:npc,kind:'project_labor',points:days,minute});
    }
}
function finish(d,engine,p,status,minute,eventId){
    const escrow=p.public.escrow;
    const next={...p,status,remainingDays:status==='已完成'?0:p.remainingDays,public:{...p.public,escrow:0},closedAt:minute};
    if(escrow){if(p.public.payer){moveCoins(d,{from:escrowAccount(p.id),to:purse(engine,'player'),amount:escrow,writer:'public-projects',eventId:`${p.id}:refund`});d.set(['state','player','coins'],d.get('state','player','coins')+escrow);}
    else refundPublic(d,{settlement:p.settlement,copper:escrow,month:p.public.month,purpose:`工程结余退回 ${p.name}`,sourceEvent:`${p.id}:refund`,books:{account:escrowAccount(p.id),writer:'public-projects',eventId:`${p.id}:refund`}});}
    if(status==='已完成'){next.facility=completeFacilityProject(d,engine,p,minute);}
    else{
        // Materials go in evenly over the planned days; the unused share returns.
        const fraction=p.remainingWork===undefined?p.public.workedDays/p.days:1-p.remainingWork/(p.days*p.public.workers.length);
        const used=k=>Math.floor(p[k]*fraction),back={wood:p.wood-used('wood'),stone:p.stone-used('stone')};
        const s=d.get('state','settlements',p.settlement);
        if(p.public.payer){for(const [item,n]of [['item_wood',back.wood],['item_stone',back.stone]])if(n)changeItems(d,engine,'player',item,n);}
        else{d.set(['state','settlements',p.settlement,'wood'],s.wood+back.wood);if(back.stone)d.set(['state','settlements',p.settlement,'stone'],(s.stone??0)+back.stone);}
        next.returned={...back,copper:escrow};
    }
    if(!p.public.payer)settleLabor(d,next,minute);
    d.set(['state','projects',p.id],next);
    if(status==='已完成'&&!p.public.payer)milestone(d,engine,'publicContribution',p.id,eventId);
    return next;
}
export function abortPublicProject(d,engine,args){
    const p=d.get('state','projects',args.project);
    if(!isPublicProject(p))throw Error('没有这个公款工程');
    if(p.status!=='施工中')return {project:p.id,status:p.status,duplicate:true};
    if(!p.public.payer&&!playerOffices(d.get('state'),{settlement:p.settlement,power:'public_project'},engine).length)throw Error('没有在任官职可中止本村工程');
    const row=finish(d,engine,p,'已中止',d.get('state','minute'));
    return {project:p.id,status:row.status,returned:row.returned};
}
// One step per elapsed midnight: able workers are paid and the work advances.
export function advancePublicProjects(d,engine,{before,after,id}){
    for(let day=Math.floor(before/DAY);day<Math.floor(after/DAY);day++){
        const worked=new Set(Object.values(d.get('state','projects')??{}).flatMap(p=>Object.entries(p.public?.lastPaidDay??{}).filter(([,at])=>at===day).map(([npc])=>npc)));
        for(const [key,p]of Object.entries(d.get('state','projects')??{}).sort(([a],[b])=>a.localeCompare(b))){
            if(!isPublicProject(p)||p.status!=='施工中')continue;
            const state=d.get('state'),present=p.building&&state.buildings?.[p.building]?.burning?[]:p.public.workers.filter(w=>!worked.has(w)&&able(state.npcs[w])&&!state.npcs[w].levy&&!state.npcs[w].caring&&!employmentReservation(state,w,day*DAY+480,540,engine.byId.get(w)?.schedule?.restDays??[])).slice(0,p.remainingWork??20);
            const pub=structuredClone(p.public);
            if(!present.length){pub.lostDays++;d.set(['state','projects',key],{...p,public:pub});continue;}
            for(const w of present){
                moveCoins(d,{from:escrowAccount(key),to:purse(engine,w),amount:pub.wage,writer:'public-projects',eventId:`${key}:${day}`});d.set(['state','npcs',w,'coins'],(state.npcs[w].coins??0)+pub.wage);
                pub.escrow-=pub.wage;pub.paid[w]=(pub.paid[w]??0)+pub.wage;pub.labor[w]=(pub.labor[w]??0)+1;
                (pub.lastPaidDay??={})[w]=day;worked.add(w);
            }
            pub.workedDays++;
            const remainingWork=p.remainingWork===undefined?undefined:p.remainingWork-present.length;
            const next={...p,public:pub,remainingDays:remainingWork===undefined?p.remainingDays-1:Math.ceil(remainingWork/p.public.workers.length),...(remainingWork===undefined?{}:{remainingWork})};
            if(next.remainingDays<=0)finish(d,engine,next,'已完成',(day+1)*DAY,id);
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
    const plot=plots.find(p=>p.id===id);if(!plot)throw Error('不是本村登记的宅基地块');
    return plot;
}
function adultResident(engine,state,id,settlement){return npcHousehold(engine,state,id)?.settlement===settlement&&(npcAgeAt(engine,state,id)??0)>=18&&state.npcs[id]?.status!=='死亡';}
export function grantHousingSteward(d,engine,args,eventId,settlement,hall){
    const state=d.get('state');
    if(!playerOffices(state,{settlement,power:'steward'},engine).length)throw Error('没有在任村长官职，未登记建房审批与派管事的权限');
    if(state.location!==hall)throw Error('须在本村登记议事屋当面交代');
    const steward=engine.resolve(args.steward,'npc'),n=state.npcs[steward];
    if(!awake(n)||n.location!==hall||!adultResident(engine,state,steward,settlement)||args.consent!==true)throw Error('管事须为在场清醒的本村成年住户并明确同意');
    const office=authorityOf(engine).offices.office_village_steward;
    const plots=args.plot?[plotByArg(engine,settlement,args.plot)]:plotsOf(engine,settlement);
    const fees=Object.fromEntries(plots.map(p=>{
        const fee=args.proposedFee??p.feeCopper;
        if(!Number.isSafeInteger(fee)||fee<0||fee>p.feeCopper*2)throw Error(`宅基费须在0到${p.feeCopper*2}铜之间`);
        return [p.id,fee];
    }));
    const minutes=Math.min(args.minutes??office.termDays*DAY,office.termDays*DAY);
    if(!Number.isSafeInteger(minutes)||minutes<DAY)throw Error('管事期限至少一日');
    const id=`housing_steward:${eventId}`;if(d.get(...rec(id)))throw Error('事务编号已占用');
    const row={category:'housing_steward',id,settlement,grantor:'player',steward,hall,rules:{plots:plots.map(p=>p.id),fees,eligibility:'resident'},
        createdAt:state.minute,expires:state.minute+minutes,revoked:false,source:office.source,sourceEvent:eventId};
    d.set(rec(id),row);
    entityTransition(d,engine,{id:`${id}:appoint`,verb:'appoint',actor:'player',target:steward,location:hall,office:'office_village_steward',summary:`${engine.byId.get(steward)?.name??steward}受任宅基管事`});
    return {authorization:id,steward:row};
}
export function revokeHousingSteward(d,a,engine){
    if(a.revoked)return {authorization:a.id,steward:a,duplicate:true};
    if(!playerOffices(d.get('state'),{settlement:a.settlement,power:'steward'},engine).length)throw Error('只有在任村长可撤回管事');
    const row={...a,revoked:true,revokedAt:d.get('state','minute')};d.set(rec(a.id),row);
    entityTransition(d,engine,{id:`${a.id}:dismiss`,verb:'dismiss',actor:'player',target:a.steward,location:a.hall,office:'office_village_steward',summary:`${engine.byId.get(a.steward)?.name??a.steward}不再担任宅基管事`});
    return {authorization:a.id,steward:row};
}
export function fileHousingApplication(d,engine,args,eventId,settlement,a){
    const state=d.get('state');
    if(state.location!==a.hall)throw Error('须在本村登记议事屋递交建房申请');
    const applicant=!args.speaker||args.speaker==='player'?'player':engine.resolve(args.speaker,'npc');
    if(applicant!=='player'&&(!awake(state.npcs[applicant])||state.npcs[applicant].location!==a.hall||args.consent!==true))throw Error('申请人须本人在场并同意');
    const plot=plotByArg(engine,settlement,args.plot);
    const now=state.minute,day=Math.floor(now/DAY),due=now<day*DAY+PROCESS_MINUTE?day*DAY+PROCESS_MINUTE:(day+1)*DAY+PROCESS_MINUTE;
    const id=`housing_application:${eventId}`;if(d.get(...rec(id)))throw Error('事务编号已占用');
    const row={category:'housing_application',id,settlement,applicant,plot:plot.id,authorization:a.id,steward:a.steward,status:'待管事办理',due,filedAt:now,sourceEvent:eventId};
    d.set(rec(id),row);return {application:id,pending:row,note:'管事在约定办理时刻按村长写定的规矩处理；批准只给宅基，不代建。'};
}
const permits=(state,plot)=>Object.values(state.records??{}).filter(r=>r.category==='housing_permit'&&r.plot===plot&&r.status!=='已收回');
const coinsOf=(state,who)=>who==='player'?state.player.coins:state.npcs[who]?.coins??0;
function pay(d,who,settlement,copper){
    moveCoins(d,{from:purse(null,who),to:treasuryAccount(settlement),amount:copper,writer:'public-projects'});
    const p=who==='player'?['state','player','coins']:['state','npcs',who,'coins'];
    d.set(p,d.get(...p)-copper);d.set(['state','settlements',settlement,'treasury'],d.get('state','settlements',settlement,'treasury')+copper);
}
function handle(d,engine,r,at){
    const state=d.get('state'),a=state.records[r.authorization],plot=authorityOf(engine).plots[r.plot],returned=reason=>{d.set(rec(r.id),{...r,status:'已退回',decidedAt:at,reason});};
    const s=state.npcs[r.steward];
    if(a?.employment){const job=state.records[a.employment];
        if(!job?.domainSteward||job.worker!==r.steward||job.owner!==a.grantor||!['有效','要求加薪'].includes(job.status)||job.deadline<=at)return returned('管事雇佣已停止');
        if(!job.shifts?.some(shift=>shift.minute===at&&shift.paid===shift.earned&&shift.paid>0)){d.set(rec(r.id),{...r,due:at+DAY});return;}
    }
    // A steward who cannot work today leaves the file for tomorrow.
    if(!s||['死亡','濒死','昏迷','患病'].includes(s.status)){if(s?.status==='死亡')returned('管事已故，申请退回');else d.set(rec(r.id),{...r,due:r.due+DAY,delays:(r.delays??0)+1});return;}
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
    d.set(rec(permit),{category:'housing_permit',id:permit,settlement:r.settlement,plot:r.plot,location:plot.location,slot:slot+1,holder:r.applicant,steward:r.steward,
        feePaid:fee,annualRentCopper:plot.annualRentCopper,rentDue:at+YEAR,arrears:0,materials:plot.materials,buildDays:plot.buildDays,status:'已批准',approvedAt:at,application:r.id});
    d.set(rec(`housing_fee:${r.id}`),{category:'housing_fee',settlement:r.settlement,payer:r.applicant,copper:fee,kind:'宅基费',minute:at,permit,sourceEvent:r.id});
    d.set(rec(r.id),{...r,status:'已批准',decidedAt:at,permit});
}
export function processEmployedHousing(d,engine,contract,at){
 for(const r of Object.values(d.get('state','records')??{}))if(r.category==='housing_application'&&r.status==='待管事办理'&&r.filedAt<=at&&d.get('state','records',r.authorization)?.employment===contract.id)handle(d,engine,r,at);
}
function collectRent(d,p,at){
    const state=d.get('state'),due=p.annualRentCopper+p.arrears;
    if(coinsOf(state,p.holder)>=due){
        pay(d,p.holder,p.settlement,due);
        d.set(rec(`housing_fee:${p.id}:${p.rentDue}`),{category:'housing_fee',settlement:p.settlement,payer:p.holder,copper:due,kind:'地租',minute:at,permit:p.id,sourceEvent:p.id});
        d.set(rec(p.id),{...p,arrears:0,rentDue:p.rentDue+YEAR});
    }else d.set(rec(p.id),{...p,arrears:due,rentDue:p.rentDue+YEAR,lastUnpaid:at});
}
const housingDue=state=>Object.values(state.records??{}).flatMap(r=>r.category==='housing_application'&&r.status==='待管事办理'?[r.due]:r.category==='housing_permit'&&r.status!=='已收回'?[r.rentDue]:[]);
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
    if(p?.category!=='housing_permit'||p.holder!==holder)throw Error('没有本人名下的宅基批文');
    if(holder!=='player'&&(!awake(state.npcs[holder])||state.npcs[holder].location!==state.location||args.consent!==true))throw Error('建房人须本人在场同意');
    if(p.status!=='已批准')throw Error('这块宅基已开工或已收回');
    if(state.location!==p.location)throw Error('须到宅基所在地开工');
    for(const [item,n]of [['item_wood',p.materials.wood],['item_stone',p.materials.stone]])if(n&&engine.quantity(d,holder,item)<n)throw Error('自备建房材料不足');
    for(const [item,n]of [['item_wood',p.materials.wood],['item_stone',p.materials.stone]])if(n)changeItems(d,engine,holder,item,-n);
    const project=`project_${eventId}`;
    d.set(['state','projects',project],{id:project,type:'建房',creator:holder,name:text(args.name??'自家宅屋'),settlement:p.settlement,location:p.location,permit:p.id,facilityType:'house',material:p.materials.stone>p.materials.wood?'stone':'wood',
        remainingDays:p.buildDays,days:p.buildDays,wood:p.materials.wood,stone:p.materials.stone,status:'施工中',sourceEvent:eventId});
    d.set(rec(p.id),{...p,status:'施工中',project});
    return {project,note:'自备材料已投入；按宅基工期逐日施工。'};
}
export function advanceHouses(d,engine,{before,after}){
    const days=Math.floor(after/DAY)-Math.floor(before/DAY);if(!days)return;
    for(const [key,p]of Object.entries(d.get('state','projects')??{}).sort(([a],[b])=>a.localeCompare(b))){
        if(p.type!=='建房'||p.status!=='施工中')continue;
        if(p.creator!=='player'&&(!able(d.get('state','npcs',p.creator))||d.get('state','npcs',p.creator,'levy')||d.get('state','npcs',p.creator,'caring')))continue;
        const hired=Object.values(d.get('state','records')??{}).some(r=>r.laborMarket===1&&r.project===key);
        const remainingDays=hired?Math.ceil(p.remainingWork??p.remainingDays):Math.max(0,p.remainingDays-days);
        if(remainingDays){d.set(['state','projects',key],{...p,remainingDays});continue;}
        const id=completeFacilityProject(d,engine,p);
        d.set(['state','buildings',id,'permit'],p.permit);
        d.set(['state','projects',key],{...p,remainingDays:0,status:'已完成',facility:id});
        d.set(rec(p.permit),{...d.get(...rec(p.permit)),status:'已建成',building:id});
    }
}
