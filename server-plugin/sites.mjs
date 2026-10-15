import {heldUnit} from './items.mjs';
import {consumeMagicProtection} from './magic-primitives.mjs';
import {assertLocationAccess} from './location-access.mjs';
import {actorPath} from './npc-state.mjs';
import {validateMonsterSocieties,passageAllows,assertSocietyEntry,infiltrationDetected,infiltrationSucceeded,societyAt} from './monster-society.mjs';
import {traitsOf} from './traits.mjs';

// A location's optional site contains occupants (actor IDs), manager, owner,
// entryMechanisms, mechanisms, clues, resources and truths. Local IDs stay stable
// across editions. Checks use the existing attribute/skill/difficulty rules.
// Mechanisms have check, minutes, optional tool/materials/failureDamage; clues
// have text, minutes, optional check/mechanisms; resources have item, quantity,
// minutes, optional owner/mechanisms/requires. Truths require clue IDs and either
// text or a history ID whose accounts.verified.claim is unlocked by that evidence.
// Optional: history [{era,text}] is the public account shown once inside;
// changes [{id,kind:'regrow'|'rearm',everyDays,...}] settle lazily on the site
// ledger by elapsed time (regrow refills a resource up to max, rearm resets a
// cleared mechanism); a mechanism's element {feature,tags} names a feature of
// the same place whose current trait (burning/wet/frozen/hot) clears it.
const clone=value=>structuredClone(value);
const DAY=1440,ELEMENT_STATES=['burning','wet','frozen','hot'];
const siteKey=id=>`site:${id}`;
const discoveryKey=(site,clue)=>`site_discovery:${site}:${clue}`;
const observationKey=(site,mechanism)=>`site_observation:${site}:${mechanism}`;
const ownerOf=(place,row=place.site)=>Object.hasOwn(row,'owner')?row.owner:place.site.owner??place.owner??null;
const authorityOf=(place,owner)=>owner===ownerOf(place)?place.site.manager??owner:owner;
const living=actor=>actor&&actor.status!=='死亡'&&(actor.hp===undefined||actor.hp>0);
const allowed=(document,place,owner,authorization,operation='enter')=>{
    if(!owner||owner==='player'||passageAllows(document,place,owner,operation))return true;
    return (Array.isArray(authorization)?authorization:[authorization]).some(id=>{
        const p=document.state.records?.[id];
        return p?.category==='authorization'&&p.action==='site_use'&&p.subject===place.id&&p.grantee==='player'
            &&p.grantor===authorityOf(place,owner)&&(p.owner===owner||p.owners?.includes(owner))&&p.operations?.includes(operation)&&!p.revoked&&p.expires>document.state.minute;
    });
};
const discovered=(document,site,clue)=>{
    const row=document.state.records?.[discoveryKey(site,clue)];
    return row?.category==='site_discovery'&&row.actor==='player'&&row.site===site&&row.clue===clue&&Boolean(row.sourceEvent);
};

