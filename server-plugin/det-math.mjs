// Deterministic math for the engine (W5, 14 s14.6). The platform's Math.exp/log/sin/cos/tan/acos/atan2/hypot/sqrt
// are implementation-approximated: two Node/V8 builds may differ in the last bit, and that bit reaches saved
// state. Everything here is plain BigInt integer arithmetic on a 160-bit binary fixed point (value = n / 2^160),
// so every platform gets the same bits. Only +,-,*,/ on doubles (IEEE-exact) and BigInt ops are used; no Math.*
// transcendental call. Outputs are the double nearest the fixed-point result (one rounding, Number(BigInt)).
//
// Precision by domain (the table every replacement site follows):
//   currency / ledger / accounts ........ integer minimum unit; never touched by this module
//   price ratios, exchange rates ........ rational {numerator, denominator}; world-clock price history is stored
//                                         as integer numerator over 1_000_000 (toRational below); obligation
//                                         accruals use obligation-calendar fraction()/decimalFraction()
//   physical / astronomical / geometry .. fixed point, 2^-160 internally, result rounded to one double
//                                         (<= 1 ulp from the true value); coordinates are then rounded to 0.01 km
//                                         and sunrise/sunset to whole minutes by their callers
//   probability / random ................ the existing RX / sha256-uint32 caliber: integer draw in [0,2^32),
//                                         compared with an integer threshold (never a float division)
//
// Error bounds (abs = absolute, rel = relative, over the stated domain; verified in tests/det-math.test.mjs):
//   sqrt(x)   x >= 0, finite ........ rel <= 2^-52 (floor at 2^-160, then one round to double)
//   hypot(..) finite args ........... same as sqrt; exact for integer Pythagorean inputs
//   exp(x)    -745 < x < 709.78 ..... rel <= 2^-52 (Taylor after reduction x = k ln2 + r, r squared back 6x)
//   ln(x)     0 < x < Infinity ...... abs <= 2^-52 * max(1,|ln x|) (atanh series on mantissa in [0.70,1.42])
//   sin/cos   |x| <= 2^60 ........... abs <= 2^-52 (reduction by pi/2 held to 160 bits)
//   tan(x)    |x| <= 2^60 ........... rel <= 2^-50 away from odd multiples of pi/2
//   atan2     |x|,|y| >= 2^-100 or 0 ... abs <= 2^-52 (ratio in fixed point, 3 half-angle halvings, series)
//   acos(x)   -1 <= x <= 1 .......... abs <= 2^-52 (via atan2(sqrt(1-x^2), x))
const W=160n,WN=160,ONE=1n<<W,TWO_W=Number(ONE);
const f64=new Float64Array(1),u64=new BigUint64Array(f64.buffer);
const abs=n=>n<0n?-n:n;
const mul=(a,b)=>(a*b)/ONE,div=(a,b)=>(a*ONE)/b;
const bitLength=n=>{if(n===0n)return 0;const h=n.toString(16);return (h.length-1)*4+(32-Math.clz32(parseInt(h[0],16)));};
function isqrt(n){
    if(n<2n)return n;
    let x=1n<<BigInt((bitLength(n)+1)>>1);
    for(;;){const y=(x+n/x)>>1n;if(y>=x)return x;x=y;}
}
function decompose(x){
    f64[0]=x;const bits=u64[0],exp=Number((bits>>52n)&0x7ffn),frac=bits&((1n<<52n)-1n);
    const M=exp===0?frac:frac|(1n<<52n);return {M:bits>>63n?-M:M,E:(exp===0?1:exp)-1075};
}
// Exact conversion of a finite double to 160-bit fixed point (truncating below 2^-160).
function toFix(x){
    const {M,E}=decompose(x),shift=E+WN,a=abs(M),v=shift>=0?a<<BigInt(shift):a>>BigInt(-shift);return M<0n?-v:v;
}
const fromFix=b=>Number(b)/TWO_W;
function pow2(k){u64[0]=BigInt(k+1023)<<52n;return f64[0];}
function ldexp(v,k){
    while(k>1000){v*=pow2(1000);k-=1000;}
    while(k<-1000){v*=pow2(-1000);k+=1000;}
    return v*pow2(k);
}
function atanhSeries(s){ // 2*atanh(s) = 2*(s + s^3/3 + s^5/5 ...), |s| < 0.2
    const s2=mul(s,s);let term=s,sum=s;
    for(let i=3n;term!==0n;i+=2n){term=mul(term,s2);sum+=term/i;}
    return 2n*sum;
}
const LN2=atanhSeries(ONE/3n);
function atanInv(n){ // atan(1/n), n >= 2 integer
    const n2=n*n;let term=ONE/n,sum=term,sign=-1n;
    for(let i=3n;term!==0n;i+=2n){term/=n2;sum+=sign*(term/i);sign=-sign;}
    return sum;
}
const PI=16n*atanInv(5n)-4n*atanInv(239n),HALF_PI=PI>>1n;
const SQRT2=isqrt(2n*ONE*ONE);
const floorDiv=(a,b)=>{const q=a/b;return (a%b!==0n&&(a<0n)!==(b<0n))?q-1n:q;};

