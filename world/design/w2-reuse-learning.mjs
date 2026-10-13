import {reuseSpellCandidates, reuseLearningReferences, withReuseCandidates} from './w2-reuse-candidates.mjs';

// Zero-model source increment. Only the caller's cloned candidate world is
// changed; T19 owns publication after source L2/L4 approval.
export const revision = 'w2-reuse-learning-1';
const spells = reuseSpellCandidates();
const volumes = [
 {id:'item_book_w2_reuse_basic',name:'初阶杂术校读册',grade:'初级',minutes:120,price:24},
 {id:'item_book_w2_reuse_middle',name:'一阶习术校读册',grade:'中级',minutes:240,price:80},
 {id:'item_book_w2_reuse_advanced',name:'二阶习术校读册',grade:'高级',minutes:480,price:200},
];
export const sources = {
 mappings: reuseLearningReferences.map(ref => {
  const spell = spells.find(row => row.id === ref.spell);
  const volume = volumes.find(row => row.id === ref.book);
  return {
   ...ref, name:spell.name,
   skill:{id:spell.skill,name:spell.name,aliases:[],scope:null,attribute:'精神',
    profession:'profession_mage',stage:spell.stage,action:'cast',
    description:`用于施展${spell.name}，材料及效果以对应法术为准。`,
    learnFee:spell.learnFee,learnMinutes:spell.learnMinutes,prerequisites:[],combatAction:null},
   teachers:[],sourceOwner:'npc_hw_luqing',readingMinutes:volume.minutes,
   minimumLiteracy:100,requiresCertification:spell.stage>0?'profession_mage':null,
   sourceDesign:'陆青出售未署名校读抄本；出售不授予其法术教学资格，须持有完好的书逐项研读。',
  };
 }),
 teacherChanges:[],
 books:volumes.map(volume => ({
  item:{id:volume.id,name:volume.name,aliases:[],scope:null,quality:'木',durability:80,
   weight:0.18,basePrice:volume.price,tags:['paper','book'],origin:'bld_hw_school',
   shelfLifeDays:365,seasonality:'现有抄本售罄后不自动补货',
   book:{grade:volume.grade,author:'未署名旧抄本',edition:'河谷流通校读本',origin:'bld_hw_school',
    teaches:reuseLearningReferences.filter(ref=>ref.book===volume.id).map(ref=>ref.spell),
    readingMinutes:volume.minutes,prerequisites:[]}},
  stock:{owner:'npc_hw_luqing',item:volume.id,quantity:2,
   mode:'新增有限NPC商品候选，禁止复制进玩家背包'},
 })),
};
export const entries = sources.books.map(row=>({...row.item,stock:row.stock}));

// These drafts are input for a frozen-draft source review, not approval.
export function reviewDraftFor(entry) {
 const names = entry.book.teaches.map(id=>spells.find(spell=>spell.id===id).name).join('、');
 const certification = entry.book.grade==='初级'?'无须法师认证':'须有法师认证';
 return {id:entry.id,prose:{
  description:`未署名的${entry.book.grade}抄本收录${names}。识字达到100，${certification}，且持有完好的书，才可每次用${entry.book.readingMinutes}分钟研读其中一种；智力检定未通过仍花去时间，书不会因此消失。`,
  inspection:'逐节核对标题和末页，查看页码是否连续，有无缺页或大片洇墨。校读旁注与正文分栏书写，纸色和装订样式都不能证明未署名作者的身份。',
  storage:'翻阅前擦净手上的水渍与泥土，把纸页平放在干燥桌面。读后合入书匣，远离炉火，用干净纸条标记读到的位置，避免反复折角遮住末行文字。',
 }};
}
export function materialize(entry, draft=reviewDraftFor(entry)) {
 const {stock,...item}=entry;
 return {...structuredClone(item),...structuredClone(draft.prose)};
}

// Facts are taken from the world supplied by the review caller. The existing
// content-pipeline defaultReviewRequest accepts this entry/draft/context shape.
export function contextFor(entry, world) {
 const seller=world.npcs.find(npc=>npc.id===entry.stock.owner);
 return {
  seller:{id:seller.id,name:seller.name,services:seller.services,
   serviceCatalog:seller.serviceCatalog,schedule:seller.schedule},
  sale:{location:entry.origin,name:world.locations.find(row=>row.id===entry.origin).name,
   stock:entry.stock,basePrice:entry.basePrice,priceMode:'engineQuote',transactionMinutes:5},
  teaches:sources.mappings.filter(row=>row.book===entry.id),
  rules:world.rules.books,
  actualRules:'只审书籍及学习来源增量，法术正文沿原审核结果。书商出售实际有限库存，不能免费赠书或宣称会教授这些法术。交易按既有地域报价，标价是基础价，不保证固定成交价。购买须在书商清醒、在场且作息允许交易时完成，午饭、休息日和夜间不营业。每次只研读一种法术，失败仍消耗完整阅读时间并保留购书成本和原书，不退购书款；不另扣教学费。成功只登记法术与0熟练技能，不附赠施法材料、魔力或精神施法许可。',
 };
}

export function withReuseLearningCandidates(source) {
 const world=withReuseCandidates(source);
 for (const mapping of sources.mappings) {
  const skill=world.skills.find(row=>row.id===mapping.skill.id);
  Object.assign(skill,structuredClone(mapping.skill));
 }
 for (const entry of entries) {
  if (!world.items.some(item=>item.id===entry.id)) world.items.push(materialize(entry));
  const seller=world.npcs.find(npc=>npc.id===entry.stock.owner);
  seller.inventory??={};
  // A zero or a damaged copy is still existing stock; do not replenish it.
  if (!Object.hasOwn(seller.inventory,entry.id)) seller.inventory[entry.id]=entry.stock.quantity;
 }
 return world;
}
