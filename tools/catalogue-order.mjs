import fs from 'node:fs';
import path from 'node:path';

// The formal world's catalogue order is its publication order. A batch merged
// back into an edition that already holds later publications (upgrade and
// isolated-publish fixtures rebuild such editions) returns to its formal slot;
// rows the formal catalogue does not know (a batch published for the first time,
// test fixtures) stay right after the row that precedes them in the input.
const ROOT=path.resolve(import.meta.dirname,'..','world');
const FILES={spells:'meta/spells.json',skills:'meta/skills.json',items:'meta/items.json',recipes:'meta/recipes.json'};
let indexes=null;
function index(key){
 if(!indexes){
  indexes=new Map();
  const read=file=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}};
  for(const [name,file] of Object.entries(FILES))indexes.set(name,new Map(read(file).map((r,i)=>[r.id,i])));
  for(const place of read('geo/locations.json')){
   if(Array.isArray(place.features))indexes.set(`features:${place.id}`,new Map(place.features.map((r,i)=>[r.id,i])));
   if(Array.isArray(place.workstations))indexes.set(`workstations:${place.id}`,new Map(place.workstations.map((r,i)=>[r.id,i])));
  }
 }
 return indexes.get(key);
}
export function formalOrder(key,rows){
 const order=index(key);if(!order)return rows;
 let last=-1;
 const keyed=rows.map((row,i)=>{const at=order.get(row.id);if(at!==undefined)last=at;return {row,i,at:at??last+0.5};});
 return keyed.sort((a,b)=>a.at-b.at||a.i-b.i).map(x=>x.row);
}