function expFix(x){ // returns {m,k}: exp(x) = m/2^160 * 2^k, m in about [0.7,1.42]*2^160
    const k=floorDiv(x+(LN2>>1n),LN2);let r=(x-k*LN2)>>6n,term=ONE,sum=ONE;
    for(let i=1n;term!==0n;i++){term=mul(term,r)/i;sum+=term;}
    for(let i=0;i<6;i++)sum=mul(sum,sum);
    return {m:sum,k:Number(k)};
}
export function exp(x){
    if(Number.isNaN(x))return NaN;
    if(x>709.78)return Infinity;
    if(x<-745.2)return 0;
    const {m,k}=expFix(toFix(x));return ldexp(fromFix(m),k);
}
export function ln(x){
    if(Number.isNaN(x)||x<0)return NaN;
    if(x===0)return -Infinity;
    if(x===Infinity)return Infinity;
    const {M,E}=decompose(x),bl=bitLength(M);let e=E+bl-1,m=M<<BigInt(WN-(bl-1));
    if(m>SQRT2){m>>=1n;e+=1;}
    return fromFix(BigInt(e)*LN2+atanhSeries(div(m-ONE,m+ONE)));
}
function sinCosFix(x){
    const k=floorDiv(x+(HALF_PI>>1n),HALF_PI),r=x-k*HALF_PI,r2=mul(r,r);
    let st=r,s=r,ct=ONE,c=ONE;
    for(let i=1n;st!==0n||ct!==0n;i++){
        st=-mul(st,r2)/((2n*i)*(2n*i+1n));s+=st;
        ct=-mul(ct,r2)/((2n*i-1n)*(2n*i));c+=ct;
    }
    switch(Number(((k%4n)+4n)%4n)){case 0:return [s,c];case 1:return [c,-s];case 2:return [-s,-c];default:return [-c,s];}
}
export function sin(x){return Number.isFinite(x)?fromFix(sinCosFix(toFix(x))[0]):NaN;}
export function cos(x){return Number.isFinite(x)?fromFix(sinCosFix(toFix(x))[1]):NaN;}
export function tan(x){
    if(!Number.isFinite(x))return NaN;
    const [s,c]=sinCosFix(toFix(x));if(c===0n)return s>=0n?Infinity:-Infinity;return fromFix(div(s,c));
}
function atanFix(t){ // t fixed point, any sign
    if(t<0n)return -atanFix(-t);
    if(t>ONE)return HALF_PI-atanFix(div(ONE,t));
    for(let i=0;i<3;i++)t=div(t,ONE+isqrt((ONE*ONE)+t*t));
    const t2=mul(t,t);let term=t,sum=t,sign=-1n;
    for(let i=3n;term!==0n;i+=2n){term=mul(term,t2);sum+=sign*(term/i);sign=-sign;}
    return 8n*sum;
}
function atan2Fix(y,x){
    if(x===0n&&y===0n)return 0n;
    const ay=abs(y),ax=abs(x);
    let a=ax>=ay?atanFix(div(ay,ax)):HALF_PI-atanFix(div(ax,ay));
    if(x<0n)a=PI-a;
    return y<0n?-a:a;
}
export function atan2(y,x){return Number.isFinite(x)&&Number.isFinite(y)?fromFix(atan2Fix(toFix(y),toFix(x))):NaN;}
export function acos(x){
    if(!(x>=-1&&x<=1))return NaN;
    const fx=toFix(x);return fromFix(atan2Fix(isqrt(ONE*ONE-fx*fx),fx));
}
export function sqrt(x){
    if(Number.isNaN(x)||x<0)return NaN;
    if(x===0||x===Infinity)return x;
    return fromFix(isqrt(toFix(x)<<W));
}
export function hypot(...values){
    let integers=true,sum=0;
    for(const v of values){
        if(v===Infinity||v===-Infinity)return Infinity;
        if(Number.isNaN(v))return NaN;
        integers=integers&&Number.isInteger(v);sum+=v*v;
    }
    if(!values.length)return 0;
    // Exact fast path: an integer sum of squares that is a verified perfect square needs no big arithmetic.
    if(integers&&Number.isSafeInteger(sum)){const r=Math.floor(Math.sqrt(sum));if(r*r===sum)return r;}
    let big=0n;for(const v of values){const f=toFix(v);big+=f*f;}
    return fromFix(isqrt(big));
}
// Rational price helpers: a price is persisted as an integer numerator over a fixed denominator.
export const PRICE_DENOMINATOR=1000000;
export function toRational(value,denominator=PRICE_DENOMINATOR){
    if(!Number.isFinite(value))throw Error('Invalid rational value');
    const n=Math.abs(value)*denominator,r=Math.floor(n+0.5);return {numerator:value<0?-r:r,denominator};
}
export const fromRational=({numerator,denominator})=>numerator/denominator;
// pow: integer exponents use square-and-multiply (IEEE-exact basic ops in a fixed order, so every platform agrees);
// other exponents use exp(y*ln x) for x > 0. Error: rel <= 2^-50 * max(1,|y ln x|) for the non-integer case.
export function pow(base,exponent){
    if(exponent===0)return 1;
    if(Number.isNaN(base)||Number.isNaN(exponent))return NaN;
    if(Number.isInteger(exponent)&&Math.abs(exponent)<=2147483648){
        let n=Math.abs(exponent),r=1,b=base;
        while(n>0){if(n%2===1)r*=b;b*=b;n=Math.floor(n/2);}
        return exponent<0?1/r:r;
    }
    if(base===0)return exponent>0?0:Infinity;
    if(base<0)return NaN;
    if(base===1)return 1;
    return exp(exponent*ln(base));
}
