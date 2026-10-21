// T142 publication: 九省纲要。Reads the L1/L2/L4-approved drafts and writes the
// region outline, far nodes, trunk roads, cultures, factions and their rosters
// into world/ only with --publish. Existing rows are never rewritten.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';

export {FILES,mergeT142,withoutT142,batchIds} from './t142-merge.mjs';
import {FILES,mergeT142,same} from './t142-merge.mjs';

async function writeLike(target,value){
 let old='[\n]\n';try{old=await fs.readFile(target,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 const crlf=old.includes('\r\n'),plain=crlf?old.replace(/\r\n/g,'\n'):old,pretty=/^[\[{]\n/.test(plain),trailing=plain.endsWith('\n');
 let text=JSON.stringify(value,null,pretty?2:undefined)+(trailing?'\n':'');if(crlf)text=text.replace(/\n/g,'\r\n');
 const temp=`${target}.${randomUUID()}.tmp`,handle=await fs.open(temp,'wx');try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}await fs.rename(temp,target);
}
export async function publishT142({root=path.resolve('world'),publish=false,batch,restoreLocationIds=[]}={}){
 if(!batch){const {readT142Publication}=await import('./t142-provinces-content.mjs');batch=await readT142Publication();}
 const world=await loadWorld(root),restored=structuredClone(world);
 for(const id of restoreLocationIds){
  const approved=batch.locations.find(l=>l.id===id),current=world.locations.find(l=>l.id===id);
  if(!approved||!current)throw Error(`未登记的已审批地点：${id}`);
  // Only remove the duplicate governance citation added by A3. Facts, owners,
  // inventories and all other post-publication changes retain strict checking.
  const {authoredFacts,...facts}=current;
  if(!same(facts,approved))throw Error(`正式地点事实已改变：${id}`);
  restored.locations=restored.locations.map(l=>l.id===id?structuredClone(approved):l);
 }
 const next=mergeT142(restored,batch),validation=validateWorld(next,{stage:'release'});
 if(!validation.ok)throw Error(validation.errors.join('\n'));
 const changed=FILES.filter(([,key])=>!same(world[key]??[],next[key])).map(([file])=>file);
 if(publish)for(const [file,key] of FILES)if(changed.includes(file)){
  // A targeted restoration must not persist unrelated loadWorld projections.
  const value=key==='locations'&&restoreLocationIds.length?JSON.parse(await fs.readFile(path.join(root,file),'utf8')).map(l=>restoreLocationIds.includes(l.id)?next.locations.find(n=>n.id===l.id):l):next[key];
  await writeLike(path.join(root,file),value);
 }
 return{published:publish,changed,batch:Object.fromEntries(FILES.map(([,key])=>[key,batch[key].map(r=>r.id)])),validation:{ok:validation.ok,errors:validation.errors}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const at=process.argv.indexOf('--restore-location');
 const result=await publishT142({publish:process.argv.includes('--publish'),restoreLocationIds:at<0?[]:[process.argv[at+1]]});console.log(JSON.stringify({published:result.published,changed:result.changed,ok:result.validation.ok}));
}
