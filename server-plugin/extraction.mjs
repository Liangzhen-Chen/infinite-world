import {preconditionFailure} from './precondition.mjs';
import {goodsWorth} from './valuation.mjs';
import {locationTraits,creatureTraits,traitsOf} from './traits.mjs';
import {populationView,personConstraint} from './entity-view.mjs';
import {npcEntryCheck} from './checks.mjs';
import {heldUnit,wearItem,produceItems,changeItems} from './items.mjs';
import {registerIncident} from './law.mjs';
import {miningJurisdiction} from './law-codes.mjs';
import {adjustStanding} from './standing.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {reserve as reserveAccount,moveStock,registerLegacyStock,booksOpen,accrueStock,bag,BOOKED,logisticStock} from './stock.mjs';
import {derived} from './derived.mjs';
import {takePopulation,addPopulation} from './population-health.mjs';
import {recordsWhere} from './storage.mjs';
import {registerAdvanceHook,advanceHook} from './advance-hooks.mjs';
import {declareHoldingWriter,holdingSet,holdingRemove,runLifecycleProtocol,isPhysicallyDead} from './holdings.mjs';
// Caught living fish are item instances whose bag/placement is a location fact.
declareHoldingWriter('extraction',{kinds:['permit','owns'],locations:true});
// Fish are withdrawn from the same local population reserve and transferred to
// the bag; population writers mirror natural changes, not a second fishing source.
// 剖洗用水、煮食耗材进 sink:consume；
// 矿脉是资源点账户 mineral:<地点>:<矿产>|<矿产>|reserve，首次开采按世界数据（spec.reserve）经 src:genesis 开户，
// 恢复来自 src:regrowth，采得的转入开采者行囊。
declareLedgerWriter('extraction',{sources:{'src:genesis':{'*':1000000},'src:regrowth':{'*':100000},'src:birth':{item_live_fish:100000}},sinks:['sink:consume','sink:death']});
const USE=(purpose,eventId)=>({flow:'sink:consume',purpose,writer:'extraction',eventId});

const path=id=>['state','records',id];
const active=(hours,minute)=>hours[0]<=hours[1]?minute>=hours[0]&&minute<hours[1]:minute>=hours[0]||minute<hours[1];
const able=d=>d.get('state','player','status')==='正常';
const fishSpecies=new WeakMap();
const habitatIndexes=new WeakMap();
function fishIds(engine){
    let ids=fishSpecies.get(engine.world.monsters);
    if(!ids){ids=engine.world.monsters.filter(s=>s.wildlife&&creatureTraits(s).tags.includes('fish')).map(s=>s.id);fishSpecies.set(engine.world.monsters,ids);}
    return ids;
}
const fishAccount=(engine,location)=>reserveAccount(engine,location,'item_live_fish');
function fishStock(engine,state,location){
    let total=0;
    for(const h of [...engine.rules.wildlife?.habitats??[],...engine.runtimeHabitats??[]])if(h.location===location)
        for(const id of fishIds(engine))total+=state.records?.[`ecology:${h.id}`]?.populations?.[id]?.count??0;
    return total;
}
registerLegacyStock('fish-reserves',(engine,state,add)=>{
    for(const location of new Set((engine.rules.wildlife?.habitats??[]).map(h=>h.location)))add(fishAccount(engine,location),fishStock(engine,state,location));
    for(const [id,a] of Object.entries(state.creatures??{}))if(fishIds(engine).includes(a.species)&&a.ecology&&!a.returnedToPopulation&&a.hp>0&&!isPhysicallyDead(engine,{state},id))add(fishAccount(engine,id),1);
    for(const t of state.records?.['wildlife:migration']?.transit??[])if(fishIds(engine).includes(t.species))add(fishAccount(engine,`migration:${t.id}`),t.count);
});
// A real individual's death consumes one living fish before the native gone
// protocol routes property. Its corpse and food conversion keep their existing
// identity/one-time harvesting rules, rather than a second living population.
registerAdvanceHook('settleFishDeath',(d,engine,{entity,basis,eventId})=>{
    const actor=d.get('state','creatures',entity);
    if(basis==='death'&&actor?.ecology&&fishIds(engine).includes(actor.species))moveStock(d,{from:fishAccount(engine,entity),to:'sink:death|item_live_fish|individual',amount:1,writer:'extraction',eventId});
});
// All existing population writers (clock, predation, migration, individualizing)
// pass this native record boundary. Catch transfers stock before lowering count.
registerAdvanceHook('prepareStockWrite',(d,engine,path)=>{
    if(!engine||path[0]!=='state'||path[1]!=='records'||path.length>2&&!path[2].startsWith('ecology:')||!booksOpen(d,'stock'))return null;
    const catalog=engine.rules.wildlife?.habitats??[];
    let index=habitatIndexes.get(catalog);if(!index){index=new Map(catalog.map(h=>[`ecology:${h.id}`,h]));habitatIndexes.set(catalog,index);}
    const selected=path.length>2?(index.get(path[2])??engine.runtimeHabitats?.find(h=>`ecology:${h.id}`===path[2])):null;
    const habitats=(path.length===2?[...catalog,...engine.runtimeHabitats??[]]:selected?[selected]:[]).filter(h=>{
        const populations=d.peek('state','records',`ecology:${h.id}`)?.populations;
        return !populations||fishIds(engine).some(id=>Object.hasOwn(populations,id));
    });
    if(!habitats.length)return null;
    const totals=()=>habitats.map(h=>{
        const populations=d.peek('state','records',`ecology:${h.id}`)?.populations??{};
        return {location:h.location,initial:fishIds(engine).reduce((n,id)=>n+(populations[id]?.initial??0),0),
            born:fishIds(engine).reduce((n,id)=>n+(populations[id]?.born??0),0),
            dead:fishIds(engine).reduce((n,id)=>n+(populations[id]?.starved??0)+(populations[id]?.predated??0)+(populations[id]?.diseaseDeaths??0),0)};
    });
    const before=totals();
    return()=>{
        const after=totals();
        for(let i=0;i<after.length;i++){
            const account=fishAccount(engine,after[i].location),initial=after[i].initial-before[i].initial,birth=after[i].born-before[i].born,death=after[i].dead-before[i].dead;
            // Migration, withdrawal and return are explicit transfers at their callers.
            // Only genuine population establishment/birth/death may use sources/sinks.
            if(initial>0)moveStock(d,{from:'src:genesis|item_live_fish|population',to:account,amount:initial,writer:'extraction'});
            if(birth>0)moveStock(d,{from:'src:birth|item_live_fish|population',to:account,amount:birth,writer:'extraction'});
            if(death>0)moveStock(d,{from:account,to:'sink:death|item_live_fish|population',amount:death,writer:'extraction'});
        }
    };
});

