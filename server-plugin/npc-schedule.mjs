import {educationSlot,educationCourses,courseWindow} from './education-state.mjs';
import {facilityView} from './facility-state.mjs';
// Routine movement is recorded in the same event as elapsed world time.
import {waterEarthHeldUntil}from'./magic-water-earth.mjs';
import {mindSleepUntil}from'./magic-mind-space.mjs';
import {festivalScheduleAt}from'./festival.mjs';
import {npcSchedule}from'./npc-state.mjs';
import {personConstraint,personConstraints}from'./entity-view.mjs';
import {WEATHER_SEQUENCES}from'./weather.mjs';
import {remoteScheduleBatch,regionProgressKey}from'./advance-layers.mjs';
import {recordEmploymentAttendance,employmentActive} from './employment-state.mjs';
// A travelling NPC occupies neither endpoint until the route has finished.
export function scheduleAt(engine,npcId,minute,state,constraints=null){
    const previous=engine.educationCourseContext;
    if(!previous&&engine.educationScheduleCourses&&state){
        const day=Math.floor(minute/1440);let courses=engine.educationScheduleCourses.get(day);
        if(!courses){courses=educationCourses(engine,{...state,minute});engine.educationScheduleCourses.set(day,courses);}
        engine.educationCourseContext=courses;
    }
    try{return scheduledSlot(engine,npcId,minute,state,constraints);}finally{engine.educationCourseContext=previous;}
}
function scheduledSlot(engine,npcId,minute,state,constraints=null){
    constraints??=state?personConstraints(engine,state):null;
    const hold=state&&personConstraint(engine,state,npcId,minute,constraints)?.value;
    if(hold)return{location:hold.location,activity:'依法拘留',services:[],until:Math.min(hold.expires??Infinity,(Math.floor(minute/1440)+1)*1440)};
    const lesson=state&&educationSlot(engine,state,npcId,minute);
    if(lesson&&!state.npcs[npcId]?.levy&&!state.npcs[npcId]?.caring)return lesson;
    const schedule=npcSchedule(engine,state,npcId,minute,constraints);if(!schedule){
        if(state){const next=educationCourses(engine,state).filter(c=>[c.teacher,...c.students].includes(npcId)).map(c=>courseWindow(c,minute)?.start).filter(at=>at>minute);
        if(next.length)return {location:state.npcs[npcId]?.location,activity:'日常起居',services:[],until:Math.min(...next)};}
        if(state&&educationCourses(engine,state).some(c=>c.students.includes(npcId))){const home=engine.byId.get(npcId)?.home?.location??state.npcs[npcId]?.location;return {location:home,activity:'日常起居',services:[],until:(Math.floor(minute/1440)+1)*1440};}
        return festivalScheduleAt(engine,state,npcId,minute,null);
    }
    const calendar=engine.calendar(minute),variant=calendar.market?'market':schedule.restDays?.includes(calendar.day)?'rest':'default';
    const seasonal=schedule.seasonal?.[String(calendar.season)];
    const slots=seasonal?.[variant]??schedule[variant]??seasonal?.default??schedule.default;
    const offset=minute%1440,slot=slots?.find(row=>row.start<=offset&&offset<row.end);
    if(!slot)throw new Error(`${npcId}的作息没有覆盖当前钟点`);
    let until=minute-offset+slot.end;
    if(state)for(const c of educationCourses(engine,state))if([c.teacher,...c.students].includes(npcId)){const w=courseWindow(c,minute);if(w&&w.start>minute)until=Math.min(until,w.start);}
    return festivalScheduleAt(engine,state,npcId,minute,{...slot,until,variant});
}

const incapacitated=npc=>['死亡','濒死','昏迷','患病'].includes(npc.status);
export function nextNpcService(engine,npcId,minute,service,state){
    const constraints=state?personConstraints(engine,state):null;
    for(let cursor=minute;cursor<minute+31*1440;){
        const slot=scheduleAt(engine,npcId,cursor,state,constraints);if(!slot)return null;
        if(slot.services.includes(service))return {minute:cursor,location:slot.location};
        cursor=slot.until;
    }
    return null;
}
export function npcAvailability(engine,state,npcId){
    const npc=state.npcs[npcId],slot=scheduleAt(engine,npcId,state.minute,state);
    if(!npc)return {activity:'不在战役中',services:[]};
    if(incapacitated(npc))return {activity:npc.status,services:[]};
    if(personConstraint(engine,state,npcId))return {activity:'依法拘留',services:[]};
    if(npc.scheduleTravel||npc.cognitionTravel)return {activity:npc.cognitionTravel?'携信赶路':'赶路',services:[]};
    const work=engine.npcAutonomyBusy?.(state,npcId);
    if(work)return{activity:'正在处理自己的工作',services:[],until:work.finish};
    const booking=engine.npcObligationAt?.(state,npcId);
    if(booking)return{activity:npc.location===booking.location?booking.type:'正在赴约',services:[],until:booking.deadline};
    if(state.player.companions?.includes(npcId))return {activity:'同行',services:[]};
    if(!slot)return {activity:npc.activity??'',services:null};
    if(npc.location!==slot.location)return {activity:npc.activity??'尚未抵达作息地点',services:[]};
    return {activity:slot.activity,services:slot.services,until:slot.until};
}

