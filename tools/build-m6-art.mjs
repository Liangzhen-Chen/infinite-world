import fs from 'node:fs/promises';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import {loadWorld} from './load-world.mjs';

const root=path.resolve(import.meta.dirname,'..');
export const scenes={village:'村落',tavern:'酒馆与共灶',home:'居室',workshop:'工坊',hall:'议事与学堂',fields:'田园',forest:'林地',river:'河岸',road:'山路',quarry:'石场'};
export const periods={day:'白昼',night:'夜间'};
export const weathers={clear:'晴',overcast:'阴雾',rain:'雨',snow:'雪'};
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const svg=(title,body,width=1600,height=900)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"><title>${escape(title)}</title>${body}</svg>\n`;
const line=(d,color='#dac8a1',width=5)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const house=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 80L120 0 240 80V250H0Z" fill="#756750" stroke="#dac8a1" stroke-width="5"/><path d="M-20 80L120-10 260 80" fill="none" stroke="#302f29" stroke-width="18"/><rect x="90" y="145" width="55" height="105" fill="#363a31"/><rect x="25" y="115" width="45" height="45" fill="var(--lamp,#d3bc76)"/>${line('M0 90H240M120 90V140')}</g>`;
const tree=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0V270" stroke="#4a4d3a" stroke-width="24"/><path d="M0-100L-110 80H-70L-150 185H150L70 80H110Z" fill="#4b6452" stroke="#8a9a71" stroke-width="4"/></g>`;
const interiors=new Set(['tavern','home','workshop','hall']);
function architecture(scene){
    switch(scene){
    case 'village':return house(110,360,.9)+house(540,320,1.2)+house(1120,380,.8)+line('M750 900Q600 720 750 620','#b4a17c',70);
    case 'fields':return '<path d="M0 500Q700 360 1600 520V900H0Z" fill="#a89c60"/>'+Array.from({length:9},(_,i)=>line(`M${i*210-220} 900L${700+i*65} 480`,'#6d7547',18)).join('')+house(1260,320,.65);
    case 'forest':return Array.from({length:13},(_,i)=>tree(i*139-40,370+(i%3)*80,.7+(i%4)*.2)).join('')+line('M740 900L820 620','#aa9a73',65);
    case 'river':return '<path d="M450 500Q900 430 1600 540V900H180Z" fill="#577f87"/>'+Array.from({length:10},(_,i)=>line(`M${390+i*27} ${590+i*27}h${270+i*12}`,'#b0c5bb',3)).join('')+line('M140 590L650 630M170 610V750M580 650V790','#99866a',25)+'<path d="M850 730h240l-40 60H900Z" fill="#594f3f"/>'+line('M970 730V530L1110 680H970');
    case 'road':return '<path d="M0 620L420 190 740 560 1090 240 1600 600V900H0Z" fill="#6c7564"/>'+line('M500 920Q850 690 800 570T1030 470','#beac86',85)+tree(170,570,.9)+tree(1310,620,.8);
    case 'quarry':return '<path d="M0 650L330 220H680L920 560 1600 330V900H0Z" fill="#858578"/>'+line('M100 700H630V520H770V400M1080 700H1490M340 300V560H560','#c0bda0',12)+'<path d="M820 700h180v125H820zM1070 740h220v100h-220z" fill="#a9a58d" stroke="#4c5045" stroke-width="6"/>'+line('M1180 500L1060 650M1100 520L1240 640','#594e3b',16);
    default:{
        const room='<rect y="160" width="1600" height="740" fill="#655e4b"/>'+Array.from({length:6},(_,i)=>line(`M${i*320} 160V900`,'#3f4034',18)).join('')+'<path d="M0 0H1600V165H0Z" fill="#393d31"/>'+line('M0 860L1600 720M0 750L1600 640','#98876b',10);
        const window='<rect x="1120" y="210" width="310" height="290" rx="90" fill="url(#sky)" stroke="#c4b08c" stroke-width="16"/>'+line('M1275 210V500M1120 360H1430','#5a503f',12);
        const table='<path d="M260 580H920L1010 660H170Z" fill="#a08a63" stroke="#d2ba8f" stroke-width="6"/>'+line('M240 665V840M950 665V840','#39392f',26);
        let detail='';
        if(scene==='tavern')detail='<path d="M60 520V330H370V520Z" fill="#3b3c32"/><path d="M150 490Q110 410 210 370Q190 435 260 490Z" fill="#ddac66"/><ellipse cx="670" cy="610" rx="75" ry="20" fill="#d3c09a"/>'+line('M650 610V560H720V605');
        if(scene==='home')detail='<path d="M120 630H850V820H120Z" fill="#aaa182"/><path d="M120 630H850V710H120Z" fill="#687b6b"/><rect x="180" y="605" width="160" height="55" rx="20" fill="#d8cbaa"/>'+line('M430 580V420H800V580','#b3a07c',12);
        if(scene==='workshop')detail='<path d="M550 550H820L730 610H630V660H800V695H500V660H590V610Z" fill="#343b36"/>'+line('M360 570L470 460M420 450L500 510','#d5c098',20)+'<circle cx="90" cy="620" r="150" fill="none" stroke="#bcac88" stroke-width="16"/>'+line('M-60 620H240M90 470V770');
        if(scene==='hall')detail='<path d="M430 590L620 555 810 590V630L620 600 430 630Z" fill="#ddd1ad"/>'+line('M620 560V600','#756c53',4)+'<rect x="250" y="200" width="410" height="240" fill="#435a4b" stroke="#baa47a" stroke-width="10"/>'+line('M300 280H590M300 325H540M300 370H570');
        return room+window+(scene==='home'?'':table)+detail;
    }}
}
export function backgroundSVG(scene,period,weather){
    const night=period==='night',inside=interiors.has(scene),sky=night?'#192f3c':weather==='clear'?'#adc7bd':'#829699';
    const title=`${scenes[scene]} · ${periods[period]} · ${weathers[weather]}`;
    const clip=inside?' clip-path="url(#window)"':'';
    let atmosphere='';
    if(weather==='overcast')atmosphere='<path d="M0 190Q200 40 450 160T950 160T1600 130V320H0Z" fill="#bdc6be" opacity=".35"/><path d="M0 560Q400 480 800 560T1600 560V740H0Z" fill="#c7cfc1" opacity=".28"/>';
    if(weather==='rain')atmosphere=Array.from({length:85},(_,i)=>line(`M${(i*193)%1640} ${(i*137)%800}l-25 65`,'#c0d0c6',3)).join('')+'<path d="M0 100Q400-80 800 120T1600 100V230H0Z" fill="#364d55" opacity=".7"/>';
    if(weather==='snow')atmosphere=Array.from({length:100},(_,i)=>`<circle cx="${(i*173)%1600}" cy="${(i*137)%880}" r="${3+i%5}" fill="#ecede0" opacity=".8"/>`).join('')+(inside?'':'<path d="M0 800Q400 730 850 800T1600 770V900H0Z" fill="#e1e1ce" opacity=".7"/>');
    const light=weather==='clear'?(night?'<circle cx="1260" cy="125" r="48" fill="#e3d8aa"/><circle cx="1280" cy="110" r="43" fill="#192f3c"/>':'<circle cx="1260" cy="125" r="65" fill="#f2df9e"/>'):'';
    return svg(title,`<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="${night?'#586754':'#d2ce9d'}"/></linearGradient><clipPath id="window"><rect x="1128" y="218" width="294" height="274" rx="80"/></clipPath></defs><g style="--lamp:${night?'#e6b96a':'#c4cfb8'}"><rect width="1600" height="900" fill="url(#sky)"/>${light}<path d="M0 520Q450 250 800 490T1600 470V900H0Z" fill="#6e8468"/><path d="M0 670Q700 450 1600 630V900H0Z" fill="#526853"/>${architecture(scene)}<g${clip}>${atmosphere}</g>${night?'<rect width="1600" height="900" fill="#0b202a" opacity=".25"/>':''}${inside&&night?'<circle cx="790" cy="290" r="30" fill="#e3bd75"/>'+line('M790 0V260','#c6b28c',5):''}<rect x="22" y="22" width="1556" height="856" rx="14" fill="none" stroke="#d1c297" stroke-width="3" opacity=".4"/></g>`);
}

