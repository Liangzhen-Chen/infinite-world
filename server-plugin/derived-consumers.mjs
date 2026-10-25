// B/C consumer inputs: the table owns the existing coefficients, while views
// carry only evaluated numbers. Rule definitions and unknown sources stay out.
import defaults from '../world/ontology/slots/consumers.json' with {type:'json'};
import {derived} from './derived.mjs';
export const standingTransmission=Object.freeze(defaults.standing.transmission);
export function consumerCoefficients(view,name){
 return Object.fromEntries(Object.entries(defaults[name]).map(([key,row])=>[key,view.derived?.[name]?.[key]??row.base]));
}
export function projectConsumerDerived(engine,document,view){
 const table=engine.world.derived?.consumers??defaults,projected={};
 for(const name of ['decision','autonomy'])projected[name]=Object.fromEntries(Object.entries(table[name]).map(([key,row])=>[
  key,derived(engine,document,row.slot,view.observer,{base:row.base,observer:view.observer,view})
 ]));
 for(const [target,relation] of Object.entries(view.self.relations))for(const dimension of ['trust','affection','respect','fear','romance','competition']){
  const options={base:relation[dimension]??0,observer:view.observer,view,holder:view.observer,target,kind:dimension};
  relation[dimension]=derived(engine,document,'social:relation',view.observer,options);
  if(dimension==='trust')relation[dimension]=derived(engine,document,'social:standing',view.observer,{...options,base:relation[dimension]});
 }
 view.derived=projected;return view;
}