function practice(d,engine,skill,target){
    if(!d.get('state','skills',skill))d.set(['state','skills',skill],{proficiency:0,grade:'初级1等',daily:{}});
    return engine.practice(d,{skill,target,gain:3});
}
function usable(d,engine,tool,actor='player'){
    const held=heldUnit(d,engine,actor,tool),definition=engine.byId.get(tool);
    if(!engine.quantity(d,actor,tool)||(held?.durability??definition?.durability??0)<=0)throw preconditionFailure('需要实际完好的工具');
    if(typeof held==='number')d.set([...engine.bagPath(actor),tool],{quantity:held,quality:definition.quality,durability:definition.durability,weight:definition.weight});
}
export function fish(d,args,id){
    const location=d.get('state','location'),habitat=this.rules.wildlife?.habitats.find(h=>h.location===location);
    const features=(this.byId.get(location)?.features??[]);
    const water=locationTraits(this.byId.get(location)).tags.some(t=>['water','aquatic','wet'].includes(t))
        ||features.some(f=>traitsOf(this,d.get('state'),f.id)?.tags.includes('water'));
    const ecology=habitat&&d.get(...path(`ecology:${habitat.id}`));
    const species=this.world.monsters.filter(s=>s.wildlife&&creatureTraits(s).tags.includes('fish')&&populationView(this,d.get('state'),habitat?.id,s.id)?.population.value);
    if(!habitat||!ecology||!water&&!species.length)throw preconditionFailure('这里没有水域鱼类栖地');
    const requested=args.species?this.resolve(args.species,'monster'):null;
    if(requested&&!species.some(s=>s.id===requested))throw preconditionFailure('该鱼种不在本地栖地');
    // Catch a living body; cleaning/cooking spends its own actual inputs.
    const tool=this.rules.extraction.fishing.tool;usable(d,this,tool);
    const bait=this.rules.extraction.fishing.bait;
    if(bait&&this.quantity(d,'player',bait.item)<bait.quantity)throw preconditionFailure('钓饵不足');
    const minutes=this.rules.extraction.fishing.minutes,season=this.calendar(d.get('state','minute')).season;
    const difficulty=this.rules.extraction.fishing.difficultyBySeason[season];
    const check=this.check(d,{attribute:'敏捷',skill:'skill_life_2_core',difficulty},id);
    wearItem(d,this,'player',tool,1);
    if(bait)this.itemDelta(d,'player',bait.item,-bait.quantity,USE('fishing_bait',id));
    this.advance(d,minutes,id);
    const now=d.get('state','minute'),latest=d.get(...path(`ecology:${habitat.id}`));
    const frozen=features.some(f=>f.kind==='water'&&traitsOf(this,d.get('state'),f.id)?.tags.includes('frozen'));
    const eligible=species.filter(s=>(!requested||s.id===requested)&&latest.populations[s.id].count>0&&active(s.wildlife.activeHours,now%1440));
    const product=this.rules.extraction.fishing.product,instances=[];
    const selected=eligible[0];let success=check.success&&!frozen&&able(d)&&d.get('state','location')===location&&Boolean(selected),quantity=0;
    if(success){
        const p=latest.populations[selected.id];
        const key=`fishing-effort:${habitat.id}:player`,effort=structuredClone(d.get(...path(key))??{category:'fishing_effort',habitat:habitat.id,actor:'player'});
        quantity=Math.min(p.count,accrueStock(effort,'fish',derived(this,d.document,'economy:yield',location,{holder:'player',base:1})));
        holdingSet(d,this,path(key),effort,'extraction',id);
        const population=structuredClone(p),health=takePopulation(population,quantity);population.withdrawn+=quantity;
        if(quantity){instances.push(...produceItems(d,this,product,quantity,{eventId:id,books:{account:fishAccount(this,location),writer:'extraction',eventId:id}}));
            const compartments=['S','I','R'].flatMap(key=>Array(health[key]).fill(key));
            for(const [index,unit] of instances.entries())holdingSet(d,null,['state','itemInstances',unit],{...d.get('state','itemInstances',unit),living:true,species:selected.id,caughtAt:habitat.id,...(compartments[index]!=='S'?{populationHealth:compartments[index]}:{})},'extraction',id);}
        // withdrawn is the existing ecological sink, also used for actual individuals.
        holdingSet(d,null,[...path(`ecology:${habitat.id}`),'populations',selected.id],population,'extraction');
        if(quantity)holdingSet(d,null,path(`fishing:${id}`),{category:'fishing',habitat:habitat.id,species:selected.id,item:product,quantity,minute:now,sourceEvent:id},'extraction');
        success=quantity>0;
    }
    const training=able(d)?practice(d,this,'skill_life_2_core',`钓鱼:${habitat.id}`):null;
    return {success,check,species:success?selected.id:null,obtained:success?[{item:product,quantity,instances}]:[],training,season,
        reason:success?null:frozen?'水面封冻':!eligible.length?'此时无可捕鱼群':'钓鱼未成',actionScope:{kind:'fishing',clockManaged:true,minutes}};
}