export function validateSites(world){
    const errors=[],entities=new Map([...world.locations,...world.npcs,...world.items,...world.skills,...world.bosses??[],...world.monsters??[],...world.factions??[],...world.history??[]].map(row=>[row.id,row]));
    for(const place of world.locations.filter(row=>row.site)){
        const s=place.site,fail=message=>errors.push(`${place.id}.site: ${message}`);
        if(!s||typeof s!=='object'||Array.isArray(s)){fail('据点参数无效');continue;}
        const rows={};
        for(const key of ['mechanisms','clues','resources','truths']){
            if(s[key]!==undefined&&!Array.isArray(s[key])){fail(`${key}须为数组`);rows[key]=[];continue;}
            rows[key]=s[key]??[];
        }
        const ids=new Set();
        for(const row of Object.values(rows).flat()){
            if(!row||typeof row.id!=='string'||!/^\w[\w-]{0,99}$/.test(row.id)||ids.has(row.id)){fail('目标编号缺失、重复或无效');continue;}
            ids.add(row.id);
        }
        const mechanisms=new Set(rows.mechanisms.map(row=>row?.id)),clues=new Set(rows.clues.map(row=>row?.id));
        const references=(list,valid,label)=>{if(!Array.isArray(list)||list.some(id=>!valid.has(id)))fail(`${label}引用无效`);};
        const ownership=owner=>{if(owner&&owner!=='player'&&!entities.has(owner))fail(`物权引用不存在：${owner}`);};
        ownership(ownerOf(place));
        if(s.manager&&!world.npcs.some(row=>row.id===s.manager&&row.age>=18))fail('管理人须为登记成年NPC');
        if(s.occupants!==undefined){references(s.occupants,entities,'occupants');if(Array.isArray(s.occupants)&&s.occupants.some(id=>! /^(npc|boss|monster)_/.test(id)))fail('占据者须为实际人物或生物');}
        references(s.entryMechanisms??[],mechanisms,'entryMechanisms');
        if(s.infiltration!==undefined){const p=s.infiltration,c=p?.check;
            if(['private','council'].includes(place.access?.mode))fail('私宅与议事区不能登记为可潜入');
            if(!p||typeof p!=='object'||!Number.isSafeInteger(p.minutes)||p.minutes<1||p.minutes>1440||!c||!world.rules.attributes.includes(c.attribute)||
                !Object.values(world.rules.check.difficulties).includes(c.difficulty)||c.skill&&!world.skills.some(x=>x.id===c.skill)||
                p.damage!==undefined&&(!Number.isSafeInteger(p.damage)||p.damage<0))fail('潜入参数须有1至1440分钟耗时及有效检定');
        }
        if(s.history!==undefined&&(!Array.isArray(s.history)||!s.history.length||s.history.some(h=>typeof h?.era!=='string'||!h.era.trim()||typeof h.text!=='string'||!h.text.trim())))fail('历史须为含年代与正文的非空列表');
        if(s.changes!==undefined){
            if(!Array.isArray(s.changes))fail('changes须为数组');
            else for(const c of s.changes){
                if(!c||typeof c.id!=='string'||!/^\w[\w-]{0,99}$/.test(c.id)||ids.has(c.id)){fail('变化编号缺失、重复或无效');continue;}
                ids.add(c.id);
                if(!Number.isSafeInteger(c.everyDays)||c.everyDays<1||c.everyDays>3650)fail(`${c.id}变化周期须为1至3650天`);
                const resource=rows.resources.find(r=>r?.id===c.resource);
                if(c.kind==='regrow'){if(!resource||!Number.isSafeInteger(c.quantity)||c.quantity<1||!Number.isSafeInteger(c.max)||c.max<1||c.max>resource.quantity)fail(`${c.id}再生须引用资源且上限不超过原有库存`);}
                else if(c.kind==='rearm'){if(!mechanisms.has(c.mechanism))fail(`${c.id}复位须引用登记机关`);}
                else fail(`${c.id}变化类型须为regrow或rearm`);
            }
        }
        for(const [kind,list]of Object.entries(rows))for(const row of list){
            if(!row||typeof row!=='object')continue;
            if(kind!=='truths'&&(typeof row.name!=='string'||!row.name.trim()||!Number.isSafeInteger(row.minutes)||row.minutes<1||row.minutes>1440))fail(`${row.id}须有名称及1至1440分钟耗时`);
            if(kind==='mechanisms'&&!row.check)fail(`${row.id}缺少机关检定`);
            if(kind==='mechanisms'&&row.element!==undefined){const e=row.element;
                if(!e||!(place.features??[]).some(f=>f.id===e.feature)||!Array.isArray(e.tags)||!e.tags.length||e.tags.some(t=>!ELEMENT_STATES.includes(t)))fail(`${row.id}元素解法须引用本地环境对象及有效状态`);
            }
            if(row.check){const c=row.check;
                if(!world.rules.attributes.includes(c.attribute)||!Object.values(world.rules.check.difficulties).includes(c.difficulty)||c.skill&&!world.skills.some(x=>x.id===c.skill))fail(`${row.id}检定参数无效`);
            }
            references(row.mechanisms??[],mechanisms,`${row.id}.mechanisms`);
            references(row.requires??[],clues,`${row.id}.requires`);
            if(row.tool&&!world.items.some(x=>x.id===row.tool))fail(`${row.id}工具未登记`);
            if(row.materials!==undefined&&(!Array.isArray(row.materials)||row.materials.some(x=>!world.items.some(i=>i.id===x.item)||!Number.isSafeInteger(x.quantity)||x.quantity<1)))fail(`${row.id}消耗材料无效`);
            if(row.failureDamage!==undefined&&(!Number.isSafeInteger(row.failureDamage)||row.failureDamage<0))fail(`${row.id}机关伤害无效`);
            if(kind==='resources'){
                ownership(ownerOf(place,row));
                if(!world.items.some(x=>x.id===row.item)||!Number.isSafeInteger(row.quantity)||row.quantity<0||row.quantity>100000)fail(`${row.id}有限库存无效`);
            }
            if(kind==='clues'&&(typeof row.text!=='string'||!row.text.trim()))fail(`${row.id}缺少发现正文`);
            if(kind==='truths'){
                if(!row.requires?.length)fail(`${row.id}真相须有发现条件`);
                if(row.history&&!world.history?.some(x=>x.id===row.history&&x.accounts?.verified?.claim))fail(`${row.id}历史引用无效`);
                if(!row.history&&(typeof row.text!=='string'||!row.text.trim()))fail(`${row.id}缺少真相正文`);
            }
        }
    }
    return [...errors,...validateMonsterSocieties(world)];
}

