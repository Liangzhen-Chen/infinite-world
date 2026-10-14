import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {initialNpcState} from './npc-state.mjs';

// On-demand population for seeded settlements and lairs. The roster of a
// residential district is a pure function of the template and quota captured
// the first time a campaign touches the settlement; it lives in the campaign
// state only and never writes back to the shared world catalog. A full
// profile is drafted on the first conversation, checked here, then frozen.

export const POPULATION_VERSION=1;
export const MAX_PROFILE_FAILURES=3;
const AGE_KEYS=['children','youngAdults','adults','elders'];
const AGE_RANGES={children:[0,17],youngAdults:[18,34],adults:[35,59],elders:[60,82]};
const MIN_PARENT_GAP=16;
const FALLBACK_MINOR_WORK='随家人做轻活';
// Code-side naming stock, merged with the given-name characters of registered
// residents so small skeletons still yield distinct, ordinary names.
const GIVEN_STOCK=[...'安柏辰川春丹德东栋芳峰福根桂海禾和恒红华怀慧佳嘉建江洁锦静菊坤兰岚立良林玲柳梅敏明宁平萍琴青秋荣瑞山善生胜石书顺松桃田婷文霞香祥晓欣秀萱雪岩燕阳仪瑜玉远云哲贞志竹'];
export const bucketOf=age=>age<18?'children':age<35?'youngAdults':age<60?'adults':'elders';
const pad=n=>String(n).padStart(3,'0');
const hashText=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');

let blockedWords;
function defaultBlocklist(){
    if(blockedWords)return blockedWords;
    try{const raw=JSON.parse(readFileSync(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));blockedWords=[...raw.names??[],...raw.realPeople??[]].filter(w=>typeof w==='string'&&w);}
    catch{blockedWords=[];}
    return blockedWords;
}

function stream(seed){
    let counter=0,buffer=null,offset=32;
    return()=>{
        if(offset>=32){buffer=createHash('sha256').update(`${seed}:${counter++}`).digest();offset=0;}
        const value=buffer.readUInt32BE(offset);offset+=4;return value/2**32;
    };
}
const pick=(rng,list)=>list[Math.floor(rng()*list.length)];
function shuffle(rng,list){const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
// Largest-remainder apportionment keeps every quota exact.
function apportion(total,weights){
    const keys=Object.keys(weights).sort(),sum=keys.reduce((n,k)=>n+weights[k],0);
    if(!sum)throw Error('人口模板缺少可分配的权重');
    const raw=keys.map(k=>({k,v:total*weights[k]/sum})),out=Object.fromEntries(raw.map(r=>[r.k,Math.floor(r.v)]));
    let left=total-Object.values(out).reduce((n,v)=>n+v,0);
    for(const r of [...raw].sort((a,b)=>(b.v-Math.floor(b.v))-(a.v-Math.floor(a.v))||a.k.localeCompare(b.k))){if(!left)break;out[r.k]++;left--;}
    return out;
}

// Template = what the skeleton already says about the settlement: residential
// districts (parents of registered homes), trades practised there, species and
// culture mix, and the naming stock of its registered people.
export function populationTemplate(world,settlementId,{blocklist=defaultBlocklist()}={}){
    const profile=world.settlementProfiles?.find(p=>p.id===settlementId);
    if(!profile||profile.registrationMode!=='seeded-on-demand'||!profile.populationSeed)return null;
    const people=new Map([...(world.npcs??[]),...(world.residents??[])].map(p=>[p.id,p]));
    const places=new Map((world.locations??[]).map(l=>[l.id,l]));
    const registered=profile.residentIds.map(id=>people.get(id)).filter(Boolean);
    const districtOf=home=>{const parent=places.get(home)?.parent;return parent&&parent!==settlementId?parent:home;};
    const districts={},minorWork=new Set(),composition={},cultures={},surnames=new Set(),given=new Set();
    for(const h of world.households??[])if(h.settlement===settlementId){const d=districtOf(h.homeLocation);if(d)(districts[d]??={households:0,work:new Set()}).households++;}
    for(const p of registered){
        const d=districtOf(p.home?.location??p.location);
        if(d&&p.age>=18&&p.occupation)(districts[d]??={households:0,work:new Set()}).work.add(p.occupation);
        if(p.age<18&&p.occupation)minorWork.add(p.occupation);
        const species=p.species??'';composition[species]=(composition[species]??0)+1;
        if(p.culture)(cultures[species]??={})[p.culture]=(cultures[species][p.culture]??0)+1;
        const chars=[...p.name];if(chars.length>=2){surnames.add(chars[0]);for(const c of chars.slice(1))given.add(c);}
    }
    const usable=Object.entries(districts).filter(([,d])=>d.households>0&&d.work.size>0);
    for(const c of GIVEN_STOCK)given.add(c);
    if(!usable.length||surnames.size<2)return null;
    const topCulture=row=>Object.entries(row??{}).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]??null;
    return {
        settlement:settlementId,seed:profile.populationSeed,short:settlementId.replace(/^loc_/,''),
        districts:Object.fromEntries(usable.sort(([a],[b])=>a.localeCompare(b)).map(([id,d])=>[id,{weight:d.households,work:[...d.work].sort()}])),
        minorWork:minorWork.size?[...minorWork].sort():[FALLBACK_MINOR_WORK],
        composition:Object.fromEntries(Object.entries(composition).sort()),
        cultures:Object.fromEntries(Object.keys(composition).sort().map(s=>[s,topCulture(cultures[s])??topCulture(Object.assign({},...Object.values(cultures)))])),
        surnames:[...surnames].sort(),given:[...given].sort(),
        taken:[...new Set([...people.values()].map(p=>p.name).filter(Boolean))].sort(),
        blocked:[...new Set(blocklist)].sort(),
    };
}
export function populationBasis(world,settlementId){
    const p=world.settlementProfiles.find(row=>row.id===settlementId);
    return {pendingPopulation:p.pendingPopulation,pendingHouseholdCount:p.pendingHouseholdCount,pendingAgeStructure:structuredClone(p.pendingAgeStructure)};
}

