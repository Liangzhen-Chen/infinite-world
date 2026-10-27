// W5: engine-owned deterministic math. Reference values are high-precision constants written by hand (not Math.*);
// Math.* is used only as a loose cross-check of the sweep, never as the expected value.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {exp,ln,sin,cos,tan,atan2,acos,sqrt,hypot,pow,toRational,fromRational} from '../server-plugin/det-math.mjs';

const near=(actual,expected,rel=3e-16)=>assert.ok(Math.abs(actual-expected)<=rel*Math.max(Math.abs(expected),1e-300)+1e-300,`${actual} vs ${expected}`);
test('known values stay within one ulp of the true value',()=>{
 near(exp(1),2.718281828459045235360287);near(exp(-1),0.3678794411714423215955);near(exp(10),22026.46579480671651695790);
 near(exp(0.5),1.648721270700128146848650);near(exp(-0.25),0.7788007830714048682451702);near(exp(700),1.014232054735004540e304);
 near(ln(2),0.6931471805599453094172321);near(ln(10),2.302585092994045684017991);near(ln(0.5),-0.6931471805599453094172321);
 near(ln(1.5),0.4054651081081643819780131);near(ln(1e-5),-11.51292546497022842008996);
 near(sin(1),0.8414709848078965066525023);near(cos(1),0.5403023058681397174009366);near(tan(1),1.557407724654902230506975);
 near(sin(-2.5),-0.5984721441039565);near(cos(100),0.8623188722876839341019385);near(sin(1000),0.8268795405320025);
 near(atan2(1,1),0.7853981633974483096156608);near(atan2(1,-1),2.356194490192344928846982);near(atan2(-1,0),-1.570796326794896619231322);
 near(atan2(3,4),0.6435011087932843868028092);near(atan2(-2,-5),-2.761086276477428);
 near(acos(0.5),1.047197551196597746154214);near(acos(-0.5),2.094395102393195492308429);near(acos(0),1.570796326794896619231322);
 assert.equal(sqrt(2),1.4142135623730951);assert.equal(sqrt(9),3);assert.equal(sqrt(0.25),0.5);
 assert.equal(hypot(3,4),5);assert.equal(hypot(5,12),13);assert.equal(hypot(1,1),1.4142135623730951);assert.equal(hypot(0,0),0);
 near(hypot(0.3,0.4),0.5);near(hypot(1e-8,2e-8),2.23606797749979e-8);
 assert.equal(pow(2,10),1024);assert.equal(pow(0.5,3),0.125);assert.equal(pow(3,-2),1/9);near(pow(2,0.5),1.414213562373095048801689);
 near(pow(0.99,1/360),0.99997208279010,1e-13);
});
test('exact identities and edge cases',()=>{
 assert.equal(exp(0),1);assert.equal(ln(1),0);assert.equal(sin(0),0);assert.equal(cos(0),1);assert.equal(atan2(0,0),0);
 assert.equal(exp(-1000),0);assert.equal(exp(1000),Infinity);assert.equal(ln(0),-Infinity);assert.ok(Number.isNaN(ln(-1)));
 assert.ok(Number.isNaN(acos(1.5)));assert.ok(Number.isNaN(sqrt(-1)));assert.equal(hypot(Infinity,1),Infinity);assert.equal(hypot(),0);
 assert.equal(pow(0,0),1);assert.equal(pow(1,0.37),1);assert.equal(pow(0,2),0);assert.ok(Number.isNaN(pow(-2,0.5)));
 assert.equal(hypot(-3,-4),5);assert.equal(atan2(0,-1),Math.PI);
});
test('error sweep: within 2^-50 of the platform value over the stated domains',()=>{
 const worst={};const bound=2**-50;
 const check=(name,mine,ref,xs)=>{for(const x of xs){const a=mine(x),b=ref(x);const e=Math.abs(a-b)/Math.max(1,Math.abs(b));worst[name]=Math.max(worst[name]??0,e);}};
 const grid=(n,lo,hi)=>Array.from({length:n},(_,i)=>lo+(hi-lo)*((i*0.6180339887498949)%1));
 check('exp',exp,Math.exp,grid(400,-50,50));check('ln',ln,Math.log,grid(400,1e-6,1e6));
 check('sin',sin,Math.sin,grid(400,-1000,1000));check('cos',cos,Math.cos,grid(400,-1000,1000));
 check('tan',tan,Math.tan,grid(400,-1.5,1.5));check('sqrt',sqrt,Math.sqrt,grid(400,1e-6,1e6));
 check('acos',acos,Math.acos,grid(400,-1,1));check('atan2',x=>atan2(x,2.3),x=>Math.atan2(x,2.3),grid(400,-100,100));
 check('hypot',x=>hypot(x,3.7),x=>Math.hypot(x,3.7),grid(400,-100,100));
 for(const [name,e] of Object.entries(worst))assert.ok(e<=bound,`${name} error ${e}`);
});
test('outputs are bit-identical to the recorded digest (cross-Node check)',()=>{
 const h=createHash('sha256');
 for(let i=0;i<200;i++){const x=(i-100)*0.173+0.0137,p=1+i*0.37;
  for(const v of [exp(x/4),ln(p),sin(x),cos(x),tan(x/3),atan2(x,p),acos(Math.max(-1,Math.min(1,x/18))),sqrt(p),hypot(x,p),pow(0.97,p/37)])h.update(Object.is(v,-0)?'-0':String(v)).update('|');}
 assert.equal(h.digest('hex'),'2d833947ebbd6c52c3b50b955f171a728b811e5fa7fdfa16f6b732f58729cda8');
});
test('rational prices: integer numerator over a fixed denominator',()=>{
 assert.deepEqual(toRational(2.3894288282429006),{numerator:2389429,denominator:1000000});
 assert.deepEqual(toRational(0),{numerator:0,denominator:1000000});assert.deepEqual(toRational(-1.5,100),{numerator:-150,denominator:100});
 assert.equal(fromRational(toRational(3.25)),3.25);assert.throws(()=>toRational(NaN));
});