export function siteKnowledge(world,document){
    if(!document)return [];
    return world.locations.filter(place=>place.site).flatMap(place=>(place.site.truths??[])
        .filter(truth=>truth.requires.every(clue=>discovered(document,place.id,clue)))
        .map(truth=>{const history=world.history?.find(row=>row.id===truth.history),evidence=truth.requires.map(clue=>document.state.records[discoveryKey(place.id,clue)]);
            return{id:`site_truth:${place.id}:${truth.id}`,site:place.id,history:truth.history??null,name:history?.name??place.name,
                text:truth.text??history.accounts.verified.claim,actor:'player',evidence:evidence.map(row=>row.sourceEvent),minute:Math.max(...evidence.map(row=>row.minute)),verified:true};
        }));
}

function assertOccupants(d,engine,place,authorization){
    const s=place.site,ids=new Set(s.occupants??[]);
    for(const boss of engine.world.bosses??[])if(boss.residence?.location===place.id){
        const occupant=d.get('state','records',`lair:${boss.residence.id}`)?.occupant?.actor;
        if(occupant)ids.add(occupant);
    }
    for(const id of ids){
        const actor=engine.actor(d,id),isNpc=engine.actorPath(id)[1]==='npcs';
        if(!actor)throw Error('登记占据者状态尚未落实，不能视为空置');
        if(actor.location!==place.id||!living(actor))continue;
        if(isNpc&&place.access?.mode==='public')continue;
        const managed=s.manager&&ownerOf(place)&&allowed(d.document,place,ownerOf(place),authorization);
        if(!isNpc||!managed&&!allowed(d.document,place,id,authorization))throw Error('占据者仍在场，需取得许可或实际解决占据关系');
    }
}

