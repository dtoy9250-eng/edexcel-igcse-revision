// Downloads the four official specifications, checks the SHA-256 values recorded in the catalog
// migrations, and runs the statement-scope cross-check. Prints counts only; no Pearson text is saved.
import { createHash } from 'node:crypto';
import { getDocumentProxy } from 'unpdf';
import { linesFromItems,parseStatements,splitDoubleAward,crossCheck } from '../src/catalog/spec-parser.ts';
const base='https://qualifications.pearson.com/content/dam/pdf/International%20GCSE/';
const sources={
 '4BI1':[base+'Biology/2017/specification-and-sample-assessments/international-gcse-biology-2017-specification1.pdf','9f474a0ef0e93ef3c3107b568956d163454cdb476bb2017189e8dd12c0d58cef'],
 '4CH1':[base+'Chemistry/2017/specification-and-sample-assessments/international-gcse-chemistry-2017-specification.pdf','36e2080d2e99f060bcc18f2a9d0bbd8b29498b45e007fa232e3befcd89b73362'],
 '4PH1':[base+'Physics/2017/specification-and-sample-assessments/international-gcse-physics-2017-specification.pdf','bac4b8312d4fbfc84672f909100d66b2b3cda0b25e98c0d11bbc7366dae482b2'],
 '4SD0':[base+'Science%20(Double%20Award)/2017/specification-and-sample-assessments/international-gcse-science-double-award-2017-specification1.pdf','5780fb046368974e2aad45415448682634a8e9afcab77bfd29fdf61cec56ac17']
} as const;
async function pages(code:keyof typeof sources){
 const [url,sha]=sources[code];const res=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; ScienceLedger/1.0)'}});
 if(!res.ok)throw new Error(`${code}: HTTP ${res.status}`);const bytes=new Uint8Array(await res.arrayBuffer());
 const digest=createHash('sha256').update(bytes).digest('hex');if(digest!==sha)throw new Error(`${code}: checksum mismatch ${digest}`);
 const pdf=await getDocumentProxy(bytes);const out:string[][]=[];
 for(let p=1;p<=pdf.numPages;p++){const tc=await (await pdf.getPage(p)).getTextContent();
  out.push(linesFromItems((tc.items as {str?:string;transform:number[];width:number;height:number}[]).filter(i=>typeof i.str==='string').map(i=>({str:i.str as string,x:i.transform[4],y:i.transform[5],width:i.width,height:i.height}))));}
 return out;
}
const double=splitDoubleAward(parseStatements(await pages('4SD0')));let ok=true;
for(const [i,code] of (['4BI1','4CH1','4PH1'] as const).entries()){
 const c=crossCheck(parseStatements(await pages(code)),double[i]??[]);ok&&=c.ok;
 console.log(code,`checksum verified; ${c.statements} statements (${c.core} core, ${c.extended} extension); Double Award matches ${c.matched}/${c.core}; text agreement ${c.textMatches}/${c.core}; issues: ${c.issues.join(', ')||'none'}`);
}
process.exit(ok?0:1);
