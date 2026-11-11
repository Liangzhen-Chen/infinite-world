import path from 'node:path';
import {pathToFileURL} from 'node:url';
// a3-model-catalog 测试 5（tests/a3-model-catalog.test.mjs:93-105）在固定种子下 seen.target 为空的只读探针。
//   node tools/probe-a3-catalog-move.mjs
// 起试玩环境的方式与测试一致：createPlaytestServer（默认固定种子 PLAYTEST_SEED）、同一个脚本化 client、同一条 runPlaytest；
// 与测试不同的只有两点：先显式 /create（与 runPlaytest 内部同一调用）再以 session 传入，以便拿到 campaignId 读存档；断言换成打印。
// 只读：试玩服务器在系统临时目录建临时存档并在 127.0.0.1 监听回环端口，结束即删；不写仓库内任何文件，不联网。
// 打印：world_move 的完整返回（截断 2000 字）、移动后的 state.location / state.minute、严辙的 location / activity / scheduleTravel、
//       world_actions 返回里的 target 字段（没有则为 null）。
import {createPlaytestServer,runPlaytest,PLAYTEST_SEED} from './playtest-runner.mjs';
import {loadPromptBundle} from './build-card.mjs';
import {estimateModelActionTokens} from '../extension/tools.mjs';

async function main(){
 const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,consistencyClient:null});
 try{
  const initial=await server.api('create',{character:{name:'试玩者'}}),campaignId=initial.reference.campaignId;
  console.log(JSON.stringify({seed:PLAYTEST_SEED,randomSeed:initial.document.randomSeed,startLocation:initial.document.state.location,startMinute:initial.document.state.minute}));
  let turn=0;const report={};
  const client={async generate(body){
   if(turn++===0)return {choices:[{message:{tool_calls:[{id:'move-to-town',type:'function',function:{name:'world_move',arguments:JSON.stringify({destination:'loc_bs'})}}]}}]};
   if(turn===2){
    report.worldMove=body.messages.findLast(row=>row.role==='tool').content;
    const view=await server.api('read',{campaignId}),state=view.document.state,npc=state.npcs?.npc_hw_yanzhe;
    report.after={location:state.location,minute:state.minute,minuteOfDay:state.minute%1440,yanzhe:{location:npc?.location??null,activity:npc?.activity??null,scheduleTravel:npc?.scheduleTravel??null,cognitionTravel:npc?.cognitionTravel??null,status:npc?.status??null}};
    return {choices:[{message:{tool_calls:[{id:'look-at-seller',type:'function',function:{name:'world_actions',arguments:JSON.stringify({target:'npc_hw_yanzhe'})}}]}}]};
   }
   const seen=JSON.parse(body.messages.findLast(row=>row.role==='tool').content);
   report.worldActionsTarget=seen.target??null;report.worldActionsKeys=Object.keys(seen);report.worldActionsLocation=seen.location??null;
   return {choices:[{message:{content:'探针结束。'}}]};
  }};
  const result=await runPlaytest({scenario:{id:'a3cp-probe',turns:[{input:'前往白石镇查看严辙，不购买。',assertions:[]}]},api:server.api,client,bundle:await loadPromptBundle(),countTokens:estimateModelActionTokens,historyWindow:{contextTokens:32000},session:{campaignId}});
  console.log('world_move 返回（截断2000字）：'+String(report.worldMove??'').slice(0,2000));
  console.log(JSON.stringify({after:report.after,worldActionsTarget:report.worldActionsTarget,worldActionsKeys:report.worldActionsKeys,worldActionsLocation:report.worldActionsLocation,turnErrors:result.turns[0].errors},null,1));
 }finally{await server.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.log(`FAILED: ${error?.message??error}\n${error?.stack??''}`);process.exitCode=1;});
