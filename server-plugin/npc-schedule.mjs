import {preconditionFailure} from './precondition.mjs';
import {reject} from './action-rejection.mjs';
import {purse,sink,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('npc-schedule',{sinks:['sink:export']});
import {educationSlot,educationCourses,personCourses,courseWindow,sameScheduleInputs} from './education-state.mjs';
import {facilityView,facilityRuntime,installFacilityRuntime} from './facility-state.mjs';
// Routine movement is recorded in the same event as elapsed world time.
import {waterEarthHeldUntil}from'./magic-water-earth.mjs';
import {mindSleepUntil}from'./magic-mind-space.mjs';
import {festivalScheduleAt}from'./festival.mjs';
import {npcSchedule}from'./npc-state.mjs';
import {personConstraint,personConstraints}from'./entity-view.mjs';
import {WEATHER_SEQUENCES}from'./weather.mjs';
import {remoteScheduleBatch,regionProgressKey}from'./advance-layers.mjs';
import {recordEmploymentAttendance,employmentActive} from './employment-state.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {workstationRecipes} from './workstation-services.mjs';
import {recordsWhere,canonicalEqual,PatchCursor} from './storage.mjs';
import {registerAdvanceHook} from './advance-hooks.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('npc-schedule',{kinds:[]});
// The cache belongs to one draft and one elapsed-time action. Cursor writes
// invalidate it without exposing/copying the entire NPC map for every read.
export function withScheduleCache(engine,d,task){
    const previous=engine.scheduleReadCache,own=Object.hasOwn(engine,'scheduleReadCache');
    if(previous?.draft===d)return task();
    const cursor=d.cursor,observer=cursor?.onPatch;
    const cache=cursor instanceof PatchCursor?{draft:d,people:new Map(),snapshots:new WeakMap()}:null;
    engine.scheduleReadCache=cache;
    if(cache)cursor.onPatch=patch=>{observer?.(patch);invalidateSchedule(cache,patch);};
    try{return task();}finally{
        if(cache)cursor.onPatch=observer;
        if(own)engine.scheduleReadCache=previous;else delete engine.scheduleReadCache;
    }
}
registerAdvanceHook('withScheduleCache',withScheduleCache);
const ignoredScheduleRecords=new Set(['physical_feature','education_study','education_pay','world_event','bank','debt','office_salary']);
const ignoredNpcScheduleFields=new Set(['memoryStream','developments','growth','cognition','coins','trust','affection']);
export function sameNpcScheduleInputs(a,b){
    if(a===b)return true;if(!a||!b)return false;
    for(const k in a)if(!ignoredNpcScheduleFields.has(k)&&a[k]!==b[k])return false;
    for(const k in b)if(!ignoredNpcScheduleFields.has(k)&&!Object.hasOwn(a,k))return false;
    return true;
}
registerAdvanceHook('sameNpcScheduleInputs',sameNpcScheduleInputs);
function invalidateSchedule(cache,{path,value,op}){
    if(path[0]!=='state'){if(!path.length)cache.people.clear();return;}
    if(['minute','scheduler','npcObligationClock'].includes(path[1]))return;
    if(path[1]==='npcs'&&path.length>=3){if(!ignoredNpcScheduleFields.has(path[3]))cache.people.delete(path[2]);return;}
    if(path[1]==='records'&&path.length>=3){
        const old=cache.draft.cursor.root.state.records?.[path[2]];
        const category=path.length===3?value?.category:path[3]==='category'?value:old?.category;
        if((!old||ignoredScheduleRecords.has(old.category))&&(op==='delete'&&path.length===3||ignoredScheduleRecords.has(category)))return;
    }
    if(path[1]==='obligations'&&path.length>=3){
        const state=cache.draft.cursor.root.state,old=state.obligations?.[path[2]];
        const reservation=old?.reservationVersion===1||(path.length===3?value?.reservationVersion===1:path[3]==='reservationVersion'&&value===1);
        if(!reservation&&!recordsWhere(state.records,'kind','workshop').some(r=>r.serviceObligation===path[2]))return;
    }
    cache.people.clear();
}
const sameCourses=(a,b)=>a===b||a?.length===b?.length&&a?.every((c,i)=>c===b[i]);
function cachedSchedule(engine,npcId,minute,state,constraints,read){
    const cache=engine.scheduleReadCache;if(!cache||!state)return read();
    let people=cache.people;
    if(state!==cache.draft.cursor.root.state){
        people=cache.snapshots.get(state);
        if(!people){people=new Map();cache.snapshots.set(state,people);}
    }
    let person=people.get(npcId);
    const actor=state.npcs?.[npcId],courses=engine.educationCourseContext;
    if(!person||!sameNpcScheduleInputs(person.actor,actor)||person.constraints!==constraints||!sameCourses(person.courses,courses)){
        person={actor,constraints,courses,minutes:new Map()};people.set(npcId,person);
    }
    const key=`${state.minute}:${minute}`;
    if(person.minutes.has(key)){
        const hit=person.minutes.get(key);
        if(process.env.FIELDS_INDEX_CHECK==='1'&&!canonicalEqual(hit,read()))throw Error(`schedule cache mismatch: ${npcId} at ${minute}`);
        return hit;
    }
    const slot=read();person.minutes.set(key,slot);return slot;
}
// A travelling NPC occupies neither endpoint until the route has finished.
export function scheduleAt(engine,npcId,minute,state,constraints=null){
    const previous=engine.educationCourseContext;
    if(!previous&&engine.educationScheduleCourses&&state){
        const day=Math.floor(minute/1440);let courses=engine.educationScheduleCourses.get(day);
        if(!courses){courses=educationCourses(engine,{...state,minute});engine.educationScheduleCourses.set(day,courses);}
        engine.educationCourseContext=courses;
    }else if(!previous&&engine.scheduleReadCache&&state)engine.educationCourseContext=educationCourses(engine,state);
    try{return cachedSchedule(engine,npcId,minute,state,constraints,()=>scheduledSlot(engine,npcId,minute,state,constraints));}finally{engine.educationCourseContext=previous;}
}
function scheduledSlot(engine,npcId,minute,state,constraints=null){
    if(state&&!isEffective(engine,state,npcId))return null;
    constraints??=state?personConstraints(engine,state):null;
    const hold=state&&personConstraint(engine,state,npcId,minute,constraints)?.value;
    if(hold?.category==='transition')return null;
    if(hold)return{location:hold.location,activity:'依法拘留',services:[],until:Math.min(hold.expires??Infinity,(Math.floor(minute/1440)+1)*1440)};
    const lesson=state&&educationSlot(engine,state,npcId,minute);
    if(lesson&&!state.npcs[npcId]?.levy&&!state.npcs[npcId]?.caring)return lesson;
    const schedule=npcSchedule(engine,state,npcId,minute,constraints);if(!schedule){
        if(state){const next=personCourses(engine,state,npcId).map(c=>courseWindow(c,minute)?.start).filter(at=>at>minute);
        if(next.length)return {location:state.npcs[npcId]?.location,activity:'日常起居',services:[],until:Math.min(...next)};}
        if(state&&educationCourses(engine,state).some(c=>c.students.includes(npcId))){const home=engine.byId.get(npcId)?.home?.location??state.npcs[npcId]?.location;return {location:home,activity:'日常起居',services:[],until:(Math.floor(minute/1440)+1)*1440};}
        return festivalScheduleAt(engine,state,npcId,minute,null,constraints);
    }
    const calendar=engine.calendar(minute),variant=calendar.market?'market':schedule.restDays?.includes(calendar.day)?'rest':'default';
    const seasonal=schedule.seasonal?.[String(calendar.season)];
    const slots=seasonal?.[variant]??schedule[variant]??seasonal?.default??schedule.default;
    const offset=minute%1440,slot=slots?.find(row=>row.start<=offset&&offset<row.end);
    if(!slot)throw Error(`${npcId}的作息没有覆盖当前钟点`);
    let end=slot.end;
    // Adjacent identical slots have no transition to observe. Course openings
    // and festival overrides below still impose their own real boundaries.
    for(let i=slots.indexOf(slot)+1;i<slots.length;i++){
        const next=slots[i];
        if(next.start!==end||next.location!==slot.location||next.activity!==slot.activity||[...new Set([...Object.keys(slot),...Object.keys(next)])].some(key=>key!=='start'&&key!=='end'&&!canonicalEqual(slot[key],next[key])))break;
        end=next.end;
    }
    let until=minute-offset+end;
    if(state)for(const c of personCourses(engine,state,npcId)){const w=courseWindow(c,minute);if(w&&w.start>minute)until=Math.min(until,w.start);}
    const current=festivalScheduleAt(engine,state,npcId,minute,{...slot,until,variant},constraints);
    // education.teaching uses the recipe's minimumProficiency as its threshold.
    const recipes=workstationRecipes(engine,state,npcId,current);
    return recipes.length?{...current,services:[...new Set([...(current.services??[]),...recipes.map(r=>r.id),'teach'])]}:current;
}

const incapacitated=npc=>['濒死','昏迷','患病'].includes(npc.status);
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
    if(!isEffective(engine,state,npcId)||incapacitated(npc))return {activity:npc.status,services:[]};
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
    if(facilityView(engine,state,npc?.location)?.factor===0)throw preconditionFailure('服务场所已停用');
    if(!npc||npc.location!==state.location)throw preconditionFailure('服务者不在场');
    if(personConstraint(engine,state,npcId))throw preconditionFailure('服务者正在依法拘留，不能提供服务');
    engine.assertNpcObligationAction?.(d,['player',npcId],{minutes,location:state.location,kind:service});
    engine.assertNpcAutonomyAction?.(state,['player',npcId],{minutes});
    if(!engine.byId.get(npcId)?.schedule&&!scheduleAt(engine,npcId,state.minute,state))return; // Archived worlds retain their original service semantics.
    const available=npcAvailability(engine,state,npcId);
    if(available.services!==null&&!available.services.includes(service)){
        const next=nextNpcService(engine,npcId,state.minute,service,state);
        const plan=next?`；按作息计划在${engine.calendar(next.minute).text}于${engine.byId.get(next.location)?.name??next.location}接待，届时仍需确认在场且清醒`:'';
        reject('E-ACTION-SERVICE',`${engine.byId.get(npcId).name}此刻不提供${service==='teach'?'授课':'交易'}服务：${available.activity}${plan}`,{missing:[`对方需要在场、清醒且正在提供${service==='teach'?'授课':'交易'}服务`],repair:['按原因中列出的作息时间和地点寻找对方，再确认其在场且清醒']});
    }
    // Validate the whole action before any money, time or inventory changes.
    for(let cursor=state.minute;cursor<state.minute+minutes;){
        const slot=scheduleAt(engine,npcId,cursor,state);if(!slot)break;
        if(slot.location!==npc.location||!slot.services.includes(service))throw preconditionFailure('剩余服务时间不足，无法在休息或离开前完成');
        cursor=slot.until;
    }
}