// Time-driven changes settle from the stored anchors; nothing refreshes on revisit.
function settle(place,row,minute){
    if(!place.site.changes?.length)return row;
    row.changes??={};
    for(const c of place.site.changes){
        const period=c.everyDays*DAY,mark=row.changes[c.id];
        if(mark===undefined){row.changes[c.id]=minute;continue;}
        const n=Math.floor((minute-mark)/period);if(n<1)continue;
        row.changes[c.id]=mark+n*period;
        if(c.kind==='regrow'){const left=row.remaining[c.resource]??0;row.remaining[c.resource]=Math.max(left,Math.min(c.max,left+n*c.quantity));}
        else{const m=row.mechanisms[c.mechanism];
            if(m?.status==='已解除'&&minute-m.minute>=period)row.mechanisms[c.mechanism]={status:'未解除',rearmed:true,minute:m.minute+period,sourceEvent:m.sourceEvent};
        }
    }
    return row;
}
function ledger(d,place){
    const old=d.get('state','records',siteKey(place.id)),row=clone(old??{category:'site',site:place.id,remaining:{},mechanisms:{}});
    for(const resource of place.site.resources??[])if(!Object.hasOwn(row.remaining,resource.id))row.remaining[resource.id]=resource.quantity;
    return settle(place,row,d.get('state','minute'));
}
const unblocked=(row,gates)=>{if(gates.some(id=>row.mechanisms[id]?.status!=='已解除'))throw Error('机关尚未解除');};
const inside=(d,place)=>d.get('state','records','site_presence')?.site===place.id&&d.get('state','records','site_presence')?.actor==='player';
const covert=(d,place)=>inside(d,place)&&d.get('state','records','site_presence').covert===true;
function watchers(d,engine,place){
    const society=societyAt(engine,place.id)?.id,occupants=new Set(place.site.occupants??[]);
    return engine.world.npcs.filter(n=>(occupants.has(n.id)||society&&n.society===society||[place.site.manager,ownerOf(place)].includes(n.id))&&(n.age??18)>=18).map(n=>n.id).sort().filter(id=>{
        const a=d.get('state','npcs',id);return a?.location===place.id&&!['死亡','濒死','昏迷','患病'].includes(a.status)&&(a.hp===undefined||a.hp>0)&&!a.scheduleTravel&&!a.cognitionTravel&&!/睡眠|睡觉|熟睡/.test(a.activity??'');
    });
}
function infiltrate(d,engine,place,eventId){
    const plan=place.site.infiltration;
    if(!plan)throw Error('这里不是登记可潜入的据点；私宅与其他据点仍须许可');
    if(inside(d,place))return{...siteView(engine,d.document),duplicate:true};
    if(d.get('state','player','companions')?.length)throw Error('潜入不能带同行者');
    unblocked(ledger(d,place),place.site.entryMechanisms??[]);
    engine.advance(d,plan.minutes,eventId);
    if(d.get('state','location')!==place.id||d.get('state','player','status')!=='正常')return{entered:false,note:'潜入途中失去行动能力或离开此地'};
    const watcher=watchers(d,engine,place)[0],{difficulty,...rest}=plan.check;
    const check=engine.check(d,watcher?{...rest,opponent:{npc:watcher,attribute:'精神'}}:plan.check,eventId);
    if(check.success){
        d.set(['state','records',siteKey(place.id)],ledger(d,place));
        d.set(['state','records','site_presence'],{category:'site_presence',site:place.id,actor:'player',covert:true,minute:d.get('state','minute'),sourceEvent:eventId});
        infiltrationSucceeded(d,engine,place,eventId);
        return{...siteView(engine,d.document),covert:true,detected:false,check,minutes:plan.minutes};
    }
    if(!watcher)return{entered:false,detected:false,check,minutes:plan.minutes,note:'未能找到潜入路径，无人察觉'};
    const outcome=infiltrationDetected(d,engine,place,watcher,eventId);let damage=0;
    if(outcome.response==='交锋'){
        damage=consumeMagicProtection(d,'player',plan.damage??0,'physical').damage;
        if(damage)engine.health(d,{delta:-damage},eventId);
    }
    let expelled=null;
    if(place.parent&&d.get('state','player','status')==='正常'){
        // Expulsion is a real walk out of the site, timed and routed like world_move.
        const action=engine.npcObligationAction;engine.npcObligationAction={tool:'move',args:{destination:place.parent}};
        try{expelled=engine.move(d,{destination:place.parent},eventId).destination;}finally{engine.npcObligationAction=action;}
    }
    return{entered:false,detected:true,watcher,check,...outcome,damage,expelled,minutes:plan.minutes};
}