const planCache=new Map();
// The whole pending population is planned at once so quotas are exact; only
// the households of a visited district are ever written to the campaign.
export function populationPlan(template,basis){
    const key=hashText([template,basis]);if(planCache.has(key))return planCache.get(key);
    const rng=stream(`${template.seed}:population-plan:v${POPULATION_VERSION}`);
    const H=basis.pendingHouseholdCount,P=basis.pendingPopulation,ages=basis.pendingAgeStructure;
    if(!Number.isInteger(H)||!Number.isInteger(P)||H<0||P<H||(H===0&&P>0))throw Error('待生成人口与户数不成立');
    if(AGE_KEYS.reduce((n,k)=>n+(ages?.[k]??NaN),0)!==P)throw Error('待生成年龄配额与人数不符');
    if(P-ages.children<H)throw Error('成年人数不足以为每户安排户主');
    const base=Math.floor(P/(H||1)),extra=H?P%H:0;
    const sizes=shuffle(rng,Array.from({length:H},(_,i)=>base+(i<extra?1:0)));
    const pool=Object.fromEntries(AGE_KEYS.map(k=>[k,Array.from({length:ages[k]},()=>{const [lo,hi]=AGE_RANGES[k];return lo+Math.floor(rng()*(hi-lo+1));}).sort((a,b)=>b-a)]));
    const heads=[...shuffle(rng,pool.adults),...shuffle(rng,pool.elders),...[...pool.youngAdults].sort((a,b)=>b-a)];
    const headAges=heads.slice(0,H),otherAdults=heads.slice(H);
    const homes=sizes.map((size,i)=>({size,members:[{age:headAges[i],role:'户主'}]}));
    for(const age of pool.children){
        const eligible=homes.filter(h=>h.members.length<h.size&&h.members[0].age-age>=MIN_PARENT_GAP);
        if(!eligible.length)throw Error('未成年人找不到年龄相符的户主，人口模板不可生成');
        pick(rng,eligible).members.push({age,role:'子女'});
    }
    for(const age of shuffle(rng,otherAdults)){
        const open=homes.filter(h=>h.members.length<h.size);
        pick(rng,open).members.push({age,role:null});
    }
    const districtSlots=shuffle(rng,Object.entries(apportion(H,Object.fromEntries(Object.entries(template.districts).map(([id,d])=>[id,d.weight])))).flatMap(([id,n])=>Array(n).fill(id)));
    const speciesSlots=shuffle(rng,Object.entries(apportion(H,template.composition)).flatMap(([s,n])=>Array(n).fill(s)));
    const taken=new Set(template.taken),blocked=template.blocked;
    const nameOk=name=>!taken.has(name)&&!blocked.some(w=>name.includes(w)||w===name);
    function nameFor(surname){
        for(let i=0;i<96;i++){const first=pick(rng,template.given),second=pick(rng,template.given);const name=surname+first+(i<4||second===first?'':second);if(nameOk(name)){taken.add(name);return name;}}
        throw Error('人口模板姓名库不足');
    }
    const households=homes.map((h,i)=>{
        const index=i+1,district=districtSlots[i],species=speciesSlots[i]||null,headSex=rng()<0.5?'男':'女';
        const id=`house_pop_${template.short}_${pad(index)}`,surname=pick(rng,template.surnames);
        const head=h.members[0];let spouse=null;
        for(const m of h.members.slice(1))if(m.role===null&&!spouse&&Math.abs(m.age-head.age)<=10){m.role='伴侣';spouse=m;}
        for(const m of h.members.slice(1))if(m.role===null)m.role=head.age-m.age>=MIN_PARENT_GAP?'子女':m.age-head.age>=MIN_PARENT_GAP?'父母':'同住亲友';
        const members=h.members.map((m,j)=>{
            const sex=j===0?headSex:m===spouse?(headSex==='男'?'女':'男'):(rng()<0.5?'男':'女');
            const ownSurname=j===0||m.role==='子女'||(m.role==='父母'&&sex==='男')?surname:pick(rng,template.surnames);
            const occupation=m.age<18?pick(rng,template.minorWork):pick(rng,template.districts[district].work);
            return {id:`npc_pop_${template.short}_${pad(index)}_${j+1}`,name:nameFor(ownSurname),age:m.age,sex,role:m.role,occupation};
        });
        const headId=members[0].id;
        const kin=[];
        for(const m of members.slice(1)){
            if(m.role==='子女'){kin.push({parent:headId,child:m.id});const sp=members.find(x=>x.role==='伴侣');if(sp&&sp.age-m.age>=MIN_PARENT_GAP)kin.push({parent:sp.id,child:m.id});}
            if(m.role==='父母')kin.push({parent:m.id,child:headId});
        }
        return {id,index,district,species,culture:template.cultures[species??'']??null,dwelling:`home_pop_${template.short}_${pad(index)}`,members,kin};
    });
    const plan={settlement:template.settlement,households};
    planCache.set(key,plan);if(planCache.size>16)planCache.delete(planCache.keys().next().value);
    return plan;
}