export function eatFish(d,args,id){
    const food=this.quantity(d,'player','item_fish')>0?'item_fish':this.rules.extraction.fishing.product;
    if(this.quantity(d,'player',food)<1||this.quantity(d,'player','item_water')<1||this.quantity(d,'player','item_charcoal')<1)throw preconditionFailure('煮食渔获需要鲜鱼、一份水和一袋自有木炭');
    const before=d.get('state','player','hp');
    for(const item of [food,'item_water','item_charcoal'])this.itemDelta(d,'player',item,-1,USE('meal',id));
    this.advance(d,20,id);if(able(d))this.health(d,{delta:2},id);
    return {eaten:1,item:food,healed:Math.max(0,d.get('state','player','hp')-before),spent:{minutes:20,water:1,charcoal:1},actionScope:{kind:'meal',clockManaged:true,minutes:20}};
}

export function mine(d,args,id){
    return mineActor.call(this,d,args,id,'player',true);
}
// Autonomous labor calls this only after measured attendance. No second clock
// advance is introduced inside a scheduler settlement.
export function mineEmployment(d,e,row,at,minutes){
    const current=d.get('state','records',row.id),n=d.get('state','npcs',row.worker);
    const receipt=`mining_work:${row.id}:${at}`,old=d.get(...path(receipt));
    if(old){if(old.minutes!==minutes)throw preconditionFailure('同次采矿工时事实不一致');return old.result;}
    const attendance=current?.attendance?.[String(Math.floor((at-540)/1440))]??0;
    if(current?.worker!==row.worker||current.owner!==row.owner||current.task!=='矿脉开采'||current.endedAt!==undefined||current.status==='罢工'||minutes>attendance||n?.location!==row.location||n.status!=='正常'||personConstraint(e,d.get('state'),row.worker)||n.scheduleTravel||n.cognitionTravel)return null;
    if(minutes<e.rules.extraction.mining.minutes)return null;
    const unit=e.rules.extraction.mining.minutes,attempts=[];
    for(let i=0;i<Math.floor(minutes/unit);i++){
        const vein=d.get(...path(`mineral:${row.location}:${row.item}`));
        const tool=heldUnit(d,e,row.worker,e.rules.extraction.mining.tool);
        if(i&&(vein?.reserve===0||(tool?.durability??0)<=0))break;
        attempts.push(mineActor.call(e,d,{item:row.item,employment:current},`${row.id}:mine:${at}:${i}`,row.worker,false));
    }
    const last=attempts.at(-1),quantity=attempts.reduce((n,r)=>n+r.obtained.reduce((v,x)=>v+x.quantity,0),0);
    const result={...last,success:quantity>0,obtained:quantity?[{item:row.item,quantity}]:[],cases:attempts.map(r=>r.case).filter(Boolean),minutesSpent:attempts.length*unit,attempts};
    holdingSet(d,e,path(receipt),{category:'mining_work',contract:row.id,minute:at,minutes,result},'extraction');return result;
}
function mineActor(d,args,id,actor,advance){
    const location=actor==='player'?d.get('state','location'):d.get('state','npcs',actor,'location'),place=d.get('state','created',location)??this.byId.get(location),rules=this.rules.extraction.mining;
    const tags=locationTraits(place).tags;
    const deposits=place.minerals??rules.locations?.[location]??rules.terrain.find(r=>tags.includes(r.tag))?.minerals;
    if(!deposits?.length)throw preconditionFailure('这里没有可开采矿脉');
    const item=args.item?this.resolve(args.item,'item'):deposits[0].item,spec=deposits.find(s=>s.item===item);
    if(!spec)throw preconditionFailure('这里没有该矿产');
    usable(d,this,rules.tool,actor);
    const key=`mineral:${location}:${item}`,now=d.get('state','minute');
    const old=d.get(...path(key))??{category:'mineral',location,item,initial:spec.reserve,reserve:spec.reserve,extracted:0,recovered:0,updatedAt:now};
    let row=projectMineral(this,d.document,old,spec,now);
    if(!row.reserve)throw preconditionFailure('矿脉已枯竭或尚未恢复');
    const owner=spec.owner??place.owner,permit=args.authorization&&d.get(...path(args.authorization));
    const job=args.employment;
    const licensed=owner===actor||job?.owner===owner&&job.worker===actor&&job.location===location&&job.endedAt===undefined&&job.deadline>now||permit?.category==='authorization'&&permit.action==='mining'&&permit.grantee===actor&&permit.grantor===owner&&permit.location===location&&!permit.revoked&&permit.expires>now;
    // Read before acting: a place whose ruling code or council custom is missing refuses the dig outright.
    const jurisdiction=owner&&!licensed?miningJurisdiction(this,d.get('state'),location):null;
    // An hour's digging is seen by whoever was there when it began as well as whoever is there at the end.
    const present=()=>Object.entries(d.get('state','npcs')).filter(([,n])=>n.location===location&&n.status==='正常'&&!/睡/.test(n.activity??'')).map(([id])=>id);
    const atStart=present();
    const check=actor==='player'?this.check(d,{attribute:rules.check.attribute,skill:rules.check.skill,difficulty:rules.difficulty,tools:[rules.tool]},id):npcEntryCheck(d,this,actor,{attribute:rules.check.attribute,skill:rules.check.skill,difficulty:rules.difficulty},id);
    wearItem(d,this,actor,rules.tool,rules.wear);if(advance)this.advance(d,rules.minutes,id);
    const success=check.success&&(actor==='player'?able(d)&&d.get('state','location')===location:d.get('state','npcs',actor,'status')==='正常'&&d.get('state','npcs',actor,'location')===location);
    const vein=reserveAccount(this,key,item);
    if(!d.get(...path(key)))moveStock(d,{from:`src:genesis|${vein.split('|')[1]}|mineral`,to:vein,amount:old.reserve,writer:'extraction',eventId:id});
    // Native clock settlement may have updated this deposit during the dig.
    const latest=d.get(...path(key))??old;row=projectMineral(this,d.document,latest,spec,d.get('state','minute'));
    moveStock(d,{from:`src:regrowth|${vein.split('|')[1]}|mineral`,to:vein,amount:row.recovered-latest.recovered,writer:'extraction',eventId:id});
    let units=[];
    if(success){row.reserve--;row.extracted++;
        const books={account:vein,writer:'extraction',eventId:id},recipient=job?.owner??actor;
        if(jurisdiction)units=produceItems(d,this,item,1,{eventId:id,recipe:null,workmanship:null,owner:recipient,maker:actor,books});
        else this.itemDelta(d,recipient,item,1,books);
    }
    holdingSet(d,null,path(key),row,'extraction');
    const witnesses=[...new Set([...atStart,...present()])].filter(w=>w!==actor);
    const value=success?goodsWorth(d,this,{item,quantity:1,location,holder:null})??0:0;
    const stolen=units.length?{item,quantity:1,unit:units[0]}:null;
    const incident=jurisdiction?.kind==='code'?registerIncident(d,this,{offender:actor,victim:owner,offense:'illegal_mining',value,stolen,witnesses,eventId:id,location,code:jurisdiction.code}):null;
    for(const unit of units){
        holdingSet(d,null,['state','itemInstances',unit,'stolenOrigin'],{event:id,case:incident,victim:owner,offender:actor,location,minute:now},'extraction');
        if(incident)holdingSet(d,null,['state','itemInstances',unit,'legalClaims'],[{case:incident,victim:owner,minute:now}],'extraction');
    }
    const local=jurisdiction?.kind==='faction'?jurisdiction:jurisdiction?.custom;
    const custom=local&&witnesses.length?adjustStanding(d,this,local.faction,actor,local.rule.standing,{sourceEvent:id,reason:'盗采'}):null;
    const judged=jurisdiction&&{kind:jurisdiction.kind,executable:jurisdiction.executable,...(jurisdiction.kind==='faction'?{faction:jurisdiction.faction,settlement:jurisdiction.settlement,standing:custom?jurisdiction.rule.standing:0,witnessed:witnesses.length>0}:{law:jurisdiction.law,polity:jurisdiction.polity,penalty:jurisdiction.penalty,
        ...(local?{custom:{faction:local.faction,standing:custom?local.rule.standing:0,witnessed:witnesses.length>0}}:{})})};
    return {success,check,obtained:success?[{item,quantity:1}]:[],reserve:row.reserve,case:incident,illegal:Boolean(owner&&!licensed),jurisdiction:judged,
        training:actor==='player'&&able(d)?practice(d,this,rules.check.skill,`开矿:${location}`):null,actionScope:{kind:'mining',clockManaged:true,minutes:rules.minutes}};
}

