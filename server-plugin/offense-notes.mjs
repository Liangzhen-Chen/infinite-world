// K6 legality is a consequence. A handler or primitive that finds an act
// lacking the owner's or the authority's licence notes the breach on its
// transaction draft instead of refusing; the composition root commits every
// noted breach as an offense (law.mjs registerOffense) once the act has been
// settled, under the act's own event id. A rolled-back act leaves nothing.
const noted=new WeakMap();
export function noteOffense(d,breach){
 const list=noted.get(d)??[];
 const key=`${breach.act}:${breach.subject?.id??'-'}:${breach.victim??'-'}:${breach.actor??'player'}`;
 if(!list.some(b=>b.key===key))list.push({...breach,key});
 noted.set(d,list);
}
export function takeNotedOffenses(d){
 const list=noted.get(d)??[];noted.delete(d);
 return list.map(({key,...breach})=>breach);
}
// The thing acted on belongs to someone who did not licence this use: the
// use happens and is noted as a breach of their title. Returns null (no permit).
export function noteUnlicensedUse(d,row,{act='use',kind='feature',actor='player'}={}){
 if(typeof row?.owner==='string'&&row.owner!==actor)noteOffense(d,{act,victim:row.owner,subject:{id:row.id,kind},actor});
 return null;
}
