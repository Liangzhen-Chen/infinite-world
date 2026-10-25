// Shared physical environment view; mutations remain in environment.mjs.
import {aliveHoldings,locationOf} from './holdings.mjs';
import {physicalLocation} from './items.mjs';
const key=id=>`physical_feature:${id}`;
// A feature record belongs to its row by id; a carried container's record keeps the place it was
// filled, so only fixed features must also match location (their place comes from holdings).
export function featureRecordMatches(d,record,row){
 if(record.category!=='physical_feature'||record.id!==row.id)return false;
 const carriedContainer=row.containerItem&&d.get('state','itemInstances',row.id,'item')===row.containerItem;
 return carriedContainer||record.location===row.location;
}
function point(d){const row=d.get('state','records','local_player_position');return row?.location===d.get('state','location')?row.point:[0,0];}
export function localPlayerPoint(d){return [...point(d)];}
// One read view per document so the holdings index (cached per view and
// invalidated by holdings.seq) is reused instead of rebuilt on every call.
const views=new WeakMap();
const documentView=document=>{let d=views.get(document);if(!d){d={get:(...p)=>p.reduce((v,k)=>v?.[k],document)};views.set(document,d);}return d;};
// Feature owners depend only on the holdings rows; documents produced by later
// patches usually share that rows object, so reuse the lookup across ticks.
const ownerCache=new WeakMap();
const featureOwners=(d,id)=>{
 const rows=typeof d.peek==='function'?d.peek('holdings','rows'):d.get('holdings','rows');
 const seq=(typeof d.peek==='function'?d.peek('holdings','seq'):d.get('holdings','seq'))??0;
 if(!rows||typeof rows!=='object')return aliveHoldings(d,{kind:'owns',subject:id});
 let cached=ownerCache.get(rows);
 if(!cached||cached.seq!==seq)ownerCache.set(rows,cached={seq,byId:new Map()});
 if(!cached.byId.has(id))cached.byId.set(id,aliveHoldings(d,{kind:'owns',subject:id}));
 return cached.byId.get(id);
};
// A perception pass is synchronous and read-only. Share its resolved features
// across observers, then discard them before any draft write can occur.
const readScopes=new WeakMap();
// A cursor may mutate its own copies without changing root identity. Its
// in-memory revision bounds this view to exactly one document version.
const advanceViews=new WeakMap();
function resolvedFeatures(view,select){
 const rows=[];
 for(let i=0;i<view.catalog.length;i++)if(!select||select(view.catalog[i]))rows.push(view.resolve(i));
 return rows;
}
export function withEnvironmentFeatures(engine,read){
 if(readScopes.has(engine))return read();
 readScopes.set(engine,new Map());
 try{return read();}finally{readScopes.delete(engine);}
}
// Select by catalog fields / registered IDs before resolving live placement and
// ownership. A live advance uses cursor revisions; explicit document callers
// continue to share only inside a synchronous read-only scope.
export const environmentFeatures=(engine,document,select)=>{
 const cursor=document===undefined&&engine.advanceFeatures?engine.airDraft?.cursor:null;
 let scope=readScopes.get(engine);
 if(!scope&&Number.isSafeInteger(cursor?.revision)){
  let live=advanceViews.get(cursor);
  if(!live||live.revision!==cursor.revision||live.engine!==engine||live.authored!==engine.advanceFeatures){
   live={revision:cursor.revision,engine,authored:engine.advanceFeatures,scope:new Map()};advanceViews.set(cursor,live);
  }
  scope=live.scope;
 }
 const cacheKey=document,cached=scope?.get(cacheKey);
 if(cached&&cached.cursor===cursor&&cached.revision===cursor?.revision&&cached.authored===engine.advanceFeatures)return resolvedFeatures(cached,select);
 const authored=engine.advanceFeatures??engine.world.locations.flatMap(place=>(place.features??[]).map(feature=>({...feature,location:place.id})));
 const saved=document??engine.physicalDocument;
 const readSaved=(...path)=>saved?path.reduce((v,k)=>v?.[k],saved):engine.airDraft?.get(...path);
 const containers=[];
 for(const unit of Object.values(readSaved('state','itemInstances')??{})){
  const r=readSaved('state','records',key(unit.id));
  if(r?.category==='physical_feature'&&r.containerItem&&unit.status!=='已消耗')containers.push({...r,owner:unit.owner??r.owner,kind:'container',access:'consent'});
 }
 const catalog=[...authored,...containers];
 const rows=select?catalog.filter(select):catalog;
 // Empty processes must not expose the draft root: doing so makes its next
 // write copy the root/state/records again even though no feature was read.
 if(!rows.length)return rows;
 // A draft can read the individual records without exposing its entire root.
 // get() still protects the particular record/position returned to the caller.
 let d;
 if(document===undefined&&engine.airDraft)d=engine.airDraft;
 else{
  if(document===undefined)document=engine.physicalDocument;
  if(!document)return rows;
  d=documentView(document);
 }
 const resolve=row=>{
  const state=d.get('state','records',key(row.id)),p=locationOf(d,row.id),carrier=p?.mode==='carried'?p.at:null;
  const location=p?physicalLocation(d,engine,row.id):state?.location??row.location;
  const owners=featureOwners(d,row.id),owner=owners.length===1?owners[0].holder:row.owner;
  const position=carrier==='player'?localPlayerPoint(d):state?.position??row.position;
  return {...row,location,owner,position};
 };
 if(scope){
  const resolved=new Map(),view={catalog,resolve:i=>{
   if(!resolved.has(i))resolved.set(i,resolve(catalog[i]));
   return resolved.get(i);
  }};
  scope.set(cacheKey,{...view,cursor,revision:cursor?.revision,authored:engine.advanceFeatures});
  return resolvedFeatures(view,select);
 }
 return rows.map(resolve);
};
