// SL: household tools. A person at home may use a tool that any member of the
// same household holds at home: one law for the player and NPCs. The tool
// stays its holder's; wear lands on the holder's unit. Nothing is moved.
import {useTool} from './items.mjs';
import {npcHousehold} from './npc-state.mjs';

const whereIs=(d,id)=>id==='player'?d.get('state','location'):d.get('state','npcs',id,'location');
// {item, holder}: the actor's own tool first, then a member's at home (by id order).
export function householdTool(d,engine,requiresUse,selected,actor='player'){
 try{return {item:useTool(d,engine,requiresUse,selected,actor),holder:actor};}
 catch(error){
  if(error?.code!=='E-ACTION-TOOL')throw error;
  const house=npcHousehold(engine,d.get('state'),actor),home=house?.homeLocation;
  if(!home||whereIs(d,actor)!==home)throw error;
  for(const member of [...house.members].filter(m=>m!==actor&&whereIs(d,m)===home).sort()){
   try{return {item:useTool(d,engine,requiresUse,selected,member),holder:member};}
   catch(next){if(next?.code!=='E-ACTION-TOOL')throw next;}
  }
  throw error;
 }
}
