// K6 legality is a consequence. A handler or primitive that finds an act
// lacking the owner's or the authority's licence notes the breach on its
// transaction instead of refusing; the composition root commits every noted
// breach as an offense (law.mjs registerOffense) once the act has been
// settled, under the act's own event id. The note is a row of the transaction
// itself, so it travels with the patches of nested drafts and a rolled-back
// act leaves nothing.
const PATH=['state','records','offense_pending'];
export function noteOffense(d,breach){
 const row=d.get(...PATH)??{category:'offense_pending',breaches:[]};
 const key=`${breach.act}:${breach.subject?.id??'-'}:${breach.victim??'-'}:${breach.actor??'player'}`;
 if(row.breaches.some(b=>b.key===key))return;
 d.set(PATH,{...row,breaches:[...row.breaches,structuredClone({...breach,key})]});
}
export function takeNotedOffenses(d){
 const row=d.get(...PATH);if(!row)return [];
 if(typeof d.remove==='function')d.remove(PATH);else d.set(PATH,undefined);
 return row.breaches.map(({key,...breach})=>breach);
}
// The thing acted on belongs to someone who did not licence this use: the
// use happens and is noted as a breach of their title. Returns null (no permit).
export function noteUnlicensedUse(d,row,{act='use',kind='feature',actor='player'}={}){
 if(typeof row?.owner==='string'&&row.owner!==actor)noteOffense(d,{act,victim:row.owner,subject:{id:row.id,kind},actor});
 return null;
}