export function sceneFor(place){
    const s=`${place.name} ${place.terrain??''}`;
    if(/酒馆|共灶|厨房/.test(s))return 'tavern';
    if(/居处|小屋|住宅/.test(s))return 'home';
    if(/议事|村务|换工屋|学堂|记事屋|驿站|坛|殿/.test(s))return 'hall';
    if(/工坊|修整院|缝|磨坊|铁匠|织坊|织屋|木作|木台|席.*屋|棚|晒线/.test(s))return 'workshop';
    if(/石场|采石|砾场|砾石整边院|碎石|玄岩/.test(s))return 'quarry';
    if(/林|树地|果园/.test(s))return 'forest';
    if(/田|园|圃|菜床|药草院|蜂场/.test(s))return 'fields';
    if(/路|山道/.test(s))return 'road';
    if(/河|渡|岸|滩|苇|泉槽|湿地/.test(s)&&!s.includes('村'))return 'river';
    if(/山|峡|沙丘|断崖|裂谷|台原/.test(s)&&!s.includes('村'))return 'road';
    return 'village';
}
export function crestFor(occupation='',minor=false){
    if(minor)return 'student';
    if(!occupation||/^未登记|^未知/.test(occupation))return 'household';
    for(const [id,pattern]of [['scribe',/簿|记|抄|代笔|字|教师|绘图|描|签/],['weaver',/织|缝|衣|丝|线|绣|布|席/],['smith',/铁|铆|修理/],['woodworker',/木|柄|梭|桶|篱|架|榫|竹|绳/],['healer',/药/],['boatman',/船|篙|渔|鱼|网/],['warden',/巡|猎/],['cook',/灶|酒馆|食|炊/],['mason',/石|墙|槽/],['mage',/法师/],['merchant',/商|货/],['farmer',/农|田|园|叶|种|桑|菜|鸡|草|畜|蜂/]])if(pattern.test(occupation))return id;
    return 'household';
}
const glyphs={student:line('M35 40L64 32 93 40V91L64 83 35 91ZM64 32V83'),scribe:line('M35 88L88 35M76 35L91 50M30 98H98'),weaver:line('M30 36H98V92H30ZM42 30V98M60 30V98M78 30V98M25 52H103M25 72H103'),smith:line('M27 58H100L83 73H68V87H92V98H36V87H54V73ZM43 30L72 48'),woodworker:line('M37 98L82 30M64 30L96 51 76 74 51 52'),healer:line('M63 100V48M63 70Q20 65 32 34Q65 32 63 70M64 82Q106 67 97 48Q67 47 64 82'),boatman:line('M24 79H105L89 99H42ZM63 79V29L94 69H63'),warden:line('M45 29Q103 64 45 101M45 29V101M24 64H101M89 54L102 64 89 74'),cook:line('M29 59H99L91 96H37ZM34 59V45H92V59M50 36V27M73 36V27'),mason:line('M27 62H75V98H27ZM55 30H101V62H55M75 78H101'),mage:line('M64 26L73 53 102 63 73 74 64 103 54 74 26 63 54 53Z'),merchant:line('M64 27V101M31 45H97M40 45L25 75H55ZM88 45L73 75H103ZM43 101H85'),farmer:line('M64 101V30M64 45Q37 43 40 27Q62 27 64 45M64 65Q91 64 88 45Q66 45 64 65M64 85Q37 83 40 65Q62 65 64 85'),household:line('M29 63L64 31 99 63V100H29ZM53 100V75H76V100')};
export const logoSVG=()=>svg('无限原野 · 河谷纹章','<rect width="128" height="128" rx="25" fill="#253e3c"/><circle cx="64" cy="64" r="54" fill="none" stroke="#d1bd8e" stroke-width="3"/><circle cx="82" cy="39" r="11" fill="#d1bd8e"/><path d="M19 78L44 42 69 74 89 56 111 80V105H19Z" fill="#839b78"/>'+line('M25 91Q50 70 69 89T107 90','#e5d9b5',6),128,128);
function logoPNG(){
    // The same original mountain, sun and river geometry, rasterized for chara PNG.
    const size=128,raw=Buffer.alloc((size*4+1)*size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        let color=[37,62,60];const radius=Math.hypot(x-64,y-64);
        if(Math.abs(radius-54)<1.6||Math.hypot(x-82,y-39)<11)color=[209,189,142];
        const top=x<44?78-(x-19)*36/25:x<69?42+(x-44)*32/25:x<89?74-(x-69)*18/20:56+(x-89)*24/22;
        if(x>=19&&x<=111&&y>=top&&y<=105)color=[131,155,120];
        if(x>25&&x<107&&Math.abs(y-(89+7*Math.sin((x-50)/13)))<3)color=[229,217,181];
        const i=y*(size*4+1)+1+x*4;raw.set([...color,255],i);
    }
    const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
    const chunk=(name,data)=>{const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(name,4);data.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,-4)),out.length-4);return out;};
    const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export async function buildArt({world=null,destination=path.join(root,'assets/visual'),artDestination=path.join(root,'world/art')}={}){
    world??=await loadWorld();
    const write=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,value);};
    const backgrounds={};
    for(const scene of Object.keys(scenes))for(const period of Object.keys(periods))for(const weather of Object.keys(weathers)){
        const key=`${scene}-${period}-${weather}`,file=`backgrounds/${key}.svg`;backgrounds[key]={file,scene,period,weather,label:`${scenes[scene]} · ${periods[period]} · ${weathers[weather]}`};
        await write(path.join(destination,file),backgroundSVG(scene,period,weather));
    }
    for(const [id,glyph]of Object.entries(glyphs))await write(path.join(destination,`crests/${id}.svg`),svg(`日常职业纹章 · ${id}`,'<rect width="128" height="128" rx="24" fill="#253e3c"/><path d="M18 18H110V76Q110 106 64 117Q18 106 18 76Z" fill="#485f50" stroke="#d1bd8e" stroke-width="3"/>'+glyph,128,128));
    await write(path.join(destination,'logo.svg'),logoSVG());await write(path.join(destination,'logo.png'),logoPNG());
    const portraits={},prompts=[];
    for(const npc of [...world.npcs,...(world.residents??[])]){
        const minor=npc.flags?.minor===true||npc.age<18,crest=crestFor(npc.occupation,minor);portraits[npc.id]=`crests/${crest}.svg`;
        prompts.push({id:npc.id,name:npc.name,occupation:npc.occupation,age:npc.age,minor,crest:portraits[npc.id],prompt:`原创河谷日常职业纹章；${npc.name}，${npc.age}岁，${npc.occupation}。以${crest}工具图形置于圆角盾牌，松绿底与麦金轮廓，无文字，无肖像，无亲密或恋爱元素。仅采用已登记日常职业，不绘制人物私事。`});
    }
    const manifest={format:1,logo:'logo.svg',backgrounds,locations:Object.fromEntries(world.locations.map(place=>[place.id,sceneFor(place)])),portraits,weatherGroups:{晴:'clear',阴:'overcast',雾:'overcast',雨:'rain',暴雨:'rain',雪:'snow'}};
    await write(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    await write(path.join(artDestination,'mapping.json'),JSON.stringify(manifest,null,2)+'\n');
    await write(path.join(artDestination,'portrait-prompts.json'),JSON.stringify(prompts,null,2)+'\n');
    return {backgrounds:Object.keys(backgrounds).length,portraits:prompts.length,locations:world.locations.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename)console.log(JSON.stringify(await buildArt()));
