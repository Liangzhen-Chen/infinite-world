// Pure queries. A state-only caller reads the protocol's compatibility mirror;
// pass a document/draft when the canonical holdings partition is available.
const documentOf=source=>source?.document??source;
export function lifecycleState(engine,source,id){
 const doc=documentOf(source),state=doc?.state??doc??{};
 const actor=id==='player'?state.player:state.npcs?.[id]??state.creatures?.[id]??state.created?.[id]??state.family?.people?.[id]??engine?.byId?.get(id);
 const entity=doc?.holdings?.entities?.[id];
 const protocol=doc?.holdings?.protocol?.entities?.[id]??state.records?.[`transition:${id}`];
 const generation=actor?.incarnation??protocol?.generation??0;
 const current=protocol&&((protocol.generation??0)===generation||protocol.gone===false&&protocol.restoredAt!==undefined&&(protocol.generation??0)+1===generation)?protocol:null;
 const exists=!!(actor||entity||current);
 // A restoration is authoritative even if an old status mirror is stale.
 const gone=current?current.gone===true:entity?.goneAt!==undefined||actor?.status==='死亡'||actor?.diedAt!==undefined;
 const dead=current?(current.gone===true&&(current.basis==='death'||current.actualDeath!==undefined)):
  actor?.status==='死亡'||actor?.diedAt!==undefined;
 return {exists,generation,gone:exists&&gone,dead:exists&&dead,living:exists&&!dead,
  effective:exists&&!gone,basis:current?.basis??entity?.basis??null,restored:current?.gone===false&&current.restoredAt!==undefined};
}
export const isGone=(engine,source,id)=>lifecycleState(engine,source,id).gone;
export const isPhysicallyDead=(engine,source,id)=>lifecycleState(engine,source,id).dead;
export const isLiving=(engine,source,id)=>lifecycleState(engine,source,id).living;
export const isEffective=(engine,source,id)=>lifecycleState(engine,source,id).effective;
// Subjective consumers must pass only their permitted projection, never a world
// document. Unknown facts stay unknown; this does not grant consent or capacity.
export const projectionLiving=self=>!!self&&self.status!=='死亡'&&self.diedAt===undefined;
