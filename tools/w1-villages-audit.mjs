import fs from 'node:fs/promises';
import {hashContent,rowFingerprintShape} from './content-pipeline.mjs';
const root='world/drafts/w1/villages',read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const village=process.argv[process.argv.indexOf('--village')+1],selected=['yp','wt','lq','sb'].includes(village)?[village]:['yp','wt','lq','sb'];
const all=[];for(const v of selected)for(const kind of ['npcs','residents','locations']){let summary;try{summary=await read(`${root}/${v}/${kind}/summary.json`);}catch(e){if(e.code==='ENOENT'){all.push({v,kind,status:'not-yet-summarized'});continue;}throw e;}
 for(const batch of summary.batches){const records=await Promise.all(batch.ids.map(id=>read(`${root}/${v}/${kind}/${id}.json`))),fingerprint=hashContent(records.map(rowFingerprintShape));if(fingerprint!==batch.fingerprint)throw Error(`${v}/${kind}/${batch.index}指纹变化，先刷新批次`);const required=new Set([...batch.flagged,...batch.sample,...records.filter(r=>r.status!=='passed').map(r=>r.id)]);all.push({v,kind,batch:batch.index,sample:batch.sample,flagged:batch.flagged,passed:records.filter(r=>r.status==='passed').length,total:records.length,read:records.filter(r=>required.has(r.id)).map(r=>({id:r.id,status:r.status,attempts:r.attempts,errors:r.errors,warnings:r.warnings,review:r.review,draft:r.draft}))});}
}
console.log(JSON.stringify(all,null,2));
