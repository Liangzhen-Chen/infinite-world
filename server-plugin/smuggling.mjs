import {legalCodeAt} from './law-codes.mjs';
import {transferItems} from './items.mjs';
import {integrityOf,bribePrice,dismissed} from './bounty.mjs';
import {registerIncident,recordExposedCorruption} from './law.mjs';
import {regionalTradePrice} from './settlement-trade.mjs';
import {organization} from './organizations.mjs';

const path=id=>['state','records',id];
const cargo=state=>Object.values(state.records??{}).filter(r=>r.category==='smuggling'&&r.status==='运输中');
const awake=n=>n&&!['死亡','濒死','昏迷'].includes(n.status)&&!/睡/.test(n.activity??'');
function checkpoints(engine,route){
    return route.edges.flatMap(id=>{
        const edge=engine.world.routes.find(r=>r.id===id),registered=engine.rules.smuggling.checkpoints.filter(c=>c.route===id);
        if(registered.length)return registered.map(c=>({...c,edge:id}));
        return edge.toll>0||edge.guards?.length?[{edge:id,location:edge.to,guards:edge.guards??[],taxBps:engine.rules.smuggling.cargoTaxBps}]:[];
    });
}
export function smuggleTrade(d,args,id){
    if(args.operation==='smuggle'){
        const item=this.resolve(args.item,'item'),buyer=this.resolve(args.seller,'npc'),destination=this.resolve(args.location),quantity=args.quantity;
        if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000)throw Error('走私数量无效');
        const reserved=cargo(d.get('state')).filter(r=>r.item===item).reduce((n,r)=>n+r.quantity,0);
        if(this.quantity(d,'player',item)<quantity+reserved)throw Error('没有足量未托运的货物');
        if(!awake(d.get('state','npcs',buyer)))throw Error('没有可履约的买方');
        const mode=args.mode??'walk',route=this.route(d.get('state','location'),destination,mode,d.get('state','minute'),d.document.randomSeed);
        const checks=checkpoints(this,route),banned=this.rules.smuggling.contraband.includes(item)||this.byId.get(item).tags?.includes('contraband');
        if(!checks.length||!banned&&!checks.some(c=>c.taxBps>0))throw Error('路线没有违禁或逃税货物检查点');
        const bribe=args.coins??0;if(!Number.isSafeInteger(bribe)||bribe<0||bribe>1000000)throw Error('贿金数额无效');
        const org=args.business?organization(this,d.get('state'),this.resolve(args.business)):null;
        if(args.business&&(!org?.members.player||!org.charter.rules?.some(r=>/走私|私运/.test(r))))throw Error('须先按U1章程加入该走私组织');
        const key=`smuggling:${id}`,row={category:'smuggling',id:key,item,quantity,buyer,destination,origin:d.get('state','location'),mode,bribe,
            org:org?.id??null,originPrice:regionalTradePrice(d,this,item,d.get('state','location')),contraband:Boolean(banned),status:'运输中',checks:[],minute:d.get('state','minute'),sourceEvent:id};
        d.set(path(key),row);return {shipment:key,status:row.status,destination,note:'货物仍在行囊；沿路移动接受查验，到目的地当面deliver_smuggled结款。'};
    }
    const row=d.get(...path(args.contract));if(row?.category!=='smuggling'||row.status!=='运输中')throw Error('没有待交付的走私货物');
    if(row.destination!==d.get('state','location'))throw Error('未到约定目的地');
    const buyer=d.get('state','npcs',row.buyer);
    if(!awake(buyer)||buyer.location!==row.destination)throw Error('买方不在场或不能履约');
    if(this.quantity(d,'player',row.item)<row.quantity)throw Error('实际货物不足');
    if(!row.checks.length)throw Error('未实际经过本批货物检查点');
    const price=Math.ceil(regionalTradePrice(d,this,row.item,row.destination)*(row.contraband?this.rules.smuggling.contrabandPremium:1)),cost=price*row.quantity;
    if(buyer.coins<cost)throw Error('买方货款不足');
    transferItems(d,this,'player',row.buyer,row.item,row.quantity);
    d.set(['state','npcs',row.buyer,'coins'],buyer.coins-cost);d.set(['state','player','coins'],d.get('state','player','coins')+cost);
    d.set(path(row.id),{...row,status:'已交付',paid:cost,price,deliveredAt:d.get('state','minute'),deliveredBy:id});
    return {shipment:row.id,success:true,paid:cost,price,spread:(price-row.originPrice)*row.quantity};
}

