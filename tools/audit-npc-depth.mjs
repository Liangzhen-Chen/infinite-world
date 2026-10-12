import {loadWorld} from './load-world.mjs';
import {validateNpcDepth,legacyTraitsAuditIds,legacyTraitsExpected} from './npc-profile-validation.mjs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

export function auditNpcDepth(world) {
 const result=validateNpcDepth(world);
 const traits=legacyTraitsAuditIds.map(id=>{
  const npc=(world.npcs??[]).find(n=>n.id===id);
  const issues=result.issues.filter(row=>row.id===id && row.code==='traits-placeholder');
  const retained=JSON.stringify(npc?.traits)===JSON.stringify(legacyTraitsExpected[id]);
  return {id,field:'traits',ok:!!npc && npc.tier==='full' && !issues.length && retained,reason:!npc?'旧人物缺失':npc.tier!=='full'?'旧人物不再是完整档':issues.length?issues.map(x=>x.reason).join('；'):!retained?'与1bc8f3b的已审核修复不同，需核查后续审核证据':'1bc8f3b修复的性格特征已保留，无占位',traits:npc?.traits??[]};
 });
 return {...result,legacyTraits:{source:'1bc8f3b',checked:traits.length,ok:traits.every(x=>x.ok),rows:traits}};
}

export async function runAudit({root=path.resolve('world'),json=false,write=console.log}={}) {
 const report=auditNpcDepth(await loadWorld(root));
 if(json)write(JSON.stringify(report,null,2));
 else {
  write(`完整档审计：${report.checked}人，${report.issues.length}项缺口；正式release/final已接入全体完整档门槛。`);
  for(const row of report.issues)write(`${row.id}\t${row.field}\t${row.code}\t${row.reason}`);
  write(`旧17人traits回归：来源${report.legacyTraits.source}，${report.legacyTraits.ok?'通过':'存在缺口'}；仅核验，无内容改写。`);
  for(const row of report.legacyTraits.rows)write(`${row.id}\t${row.field}\t${row.ok?'OK':'FAIL'}\t${row.reason}`);
 }
 return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
 const args=process.argv.slice(2);
 if(args.includes('--help'))console.log('node tools/audit-npc-depth.mjs [--root world目录] [--json]\n只读审计。缺口输出id/field/code/reason；存在缺口返回1。');
 else {
  const index=args.indexOf('--root');
  if(args.some((arg,i)=>arg!=='--json'&&arg!=='--root'&&!(index>=0&&i===index+1))||index>=0&&!args[index+1])throw Error('未知参数或--root缺少目录');
  const report=await runAudit({root:index>=0?path.resolve(args[index+1]):undefined,json:args.includes('--json')});
  if(!report.ok||!report.legacyTraits.ok)process.exitCode=1;
 }
}
