import {locationTraits,creatureTraits,traitsOf} from './traits.mjs';
import {populationView} from './entity-view.mjs';
import {heldUnit,wearItem} from './items.mjs';
import {registerIncident} from './law.mjs';

const path=id=>['state','records',id];
const active=(hours,minute)=>hours[0]<=hours[1]?minute>=hours[0]&&minute<hours[1]:minute>=hours[0]||minute<hours[1];
const able=d=>d.get('state','player','status')==='正常';
function practice(d,engine,skill,target){
    if(!d.get('state','skills',skill))d.set(['state','skills',skill],{proficiency:0,grade:'初级1等',daily:{}});
    return engine.practice(d,{skill,target,gain:3});
}
function usable(d,engine,tool){
    const held=heldUnit(d,engine,'player',tool),definition=engine.byId.get(tool);
    if(!engine.quantity(d,'player',tool)||(held?.durability??definition?.durability??0)<=0)throw Error('需要实际完好的工具');
    if(typeof held==='number')d.set([...engine.bagPath('player'),tool],{quantity:held,quality:definition.quality,durability:definition.durability,weight:definition.weight});
}
export function fish(d,args,id){
    const location=d.get('state','location'),habitat=this.rules.wildlife?.habitats.find(h=>h.location===location);
    const features=(this.byId.get(location)?.features??[]);
    const water=locationTraits(this.byId.get(location)).tags.some(t=>['water','aquatic','wet'].includes(t))
        ||features.some(f=>traitsOf(this,d.get('state'),f.id)?.tags.includes('water'));
    const ecology=habitat&&d.get(...path(`ecology:${habitat.id}`));
    const species=this.world.monsters.filter(s=>s.wildlife&&creatureTraits(s).tags.includes('fish')&&populationView(this,d.get('state'),habitat?.id,s.id)?.population.value);
    if(!habitat||!ecology||!water&&!species.length)throw Error('这里没有水域鱼类栖地');
    const requested=args.species?this.resolve(args.species,'monster'):null;
    if(requested&&!species.some(s=>s.id===requested))throw Error('该鱼种不在本地栖地');
    // The product is the existing cleaned fish. Its knife and water cost remain real.
    const tool=this.rules.extraction.fishing.tool;usable(d,this,tool);
    if(this.quantity(d,'player','item_water')<1)throw Error('剖洗渔获需要一份水');
    const minutes=this.rules.extraction.fishing.minutes,season=this.calendar(d.get('state','minute')).season;
    const difficulty=this.rules.extraction.fishing.difficultyBySeason[season];
    const check=this.check(d,{attribute:'敏捷',skill:'skill_life_2_core',difficulty},id);
    wearItem(d,this,'player',tool,1);this.itemDelta(d,'player','item_water',-1);this.advance(d,minutes,id);
    const now=d.get('state','minute'),latest=d.get(...path(`ecology:${habitat.id}`));
    const frozen=features.some(f=>f.kind==='water'&&traitsOf(this,d.get('state'),f.id)?.tags.includes('frozen'));
    const eligible=species.filter(s=>(!requested||s.id===requested)&&latest.populations[s.id].count>0&&active(s.wildlife.activeHours,now%1440));
    const selected=eligible[0],success=check.success&&!frozen&&able(d)&&d.get('state','location')===location&&Boolean(selected);
    if(success){
        const p=latest.populations[selected.id];
        // withdrawn is the existing ecological sink, also used for actual individuals.
        d.set([...path(`ecology:${habitat.id}`),'populations',selected.id],{...p,count:p.count-1,withdrawn:p.withdrawn+1});
        this.itemDelta(d,'player','item_fish',1);
        d.set(path(`fishing:${id}`),{category:'fishing',habitat:habitat.id,species:selected.id,item:'item_fish',quantity:1,minute:now,sourceEvent:id});
    }
    const training=able(d)?practice(d,this,'skill_life_2_core',`钓鱼:${habitat.id}`):null;
    return {success,check,species:success?selected.id:null,obtained:success?[{item:'item_fish',quantity:1}]:[],training,season,
        reason:success?null:frozen?'水面封冻':!eligible.length?'此时无可捕鱼群':'钓鱼未成',actionScope:{kind:'fishing',clockManaged:true,minutes}};
}

