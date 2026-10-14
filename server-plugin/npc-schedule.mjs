// Routine movement is recorded in the same event as elapsed world time.
import {waterEarthHeldUntil}from'./magic-water-earth.mjs';
import {mindSleepUntil}from'./magic-mind-space.mjs';
import {festivalScheduleAt}from'./festival.mjs';
import {npcSchedule}from'./npc-state.mjs';
// A travelling NPC occupies neither endpoint until the route has finished.
export function scheduleAt(engine,npcId,minute,state){
    const schedule=npcSchedule(engine,state,npcId);if(!schedule)return festivalScheduleAt(engine,state,npcId,minute,null);
    const calendar=engine.calendar(minute),variant=calendar.market?'market':schedule.restDays?.includes(calendar.day)?'rest':'default';
    const seasonal=schedule.seasonal?.[String(calendar.season)];
    const slots=seasonal?.[variant]??schedule[variant]??seasonal?.default??schedule.default;
    const offset=minute%1440,slot=slots?.find(row=>row.start<=offset&&offset<row.end);
    if(!slot)throw new Error(`${npcId}的作息没有覆盖当前钟点`);
    return festivalScheduleAt(engine,state,npcId,minute,{...slot,until:minute-offset+slot.end,variant});
}

const incapacitated=npc=>['死亡','濒死','昏迷','患病'].includes(npc.status);
export function nextNpcService(engine,npcId,minute,service,state){
    for(let cursor=minute;cursor<minute+31*1440;){
        const slot=scheduleAt(engine,npcId,cursor,state);if(!slot)return null;
        if(slot.services.includes(service))return {minute:cursor,location:slot.location};
        cursor=slot.until;
    }
    return null;
}
export function npcAvailability(engine,state,npcId){
    const npc=state.npcs[npcId],slot=scheduleAt(engine,npcId,state.minute,state);
    if(!npc)return {activity:'不在战役中',services:[]};
    if(incapacitated(npc))return {activity:npc.status,services:[]};
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
    if(!npc||npc.location!==state.location)throw new Error('服务者不在场');
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

export function advanceNpcSchedules(d,engine,before,after){
    if(after<=before)return;
    const weatherCache=new Map(),graphCache=new Map(); // One immutable world/seed and time advance only.
    for(const npcId of Object.keys(d.get('state','npcs'))){
        if(!engine.byId.get(npcId)?.schedule)continue;
        if(engine.npcScheduleReservations?.has(npcId))continue;
        if(d.get('state','npcs',npcId,'cognitionTravel')||engine.npcAutonomyBusy?.(d.get('state'),npcId,before))continue;
        const original=d.get('state','npcs',npcId),npc={...original},path=['state','npcs',npcId];
        const activity=value=>{npc.activity=value;};
        let cursor=Math.max(waterEarthHeldUntil(d.get('state'),npcId,before),mindSleepUntil(d,npcId,before));
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
            const slot=scheduleAt(engine,npcId,cursor,d.get('state'));
            if(npc.location!==slot.location){
                let route;
                try{route=engine.route(npc.location,slot.location,'walk',cursor,d.document.randomSeed,weatherCache,graphCache);}
                catch{activity('行程受阻');}
                if(route&&npc.coins<route.cost){route=null;activity('路费不足，暂留原处');}
                if(route){
                    npc.coins-=route.cost;
                    npc.scheduleTravel={from:npc.location,to:slot.location,depart:cursor,arrive:cursor+route.minutes,edges:route.edges};
                    npc.location=null;activity('赶路');continue;
                }
            }else activity(slot.activity);
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
