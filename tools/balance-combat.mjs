import {artifactPath} from './tmp-root.mjs';
// P3: test commands retain their reports under the selected run root.
import fs from 'node:fs/promises';
import {derivedStats,monsterStats,simulateFight,seededRandom}from'../server-plugin/combat.mjs';
import {loadWorld}from'./load-world.mjs';
export function balanceReport(rules,{trials=10000,seed=20261010}={}){
    const scenarios=[
        {id:'newcomer',name:'1级新人对1–3级野兽',level:1,profession:false,count:1,enemyLevels:[1,3],template:1,min:0.9,max:1},
        {id:'solo_monster',name:'10级战斗职业对10–15级怪兽',level:10,profession:true,count:1,enemyLevels:[10,15],template:2,min:0.45,max:0.55},
        {id:'team_monster',name:'三名10级角色对10–15级怪兽',level:10,profession:true,count:3,enemyLevels:[10,15],template:2,min:0.85,max:1},
        {id:'solo_boss',name:'30级战斗职业对一阶首领',level:30,profession:true,count:1,enemyLevels:[30,30],template:3,bossTier:1,min:0,max:0.15},
        {id:'team_boss',name:'五名30级角色对一阶首领',level:30,profession:true,count:5,enemyLevels:[30,30],template:3,bossTier:1,min:0.55,max:0.65},
        {id:'demigod',name:'199级角色对半神兽',level:199,profession:true,count:1,enemyLevels:[220,220],template:10,min:0,max:0.001},
    ];
    const results=scenarios.map((scenario,index)=>{
        const rng=seededRandom(seed+index*1000003),team=Array.from({length:scenario.count},()=>derivedStats({level:scenario.level,profession:scenario.profession},rules));
        let wins=0,rounds=0;const byLevel={};
        for(let i=0;i<trials;i++){
            const level=scenario.enemyLevels[0]+Math.floor(rng()*(scenario.enemyLevels[1]-scenario.enemyLevels[0]+1));
            const outcome=simulateFight(team,monsterStats({level,template:scenario.template,bossTier:scenario.bossTier??0},rules),rules,rng);
            wins+=Number(outcome.won);rounds+=outcome.rounds;
            byLevel[level]??={total:0,wins:0};byLevel[level].total++;byLevel[level].wins+=Number(outcome.won);
        }
        const winRate=wins/trials;return {...scenario,trials,wins,winRate,averageRounds:rounds/trials,byLevel,pass:winRate>=scenario.min&&winRate<=scenario.max};
    });
    return {date:'2026-10-10',scope:'使用与交锋引擎共用的属性推导、命中和伤害函数；完整装备/法术战术尚未纳入',seed,trials,pass:results.every(result=>result.pass),results};
}
if(process.argv[1]&&process.argv[1].endsWith('balance-combat.mjs')){
    const report=balanceReport((await loadWorld()).rules);
    await fs.mkdir(artifactPath('测试报告'),{recursive:true});
    await fs.writeFile(artifactPath('测试报告','阶段2战斗平衡.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));if(!report.pass)process.exitCode=1;
}
