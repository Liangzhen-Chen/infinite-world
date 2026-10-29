// Owner maintenance is an NPC action, not free healing in the facility clock.
// Use the same material/work specification, project stock and completion hook
// as player repairs. Existing autonomous trade buys genuinely available stock.
import {registerAutonomyProvider,registerAutonomyKind} from './autonomy-candidates.mjs';
import {facilityView,facilityRepairMaterials,facilityRuntime} from './facility-state.mjs';
import {currentControllers} from './action-authority.mjs';
import {valuation,stateReader,goodsWorth} from './valuation.mjs';
import {changeItems} from './items.mjs';
import {BOOKED,holdWorks,settleWorks} from './stock.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {preconditionFailure} from './precondition.mjs';

declareLedgerWriter('building-maintenance',{sinks:['sink:consume']});
const writer='building-maintenance',MINUTES=240;
const key=(who,building)=>`owner_repair:${who}:${building}`;
function owns(engine,document,who,building){return currentControllers({engine,document},building,{ownerOnly:true,principals:true}).includes(who);}
function pending(state,who,building){return Object.values(state.projects??{}).find(p=>p.type==='业主修缮'&&p.creator===who&&p.building===building&&p.status==='施工中')??null;}
function materials(view){const m=facilityRepairMaterials(view);return {wood:m.wood,stone:m.stone,requiredMinutes:m.work*480};}
const items=p=>[['item_wood',p.wood],['item_stone',p.stone]];
function wanted(engine,document,who,building){
 const view=facilityView(engine,document.state,building);
 if(!view||view.burning||view.condition<=0||!owns(engine,document,who,building))return null;
 const project=pending(document.state,who,building);
 if(!project&&view.condition>=60)return null;
 if(Object.values(document.state.projects??{}).some(p=>p.building===building&&p.status==='施工中'&&p.id!==project?.id))return null;
 return {view,project,required:project??materials(view)};
}
registerAutonomyProvider('building_maintenance',{
 // Relevance is only a cheap damage check. Ownership is checked against the
 // full document below, including native titles that override catalog owners.
 relevant:(e,state,id,presence)=>{const v=facilityView(e,state,presence.location);return Boolean(v&&!v.burning&&v.condition>0&&(v.condition<60||pending(state,id,presence.location)));},
 candidates(e,view,document){
  const who=view.observer,building=view.self.location,w=wanted(e,document,who,building);if(!w)return [];
  const read=stateReader(document.state),intact=valuation(read,e,{role:'property',subject:building,condition:100}).value;
  if(intact===null)return [];
  const remaining=w.required.requiredMinutes-(w.project?.minutesDone??0),minutes=Math.min(MINUTES,remaining);
  const reward=Math.floor(intact*(100-w.view.condition)/100*minutes/remaining);
  const missing=w.project?null:items(w.required).find(([item,n])=>e.quantity(read,who,item)<n);
  if(missing){
   const [item,n]=missing,quantity=n-e.quantity(read,who,item);
   if(quantity>20)return [];
   // No remote stock, treasury grant, invented merchant, or automatic delivery.
   // Career services list taught recipes/skills, not generic stock sales.
   // Inspect only observed people and their public engine-quoted trade offer.
   return view.observable.people.filter(p=>p.id!==who&&e.byId.get(p.id)?.serviceCatalog?.some(s=>s.kind==='trade'&&s.price?.mode==='engineQuote')).flatMap(p=>{
    const seller=p.id;if(document.state.npcs[seller]?.location!==building||e.quantity(read,seller,item)<quantity)return [];
    try{
     const quote=facilityRuntime().currentTradeQuote(e,document,{buyer:who,seller,item,quantity,location:building});
     return [{id:`repair_material:${who}:${building}:${item}:${seller}`,kind:'purchase',legacy:{kind:'trade',seller,item,quantity},cost:{coins:quote.totalCoins},reward,needSatisfaction:100-w.view.condition,utility:100-w.view.condition}];
    }catch{return [];}
   });
  }
  const value=w.project?0:items(w.required).reduce((sum,[item,quantity])=>sum+(goodsWorth(read,e,{item,quantity,holder:who,location:building})??0),0);
  return [{id:`maintain:${who}:${building}`,kind:'repair_building',legacy:{kind:'repair_building',building,minutes},cost:{value,minutes},reward,needSatisfaction:100-w.view.condition,utility:100-w.view.condition}];
 }
});
registerAutonomyKind('repair_building',{
 minutes:(e,action)=>action.minutes,
 validate(d,e,who,action){
  const w=wanted(e,d.document,who,action.building);
  if(!w||d.get('state','npcs',who,'location')!==action.building)throw preconditionFailure('业主不在本人可修缮的建筑内');
  if(!Number.isSafeInteger(action.minutes)||action.minutes<1||action.minutes>MINUTES||action.minutes>w.required.requiredMinutes-(w.project?.minutesDone??0))throw preconditionFailure('修缮工时无效');
  if(!w.project&&items(w.required).some(([item,n])=>e.quantity(d,who,item)<n))throw preconditionFailure('业主修缮材料不足');
 },
 execute(d,e,who,action,{at,actionId}){
  const w=wanted(e,d.document,who,action.building),id=w.project?.id??`${key(who,action.building)}:${actionId}`;
  let p=w.project;
  if(!p){
   p={id,type:'业主修缮',building:action.building,creator:who,projectWork:'repair',status:'施工中',...w.required,minutesDone:0,started:at-action.minutes};
   for(const [item,n]of items(p))changeItems(d,e,who,item,-n,{books:BOOKED});
   holdWorks(d,e,id,p,{from:{party:who},writer,eventId:actionId});
  }
  p={...p,minutesDone:p.minutesDone+action.minutes};
  if(p.minutesDone>=p.requiredMinutes){
   facilityRuntime().completeFacilityProject(d,e,p,at);
   settleWorks(d,e,p,{writer,eventId:actionId});p={...p,status:'已完成',closedAt:at};
  }
  d.set(['state','projects',id],p);
  return {summary:`修缮本人建筑${action.building}，实际做工${action.minutes}分钟，${p.status}。`,spent:{minutes:action.minutes,...(!w.project?{materials:items(p).map(([item,amount])=>({item,amount}))}:{})}};
 }
});
