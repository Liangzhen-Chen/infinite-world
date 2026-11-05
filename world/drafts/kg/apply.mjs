// K5 draft publisher: writes world/drafts/kg/fixtures.json into world/geo/locations.json.
//   node world/drafts/kg/apply.mjs [repoRoot] [--drop-workstations]
// --drop-workstations also deletes the hand-written `workstations` lists. Use it only
// after every remaining reader of place.workstations reads placeWorkstations().
import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2),root=path.resolve(args.find(a=>!a.startsWith('--'))??path.join(import.meta.dirname,'..','..','..'));
const file=path.join(root,'world/geo/locations.json'),raw=fs.readFileSync(file,'utf8');
const locations=JSON.parse(raw),draft=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'fixtures.json'),'utf8')).locations;
const missing=Object.keys(draft).filter(id=>!locations.some(l=>l.id===id));
if(missing.length)throw Error(`草稿里的地点不存在：${missing.join('、')}`);
for(const place of locations){
 if(draft[place.id])place.fixtures=draft[place.id].fixtures;
 if(args.includes('--drop-workstations'))delete place.workstations;
}
fs.writeFileSync(file,JSON.stringify(locations,null,2)+(raw.endsWith('\n')?'\n':''));
console.log(`fixtures written to ${Object.keys(draft).length} locations`);
