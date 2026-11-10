// 只读计时诊断：复刻 tests/event-size.test.mjs 第一个长推进场景（新角色菜单“等待”），
// 把一次 180 天推进拆成若干段（默认 6 段 × 30 日），每段用 process.hrtime 计墙钟秒数，逐行打印 JSON。
// 末行打印推进后世界文档的确定性摘要（server-plugin/storage.mjs 的 digest），用于基线与候选比对。
// 用法：node tools/segment-timing.mjs [--segments 6] [--days-per-segment 30] [--dump 或 dump]
// --dump：另把推进后的世界文档写到仓库根 .out/segment-doc.json，并逐行打印顶层键与 state 二级键的 {path,digest}。
// 只写 stdout，不联网；playtest 服务与测试一样在系统临时目录建隔离会话目录并在结束时删除。
import {loadWorld} from './load-world.mjs';
import {createPlaytestServer} from './playtest-runner.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,digest} from '../server-plugin/storage.mjs';

const args=process.argv.slice(2);
const flag=(name,fallback)=>{const i=args.indexOf(name);if(i<0)return fallback;const v=Number(args[i+1]);if(!Number.isInteger(v)||v<1)throw new Error(`${name} 需要正整数`);return v;};
const dump=args.includes('--dump')||args.includes('dump'); // 门禁 run-script 不收以 - 开头的参数，云上用位置参数 dump
const segments=flag('--segments',6),daysPer=flag('--days-per-segment',30);

const world=await loadWorld();
const server=await createPlaytestServer({world,seed:'w8e10-event-size',consistencyEnabled:false});
try{
    const created=await server.api('create',{character:{name:'长候旅人'}}),id=created.reference.campaignId;
    const menu=await server.api('actions',{campaignId:id}),wait=menu.actions.find(a=>a.id==='core:time');
    if(!wait)throw new Error('菜单里没有 core:time');
    const seconds=t=>{const d=process.hrtime(t);return d[0]+d[1]/1e9;};
    const total=process.hrtime();
    for(let segment=1;segment<=segments;segment++){
        const t=process.hrtime();
        await server.api('execute',{campaignId:id,tool:'world_act',args:{action:wait.id,slots:{...wait.fill,minutes:daysPer*1440}},eventId:`seg${segment}`});
        console.log(JSON.stringify({segment,days:daysPer,seconds:seconds(t),cumulativeSeconds:seconds(total)}));
    }
    const document=(await server.api('read',{campaignId:id})).document;
    console.log(JSON.stringify({digest:digest(document),segments,daysPerSegment:daysPer,minute:document.state.minute}));
    if(dump){
        const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'.out');
        fs.mkdirSync(out,{recursive:true});
        fs.writeFileSync(path.join(out,'segment-doc.json'),canonical(document));
        for(const key of Object.keys(document).sort()){
            console.log(JSON.stringify({path:key,digest:digest(document[key])}));
            if(key==='state'&&document.state&&typeof document.state==='object')for(const sub of Object.keys(document.state).sort())console.log(JSON.stringify({path:`state.${sub}`,digest:digest(document.state[sub])}));
        }
    }
}finally{await server.close();}
