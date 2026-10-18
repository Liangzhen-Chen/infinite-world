import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY,anchorsBetween,accrualRaw,obligationDate} from '../server-plugin/obligation-calendar.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';

const calendar={epochMinute:0,months:[{id:'1',days:30},{id:'2',days:29},{id:'3',days:30}],rateBasis:{month:30,year:90}};
test('calendar anchors clamp short months without losing the signed day',()=>{
    assert.deepEqual(anchorsBetween(29*DAY,58*DAY,calendar),{full:1,remDays:0,lastAnchor:58*DAY});
    assert.deepEqual(anchorsBetween(29*DAY,88*DAY,calendar),{full:2,remDays:0,lastAnchor:88*DAY});
    assert.equal(accrualRaw({from:30*DAY,to:59*DAY,calendar,value:600}),600);
    assert.equal(obligationDate(59*DAY,calendar).month,'3');
});
test('leap month skips a period and retains all leap days as payable remainder',()=>{
    const c={...calendar,leap:{cycle:1,years:[1],afterMonth:1,days:29,obligationsSkip:true}};
    assert.deepEqual(anchorsBetween(0,59*DAY,c),{full:1,remDays:29,lastAnchor:59*DAY});
    assert.equal(Math.trunc(accrualRaw({from:0,to:88*DAY,calendar:c,value:5})),14);
    assert.equal(accrualRaw({from:0,to:45*DAY,calendar:c,per:'day',value:1}),45);
});
test('closed obligations retain earned claims; rates and principal change prospectively with one rounding',()=>{
    const row={id:'w',kind:'wage',createdAt:0,amount:0,paid:0,terms:{calendar,accrual:{per:'anchor',value:101}},
        amendments:[{minute:15*DAY,value:201}],endedAt:30*DAY};
    const before=JSON.stringify(row),s={minute:60*DAY};
    const view=obligationView(s,row);assert.equal(view.closed,true);assert.equal(view.owed,151);
    assert.equal(JSON.stringify(row),before);
    const interest={...row,terms:{calendar,principal:1000,accrual:{rate:{per:'month',bps:50}}},amendments:[{minute:15*DAY,principal:2000,rate:{per:'month',bps:100}}]};
    assert.equal(obligationView(s,interest).owed,12);
});
test('segmented queries use the same anchor and rounding origin as one large query',()=>{
    const row={id:'r',createdAt:0,amount:0,paid:0,terms:{calendar,accrual:{value:7}}};
    const whole=obligationView({},row,88*DAY).owed;
    let paid=0;
    for(const minute of [10,30,45,59,70,88].map(d=>d*DAY)){
        const current=obligationView({},row,minute);paid+=current.owed;
        row.paid=paid;
    }
    assert.equal(paid,whole);
});
test('fractional rate segments round only once and expiry amendments stop future accrual',()=>{
    const row={id:'r',createdAt:0,amount:0,paid:0,terms:{calendar,principal:100,accrual:{rate:{per:'day',bps:100}}},
        amendments:Array.from({length:30},(_,i)=>({minute:i*DAY,principal:100}))};
    assert.equal(obligationView({},row,30*DAY).owed,30);
    row.amendments.push({minute:30*DAY,expires:35*DAY});
    assert.equal(obligationView({},row,80*DAY).owed,35);
});
