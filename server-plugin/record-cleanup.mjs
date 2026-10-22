// Append-only record families (one row per event) need a bound, or every
// long campaign carries all of them forever. pruneRecords drops rows that are
// no longer valid (`expired`) and keeps only the `max` newest of the rest;
// rows matching `exempt` (still in use) are never dropped or counted.
import {recordEntriesWhere} from './storage.mjs';
export function pruneRecords(d,category,{expired=()=>false,exempt=()=>false,max=Infinity}={}){
 const rows=recordEntriesWhere(typeof d.peek==='function'?d.peek('state','records'):d.get('state','records'),'category',category);
 const drop=[],kept=[];
 for(const [key,row] of rows){
  if(exempt(row))continue;
  if(expired(row))drop.push(key);else kept.push(key);
 }
 // Rows are in insertion order, so the oldest are at the front.
 if(kept.length>max)drop.push(...kept.slice(0,kept.length-max));
 for(const key of drop)d.remove(['state','records',key]);
 return drop.length;
}
// Contact evidence lives ten minutes; it is also capped in case a run of
// movements piles rows up inside one expiry window.
export function prunePhysicalContacts(d){
 const now=d.get('state','minute');
 return pruneRecords(d,'physical_contact',{expired:r=>r.expires<now,max:64});
}
