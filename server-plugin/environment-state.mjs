// Shared physical environment view; mutations remain in environment.mjs.
import {aliveHoldings,locationOf} from './holdings.mjs';
import {physicalLocation} from './items.mjs';
const key=id=>`physical_feature:${id}`;
function point(d){const row=d.get('state','records','local_player_position');return row?.location===d.get('state','location')?row.point:[0,0];}
export function localPlayerPoint(d){return [...point(d)];}
// One read view per document so the holdings index (cached per view and
// invalidated by holdings.seq) is reused instead of rebuilt on every call.
const views=new WeakMap();
const documentView=document=>{let d=views.get(document);if(!d){d={get:(...p)=>p.reduce((v,k)=>v?.[k],document)};views.set(document,d);}return d;};
// Feature owners depend only on the holdings rows; documents produced by later
// patches usually share that rows object, so reuse the lookup across ticks.
const ownerCache=new WeakMap();
const featureOwners=(d,document,id)=>{
 const rows=document.holdings?.rows,seq=document.holdings?.seq??0;
 if(!rows||typeof rows!=='object')return aliveHoldings(d,{kind:'owns',subject:id});
 let cached=ownerCache.get(rows);
 if(!cached||cached.seq!==seq)ownerCache.set(rows,cached={seq,byId:new Map()});
 if(!cached.byId.has(id))cached.byId.set(id,aliveHoldings(d,{kind:'owns',subject:id}));
 return cached.byId.get(id);
};
export const environmentFeatures=(engine,document=engine.airDraft?.document??engine.physicalDocument)=>{
 const rows=engine.advanceFeatures??engine.world.locations.flatMap(place=>(place.features??[]).map(feature=>({...feature,location:place.id})));
 if(!document)return rows;
 const d=documentView(document);
 return rows.map(row=>{
  const state=document.state.records?.[key(row.id)],p=locationOf(d,row.id),carrier=p?.mode==='carried'?p.at:null;
  const location=p?physicalLocation(d,engine,row.id):state?.location??row.location;
  const owners=featureOwners(d,document,row.id),owner=owners.length===1?owners[0].holder:row.owner;
  const position=carrier==='player'?localPlayerPoint(d):state?.position??row.position;
  return {...row,location,owner,position};
 });
};
