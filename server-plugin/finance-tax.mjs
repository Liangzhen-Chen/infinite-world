import {nationAt,currentDomains,containsDomain} from './noble-state.mjs';
import {placeSettlement,settlementGovernment} from './entity-view.mjs';
import {adminLevel} from './promotion-view.mjs';
import {rulerOf,regionOf} from './regions.mjs';
import {changeGroupCoins,groupAccountView} from './group-account.mjs';
import {itemTraits} from './traits.mjs';

// Dispatched orders retain the tax rate agreed at dispatch. New orders and
// spot trades read the current regime and settlement level at assessment.
export function tradeTax(e,state,location,kind='commercial'){
    const r=e.rules.economy?.credit?.taxes,sid=placeSettlement(e,state,location).value;
    if(!r||!sid)return {settlement:sid,bps:0,kind};
    const county=regionOf(e.world,location)?.county,controller=county&&state.records?.[`territory:${county.id}`]?.ruler;
    const current=controller&&e.world.factions?.find(f=>f.id===controller);
    const polity=current?.kind??rulerOf(e.world,location)?.polity??'',council=!controller&&e.world.settlementProfiles?.find(p=>p.id===sid)?.council;
    const regime=/部|帐|兽/.test(polity)?'tribal':/联|盟|议|城邦/.test(polity)||council?'council':'kingdom';
    const nation=nationAt(e,state,location),local=state.records?.[`domain-tax:${sid}`];
    const explicit=nation?.taxes?.[kind]??(local&&currentDomains(e,state,local.holder).some(d=>containsDomain(e,state,d,sid))?local.bps:null);
    const rank=adminLevel(e,state,sid)?.level??'村',basis=r.regimes[regime][kind]??0;
    return {settlement:sid,bps:explicit??basis+(r.levelBps[rank]??0),kind,regime,level:rank};
}
export function assessTradeTax(d,e,{seller,cost,location,sourceEvent,kind='commercial'}){
    const tax=tradeTax(e,d.get('state'),location,kind),amount=Math.floor(cost*tax.bps/10000);
    if(!amount||seller===tax.settlement)return {...tax,amount:0};
    const actor=e.actorPath(seller),group=groupAccountView(e,d.get('state'),seller),balance=group?.coins??d.get(...actor,'coins')??0;
    if(balance<amount)throw Error('卖方现款不足以缴纳本笔商税');
    if(!groupAccountView(e,d.get('state'),tax.settlement)){
        if(!e.world.settlementProfiles?.some(p=>p.id===tax.settlement))throw Error('聚落未登记公账，不能收取商税');
        d.set(['state','settlements',tax.settlement],{treasury:0,treasuryLedger:[],granary:false,population:0});
    }
    if(group)changeGroupCoins(d,e,seller,-amount,{kind:'商税',sourceEvent,minute:d.get('state','minute')});
    else d.set([...actor,'coins'],balance-amount);
    changeGroupCoins(d,e,tax.settlement,amount,{kind:'商税',taxKind:kind,payer:seller,bps:tax.bps,sourceEvent,minute:d.get('state','minute')});
    const key=`trade_tax:${sourceEvent}:${kind}`;d.set(['state','records',key],{category:'trade_tax',id:key,payer:seller,gross:cost,...tax,amount,sourceEvent,minute:d.get('state','minute')});
    return {...tax,amount};
}
export function collectRouteTariffs(d,e,route,eventId){
    const rules=e.rules.economy?.credit?.taxes;if(!rules)return;
    for(const edgeId of route.edges??[]){
        const edge=e.world.routes.find(r=>r.id===edgeId);if(!edge)continue;
        const from=placeSettlement(e,d.get('state'),edge.from).value,to=placeSettlement(e,d.get('state'),edge.to).value;
        if(!to||to===from)continue;
        const checkpoint=edge.toll>0||edge.guards?.length||e.rules.smuggling?.checkpoints?.some(c=>c.route===edgeId);
        if(!checkpoint)continue;
        const key=`tariff:${eventId}:${edgeId}`;if(d.get('state','records',key))continue;
        const shipments=Object.values(d.get('state','records')??{}).filter(r=>r.category==='smuggling'&&r.status==='运输中');
        let value=0;
        for(const [item,row]of Object.entries(d.get('state','inventory')??{})){
            const def=e.byId.get(item),quantity=typeof row==='number'?row:row.quantity??0;
            if(!def||!itemTraits(def).tags.some(t=>rules.cargoTags.includes(t)))continue;
            const hidden=shipments.filter(r=>r.item===item).reduce((n,r)=>n+r.quantity,0);
            value+=Math.max(0,quantity-hidden-rules.personalAllowance)*(def.basePrice??0);
        }
        const tax=assessTradeTax(d,e,{seller:'player',cost:value,location:edge.to,sourceEvent:`${eventId}:${edgeId}`,kind:'tariff'});
        d.set(['state','records',key],{category:'tariff_passage',edge:edgeId,...tax,value,minute:d.get('state','minute'),sourceEvent:eventId});
    }
}
