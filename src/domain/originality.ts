/** A limited private-corpus risk signal, not a certification of global originality. */
export function normalise(text:string):string{return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function shingles(text:string,size=5):Set<string>{const words=normalise(text).split(' ');return new Set(Array.from({length:Math.max(0,words.length-size+1)},(_,i)=>words.slice(i,i+size).join(' ')));}
export function similarity(a:string,b:string):number{
 const na=normalise(a),nb=normalise(b);if(!na||!nb)return 0;if(na===nb)return 1;
 const sa=shingles(a),sb=shingles(b);if(!sa.size||!sb.size)return 0;
 const intersection=[...sa].filter(s=>sb.has(s)).length;return intersection/(sa.size+sb.size-intersection);
}
export function originalityScreen(prompt:string,privateSources:readonly string[],threshold=0.55){
 if(!Number.isFinite(threshold)||threshold<=0||threshold>1)throw new Error('INVALID_SIMILARITY_THRESHOLD');
 const maximum=privateSources.reduce((n,s)=>Math.max(n,similarity(prompt,s)),0);
 return {passed:maximum<threshold,maximum_similarity:maximum,compared_sources:privateSources.length,
 limitation:'Checks only the supplied private corpus; it cannot certify global originality.'};
}