// P2: a read-only look at the current state for the lookups below, which use
// it only before this NPC's writes; it does not make the draft recopy state.
const peekState=d=>typeof d.peek==='function'?d.peek('state'):d.get('state');
export function advanceNpcSchedules(d,engine,before,after,{promote=false,beforeState=null}={}){
    const previous=engine.educationScheduleCourses;engine.educationScheduleCourses??=new Map();
    try{return withScheduleCache(engine,d,()=>settleSchedules(d,engine,before,after,{promote,beforeState}));}finally{engine.educationScheduleCourses=previous;}
}
function settleSchedules(d,engine,before,after,{promote=false,beforeState=null}={}){
    if(after<=before&&!promote)return;
    const weatherCache=new Map(engine.weatherSequences?[[WEATHER_SEQUENCES,engine.weatherSequences]]:[]),graphCache=engine.advanceGraphs??new Map(); // One immutable world/seed and time advance only.
    const constraints=personConstraints(engine,peekState(d)),routes=new Map();
    const jobs=new Map(recordsWhere(peekState(d).records,'kind','workshop').filter(employmentActive).map(r=>[r.worker,r]));
    const prepared=d.scheduleEducation,state=peekState(d),courses=engine.educationCourseContext;
    const reuse=prepared?.minute===before&&sameScheduleInputs(prepared.state,state)&&courses?.length===prepared.courses.length&&courses.every((c,i)=>c===prepared.courses[i]);
    const batch=Object.keys(d.get('state','remote')??{}).length?remoteScheduleBatch(engine,peekState(d),before,after,{promote}):null;
    let candidates;
    if(!promote&&!batch&&prepared?.minute===before&&d.advanceSchedule?.minute===after&&sameScheduleInputs({...prepared.state,npcs:state.npcs,records:state.records,obligations:state.obligations},state)){
        const due=new Set([...d.advanceSchedule.npcs,...prepared.pending??[],...jobs.keys(),...engine.educationAttendance?.keys()??[],...state.player.companions??[]]);
        for(const c of [...prepared.courses,...courses??[]])for(const id of [c.teacher,...c.students])if(id)due.add(id);
        let replaced=false;
        for(let i=prepared.patchStart;i<d.patches.length;i++){
            const p=d.patches[i].path;
            if(p[0]==='state'&&p.length===1){replaced=true;break;}
            if(p[0]==='state'&&p[1]==='npcs'){
                if(p.length<3){replaced=true;break;}
                if(!ignoredNpcScheduleFields.has(p[3]))due.add(p[2]);
            }
            if(p[0]==='state'&&['records','obligations'].includes(p[1])){
                if(p.length<3){replaced=true;break;}
                if(p[1]==='records'&&p[2].startsWith('transition:')){due.add(p[2].slice(11));continue;}
                for(const row of [prepared.state[p[1]]?.[p[2]],state[p[1]]?.[p[2]]]){
                    if(!row)continue;
                    if(p[1]==='obligations'){
                        if(row.reservationVersion===1){due.add(row.promisor);due.add(row.promisee);}
                        for(const job of jobs.values())if(job.serviceObligation===p[2])due.add(job.worker);
                    }else if(!ignoredScheduleRecords.has(row.category)){
                        if(row.kind==='workshop')due.add(row.worker);
                        else if(['legal_detention','legal_custody'].includes(row.category))due.add(row.subject??state.records?.[row.case]?.offender);
                        else if(row.category!=='education_course'){replaced=true;break;}
                    }
                }
                if(replaced)break;
            }
        }
        // Preserve actor enumeration order: travel payments and their patches
        // must keep the same deterministic ordering as the unfiltered pass.
        if(!replaced){
            candidates=[...due].filter(id=>state.npcs[id]);
            const order=candidates.some(id=>!prepared.npcOrder.has(id))?new Map(Object.keys(state.npcs).map((id,i)=>[id,i])):prepared.npcOrder;
            candidates.sort((a,b)=>order.get(a)-order.get(b));
        }
    }
    candidates??=Object.keys(state.npcs);
    for(const npcId of candidates){
        const regional=jobs.has(npcId)?null:batch?.persons.get(npcId);
        if(promote&&!regional)continue;
        if(regional&&!regional.due)continue;
        const hold=personConstraint(engine,peekState(d),npcId,after,constraints)?.value;
        if(hold?.category==='transition')continue;
        if(hold){
            if(isEffective(engine,d,npcId)){
                d.set(['state','npcs',npcId,'location'],hold.location);d.set(['state','npcs',npcId,'activity'],'依法拘留');
                if(d.get('state','npcs',npcId,'scheduleTravel'))d.remove(['state','npcs',npcId,'scheduleTravel']);
            }
            continue;
        }
        if(!engine.byId.get(npcId)?.schedule&&!d.get('state','npcs',npcId,'routine')&&!jobs.has(npcId))continue;
        if(engine.npcScheduleReservations?.has(npcId))continue;
        if(engine.medicineParticipants?.has(npcId))continue;
        if(d.get('state','npcs',npcId,'cognitionTravel')||engine.npcAutonomyBusy?.(peekState(d),npcId,before))continue;
        const current=peekState(d).npcs[npcId],slot=reuse&&prepared.state.npcs[npcId]===current?prepared.slots?.get(npcId):null;
        if(current.scheduleTravel?.arrive>after&&!incapacitated(current)&&!state.player.companions?.includes(npcId))continue;
        // The heap already read this exact actor and all schedule inputs. A
        // stationary, unchanged slot has no work until its boundary. Teaching,
        // employment attendance, companions and furnaces retain the full path.
        if(!regional&&slot&&slot.until>after&&current.location===slot.location&&current.activity===slot.activity&&!current.scheduleTravel&&!incapacitated(current)&&!state.player.companions?.includes(npcId)&&!jobs.has(npcId)&&!engine.educationAttendance?.has(npcId)&&!facilityRuntime().hasUnattendedFurnace(engine,npcId)){
            if(process.env.FIELDS_INDEX_CHECK==='1'&&!canonicalEqual(slot,scheduleAt(engine,npcId,before,peekState(d),constraints)))throw Error(`schedule settlement cache mismatch: ${npcId} at ${before}`);
            continue;
        }
        const original=d.get('state','npcs',npcId),npc={...original},path=['state','npcs',npcId];
        const activity=value=>{npc.activity=value;};
        const since=regional?.before??before;
        // The snapshot records the actor's actual presence when a binding was
        // cast, even if that action occurred after the last global clock tick.
        const heldState={effects:{...beforeState?.effects,...peekState(d).effects}};
        let cursor=Math.max(waterEarthHeldUntil(heldState,npcId,since,Math.max(since,beforeState?.minute??since)),mindSleepUntil(d,npcId,since));
        // Eligible skeleton routines never travel or charge money. Their last
        // slot is exactly the result of walking every intervening slot.
        if(regional)cursor=after;
        while(cursor<=after){
            if(!isEffective(engine,d,npcId)||incapacitated(npc)){activity(npc.status);break;}
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
                    facilityRuntime().recordFurnaceDeparture(d,engine,npcId,npc.location,cursor);
                    moveCoins(d,{from:purse(null,npcId),to:sink('export','travel'),amount:route.cost,writer:'npc-schedule',eventId:null});
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
            const next=facilityRuntime().hasUnattendedFurnace(engine,npcId)?scheduleAt(engine,npcId,slot.until,peekState(d),constraints):null;
            if(npc.location===slot.location&&next&&next.activity!==slot.activity&&!next.services?.length&&!/锻|打铁|做工|值守|生产/.test(next.activity??''))facilityRuntime().recordFurnaceDeparture(d,engine,npcId,npc.location,slot.until);
            cursor=slot.until;
        }
        // Preserve deterministic travel calculations while writing only the
        // resulting state, rather than thousands of intermediate daily patches.
        for(const field of ['location','activity','coins','scheduleTravel']){
            if(original[field]===npc[field]||JSON.stringify(original[field])===JSON.stringify(npc[field]))continue;
            if(npc[field]===undefined)d.remove([...path,field]);else d.set([...path,field],npc[field]);
        }
    }
    if(batch)for(const g of batch.groups.values())if(g.due&&g.people.length&&d.get('state','records',regionProgressKey(g.county),'scheduleThrough')!==after)holdingSet(d,null,['state','records',regionProgressKey(g.county)],{category:'advance_region',county:g.county,scheduleThrough:after},'npc-schedule');
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
installFacilityRuntime({scheduleAt});