// Called with the actual traversed route, including routes shortened by wildlife encounters.
export function inspectSmuggling(d,engine,route,eventId){
    for(const original of cargo(d.get('state'))){
        for(const cp of checkpoints(engine,route)){
            const row=d.get(...path(original.id));if(row.status!=='运输中')break;
            if(engine.quantity(d,'player',row.item)<row.quantity){d.set(path(row.id),{...row,status:'货物遗失'});break;}
            const guards=cp.guards.filter(id=>awake(d.get('state','npcs',id))&&d.get('state','npcs',id,'location')===cp.location&&!dismissed(d.get('state'),id));
            const guard=guards[0],integrity=guard?integrityOf(engine,guard):0;
            const check=guard?engine.check(d,{attribute:'敏捷',difficulty:integrity>=75?20:integrity>=45?15:10},`${eventId}_${row.id}_${cp.edge}_conceal`):null;
            let passed=!guard||check.success,bribed=false,exposed=false,incident=null,corruption=null;
            const tag=`${eventId}_${row.id}_${cp.edge}`;
            if(!passed&&row.bribe){
                const stake=Math.max(1,engine.byId.get(row.item).basePrice*row.quantity),price=bribePrice(engine,d.get('state'),guard,stake);
                bribed=row.bribe>=price&&d.get('state','player','coins')>=row.bribe;
                if(bribed){
                    d.set(['state','player','coins'],d.get('state','player','coins')-row.bribe);d.set(['state','npcs',guard,'coins'],d.get('state','npcs',guard,'coins')+row.bribe);
                    const observers=Object.entries(d.get('state','npcs')).filter(([id,n])=>id!==guard&&awake(n)&&n.location===cp.location).map(([id])=>id);
                    exposed=observers.length>0&&!engine.check(d,{attribute:'魅力',difficulty:15},`${tag}_bribe`).success;
                    d.set(path(`legal_bribe:${tag}`),{category:'legal_bribe',briber:'player',recipient:guard,coins:row.bribe,shipment:row.id,minute:d.get('state','minute'),location:cp.location,effects:exposed?[]:['放行'],discovered:exposed});
                    if(exposed){
                        incident=registerIncident(d,engine,{victim:guard,offense:'bribery',value:row.bribe,witnesses:observers,eventId:`${tag}_bribery`,location:cp.location,optional:true});
                        const law=legalCodeAt(engine,cp.location,d.get('state'));
                        if(law)corruption=recordExposedCorruption(d,engine,{target:guard,law:law.id,offer:row.bribe,witnesses:observers,eventId:`${tag}_corruption`,location:cp.location}).corruption;
                    }
                    passed=!exposed;
                }else incident=registerIncident(d,engine,{victim:guard,offense:'bribery_attempt',witnesses:[guard],eventId:`${tag}_bribery`,location:cp.location,optional:true});
            }
            let seizure=null;
            if(!passed){
                transferItems(d,engine,'player',guard,row.item,row.quantity);
                incident=registerIncident(d,engine,{victim:guard,offense:'smuggling',value:engine.byId.get(row.item).basePrice*row.quantity,witnesses:guards,eventId:tag,location:cp.location,optional:true})??incident;
                seizure={custodian:guard,item:row.item,quantity:row.quantity,case:incident};
            }
            const latest=d.get(...path(row.id));
            d.set(path(row.id),{...latest,status:passed?'运输中':'已查获',...(seizure?{seizure}:{}),checks:[...latest.checks,{edge:cp.edge,location:cp.location,guard:guard??null,check,bribed,exposed,passed,case:incident,corruption,minute:d.get('state','minute'),sourceEvent:eventId}]});
        }
    }
}
