// L1: packages declare endpoints' routes; the protocol implements the routes.
import fs from 'node:fs';

const kinds=new Map();
export const DEBTOR_GONE=['accelerate','assume_by_heirs','substitute_performance','void','pursue'];
export const CREDITOR_GONE=['estate','heirs','void'];
export function registerObligationKind(spec){
 if(!spec?.id||!DEBTOR_GONE.includes(spec.onDebtorGone)||!CREDITOR_GONE.includes(spec.onCreditorGone))throw Error(`Invalid obligation routes: ${spec?.id}`);
 if(kinds.has(spec.id))throw Error(`Duplicate obligation kind: ${spec.id}`);
 kinds.set(spec.id,freeze(structuredClone(spec)));
}
function freeze(value){if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
for(const spec of JSON.parse(fs.readFileSync(new URL('../world/ontology/obligations.json',import.meta.url),'utf8')).entries)registerObligationKind(spec);
export const obligationKinds=()=>[...kinds.values()];
export function obligationKind(row){
 const id=row.obligationKind??row.kind??(row.category==='debt'?'compensation':row.reservationVersion===1?'promise':row.deliveryVersion===1?'delivery':row.type??null);
 const spec=kinds.get(id)??[...kinds.values()].find(k=>k.aliases?.includes(id));
 if(!spec)throw Error(`Undeclared obligation kind: ${id}`);
 return spec;
}
// A signed instance retains the agreed routes even if package defaults change.
export function snapshotObligationTerms(row){
 const spec=obligationKind(row);
 const fields=['actedAs','inName','calendar','days','grace','exclusive','bearer','requiresInstrument','counterpart','deferredPrice','autoSettle','limitation','accrual'];
 const signed=Object.fromEntries(fields.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
 return {...row,terms:structuredClone({onDebtorGone:row.onDebtorGone??spec.onDebtorGone,onCreditorGone:row.onCreditorGone??spec.onCreditorGone,...signed,...row.terms})};
}
export function obligationGoneRoute(row,side,civil={}){
 const field=side==='debtor'?'onDebtorGone':'onCreditorGone';
 const spec=obligationKind(row),route=civil[field]?.[spec.id]??row.clauses?.[field]??row.terms?.[field]??row[field]??spec[field];
 if(!(side==='debtor'?DEBTOR_GONE:CREDITOR_GONE).includes(route))throw Error(`Unknown ${side} gone route: ${route}`);
 return route;
}
