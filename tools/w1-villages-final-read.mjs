import fs from 'node:fs/promises';
import {hashContent} from './content-pipeline.mjs';
const root='world/drafts/w1/villages',read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const [v,kind,limit='8']=process.argv.slice(2);
if(!['yp','wt','lq','sb'].includes(v)||!['npcs','residents','locations'].includes(kind))throw Error('指定村及类别');
const snapshot=await read(`${root}/l4-read-hashes.json`),directory=`${root}/${v}/${kind}`,summary=await read(`${directory}/summary.json`);
const ids=[...new Set(summary.batches.flatMap(b=>[...b.sample,...b.flagged,...b.manual]))];
let shown=0,remaining=0;
for(const id of ids){const row=await read(`${directory}/${id}.json`),draftHash=hashContent(row.draft),reviewHash=hashContent(row.review);if(snapshot[id]?.draftHash===draftHash&&snapshot[id]?.reviewHash===reviewHash)continue;if(shown>=Number(limit)){remaining++;continue;}shown++;console.log(JSON.stringify({id,status:row.status,draft:row.draft,review:row.review}));snapshot[id]={draftHash,reviewHash};}
await fs.writeFile(`${root}/l4-read-hashes.json`,JSON.stringify(snapshot,null,2)+'\n');
console.log(JSON.stringify({shown,remaining}));