function mineralSpec(engine,row){
 const place=engine.byId.get(row.location),rules=engine.rules.extraction.mining,tags=locationTraits(place).tags;
 return (place?.minerals??rules.locations?.[row.location]??rules.terrain.find(r=>tags.includes(r.tag))?.minerals)?.find(s=>s.item===row.item);
}
function projectMineral(engine,document,old,spec,minute){
 const row=structuredClone(old);if(!spec.recoveryDays)return row;
 // Published recoveryAmount is the capacity-normalized intrinsic rate per
 // recoveryDays. It is not a daily reset or a guarantee of one whole ore.
 if(minute<=row.updatedAt)return row;const to=minute;
 const next=logisticStock(row,'mineral',{reserve:row.reserve,capacity:spec.reserve,
  rate:derived(engine,document,'economy:yield',row.location,{base:(spec.recoveryAmount??1)/(spec.reserve*spec.recoveryDays)}),from:row.updatedAt,to});
 row.recovered+=next-row.reserve;row.reserve=next;row.updatedAt=to;return row;
}
registerAdvanceHook('advanceMineralStocks',(d,engine,minute)=>{
 for(const old of recordsWhere(d.get('state','records'),'category','mineral')){
  const spec=mineralSpec(engine,old);if(!spec)continue;
  const row=projectMineral(engine,d.document,old,spec,minute);if(row.updatedAt===old.updatedAt)continue;
  const account=reserveAccount(engine,`mineral:${row.location}:${row.item}`,row.item);
  moveStock(d,{from:`src:regrowth|${account.split('|')[1]}|mineral`,to:account,amount:row.recovered-old.recovered,writer:'extraction'});
  holdingSet(d,null,path(`mineral:${row.location}:${row.item}`),row,'extraction');
 }
});