function relationsOf(household,personId){
    const label={'户主':'户主','伴侣':'伴侣','子女':'子女','父母':'父母','同住亲友':'同住亲友'};
    const me=household.members.find(m=>m.id===personId),head=household.members[0];
    return household.members.filter(m=>m.id!==personId).map(m=>{
        let relation;
        if(household.kin.some(k=>k.parent===m.id&&k.child===personId))relation='父母';
        else if(household.kin.some(k=>k.parent===personId&&k.child===m.id))relation='子女';
        else if(me.role==='户主')relation=label[m.role];
        else if(m.id===head.id)relation=me.role==='伴侣'?'伴侣':'同住户主';
        else relation=me.role==='子女'&&m.role==='子女'?'同住兄弟姐妹':'同住亲友';
        return {with:m.id,name:m.name,relation,age:m.age};
    });
}

function rosterEntity(template,household,member){
    const minor=member.age<18;
    return {id:member.id,name:member.name,aliases:[],tier:'roster',generated:'population',populationVersion:POPULATION_VERSION,
        age:member.age,sex:member.sex,...(household.species?{species:household.species}:{}),culture:household.culture,
        settlement:template.settlement,scope:template.settlement,householdId:household.id,household:household.members.filter(m=>m.id!==member.id).map(m=>m.id),
        householdRole:member.role,kin:relationsOf(household,member.id),occupation:member.occupation,
        home:{district:household.district,dwelling:household.dwelling,access:'同户共居；进入私宅须先取得成年住户的有效许可。'},
        location:household.district,flags:{minor,romanceable:!minor},profileStatus:'roster'};
}

