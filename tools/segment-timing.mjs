// 只读计时诊断：复刻 tests/event-size.test.mjs 第一个长推进场景（新角色菜单“等待”），
// 把一次 180 天推进拆成若干段（默认 6 段 × 30 日），每段用 process.hrtime 计墙钟秒数，逐行打印 JSON。
// 末行打印推进后世界文档的确定性摘要（server-plugin/storage.mjs 的 digest），用于基线与候选比对。
// 用法：node tools/segment-timing.mjs [--segments 6] [--days-per-segment 30]
// 只写 stdout，不联网；playtest 服务与测试一样在系统临时目录建隔离会话目录并在结束时删除。
import {loadWorld} from './load-world.mjs';
import {createPlaytestServer} from './playtest-runner.mjs';
import {digest} from '../server-plugin/storage.mjs';

const args=process.argv.slice(2);
const flag=(name,fallback)=>{const i=args.indexOf(name);if(i<0)return fallback;const v=Number(args[i+1]);if(!Number.isInteger(v)||v<1)throw new Error(`${name} 需要正整数`);return v;};
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
}finally{await server.close();}
