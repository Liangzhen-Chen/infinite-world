import {transferItems}from'./items.mjs';
import {readBossCognition}from'./boss-cognition.mjs';
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const amount=v=>Number.isSafeInteger(v)&&v>0&&v<=100000;
const pacts=new Set(['respect_territory','nonaggression']);

// Stock is authored once for a new individual. Existing saves get no backfill.
export function validateBossNegotiation(boss,items){
    const t=boss.negotiation;if(t===undefined)return[];
    if(!(boss.intelligence>0))return['谈判模板只适用于智能首领'];
    if(!plain(t)||Object.keys(t).some(k=>!['stock','accepts'].includes(k))||
        !Array.isArray(t.stock)||t.stock.length>20||!Array.isArray(t.accepts)||t.accepts.length>20)return['首领谈判模板无效'];
    const known=id=>typeof id==='string'&&id.length>0&&(!items||items.has(id));
    if(t.stock.some(r=>!plain(r)||Object.keys(r).some(k=>!['item','quantity'].includes(k))||!known(r.item)||!amount(r.quantity))||
        new Set(t.stock.map(r=>r.item)).size!==t.stock.length||t.accepts.some(id=>!known(id))||new Set(t.accepts).size!==t.accepts.length)return['首领谈判物资无效或重复'];
    return[];
}
export function initialBossNegotiation(boss,engine){
    const errors=validateBossNegotiation(boss,new Set(engine.world.items.map(i=>i.id)));
    if(errors.length)throw new Error(errors.join('；'));
    const inventory={};
    for(const r of boss.negotiation?.stock??[]){
        const item=engine.byId.get(r.item);
        inventory[r.item]={quantity:r.quantity,quality:item.quality,durability:item.durability,weight:item.weight};
    }
    return{format:1,inventory,relation:null,history:[]};
}
const empty=()=>({format:1,inventory:{},relation:null,history:[]});
function validRows(rows){
    return Array.isArray(rows)&&rows.length<=20&&new Set(rows.map(r=>r?.item)).size===rows.length&&
        rows.every(r=>plain(r)&&Object.keys(r).every(k=>['item','quantity'].includes(k))&&typeof r.item==='string'&&r.item.length>0&&amount(r.quantity));
}
function validTerms(t){return plain(t)&&pacts.has(t.pact)&&typeof t.alliance==='boolean'&&validRows(t.offer)&&validRows(t.request);}
export function readBossNegotiation(actor){
    const n=actor.negotiation===undefined?empty():actor.negotiation;
    if(!plain(n)||n.format!==1||!plain(n.inventory)||!Array.isArray(n.history))throw new Error('首领谈判记录格式损坏，拒绝覆盖');
    for(const [id,held]of Object.entries(n.inventory)){
        if(!id||!plain(held)||!Number.isSafeInteger(held.quantity)||held.quantity<=0||held.instances!==undefined&&(!Array.isArray(held.instances)||
            held.instances.length>held.quantity||new Set(held.instances).size!==held.instances.length||held.instances.some(id=>typeof id!=='string'||!id)))throw new Error('首领谈判库存损坏，拒绝覆盖');
    }
    const ids=new Set();
    for(const h of n.history){
        if(!plain(h)||typeof h.event!=='string'||!h.event||ids.has(h.event)||!Number.isSafeInteger(h.minute)||h.minute<0||
            !validTerms(h.terms)||typeof h.accepted!=='boolean'||typeof h.reason!=='string'||!h.reason)throw new Error('首领谈判历史损坏，拒绝覆盖');
        ids.add(h.event);
    }
    if(n.relation!==null){
        const r=n.relation,h=n.history.find(h=>h.event===r?.event);
        if(!plain(r)||!pacts.has(r.pact)||typeof r.alliance!=='boolean'||!h?.accepted||r.pact!==h.terms.pact||r.alliance!==h.terms.alliance)throw new Error('首领关系记录损坏，拒绝覆盖');
    }
    return n;
}
export function breakBossAgreement(d,target,eventId){
    const actor=d.get('state','creatures',target);if(actor.negotiation===undefined)return;
    const n=structuredClone(readBossNegotiation(actor));if(!n.relation)return;
    n.relation=null;n.brokenBy=eventId;d.set(['state','creatures',target,'negotiation'],n);
}
function termsFor(engine,args){
    if(!pacts.has(args.pact))throw new Error('谈判须承诺respect_territory守界或nonaggression互不攻击');
    if(args.alliance!==undefined&&typeof args.alliance!=='boolean')throw new Error('结盟须为布尔值');
    const rows=value=>{
        if(value===undefined)return[];
        if(!validRows(value))throw new Error('谈判物资须为不重复的item/quantity正整数列表，至多20项');
        const result=value.map(r=>({item:engine.resolve(r.item,'item'),quantity:r.quantity})).sort((a,b)=>a.item.localeCompare(b.item));
        if(new Set(result.map(r=>r.item)).size!==result.length)throw new Error('谈判物资名称指向重复物品');
        return result;
    };
    const t={pact:args.pact,alliance:args.alliance??false,offer:rows(args.offer),request:rows(args.request)};
    if(t.offer.some(r=>t.request.some(s=>s.item===r.item)))throw new Error('同一物品不能同时作为交付与索取');
    return t;
}
function publicResult(n,h,boss){
    return{accepted:h.accepted,reason:h.reason,terms:structuredClone(h.terms),relation:structuredClone(n.relation),
        accepts:structuredClone(boss.negotiation?.accepts??[]),
        stock:Object.entries(n.inventory).map(([item,v])=>({item,quantity:v.quantity})),
        actionScope:{kind:'instant',instantaneous:true}};
}
export function negotiateBoss(d,engine,boss,residence,args,eventId){
    const target=residence.occupant?.actor,actor=d.get('state','creatures',target);
    if(residence.occupant?.kind!=='boss'||residence.occupant.definition!==boss.id||!actor||actor.boss!==boss.id||
        actor.owner||actor.hp<=0||actor.status!=='正常'||actor.location!==boss.residence.location||actor.location!==d.get('state','location'))throw new Error('谈判需要已接触、在巢穴清醒在场的自由首领');
    if(!(boss.intelligence>0))throw new Error('非智能首领不能接受谈判条款');
    if(d.get('state','player','status')!=='正常')throw new Error('你当前不能清醒谈判');
    const errors=validateBossNegotiation(boss,new Set(engine.world.items.map(i=>i.id)));
    if(errors.length)throw new Error(errors.join('；'));
    const t=termsFor(engine,args),n=structuredClone(readBossNegotiation(actor)),prior=n.history.find(h=>h.event===eventId);
    if(prior){
        if(JSON.stringify(prior.terms)!==JSON.stringify(t))throw new Error('首领谈判事件编号冲突');
        return publicResult(n,prior,boss);
    }
    if(typeof eventId!=='string'||!eventId)throw new Error('首领谈判缺少事件编号');
    const c=readBossCognition(actor),goal=boss.cognition?.goal??'defend_territory';
    const threats=c.encounters.filter(e=>e.kind==='clash'&&!['flee','defend'].includes(e.tactic));
    const territory=boss.cognition?.territory??[boss.residence.location];
    let reason;
    if(goal==='defend_territory'&&t.pact!=='respect_territory')reason='目标是守住领地，条件必须承诺尊重领地边界';
    else if(goal==='defend_territory'&&threats.some(e=>territory.includes(e.location)))reason='记得你在领地内发起交锋，拒绝交换物资或结盟';
    else if(goal==='avoid_conflict'&&t.alliance&&threats.length)reason='目标是避免冲突，曾发起进攻的来者只能议定互不攻击';
    else if(!['defend_territory','avoid_conflict'].includes(goal))throw new Error('首领认知目标无效');
    const accepts=new Set(boss.negotiation?.accepts??[]);
    const bag=Object.create(engine);
    bag.bagPath=id=>id==='player'?engine.bagPath(id):['state','creatures',target,'negotiation','inventory'];
    if(!reason&&t.offer.some(r=>!accepts.has(r.item)))reason='所交物资不在首领愿意收取的目录中';
    if(!reason&&t.request.some(r=>(n.inventory[r.item]?.quantity??0)<r.quantity))reason='首领实际库存不足，不能交付所索物资';
    if(!reason&&t.offer.some(r=>engine.quantity(d,'player',r.item)<r.quantity))reason='你没有足够的实际物资履行条件';
    const value=rows=>rows.reduce((sum,r)=>sum+engine.byId.get(r.item).basePrice*r.quantity,0);
    if(!reason&&value(t.offer)<value(t.request))reason='交付物资的目录价值不足以换取所索物资';
    const h={event:eventId,minute:d.get('state','minute'),terms:t,accepted:!reason,
        reason:reason??(goal==='defend_territory'?'接受守界条件，交换按实际库存履行':'接受避免冲突的条件，交换按实际库存履行')};
    n.history.push(h);
    if(h.accepted){n.relation={pact:t.pact,alliance:t.alliance,event:eventId};delete n.brokenBy;}
    d.set(['state','creatures',target,'negotiation'],n);
    if(h.accepted){
        for(const r of t.offer)transferItems(d,bag,'player',target,r.item,r.quantity);
        for(const r of t.request)transferItems(d,bag,target,'player',r.item,r.quantity);
    }
    d.say(`${actor.name}：${h.reason}`);
    return publicResult(readBossNegotiation(d.get('state','creatures',target)),h,boss);
}