export function assertNpcService(d,engine,npcId,service,minutes){
    const state=d.get('state'),npc=state.npcs[npcId];
    if(facilityView(engine,state,npc?.location)?.factor===0)throw Error('服务场所已停用');
    if(!npc||npc.location!==state.location)throw new Error('服务者不在场');
    if(personConstraint(engine,state,npcId))throw new Error('服务者正在依法拘留，不能提供服务');
    engine.assertNpcObligationAction?.(d,['player',npcId],{minutes,location:state.location,kind:service});
    engine.assertNpcAutonomyAction?.(state,['player',npcId],{minutes});
    if(!engine.byId.get(npcId)?.schedule&&!scheduleAt(engine,npcId,state.minute,state))return; // Archived worlds retain their original service semantics.
    const available=npcAvailability(engine,state,npcId);
    if(available.services!==null&&!available.services.includes(service)){
        const next=nextNpcService(engine,npcId,state.minute,service,state);
        const plan=next?`；按作息计划在${engine.calendar(next.minute).text}于${engine.byId.get(next.location)?.name??next.location}接待，届时仍需确认在场且清醒`:'';
        throw new Error(`${engine.byId.get(npcId).name}此刻不提供${service==='teach'?'授课':'交易'}服务：${available.activity}${plan}`);
    }
    // Validate the whole action before any money, time or inventory changes.
    for(let cursor=state.minute;cursor<state.minute+minutes;){
        const slot=scheduleAt(engine,npcId,cursor,state);if(!slot)break;
        if(slot.location!==npc.location||!slot.services.includes(service))throw new Error('剩余服务时间不足，无法在休息或离开前完成');
        cursor=slot.until;
    }
}

