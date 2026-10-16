import {personOffices} from './entity-view.mjs';
import {entityTransition} from './entity-transitions.mjs';
import {groupAccountView,changeGroupCoins} from './group-account.mjs';
import {purse} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('office-salary');
import {actorPath} from './npc-state.mjs';

const MONTH=30*1440,rec=id=>['state','records',id];
export function nextSalaryMinute(engine,now){return engine.rules.governance?.salaries?(Math.floor(now/MONTH)+1)*MONTH:Infinity;}
// Pay the office held immediately before the monthly boundary. Once assessed,
// the amount and creditor are a debt fact even if the office is later lost.
export function advanceOfficeSalaries(d,engine,{before,after}){
    const rules=engine.rules.governance?.salaries;if(!rules)return;
    for(let at=(Math.floor(before/MONTH)+1)*MONTH;at<=after;at+=MONTH){
        const state=d.get('state'),prior={...state,minute:at-1};
        const ids=new Set([...Object.values(state.records??{}).filter(r=>r.category==='governance_office'||r.category==='housing_steward').map(r=>r.holder??r.steward),
            ...(engine.world.settlementProfiles??[]).map(p=>p.details?.governance?.head),...(engine.rules.agriculture?.settlements??[]).map(s=>s.manager),
            ...Object.values(state.remote??{}).flatMap(r=>(r.skeleton?.offices??[]).filter(o=>o.source==='generated').map(o=>o.holder))].filter(Boolean));
        const offices=[...ids].flatMap(id=>personOffices(engine,prior,id)).map(e=>e.value).sort((a,b)=>a.id.localeCompare(b.id));
        for(const office of offices){
            const key=`office_salary:${office.settlement}:${office.office}:${office.holder}:${at}`;
            if(!office.monthlySalaryCopper||d.get(...rec(key)))continue;
            d.set(rec(key),{category:'office_salary',id:key,holder:office.holder,office:office.office,officeName:office.name,settlement:office.settlement,
                assessedAt:at,monthlyCopper:office.monthlySalaryCopper,paid:0,arrears:office.monthlySalaryCopper,status:'待付',payments:[],source:office.source??'rules.governance.salaries'});
        }
        const debts=Object.values(d.get('state','records')??{}).filter(r=>r.category==='office_salary'&&r.arrears>0).sort((a,b)=>a.assessedAt-b.assessedAt||a.id.localeCompare(b.id));
        for(const debt of debts){
            if(debt.payments.some(p=>p.minute===at))continue;
            const balance=groupAccountView(engine,d.get('state'),debt.settlement)?.coins??0;
            const paid=Math.min(debt.arrears,Math.max(0,balance-(engine.rules.governance?.authority?.treasury?.reserveCopper??0)));
            const actor=actorPath(engine.world,debt.holder),person=d.get(...actor);
            if(!person||person.status==='死亡')continue;
            if(paid){
                changeGroupCoins(d,engine,debt.settlement,-paid,{kind:'官职月俸',holder:debt.holder,office:debt.office,minute:at,sourceEvent:`${debt.id}:${at}`},{account:purse(engine,debt.holder),writer:'office-salary',eventId:`${debt.id}:${at}`});
                d.set([...actor,'coins'],(person.coins??0)+paid);
            }
            const arrears=debt.arrears-paid;
            d.set(rec(debt.id),{...debt,paid:debt.paid+paid,arrears,status:arrears?'欠俸':'已付',payments:[...debt.payments,{minute:at,copper:paid}]});
            if(arrears){
                const morale=d.get(...actor,'morale')??rules.moraleBase;
                d.set([...actor,'morale'],Math.max(0,morale-rules.unpaidMoraleLoss));
                const witnesses=Object.entries(d.get('state','npcs')??{}).filter(([id,n])=>id===debt.holder||n.location===debt.settlement).map(([id])=>id);
                for(const id of witnesses){
                    const memory={id:`${debt.id}:${at}:${id}`,sourceEvent:`${debt.id}:${at}`,kind:'salary',minute:at,location:debt.settlement,participants:[debt.settlement,debt.holder],
                        sourceType:id===debt.holder?'亲历':'目击',salary:debt.id,content:`${debt.officeName}本月应得${debt.monthlyCopper}铜月俸，公账尚欠${arrears}铜。`,salience:3,emotion:'不满'};
                    d.set(['state','npcs',id,'memoryStream'],[...d.get('state','npcs',id,'memoryStream')??[],memory]);
                }
                entityTransition(d,engine,{id:`${debt.id}:arrears:${at}`,verb:'salary',actor:debt.settlement,target:debt.holder,minute:at,location:debt.settlement,witnesses,arrearsCopper:arrears,salary:debt.id,summary:`${debt.officeName}月俸欠付${arrears}铜`});
                d.say(`${debt.officeName}月俸欠付${arrears}铜`);
            }
        }
    }
}
