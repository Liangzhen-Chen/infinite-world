import {playerOffices,spendPublic,refundPublic,authorityOf} from './governance.mjs';
import {milestone} from './progression.mjs';
import {npcHousehold,npcAgeAt} from './npc-life.mjs';

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
    const state=d.get('state'),offices=playerOffices(state,{settlement,power:'public_project'});
    if(!offices.length)throw Error('没有在任官职授予本村公共工程权限');
    const name=text(args.name),days=int(args.days,1,365,'工期'),wood=int(args.wood??0,0,10000,'木料'),stone=int(args.stone??0,0,10000,'石料');
    const location=engine.resolve(args.plot??settlement);
    if(!within(engine,location,settlement))throw Error('工程地点不在本村');
    const beneficiaries=args.beneficiaries??[settlement];
    if(!beneficiaries.includes(settlement)||beneficiaries.includes('player'))throw Error('公款工程的受益人须为本村，不能是本人');
    const workers=[...new Set((args.workers??[]).map(w=>engine.resolve(w,'npc')))].sort();
    if(!workers.length||workers.length>20)throw Error('需要1到20名实际做工的人');
    for(const id of workers){
        const n=state.npcs[id];
        if(!awake(n)||n.location!==state.location)throw Error('做工的人须当面在场且清醒');
        if(npcHousehold(engine,state,id)?.settlement!==settlement||(npcAgeAt(engine,state,id)??0)<18)throw Error('做工的人须是本村成年住户');
    }
    if(args.consent!==true)throw Error('做工的人须当面同意工期与工钱');
    const row=state.settlements[settlement];
    if((row.wood??0)<wood||(row.stone??0)<stone)throw Error('公共工程材料不足');
    const wage=authorityOf(engine).treasury.wagePerWorkerDayCopper,bill=wage*workers.length*days;
    const project=`project_${eventId}`;
    const spend=spendPublic(d,engine,{settlement,copper:bill,power:'public_project',purpose:`工程工钱 ${name}`,sourceEvent:project});
    d.set(['state','settlements',settlement,'wood'],row.wood-wood);if(stone)d.set(['state','settlements',settlement,'stone'],row.stone-stone);
    const office=offices[0];
    const p={id:project,type:'工程',creator:'player',name,settlement,location,remainingDays:days,days,wood,stone,status:'施工中',beneficiaries,sourceEvent:eventId,
        public:{office:office.id,workers,wage,escrow:bill,month:spend.month,spend:spend.id,workedDays:0,labor:{},paid:{},lostDays:0},
        civicApproval:{settlement,office:office.id,grantor:office.appointedBy,minute:state.minute,source:office.source}};
    d.set(['state','projects',project],p);
    return {project,escrow:bill,note:'工钱已从公账押入工程，按实际做工日付给本人；材料已从公共库存拨出。'};
}
function facility(d,engine,p){
    const id=`bld_built_${p.id.replace(/[^a-zA-Z0-9_-]/g,'_')}`;
    if(d.get('state','created',id))return id;
    d.set(['state','created',id],{id,name:p.name,aliases:[],type:'bld',scope:p.settlement,parent:p.location,owner:p.settlement,access:{mode:'public'},
        purpose:'公共设施',builtProject:p.id,openHours:[0,1440]});
    d.set(['state','buildings',id],{owner:p.settlement,condition:100,project:p.id});
    return id;
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
    if(escrow)refundPublic(d,{settlement:p.settlement,copper:escrow,month:p.public.month,purpose:`工程结余退回 ${p.name}`,sourceEvent:`${p.id}:refund`});
    if(status==='已完成'){next.facility=facility(d,engine,p);}
    else{
        // Materials go in evenly over the planned days; the unused share returns.
        const used=k=>Math.floor(p[k]*p.public.workedDays/p.days),back={wood:p.wood-used('wood'),stone:p.stone-used('stone')};
        const s=d.get('state','settlements',p.settlement);
        d.set(['state','settlements',p.settlement,'wood'],s.wood+back.wood);if(back.stone)d.set(['state','settlements',p.settlement,'stone'],(s.stone??0)+back.stone);
        next.returned={...back,copper:escrow};
    }
    settleLabor(d,next,minute);
    d.set(['state','projects',p.id],next);
    if(status==='已完成')milestone(d,engine,'publicContribution',p.id,eventId);
    return next;
}
export function abortPublicProject(d,engine,args){
    const p=d.get('state','projects',args.project);
    if(!isPublicProject(p))throw Error('没有这个公款工程');
    if(p.status!=='施工中')return {project:p.id,status:p.status,duplicate:true};
    if(!playerOffices(d.get('state'),{settlement:p.settlement,power:'public_project'}).length)throw Error('没有在任官职可中止本村工程');
    const row=finish(d,engine,p,'已中止',d.get('state','minute'));
    return {project:p.id,status:row.status,returned:row.returned};
}
// One step per elapsed midnight: able workers are paid and the work advances.
export function advancePublicProjects(d,engine,{before,after,id}){
    for(let day=Math.floor(before/DAY);day<Math.floor(after/DAY);day++){
        for(const [key,p]of Object.entries(d.get('state','projects')??{}).sort(([a],[b])=>a.localeCompare(b))){
            if(!isPublicProject(p)||p.status!=='施工中')continue;
            const state=d.get('state'),present=p.public.workers.filter(w=>able(state.npcs[w]));
            const pub=structuredClone(p.public);
            if(!present.length){pub.lostDays++;d.set(['state','projects',key],{...p,public:pub});continue;}
            for(const w of present){
                d.set(['state','npcs',w,'coins'],(state.npcs[w].coins??0)+pub.wage);
                pub.escrow-=pub.wage;pub.paid[w]=(pub.paid[w]??0)+pub.wage;pub.labor[w]=(pub.labor[w]??0)+1;
            }
            pub.workedDays++;
            const next={...p,public:pub,remainingDays:p.remainingDays-1};
            if(next.remainingDays<=0)finish(d,engine,next,'已完成',(day+1)*DAY,id);
            else d.set(['state','projects',key],next);
        }
    }
}
