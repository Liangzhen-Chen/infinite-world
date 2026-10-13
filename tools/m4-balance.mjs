import fs from'node:fs/promises';
import{derivedStats,monsterStats,strike,seededRandom}from'../server-plugin/combat.mjs';
import{magicStatusStats,withMagicStats,consumeTransientMagic}from'../server-plugin/magic-status.mjs';
import{templateBossCounter,applyBossCounterAbility}from'../server-plugin/boss-abilities.mjs';
import{consumeMagicProtection,applyProtectionPrimitive}from'../server-plugin/magic-primitives.mjs';
import{batch2BossCandidates}from'../world/design/m4-batch2-candidates.mjs';
import{bossFoundation}from'../world/design/boss-foundation.mjs';
import{loadWorld}from'./load-world.mjs';
export function simulateM4Fight(team,boss,opponent,rules,rng,{shield=0}={}){
 const party=team.map((stats,i)=>({...stats,hp:stats.maxHp,effects:{},key:i})),enemy={...opponent,hp:opponent.maxHp,boss:boss.id,location:boss.lair,battleMemory:{tactics:{}}};
 const state={minute:0,location:boss.lair,effects:{},records:{},creatures:{[boss.id]:enemy},player:party[0]};
 const d={get:(...p)=>p.reduce((v,k)=>v?.[k],{state}),set(p,v){let o={state};for(const k of p.slice(0,-1))o=o[k]??={};o[p.at(-1)]=v;},remove(p){let o={state};for(const k of p.slice(0,-1))o=o[k];delete o[p.at(-1)];}};
 const engine={rules,byId:new Map([[boss.id,boss]])},context={eyesClosed:false,illumination:'lit',raining:false,moving:false};
 const select=m=>{state.player=m;state.effects=m.effects;};
 if(shield)for(const member of party){select(member);applyProtectionPrimitive(d,{target:'player',spec:{kind:'protection',power:shield,damageTypes:['physical'],stacking:'strongest'},spell:'balance-fixture',duration:30},'shield');}
 const first=rng()<.5;
 const partyTurn=round=>{for(const m of party)if(m.hp>0&&enemy.hp>0){select(m);const counter=templateBossCounter(d,boss,enemy,'unarmed',context);const s=withMagicStats(m,magicStatusStats(d,'player',context));const hit=strike(s,enemy,rng,rules,{damageMultiplier:counter.damageMultiplier});consumeTransientMagic(d,'player',context);enemy.hp=Math.max(0,enemy.hp-hit.damage);enemy.battleMemory.tactics.unarmed=(enemy.battleMemory.tactics.unarmed??0)+1;}};
 const enemyTurn=round=>{for(let i=0;i<enemy.attacks&&enemy.hp>0;i++){
  const live=party.filter(m=>m.hp>0);if(!live.length)break;const m=live[Math.floor(rng()*live.length)];select(m);
  const defender=withMagicStats(m,magicStatusStats(d,'player',context)),hit=strike(enemy,defender,rng,rules);
  const ability=applyBossCounterAbility(d,engine,boss.id,{eventId:`r${round}`,attackIndex:i,hit:hit.hit,defense:defender.defense,remainingHp:enemy.hp});
  const damage=consumeMagicProtection(d,'player',ability?.damage??hit.damage,ability?.damageType??'physical').damage;m.hp=Math.max(0,m.hp-damage);
 }};
 for(let round=1;round<=rules.combat.simulationRoundLimit;round++){
  state.minute=Math.floor((round-1)*rules.combat.exchangeSeconds/60);
  if(first){partyTurn(round);enemyTurn(round);}else{enemyTurn(round);partyTurn(round);}
  if(enemy.hp<=0)return{won:true,rounds:round};if(party.every(m=>m.hp<=0))return{won:false,rounds:round};
 }
 return{won:false,rounds:rules.combat.simulationRoundLimit};
}
export function m4BalanceReport(world,{trials=10000,seeds=[20261010,20330615,409033],catalog}={}){
 const rules=catalog?world.rules:{...world.rules,bossEcology:bossFoundation().rules},results=[];
 for(const seed of seeds)for(const[b,boss]of (catalog??batch2BossCandidates()).entries())for(const mode of['reference_solo','reference_team','actual_solo','actual_team','shield_team']){
  const reference=mode.startsWith('reference')||mode==='shield_team',count=mode.endsWith('solo')?1:5,level=reference?30:boss.level;
  const species=world.monsters.find(m=>m.id===boss.monster),enemy=monsterStats({level,template:reference?3:species.template,bossTier:reference?1:boss.tier},rules),team=Array.from({length:count},()=>derivedStats({level,profession:true},rules));
  const rng=seededRandom(seed+b*1000003+['reference_solo','reference_team','actual_solo','actual_team','shield_team'].indexOf(mode)*991);let wins=0;
  for(let i=0;i<trials;i++)wins+=Number(simulateM4Fight(team,boss,enemy,rules,rng,{shield:mode==='shield_team'?10:0}).won);
  const rate=wins/trials,pass=mode==='reference_solo'?rate<=.15:mode==='reference_team'?rate>=.55&&rate<=.65:null;
  results.push({boss:boss.id,seed,mode,trials,wins,winRate:rate,pass});
 }
 return{scope:'共用首领能力、适应、状态与防护原语；reference沿指南30级一阶标尺，actual为各具名首领同级诊断，shield额外模拟10点有限防护。actual/shield无指南数值验收阈值，不冒充通过。',pass:results.filter(r=>r.pass!==null).every(r=>r.pass),results};
}
if(process.argv[1]?.endsWith('m4-balance.mjs')){const args=process.argv,ci=args.indexOf('--catalog'),oi=args.indexOf('--out'),catalog=ci<0?undefined:JSON.parse(await fs.readFile(args[ci+1],'utf8')),result=m4BalanceReport(await loadWorld(),{catalog});await fs.writeFile(oi<0?'world/design/m4-batch2-balance.json':args[oi+1],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:result.pass,rows:result.results.length,failed:result.results.filter(r=>r.pass===false),referenceSoloRange:[Math.min(...result.results.filter(r=>r.mode==='reference_solo').map(r=>r.winRate)),Math.max(...result.results.filter(r=>r.mode==='reference_solo').map(r=>r.winRate))],referenceTeamRange:[Math.min(...result.results.filter(r=>r.mode==='reference_team').map(r=>r.winRate)),Math.max(...result.results.filter(r=>r.mode==='reference_team').map(r=>r.winRate))]}));if(!result.pass)process.exitCode=1;}
