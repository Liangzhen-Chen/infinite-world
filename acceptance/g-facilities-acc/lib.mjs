// 驱动层：只经引擎公开入口（createCharacter / reduce / applyPatches）与工具面（world_act、world_move、world_learn、world_craft、world_trade、world_promise、world_time）。
// 观察只读存档文档（state、ledger、holdings）与 tests/helpers 的账本守恒辅助，不调规律层内部函数，不读 server-plugin 的规律实现。
import fs from 'node:fs/promises';
const norm=p=>p.split(String.fromCharCode(92)).join('/').replace(/[/]$/,'');
// 被验收的仓库：ACC_REPO（默认基线 S5FIX 工作树）。
export const REPO=norm(process.env.ACC_REPO??'F:/dnd-wt/S5FIX');
export const OUTDIR='F:/dnd-tmp/g-facilities-acc';
const QUIET=new Set(['emit','time']);
// 一个"仓库环境"：用该仓库自己的引擎代码与世界数据（变异副本与被验收仓库各一份）。
export async function makeEnv(repo=REPO){
  repo=norm(repo);const R=`file:///${repo}/`;
  const cwd=process.cwd();process.chdir(repo);
  const {loadWorld}=await import(R+'tools/load-world.mjs');
  const {WorldEngine}=await import(R+'server-plugin/engine.mjs');
  const {applyPatches}=await import(R+'server-plugin/storage.mjs');
  const {auditLedger}=await import(R+'server-plugin/ledger.mjs');
  const {conservation}=await import(R+'tests/helpers/ledger-audit.mjs');
  const world=await loadWorld(`${repo}/world`);
  const seed=JSON.parse(await fs.readFile(`${repo}/tests/fixtures/legacy/seed.json`,'utf8'));
  process.chdir(cwd);
  let counter=0;
  const env={repo,world,applyPatches,auditLedger,conservation};
  env.newGame=(id='g')=>{const engine=new WorldEngine(structuredClone(world));return {env,engine,doc:engine.createCharacter(seed,{},id),id,log:[]};};
  // 一次真实调用。commit=false 时只读结果不落盘。
  env.call=async(ctx,tool,args,{commit=true}={})=>{
    const eventId=`${ctx.id}-${++counter}`,input={tool,args,eventId};
    let out;
    try{out=await ctx.engine.reduce(ctx.doc,input);}
    catch(e){return {status:'rejected',reason:String(e?.message??e),code:e?.code??'THROW',applied:[],input};}
    const result=out.result??{},receipt=result.receipt??out.receipt??{};
    const rejected=receipt.status==='rejected'||(result.ok===false&&!out.patches?.length);
    const missing=(receipt.missing??[]).filter(m=>m&&m!==receipt.reason);
    const reason=receipt.reason??result.reason??null;
    const res={status:rejected?'rejected':'committed',reason:reason&&[reason,...missing].join(' ／ '),code:receipt.code??null,routed:receipt.routed??null,
      applied:(receipt.applied??[]).map(a=>a.op).filter(op=>op&&!QUIET.has(op)),result,patches:out.patches?.length??0,input};
    if(commit&&out.patches?.length){res.before=ctx.doc;ctx.doc=applyPatches(ctx.doc,out.patches);}
    ctx.log.push({tool,args,status:res.status,reason:res.reason});
    return res;
  };
  env.act=(ctx,action,slots={},o)=>env.call(ctx,'world_act',{action,slots},o);
  return env;
}
export const say=r=>r?`${r.status}${r.reason?'：'+r.reason:''}`:'无';
export const inv=(doc,i)=>{const v=doc.state.inventory?.[i];return typeof v==='number'?v:(v?.quantity??0);};
export const npcInv=(n,i)=>{const v=n.inventory?.[i];return typeof v==='number'?v:(v?.quantity??0);};
export const holdingsOf=(doc,f={})=>Object.values(doc.holdings?.rows??{}).filter(r=>r.until===undefined&&Object.entries(f).every(([k,v])=>r[k]===v));
// "那是别人的 / 主人拒绝 / 须经同意 / 须付费或立约"一类的访问拒绝（与"此处没有该工位"相区别）。
export const ACCESS=/他人|别人|旁人|不属于你|不是你的|并非你|物主|主人|所有权|所有人|无权|没有.{0,8}(权|许可|依据|资格)|使用许可|须经.{0,8}同意|未经.{0,8}同意|未得.{0,6}同意|需要对方答应|不同意|拒绝|不肯|不愿|不借|不租|私宅|住户|居住者|许可|授权|须.{0,6}(付|租|借)|租用|借用/;
export const OFFTOPIC=/不支持|不能产生这种效果|现有手段不能完成|没有已登记|未登记|不在你能确认/;
