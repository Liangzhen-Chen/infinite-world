import {preconditionFailure} from './precondition.mjs';
import {initialKnowledgeAction} from './primitives-learning.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {heldUnit,wearItem} from './items.mjs';
import {digest,recordsWhere} from './storage.mjs';
import {actionCostRule,assertActionTime,beginActionActivity,finishActionActivity,learnFromWork} from './action-costs.mjs';
import {consumeMagicProtection} from './magic-primitives.mjs';
import {unlicensedEntry} from './location-access.mjs';
import {registerOffense} from './law.mjs';
import {goodsWorth} from './valuation.mjs';
import {actorPath} from './npc-state.mjs';
import {validateMonsterSocieties,passageAllows,assertSocietyEntry,infiltrationDetected,infiltrationSucceeded,societyAt} from './monster-society.mjs';
import {traitsOf} from './traits.mjs';
import {personAge,personConstraint}from'./entity-view.mjs';
import {forestView,harvestForest,forestSites}from'./forest-water.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {reserve as reserveAccount,bag,moveStock,registerLegacyStock,accrueStock,logisticStock,BOOKED as STOCK_BOOKED} from './stock.mjs';
import {registerAdvanceHook} from './advance-hooks.mjs';
import {derived} from './derived.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('sites',{kinds:['permit']});
// S1b: 据点的有限资源是资源点账户 site:<据点>:<资源>|<物品>|reserve：首次建账按世界数据（resource.quantity）经 src:genesis 开户，
// 定期再生来自 src:regrowth，采集转入采集者行囊；机关消耗材料、续约供品进 sink:consume。
// 林木据点的木料以林木存量（forest-water）为唯一账户，据点 remaining 只是采集上限，不另记账。
declareLedgerWriter('sites',{sources:{'src:genesis':{'*':1000000},'src:regrowth':{'*':100000}},sinks:['sink:consume']});
const siteResourceAccount=(engine,place,r)=>reserveAccount(engine,`site:${place.id}:${r.id}`,r.item);
const forestBacked=(engine,place,r)=>r.item==='item_wood'&&forestSites(engine).some(s=>s.location===place.id);
registerLegacyStock('sites',(engine,state,add)=>{
    for(const row of Object.values(state.records??{}))if(row?.category==='site'){
        const place=engine.byId.get(row.site);
        for(const r of place?.site?.resources??[])if(!forestBacked(engine,place,r))add(siteResourceAccount(engine,place,r),row.remaining?.[r.id]);
    }
});
// 写回据点账的唯一入口：新开的资源按世界数据开户，再生与采集按 remaining 的变化记账（to = 采得物的去处）。
function putSite(d,engine,place,row,{to=null,eventId=null}={}){
    const old=d.get('state','records',siteKey(place.id));
    for(const r of place.site.resources??[]){
        if(forestBacked(engine,place,r))continue;
        const acct=siteResourceAccount(engine,place,r),resource=acct.split('|')[1];
        const before=old?.remaining&&Object.hasOwn(old.remaining,r.id)?old.remaining[r.id]:null,after=row.remaining[r.id]??0;
        if(before===null)moveStock(d,{from:`src:genesis|${resource}|site`,to:acct,amount:r.quantity,writer:'sites',eventId});
        const base=before??r.quantity,taken=to?.taken?.[r.id]??0,grown=after+taken-base;
        if(grown>0)moveStock(d,{from:`src:regrowth|${resource}|site`,to:acct,amount:grown,writer:'sites',eventId});
        if(taken)moveStock(d,{from:acct,to:to.account,amount:taken,writer:'sites',eventId});
        if(grown<0)throw Error('据点资源减少却没有去处');
    }
    holdingSet(d,null,['state','records',siteKey(place.id)],row,'sites');
}

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
const herbDensity=(engine,resource,season)=>resource?.gather?.density
    ?(engine.world.primitiveTables?.yields??engine.world.balance.yields).params.find(p=>p.id===resource.gather.density)?.value?.[season]
    :1;
// Calendar quarters are the rule calendar's three 30-day months. Integrate
// only at season boundaries, retaining each resource's own stock/carry anchor.
function seasonalSpans(engine,from,to){
    const spans=[];
    for(let at=from;at<to;){const end=Math.min(to,(Math.floor(at/(90*DAY))+1)*90*DAY);spans.push({from:at,to:end,season:engine.calendar(at).season});at=end;}
    return spans;
}
const siteKey=id=>`site:${id}`;
const discoveryKey=(site,clue)=>`site_discovery:${site}:${clue}`;
const observationKey=(site,mechanism)=>`site_observation:${site}:${mechanism}`;
const ownerOf=(place,row=place.site)=>Object.hasOwn(row,'owner')?row.owner:place.site.owner??place.owner??null;
const authorityOf=(place,owner)=>owner===ownerOf(place)?place.site.manager??owner:owner;
const living=(engine,source,id,actor)=>actor&&!isPhysicallyDead(engine,source,id)&&(actor.hp===undefined||actor.hp>0);
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