export function siteView(engine,document){
    const place=engine.byId.get(document.state.location);if(!place?.site)return null;
    const stored=document.state.records?.[siteKey(place.id)],row=stored?settle(place,clone(stored),document.state.minute):stored,entered=document.state.records?.site_presence?.site===place.id;
    const view={site:place.id,name:place.name,owner:ownerOf(place),entered,occupants:(place.site.occupants??[]).filter(id=>{
        const path=actorPath(engine.world,id),actor=document.state[path[1]]?.[path[2]];return actor?.location===place.id&&living(actor);
    }),mechanisms:(place.site.mechanisms??[]).filter(m=>entered||(place.site.entryMechanisms??[]).includes(m.id)).map(m=>({id:m.id,name:m.name,description:m.description??'',status:row?.mechanisms[m.id]?.status??'未解除'}))};
    if(entered){
        if(place.site.history)view.history=place.site.history.map(h=>`${h.era}：${h.text}`);
        view.clues=(place.site.clues??[]).map(c=>({id:c.id,name:c.name,description:c.description??'',discovered:discovered(document,place.id,c.id)}));
        view.resources=(place.site.resources??[]).filter(r=>(r.requires??[]).every(id=>discovered(document,place.id,id))).map(r=>({id:r.id,name:r.name,item:r.item,owner:ownerOf(place,r),remaining:row?.remaining[r.id]??r.quantity}));
    }
    return view;
}

