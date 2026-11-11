// Obligation time is independent of the display calendar. Legacy agreements
// keep their fixed 30-day basis; new agreements name a signed calendar.
import fs from 'node:fs';
export const DAY=1440;
function freeze(v){if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
const calendars=new Map(JSON.parse(fs.readFileSync(new URL('../world/ontology/calendar.json',import.meta.url),'utf8')).entries.map(c=>[c.id,freeze(c)]));
export const DEFAULT_CALENDAR=calendars.get('core:calendar_default');
export const LEGACY_CALENDAR=calendars.get('legacy:30-day');
export function obligationCalendar(calendar){
    if(!calendar||calendar==='legacy:30-day')return LEGACY_CALENDAR;
    if(calendar==='core:calendar_default')return DEFAULT_CALENDAR;
    if(typeof calendar!=='object'||!calendar.months?.length)throw Error('Unknown obligation calendar');
    return calendar;
}
function monthsOf(calendar,year){
    const months=calendar.months.map((m,i)=>({id:m.id??String(i+1),days:typeof m==='number'?m:m.days,leap:false}));
    const l=calendar.leap;
    if(l&&l.years?.includes((year-1)%(l.cycle??19)+1))months.splice(l.afterMonth,0,{id:`leap:${l.afterMonth}`,days:l.days,leap:true});
    if(months.some(m=>!Number.isSafeInteger(m.days)||m.days<1))throw Error('Invalid obligation calendar month');
    return months;
}
// The date of a day is a pure function of (calendar, day index); only the offset within the day varies by minute.
const dateMemo=new WeakMap();
export function obligationDate(minute,calendar){
    calendar=obligationCalendar(calendar);
    if(!Number.isSafeInteger(minute)||minute<(calendar.epochMinute??0))throw Error('Invalid obligation calendar minute');
    const epoch=calendar.epochMinute??0,dayIndex=Math.floor((minute-epoch)/DAY);
    let byDay=dateMemo.get(calendar);if(!byDay){byDay=new Map();dateMemo.set(calendar,byDay);}
    let row=byDay.get(dayIndex);
    if(!row){row=computeObligationDate(epoch+dayIndex*DAY,calendar);if(byDay.size>4096)byDay.clear();byDay.set(dayIndex,row);}
    return {...row,offset:(minute-epoch)%DAY};
}
function computeObligationDate(minute,calendar){
    let days=Math.floor((minute-(calendar.epochMinute??0))/DAY),year=1,start=calendar.epochMinute??0;
    for(;;year++){
        const months=monthsOf(calendar,year),length=months.reduce((n,m)=>n+m.days,0);
        if(days>=length){days-=length;start+=length*DAY;continue;}
        for(let index=0;index<months.length;index++){
            const month=months[index];
            if(days<month.days)return {year,index,month:month.id,day:days+1,leap:month.leap,start,days:month.days,offset:(minute-(calendar.epochMinute??0))%DAY};
            days-=month.days;start+=month.days*DAY;
        }
    }
}
// Keep the original day after a short month clamps it. Leap months do not
// become anchors when obligationsSkip is true, but their days remain payable.
export function anchorsBetween(from,to,calendar){
    calendar=obligationCalendar(calendar);
    if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||to<from)throw Error('Invalid accrual interval');
    const origin=obligationDate(from,calendar);
    let year=origin.year,index=origin.index,start=origin.start,last=from,full=0,skipped=0,skippedAtLast=0;
    for(;;){
        let months=monthsOf(calendar,year);
        start+=months[index].days*DAY;
        if(++index===months.length){year++;index=0;months=monthsOf(calendar,year);}
        const m=months[index];
        if(start>to)break;
        if(m.leap&&calendar.leap?.obligationsSkip){
            skipped+=Math.max(0,Math.min(to,start+m.days*DAY)-Math.max(from,start))/DAY;
            continue;
        }
        const anchor=start+(Math.min(origin.day,m.days)-1)*DAY+origin.offset;
        if(anchor>to)break;
        full++;last=anchor;skippedAtLast=skipped;
    }
    // Days since last already include any still-open leap month.
    return {full,remDays:(to-last)/DAY+skippedAtLast,lastAnchor:last};
}
export function accrualRaw(args){
    const exact=accrualFraction(args);return Number(exact.numerator)/Number(exact.denominator);
}
const gcd=(a,b)=>{while(b){const r=a%b;a=b;b=r;}return a<0n?-a:a;};
export function fraction(numerator,denominator=1n){
    const g=gcd(numerator,denominator);return {numerator:numerator/g,denominator:denominator/g};
}
const decimal=value=>{
    if(!Number.isFinite(value)||value<0)throw Error('Invalid accrual value');
    const [digits,exponent='0']=String(value).toLowerCase().split('e'),[whole,decimals='']=digits.split('.'),power=Number(exponent)-decimals.length;
    return power>=0?fraction(BigInt(whole+decimals)*10n**BigInt(power)):fraction(BigInt(whole+decimals),10n**BigInt(-power));
};
export {decimal as decimalFraction};
const multiply=(a,b)=>fraction(a.numerator*b.numerator,a.denominator*b.denominator);
export const addAccrual=(a,b,sign=1n)=>fraction(a.numerator*b.denominator+sign*b.numerator*a.denominator,a.denominator*b.denominator);
// Exact accumulator for mutations: fractional money survives amendments and
// partial payments until one truncation of the total. No BigInt is persisted.
export function accrualFraction({from,to,calendar,per='anchor',value,proration='daily',rate,principal}){
    const c=obligationCalendar(calendar),span=anchorsBetween(from,to,c);
    if(!['day','anchor'].includes(per)||!['daily','none'].includes(proration))throw Error('Invalid accrual terms');
    let v;
    if(rate){
        v=multiply(decimal(principal),multiply(decimal(rate.bps),fraction(1n,10000n)));
        if(rate.per==='day')per='day';
        else if(rate.per==='year')v=multiply(v,fraction(BigInt(c.rateBasis?.month??30),BigInt(c.rateBasis?.year??360)));
        else if(rate.per!=='month')throw Error('Invalid rate period');
    }else v=decimal(value);
    const basis=c.rateBasis?.month??30;
    const units=per==='day'?fraction(BigInt(to-from),BigInt(DAY)):addAccrual(fraction(BigInt(span.full)),proration==='none'?fraction(0n):fraction(BigInt(Math.round(span.remDays*DAY)),BigInt(DAY*basis)));
    return multiply(v,units);
}
// Signed decimal rates use the same calendar engine without first converting
// to floating basis points. Money is rounded once, after the entire interval.
export function interestFraction({principal,rate,from,to,per='anchor',calendar}){
    return multiply(multiply(decimal(principal),decimal(rate)),accrualFraction({from,to,per,calendar,value:1}));
}
export function interestAmount(args,{round='ceil'}={}){
    const f=interestFraction(args);if(!['ceil','trunc'].includes(round))throw Error('Invalid interest rounding');
    return Number(round==='ceil'?(f.numerator+f.denominator-1n)/f.denominator:f.numerator/f.denominator);
}
