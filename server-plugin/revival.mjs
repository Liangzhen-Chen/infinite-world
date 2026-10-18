import {isPhysicallyDead} from './lifecycle-state.mjs';
import {purse,shrineFund,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('revival');
import {revivalPoint}from'./rule-state-migration.mjs';
import {restoreTransition} from './transition.mjs';
const validInteger=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${label}无效`);return value;};
export function prepareRevivalMark(d,location){
    const point=this.rules.death.points?.find(p=>p.location===location);
    if(!point||location!==d.get('state','location')||!d.get('state','revivalPoints',location)||d.get('state','buildings',location,'condition')===0)throw Error('祷标只能用于本人在场且已登记的完整复活祭坛');
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
    if(d.get('state','player','status')!=='正常')throw new Error('需要清醒且存活才能登记复活点');
    const location=this.resolve(args.location??d.get('state','location'));
    const point=this.rules.death.points?.find(point=>point.location===location);
    if(!point)throw new Error('此处没有登记过的神殿或祭坛');
    if(d.get('state','location')!==location)throw new Error('必须亲自到该神殿或祭坛登记');
    if(d.get('state','buildings',location,'condition')===0)throw new Error('祭坛已损毁，不能登记');
    const player=d.get('state','player'),existing=d.get('state','revivalPoints',location);
    if(existing){d.set(['state','player','revivalAnchor'],location);return{location,fee:0,alreadyRegistered:true,prayerMark:revivalPrayerMark(d,this,location)};}
    if(player.level<point.minimumLevel)throw new Error(`登记要求达到${point.minimumLevel}级`);
    const fee=validInteger(point.fee,0,100000,'登记费'),minutes=validInteger(point.minutes,1,120,'登记耗时');
    if(player.coins<fee)throw new Error('复活点登记费用不足');
    moveCoins(d,{from:purse(this,'player'),to:shrineFund(location),amount:fee,writer:'revival',eventId:id});
    d.set(['state','player','coins'],player.coins-fee);
    d.set(['state','shrineTreasuries',location],(d.get('state','shrineTreasuries',location)??0)+fee);
    this.advance(d,minutes,id);
    d.set(['state','revivalPoints',location],{location,registeredAt:d.get('state','minute'),fee,source:id});
    d.set(['state','player','revivalAnchor'],location);d.say(`已登记${this.byId.get(location).name}为复活点，支付${fee}铜`);
    return{location,fee};
}

export function revivePlayer(d,args,id){
    if(!isPhysicallyDead(this,d,'player'))throw new Error('当前没有死亡');
    const player=d.get('state','player');
    let location=player.revivalAnchor;
    if(this.rules.death.points){
        const active=revivalPoint(this.rules,location);
        const available=point=>point&&d.get('state','revivalPoints',point.location)&&d.get('state','buildings',point.location,'condition')!==0;
        const selected=available(active)?active:this.rules.death.points.find(available);
        if(!selected)throw new Error('没有仍可使用的已登记复活点');
        location=selected.location;
        d.set(['state','player','revivalAnchor'],location);
    }
    restoreTransition(d,this,{entity:'player',origin:'registered_action',action:{produces:'restored'},eventId:id,location,
        vital:{hp:Math.max(1,Math.ceil(player.maxHp*this.rules.death.reviveFraction))}});
    d.set(['state','location'],location);
    d.set(['state','player','hp'],Math.max(1,Math.ceil(player.maxHp*this.rules.death.reviveFraction)));
    d.set(['state','player','mp'],Math.ceil(player.maxMp*this.rules.death.reviveFraction));
    d.set(['state','player','status'],'正常');d.set(['state','player','dyingSince'],null);
    d.say(`在${this.byId.get(location)?.name??location}醒来`);
    return{location,prayerMark:revivalPrayerMark(d,this,location)};
}