export function siteAction(d,args,eventId){
    const place=this.byId.get(d.get('state','location'));
    if(!place?.site)throw Error('所在地没有登记遗迹据点；须先沿道路抵达');
    const operation=args.operation??'inspect',s=place.site;
    if(args.authorizations!==undefined&&(!Array.isArray(args.authorizations)||args.authorizations.length>8))throw Error('据点许可名单最多8项');
    const authorizations=[args.authorization,...args.authorizations??[]];
    if(operation==='inspect')return siteView(this,d.document);
    if(operation==='infiltrate')return infiltrate(d,this,place,eventId);
    if(!['enter','investigate','disarm','gather'].includes(operation))throw Error('据点操作须为inspect、enter、investigate、disarm、gather或infiltrate');
    const assertAccess=()=>{
        if(operation==='investigate'&&covert(d,place))return;
        assertSocietyEntry(d,this,place);
        if(['private','council'].includes(place.access?.mode)&&place.access.requiresConsent){
            const authorization=authorizations.find(id=>d.get('state','records',id)?.subject===place.id&&['site_use','enter_home','enter_council'].includes(d.get('state','records',id)?.action));
            assertLocationAccess(d,this,place.id,{authorization,companions:d.get('state','player','companions')??[]});
        }
        if(!(place.access?.mode==='public'&&['enter','investigate'].includes(operation))&&!allowed(d.document,place,ownerOf(place),authorizations,operation==='disarm'?'disarm':'enter'))throw Error('据点物权要求所有者的有效许可');
        assertOccupants(d,this,place,authorizations);
    };
    const advance=minutes=>{this.advance(d,minutes,eventId);assertAccess();};
    assertAccess();
    const row=ledger(d,place);
    if(operation==='enter'){
        unblocked(row,s.entryMechanisms??[]);
        d.set(['state','records',siteKey(place.id)],row);
        d.set(['state','records','site_presence'],{category:'site_presence',site:place.id,actor:'player',minute:d.get('state','minute'),sourceEvent:eventId});
        return{...siteView(this,d.document),truths:siteKnowledge(this.world,d.document).filter(t=>t.site===place.id)};
    }
    const mechanism=(s.mechanisms??[]).find(m=>[m.id,m.name].includes(args.target));
    if(!inside(d,place)&&!((s.entryMechanisms??[]).includes(mechanism?.id)&&['investigate','disarm'].includes(operation)))throw Error('须先进入据点');
    if(operation==='investigate'&&mechanism){
        const key=observationKey(place.id,mechanism.id);
        if(d.get('state','records',key))return{target:mechanism.id,duplicate:true};
        advance(mechanism.minutes);
        d.set(['state','records',key],{category:'site_observation',site:place.id,target:mechanism.id,actor:'player',minute:d.get('state','minute'),sourceEvent:eventId});
        const element=mechanism.element?{feature:mechanism.element.feature,states:mechanism.element.tags}:undefined;
        return{target:mechanism.id,description:mechanism.description??'',tool:mechanism.tool??null,materials:mechanism.materials??[],...(element?{element}:{})};
    }
    if(operation==='disarm'){
        if(!mechanism)throw Error('没有这个登记机关');
        if(row.mechanisms[mechanism.id]?.status==='已解除')return{target:mechanism.id,duplicate:true};
        if(!d.get('state','records',observationKey(place.id,mechanism.id)))throw Error('须先调查机关');
        // A burning, soaked, frozen or heated feature does the work instead of tools and a check.
        const state=mechanism.element&&traitsOf(this,d.get('state'),mechanism.element.feature)?.tags.find(t=>mechanism.element.tags.includes(t));
        if(state){
            advance(mechanism.minutes);
            row.mechanisms[mechanism.id]={status:'已解除',method:state,sourceEvent:eventId,minute:d.get('state','minute')};
            d.set(['state','records',siteKey(place.id)],row);
            return{target:mechanism.id,element:{feature:mechanism.element.feature,state},damage:0,status:'已解除'};
        }
        if(mechanism.tool){const held=heldUnit(d,this,'player',mechanism.tool);if(!held||held.durability<=0)throw Error('缺少可用机关工具');}
        const costs=new Map();for(const cost of mechanism.materials??[])costs.set(cost.item,(costs.get(cost.item)??0)+cost.quantity);
        for(const[item,quantity]of costs)if(this.quantity(d,'player',item)<quantity)throw Error('机关消耗材料不足');
        for(const[item,quantity]of costs)this.itemDelta(d,'player',item,-quantity);
        const check=this.check(d,{...mechanism.check,...(mechanism.tool?{tools:[mechanism.tool]}:{})},eventId);
        advance(mechanism.minutes);
        row.mechanisms[mechanism.id]={status:check.success?'已解除':'未解除',sourceEvent:eventId,minute:d.get('state','minute')};
        d.set(['state','records',siteKey(place.id)],row);
        const damage=check.success?0:consumeMagicProtection(d,'player',mechanism.failureDamage??0,'physical').damage;
        if(damage)this.health(d,{delta:-damage},eventId);
        return{target:mechanism.id,check,damage,status:row.mechanisms[mechanism.id].status};
    }
    const target=(s[operation==='gather'?'resources':'clues']??[]).find(r=>[r.id,r.name].includes(args.target));
    if(!target)throw Error('没有这个登记调查或资源目标');
    unblocked(row,target.mechanisms??[]);
    if(operation==='gather'){
        if(!(target.requires??[]).every(id=>discovered(d.document,place.id,id)))throw Error('尚未实际发现这个资源');
        if(!allowed(d.document,place,ownerOf(place,target),authorizations,'gather'))throw Error('资源另有物权，入内许可不能转让财物');
        const quantity=args.quantity??1;
        if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000)throw Error('采集数量须为正整数');
        if(row.remaining[target.id]<quantity)throw Error('有限资源不足，不会因重访刷新');
        advance(target.minutes);
        if(!allowed(d.document,place,ownerOf(place,target),authorizations,'gather'))throw Error('资源许可已到期');
        row.remaining[target.id]-=quantity;d.set(['state','records',siteKey(place.id)],row);
        this.itemDelta(d,'player',target.item,quantity);
        return{target:target.id,item:target.item,quantity,remaining:row.remaining[target.id],owner:'player'};
    }
    if(discovered(d.document,place.id,target.id))return{target:target.id,duplicate:true,text:target.text};
    const check=target.check?this.check(d,target.check,eventId):{success:true};
    advance(target.minutes);
    if(!check.success)return{target:target.id,check,discovered:false};
    const evidence={category:'site_discovery',site:place.id,clue:target.id,actor:'player',text:target.text,minute:d.get('state','minute'),sourceEvent:eventId};
    d.set(['state','records',discoveryKey(place.id,target.id)],evidence);
    return{target:target.id,check,discovered:true,evidence,truths:siteKnowledge(this.world,d.document).filter(t=>t.site===place.id)};
}

