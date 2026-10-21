import {localWeather,weatherTravel} from './weather.mjs';
import {mapKnowledge} from './map-state.mjs';
import {regionOf,mapRegions} from './regions.mjs';

const levels=['大陆','地区','郡','镇'];

// Read only the selected campaign world and knowledge belonging to the player.
// A seed NPC's whereabouts or memories cannot reveal a map location.
export function mapView(engine,document){
    const state=document.state,now=state.minute,{places,known,edgeKnowledge}=mapKnowledge(engine,document);
    const locations=[...known].filter(([id])=>places.get(id).mapHierarchy).map(([id,knowledge])=>{
        // T142: the region and county levels name the published province and county.
        const place=places.get(id),region=regionOf(engine.world,id),named=[null,region?.province,region?.county];
        return {id,name:place.name,coordinates:place.coordinates,knowledge,
            hierarchy:place.mapHierarchy.map((row,index)=>({...(named[index]?{id:named[index].id,name:named[index].name}:row),level:levels[index]})),current:id===state.location};
    });
    const routes=engine.world.routes.filter(edge=>known.has(edge.from)&&known.has(edge.to)).map(edge=>{
        const seasonClosed=edge.closedSeasons.includes(engine.calendar(now).season);
        const conditions=edge.modes.map(mode=>{const weather=weatherTravel(engine,document.randomSeed,edge,mode,now);return {mode,closed:seasonClosed||weather.closed,condition:seasonClosed?'本季封路':weather.closed?'天气封路':weather.weather??'天气未记录'};});
        const riskKnown=edgeKnowledge.get(edge.id)==='experienced'||edgeKnowledge.get(edge.id)==='reliable';
        return {id:edge.id,from:edge.from,to:edge.to,lengthKm:edge.lengthKm,modes:edge.modes,closedSeasons:edge.closedSeasons,
            closed:conditions.every(row=>row.closed),condition:conditions.map(row=>row.condition).filter((value,index,array)=>array.indexOf(value)===index).join('、'),conditions,
            risk:riskKnown&&Number.isFinite(edge.risk)?edge.risk:null};
    });
    return {minute:now,location:state.location,season:engine.calendar(now).season,time:engine.calendar(now).text,
        weather:localWeather(engine,document)?.name??'天气未记录',levels,locations,routes,regions:mapRegions(engine.world),
        // Existing, explicitly known transit stops can connect village routes.
        // They gain no map hierarchy before their publication task completes.
        transit:[...known].filter(([id])=>!places.get(id).mapHierarchy).map(([id,knowledge])=>({id,name:places.get(id).name,coordinates:places.get(id).coordinates,knowledge}))};
}

export function routeView(engine,document,destination){
    const map=mapView(engine,document),known=new Set([...map.locations,...map.transit].map(row=>row.id));
    if(!map.locations.some(row=>row.id===destination))throw Error('目的地尚未获知或尚未发布');
    if(!known.has(map.location))throw Error('当前位置尚未发布地图');
    const edges=engine.world.routes.filter(edge=>map.routes.some(row=>row.id===edge.id));
    // Reuse route() with a filtered world; no mutation, upgrade or advance.
    const scoped=Object.create(engine);scoped.world={...engine.world,locations:engine.world.locations.filter(row=>known.has(row.id)),routes:edges};
    const options=[],unavailable=[];
    const names=new Map([...map.locations,...map.transit].map(row=>[row.id,row.name])),viewEdges=new Map(map.routes.map(row=>[row.id,row]));
    for(const mode of ['walk','horse','cart','boat']){
        const calculate=excluded=>{
            const candidate=Object.create(scoped);candidate.world={...scoped.world,routes:edges.filter(edge=>!excluded.has(edge.id))};
            return candidate.route(map.location,destination,mode,map.minute,document.randomSeed);
        };
        let primary;
        try{primary=calculate(new Set());}catch(error){unavailable.push({mode,reason:error.message});continue;}
        const alternatives=[primary],signatures=new Set([primary.edges.join(':')]);
        for(const id of primary.edges){
            try{const route=calculate(new Set([id])),key=route.edges.join(':');if(!signatures.has(key)){alternatives.push(route);signatures.add(key);}}catch{}
        }
        alternatives.sort((a,b)=>a.minutes-b.minutes||a.cost-b.cost);
        for(const route of alternatives.slice(0,3)){
            let cursor=map.location;const via=[];
            for(const id of route.edges){const edge=viewEdges.get(id);cursor=edge.from===cursor?edge.to:edge.from;via.push(names.get(cursor));}
            const risks=route.edges.map(id=>viewEdges.get(id).risk),risk=risks.some(value=>value===null)?null:Math.max(0,...risks);
            options.push({id:`${mode}:${route.edges.join(':')}`,mode,...route,via,risk,
                intent:`我打算${{walk:'步行',horse:'骑马',cart:'乘车',boat:'乘船'}[mode]}经由${via.slice(0,-1).join('、')||names.get(map.location)}前往${names.get(destination)}。`});
        }
    }
    return {minute:map.minute,from:map.location,destination,name:names.get(destination),options,unavailable,estimate:true};
}

export function registerUIRoutes({post,readCampaign}){
    post('/ui/map',async req=>{const {engine,document,reference}=await readCampaign(req);return {reference,...mapView(engine,document)};});
    post('/ui/routes',async req=>{const {engine,document,reference}=await readCampaign(req);return {reference,...routeView(engine,document,req.body.destination)};});
}
