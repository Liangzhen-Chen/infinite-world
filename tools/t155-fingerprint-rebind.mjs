// One-off: rebind t155 wildlife fingerprints after t-metab added nature.metabolism
// to monsters. Run on the cloud via the gate run-script:
//   node tools/t155-fingerprint-rebind.mjs      (cwd = repo root; local node runs are forbidden)
// Idempotent: records already rebound (stored fingerprint == new) are skipped.
import fs from 'node:fs/promises';
import {hashContent} from './content-pipeline.mjs';
import {contextFor,entries,draftRoot} from './t155-wildlife-content.mjs';
import {revision} from '../world/design/t155-village-wildlife.mjs';
const ids=['t155_hw_tower','t155_wt_soul','t155_wt_rites','t155_sb_corpse'];
const reason='物种代谢 t-metab 新增 nature.metabolism，规则派生字段，内容未变',source='李白 2026-11-09 15:1x';
// Old context = current context with nature.metabolism removed.
const strip=ctx=>({...ctx,references:ctx.references.map(r=>{if(!r.nature||!('metabolism' in r.nature))return r;const {metabolism,...nature}=r.nature;return {...r,nature};})});
// Field-level diff of two JSON values; returns differing paths.
const diff=(a,b,p='')=>{
 if(JSON.stringify(a)===JSON.stringify(b))return [];
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
  return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>diff(a[k],b[k],p?`${p}.${k}`:k));}
 return [p];
};
const plan=[];
for(const id of ids){
 const file=`${draftRoot}/${id}.json`,row=JSON.parse(await fs.readFile(file,'utf8')),entry=entries.find(e=>e.id===id);
 if(!entry)throw Error(`缺少条目 ${id}`);
 const context=contextFor(entry),oldContext=strip(context);
 const newFingerprint=hashContent({entry,context,revision}),oldHash=hashContent({entry,context:oldContext,revision});
 if(row.fingerprint===newFingerprint){console.log(`${id}: 已重绑，跳过`);continue;}
 if(row.fingerprint!==oldHash)throw Error(`${id}: 旧指纹无法由"仅去掉 nature.metabolism"的旧 context 复原，存在其他差异，已中止，未写入`);
 const fields=diff(oldContext,context);
 if(!fields.length||fields.some(f=>!f.endsWith('.nature.metabolism')&&!f.includes('.nature.metabolism.')))throw Error(`${id}: 差异含 metabolism 以外字段 ${JSON.stringify(fields)}，已中止，未写入`);
 plan.push({file,row,newFingerprint,fields});
}
// All checks passed for every record; only now write.
for(const {file,row,newFingerprint,fields} of plan){
 const rebind={reason,oldFingerprint:row.fingerprint,newFingerprint,diffFields:fields,date:'2026-11-09',source};
 row.fingerprintRebind=[...(Array.isArray(row.fingerprintRebind)?row.fingerprintRebind:row.fingerprintRebind?[row.fingerprintRebind]:[]),rebind];
 row.fingerprint=newFingerprint;
 await fs.writeFile(file,JSON.stringify(row,null,2)+'\n');
 console.log(`${row.id}: ${rebind.oldFingerprint.slice(0,8)} -> ${newFingerprint.slice(0,8)} [${fields.join(', ')}]`);
}
