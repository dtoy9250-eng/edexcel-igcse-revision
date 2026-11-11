/**
 * Extracts numbered content statements from the official Pearson Edexcel International GCSE
 * specification PDFs. Pure functions only: callers fetch the PDF, verify its SHA-256 and pass
 * positioned text items. Statements carrying a B/C/P suffix are Paper 2 extension content.
 * Extracted text stays in the learner's private database; it is never committed to this repository.
 */
export type TextItem={str:string;x:number;y:number;width:number;height:number};
export type ExtractedStatement={reference:string;number:string;suffix:''|'B'|'C'|'P';group:string;subtopic:string;text:string;page:number;scope:'core'|'extended'};
export type CrossCheck={ok:boolean;statements:number;core:number;extended:number;doubleAwardStatements:number;matched:number;textMatches:number;
 missingFromDoubleAward:string[];unexpectedInDoubleAward:string[];duplicates:string[];issues:string[]};

const STATEMENT=/^(\d{1,2})\.(\d{1,2})([BCP]?)\s+(\S.*)$/;
const SUBTOPIC=/^\(?[a-z]\)\s+[A-Z]/;
const HEADING=/^\d{1,2}\s+[A-Z][A-Za-z ,'’()–-]*$/;
const MAX_TEXT=1500;
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
function isFooter(line:string){return /^Pearson Edexcel International GCSE/.test(line)||/^Specification\s+[–-]\s+Issue/.test(line)||line.includes('© Pearson Education Limited');}
function isTerminator(line:string){return line==='Students should:'||line.startsWith('The following sub-topics are covered')||/^Specification points?\s/.test(line)||/^Appendix\b/.test(line)||HEADING.test(line);}

/** Groups positioned text items into reading-order lines (top to bottom, left to right). */
export function linesFromItems(items:readonly TextItem[]):string[]{
 const rows:{y:number;tol:number;items:TextItem[]}[]=[];
 for(const item of items){
  if(!item.str)continue;
  const row=rows.find(r=>Math.abs(r.y-item.y)<=Math.max(r.tol,0.45*(item.height||0),2.5));
  if(row){row.items.push(item);if(item.str.trim()&&item.height>=row.tol/0.45){row.y=item.y;}}
  else rows.push({y:item.y,tol:Math.max(2.5,0.45*(item.height||0)),items:[item]});
 }
 rows.sort((a,b)=>b.y-a.y);
 return rows.map(r=>{
  const sorted=[...r.items].sort((a,b)=>a.x-b.x);let line='',end=-Infinity;
  for(const it of sorted){
   if(line&&!/\s$/.test(line)&&!/^\s/.test(it.str)&&it.x-end>Math.max(1,0.15*(it.height||0)))line+=' ';
   line+=it.str;end=it.x+(it.width||0);
  }
  return clean(line);
 }).filter(Boolean);
}

/** Parses statements from per-page lines. Footers are skipped so statements may continue across pages. */
export function parseStatements(pages:readonly (readonly string[])[]):ExtractedStatement[]{
 const out:ExtractedStatement[]=[];let current:ExtractedStatement|null=null;let subtopic='';
 const close=()=>{if(current){current.text=clean(current.text).slice(0,MAX_TEXT);out.push(current);current=null;}};
 pages.forEach((lines,pageIndex)=>{
  for(let i=0;i<lines.length;i++){
   const line=clean(lines[i]);if(!line||isFooter(line))continue;
   const m=STATEMENT.exec(line);
   if(m){close();const suffix=m[3] as ''|'B'|'C'|'P';
    current={reference:`${m[1]}.${m[2]}${suffix}`,number:`${m[1]}.${m[2]}`,suffix,group:m[1],subtopic,text:m[4],page:pageIndex+1,scope:suffix?'extended':'core'};continue;}
   if(SUBTOPIC.test(line)&&lines.slice(i+1,i+3).some(l=>clean(l)==='Students should:')){close();subtopic=line;continue;}
   if(isTerminator(line)){close();continue;}
   if(current)current.text+=' '+line;
  }
 });
 close();return out;
}

const norm=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
/** Splits the Double Award statement stream into its Biology, Chemistry and Physics sections. */
export function splitDoubleAward(statements:readonly ExtractedStatement[]):ExtractedStatement[][]{
 const starts=statements.map((s,i)=>s.number==='1.1'?i:-1).filter(i=>i>=0);
 return starts.map((start,k)=>statements.slice(start,starts[k+1]??statements.length));
}
/**
 * Cross-checks scope classification: every unsuffixed statement of a separate-science specification
 * must appear in the matching Double Award section, and no suffixed (extension) statement may.
 */
export function crossCheck(separate:readonly ExtractedStatement[],doubleAward:readonly ExtractedStatement[]):CrossCheck{
 const issues:string[]=[];const refs=separate.map(s=>s.reference);
 const duplicates=[...new Set(refs.filter((r,i)=>refs.indexOf(r)!==i))];
 const da=new Map(doubleAward.map(s=>[s.number,s]));const core=separate.filter(s=>s.scope==='core'),extended=separate.filter(s=>s.scope==='extended');
 const missingFromDoubleAward=core.filter(s=>!da.has(s.number)).map(s=>s.reference);
 const coreNumbers=new Set(core.map(s=>s.number));
 const unexpectedInDoubleAward=doubleAward.filter(s=>s.suffix!==''||!coreNumbers.has(s.number)).map(s=>s.reference);
 const textMatches=core.filter(s=>{const d=da.get(s.number);return !!d&&norm(d.text)===norm(s.text);}).length;
 if(!separate.length)issues.push('NO_STATEMENTS_FOUND');
 if(duplicates.length)issues.push('DUPLICATE_REFERENCES');
 if(missingFromDoubleAward.length)issues.push('CORE_MISSING_FROM_DOUBLE_AWARD');
 if(unexpectedInDoubleAward.length)issues.push('EXTENSION_OR_UNKNOWN_IN_DOUBLE_AWARD');
 if(extended.some(s=>da.has(s.number)))issues.push('EXTENSION_NUMBER_IN_DOUBLE_AWARD');
 if(textMatches<Math.ceil(core.length*0.9))issues.push('TEXT_AGREEMENT_BELOW_90_PERCENT');
 return {ok:issues.length===0,statements:separate.length,core:core.length,extended:extended.length,doubleAwardStatements:doubleAward.length,
  matched:core.length-missingFromDoubleAward.length,textMatches,missingFromDoubleAward,unexpectedInDoubleAward,duplicates,issues};
}