// Settlement owning a residential district, read from the current edition.
const districtIndex=new WeakMap();
function settlementForDistrict(world,location){
    if(!districtIndex.has(world)){
        const map=new Map();
        for(const p of world.settlementProfiles??[]){
            if(p.registrationMode!=='seeded-on-demand')continue;
            const t=populationTemplate(world,p.id);if(!t)continue;
            for(const d of Object.keys(t.districts))if(!map.has(d))map.set(d,p.id);
        }
        districtIndex.set(world,map);
    }
    return districtIndex.get(world).get(location)??null;
}

export function populationRecord(state,settlementId){return state.population?.[settlementId]??null;}

// Called inside a ledger event when the player's location changes. Pure and
// deterministic, so replay recreates exactly the same patches.
export function unfoldPopulationAt(d,engine,location){
    const state=d.get('state');
    let settlementId=Object.entries(state.population??{}).find(([,r])=>r.template.districts[location])?.[0]??null;
    settlementId??=settlementForDistrict(engine.world,location);
    if(!settlementId)return null;
    let record=structuredClone(populationRecord(state,settlementId));
    if(!record){
        const template=populationTemplate(engine.world,settlementId);if(!template)return null;
        const basis=populationBasis(engine.world,settlementId);
        record={version:POPULATION_VERSION,template,basis,remaining:{population:basis.pendingPopulation,households:basis.pendingHouseholdCount,ages:structuredClone(basis.pendingAgeStructure)},districts:{},profiles:{}};
    }
    if(!record.template.districts[location]||record.districts[location])return null;
    const plan=populationPlan(record.template,record.basis),rows=plan.households.filter(h=>h.district===location);
    const people=[];
    for(const household of rows){
        record.remaining.households--;
        for(const member of household.members){
            record.remaining.population--;record.remaining.ages[bucketOf(member.age)]--;
            if(d.get('state','created',member.id)||d.get('state','npcs',member.id))throw Error(`按需人口编号已被占用：${member.id}`);
            d.set(['state','created',member.id],rosterEntity(record.template,household,member));people.push(member.id);
        }
    }
    if(record.remaining.households<0||record.remaining.population<0||AGE_KEYS.some(k=>record.remaining.ages[k]<0))throw Error('按需人口超出剩余配额，拒绝生成');
    record.districts[location]={households:rows.map(h=>h.id),people:people.length,minute:state.minute};
    d.set(['state','population',settlementId],record);
    return {version:POPULATION_VERSION,settlement:settlementId,district:location,households:rows.length,people:people.length,remaining:record.remaining.population};
}

// A small, stable set of district residents the player can run into today.
export function populationEncounters(document,location,limit=4){
    const s=document.state;
    for(const [settlementId,record]of Object.entries(s.population??{})){
        const district=record.districts?.[location];if(!district)continue;
        const day=Math.floor(s.minute/1440);
        const ids=Object.values(s.created??{}).filter(e=>e.generated==='population'&&e.settlement===settlementId&&e.home?.district===location&&!s.npcs?.[e.id]).map(e=>e.id);
        const chosen=ids.map(id=>[hashText(`${record.template.seed}:${day}:${id}`),id]).sort((a,b)=>a[0].localeCompare(b[0])).slice(0,limit).map(r=>r[1]);
        return {settlement:settlementId,district:location,households:district.households.length,people:district.people,members:chosen.map(id=>s.created[id])};
    }
    return null;
}
export function populationScene(document){
    const view=populationEncounters(document,document.state.location);if(!view)return null;
    const species=e=>e.species?`${e.species}，`:'';
    return `【本区按需登记住户】${view.households}户${view.people}人；此刻可遇见：${view.members.map(e=>`${e.name}（${e.id}）${species(e)}${e.age}岁，${e.occupation}${e.flags.minor?'，未成年':''}`).join('；')||'无'}。仅有名册身份，首次交谈后才建立完整档；不得改动其年龄、户籍、住处、职业或物种。`;
}