export function sitePermission(d,engine,args,eventId){
    const old=args.authorization?d.get('state','records',args.authorization):null,target=args.location??args.destination??old?.subject;
    const place=engine.world.locations.find(row=>row.site&&[row.id,row.name,...row.aliases??[]].includes(target));
    if(!place&&old?.action!=='site_use')return null;
    if(!place)throw Error('许可所属据点已不存在');
    const grantor=engine.resolve(args.promisor,'npc'),base=engine.byId.get(grantor),actor=d.get('state','npcs',grantor),now=d.get('state','minute');
    const owners=[ownerOf(place),...(place.site.resources??[]).map(row=>ownerOf(place,row)),...place.site.occupants??[]];
    const owned=[...new Set(owners.filter(owner=>authorityOf(place,owner)===grantor))],owner=owned[0];
    const propertyOwners=[ownerOf(place),...(place.site.resources??[]).map(row=>ownerOf(place,row))];
    const onlyOccupant=owner&&!propertyOwners.includes(owner)&&!place.site.manager;
    if(!owner||base?.age<18||!actor||onlyOccupant&&actor.location!==place.id||actor.location!==d.get('state','location')||actor.scheduleTravel||actor.cognitionTravel||['死亡','濒死','昏迷','患病'].includes(actor.status)||/睡眠|熟睡|睡觉/.test(actor.activity??''))throw Error('据点许可须由现场清醒成年所有者、管理人或占据者签发');
    if(args.promisee!==undefined&&engine.resolve(args.promisee)!=='player')throw Error('据点许可只登记给玩家');
    if(place.access?.mode==='private'&&place.access.requiresConsent&&!place.access.residents?.includes(grantor))throw Error('私宅据点许可仍须由登记住户签发');
    if(place.access?.mode==='council'&&place.access.authority!==grantor)throw Error('议事区许可须由登记负责人签发');
    if(args.operation==='revoke_access'){
        if(old?.action!=='site_use'||old.subject!==place.id||old.grantor!==grantor)throw Error('只有原签发者能撤销据点许可');
        const permission={...old,revoked:true,revokedAt:now};d.set(['state','records',args.authorization],permission);return{authorization:args.authorization,permission};
    }
    const minutes=args.minutes??60;
    if(!Number.isSafeInteger(minutes)||minutes<1||minutes>10080||typeof args.content!=='string'||!args.content.trim()||args.content.length>1200)throw Error('据点许可须有用途及1至10080分钟期限');
    const operations={site_visit:['enter','investigate'],site_disarm:['enter','investigate','disarm'],site_gather:['enter','investigate','gather']}[args.type??'site_visit'];
    if(!operations)throw Error('据点许可类型须为site_visit、site_disarm或site_gather');
    const authorization=`permission_${eventId}`;if(d.get('state','records',authorization))throw Error('许可编号已经存在');
    if(args.guests!==undefined&&(!Array.isArray(args.guests)||args.guests.length>8))throw Error('据点许可同行名单最多8人');
    const guests=(args.guests??[]).map(name=>engine.resolve(name,'npc'));
    if(new Set(guests).size!==guests.length||guests.some(id=>d.get('state','npcs',id,'location')!==actor.location||!d.get('state','player','companions')?.includes(id)))throw Error('获准同行者须为实际在场且不重复的同行人');
    const permission={category:'authorization',action:'site_use',subject:place.id,owner,owners:owned,grantor,grantee:'player',operations,guests,expires:now+minutes,revoked:false,content:args.content.trim(),sourceEvent:eventId};
    d.set(['state','records',authorization],permission);return{authorization,permission};
}