// edition=true (engine construction) lets a site name people this world edition
// lacks (owner, manager, occupants moved, dropped or still on the roster): the
// site is then simply unmanaged, while release validation (tools/validate-world)
// still reports them. Catalogue items, skills and history stay required.
export function validateSites(world,{edition=false}={}){
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
        const ownership=owner=>{if(!edition&&owner&&owner!=='player'&&!entities.has(owner))fail(`物权引用不存在：${owner}`);};
        ownership(ownerOf(place));
        if(!edition&&s.manager&&!world.npcs.some(row=>row.id===s.manager&&row.age>=18))fail('管理人须为登记成年NPC');
        if(s.occupants!==undefined){if(!edition)references(s.occupants,entities,'occupants');if(Array.isArray(s.occupants)&&s.occupants.some(id=>! /^(npc|boss|monster)_/.test(id)))fail('占据者须为实际人物或生物');}
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
                if(row.gather&&(!world.skills.some(s=>s.id===row.gather.skill)||row.gather.yield!=='gather:herb'||!Array.isArray(row.gather.seasons)||!row.gather.seasons.length||row.gather.seasons.some(s=>!Number.isInteger(s)||s<0||s>3)))fail(`${row.id}持续采集须有有效技能、产量表和季节`);
                if(row.gather?.density){const values=(world.primitiveTables?.yields??world.balance?.yields)?.params.find(p=>p.id===row.gather.density)?.value;
                    if(!Array.isArray(values)||values.length!==4||values.some(v=>!Number.isFinite(v)||v<0||v>1))fail(`${row.id}须引用四季密度表`);}
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
    return [...errors,...validateMonsterSocieties(world,{edition})];
}