export function miningPermit(d,args,id){
    const location=d.get('state','location'),place=this.byId.get(location),owner=this.rules.extraction.mining.locations?.[location]?.find(m=>m.owner)?.owner??place.owner;
    if(!owner||owner!==this.resolve(args.authority,'npc')||d.get('state','npcs',owner,'location')!==location||d.get('state','npcs',owner,'status')!=='正常'||args.consent!==true)throw preconditionFailure('须由本矿区在场所有者明确同意');
    const permit=this.rules.extraction.mining.permit,minutes=args.minutes??permit.defaultMinutes;if(!Number.isSafeInteger(minutes)||minutes<1||minutes>permit.maxMinutes)throw preconditionFailure('开采许可期限无效');
    const key=`mining_permit:${id}`,permission={category:'authorization',action:'mining',location,grantee:'player',grantor:owner,expires:d.get('state','minute')+minutes,revoked:false,sourceEvent:id};
    holdingSet(d,null,path(key),permission,'extraction');return {permit:key,permission};
}


// Return the same living body; no genesis or regrowth is involved.
export function releaseFish(d,args,eventId){
 const id=args.target,unit=d.get('state','itemInstances',id),actor=d.get('state','creatures',id),location=d.get('state','location');
 const species=unit?.species??actor?.species,habitat=this.rules.wildlife.habitats.find(h=>h.location===location);
 const population=habitat&&d.get('state','records',`ecology:${habitat.id}`,'populations',species);
 if(!population||!creatureTraits(this.byId.get(species)).tags.includes('fish'))throw preconditionFailure('This habitat cannot receive that fish species');
 let from;
 if(unit){
  const product=this.rules.extraction.fishing.product;
  const until=unit.minute+this.byId.get(product).shelfLifeDays*1440;
  if(unit.item!==product||unit.owner!=='player'||unit.status!=='持有'||unit.living!==true||!Number.isFinite(until)||d.get('state','minute')>=until||!d.get(...this.bagPath('player'),product,'instances')?.includes(id))throw preconditionFailure('A real held living fish is required');
  from=bag(this,'player',product);
 }else{
  if(!actor||actor.owner||actor.mind?.awakened||actor.location!==location||actor.hp<=0||actor.status==='死亡')throw preconditionFailure('A real unowned living fish here is required');
  from=fishAccount(this,id);
 }
 const compartment=(unit??actor).populationHealth??'S';
 if(!['S','I','R'].includes(compartment))throw preconditionFailure('种群 S/I/R 个体状态无效');
 const limit=advanceHook('wildlifeCapacity')(this,d.get('state'),habitat,this.byId.get(species));
 const individuals=Object.entries(d.get('state','creatures')??{}).filter(([key,a])=>key!==id&&a.species===species&&a.location===location&&!a.owner&&a.hp>0).length;
 if(population.count+individuals>=limit)throw preconditionFailure('The fish habitat is full');
 moveStock(d,{from,to:fishAccount(this,location),amount:1,writer:'extraction',eventId});
 if(unit){changeItems(d,this,'player',unit.item,-1,{selection:[id],books:BOOKED});holdingSet(d,null,['state','itemInstances',id],{...d.get('state','itemInstances',id),status:'已放归',living:false,releasedAt:d.get('state','minute'),releasedInto:habitat.id},'extraction',eventId);}
 runLifecycleProtocol(d,this,{entity:id,kind:'gone',basis:'aggregated',origin:'aggregated',eventId:`${eventId}:aggregate`,location});
 if(!unit)holdingRemove(d,this,['state','creatures',id],'extraction',eventId);
 const returned=structuredClone(population);
 addPopulation(returned,{S:compartment==='S'?1:0,I:compartment==='I'?1:0,R:compartment==='R'?1:0});returned.immigrated=(returned.immigrated??0)+1;
 holdingSet(d,null,['state','records',`ecology:${habitat.id}`,'populations',species],returned,'extraction',eventId);
 holdingSet(d,null,['state','records',`fish-return:${id}`],{category:'fish_return',target:id,species,habitat:habitat.id,sourceEvent:eventId},'extraction',eventId);
 return {released:true,target:id,species,quantity:1,actionScope:{kind:'release',instantaneous:true}};
}
