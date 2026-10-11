import fs from 'node:fs/promises';
import {hashContent} from './content-pipeline.mjs';
const root='world/drafts/w1/villages',v=process.argv[2],part=Number(process.argv[3]??0),read=async f=>JSON.parse(await fs.readFile(f,'utf8'));if(!['yp','wt','lq','sb'].includes(v))throw Error('指定一个村');
const selected=[];let snapshot={};try{snapshot=await read(`${root}/l4-read-hashes.json`);}catch(e){if(e.code!=='ENOENT')throw e;}
for(const kind of ['npcs','residents','locations']){if(part<2&&kind!=='npcs'||part===2&&kind==='npcs')continue;const d=`${root}/${v}/${kind}`,summary=await read(`${d}/summary.json`);for(const b of summary.batches){const ids=kind==='npcs'?b.ids.slice(part*15,part*15+15):[...new Set([...b.sample,...b.flagged,...b.manual])];for(const id of ids){const r=await read(`${d}/${id}.json`);snapshot[id]={draftHash:hashContent(r.draft),reviewHash:hashContent(r.review)};selected.push({id,status:r.status,hard:r.review?.contradictions?.filter(c=>c.severity==='hard'),draft:r.draft});}}}
await fs.writeFile(`${root}/l4-read-hashes.json`,JSON.stringify(snapshot,null,2)+'\n');for(const row of selected)console.log(JSON.stringify(row));
