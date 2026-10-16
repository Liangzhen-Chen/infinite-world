import {purse,treasury as treasuryAccount,source,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {genesisBag,genesisSettlement} from './stock.mjs';
// S1b: 远方生成的聚落库存与人物行囊同样从 src:genesis 入账。
declareLedgerWriter('remote-generation',{sources:{'src:genesis':{coin_river:1000000,'*':10000000}}});
import {createHash} from 'node:crypto';
import {digest} from './storage.mjs';
import {initialNpcState} from './npc-state.mjs';
import {originSettlement} from './shop.mjs';
import {materializeWildlifeHabitats} from './wildlife-habitats.mjs';
import {planWildlifeMigration} from './wildlife-migration.mjs';
import {legalTemplate,courtFacilities,legalStaffing} from './law-codes.mjs';

// T143: far counties are generated when the player first arrives. The world
// keeps only the T142 outline (world/geo/regions.json); the skeleton of a
// county — seat, towns/villages or camps/dens/groves, districts, buildings,
// fixed people, households, roster quotas, shops and offices — is a pure
// function of the campaign seed, the outline and code templates. It is written
// once into state.remote and never back to world/. The engine then reads the
// campaign through an overlay world (base world + generated skeletons), so the
// ordinary derivations pick the new places up on their own: seeded-on-demand
// profiles (population), derived shops (shopType), reputation settlements,
// standing transmission, U13 jurisdiction, rumor seeds and the route graph.

export const REMOTE_VERSION=1;
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
function stream(seed){
    let counter=0,buffer=null,offset=32;
    return()=>{
        if(offset>=32){buffer=createHash('sha256').update(`${seed}:${counter++}`).digest();offset=0;}
        const value=buffer.readUInt32BE(offset);offset+=4;return value/2**32;
    };
}
const pick=(rng,list)=>list[Math.floor(rng()*list.length)];
const int=(rng,lo,hi)=>lo+Math.floor(rng()*(hi-lo+1));
function shuffle(rng,list){const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function apportion(total,weights){
    const keys=Object.keys(weights),sum=keys.reduce((n,k)=>n+weights[k],0),raw=keys.map(k=>({k,v:total*weights[k]/sum}));
    const out=Object.fromEntries(raw.map(r=>[r.k,Math.floor(r.v)]));let left=total-Object.values(out).reduce((n,v)=>n+v,0);
    for(const r of [...raw].sort((a,b)=>(b.v-Math.floor(b.v))-(a.v-Math.floor(a.v))||a.k.localeCompare(b.k))){if(!left)break;out[r.k]++;left--;}
    return out;
}
const round2=n=>Math.round(n*100)/100;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

// ---------------------------------------------------------------- outline access
const regionIndex=new WeakMap();
function outline(world){
    let hit=regionIndex.get(world);if(hit)return hit;
    const rows=world.regions??[],byId=new Map(rows.map(r=>[r.id,r])),locations=new Map(world.locations.map(l=>[l.id,l]));
    const profiles=new Set((world.settlementProfiles??[]).filter(p=>p.generated!=='remote').map(p=>p.id));
    const counties=rows.filter(r=>r.category==='county');
    // The home county is authored down to people; it is never generated.
    const home=new Set(counties.filter(c=>(c.places??[]).some(id=>profiles.has(id))).map(c=>c.id));
    const nodes=new Map();
    for(const l of world.locations)if(l.generated!=='remote'&&typeof l.region==='string'&&byId.get(l.region)?.category==='county')(nodes.get(l.region)??nodes.set(l.region,[]).get(l.region)).push(l.id);
    for(const c of counties){
        const list=nodes.get(c.id)??[];
        for(const id of [c.seat?.location,...c.places??[]])if(id&&id.startsWith('loc_')&&locations.has(id)&&!list.includes(id))list.push(id);
        nodes.set(c.id,list);
    }
    hit={byId,counties,home,nodes,locations};regionIndex.set(world,hit);return hit;
}
export const remoteShort=countyId=>countyId.replace(/^county_/,'');
// The county a location opens: its own `region`, or a county seat/place it is.
export function remoteCountyOf(world,location){
    const o=outline(world),place=o.locations.get(location);if(!place)return null;
    let county=typeof place.region==='string'&&o.byId.get(place.region)?.category==='county'?place.region:null;
    county??=o.counties.find(c=>(o.nodes.get(c.id)??[]).includes(location))?.id??null;
    return county&&!o.home.has(county)?county:null;
}
function seatOf(world,county){
    const o=outline(world),own=county.seat?.location;
    if(own&&o.locations.has(own)&&o.locations.get(own).generated!=='remote')return {id:own,name:o.locations.get(own).name,existing:true,coordinates:o.locations.get(own).coordinates};
    return {id:`loc_rg_${remoteShort(county.id)}`,name:county.seat.name,existing:false,coordinates:[...county.center]};
}
export function countyKind(county){
    const cultures=county.keyPeople.map(k=>k.culture);
    if(cultures.includes('culture_far_orc'))return 'orc';
    if(cultures.includes('culture_far_lignum'))return 'lignum';
    if(cultures.includes('culture_beast'))return county.control==='shared'?'shared':'beast';
    return 'human';
}
const NONHUMAN=new Set(['orc','lignum','beast','shared']);
const mainCulture=county=>{const n={};for(const k of county.keyPeople)n[k.culture]=(n[k.culture]??0)+1;return Object.entries(n).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0];};

// Chinese outline numbers: 约六万人, 约两千兽人, 约一千二百名, 二十万…
const DIGIT={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
export function outlineNumber(text){
    const m=String(text??'').match(/[\d零一二两三四五六七八九十百千万]+/);if(!m)return 0;
    if(/^\d+$/.test(m[0]))return Number(m[0]);
    let total=0,section=0,digit=0;
    for(const ch of m[0]){
        if(ch in DIGIT){digit=DIGIT[ch];continue;}
        const unit={十:10,百:100,千:1000}[ch];
        if(unit){section+=(digit||1)*unit;digit=0;continue;}
        if(ch==='万'){total+=(section+digit)*10000;section=0;digit=0;}
    }
    return total+section+digit;
}

// ---------------------------------------------------------------- vocabularies
// Occupations from the outline's industry words; generic town trades fill in.
const TRADES=[[/铜矿|铁矿|矿/,['矿工']],[/冶|炉/,['炉工']],[/铜器/,['铜匠']],[/矿具|炉具|铁/,['铁匠']],[/燕麦|豌豆|粮|麦|豆/,['农户']],[/麻|织|布|染/,['织工']],
    [/河运|渡|船|运/,['船工']],[/陶|窑/,['陶工']],[/木作|细木|镶木/,['木匠']],[/鱼|渔/,['渔户']],[/盐/,['盐工']],[/羊|毛|毡/,['牧户']],[/马/,['马夫']],[/港/,['码头工']],
    [/帆/,['补帆工']],[/木材|伐/,['伐木工']],[/菌/,['菌农']],[/药草|药/,['采药人']],[/纸/,['造纸匠']],[/官署|官仓/,['书吏']],[/市集|集|桥市/,['小贩']],[/钱庄/,['账房']],
    [/漆/,['漆匠']],[/驿/,['驿夫']],[/冰/,['冰工']],[/毛皮|皮毛/,['皮匠']],[/灯油/,['灯油匠']],[/救船/,['救船手']],[/咸鱼|腌/,['腌鱼工']],[/石料|采石/,['石匠']],[/颜料|赭石/,['颜料匠']],
    [/奶/,['奶农']],[/诊畜/,['兽医']],[/符箓|验阵/,['抄符人']],[/芦/,['芦编匠']],[/堤/,['堤工']],[/松脂|树脂/,['割脂工']],[/苔/,['采苔人']],[/育苗|种子/,['育苗者']],
    [/嗅迹/,['嗅迹记录者']],[/猎/,['猎手']],[/熏肉/,['熏肉匠']],[/鞣/,['鞣皮匠']],[/驮/,['驮手']],[/炭/,['烧炭工']],[/闸|水磨|磨坊/,['磨坊工']],[/道路|桥梁/,['修路工']],
    [/海草/,['海草农']],[/果园/,['果农']],[/放牧|牧/,['牧人']],[/林冠|通道/,['绳桥匠']],[/轮作/,['菌农']],[/向导/,['向导']]];
function industryTrades(county){
    const out=[];
    for(const phrase of county.industry??[])for(const [re,jobs]of TRADES)if(re.test(phrase))for(const j of jobs)if(!out.includes(j))out.push(j);
    return out.length?out:['农户'];
}
const SPECIES={orc:'monster_split_tusk_orc',goblin:'monster_ash_cave_goblin',troll:'monster_moss_back_troll',lignum:'monster_knot_elm_sprite'};
// Species of an outline name in a nonhuman county, following its culture's naming rule.
function speciesOfName(culture,name){
    if(culture==='culture_far_orc')return name.startsWith('锉')?SPECIES.goblin:name.startsWith('磐')?SPECIES.troll:SPECIES.orc;
    if(culture==='culture_far_lignum')return SPECIES.lignum;
    return null;
}
// Generated names never repeat across counties: each county draws only the
// candidates whose hash falls to it among the counties sharing that pool.
function mine(world,countyId,peers=null){
    const list=(peers??outline(world).counties.filter(c=>!outline(world).home.has(c.id)).map(c=>c.id)).slice().sort(),index=list.indexOf(countyId);
    return value=>index<0||parseInt(hash(String(value)).slice(0,8),16)%list.length===index;
}
const NAME_ROOTS=[...'石松溪岩苇北南东西高深长红白青黑新旧远冷暖柳杉枫桦槐榆竹梅荷云雾霜雪泉川湖月星风'];
const PLACE_PARTS=['坡','岭','谷','沟','川','坪','湾','滩','塘','林','原','口','冈','坳','台'];
const TOWN_SUFFIX=['镇','集','堡'],VILLAGE_SUFFIX=['村','庄','屯','寨'];
// Naming stock per culture: given syllables from the outline's own people and
// the culture rule, clans from their family/tribe/group names.
function namingStock(world,culture,extraPeople=[]){
    const people=[...world.npcs??[],...world.residents??[],...world.factionPeople??[],...extraPeople].filter(p=>p.culture===culture&&typeof p.name==='string'&&p.generated!=='remote');
    for(const r of world.regions??[])for(const k of r.keyPeople??[])if(k.culture===culture)people.push(k);
    const rule=world.cultures?.find(c=>c.id===culture)?.naming?.structure??'';
    const given=new Set(),clans=new Set(),leads=new Set();
    for(const p of people){
        const [g,clan]=p.name.split('·');
        if(clan){clans.add(clan);for(const c of g)given.add(c);leads.add(g[0]);}
        else if([...p.name].length>=2){clans.add(p.name[0]);for(const c of [...p.name].slice(1))given.add(c);}
    }
    // Listed syllables in the culture rule, e.g. “常用铎、绰、赫、汀音”.
    for(const m of rule.matchAll(/[一-鿿]{1,2}(?:、[一-鿿]{1,2})+/g))m[0].split('、').forEach((part,i)=>{for(const c of i?part:part.slice(-1))given.add(c);});
    const dot=people.some(p=>p.name.includes('·'));
    return {dot,given:[...given].sort(),clans:[...clans].sort(),leads:[...leads].sort()};
}
function clanStock(rng,stock,count){
    const tails={};for(const c of stock.clans){const t=c.at(-1);tails[t]=(tails[t]??0)+1;}
    const tail=Object.entries(tails).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];
    const out=new Set(stock.clans);
    if(tail&&tail[1]*2>=stock.clans.length)for(let i=0;out.size<stock.clans.length+count&&i<200;i++)out.add(pick(rng,NAME_ROOTS.filter(c=>c!==tail[0]))+tail[0]);
    else for(let i=0;out.size<stock.clans.length+count&&i<200;i++)out.add(pick(rng,NAME_ROOTS)+pick(rng,PLACE_PARTS));
    return [...out].sort();
}
const ORC_TRIBE_ROOTS=['赤石','断角','裂谷','灰岭','红沙','铁脊','火口','黑岩','白骨','风牙','碎岩','焦土'];
const LIGNUM_TREES=['杉','柏','桦','榆'],LIGNUM_SKY=['霜','雷','露','晴','雾','霁'];
const SLOPES=['北坡','阴坡','溪坡','崖坡','老坡','雾坡','石坡','松坡'];
const BEAST_GROUP_ROOTS=['深泉','苇坡','黑石','斜溪','远嗅','红土','冷泉','碎石','松根','灰岩'];

// Naming spec for the population template and fixed people (population.mjs reads `naming`).
function naming(world,kind,county,rng){
    const out={},clans={};
    const add=(culture,species,spec,list)=>{out[`${culture}:${species??''}`]=spec;clans[`${culture}:${species??''}`]=list;};
    const peers=outline(world).counties.filter(c=>countyKind(c)===kind||kind==='shared'&&countyKind(c)==='beast'||kind==='beast'&&countyKind(c)==='shared').map(c=>c.id),own=mine(world,county.id,peers);
    const outlineNames=new Set(outline(world).counties.filter(c=>c.id!==county.id).flatMap(c=>c.keyPeople.map(k=>k.name.split('·')[1]).filter(Boolean)));
    if(kind==='orc'){
        const tribes=[...new Set([...county.keyPeople.map(k=>k.name.split('·')[1]).filter(Boolean),...shuffle(rng,ORC_TRIBE_ROOTS.filter(r=>own(r)&&!outlineNames.has(`${r}部`))).slice(0,3).map(r=>`${r}部`)])].sort();
        const stock=namingStock(world,'culture_far_orc');
        add('culture_far_orc',SPECIES.orc,{style:'clan',leads:['兀','喀','骨','虎','嘎'],given:[...new Set([...stock.given,...'烈坦芒桑璃岩猛戈锋牙'])].sort()},tribes);
        add('culture_far_orc',SPECIES.goblin,{style:'lead',given:[...'炭钉钳灰粟针芒屑砧锤铆片']},['锉']);
        add('culture_far_orc',SPECIES.troll,{style:'lead',given:[...'峦负垒岩苔墩石丘']},['磐']);
        return {naming:out,clans};
    }
    if(kind==='lignum'){add('culture_far_lignum',SPECIES.lignum,{style:'pair',first:LIGNUM_TREES,second:LIGNUM_SKY},shuffle(rng,SLOPES.filter(own)).slice(0,4).sort());return {naming:out,clans};}
    for(const culture of new Set(county.keyPeople.map(k=>k.culture))){
        const stock=namingStock(world,culture);
        if(culture==='culture_beast'){
            const groups=[...new Set([...county.keyPeople.filter(k=>k.culture===culture).map(k=>k.name.split('·')[1]).filter(Boolean),...shuffle(rng,BEAST_GROUP_ROOTS.filter(r=>own(r)&&!outlineNames.has(`${r}群`))).slice(0,3).map(r=>`${r}群`)])].sort();
            add(culture,null,{style:'clan',given:[...new Set([...stock.given,...'克砾图洵'])].sort()},groups);continue;
        }
        if(stock.dot)add(culture,null,{style:'clan',given:stock.given.length>=6?stock.given:[...new Set([...stock.given,...'安宁远和清'])].sort()},clanStock(rng,stock,6));
        else add(culture,null,{style:'surname'},stock.clans.length>=3?stock.clans:[...new Set([...stock.clans,...'禾陶岑苇澄'])].sort());
    }
    return {naming:out,clans};
}
const GIVEN_STOCK=[...'安柏辰川春丹德东栋芳峰福根桂海禾和恒红华怀慧佳嘉建江洁锦静菊坤兰岚立良林玲柳梅敏明宁平萍琴青秋荣瑞山善生胜石书顺松桃田婷文霞香祥晓欣秀萱雪岩燕阳仪瑜玉远云哲贞志竹'];
// One name by a naming spec; `clan` is the household's clan/surname/slope.
export function composeName(rng,spec,clan,attempt){
    if(!spec||spec.style==='surname'){const a=pick(rng,GIVEN_STOCK),b=pick(rng,GIVEN_STOCK);return clan+a+(attempt<4||a===b?'':b);}
    if(spec.style==='lead')return clan+pick(rng,spec.given)+(attempt<8?'':pick(rng,spec.given));
    if(spec.style==='pair'){const n=pick(rng,spec.first)+pick(rng,spec.second);return attempt<3?n:`${n}·${clan}`;}
    const first=spec.leads?pick(rng,spec.leads):pick(rng,spec.given);let second=pick(rng,spec.given);
    if(second===first)second=pick(rng,spec.given);
    return `${first}${second}·${clan}`;
}

// ---------------------------------------------------------------- settlement plans
const AGE_SHARE={children:0.24,youngAdults:0.28,adults:0.34,elders:0.14};
function ageSplit(n){return apportion(n,AGE_SHARE);}
const sumAges=list=>list.reduce((o,a)=>{for(const k of Object.keys(AGE_SHARE))o[k]+=a[k];return o;},{children:0,youngAdults:0,adults:0,elders:0});
const BIOME_WORDS={earth:'原野',wet:'湿地',frost:'冰雪',stone:'岩石',salt:'盐滩',forest:'林地',plant:'林地',dry:'旱地',grass:'草地',sand:'沙地'};
const KIND_TEXT={orc:{seat:'大营',sub:'营地',den:'窟',district:'营',council:'大帐',market:'换货棚',forge:'炉场',office:'部首'},
    beast:{seat:'穴',sub:'穴',district:'坡屋',council:'共席石台',market:'熏肉棚',forge:'鞣皮坊',office:'群首'},
    lignum:{seat:'老林',sub:'坡',district:'扎根坡',council:'老杉议处',market:'换物台',office:'坡长老'}};
function levelOf(kind,role,name){
    if(role==='seat')return NONHUMAN.has(kind)?'镇':/城|都|港$/.test(name)?'城':'镇';
    return role==='town'?'镇':'村';
}
function officeName(kind,role,level,seatName){
    if(kind==='orc')return role==='seat'?'营头':'部首';
    if(kind==='beast'||kind==='shared')return role==='seat'?'穴首':'群首';
    if(kind==='lignum')return '坡长老';
    return level==='城'?'城守':level==='镇'?'镇长':'村长';
}

// ---------------------------------------------------------------- county skeleton
function biomeWords(county){return [...new Set((county.biomes??[]).map(b=>BIOME_WORDS[b]).filter(Boolean))];}
function hierarchy(world,county,leaf){
    const province=outline(world).byId.get(county.province);
    return [{id:'known-continent',name:'已知大陆片区'},{id:province.id,name:province.name},{id:county.id,name:county.name},...leaf?[{id:leaf.id,name:leaf.name}]:[]];
}
// Seat record of a county without an authored place: a pure function of the
// outline, so a neighbour's road can name it before the county is generated.
export function seatLocation(world,countyId){
    const county=outline(world).byId.get(countyId),seat=seatOf(world,county);if(seat.existing)return null;
    const kind=countyKind(county);
    return {id:seat.id,name:seat.name,aliases:[],parent:null,scope:seat.id,coordinates:seat.coordinates,terrain:county.terrain,openHours:[0,1440],region:county.id,generated:'remote',
        mapHierarchy:hierarchy(world,county,{id:seat.id,name:seat.name}),purpose:NONHUMAN.has(kind)?`${county.ruler.polity}的${KIND_TEXT[kind==='shared'?'beast':kind].seat}`:'郡治',
        description:`${seat.name}是${county.name}的治所，${county.ruler.title}在此。${county.prose?.overview?.split('。')[0]??''}。`};
}
const roadSpeed=terrain=>/山|岩|崖|雪|冰/.test(terrain)?0.6:/林|沼|泥|湿/.test(terrain)?0.7:1;
// Road between two neighbouring counties' seats, when either has no authored place.
export function linkRoute(world,a,b){
    const o=outline(world),[x,y]=[a,b].sort(),A=o.byId.get(x),B=o.byId.get(y);
    if(!A||!B||o.home.has(x)||o.home.has(y))return null;
    if((o.nodes.get(x)??[]).length&&(o.nodes.get(y)??[]).length)return null;
    const sa=seatOf(world,A),sb=seatOf(world,B),frost=[...A.biomes??[],...B.biomes??[]].includes('frost');
    const human=countyKind(A)==='human'&&countyKind(B)==='human'&&roadSpeed(A.terrain)===1&&roadSpeed(B.terrain)===1;
    return {id:`route_rg_link_${remoteShort(x)}__${remoteShort(y)}`,from:sa.id,to:sb.id,lengthKm:round2(distance(sa.coordinates,sb.coordinates)*1.25),
        terrainMultiplier:Math.min(roadSpeed(A.terrain),roadSpeed(B.terrain)),modes:human?['walk','horse','cart']:['walk','horse'],closedSeasons:frost?[3]:[],toll:0,risk:countyKind(A)===countyKind(B)?1:2,generated:'remote'};
}
// Neighbours by either county's ties, so both ends name the same road.
const tiedCounties=(world,county)=>[...new Set([...(county.ties??[]).map(t=>t.with),...outline(world).counties.filter(c=>(c.ties??[]).some(t=>t.with===county.id)).map(c=>c.id)])]
    .filter(id=>id!==county.id&&outline(world).byId.get(id)?.category==='county').sort();

const SHOP_POOLS={
    tavern:['item_bread','item_ration','item_oat_flatbread','item_salt_fish','item_dried_fruit','item_fruit_porridge','item_hard_cheese','item_barley_pea_stew','item_milk'],
    smithy:['item_iron_nail','item_kitchen_knife','item_whittling_knife','item_smith_hammer','item_mining_pick','item_iron_scrap','item_s_hook','item_iron_awl','item_tent_stake','item_hinge_pin','item_cooking_pot'],
    merchant:['item_salt','item_bag','item_clothes','item_linen_cloth','item_flax_cord','item_wool_yarn','item_wax_candle','item_herb','item_clay_pot','item_tanned_leather','item_charcoal','item_resin','item_ration']};
const SHOP_NAMES={tavern:'客栈',smithy:'铁铺',merchant:'货栈'};
// Restock rows arrive by road from the settlement that makes the goods (K10 route source).
function shopRows(world,rng,type,settlement){
    const items=new Map(world.items.map(i=>[i.id,i])),open=world.rules.equipment.qualities.indexOf(world.rules.economy?.shops?.quality?.open??'铁');
    // Only goods whose maker cannot itself become a generated settlement, so the source stays fixed.
    const far=new Set([...outline(world).nodes].filter(([c])=>!outline(world).home.has(c)).flatMap(([,ids])=>ids)),byId=outline(world).locations;
    const stable=id=>{const seen=new Set();for(let at=items.get(id)?.origin;at&&!seen.has(at);at=byId.get(at)?.parent){if(far.has(at))return false;seen.add(at);}return true;};
    const pool=SHOP_POOLS[type].filter(id=>{const it=items.get(id);if(!it||world.rules.equipment.qualities.indexOf(it.quality)>open||!stable(id))return false;const from=originSettlement(world,id);return from&&from!==settlement;});
    return shuffle(rng,pool).slice(0,Math.min(pool.length,int(rng,3,5))).sort().map(item=>{const amount=int(rng,2,6);return{item,source:'route',from:originSettlement(world,item),amount,maximum:amount*2};});
}
function shopSchedule(place,type){
    const close=type==='tavern'?1320:1140;
    const slot=(start,end,activity,services)=>({start,end,location:place,activity,services});
    const day=[slot(0,420,'睡眠',[]),slot(420,close,type==='tavern'?'前厅接待':'照看铺面',['trade']),slot(close,1440,'收铺、睡眠',[])];
    return {default:day,market:day,rest:day};
}

function officeSchedule(place){
    const slot=(start,end,activity)=>({start,end,location:place,activity,services:[]});
    const day=[slot(0,420,'睡眠'),slot(420,1080,'处理公事'),slot(1080,1440,'歇息')];
    return {default:day,market:day,rest:day};
}
function hostSchedule(place){
    const slot=(start,end,activity)=>({start,end,location:place,activity,services:[]});
    const day=[slot(0,300,'睡眠'),slot(300,1440,'料理家事')];
    return {default:day,market:day,rest:day};
}

// D1 default hazard clocks, notice board and public ledger of every generated
// settlement, read from the county outline (terrain, climate, biomes, industry);
// a pure function of the skeleton, no draws. Conditions are seeded chance,
// stores and other clocks only, since generated places have no weather region.
// Wet land floods (spring and summer where the outline speaks of rain) and
// then gets water-borne disease; cold or dry land gets winter cough; farming
// counties keep more grain and see milder price swings than mining, salt,
// port or market ones, which live on bought grain.
const GRAIN=['item_oats','item_ration','item_oat_flour','item_oat_flatbread','item_pearl_barley','item_rye_flour','item_wheat_grain'];
export function remoteHazardProfile(county){
    const text=`${county.terrain}${county.climate}`,biomes=county.biomes??[];
    const wet=biomes.includes('wet')||/河|湿|沼|滩|港|湾|岸|泥/.test(county.terrain);
    const cold=biomes.includes('frost')||/冰|雪|寒|冬长/.test(text);
    const rainy=/多雨|湿季|雨/.test(county.climate??'');
    const farm=(county.industry??[]).some(t=>/燕麦|豌豆|粮|麦|豆|果园|奶|放牧|羊|牧|海草|轮作/.test(t));
    return {wet,cold,rainy,farm,storeDays:farm?150:80};
}
function remoteHazards(county,seat,settlements,routes,profiles){
    const h=remoteHazardProfile(county),DAY=1440,hazards=[],ledgers={};
    for(const s of settlements){
        const sid=s.id,P=profiles.find(p=>p.id===sid).population;
        const link=routes.find(r=>r.from===seat.id&&r.to===sid)??routes.find(r=>r.from===sid&&r.to===s.districts[0]);
        const low=s.districts.slice(0,1),soaked=[...s.districts];
        if(h.wet)hazards.push({id:`flood:${sid}`,kind:'flood',name:'汛期',settlement:sid,seasons:h.rainy?[0,1]:[1],intervalDays:5,stages:[
            {id:'rise',name:'水位上涨',probability:h.rainy?0.35:0.25,condition:{kind:'always'},effects:[{kind:'flood',locations:low,minutes:DAY}]},
            {id:'crest',name:'洪峰过境',probability:h.rainy?0.3:0.2,condition:{kind:'always'},effects:[{kind:'route_closure',routes:[link.id],minutes:3*DAY,reason:'洪水漫过道路'},
                {kind:'flood',locations:soaked,minutes:3*DAY},{kind:'crop_damage',settlement:sid,percent:h.farm?25:15,minutes:30*DAY}]},
            {id:'recede',name:'退水',probability:0.6,condition:{kind:'always'},effects:[{kind:'environment',state:'dry',locations:soaked}]}]});
        const water=h.wet&&!h.cold,disease=water?'disease_river_flux':'disease_cold_cough';
        hazards.push({id:`epidemic:${sid}`,kind:'epidemic',name:'疫病流行',settlement:sid,seasons:water?[1,2]:[3],intervalDays:4,disease,spread:{routes:[link.id]},stages:[
            {id:'cases',name:'零星病例',probability:water?0.2:0.06,condition:water?{kind:'hazard_phase',clock:`flood:${sid}`,minimum:2}:{kind:'always'},effects:[{kind:'epidemic',disease,settlement:sid,cases:1}]},
            {id:'spread',name:'疫病流行',probability:1,condition:{kind:'epidemic_cases',minimum:3},effects:[{kind:'price_shift',settlement:sid,items:['item_herb'],factor:1.4,minutes:30*DAY,reason:'疫病流行，药草紧缺'}]},
            {id:'wane',name:'疫退',probability:1,condition:{kind:'epidemic_clear'},effects:[{kind:'price_shift',settlement:sid,items:['item_herb'],factor:1,minutes:1,reason:'疫退，药价回落'}]}]});
        hazards.push({id:`famine:${sid}`,kind:'famine',name:'冬荒',settlement:sid,seasons:[3],intervalDays:7,stages:[
            {id:'tight',name:'存粮告紧',probability:1,condition:{kind:'granary_short',days:90},effects:[{kind:'price_shift',settlement:sid,items:GRAIN,factor:1.2,minutes:120*DAY,reason:'冬季存粮告紧'}]},
            {id:'famine',name:'冬荒',probability:1,condition:{kind:'granary_short',days:45},effects:[{kind:'price_shift',settlement:sid,items:GRAIN,factor:1.6,minutes:120*DAY,reason:'冬荒缺粮'},{kind:'famine',settlement:sid,minutes:120*DAY}]}]});
        const [up,high]=h.farm?[1.1,1.2]:[1.2,1.4];
        hazards.push({id:`price:${sid}`,kind:'price',name:'青黄不接粮价波动',settlement:sid,seasons:[1],intervalDays:10,stages:[
            {id:'rise',name:'粮价看涨',probability:0.35,condition:{kind:'always'},effects:[{kind:'price_shift',settlement:sid,items:GRAIN,factor:up,minutes:60*DAY,reason:'青黄不接，陈粮见少'}]},
            {id:'peak',name:'粮价高企',probability:0.25,condition:{kind:'always'},effects:[{kind:'price_shift',settlement:sid,items:GRAIN,factor:high,minutes:60*DAY,reason:'青黄不接，粮商惜售'}]},
            {id:'ease',name:'粮价回落',probability:0.5,condition:{kind:'always'},effects:[{kind:'price_shift',settlement:sid,items:GRAIN,factor:1,minutes:1,reason:'新粮将下，粮价回落'}]}]});
        // Public ledger on the core village scale: about 12 copper, 0.6 wood and
        // 0.12 iron per head; grain for storeDays; daily supply just above need
        // in farming counties, exactly need elsewhere (grain comes in by trade).
        ledgers[sid]={name:s.name,population:P,treasury:12*P,wood:Math.round(0.6*P),iron:Math.round(0.12*P),food:P*h.storeDays,foodPerDay:h.farm?Math.ceil(P*1.02):P,
            woodPerDay:(county.biomes??[]).some(b=>b==='forest'||b==='plant')?4:2,starvation:0};
    }
    return {hazards,ledgers};
}

export function generateCounty(world,countyId,campaignSeed){
    const o=outline(world),county=o.byId.get(countyId);if(!county||county.category!=='county')throw Error(`未登记的远方郡：${countyId}`);
    if(o.home.has(countyId))throw Error('本郡已有成文聚落，不按种子生成');
    const seed=`${campaignSeed}:remote:${countyId}:v${REMOTE_VERSION}`,rng=stream(seed),short=remoteShort(countyId),kind=countyKind(county),culture=mainCulture(county);
    const province=o.byId.get(county.province),seat=seatOf(world,county),text=KIND_TEXT[kind==='shared'?'beast':kind];
    const used=new Set();
    for(const row of [...world.npcs,...world.residents??[],...world.locations,...world.factionPeople??[],...world.factions??[],...world.items])if(row.generated!=='remote')for(const n of [row.name,...row.aliases??[]])if(n)used.add(n);
    const fresh=(make,tries=60)=>{for(let i=0;i<tries;i++){const n=make(i);if(!used.has(n)){used.add(n);return n;}}throw Error('远方地名库不足');};
    const {naming:names,clans}=naming(world,kind,county,rng);
    const locations=[],routes=[],people=[],households=[],settlements=[],profiles=[],rumors=[],offices=[],jurisdiction={},officials={};
    const seatShort=[...seat.name].slice(0,2).join('');
    const route=(from,to,lengthKm,modes=['walk'],extra={})=>routes.push({id:`route_rg_${short}_${from.replace(/^(loc|bld)_rg_/,'').replace(`${short}_`,'')}_${to.replace(/^(loc|bld)_rg_/,'').replace(`${short}_`,'')}`,
        from,to,lengthKm:round2(lengthKm),terrainMultiplier:1,modes,closedSeasons:[],toll:0,risk:0,generated:'remote',...extra});
    const place=(row,parent,{wild=false}={})=>{locations.push({aliases:[],openHours:[0,1440],terrain:county.terrain,region:countyId,generated:'remote',
        mapHierarchy:hierarchy(world,county,{id:parent?.settlement??row.id,name:parent?.name??row.name}),...(wild?{}:{rooms:[],inventory:{}}),...row});return row.id;};
    if(!seat.existing)locations.push(seatLocation(world,countyId));
    // Settlement plan: seat plus towns/villages (human) or camps/dens/groves (nonhuman).
    const census=outlineNumber(county.population);
    const subs=[];
    if(kind==='human'){
        const towns=census>=40000?2:census>=12000?1:0,villages=census>=20000?3:2;
        for(let i=0;i<towns;i++)subs.push('town');for(let i=0;i<villages;i++)subs.push('village');
    }else subs.push('sub','sub');
    const chars=[...new Set([...county.terrain].filter(c=>/[一-鿿]/.test(c)&&!'与和、'.includes(c)))];
    const plans=[{role:'seat',id:seat.id,name:seat.name,coordinates:seat.coordinates}],own=mine(world,countyId),usedStems=new Set();
    subs.forEach((role,i)=>{
        const angle=(i/subs.length)*Math.PI*2+rng(),r=role==='town'?int(rng,14,28):int(rng,6,18);
        const stems=[...NAME_ROOTS,...chars].flatMap(a=>PLACE_PARTS.map(b=>a+b)).filter(stem=>own(stem)&&!usedStems.has(stem));
        const name=fresh(n=>kind==='human'?(()=>{const stem=pick(rng,stems);usedStems.add(stem);return `${stem}${pick(rng,role==='town'?TOWN_SUFFIX:VILLAGE_SUFFIX)}`;})()
            :kind==='orc'?`${pick(rng,clans[`culture_far_orc:${SPECIES.orc}`])}营地`:kind==='lignum'?`${seatShort}${pick(rng,SLOPES)}`:`${pick(rng,clans['culture_beast:'])}穴`);
        plans.push({role,id:`loc_rg_${short}_s${i+1}`,name,coordinates:[round2(seat.coordinates[0]+Math.cos(angle)*r),round2(seat.coordinates[1]+Math.sin(angle)*r)]});
    });
    const trades=industryTrades(county),fixed=[];let personIndex=0;
    const nameFor=(cult,species,clan)=>{const spec=names[`${cult}:${species??''}`]??names[`${cult}:`];return fresh(i=>composeName(rng,spec,clan,i),96);};
    const clanFor=(cult,species)=>pick(rng,clans[`${cult}:${species??''}`]??clans[`${cult}:`]);
    const person=(row)=>{const id=row.id??`npc_rg_${short}_${String(++personIndex).padStart(2,'0')}`;
        const house=`house_rg_${short}_${String(households.length+1).padStart(2,'0')}`;
        households.push({id:house,settlement:row.settlement,homeLocation:row.location,members:[id],tenure:'远方郡骨架按种子登记的单人户'});
        const out={aliases:[],tier:'roster',generated:'remote',county:countyId,flags:{minor:false,romanceable:true},profileStatus:'roster',scope:row.settlement,
            home:{district:row.location,dwelling:row.location,access:'私人住处须本人同意。'},householdId:house,household:[],kin:[],...row,id};
        people.push(out);fixed.push(id);return out;};
    // Each settlement: districts, buildings, quota, office, shops.
    for(const plan of plans){
        const role=plan.role,level=levelOf(kind,role,plan.name),sid=plan.id,isSeat=role==='seat';
        if(!isSeat)place({id:sid,name:plan.name,parent:null,scope:sid,coordinates:plan.coordinates,purpose:kind==='human'?(role==='town'?'镇':'村'):`${county.ruler.polity}的${text.sub}`,
            description:`${plan.name}在${county.name}，${kind==='human'?`归${seat.name}管辖`:`属${county.ruler.polity}`}；${county.climate}。`});
        // Population and species split.
        let P=isSeat?(kind==='human'?(level==='城'?(seat.id==='loc_capital'?int(rng,1500,1900):int(rng,850,1300)):int(rng,380,700)):int(rng,200,340))
            :role==='town'?int(rng,180,400):kind==='human'?int(rng,60,160):int(rng,60,140);
        const groups=[];// {species,culture,share,districtNames,work}
        if(kind==='orc'){
            const heilu=/黑炉/.test(county.name);
            groups.push({species:SPECIES.orc,culture,share:heilu?0.62:0.7,work:['猎手','矿工','驮手','鞣皮匠'].filter((w,i)=>i<2||trades.includes(w))},
                {species:SPECIES.goblin,culture,share:heilu?0.32:0.2,work:['修具匠','炉工','烧炭工']},{species:SPECIES.troll,culture,share:heilu?0.06:0.1,work:['搬运工']});
        }else if(kind==='lignum')groups.push({species:SPECIES.lignum,culture,share:1,work:['育苗者','采苔人','割脂工','守林者'].filter((w,i)=>i===0||i===3||trades.includes(w))});
        else if(kind==='beast'||kind==='shared'){
            groups.push({species:null,culture:'culture_beast',share:kind==='shared'?0.75:1,work:['猎手','嗅迹记录者','鞣皮匠','熏肉匠','向导'].filter((w,i)=>i===0||trades.includes(w))});
            if(kind==='shared'&&isSeat)groups.push({species:null,culture:'culture_canopy',share:0.25,work:['伐木工','绳桥匠','采药人']});
        }else groups.push({species:null,culture,share:1,work:trades});
        // Districts: one per group for nonhuman; by size for human settlements.
        const districts=[];
        const dname=(base)=>fresh(i=>i?`${plan.name.slice(0,2)}${base}${'一二三四五'[i-1]??i}`:base);
        if(kind==='human'){
            const n=isSeat?Math.max(2,Math.min(seat.id==='loc_capital'?10:8,Math.round(P/150))):role==='town'?2:P>100?2:1;
            const bases=isSeat?shuffle(rng,['东市','西坊','南门','北门','河埠','上坊','下坊','桥头','仓前','后街','新坊','旧城']).slice(0,n).map(b=>`${seatShort}${b}街`)
                :n===2?['东头','西头'].map(b=>`${plan.name.replace(/[村庄屯寨镇集堡]$/,'')}${b}`):[`${plan.name}里`];
            bases.forEach((b,j)=>{const work=j===0&&isSeat?['书吏','差役','小贩']:shuffle(rng,groups[0].work).slice(0,Math.max(2,Math.min(3,groups[0].work.length)));
                if(work.length<2)work.push('小贩');districts.push({name:dname(b),work:[...new Set(work)].sort(),culture:groups[0].culture,species:null});});
        }else for(const g of groups){
            // Nonhuman quarters follow the monster-settlement layout: camps, dens, rock nests, burrows, rooting slopes.
            const stem=plan.name.replace(/(营地|大营|石寨|老林|石门|石台|穴|坡)$/,'')||plan.name.slice(0,2),many=isSeat&&g.share>=0.5?2:1;
            const tribes=kind==='orc'&&isSeat?shuffle(rng,clans[`${culture}:${SPECIES.orc}`]).slice(0,many):[];
            // Seat burrows belong to groups that do not already have a burrow of their own.
            const subStems=new Set(plans.slice(1).map(x=>x.name.replace(/穴$/,''))),groupsAll=clans['culture_beast:']??[],seatGroups=groupsAll.filter(x=>!subStems.has(x)).length?groupsAll.filter(x=>!subStems.has(x)):groupsAll;
            const seatPick=shuffle(rng,seatGroups);
            for(let k=0;k<many;k++){
                const label=g.species===SPECIES.goblin?`${stem}矮洞`:g.species===SPECIES.troll?`${stem}石窝`:g.culture==='culture_canopy'?`${stem}林民木台`
                    :kind==='orc'?(isSeat?`${tribes[k]}营`:`${stem}帐区`):kind==='lignum'?`${stem}${pick(rng,SLOPES)}扎根处`:isSeat?`${seatPick[k%seatPick.length]}坡屋`:`${stem}坡屋`;
                districts.push({name:dname(label),work:[...new Set(g.work)].sort(),culture:g.culture,species:g.species});
            }
        }
        const districtIds=districts.map((dist,j)=>{const id=`loc_rg_${short}_${isSeat?'s0':plan.id.split('_').at(-1)}_d${j+1}`;
            place({id,name:dist.name,parent:sid,scope:sid,owner:sid,coordinates:[round2(plan.coordinates[0]+0.2*Math.cos(j)),round2(plan.coordinates[1]+0.2*Math.sin(j))],purpose:'住区',
                description:`${dist.name}是${plan.name}的住区，${dist.work.join('、')}多住在这里。街巷可以通行，入户须先招呼。`},{settlement:sid,name:plan.name});
            route(sid,id,0.3);dist.id=id;return id;});
        // Buildings: office/council, shops, shrine or workshop.
        const buildings=[];
        const bld=(tag,name,purpose,extra={})=>{const id=`bld_rg_${short}_${isSeat?'s0':plan.id.split('_').at(-1)}_${tag}`,host=districtIds[buildings.length%districtIds.length];
            place({id,name:fresh(i=>i?`${plan.name.slice(0,2)}${name}${i+1}`:name),parent:host,scope:sid,coordinates:[round2(plan.coordinates[0]+0.03*(buildings.length+1)),plan.coordinates[1]],purpose,access:{mode:'public'},...extra},{settlement:sid,name:plan.name});
            route(host,id,0.05);buildings.push(id);return id;};
        const officeHall=kind==='human'?bld('office',isSeat?`${seatShort}${level==='城'?'府衙':'公所'}`:`${plan.name.slice(0,2)}${role==='town'?'公所':'议事屋'}`,'官署',
            {description:`${plan.name}办公事的地方，${isSeat?'郡里的税册与兵役名册存在这里':'村里的事在这里商议'}。`})
            :bld('council',isSeat?`${seatShort}${text.council}`:`${plan.name.slice(0,2)}议处`,'议事区',{description:`${plan.name}议事的地方，${county.ruler.polity}的规矩在这里说定。外人可在边上旁听，开口须先报来意。`});
        const shopTypes=kind==='human'?(isSeat?['tavern','merchant',...(level==='城'||trades.some(t=>/铁匠|炉工|铜匠|矿工/.test(t))?['smithy']:[])]:role==='town'?['tavern',pick(rng,['merchant','smithy'])]:rng()<0.5?['merchant']:[])
            :isSeat?['merchant',...(kind==='orc'?['smithy']:[])]:[];
        const shops=[];
        for(const type of shopTypes){
            const shopName=kind==='human'?`${plan.name.slice(0,2)}${SHOP_NAMES[type]}`:type==='smithy'?`${seatShort}${text.forge}`:`${seatShort}${text.market}`;
            const at=bld(type,shopName,type==='tavern'?'客栈':type==='smithy'?'铺面与工坊':'货栈',{description:`${shopName}卖往来货物，货从大路上运来，按日挂价。`});
            const g=type==='smithy'&&kind==='orc'?groups[1]:groups[0],cult=g.culture,clan=clanFor(cult,g.species);
            const restock=shopRows(world,rng,type,sid);
            const keeper=person({name:nameFor(cult,g.species,clan),age:int(rng,28,58),sex:rng()<0.5?'男':'女',...(g.species?{species:g.species}:{}),culture:cult,settlement:sid,location:at,
                occupation:`${shopName}${type==='tavern'?'掌柜':type==='smithy'?'铺主':'掌柜'}`,remoteRole:'keeper',workplace:{location:at,access:'铺面营业时可进'},
                services:['trade'],shopType:type,shopRestock:restock,coins:int(rng,180,520),inventory:Object.fromEntries(restock.map(r=>[r.item,r.amount])),schedule:shopSchedule(at,type),
                creditPolicy:{limitCopper:0,maximumMinutes:0,minimumTrust:100}});
            shops.push({id:`shop_${keeper.id.replace(/^npc_/,'')}`,keeper:keeper.id,type,location:at});
        }
        if(kind==='human'&&isSeat)bld('shrine',`${seatShort}祠`,'祠庙',{description:'供奉地方神祇的小祠，香火由街坊轮流照看。'});
        // Office: county seat holds the county office (outline ruler) and its own head.
        const officeRows=[];
        if(isSeat)officeRows.push({id:`office_rg_${short}_county`,name:county.keyPeople[0].role.split('，')[0],level:'郡',settlement:sid,holder:'key:0',source:'outline'});
        const g0=groups[0],headClan=clanFor(g0.culture,g0.species);
        const head=person({name:nameFor(g0.culture,g0.species,headClan),age:int(rng,40,66),sex:rng()<0.5?'男':'女',...(g0.species?{species:g0.species}:{}),culture:g0.culture,settlement:sid,location:officeHall,
            occupation:`${plan.name}${officeName(kind,role,level,seat.name)}`,remoteRole:'official'});
        officeRows.push({id:`office_rg_${short}_${isSeat?'s0':plan.id.split('_').at(-1)}`,name:officeName(kind,role,level,seat.name),level,settlement:sid,holder:head.id,source:'generated'});
        head.office=officeRows.at(-1).id;head.schedule=officeSchedule(officeHall);offices.push(...officeRows);officials[sid]=head.id;
        // People are employment facts; courts and legal powers are derived on read.
        if(legalTemplate(world,county)){
            const roles=[...Array(legalStaffing(level)).fill('officer'),...(isSeat?['review','final']:[])];
            for(const judicialRole of roles){
                const titles={orc:{officer:'守誓者',review:'会火复议者',final:'众部终议者'},lignum:{officer:'守林者',review:'根席复议者',final:'异坡长根议者'},beast:{officer:'嗅迹记录者',review:'猎林复议者',final:'异群议者'}};
                const occupation=titles[kind]?.[judicialRole]??({officer:'巡差',review:'复审议者',final:'终审议者'}[judicialRole]);
                const clan=clanFor(g0.culture,g0.species),p=person({name:nameFor(g0.culture,g0.species,clan),age:int(rng,35,65),sex:rng()<0.5?'男':'女',
                    ...(g0.species?{species:g0.species}:{}),culture:g0.culture,settlement:sid,location:officeHall,occupation,remoteRole:'official',judicialRole});
                p.schedule=officeSchedule(officeHall);
            }
        }
        if(legalTemplate(world,county)){
            const occupation=isSeat||role==='town'?'讼师':'代书人',clan=clanFor(g0.culture,g0.species);
            const p=person({name:nameFor(g0.culture,g0.species,clan),age:int(rng,30,62),sex:rng()<0.5?'?':'?',...(g0.species?{species:g0.species}:{}),
                culture:g0.culture,settlement:sid,location:officeHall,occupation,remoteRole:'advocate',skills:{skill_literacy:{proficiency:isSeat?400:200}}});
            p.schedule={default:[{start:0,end:480,location:officeHall,activity:'休息',services:[]},{start:480,end:1020,location:officeHall,activity:'代写诉状与听取委托',services:['law']},{start:1020,end:1440,location:officeHall,activity:'休息',services:[]}]};
        }
        jurisdiction[sid]={level,superior:isSeat?countyId:seat.id};
        // Roster quota: fixed people are registered; the rest is pending, seeded on demand.
        const registered=fixed.filter(id=>people.find(p=>p.id===id).settlement===sid);
        const pendingP=P;
        const weights=Object.fromEntries(groups.map((g,i)=>[i,g.share]));const split=apportion(pendingP,weights);
        const bySpecies={},ageTotals=[];
        groups.forEach((g,i)=>{
            const n=split[i],h=Math.max(1,Math.round(n/4.2)),ages=ageSplit(n);
            while(ages.adults+ages.elders<h){if(ages.children)ages.children--;else if(ages.youngAdults)ages.youngAdults--;else break;ages.adults++;}
            ageTotals.push(ages);
            const key=g.species??'';(bySpecies[key]??={population:0,households:0,ageStructure:{children:0,youngAdults:0,adults:0,elders:0},districts:[]});
            bySpecies[key].population+=n;bySpecies[key].households+=h;for(const k of Object.keys(ages))bySpecies[key].ageStructure[k]+=ages[k];
            bySpecies[key].districts.push(...districts.filter(dd=>dd.culture===g.culture&&dd.species===g.species).map(dd=>dd.id));
        });
        const households_=Object.values(bySpecies).reduce((n,g)=>n+g.households,0),pendingAges=sumAges(ageTotals);
        const mixed=Object.keys(bySpecies).length>1;
        const template={settlement:sid,seed:`${seed}:${sid}`,short:sid.replace(/^loc_/,''),
            districts:Object.fromEntries(districts.map(dd=>{const g=groups.find(x=>x.culture===dd.culture&&x.species===dd.species)??groups[0],same=districts.filter(x=>x.culture===dd.culture&&x.species===dd.species).length;
                return [dd.id,{weight:Math.max(1,Math.round(g.share*100/same)),work:dd.work,...(kind==='shared'?{culture:dd.culture}:{})}];})),
            minorWork:kind==='orc'?['由部里照看']:kind==='lignum'?['在坡上晒太阳']:kind==='human'?['随家人做轻活','跟着学手艺']:['随群里学认气味'],
            composition:Object.fromEntries(Object.entries(bySpecies).map(([k,g])=>[k,g.population])),
            cultures:Object.fromEntries(Object.keys(bySpecies).map(k=>[k,groups.find(g=>(g.species??'')===k).culture])),
            surnames:clans[`${g0.culture}:${g0.species??''}`]??clans[`${g0.culture}:`],given:GIVEN_STOCK,
            naming:Object.fromEntries(Object.entries(names)),clans:Object.fromEntries(Object.entries(clans))};
        if(mixed)template.speciesSurnames=Object.fromEntries(Object.keys(bySpecies).map(k=>[k,clans[`${template.cultures[k]}:${k}`]??clans[`${template.cultures[k]}:`]]));
        const profile={id:sid,parent:null,generated:'remote',county:countyId,kind:role,level,population:pendingP+registered.length,householdCount:households_+registered.length,
            registeredPopulation:registered.length,pendingPopulation:pendingP,registeredHouseholdCount:registered.length,pendingHouseholdCount:households_,
            registrationMode:'seeded-on-demand',populationSeed:`${seed}:${sid}`,residentIds:registered,visitors:[],commuters:[],externalRelatives:[],kinship:[],
            facts:[`${plan.name}按种子登记${pendingP+registered.length}名、${households_+registered.length}户；具名${registered.length}名，其余${pendingP}名${households_}户在到访住区时才生成，不计入完整档。`],
            coordinates:plan.coordinates,terrain:county.terrain,climate:county.climate,buildingIds:buildings,ageStructure:pendingAges,
            pendingAgeStructure:pendingAges,...(mixed?{pendingSpeciesStructure:bySpecies}:{}),populationTemplate:template,
            offices:officeRows.map(r=>r.id),shops:shops.map(s=>s.id)};
        profiles.push(profile);
        settlements.push({id:sid,name:plan.name,role,level,districts:districtIds,buildings,offices:officeRows.map(r=>r.id),shops,population:profile.population});
        if(!isSeat)route(seat.id,sid,distance(seat.coordinates,plan.coordinates)*1.2,kind==='human'&&roadSpeed(county.terrain)===1?['walk','horse','cart']:['walk','horse'],
            {terrainMultiplier:roadSpeed(county.terrain),risk:NONHUMAN.has(kind)?1:0});
    }
    // Key people: fixed named members at the seat; outline identity is kept.
    const seatPlan=settlements[0],hall=seatPlan.buildings[0],nodes=(o.nodes.get(countyId)??[]).filter(id=>id!==seat.id);
    const factionPeople=new Map((world.factionPeople??[]).map(p=>[p.id,p]));
    county.keyPeople.forEach((k,i)=>{
        const title=k.role.split('，')[0],existing=k.person?factionPeople.get(k.person):null;
        const at=nodes.find(n=>k.role.includes(o.locations.get(n).name))??(i===0?hall:seat.id);
        const settlementAt=nodes.includes(at)?seat.id:seat.id;
        const short_=k.name.split('·')[0],clause=(county.prose?.people??'').split(/[；。]/).find(s=>s.includes(short_))??'';
        const sex=/她/.test(clause)?'女':/他/.test(clause)?'男':rng()<0.5?'男':'女';
        const age=existing?.age??(/年轻/.test(k.role+clause)?int(rng,22,32):/老|年纪最大/.test(k.role+clause)?int(rng,60,76):int(rng,36,58));
        const species=speciesOfName(k.culture,k.name);
        const row=person({...(existing?{id:existing.id}:{}),name:k.name,age,sex:existing?.sex??sex,...(species?{species}:{}),culture:k.culture,
            ...(existing?.faction||county.ruler.faction?{faction:existing?.faction??county.ruler.faction}:{}),settlement:settlementAt,location:at,occupation:existing?.occupation??title,
            remoteRole:'key',keyPerson:true,title,outlineRole:k.role,polity:county.ruler.polity,...(existing?{traits:existing.traits,concern:existing.concern,visibleFeature:existing.visibleFeature,outlinePerson:existing.id}:{})});
        if(i===0)for(const r of offices)if(r.holder==='key:0')r.holder=row.id;
        used.add(k.name);
        // Outline people are registered members of the seat, outside the pending quota.
        const p=profiles[0];p.residentIds.push(row.id);p.registeredPopulation++;p.registeredHouseholdCount++;p.population++;p.householdCount++;settlements[0].population++;
    });
    profiles[0].facts=[`${seat.name}按种子登记${profiles[0].population}名、${profiles[0].householdCount}户；具名${profiles[0].registeredPopulation}名（含纲要人物），其余${profiles[0].pendingPopulation}名${profiles[0].pendingHouseholdCount}户在到访住区时才生成，不计入完整档。`];
    // County wild land (K8 habitat interface: terrain + biome words, no owner or access).
    place({id:`loc_rg_${short}_wild`,name:fresh(i=>`${county.name}郊外${i?i+1:''}`),parent:null,scope:seat.id,areaKm2:20,coordinates:[round2(seat.coordinates[0]+4),round2(seat.coordinates[1]+3)],
        biome:biomeWords(county),purpose:'野地',description:`${county.name}城镇以外的${county.terrain}。`},null,{wild:true});
    route(seat.id,`loc_rg_${short}_wild`,5,['walk'],{risk:1});
    // Border nodes in the county (market posts) connect to the seat.
    for(const n of nodes)if(!routes.some(r=>[r.from,r.to].includes(n)))route(seat.id,n,distance(seat.coordinates,o.locations.get(n).coordinates)*1.2,['walk','horse'],{terrainMultiplier:roadSpeed(county.terrain),risk:1});
    // Roads to neighbouring counties (and stub seats of those not yet generated).
    for(const other of tiedCounties(world,county)){
        const link=linkRoute(world,countyId,other);if(!link)continue;routes.push(link);
        const stub=seatLocation(world,other);if(stub&&stub.id!==seat.id)locations.push(stub);
    }
    // Rumor seeds from the outline's own relations, carried by the seat's shopkeepers.
    const carriers=people.filter(p=>p.remoteRole==='keeper'&&p.settlement===seat.id).map(p=>p.id);
    if(carriers.length)(county.ties??[]).slice(0,3).forEach((t,i)=>{
        const other=o.byId.get(t.with);if(!other)return;
        rumors.push({id:`rumor_rg_${short}_${i+1}`,claim:`听说${county.name}和${other.name}之间是${t.kind}往来：${t.terms}。`,truth:'true',source:carriers[i%carriers.length],carriers,witnesses:[],
            fact:`纲要所载：${county.name}与${other.name}${t.kind}，${t.terms}`,verification:`到${other.name}或${seat.name}的官署、议处核对。`,status:'generated-seed',propagation:'pending-event',generated:'remote'});
    });
    // D1 festival hosts: a published festival waiting for a host at a place of
    // this county gets a resident who hosts it (drawn last, so the rest of the
    // skeleton keeps its draws). The host lives at the venue and is there all day.
    const venues=new Set([seat.id,...o.nodes.get(countyId)??[]]);
    for(const f of (world.festivals??[]).filter(f=>f.runtime?.status==='awaiting_host'&&venues.has(f.venue?.location)).sort((a,b)=>a.id.localeCompare(b.id))){
        const cult=kind==='beast'||kind==='shared'?'culture_beast':culture,species=kind==='orc'?SPECIES.orc:kind==='lignum'?SPECIES.lignum:null;
        const row=person({id:`npc_rg_${short}_fh_${f.id.replace(/^festival_/,'')}`,name:nameFor(cult,species,clanFor(cult,species)),age:int(rng,30,64),sex:rng()<0.5?'男':'女',...(species?{species}:{}),culture:cult,
            settlement:seat.id,location:f.venue.location,occupation:`${f.name}主办`,title:'节日主办',remoteRole:'festival_host',festivalHost:f.id,coins:int(rng,40,160),inventory:{},schedule:hostSchedule(f.venue.location)});
        const p=profiles[0];p.residentIds.push(row.id);p.registeredPopulation++;p.registeredHouseholdCount++;p.population++;p.householdCount++;settlements[0].population++;
    }
    if(people.some(p=>p.remoteRole==='festival_host'))profiles[0].facts=[`${seat.name}按种子登记${profiles[0].population}名、${profiles[0].householdCount}户；具名${profiles[0].registeredPopulation}名（含纲要人物与节日主办），其余${profiles[0].pendingPopulation}名${profiles[0].pendingHouseholdCount}户在到访住区时才生成，不计入完整档。`];
    jurisdiction[countyId]={level:'郡',superior:province.id};
    const rostered=profiles.reduce((n,p)=>n+p.population,0);
    const {hazards,ledgers}=remoteHazards(county,seat,settlements,routes,profiles);
    const skeleton={version:REMOTE_VERSION,county:countyId,name:county.name,province:province.id,kind,culture,seat:seat.id,seatExisting:seat.existing,
        census:{outline:county.population,outlineNumber:census,rostered,note:'纲要人口只是概数；名册配额按种子登记，未展开的人数不算完整档。'},
        settlements,locations,routes,people,households,profiles,offices,rumors,jurisdiction,
        hazards,ledgers,publishers:officials};
    return skeleton;
}

// ---------------------------------------------------------------- campaign state
export function unfoldRemoteAt(d,engine,location){
    const base=engine.remoteBase?.world??engine.world,county=remoteCountyOf(engine.world,location);
    // Existing U11 saves already contain the founding skeleton. First entry
    // supplies only missing campaign ledgers and K8 ranges, once.
    const tribal=Object.values(d.get('state','records')??{}).find(r=>r.category==='tribal_settlement'&&[r.skeleton.id,`${r.skeleton.id}_wild`,...r.skeleton.districts.map(l=>l.id)].includes(location));
    if(tribal){
        const s=tribal.skeleton,overlay=materializeWildlifeHabitats(remoteWorld(base,d.get('state'))),habitats=overlay.rules.wildlife?.habitats.filter(h=>h.location===`${s.id}_wild`)??[];
        const missingLedger=!d.get('state','settlements',s.id);
        if(missingLedger)d.set(['state','settlements',s.id],{name:s.name,population:s.population,food:0,wood:0,stone:0,iron:0,treasury:0});
        const patches=planWildlifeMigration(d.document,{...overlay.rules,wildlife:{...overlay.rules.wildlife,habitats}},overlay.monsters??[]);
        for(const patch of patches)d.set(patch.path,patch.value);
        return missingLedger||patches.length?{version:REMOTE_VERSION,kind:'tribal',settlement:s.id,habitats:habitats.map(h=>h.id)}:null;
    }
    if(!county||d.get('state','remote',county))return null;
    const skeleton=generateCounty(base,county,d.document.randomSeed??'default-campaign');
    const record={version:REMOTE_VERSION,county,seed:d.document.randomSeed??'default-campaign',minute:d.get('state','minute'),firstPlace:location,hash:digest(skeleton).slice(0,24),revision:0,profiles:{},skeleton};
    d.set(['state','remote',county],record);
    // K8: the county's wild land gets its derived habitat now, stocked in the
    // campaign as an edition update would, so remote wilds hold creatures on the first visit.
    const overlay=materializeWildlifeHabitats(remoteWorld(base,d.get('state'))),places=new Set(skeleton.locations.filter(l=>l.region===county).map(l=>l.id));
    const fresh=(overlay.rules.wildlife?.habitats??[]).filter(h=>h.derived&&places.has(h.location));
    if(fresh.length)for(const patch of planWildlifeMigration(d.document,{...overlay.rules,wildlife:{...overlay.rules.wildlife,habitats:fresh}},overlay.monsters??[]))d.set(patch.path,patch.value);
    // D1: every generated settlement opens its public ledger (notice board money, stores).
    // S1a: money the skeleton opens with enters the books from src:genesis.
    for(const [sid,ledger] of Object.entries(skeleton.ledgers??{}))if(!d.get('state','settlements',sid)){moveCoins(d,{from:source('genesis','remote'),to:treasuryAccount(sid),amount:ledger.treasury??0,writer:'remote-generation',eventId:`remote:${county}`});genesisSettlement(d,engine,sid,ledger,{writer:'remote-generation',eventId:`remote:${county}`});d.set(['state','settlements',sid],structuredClone(ledger));}
    // Shopkeepers, officials (notice board) and festival hosts act from the day
    // they are registered; others act after a full profile.
    for(const p of skeleton.people)if(active(p,skeleton)){
        if(d.get('state','npcs',p.id))throw Error(`远方人物编号已被占用：${p.id}`);
        moveCoins(d,{from:source('genesis','remote'),to:purse(null,p.id),amount:p.coins??0,writer:'remote-generation',eventId:`remote:${county}`});
        genesisBag(d,engine,p.id,p.inventory,{writer:'remote-generation',eventId:`remote:${county}`});
        d.set(['state','npcs',p.id],{...initialNpcState(p),occupation:p.occupation});
    }
    return {version:REMOTE_VERSION,county,name:skeleton.name,kind:skeleton.kind,settlements:skeleton.settlements.length,places:skeleton.locations.length,people:skeleton.people.length,habitats:fresh.map(h=>h.id),
        rostered:skeleton.census.rostered};
}

// ---------------------------------------------------------------- overlay world
const PROFILE_KEYS=['personality','voice','background','currentConcern','goals','fears','knowledge','relationships','visibleFeature','notes'];
// Skeletons generated before D1 (no hazards field) keep their officials as roster entries.
const active=(p,skeleton)=>p.remoteRole==='keeper'||Boolean(skeleton.hazards)&&['official','festival_host','advocate'].includes(p.remoteRole);
export function remoteKey(state){
    const remote=state?.remote??{};
    return [...Object.keys(remote).sort().map(k=>`${k}:${remote[k].hash}:${remote[k].revision}`),
        ...Object.entries(state?.records??{}).filter(([,r])=>r.category==='tribal_settlement').sort(([a],[b])=>a.localeCompare(b)).map(([k,r])=>`${k}:${r.hash}`)].join('|');
}
// The existing remote/population overlay also admits U11 settlements. The
// founding skeleton remains historical; current households/offices read state.
export function tribalOverlay(base,s){
    const home=base.locations.find(l=>l.id===s.near),root={id:s.id,name:s.name,parent:s.parent,scope:s.id,region:home?.region,coordinates:s.coordinates,
        terrain:home?.terrain??'林地',biome:home?.biome??[],owner:s.council,generated:'tribal',openHours:[0,1440],description:`${s.name}是族群觉醒后建立的自治聚居地。`};
    const road=(from,to,i,lengthKm=0.3)=>({id:`route_${s.id}_${i}`,from,to,lengthKm,terrainMultiplier:0.7,modes:['walk'],closedSeasons:[],toll:0,risk:0,generated:'tribal'});
    const locations=[root,...s.districts.map(d=>({...root,id:d.id,name:d.name,parent:s.id,scope:s.id,coordinates:s.coordinates})),
        {...root,id:`${s.id}_wild`,name:`${s.name}近郊`,parent:s.id,scope:s.id,owner:null,areaKm2:0.3}];
    const population=Math.max(0,s.population-(s.inhabitants?.length??0)),households=population?Math.max(1,Math.ceil(population/4)):0;
    const ages={children:0,youngAdults:0,adults:population,elders:0},template={settlement:s.id,seed:`${s.name}:${s.id}:${s.foundedAt}`,short:s.id.replace(/^loc_/,''),
        districts:Object.fromEntries(s.districts.map(d=>[d.id,{weight:1,work:d.work}])),minorWork:['随群里学认气味'],composition:{[s.species]:population},cultures:{[s.species]:'culture_beast'},
        surnames:['苔','石','溪','叶'],given:GIVEN_STOCK};
    const profile={id:s.id,generated:'tribal',council:s.council,population:s.population,householdCount:households+(s.inhabitants?.length??0),residentIds:s.inhabitants??[],
        registeredPopulation:s.inhabitants?.length??0,pendingPopulation:population,pendingHouseholdCount:households,pendingAgeStructure:ages,
        registrationMode:'seeded-on-demand',populationSeed:template.seed,populationTemplate:template};
    return {locations,routes:[road(s.near,s.id,'entrance'),...locations.slice(1).map((l,i)=>road(s.id,l.id,i))],people:[],households:[],profiles:[profile],rumors:[],jurisdiction:{}};
}
export function remoteWorld(base,state){
    const records=[...Object.keys(state?.remote??{}).sort().map(k=>state.remote[k]),...Object.values(state?.records??{}).filter(r=>r.category==='tribal_settlement').map(r=>({skeleton:tribalOverlay(base,{...r.skeleton,inhabitants:r.inhabitants??(r.skeleton.leader?[r.skeleton.leader]:[])})}))];if(!records.length)return base;
    const ids=new Set(base.locations.map(l=>l.id)),locations=new Map(),routes=new Map(),relocated=new Set();
    const merge=(p,rec)=>{const done=rec.profiles?.[p.id];return done?.status==='full'?{...p,...Object.fromEntries(PROFILE_KEYS.filter(k=>done.profile?.[k]!==undefined).map(k=>[k,done.profile[k]])),profileStatus:'full'}:p;};
    const npcs=[],residents=[],households=[],profiles=[],rumors=[],jurisdiction={},hazards=[],publishers={};
    for(const rec of records){
        const s=rec.skeleton;
        for(const l of s.locations)if(!ids.has(l.id)&&!locations.has(l.id))locations.set(l.id,l);
        for(const r of s.routes)if(!routes.has(r.id))routes.set(r.id,r);
        for(const p of s.people){const row=merge(p,rec);(active(p,s)?npcs:residents).push(row);if(p.outlinePerson)relocated.add(p.outlinePerson);}
        hazards.push(...s.hazards??[]);Object.assign(publishers,s.publishers??{});
        households.push(...s.households);profiles.push(...s.profiles);rumors.push(...s.rumors);Object.assign(jurisdiction,s.jurisdiction);
    }
    // A county's own seat record wins over a neighbour's stub of it (they are equal by construction).
    for(const rec of records){const own=rec.skeleton.locations.find(l=>l.id===rec.skeleton.seat);if(own)locations.set(own.id,own);}
    const known=new Set(base.routes.map(r=>r.id)),world={...base};
    world.locations=[...base.locations,...locations.values()];
    world.routes=[...base.routes,...[...routes.values()].filter(r=>!known.has(r.id))];
    world.npcs=[...base.npcs,...npcs];
    world.residents=[...base.residents??[],...residents];
    world.factionPeople=(base.factionPeople??[]).filter(p=>!relocated.has(p.id));
    world.households=[...base.households??[],...households];
    world.settlementProfiles=[...base.settlementProfiles??[],...profiles];
    world.rumors=[...base.rumors??[],...rumors];
    const g=base.rules.governance,p=g?.promotion;
    // D1: generated settlements bring their hazard clocks and notice boards.
    world.rules={...base.rules,...(base.rules.wildlife?{wildlife:{...base.rules.wildlife}}:{}),
        ...(base.rules.hazardClock&&hazards.length?{hazardClock:{...base.rules.hazardClock,clocks:[...base.rules.hazardClock.clocks,...hazards]}}:{}),
        ...(base.rules.questSources&&Object.keys(publishers).length?{questSources:{...base.rules.questSources,publishers:{...base.rules.questSources.publishers}}}:{}),
        ...(p?{governance:{...g,promotion:{...p,jurisdiction:{...p.jurisdiction,...Object.fromEntries(Object.entries(jurisdiction).filter(([k])=>!p.jurisdiction?.[k]))}}}}:{})};
    world.remoteCounties=records.map(r=>r.county).filter(Boolean);
    return world;
}
// The engine a campaign runs on: its base engine, or one over the overlay world.
export function remoteEngine(engine,document,make){
    const base=engine.remoteBase??engine,key=remoteKey(document?.state);
    if(!key)return base;if(engine.remoteKey===key)return engine;
    base.remoteEngines??=new Map();
    let hit=base.remoteEngines.get(key);
    if(!hit){
        hit=make(remoteWorld(base.world,document.state));hit.remoteBase=base;hit.remoteKey=key;
        base.remoteEngines.set(key,hit);if(base.remoteEngines.size>1)base.remoteEngines.delete(base.remoteEngines.keys().next().value);
    }
    return hit;
}

// ---------------------------------------------------------------- views
const settlementOf=(engine,location)=>{const seen=new Set();for(let at=location;at&&!seen.has(at);at=engine.byId.get(at)?.parent){seen.add(at);const p=engine.world.settlementProfiles?.find(r=>r.id===at&&r.generated==='remote');if(p)return p;}return null;};
export function remoteScene(engine,document){
    const s=document.state,place=engine.byId.get(s.location),county=place?.region&&s.remote?.[place.region]?place.region:null;
    const profile=settlementOf(engine,s.location)??(county?engine.world.settlementProfiles.find(p=>p.id===s.remote[county].skeleton.seat):null);
    if(!profile)return '';
    const rec=s.remote?.[profile.county],sk=rec?.skeleton;if(!sk)return '';
    const name=id=>engine.byId.get(id)?.name??id;
    const offices=sk.offices.filter(o=>o.settlement===profile.id).map(o=>`${o.name}${name(o.holder)}`).join('、');
    const shops=(sk.settlements.find(x=>x.id===profile.id)?.shops??[]).map(x=>name(x.location)).join('、');
    const justice=courtFacilities(engine,s,profile.id);
    const here=sk.people.filter(p=>p.location===s.location&&p.remoteRole!=='keeper').map(p=>`${p.name}（${p.id}）${p.title??p.occupation}${rec.profiles?.[p.id]?.status==='full'?'':'，仅名册身份'}`);
    return `【远方郡骨架】${sk.name}（${engine.byId.get(sk.province)?.name??''}，${engine.byId.get(profile.county)?.ruler?.polity??''}）：${name(profile.id)}为${profile.level}级，登记${profile.population}名${profile.householdCount}户，其中具名${profile.registeredPopulation}名，其余到访住区才生成；官职：${offices||'无'}；店铺：${shops||'无'}。`+
        (justice?`法庭：${name(justice.court)}，按${engine.byId.get(profile.county)?.ruler?.polity??''}的法典审理；执法：${justice.officers.map(name).join('、')||'暂缺'}。`:'')+
        (here.length?`此处有：${here.join('；')}。首次交谈才建立完整档，身份以纲要为准。`:'')+`纲要人口${sk.census.outline}只是概数，不计入完整档。`;
}
// Fixed people the player names here who still have only a roster identity.
export function remotePeopleAt(engine,document,ids){
    const s=document.state;
    return [...ids].filter(id=>{const e=engine.byId.get(id);return e?.generated==='remote'&&e.location===s.location&&s.remote?.[e.county]&&s.remote[e.county].profiles?.[id]?.status!=='full';});
}
export function remoteProfileBrief(engine,document,person){
    const e=engine.byId.get(person);if(e?.generated!=='remote')return null;
    const county=engine.byId.get(e.county);
    return {identity:{id:e.id,name:e.name,age:e.age,sex:e.sex??null,species:e.species??null,culture:e.culture,occupation:e.occupation,minor:false,householdRole:null,household:[],
        district:e.home.district,dwelling:e.home.dwelling,...(e.keyPerson?{title:e.title}:{})},settlement:e.settlement,districtWork:[],
        remote:{county:county?.name,polity:county?.ruler?.polity,...(e.keyPerson?{outlineRole:e.outlineRole,instruction:`此人是远方郡纲要所载人物：background须写明纲要职务原文“${e.title}”，经历、所属势力与文化须与纲要职务一致，不得改写职务或另立身份。`}:{})}};
}
export function acceptRemoteProfile(d,engine,input,{check,maxFailures,fields}){
    const person=String(input.person),entity=engine.byId.get(person),county=entity.county,rec=d.get('state','remote',county);
    if(!rec)throw Error('远方郡骨架记录缺失');
    const status=rec.profiles?.[person],minute=d.get('state','minute');
    if(status?.status==='full')throw Error('完整档已入库，之后不再改变');
    if(input.outcome==='failed'){
        const failures=(status?.failures??0)+1;
        d.set(['state','remote',county,'profiles',person],{status:'failed',failures,lastReason:String(input.reason??'生成失败').slice(0,300),minute});
        return {person,status:'failed',failures,identityKept:true};
    }
    if((status?.failures??0)>=maxFailures)throw Error('该人物完整档生成已连续失败，保留名册身份');
    const errors=check(entity,input.profile);
    if(errors.length)throw Error(`完整档未通过硬约束：${errors.join('；')}`);
    const profile=Object.fromEntries(Object.entries(input.profile).filter(([k])=>fields[k]));
    d.set(['state','remote',county,'profiles',person],{status:'full',failures:status?.failures??0,minute,profileHash:digest(profile).slice(0,24),profile,
        ...(input.generator?{generator:{model:String(input.generator.model??'').slice(0,60),calls:Number(input.generator.calls)||0}}:{})});
    d.set(['state','remote',county,'revision'],(rec.revision??0)+1);
    // No purse or goods come with a profile; a shopkeeper keeps the shop it already had.
    if(!d.get('state','npcs',person))d.set(['state','npcs',person],{...initialNpcState({...entity,...profile,coins:0,inventory:{}}),occupation:entity.occupation,
        ...(!entity.schedule?{routine:{default:[{start:0,end:1440,location:entity.home?.location??entity.location,activity:'在家',services:[]}]}}:{})});
    return {person,status:'full',name:entity.name,county};
}
