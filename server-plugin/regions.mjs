// T142: provinces and counties (world/geo/regions.json). Outline data only:
// settlements and full profiles are generated later on demand. A place belongs
// to the county that lists it or, failing that, its nearest listed ancestor.
import {locationTraits}from'./traits.mjs';
const ROW_LEVEL={province:'省',county:'郡'};
// Habitat tags K8 reads: the K1 terrain vocabulary applied to the authored terrain words.
export const terrainBiomes=terrain=>locationTraits({terrain}).tags.filter(t=>!['location','flammable','conductive'].includes(t));
export const REGION_TIES=['贸易','通行','朝贡','臣属','议和','敌对','结盟','共治','互不进入'];
const cache=new WeakMap();
function index(world){
    let hit=cache.get(world);if(hit)return hit;
    const rows=world.regions??[],byId=new Map(rows.map(row=>[row.id,row])),places=new Map();
    for(const row of rows)if(row.category==='county')for(const id of row.places??[])places.set(id,row.id);
    hit={byId,places,locations:new Map((world.locations??[]).map(row=>[row.id,row]))};cache.set(world,hit);return hit;
}
export function regionOf(world,locationId){
    const {byId,places,locations}=index(world),seen=new Set();
    for(let id=locationId;id&&!seen.has(id);id=locations.get(id)?.parent){
        seen.add(id);const county=byId.get(places.get(id));
        if(county)return{county,province:byId.get(county.province)};
    }
    return null;
}
// The ruler recorded on the county; never a default human office.
export const rulerOf=(world,locationId)=>regionOf(world,locationId)?.county.ruler??null;
export function publicRegion(row){
    const common={id:row.id,name:row.name,aliases:row.aliases??[],category:row.category,level:ROW_LEVEL[row.category],terrain:row.terrain,biomes:row.biomes,climate:row.climate,
        industry:row.industry,seat:{name:row.seat.name},keyPeople:row.keyPeople.map(({name,role})=>({name,role})),description:row.description,references:row.references??[]};
    if(row.category==='province')return{...common,counties:row.counties,polity:row.polity,neighbors:row.neighbors};
    return{...common,province:row.province,population:row.population,control:row.control,ruler:{title:row.ruler.title,polity:row.ruler.polity},ties:row.ties};
}
// Map projection: names and centers only, the same public facts as the catalog.
export const mapRegions=world=>(world.regions??[]).map(row=>({id:row.id,name:row.name,level:ROW_LEVEL[row.category],center:row.center,
    ...(row.category==='county'?{province:row.province,control:row.control,ruler:row.ruler.polity}:{})}));
export function validateRegions(world){
    const errors=[],rows=world.regions??[];if(!rows.length)return errors;
    const ids=new Map(Object.values(world).filter(Array.isArray).flat().filter(row=>row?.id).map(row=>[row.id,row]));
    const locations=new Set(world.locations.map(row=>row.id)),listed=new Map();
    for(const row of rows){
        if(!['province','county'].includes(row.category))errors.push(`地区类别无效：${row.id}`);
        if(!Array.isArray(row.center)||row.center.length!==2||!row.center.every(Number.isFinite))errors.push(`地区中心坐标无效：${row.id}`);
        if(!(row.keyPeople?.length>=3&&row.keyPeople.length<=5))errors.push(`关键人物须三到五名：${row.id}`);
        for(const person of row.keyPeople??[])if(person.person&&ids.get(person.person)?.name!==person.name)errors.push(`关键人物与名册不符：${row.id}/${person.name}`);
        if(JSON.stringify(terrainBiomes(row.terrain))!==JSON.stringify(row.biomes))errors.push(`群落标签与地形词不符：${row.id}`);
        if(row.seat?.location&&!locations.has(row.seat.location))errors.push(`治所不是地点：${row.id}`);
        for(const id of row.references??[])if(!ids.has(id))errors.push(`引用不存在：${row.id}.references -> ${id}`);
        if(row.description!==Object.values(row.prose??{}).join('\n'))errors.push(`地区检索正文与审查字段不一致：${row.id}`);
        if(row.category==='province'){
            for(const id of row.counties)if(ids.get(id)?.category!=='county'||ids.get(id).province!==row.id)errors.push(`省郡归属不符：${row.id}/${id}`);
            continue;
        }
        if(ids.get(row.province)?.category!=='province'||!ids.get(row.province).counties.includes(row.id))errors.push(`郡未挂在所属省：${row.id}`);
        for(const id of row.places){if(!locations.has(id))errors.push(`郡辖地点不存在：${row.id}/${id}`);if(listed.has(id))errors.push(`地点重复挂郡：${id}`);listed.set(id,row.id);}
        for(const tie of row.ties){if(!ids.has(tie.with))errors.push(`邻里关系对象不存在：${row.id}/${tie.with}`);if(!REGION_TIES.includes(tie.kind))errors.push(`邻里关系类型无效：${row.id}/${tie.kind}`);}
        if(row.ruler.faction&&ids.get(row.ruler.faction)?.category!=='faction')errors.push(`统治势力不存在：${row.id}`);
        if(row.control!=='human'){
            // A non-human region is governed by its own body and deals with human polities on stated terms.
            if(!row.ruler.faction||row.ruler.polity==='王国')errors.push(`非人统治郡缺少本族统治势力：${row.id}`);
            if(row.seat.location&&(world.factions??[]).some(f=>f.contactAnchor===row.seat.location))errors.push(`联络地点被当作治所：${row.id}`);
            const human=row.ties.filter(tie=>ids.get(tie.with)?.category==='county'&&ids.get(tie.with).control==='human');
            if(!human.some(tie=>['贸易','通行','朝贡','议和','敌对','互不进入','共治'].includes(tie.kind)))errors.push(`非人统治郡缺少与人类政体的具体关系：${row.id}`);
        }
    }
    const counties=rows.filter(row=>row.category==='county');
    for(const place of world.locations)if(place.mapHierarchy&&place.region&&!counties.some(c=>c.id===place.region&&c.places.includes(place.id)))errors.push(`远方节点所属郡不符：${place.id}`);
    // Executable human law codes stay out of regions governed by other peoples.
    for(const code of world.rules?.law?.codes??[])for(const id of code.locations){const county=counties.find(c=>c.id===regionOfRows(world,id,counties));if(county&&county.control==='nonhuman')errors.push(`人类法典辖区落在非人统治郡：${code.id}/${id}`);}
    return errors;
}
function regionOfRows(world,id,counties){
    const parent=new Map(world.locations.map(row=>[row.id,row.parent])),seen=new Set();
    for(let at=id;at&&!seen.has(at);at=parent.get(at)){seen.add(at);const hit=counties.find(c=>c.places.includes(at));if(hit)return hit.id;}
    return null;
}