// P2: a read-only look at the current state for the lookups below, which use
// it only before this NPC's writes; it does not make the draft recopy state.
const peekState=d=>typeof d.peek==='function'?d.peek('state'):d.get('state');
export function advanceNpcSchedules(d,engine,before,after,{promote=false}={}){
    const previous=engine.educationScheduleCourses;engine.educationScheduleCourses??=new Map();
    try{return settleSchedules(d,engine,before,after,{promote});}finally{engine.educationScheduleCourses=previous;}
}
function settleSchedules(d,engine,before,after,{promote=false}={}){
    if(after<=before&&!promote)return;
    const weatherCache=new Map(engine.weatherSequences?[[WEATHER_SEQUENCES,engine.weatherSequences]]:[]),graphCache=engine.advanceGraphs??new Map(); // One immutable world/seed and time advance only.
    const constraints=personConstraints(engine,peekState(d)),routes=new Map();
    const jobs=new Map(Object.values(peekState(d).records??{}).filter(employmentActive).map(r=>[r.worker,r]));
    const batch=Object.keys(d.get('state','remote')??{}).length?remoteScheduleBatch(engine,peekState(d),before,after,{promote}):null;
    for(const npcId of Object.keys(d.get('state','npcs'))){
        const regional=batch?.persons.get(npcId);
        if(promote&&!regional)continue;
        if(regional&&!regional.due)continue;
        const hold=personConstraint(engine,peekState(d),npcId,after,constraints)?.value;
        if(hold){
            if(d.get('state','npcs',npcId,'status')!=='死亡'){
                d.set(['state','npcs',npcId,'location'],hold.location);d.set(['state','npcs',npcId,'activity'],'依法拘留');
                if(d.get('state','npcs',npcId,'scheduleTravel'))d.remove(['state','npcs',npcId,'scheduleTravel']);
            }
            continue;
        }
        if(!engine.byId.get(npcId)?.schedule&&!d.get('state','npcs',npcId,'routine')&&!jobs.has(npcId))continue;
        if(engine.npcScheduleReservations?.has(npcId))continue;
        if(engine.medicineParticipants?.has(npcId))continue;
        if(d.get('state','npcs',npcId,'cognitionTravel')||engine.npcAutonomyBusy?.(peekState(d),npcId,before))continue;
        const original=d.get('state','npcs',npcId),npc={...original},path=['state','npcs',npcId];
        const activity=value=>{npc.activity=value;};
        const since=regional?.before??before;
        let cursor=Math.max(waterEarthHeldUntil(peekState(d),npcId,since),mindSleepUntil(d,npcId,since));
        // Eligible skeleton routines never travel or charge money. Their last
        // slot is exactly the result of walking every intervening slot.
        if(regional)cursor=after;
        while(cursor<=after){
            if(incapacitated(npc)){activity(npc.status);break;}
            if(d.get('state','player','companions')?.includes(npcId)){activity('同行');break;}
            const trip=npc.scheduleTravel;
            if(trip){
                if(trip.arrive>after)break;
                cursor=Math.max(cursor,trip.arrive);
                npc.location=trip.to;delete npc.scheduleTravel;
                continue;
            }
            const slot=scheduleAt(engine,npcId,cursor,peekState(d),constraints);
            // No derivable routine (e.g. a contract past its term awaiting settlement): stay put.
            if(!slot)break;
            if(npc.location!==slot.location){
                let route;
                try{
                    const key=JSON.stringify([npc.location,slot.location,cursor]);
                    route=routes.get(key);
                    if(!route){route=engine.route(npc.location,slot.location,'walk',cursor,d.get('randomSeed'),weatherCache,graphCache);routes.set(key,route);}
                }
                catch{activity('行程受阻');}
                if(route&&npc.coins<route.cost){route=null;activity('路费不足，暂留原处');}
                if(route){
                    npc.coins-=route.cost;
                    npc.scheduleTravel={from:npc.location,to:slot.location,depart:cursor,arrive:cursor+route.minutes,edges:route.edges};
                    npc.location=null;activity('赶路');continue;
                }
            }else{
                activity(slot.activity);
                engine.educationAttendance?.get(npcId)?.push({start:cursor,end:Math.min(after,slot.until),location:npc.location});
                const job=jobs.get(npcId);
                if(!regional&&job?.laborMarket&&slot.activity===(job.task??'受雇工坊生产'))recordEmploymentAttendance(d,npcId,cursor,Math.min(after,slot.until),npc.location);
            }
            if(slot.until>after)break;
            cursor=slot.until;
        }
        // Preserve deterministic travel calculations while writing only the
        // resulting state, rather than thousands of intermediate daily patches.
        for(const field of ['location','activity','coins','scheduleTravel']){
            if(JSON.stringify(original[field])===JSON.stringify(npc[field]))continue;
            if(npc[field]===undefined)d.remove([...path,field]);else d.set([...path,field],npc[field]);
        }
    }
    if(batch)for(const g of batch.groups.values())if(g.due&&g.people.length&&d.get('state','records',regionProgressKey(g.county),'scheduleThrough')!==after)d.set(['state','records',regionProgressKey(g.county)],{category:'advance_region',county:g.county,scheduleThrough:after});
}

export function advanceWithNpcParticipants(d,engine,minutes,eventId,participants){
    const previous=engine.npcScheduleReservations;
    engine.npcScheduleReservations=new Set([...previous??[],...participants]);
    try{engine.advance(d,minutes,eventId);}
    finally{engine.npcScheduleReservations=previous;}
}

export function validateNpcSchedules(world){
    const errors=[],locations=new Set(world.locations.map(row=>row.id));
    for(const npc of world.npcs){
        const schedule=npc.schedule;if(!schedule)continue;
        const days=schedule.restDays??[];
        if(!Array.isArray(days)||days.some(day=>!Number.isInteger(day)||day<1||day>30)||new Set(days).size!==days.length)errors.push(`${npc.id}:休息日必须是月内不重复日期`);
        const check=(slots,label,required=false)=>{
            if(slots===undefined&&!required)return;
            if(!Array.isArray(slots)||!slots.length){errors.push(`${label}:缺少全天作息`);return;}
            let end=0;
            for(const slot of slots){
                if(!Number.isInteger(slot.start)||!Number.isInteger(slot.end)||slot.start!==end||slot.end<=slot.start||slot.end>1440)errors.push(`${label}:作息必须连续覆盖0到1440分钟`);
                if(!locations.has(slot.location))errors.push(`${label}:作息地点不存在`);
                if(typeof slot.activity!=='string'||!slot.activity.trim())errors.push(`${label}:缺少活动描述`);
                if(!Array.isArray(slot.services)||slot.services.some(value=>!['trade','teach'].includes(value)))errors.push(`${label}:服务类型未登记`);
                end=slot.end;
            }
            if(end!==1440)errors.push(`${label}:作息没有覆盖全天`);
        };
        for(const key of ['default','market','rest'])check(schedule[key],`${npc.id}.${key}`,key==='default');
        for(const [season,variants]of Object.entries(schedule.seasonal??{})){
            if(!['0','1','2','3'].includes(season))errors.push(`${npc.id}:季节编号非法`);
            for(const key of ['default','market','rest'])check(variants[key],`${npc.id}.${season}.${key}`);
        }
    }
    return errors;
}