// Catalogue items that site rows hold or use (resources, tools, materials). An
// edition rebuilt without an item batch (tools/publish-w2-s*.mjs withoutS*) keeps
// these items because later sites depend on them: removing the batch leaves no
// site row dangling, and merging it back restores the formal world exactly.
export function siteItemReferences(locations){
    const out=new Set();
    for(const place of locations){
        const s=place.site;if(!s||typeof s!=='object')continue;
        for(const key of ['mechanisms','clues','resources','truths'])for(const row of Array.isArray(s[key])?s[key]:[]){
            if(row?.item)out.add(row.item);if(row?.tool)out.add(row.tool);for(const m of row?.materials??[])if(m?.item)out.add(m.item);
        }
    }
    return out;
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

function assertOccupants(d,engine,place,authorization,breach){
    const s=place.site,ids=new Set(s.occupants??[]);
    for(const boss of engine.world.bosses??[])if(boss.residence?.location===place.id){
        const occupant=d.get('state','records',`lair:${boss.residence.id}`)?.occupant?.actor;
        if(occupant)ids.add(occupant);
    }
    for(const id of ids){
        const actor=engine.actor(d,id),isNpc=engine.actorPath(id)[1]==='npcs';
        if(!actor)throw preconditionFailure('登记占据者状态尚未落实，不能视为空置');
        if(actor.location!==place.id||!living(engine,d,id,actor))continue;
        if(isNpc&&place.access?.mode==='public')continue;
        const managed=s.manager&&ownerOf(place)&&allowed(d.document,place,ownerOf(place),authorization);
        // A creature holding its lair bars the way bodily; a person standing in
        // their place does not, and walking past them is entering unlicensed (K6).
        if(!isNpc)throw preconditionFailure('占据者仍守在这里挡住去路，须先实际解决占据关系（驱离、击败或谈妥）');
        if(!managed&&!allowed(d.document,place,id,authorization))breach('enter',id,{id:place.id,kind:'site'});
    }
}

// Time-driven changes settle from the stored anchors; nothing refreshes on revisit.
function settle(place,row,minute,engine,document){
    if(!place.site.changes?.length)return row;
    row.changes??={};
    for(const c of place.site.changes){
        const period=c.everyDays*DAY,mark=row.changes[c.id];
        if(mark===undefined){row.changes[c.id]=minute;continue;}
        if(c.kind==='regrow'){
            if(minute<=mark)continue;
            const resource=place.site.resources.find(r=>r.id===c.resource);
            for(const span of seasonalSpans(engine,mark,minute))row.remaining[c.resource]=logisticStock(row,c.id,{reserve:row.remaining[c.resource]??0,capacity:c.max,
                rate:derived(engine,document,'economy:yield',place.id,{base:c.quantity/(c.max*c.everyDays)*herbDensity(engine,resource,span.season)}),from:span.from,to:span.to});
            row.changes[c.id]=minute;
        }else{const n=Math.floor((minute-mark)/period);if(n<1)continue;row.changes[c.id]=mark+n*period;const m=row.mechanisms[c.mechanism];
            if(m?.status==='已解除'&&minute-m.minute>=period)row.mechanisms[c.mechanism]={status:'未解除',rearmed:true,minute:m.minute+period,sourceEvent:m.sourceEvent};
        }
    }
    return row;
}
function ledger(d,place,engine){
    const old=d.get('state','records',siteKey(place.id)),row=clone(old??{category:'site',site:place.id,remaining:{},mechanisms:{}});
    for(const resource of place.site.resources??[])if(!Object.hasOwn(row.remaining,resource.id))row.remaining[resource.id]=resource.quantity;
    return settle(place,row,d.get('state','minute'),engine,d.document);
}
registerAdvanceHook('advanceSiteStocks',(d,engine,minute)=>{
 for(const old of recordsWhere(d.get('state','records'),'category','site')){
  const place=engine.byId.get(old.site);if(!place?.site?.changes?.length)continue;
  const row=settle(place,clone(old),minute,engine,d.document);
  if(JSON.stringify(row)!==JSON.stringify(old))putSite(d,engine,place,row);
 }
});
const unblocked=(row,gates)=>{if(gates.some(id=>row.mechanisms[id]?.status!=='已解除'))throw preconditionFailure('机关尚未解除');};
const inside=(d,place)=>d.get('state','records','site_presence')?.site===place.id&&d.get('state','records','site_presence')?.actor==='player';
const covert=(d,place)=>inside(d,place)&&d.get('state','records','site_presence').covert===true;
// K6: the owner's licence decides whether an act is lawful, not whether it can
// happen. A missing licence is noted as a breach (act, owner) and committed as
// an offense once the act has actually taken place (commitBreaches).
function noteBreaches(){
 const pending=new Map();
 // One act on one thing is one offense; its first unlicensing holder is the victim.
 const breach=(act,owner,subject)=>{const key=`${act}:${subject?.id}`;if(owner&&owner!=='player'&&!pending.has(key))pending.set(key,{act,owner,subject});};
 breach.any=()=>pending.size>0;
 return {pending,breach};
}
function commitBreaches(d,engine,pending,result,eventId,taken=null){
 if(!pending.size||result?.duplicate)return result;
 const offenses=[...pending.values()].map(b=>{
  const stolen=b.act==='gather'&&taken?.quantity>0?taken:null;
  return registerOffense(d,engine,{act:b.act,subject:b.subject,victim:b.owner,eventId,value:stolen?goodsWorth(d,engine,{item:stolen.item,quantity:stolen.quantity,holder:b.owner})??0:0,stolen});
 });
 return {...result,offenses};
}
function entryBreach(d,engine,place,authorizations,breach){
 if(!['private','council'].includes(place.access?.mode)||!place.access.requiresConsent)return;
 const authorization=authorizations.find(id=>d.get('state','records',id)?.subject===place.id&&['site_use','enter_home','enter_council'].includes(d.get('state','records',id)?.action));
 const entry=unlicensedEntry(d,engine,place.id,{authorization,companions:d.get('state','player','companions')??[]});
 if(entry)breach('enter',entry.victim,{id:place.id,kind:'dwelling'});
}
export function assertSiteHarvest(d,engine,place,args,breach=noteBreaches().breach){
 const authorizations=[args.authorization,...args.authorizations??[]];
 assertSocietyEntry(d,engine,place);
 entryBreach(d,engine,place,authorizations,breach);
 if(!allowed(d.document,place,ownerOf(place),authorizations,'enter'))breach('enter',ownerOf(place),{id:place.id,kind:'site'});
 if(!allowed(d.document,place,ownerOf(place),authorizations,'gather'))breach('gather',ownerOf(place),{id:place.id,kind:'site'});
 assertOccupants(d,engine,place,authorizations,breach);
 // 06 §6.3 existence-and-presence: an action needs the actor at the target's node, which woodcut
 // already requires. A separate site-menu visit is not part of that rule; property, occupants and
 // every entrance mechanism still gate harvesting here and after elapsed time.
 unblocked(ledger(d,place,engine),place.site.entryMechanisms??[]);
}
function watchers(d,engine,place){
    const society=societyAt(engine,place.id)?.id,occupants=new Set(place.site.occupants??[]);
    return engine.world.npcs.filter(n=>(occupants.has(n.id)||society&&n.society===society||[place.site.manager,ownerOf(place)].includes(n.id))&&(personAge(engine,d.get('state'),n.id).value??0)>=18).map(n=>n.id).sort().filter(id=>{
        const a=d.get('state','npcs',id);return a?.location===place.id&&!isPhysicallyDead(engine,d,id)&&!['濒死','昏迷','患病'].includes(a.status)&&(a.hp===undefined||a.hp>0)&&!a.scheduleTravel&&!a.cognitionTravel&&!/睡眠|睡觉|熟睡/.test(a.activity??'');
    });
}
function infiltrate(d,engine,place,eventId){
    const plan=place.site.infiltration;
    if(!plan)throw preconditionFailure('这里没有可供隐蔽潜入的路径，只能直接进入（进别人的地方会被记为侵入）');
    if(inside(d,place))return{...siteView(engine,d.document),duplicate:true};
    if(d.get('state','player','companions')?.length)throw preconditionFailure('潜入不能带同行者');
    unblocked(ledger(d,place,engine),place.site.entryMechanisms??[]);
    engine.advance(d,plan.minutes,eventId);
    if(d.get('state','location')!==place.id||d.get('state','player','status')!=='正常')return{entered:false,note:'潜入途中失去行动能力或离开此地'};
    const watcher=watchers(d,engine,place)[0],{difficulty,...rest}=plan.check;
    const check=engine.check(d,watcher?{...rest,opponent:{npc:watcher,attribute:'精神'}}:plan.check,eventId);
    if(check.success){
        putSite(d,engine,place,ledger(d,place,engine),{eventId});
        holdingSet(d,null,['state','records','site_presence'],{category:'site_presence',site:place.id,actor:'player',covert:true,minute:d.get('state','minute'),sourceEvent:eventId},'sites');
        infiltrationSucceeded(d,engine,place,eventId);
        return{...siteView(engine,d.document),covert:true,detected:false,check,minutes:plan.minutes};
    }
    if(!watcher)return{entered:false,detected:false,check,minutes:plan.minutes,note:'未能找到潜入路径，无人察觉'};
    return{entered:false,check,minutes:plan.minutes,...caught(d,engine,place,watcher,eventId,plan.damage??0)};
}
// A society's watcher who sees an intruder responds by its stance: expulsion
// (a real walk out) or a fight. Shared by covert and open unlicensed entry.
function caught(d,engine,place,watcher,eventId,harm=0){
    const outcome=infiltrationDetected(d,engine,place,watcher,eventId);let damage=0;
    if(outcome.response==='交锋'){
        damage=consumeMagicProtection(d,'player',harm,'physical').damage;
        if(damage)engine.health(d,{delta:-damage},eventId);
    }
    let expelled=null;
    if(place.parent&&d.get('state','player','status')==='正常'){
        // Expulsion is a real walk out of the site, timed and routed like world_move.
        const action=engine.npcObligationAction;engine.npcObligationAction={tool:'move',args:{destination:place.parent}};
        try{expelled=engine.move(d,{destination:place.parent},eventId).destination;}finally{engine.npcObligationAction=action;}
    }
    return{detected:true,watcher,...outcome,damage,expelled};
}

export function siteView(engine,document){
    const place=engine.byId.get(document.state.location);if(!place?.site)return null;
    const stored=document.state.records?.[siteKey(place.id)],row=stored?settle(place,clone(stored),document.state.minute,engine,document):stored,entered=document.state.records?.site_presence?.site===place.id;
    const view={site:place.id,name:place.name,owner:ownerOf(place),entered,occupants:(place.site.occupants??[]).filter(id=>{
        const path=actorPath(engine.world,id),actor=document.state[path[1]]?.[path[2]];return actor?.location===place.id&&living(engine,document,id,actor);
    }),mechanisms:(place.site.mechanisms??[]).filter(m=>entered||(place.site.entryMechanisms??[]).includes(m.id)).map(m=>({id:m.id,name:m.name,description:m.description??'',status:row?.mechanisms[m.id]?.status??'未解除'}))};
    if(entered){
        if(place.site.history)view.history=place.site.history.map(h=>`${h.era}：${h.text}`);
        view.clues=(place.site.clues??[]).map(c=>({id:c.id,name:c.name,description:c.description??'',discovered:discovered(document,place.id,c.id)}));
        view.resources=(place.site.resources??[]).filter(r=>(r.requires??[]).every(id=>discovered(document,place.id,id))).map(r=>({id:r.id,name:r.name,item:r.item,owner:ownerOf(place,r),remaining:row?.remaining[r.id]??r.quantity}));
    }
    return view;
}

// 计时采集（resource.gather）的产量：产量表每工日的份数乘季节密度，按实际工时累计。玩家与 NPC 劳动同一折算。
function gatherRates(engine,target){
    const yields=(engine.world.primitiveTables?.yields??engine.world.balance?.yields)?.rows.find(r=>r.selector===target.gather.yield)?.perUnit?.qty;
    const day=engine.world.primitiveTables?.['action-costs']?.params.find(r=>r.id==='workday.minutes')?.value;
    if(!Number.isFinite(yields)||!Number.isFinite(day)||day<=0)throw preconditionFailure('采集产量与工日未登记');
    return {yields,day};
}
function timedYield(engine,document,place,row,target,{holder,from,minutes,channel}){
    const {yields,day}=gatherRates(engine,target);let quantity=0;
    for(const span of seasonalSpans(engine,from,from+minutes))quantity+=accrueStock(row,channel,derived(engine,document,'economy:yield',place.id,{holder,base:yields*herbDensity(engine,target,span.season)}),span.to-span.from,day);
    return quantity;
}
const inSeason=(engine,target,from,to)=>!target.gather||target.gather.seasons.includes(engine.calendar(from).season)&&target.gather.seasons.includes(engine.calendar(to).season);
// K3：据点资源向住在附近的劳动者开放的同一条规律。一趟劳动行程走得到的据点是劳动者的本地据点，
// 本地人认得它、知道门道，所以发现前提与机关只挡外来者（玩家入口不变）。物权与许可照常：
// 无主、本人或本人聚落所有的是合法采集；其余的照样发生，按 K6 记盗采（与玩家同一罪名入口）。
const lawfulFor=(place,r,holder,settlement)=>{const owner=ownerOf(place,r);return (!owner||owner===holder||owner===settlement)&&(!place.access?.requiresConsent||owner===holder);};
export function siteResources(engine,state,{holder,settlement=null}){
    const document={state},d={document,get:(...p)=>p.reduce((v,k)=>v?.[k],document)};
    return engine.world.locations.filter(p=>p.site?.resources?.length).flatMap(place=>{
        const row=ledger(d,place,engine);
        return place.site.resources.map(r=>{
            let minutesPerUnit=r.minutes;
            if(r.gather){const {yields,day}=gatherRates(engine,r),rate=yields*herbDensity(engine,r,engine.calendar(state.minute).season);minutesPerUnit=inSeason(engine,r,state.minute,state.minute)&&rate>0?Math.ceil(day/rate):null;}
            return {site:place.id,resource:r.id,item:r.item,minutesPerUnit,remaining:row.remaining[r.id]??0,lawful:lawfulFor(place,r,holder,settlement)};
        });
    });
}
// 劳动结束时结算：按在场工时折算产量（不超过存量与所求），经据点账转入 to，返回实际取得的份数。
export function siteTake(d,engine,siteId,resourceId,{minutes,quantity=Infinity,holder,settlement=null,to,eventId}){
    const place=engine.byId.get(siteId),target=place?.site?.resources?.find(r=>r.id===resourceId);
    if(!target||!Number.isSafeInteger(minutes)||minutes<1)throw preconditionFailure('没有这个据点资源或工时无效');
    const now=d.get('state','minute'),row=ledger(d,place,engine);
    let n=target.gather?(inSeason(engine,target,now-minutes,now)?timedYield(engine,d.document,place,row,target,{holder,from:now-minutes,minutes,channel:`gather:${target.id}:${holder}`}):0):Math.floor(minutes/target.minutes);
    n=Math.max(0,Math.min(n,quantity,row.remaining[target.id]??0));
    const wood=n>0&&forestBacked(engine,place,target);
    if(wood&&harvestForest(d,engine,place.id,n,now,{to,eventId})!==n)throw preconditionFailure('林木存量不足');
    row.remaining[target.id]-=n;putSite(d,engine,place,row,{eventId,to:wood||!n?null:{account:to,taken:{[target.id]:n}}});
    const owner=ownerOf(place,target);
    if(!lawfulFor(place,target,holder,settlement)&&owner)registerOffense(d,engine,{actor:holder,act:'gather',subject:{id:target.id,kind:'resource'},victim:owner,eventId,stolen:n?{item:target.item,quantity:n}:null});
    return n;
}
export function siteAction(d,args,eventId){
 const {pending,breach}=noteBreaches();
 const result=siteOperation.call(this,d,args,eventId,breach);
 return commitBreaches(d,this,pending,result,eventId,result?.item&&Number.isSafeInteger(result.quantity)?{item:result.item,quantity:result.quantity}:null);
}
function siteOperation(d,args,eventId,breach){
 initialKnowledgeAction(d,this,'site',args);
    const receiptKey=`gather-session:${eventId}`,identity=digest(args),prior=args.operation==='gather'?d.get('state','records',receiptKey):null;
    if(prior){if(prior.identity!==identity)throw preconditionFailure('同一事件编号不能更换采集参数');return {...prior.result,duplicate:true};}
    const place=this.byId.get(d.get('state','location'));
    if(!place?.site)throw preconditionFailure('所在地没有登记遗迹据点；须先沿道路抵达');
    const operation=args.operation??'inspect',s=place.site;
    if(args.authorizations!==undefined&&(!Array.isArray(args.authorizations)||args.authorizations.length>8))throw preconditionFailure('据点许可名单最多8项');
    const authorizations=[args.authorization,...args.authorizations??[]];
    if(operation==='inspect')return siteView(this,d.document);
    if(operation==='infiltrate')return infiltrate(d,this,place,eventId);
    if(!['enter','investigate','disarm','gather'].includes(operation))throw preconditionFailure('据点操作须为inspect、enter、investigate、disarm、gather或infiltrate');
    const assertAccess=()=>{
        if(operation==='investigate'&&covert(d,place))return;
        assertSocietyEntry(d,this,place);
        entryBreach(d,this,place,authorizations,breach);
        if(!(place.access?.mode==='public'&&['enter','investigate'].includes(operation))&&!allowed(d.document,place,ownerOf(place),authorizations,'enter'))breach('enter',ownerOf(place),{id:place.id,kind:'site'});
        if(operation==='disarm'&&!allowed(d.document,place,ownerOf(place),authorizations,'disarm'))breach('destroy',ownerOf(place),{id:place.id,kind:'mechanism'});
        assertOccupants(d,this,place,authorizations,breach);
    };
    const advance=minutes=>{this.advance(d,minutes,eventId);assertAccess();
        // The clock may have regenerated this opened site during the work.
        // Keep the effort just accumulated by this action, refresh physical stock.
        const fresh=ledger(d,place,this);row.remaining=fresh.remaining;
        if(fresh.changes)row.changes=fresh.changes;if(fresh.growthAnchors)row.growthAnchors=fresh.growthAnchors;
    };
    assertAccess();
    const row=ledger(d,place,this);
    if(operation==='enter'){
        unblocked(row,s.entryMechanisms??[]);
        putSite(d,this,place,row,{eventId});
        // Walking openly into a society's ground unlicensed is seen at once by
        // its watcher, who answers as it would a detected infiltration (K6).
        const watcher=breach.any()&&societyAt(this,place.id)?watchers(d,this,place)[0]:null;
        if(watcher)return{entered:true,...caught(d,this,place,watcher,eventId,s.infiltration?.damage??0)};
        holdingSet(d,null,['state','records','site_presence'],{category:'site_presence',site:place.id,actor:'player',minute:d.get('state','minute'),sourceEvent:eventId},'sites');
        return{...siteView(this,d.document),truths:siteKnowledge(this.world,d.document).filter(t=>t.site===place.id)};
    }
    const mechanism=(s.mechanisms??[]).find(m=>[m.id,m.name].includes(args.target));
    if(!inside(d,place)&&!((s.entryMechanisms??[]).includes(mechanism?.id)&&['investigate','disarm'].includes(operation)))throw preconditionFailure('须先进入据点');
    if(operation==='investigate'&&mechanism){
        const key=observationKey(place.id,mechanism.id);
        if(d.get('state','records',key))return{target:mechanism.id,duplicate:true};
        advance(mechanism.minutes);
        holdingSet(d,null,['state','records',key],{category:'site_observation',site:place.id,target:mechanism.id,actor:'player',minute:d.get('state','minute'),sourceEvent:eventId},'sites');
        const element=mechanism.element?{feature:mechanism.element.feature,states:mechanism.element.tags}:undefined;
        return{target:mechanism.id,description:mechanism.description??'',tool:mechanism.tool??null,materials:mechanism.materials??[],...(element?{element}:{})};
    }
    if(operation==='disarm'){
        if(!mechanism)throw preconditionFailure('没有这个登记机关');
        if(row.mechanisms[mechanism.id]?.status==='已解除')return{target:mechanism.id,duplicate:true};
        if(!d.get('state','records',observationKey(place.id,mechanism.id)))throw preconditionFailure('须先调查机关');
        // A burning, soaked, frozen or heated feature does the work instead of tools and a check.
        const state=mechanism.element&&traitsOf(this,d.get('state'),mechanism.element.feature)?.tags.find(t=>mechanism.element.tags.includes(t));
        if(state){
            advance(mechanism.minutes);
            row.mechanisms[mechanism.id]={status:'已解除',method:state,sourceEvent:eventId,minute:d.get('state','minute')};
            putSite(d,this,place,row,{eventId});
            return{target:mechanism.id,element:{feature:mechanism.element.feature,state},damage:0,status:'已解除'};
        }
        if(mechanism.tool){const held=heldUnit(d,this,'player',mechanism.tool);if(!held||held.durability<=0)throw preconditionFailure('缺少可用机关工具');}
        const costs=new Map();for(const cost of mechanism.materials??[])costs.set(cost.item,(costs.get(cost.item)??0)+cost.quantity);
        for(const[item,quantity]of costs)if(this.quantity(d,'player',item)<quantity)throw preconditionFailure('机关消耗材料不足');
        for(const[item,quantity]of costs)this.itemDelta(d,'player',item,-quantity,{flow:'sink:consume',purpose:'mechanism',writer:'sites',eventId});
        const check=this.check(d,{...mechanism.check,...(mechanism.tool?{tools:[mechanism.tool]}:{})},eventId);
        advance(mechanism.minutes);
        row.mechanisms[mechanism.id]={status:check.success?'已解除':'未解除',sourceEvent:eventId,minute:d.get('state','minute')};
        putSite(d,this,place,row,{eventId});
        const damage=check.success?0:consumeMagicProtection(d,'player',mechanism.failureDamage??0,'physical').damage;
        if(damage)this.health(d,{delta:-damage},eventId);
        return{target:mechanism.id,check,damage,status:row.mechanisms[mechanism.id].status};
    }
    const target=(s[operation==='gather'?'resources':'clues']??[]).find(r=>[r.id,r.name].includes(args.target));
    if(!target)throw preconditionFailure('没有这个登记调查或资源目标');
    unblocked(row,target.mechanisms??[]);
    if(operation==='gather'){
        if(!(target.requires??[]).every(id=>discovered(d.document,place.id,id)))throw preconditionFailure('尚未实际发现这个资源');
        if(!allowed(d.document,place,ownerOf(place,target),authorizations,'gather'))breach('gather',ownerOf(place,target),{id:target.id,kind:'resource'});
        const timed=Boolean(target.gather)||args.minutes!==undefined,rule=timed?actionCostRule(this,'gather.*'):null;
        let minutes=target.minutes,quantity=args.quantity??1;
        if(timed){
            if(!target.gather)throw preconditionFailure('该资源未登记持续采集工序');
            minutes=args.minutes??target.minutes;
            if(!Number.isSafeInteger(minutes)||minutes<rule.durationMin||minutes>rule.durationMax)throw preconditionFailure('采集时长须在30至480分钟之间');
            if(args.quantity!==undefined)throw preconditionFailure('持续采集产量由实际工时与资源存量决定');
            if(!target.gather.seasons.includes(this.calendar(d.get('state','minute')).season)||!target.gather.seasons.includes(this.calendar(d.get('state','minute')+minutes).season))throw preconditionFailure('当前季节没有可采的药草');
            gatherRates(this,target);
            if(row.remaining[target.id]<1)throw preconditionFailure('资源存量不足');
            quantity=timedYield(this,d.document,place,row,target,{holder:'player',from:d.get('state','minute'),minutes,channel:`gather:${target.id}`});
            quantity=Math.min(row.remaining[target.id],quantity);
            assertActionTime(d,this,minutes);
        }
        if(!Number.isSafeInteger(quantity)||quantity<(timed?0:1)||quantity>100000)throw preconditionFailure('采集数量须为正整数；计时劳动可累计不足一份的产量');
        if(row.remaining[target.id]<quantity)throw preconditionFailure('有限资源不足，不会因重访刷新');
        const span=timed?beginActionActivity(d,this,rule.activity):null;
        advance(minutes);
        if(timed&&(d.get('state','location')!==place.id||d.get('state','player','status')!=='正常'))throw preconditionFailure('采集完成前已离开或失去行动能力');
        if(!allowed(d.document,place,ownerOf(place,target),authorizations,'gather'))breach('gather',ownerOf(place,target),{id:target.id,kind:'resource'});
        const wood=target.item==='item_wood'&&forestView(this,d.get('state'),place.id);
        if(wood&&harvestForest(d,this,place.id,quantity,d.get('state','minute'),{to:bag(this,'player','item_wood'),eventId})!==quantity)throw preconditionFailure('林木存量不足');
        row.remaining[target.id]-=quantity;putSite(d,this,place,row,{eventId,to:wood?null:{account:bag(this,'player',target.item),taken:{[target.id]:quantity}}});
        this.itemDelta(d,'player',target.item,quantity,STOCK_BOOKED);
        const training=timed?learnFromWork(d,this,target.gather.skill,minutes,`gather:${place.id}:${target.id}`,eventId):null;
        const result={target:target.id,item:target.item,quantity,remaining:row.remaining[target.id],owner:'player',...(timed?{training,cost:finishActionActivity(d,this,span),actionScope:{kind:'gathering',clockManaged:true,minutes}}:{})};
        if(timed)holdingSet(d,this,['state','records',receiptKey],{category:'gather_session',identity,result},'sites',eventId);
        return result;
    }
    if(discovered(d.document,place.id,target.id))return{target:target.id,duplicate:true,text:target.text};
    const check=target.check?this.check(d,target.check,eventId):{success:true};
    advance(target.minutes);
    if(!check.success)return{target:target.id,check,discovered:false};
    const evidence={category:'site_discovery',site:place.id,clue:target.id,actor:'player',text:target.text,minute:d.get('state','minute'),sourceEvent:eventId};
    holdingSet(d,null,['state','records',discoveryKey(place.id,target.id)],evidence,'sites');
    return{target:target.id,check,discovered:true,evidence,truths:siteKnowledge(this.world,d.document).filter(t=>t.site===place.id)};
}

export function sitePermission(d,engine,args,eventId){
    const old=args.authorization?d.get('state','records',args.authorization):null,target=args.location??args.destination??old?.subject;
    const place=engine.world.locations.find(row=>row.site&&[row.id,row.name,...row.aliases??[]].includes(target));
    if(!place&&old?.action!=='site_use')return null;
    if(!place)throw preconditionFailure('许可所属据点已不存在');
    const grantor=engine.resolve(args.promisor,'npc'),base=engine.byId.get(grantor),actor=d.get('state','npcs',grantor),now=d.get('state','minute');
    const owners=[ownerOf(place),...(place.site.resources??[]).map(row=>ownerOf(place,row)),...place.site.occupants??[]];
    const owned=[...new Set(owners.filter(owner=>authorityOf(place,owner)===grantor))],owner=owned[0];
    const propertyOwners=[ownerOf(place),...(place.site.resources??[]).map(row=>ownerOf(place,row))];
    const onlyOccupant=owner&&!propertyOwners.includes(owner)&&!place.site.manager;
    if(!owner||(personAge(engine,d.get('state'),grantor).value??0)<18||personConstraint(engine,d.get('state'),grantor)||!actor||onlyOccupant&&actor.location!==place.id||actor.location!==d.get('state','location')||actor.scheduleTravel||actor.cognitionTravel||isPhysicallyDead(engine,d,grantor)||['濒死','昏迷','患病'].includes(actor.status)||/睡眠|熟睡|睡觉/.test(actor.activity??''))throw preconditionFailure('据点许可须由现场清醒成年所有者、管理人或占据者签发');
    if(args.promisee!==undefined&&engine.resolve(args.promisee)!=='player')throw preconditionFailure('据点许可只登记给玩家');
    if(place.access?.mode==='private'&&place.access.requiresConsent&&!place.access.residents?.includes(grantor))throw preconditionFailure('私宅据点许可仍须由登记住户签发');
    if(place.access?.mode==='council'&&place.access.authority!==grantor)throw preconditionFailure('议事区许可须由登记负责人签发');
    if(args.operation==='revoke_access'){
        if(old?.action!=='site_use'||old.subject!==place.id||old.grantor!==grantor)throw preconditionFailure('只有原签发者能撤销据点许可');
        const permission={...old,revoked:true,revokedAt:now};holdingSet(d,null,['state','records',args.authorization],permission,'sites');return{authorization:args.authorization,permission};
    }
    const minutes=args.minutes??60;
    if(!Number.isSafeInteger(minutes)||minutes<1||minutes>10080||typeof args.content!=='string'||!args.content.trim()||args.content.length>1200)throw preconditionFailure('据点许可须有用途及1至10080分钟期限');
    const operations={site_visit:['enter','investigate'],site_disarm:['enter','investigate','disarm'],site_gather:['enter','investigate','gather']}[args.type??'site_visit'];
    if(!operations)throw preconditionFailure('据点许可类型须为site_visit、site_disarm或site_gather');
    const authorization=`permission_${eventId}`;if(d.get('state','records',authorization))throw preconditionFailure('许可编号已经存在');
    if(args.guests!==undefined&&(!Array.isArray(args.guests)||args.guests.length>8))throw preconditionFailure('据点许可同行名单最多8人');
    const guests=(args.guests??[]).map(name=>engine.resolve(name,'npc'));
    if(new Set(guests).size!==guests.length||guests.some(id=>d.get('state','npcs',id,'location')!==actor.location||!d.get('state','player','companions')?.includes(id)))throw preconditionFailure('获准同行者须为实际在场且不重复的同行人');
    const permission={category:'authorization',action:'site_use',subject:place.id,owner,owners:owned,grantor,grantee:'player',operations,guests,expires:now+minutes,revoked:false,content:args.content.trim(),sourceEvent:eventId};
    holdingSet(d,null,['state','records',authorization],permission,'sites');return{authorization,permission};
}

// RW-04 woodcutting lives with site harvest boundaries in the ecology pack.
function usableTool(d,engine,tool){
    const held=heldUnit(d,engine,'player',tool),definition=engine.byId.get(tool);
    if(!engine.quantity(d,'player',tool)||(held?.durability??definition?.durability??0)<=0)throw preconditionFailure('需要实际完好的工具');
    if(typeof held==='number')d.set([...engine.bagPath('player'),tool],{quantity:held,quality:definition.quality,durability:definition.durability,weight:definition.weight});
}
export function woodcut(d,args,id){
 const location=d.get('state','location'),rules=this.rules.forestWater?.forest,forest=forestView(this,d.get('state'),location);
 if(!forest||!rules)throw preconditionFailure('此地没有可采林木');
 const quantity=args.quantity??1;if(!Number.isSafeInteger(quantity)||quantity<1||quantity>rules.maximumCut)throw preconditionFailure('单次采伐量越界');
 const place=this.byId.get(location);
 // A new harvesting entry passes the same property boundary as a site: cutting
 // another's wood happens and is committed as an offense (K6).
 const {pending,breach}=noteBreaches();
 const access=()=>{if(place.site)assertSiteHarvest(d,this,place,args,breach);else if(place.owner&&place.owner!=='player')breach('gather',place.owner,{id:place.id,kind:'woodland'});};
 access();
 usableTool(d,this,rules.tool);
 const check=this.check(d,{attribute:'力量',difficulty:rules.difficulty,tools:[rules.tool]},id);
 wearItem(d,this,'player',rules.tool,rules.wear);this.advance(d,rules.minutes*quantity,id);
 access();
 const taken=check.success&&d.get('state','player','status')==='正常'&&d.get('state','location')===location?harvestForest(d,this,location,quantity,d.get('state','minute'),{to:bag(this,'player','item_wood'),eventId:id}):0;
 if(taken)this.itemDelta(d,'player','item_wood',taken,STOCK_BOOKED);
 const result={success:taken>0,check,obtained:taken?[{item:'item_wood',quantity:taken}]:[],reserve:forestView(this,d.get('state'),location).reserve,
  reason:taken<quantity?'林木不足或采伐未成':null,actionScope:{kind:'woodcut',clockManaged:true,minutes:rules.minutes*quantity}};
 return commitBreaches(d,this,pending,result,id,result.obtained[0]??null);
}
