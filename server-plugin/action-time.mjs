// Relative time slots (06 §6.8 slot extraction). A proposal's time field is
// resolved only through the archived rules table openActionRules.generic
// .timeSlots: an optional day word plus a declared anchor (a clock minute or the
// location's actual sunrise/sunset), or a day word plus HH:MM. Wording outside
// the table is never guessed; it stays unresolved so the slot is asked for.
import {localWeather} from './weather.mjs';

const longest=(words,text)=>words.filter(word=>text.startsWith(word)).sort((a,b)=>b.length-a.length)[0];

// Returns {dayOffset, minuteOfDay|solar} or null. No document is needed.
export function parseTimeSlot(engine,value){
 const table=engine.world.openActionRules?.generic?.timeSlots;
 if(!table||typeof value!=='string')return null;
 let rest=value.trim().normalize('NFKC'),dayOffset=0;
 const day=longest(Object.keys(table.days??{}),rest);
 if(day){dayOffset=table.days[day];rest=rest.slice(day.length);}
 if(!Number.isSafeInteger(dayOffset)||dayOffset<0)return null;
 const clock=rest.match(/^(\d{1,2}):(\d{2})$/);
 if(clock){
  const hour=Number(clock[1]),minute=Number(clock[2]);
  return hour<24&&minute<60?{dayOffset,minuteOfDay:hour*60+minute}:null;
 }
 const anchorWord=longest(Object.keys(table.anchors??{}),rest);
 if(!anchorWord)return null;
 rest=rest.slice(anchorWord.length);
 if(rest&&!(table.before??[]).includes(rest))return null;
 const anchor=table.anchors[anchorWord];
 if(Number.isSafeInteger(anchor?.minute)&&anchor.minute>=0&&anchor.minute<1440)return {dayOffset,minuteOfDay:anchor.minute};
 if(['sunrise','sunset'].includes(anchor?.solar))return {dayOffset,solar:anchor.solar};
 return null;
}

// Absolute world minute of a time slot at a location, or null when unresolved.
export function resolveTimeSlot(engine,document,value,{location=document.state.location,now=document.state.minute}={}){
 if(Number.isSafeInteger(value))return value;
 const slot=parseTimeSlot(engine,value);if(!slot)return null;
 const base=(Math.floor(now/1440)+slot.dayOffset)*1440;
 const minuteOfDay=slot.solar?localWeather(engine,document,location,base)?.[`${slot.solar}Minute`]:slot.minuteOfDay;
 return Number.isSafeInteger(minuteOfDay)?base+minuteOfDay:null;
}
