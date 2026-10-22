// The shared reading gates of a book: an intact copy the reader actually
// holds, a registered subject inside it, literacy (and, where a caller
// supplies it, the book's language), the grade needed for the subject and
// the book's prerequisites. education.mjs (legacy lessons) and
// primitives-learning.mjs (native study) both read a book through this; they
// differ only in how a refusal is reported, via `fail(code,english,chinese)`.
import {knowledgeProficiency} from './education-state.mjs';
export function readBook(d,e,holder,source,entity,{fail,language=null}){
 const s=d.get('state'),unit=s.itemInstances?.[source],item=unit?.item??source;
 const b=s.created?.[item]??e.byId.get(item),content=s.created?.[entity]??e.byId.get(entity);
 if(e.quantity(d,holder,item)<1||unit&&(unit.owner!==holder||unit.status!=='持有'||unit.durability===0))fail('E-LEARN-SOURCE','The learner does not hold this intact book','读者没有持有完好书本');
 const held=d.get(...e.bagPath(holder),item),copies=(held?.instances??[]).map(id=>s.itemInstances?.[id]).filter(u=>u&&u.owner===holder&&u.status==='持有');
 if(held?.durability===0)fail('E-LEARN-SOURCE','A readable physical copy must be selected','书页已损坏');
 if(!unit&&copies.length>=e.quantity(d,holder,item))fail('E-LEARN-SOURCE','A readable physical copy must be selected','抄本须指定实际单件');
 const book=unit?.book??b?.book;
 if(!book||!book.teaches?.includes(entity)||!content)fail('E-LEARN-SOURCE','This book does not contain the registered subject','书中没有这项已登记成果');
 if(language)language({unit,b,book});
 if(knowledgeProficiency(e,s,holder,'skill_literacy')<e.rules.books.minimumLiteracy)fail('E-LEARN-LITERACY','The learner cannot read this book','读者识字能力不足');
 const grade=e.rules.books.grades.indexOf(book.grade),stage=content.stage??Math.floor((content.minimumProficiency??0)/300);
 if(entity.startsWith('spell_')&&stage>=4&&book.rare!==true)fail('E-LEARN-SOURCE','The book grade or rarity does not cover this subject','专家级以上法术需要稀有典籍');
 if(grade<0||grade<Math.min(stage,4))fail('E-LEARN-SOURCE','The book grade or rarity does not cover this subject','书籍品级不足');
 for(const row of b?.book?.prerequisites??[])if(knowledgeProficiency(e,s,holder,typeof row==='string'?row:row.skill)<(typeof row==='string'?1:row.minimum))fail('E-LEARN-PREREQUISITE','A book prerequisite is not met','未满足书籍前置技能');
 return {item,book,minutes:Math.max(content.learnMinutes??0,book.readingMinutes??b?.book?.readingMinutes??0,e.rules.books.readingMinutes[grade]),ceiling:Math.min((grade+1)*300,book.ceilings?.[entity]??Infinity)};
}