export function eatFish(d,args,id){
    if(this.quantity(d,'player','item_fish')<1||this.quantity(d,'player','item_water')<1||this.quantity(d,'player','item_charcoal')<1)throw Error('煮食渔获需要鲜鱼、一份水和一袋自有木炭');
    const before=d.get('state','player','hp');
    for(const item of ['item_fish','item_water','item_charcoal'])this.itemDelta(d,'player',item,-1);
    this.advance(d,20,id);if(able(d))this.health(d,{delta:2},id);
    return {eaten:1,item:'item_fish',healed:Math.max(0,d.get('state','player','hp')-before),spent:{minutes:20,water:1,charcoal:1},actionScope:{kind:'meal',clockManaged:true,minutes:20}};
}

export function mine(d,args,id){
    const location=d.get('state','location'),place=this.byId.get(location),rules=this.rules.extraction.mining;
    const tags=locationTraits(place).tags;
    const deposits=place.minerals??rules.locations?.[location]??rules.terrain.find(r=>tags.includes(r.tag))?.minerals;
    if(!deposits?.length)throw Error('这里没有可开采矿脉');
    const item=args.item?this.resolve(args.item,'item'):deposits[0].item,spec=deposits.find(s=>s.item===item);
    if(!spec)throw Error('这里没有该矿产');
    usable(d,this,rules.tool);
    const key=`mineral:${location}:${item}`,now=d.get('state','minute');
    const old=d.get(...path(key))??{category:'mineral',location,item,initial:spec.reserve,reserve:spec.reserve,extracted:0,recovered:0,updatedAt:now};
    // Recovery is lazy: only elapsed full periods restore exposed fragments, up to capacity.
    const periods=spec.recoveryDays?Math.floor((now-old.updatedAt)/(spec.recoveryDays*1440)):0;
    const recovered=Math.min(spec.reserve-old.reserve,periods*(spec.recoveryAmount??1));
    const row={...old,reserve:old.reserve+recovered,recovered:old.recovered+recovered,updatedAt:periods?old.updatedAt+periods*spec.recoveryDays*1440:old.updatedAt};
    if(!row.reserve)throw Error('矿脉已枯竭或尚未恢复');
    const owner=spec.owner??place.owner,permit=args.authorization&&d.get(...path(args.authorization));
    const licensed=owner==='player'||permit?.category==='authorization'&&permit.action==='mining'&&permit.grantee==='player'&&permit.grantor===owner&&permit.location===location&&!permit.revoked&&permit.expires>now;
    const check=this.check(d,{attribute:'力量',skill:'skill_life_17_core',difficulty:rules.difficulty,tools:[rules.tool]},id);
    wearItem(d,this,'player',rules.tool,rules.wear);this.advance(d,rules.minutes,id);
    const success=check.success&&able(d)&&d.get('state','location')===location;
    if(success){row.reserve--;row.extracted++;this.itemDelta(d,'player',item,1);}
    d.set(path(key),row);
    const witnesses=Object.entries(d.get('state','npcs')).filter(([,n])=>n.location===location&&n.status==='正常'&&!/睡/.test(n.activity??'')).map(([id])=>id);
    const incident=owner&&!licensed?registerIncident(d,this,{victim:owner,offense:'illegal_mining',value:success?this.byId.get(item).basePrice:0,witnesses,eventId:id,optional:true}):null;
    return {success,check,obtained:success?[{item,quantity:1}]:[],reserve:row.reserve,case:incident,illegal:Boolean(owner&&!licensed),
        training:able(d)?practice(d,this,'skill_life_17_core',`开矿:${location}`):null,actionScope:{kind:'mining',clockManaged:true,minutes:rules.minutes}};
}

export function miningPermit(d,args,id){
    const location=d.get('state','location'),place=this.byId.get(location),owner=this.rules.extraction.mining.locations?.[location]?.find(m=>m.owner)?.owner??place.owner;
    if(!owner||owner!==this.resolve(args.authority,'npc')||d.get('state','npcs',owner,'location')!==location||d.get('state','npcs',owner,'status')!=='正常'||args.consent!==true)throw Error('须由本矿区在场所有者明确同意');
    const minutes=args.minutes??1440;if(!Number.isSafeInteger(minutes)||minutes<1||minutes>43200)throw Error('开采许可期限无效');
    const key=`mining_permit:${id}`,permission={category:'authorization',action:'mining',location,grantee:'player',grantor:owner,expires:d.get('state','minute')+minutes,revoked:false,sourceEvent:id};
    d.set(path(key),permission);return {permit:key,permission};
}
