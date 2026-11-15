import 'server-only';
import { createHash } from 'node:crypto';
import { getDocumentProxy } from 'unpdf';
import { linesFromItems,parseStatements,type TextItem } from '../src/catalog/spec-parser.ts';
const PEARSON='https://qualifications.pearson.com/';
/** Downloads an official specification and refuses it unless its SHA-256 matches the catalog record. */
export async function fetchVerifiedPdf(url:string,sha256:string){
 if(!url.startsWith(PEARSON))throw new Error('SOURCE_NOT_ALLOWED');
 const res=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; ScienceLedger/1.0)'},signal:AbortSignal.timeout(30_000)});
 if(!res.ok)throw new Error(`SOURCE_HTTP_${res.status}`);
 const bytes=new Uint8Array(await res.arrayBuffer());if(bytes.byteLength>40*1024*1024)throw new Error('SOURCE_TOO_LARGE');
 if(createHash('sha256').update(bytes).digest('hex')!==sha256)throw new Error('SOURCE_CHECKSUM_MISMATCH');
 return bytes;
}
export async function pdfPages(bytes:Uint8Array,maxPages=150){
 const pdf=await getDocumentProxy(bytes);if(pdf.numPages>maxPages)throw new Error('TOO_MANY_PAGES');
 const pages:{lines:string[];width:number;height:number}[]=[];
 for(let p=1;p<=pdf.numPages;p++){
  const page=await pdf.getPage(p);const vp=page.getViewport({scale:1});const tc=await page.getTextContent();const items:TextItem[]=[];
  for(const i of tc.items as {str?:string;transform?:number[];width?:number;height?:number}[])if(typeof i.str==='string'&&i.transform)items.push({str:i.str,x:i.transform[4],y:i.transform[5],width:i.width??0,height:i.height??0});
  pages.push({lines:linesFromItems(items),width:vp.width,height:vp.height});
 }
 return {numPages:pdf.numPages,pages};
}
export async function specificationStatements(url:string,sha256:string){
 const {pages}=await pdfPages(await fetchVerifiedPdf(url,sha256));return parseStatements(pages.map(p=>p.lines));
}
