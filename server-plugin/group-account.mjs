// Faction assets are the single money account. Organization rows retain their
// original ledger as historical evidence, never as a second spendable balance.
import {templeById} from './faith-catalog.mjs';
import {treasury,bookSide} from './money.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('group-account',{kinds:['member_of','holds_office'],entities:['office']});
export const groupAccountPath=id=>['state','records',`faction-assets:${id}`];
const amount=l=>l.amount??l.coins??0;
const signature=l=>l.sourceEvent?JSON.stringify([l.sourceEvent,amount(l)]):null;
export function groupAccountView(engine,state,id){
    if(state.settlements?.[id])return {category:'settlement_account',settlement:id,coins:state.settlements[id].treasury??0,ledger:state.settlements[id].treasuryLedger??[]};
    const f=engine.world.factions?.find(f=>f.id===id)??(state.records?.[`nation:${id}`]?{id,resources:{treasuryCopper:0,items:{}}}:null)??(String(id).startsWith('temple:')&&templeById(engine,id)?.source==='temple'?{id,resources:{treasuryCopper:0,items:{}}}:null);if(!f)return null;
    const row=state.records?.[`organization:${id}`],prior=state.records?.[`faction-assets:${id}`],base=f.resources?.treasuryCopper??0;
    if(prior&&prior.category!=='faction_assets')throw Error('势力资产记录冲突');
    let delta=0,overlap=0,unverified=0;
    if(!prior?.organizationReconciliation){
        if(!prior)delta=row?.treasury??0;
        else{
            const matches=new Map();
            for(const l of prior.ledger??[]){const k=signature(l);if(k)matches.set(k,(matches.get(k)??0)+1);}
            let traced=0;
            for(const l of row?.ledger??[]){
                const n=amount(l);traced+=n;const k=signature(l);
                if(k&&matches.get(k)>0){overlap+=n;matches.set(k,matches.get(k)-1);}else if(k)delta+=n;
                else unverified+=n;
            }
            unverified+=(row?.treasury??0)-traced;
        }
    }
    const coins=(prior?.coins??base)+delta;
    if(!Number.isSafeInteger(coins)||coins<0)throw Error('组织与势力公库来源核对后余额无效');
    return {...prior,category:'faction_assets',faction:id,coins,items:{...prior?.items??f.resources?.items??{}},
        relations:{...Object.fromEntries([...(f.relations??[]),...(engine.rules.factionRelations?.[id]??[]).filter(r=>!f.relations?.some(b=>b.faction===r.faction))].map(r=>[r.faction,r.score])),...prior?.relations},
        disputes:prior?.disputes??{},ledger:prior?.ledger??[],source:prior?.source??`factions:${id}:resources`,
        ...(!prior?.organizationReconciliation&&row?{organizationReconciliation:{delta:row.treasury??0,applied:delta,overlap,unverified,ledger:row.ledger??[]}}:{})};
}
export function ensureGroupAccount(d,engine,id){
    const row=groupAccountView(engine,d.get('state'),id);if(!row)throw Error(`未登记势力：${id}`);
    if(d.get(...groupAccountPath(id))?.organizationReconciliation)return row;
    row.organizationReconciliation??={delta:0,applied:0,overlap:0,unverified:0,ledger:[]};
    holdingSet(d,null,groupAccountPath(id),row,'group-account');return row;
}
// S1a: books = 账本对方账户（money.bookSide）。
export function changeGroupCoins(d,engine,id,delta,event,books){
    if(d.get('state','settlements',id)){
        const row=groupAccountView(engine,d.get('state'),id),coins=row.coins+delta;
        if(!Number.isSafeInteger(coins)||coins<0)throw Error('聚落公账不足或溢出');
        bookSide(d,treasury(id),delta,books);
        d.set(['state','settlements',id,'treasury'],coins);
        d.set(['state','settlements',id,'treasuryLedger'],[...row.ledger,{...event,coins:delta}]);
        return coins;
    }
    const row=ensureGroupAccount(d,engine,id),coins=row.coins+delta;
    if(!Number.isSafeInteger(coins)||coins<0)throw Error('组织公库不足或溢出');
    bookSide(d,treasury(id),delta,books);
    holdingSet(d,null,groupAccountPath(id),{...row,coins,ledger:[...row.ledger,{...event,coins:delta}]},'group-account');
    return coins;
}
