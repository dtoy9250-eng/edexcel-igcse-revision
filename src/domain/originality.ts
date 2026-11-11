/** A limited private-corpus risk signal, not a certification of global originality. */
export function normalise(text:string):string{return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function shingles(words:readonly string[],size:number):Set<string>{return new Set(Array.from({length:Math.max(0,words.length-size+1)},(_,i)=>words.slice(i,i+size).join(' ')));}
export function similarity(a:string,b:string):number{
 const na=normalise(a),nb=normalise(b);if(!na||!nb)return 0;if(na===nb)return 1;
 // Fixed 5-word shingles gave prompts under five words no shingles, so near-copies scored 0.
 // Shrink the window for short texts; prompts of ten or more words keep 5-word shingles.
 const wa=na.split(' '),wb=nb.split(' '),size=Math.max(1,Math.min(5,Math.floor(Math.min(wa.length,wb.length)/2)));
 const sa=shingles(wa,size),sb=shingles(wb,size);if(!sa.size||!sb.size)return 0;
 const intersection=[...sa].filter(s=>sb.has(s)).length;return intersection/(sa.size+sb.size-intersection);
}
export function originalityScreen(prompt:string,privateSources:readonly string[],threshold=0.55){
 if(!Number.isFinite(threshold)||threshold<=0||threshold>1)throw new Error('INVALID_SIMILARITY_THRESHOLD');
 const maximum=privateSources.reduce((n,s)=>Math.max(n,similarity(prompt,s)),0);
 return {passed:maximum<threshold,maximum_similarity:maximum,compared_sources:privateSources.length,
 limitation:'Checks only the supplied private corpus; it cannot certify global originality.'};
}
