import {registerAdvanceHook} from './advance-hooks.mjs';
// Zone topology is authoritative for ordinary local walking. Optional points
// adapt the already published spell handlers; they never determine edge length.
import {environmentFeatures} from './environment-state.mjs';

const publicRow=r=>!r.hidden&&!r.private&&r.visible!==false;
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
export function placeLayout(engine,document,location=document.state.location){
 const place=engine.byId.get(location),authored=place?.layout,rules=engine.rules.environment?.placeLayout;
 if(authored)return {...authored,location,approachMetres:rules?.edgeMetres??0};
 const entry=`zone:${location}:entry`,zones=[{id:entry,name:rules?.entryName??place?.name??location,point:[0,0],features:[]}],edges=[];
 if(!rules)return {location,entry,zones,edges,approachMetres:0};
 const features=environmentFeatures(engine,document).filter(r=>r.location===location&&publicRow(r)).sort((a,b)=>a.id.localeCompare(b.id));
 for(const f of features){
  const id=`zone:${location}:${f.id}`;
  zones.push({id,name:f.name+rules.featureSuffix,features:[f.id],...(point(f.position)?{point:f.position}:{})});
  let hash=0;for(const c of `${document.randomSeed}:${location}:${f.id}`)hash=(hash*31+c.charCodeAt(0))>>>0;
  edges.push({from:entry,to:id,direction:rules.directions[hash%rules.directions.length],metres:rules.edgeMetres});
 }
 return {location,entry,zones,edges,generated:true,approachMetres:rules.edgeMetres};
}
export function zoneOf(engine,document,entity='player',layout=placeLayout(engine,document)){
 const s=document.state,body=entity==='player'?s.player:s.npcs?.[entity]??s.creatures?.[entity];
 const location=entity==='player'?s.location:body?.location;
 if(location!==layout.location||body?.scheduleTravel||body?.cognitionTravel)return null;
 const row=s.records?.[entity==='player'?'local_player_position':`local_actor_position:${entity}`];
 if(row?.location===location&&(entity==='player'||row.activity===(body.activity??null)&&s.minute<(row.until??Infinity))){
  const zone=layout.zones.find(z=>z.id===row.zone)||destinationZone(engine,document,row.anchor,layout);if(zone)return zone;
 }
 return layout.zones.find(z=>z.activities?.includes(body?.activity))??layout.zones.find(z=>z.id===(entity==='player'?layout.entry:layout.defaultZone??layout.entry));
}
export function destinationZone(engine,document,destination,layout=placeLayout(engine,document)){
 const zone=layout.zones.find(z=>z.id===destination||z.features?.includes(destination));if(zone)return zone;
 if(layout.defaultZone&&environmentFeatures(engine,document,r=>r.id===destination).some(r=>r.location===layout.location))return layout.zones.find(z=>z.id===layout.defaultZone)??null;
 return null;
}
export function edgeOpen(engine,document,edge){
 if(edge.blocked||edge.accessible===false)return false;
 if(!edge.barrier)return true;
 const feature=environmentFeatures(engine,document,r=>r.id===edge.barrier)[0];
 if(!feature)return false;
 const state=document.state.records?.[`physical_feature:${feature.id}`]?.state??feature.state;
 return state?.locked!==true&&state?.open!==false&&state?.blocksMovement!==true&&state?.blocksSpace!==true;
}
export function localRoute(engine,document,from,to,{layout=placeLayout(engine,document),canCross=segment=>{
 const a=layout.zones.find(z=>z.id===segment.from)?.point,b=layout.zones.find(z=>z.id===segment.to)?.point;
 return !a||!b||!engine.localPathObstruction?.(document,layout.location,a,b);
}}={}){
 if(!layout.zones.some(z=>z.id===from)||!layout.zones.some(z=>z.id===to))return null;
 const best=new Map([[from,{metres:0,segments:[]}]]),pending=new Set([from]);
 while(pending.size){
  const id=[...pending].sort((a,b)=>best.get(a).metres-best.get(b).metres||a.localeCompare(b))[0];pending.delete(id);
  const path=best.get(id);if(id===to)return {...path,zones:[from,...path.segments.map(s=>s.to)]};
  for(const edge of layout.edges){
   const next=edge.from===id?edge.to:edge.to===id&&!edge.oneWay?edge.from:null;
   if(!next||layout.zones.find(z=>z.id===next)?.accessible===false||!Number.isFinite(edge.metres)||edge.metres<=0||!edgeOpen(engine,document,edge))continue;
   const segment={...edge,from:id,to:next};if(!canCross(segment))continue;
   const metres=path.metres+edge.metres;
   if(metres>=(best.get(next)?.metres??Infinity))continue;
   best.set(next,{metres,segments:[...path.segments,segment]});pending.add(next);
  }
 }
 return null;
}
export function layoutView(engine,document){
 const layout=placeLayout(engine,document),current=zoneOf(engine,document,'player',layout);
 return {location:layout.location,current:current?.id,zones:layout.zones.filter(publicRow).map(z=>{
  const route=current&&localRoute(engine,document,current.id,z.id,{layout});
  const edge=layout.edges.find(e=>e.from===current?.id&&e.to===z.id||e.to===current?.id&&e.from===z.id);
  return {id:z.id,name:z.name,current:z.id===current?.id,direction:edge?.from===current?.id?edge.direction:edge?reverseDirection(edge.direction):'经邻接通道',metres:route?.metres??null,reachable:Boolean(route)};
 })};
}
function reverseDirection(direction){return ({东侧:'西侧',西侧:'东侧',南侧:'北侧',北侧:'南侧'})[direction]??'返回';}
// A zone arrival establishes location, never contact with every object there.
export function zoneContactPending(d,actor='player'){
 const location=actor==='player'?d.get('state','location'):d.get('state','npcs',actor,'location')??d.get('state','creatures',actor,'location');
 const row=d.get('state','records',actor==='player'?'local_player_position':`local_actor_position:${actor}`);
 return row?.location===location&&row.zoneOnly===true;
}
registerAdvanceHook('placeLayout',placeLayout);registerAdvanceHook('zoneOf',zoneOf);registerAdvanceHook('zoneContactPending',zoneContactPending);
