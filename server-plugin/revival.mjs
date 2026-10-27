import {preconditionFailure} from './precondition.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {purse,shrineFund,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('revival');
import {revivalPoint}from'./rule-state-migration.mjs';
import {restoreTransition} from './transition.mjs';
const validInteger=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw preconditionFailure(`${label}无效`);return value;};
export function prepareRevivalMark(d,location){
    const point=this.rules.death.points?.find(p=>p.location===location);
    if(!point||location!==d.get('state','location')||!d.get('state','revivalPoints',location)||d.get('state','buildings',location,'condition')===0)throw preconditionFailure('祷标只能用于本人在场且已登记的完整复活祭坛');
    return{location};
}
export function revivalPrayerMark(d,engine,location){
    const mark=Object.values(d.get('state','effects')??{}).find(e=>e.kind==='ritual'&&e.operation==='revival_mark'&&e.owner==='player'&&e.revivalLocation===location&&e.expires>d.get('state','minute'));
    if(!mark||!d.get('state','revivalPoints',location)||d.get('state','buildings',location,'condition')===0)return null;
    const row=engine.world.locations.find(l=>l.id===location)?.features?.find(f=>f.id===mark.altar);
    const s=d.get('state','records',`physical_feature:${mark.altar}`)?.state??row?.state;
    return row&&s?.integrity>0&&s.deity===mark.deity?{altar:mark.altar,deity:mark.deity,church:mark.church}:null;
}
export function registerRevival(d,args,id){
    if(d.get('state','player','status')!=='正常')throw preconditionFailure('需要清醒且存活才能登记复活点');
    const location=this.resolve(args.location??d.get('state','location'));
    const point=this.rules.death.points?.find(point=>point.location===location);
    if(!point)throw preconditionFailure('此处没有登记过的神殿或祭坛');
    if(d.get('state','location')!==location)throw preconditionFailure('必须亲自到该神殿或祭坛登记');
    if(d.get('state','buildings',location,'condition')===0)throw preconditionFailure('祭坛已损毁，不能登记');
    const player=d.get('state','player'),existing=d.get('state','revivalPoints',location);
    if(existing){d.set(['state','player','revivalAnchor'],location);return{location,fee:0,alreadyRegistered:true,prayerMark:revivalPrayerMark(d,this,location)};}
    if(player.level<point.minimumLevel)throw preconditionFailure(`登记要求达到${point.minimumLevel}级`);
    const fee=validInteger(point.fee,0,100000,'登记费'),minutes=validInteger(point.minutes,1,120,'登记耗时');
    if(player.coins<fee)throw preconditionFailure('复活点登记费用不足');
    moveCoins(d,{from:purse(this,'player'),to:shrineFund(location),amount:fee,writer:'revival',eventId:id});
    d.set(['state','player','coins'],player.coins-fee);
    d.set(['state','shrineTreasuries',location],(d.get('state','shrineTreasuries',location)??0)+fee);
    this.advance(d,minutes,id);
    d.set(['state','revivalPoints',location],{location,registeredAt:d.get('state','minute'),fee,source:id});
    d.set(['state','player','revivalAnchor'],location);d.say(`已登记${this.byId.get(location).name}为复活点，支付${fee}铜`);
    return{location,fee};
}

export function revivePlayer(d,args,id){
    if(!isPhysicallyDead(this,d,'player'))throw preconditionFailure('当前没有死亡');
    const player=d.get('state','player');
    let location=player.revivalAnchor;
    let notice=null;
    if(this.rules.death.points?.length){
        const active=revivalPoint(this.rules,location),from=d.get('state','location');
        const registered=point=>point&&d.get('state','revivalPoints',point.location),standing=point=>point&&d.get('state','buildings',point.location,'condition')!==0;
        const available=point=>registered(point)&&standing(point);
        // Nearest by the engine's own route time; unreachable points sort last, ties by world order.
        const order=new Map(this.world.locations.map((l,i)=>[l.id,i])),minutes=point=>{try{return this.route(from,point.location,'walk',d.get('state','minute'),d.document.randomSeed).minutes;}catch{return Infinity;}};
        const nearest=pool=>pool.map(point=>({point,m:minutes(point)})).sort((x,y)=>x.m-y.m||(order.get(x.point.location)??Infinity)-(order.get(y.point.location)??Infinity)||(x.point.location<y.point.location?-1:1))[0]?.point;
        const name=id=>this.byId.get(id)?.name??id,points=this.rules.death.points;
        let selected=available(active)?active:null;
        if(!selected){
            const was=active&&registered(active)?`原登记的${name(active.location)}已不可用`:`没有可用的登记点`;
            if(selected=nearest(points.filter(available))){
                notice=`${was}，在最近的复活点${name(selected.location)}醒来，登记点改为此处`;
                d.set(['state','player','revivalAnchor'],selected.location);
            }else if(selected=nearest(points.filter(standing))){
                notice=`${was}，也没有任何已登记的复活点；在最近仍存的${name(selected.location)}醒来，此处尚未登记`;
            }else{
                selected=nearest(points);
                notice=`${was}，复活点的建筑都已损毁；在最近的${name(selected.location)}废墟中醒来`;
            }
        }
        location=selected.location;
    }
    restoreTransition(d,this,{entity:'player',origin:'registered_action',action:{produces:'restored'},eventId:id,location,
        vital:{hp:Math.max(1,Math.ceil(player.maxHp*this.rules.death.reviveFraction))}});
    d.set(['state','location'],location);
    d.set(['state','player','hp'],Math.max(1,Math.ceil(player.maxHp*this.rules.death.reviveFraction)));
    d.set(['state','player','mp'],Math.ceil(player.maxMp*this.rules.death.reviveFraction));
    d.set(['state','player','status'],'正常');d.set(['state','player','dyingSince'],null);
    d.say(notice??`在${this.byId.get(location)?.name??location}醒来`);
    return{location,...(notice&&{notice}),prayerMark:revivalPrayerMark(d,this,location)};
}
