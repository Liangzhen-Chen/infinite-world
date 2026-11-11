// K5 draft publisher: writes the fixtures of world/drafts/kg/fixtures.json into the
// mechanics annotations world/meta/mechanics/locations.json ({place:{fixtures}}).
//   node world/drafts/kg/apply.mjs [repoRoot]
// Reviewed place rows in world/geo/locations.json are not touched (A1): their
// hand-written `workstations` stay as approved, and the runtime world derives
// stations from the fixtures (server-plugin/runtime-world, workstation-services).
import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2),root=path.resolve(args.find(a=>!a.startsWith('--'))??path.join(import.meta.dirname,'..','..','..'));
const locations=JSON.parse(fs.readFileSync(path.join(root,'world/geo/locations.json'),'utf8'));
const draft=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'fixtures.json'),'utf8')).locations;
const missing=Object.keys(draft).filter(id=>!locations.some(l=>l.id===id));
if(missing.length)throw Error(`草稿里的地点不存在：${missing.join('、')}`);
const file=path.join(root,'world/meta/mechanics/locations.json');
const overlay=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
for(const place of locations)if(draft[place.id])overlay[place.id]={...overlay[place.id],fixtures:draft[place.id].fixtures};
fs.mkdirSync(path.dirname(file),{recursive:true});
fs.writeFileSync(file,JSON.stringify(overlay,null,1)+'\n');
console.log(`fixtures written to ${Object.keys(draft).length} locations`);