// ---- Full profile hard constraints -------------------------------------------------
const IDENTITY_KEYS=['id','name','age','sex','species','culture','settlement','scope','householdId','household','householdRole','home','location','occupation','flags','tier'];
const FORBIDDEN_KEYS=['coins','inventory','wealth','items','money','property','services','skills','level','combat','schedule'];
const ROMANCE=/恋爱|恋人|情人|相好|心上人|意中人|婚约|订婚|定亲|成亲|成婚|嫁给|娶|求爱|求亲|约会|调情|暗恋|爱慕|亲吻|同床|共枕|私奔|情愫|结缘|心仪/;
const AGE_CLAIM=/(\d{1,3}|[一二三四五六七八九十两]{1,3})\s*岁/g;
const textOf=value=>typeof value==='string'?value:Array.isArray(value)?value.map(textOf).join('；'):value&&typeof value==='object'?Object.values(value).map(textOf).join('；'):'';
function chineseNumber(raw){
    if(/^\d+$/.test(raw))return Number(raw);
    const map={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
    if(raw==='十')return 10;
    const [a,b]=raw.split('十');if(raw.includes('十'))return (a?map[a]:1)*10+(b?map[b]??0:0);
    return map[raw]??NaN;
}
export const PROFILE_FIELDS={
    personality:'object',voice:'object',background:'string',currentConcern:'string',goals:'array',fears:'array',
    knowledge:'object',relationships:'array',visibleFeature:'string',notes:'string',
};
// Returns the list of violations; empty means the profile may be stored.
export function checkGeneratedProfile(identity,profile,{template=null,blocklist=defaultBlocklist()}={}){
    const errors=[],add=m=>errors.push(m);
    if(!profile||typeof profile!=='object'||Array.isArray(profile))return ['完整档不是对象'];
    for(const key of Object.keys(profile)){
        if(FORBIDDEN_KEYS.includes(key))add(`完整档不得补发钱物或能力：${key}`);
        else if(IDENTITY_KEYS.includes(key)){if(JSON.stringify(profile[key])!==JSON.stringify(identity[key]))add(`完整档改动了已分配身份：${key}`);}
        else if(!PROFILE_FIELDS[key])add(`完整档含未知字段：${key}`);
        else if(PROFILE_FIELDS[key]==='array'?!Array.isArray(profile[key]):typeof profile[key]!==PROFILE_FIELDS[key]||profile[key]===null)add(`完整档字段格式不符：${key}`);
    }
    for(const key of ['personality','voice','background','currentConcern'])if(!profile[key])add(`完整档缺少：${key}`);
    const all=textOf(Object.fromEntries(Object.entries(profile).filter(([k])=>PROFILE_FIELDS[k])));
    if(all.length>2400)add('完整档过长');
    // Age and kin.
    for(const match of all.matchAll(AGE_CLAIM)){const n=chineseNumber(match[1]);if(Number.isFinite(n)&&n>identity.age)add(`完整档声称的年龄超过本人：${match[0]}`);}
    const kin=new Map((identity.kin??[]).map(k=>[k.with,k]));
    for(const r of profile.relationships??[]){
        if(!r||typeof r!=='object'){add('关系条目无效');continue;}
        const known=kin.get(r.with);
        if(!known)add(`关系对象不在本户：${r.with}`);
        else if(r.relation!==undefined&&r.relation!==known.relation)add(`亲属关系与户籍不符：${r.with}/${r.relation}`);
    }
    if(/(我|他|她)(的)?(亲生)?(儿子|女儿|孩子|子女)/.test(textOf(profile.background))&&!(identity.kin??[]).some(k=>k.relation==='子女'))add('背景声称有子女，但户籍中没有');
    // Address and household.
    if(identity.home?.district!==identity.location&&identity.location!==undefined)add('住址与所在住区不符');
    if(template){
        const district=template.districts?.[identity.home?.district];
        if(!district)add('住址不在本聚落的住区');
        // Occupation and skeleton.
        else if(identity.age>=18&&!district.work.includes(identity.occupation))add(`职业不属于该住区骨架：${identity.occupation}`);
        if(identity.age<18&&!template.minorWork.includes(identity.occupation))add(`未成年人职业不属于骨架：${identity.occupation}`);
        // Species and settlement composition.
        if(!Object.hasOwn(template.composition,identity.species??''))add(`物种不属于聚居地构成：${identity.species??'人类'}`);
    }
    // Minors never enter romance or intimacy.
    if(identity.age<18){
        if(identity.flags?.romanceable)add('未成年人不得标为可恋爱');
        if(ROMANCE.test(all))add('未成年人完整档出现恋爱或亲密情节');
    }
    for(const word of blocklist)if(word&&all.includes(word))add(`完整档使用了屏蔽专名：${word}`);
    return errors;
}

export function acceptPopulationProfile(d,engine,input){
    const person=String(input.person??''),entity=d.get('state','created',person);
    if(!entity||entity.generated!=='population')throw Error('只有按需登记的名册人物才能建立按需完整档');
    const record=d.get('state','population',entity.settlement);if(!record)throw Error('按需人口记录缺失');
    const status=record.profiles?.[person];
    if(status?.status==='full'||entity.profileStatus==='full')throw Error('完整档已入库，之后不再改变');
    const minute=d.get('state','minute');
    if(input.outcome==='failed'){
        const failures=(status?.failures??0)+1;
        d.set(['state','population',entity.settlement,'profiles',person],{status:'failed',failures,lastReason:String(input.reason??'生成失败').slice(0,300),minute});
        return {person,status:'failed',failures,identityKept:true};
    }
    if((status?.failures??0)>=MAX_PROFILE_FAILURES)throw Error('该人物完整档生成已连续失败，保留名册身份');
    const errors=checkGeneratedProfile(entity,input.profile,{template:record.template});
    if(errors.length)throw Error(`完整档未通过硬约束：${errors.join('；')}`);
    const profile=Object.fromEntries(Object.entries(input.profile).filter(([k])=>PROFILE_FIELDS[k]));
    const full={...entity,...profile,profileStatus:'full'};
    d.set(['state','created',person],full);
    d.set(['state','population',entity.settlement,'profiles',person],{status:'full',failures:status?.failures??0,minute,profileHash:hashText(profile),
        ...(input.generator?{generator:{model:String(input.generator.model??'').slice(0,60),calls:Number(input.generator.calls)||0}}:{})});
    // The person enters the campaign with no purse or goods: a profile never grants wealth.
    d.set(['state','npcs',person],{...initialNpcState({...full,coins:0,inventory:{}}),occupation:full.occupation});
    return {person,status:'full',name:full.name};
}

// Identity handed to a drafting model: only fields the profile must respect.
export function profileBrief(document,person){
    const s=document.state,e=s.created?.[person];if(!e)return null;
    const record=s.population?.[e.settlement];
    return {identity:{id:e.id,name:e.name,age:e.age,sex:e.sex,species:e.species??null,culture:e.culture,occupation:e.occupation,minor:e.flags.minor,
        householdRole:e.householdRole,household:e.kin.map(k=>({id:k.with,name:k.name,relation:k.relation,age:k.age})),district:e.home.district,dwelling:e.home.dwelling},
        settlement:e.settlement,districtWork:record?.template.districts[e.home.district]?.work??[]};
}

// ---- Roster people entering family life ---------------------------------------
// A registered roster resident (spouse, child or housemate of a full person)
// has no campaign state until family life needs them: to bear or father a
// child, to nurse a sick housemate, to inherit or to move with their family.
// Then their catalog identity becomes a campaign actor exactly as an on-demand
// profile does: no purse or goods are granted, the profile is not rewritten,
// and they keep a plain home routine. A roster person has no authored view of
// others, so their first view of each housemate or relative is the one that
// person registered towards them.
export function lifeRoutine(home,{minor=false,occupation=''}={}){
    const day=minor?'在家中玩耍，由家人照看':`在家操持家务${occupation?`（${occupation}）`:''}`;
    return {default:[{start:0,end:360,location:home,activity:'睡眠',services:[]},{start:360,end:1260,location:home,activity:day,services:[]},{start:1260,end:1440,location:home,activity:'睡眠',services:[]}]};
}
export function rosterLifeState(engine,state,id,minute,reason,{minor=false}={}){
    const entity=engine.byId.get(id);
    if(!entity||entity.tier!=='roster'||state.npcs?.[id]||!entity.householdId)return null;
    const house=engine.world.households?.find(h=>h.id===entity.householdId&&h.members.includes(id));
    const home=house?.homeLocation??entity.home?.location;if(!home)return null;
    const relationships={};
    for(const other of engine.world.npcs??[])for(const tie of other.relationships??[])if(tie.with===id&&state.npcs?.[other.id])
        relationships[other.id]={trust:tie.trust??0,affection:tie.affection??0,respect:0,fear:0,romance:0,competition:0,favors:[],evidenceKeys:[]};
    return {...initialNpcState({...entity,location:home,coins:0,inventory:{}}),occupation:entity.occupation??'',activity:'在家',relationships,
        routine:lifeRoutine(home,{minor,occupation:entity.occupation}),life:{kind:'roster',since:minute,reason}};
}
