/** Deterministic exact-mark selection for mocks. Earlier candidates (e.g. unseen questions) are preferred. */
export type MockCandidate={id:string;marks:number};
export function selectExactMarks<T extends MockCandidate>(candidates:readonly T[],target:number):T[]|null{
 if(!Number.isInteger(target)||target<1||target>300)throw new Error('INVALID_TARGET');
 const seen=new Set<string>();
 const items=candidates.filter(c=>Number.isInteger(c.marks)&&c.marks>=1&&c.marks<=12&&!seen.has(c.id)&&!!seen.add(c.id));
 const n=items.length;const reach=Array.from({length:n+1},()=>new Uint8Array(target+1));reach[n][0]=1;
 for(let i=n-1;i>=0;i--){const m=items[i].marks,next=reach[i+1],row=reach[i];for(let s=0;s<=target;s++)row[s]=(next[s]||(s>=m&&next[s-m]))?1:0;}
 if(!reach[0][target])return null;
 const out:T[]=[];let remaining=target;
 for(let i=0;i<n&&remaining>0;i++){const m=items[i].marks;if(m<=remaining&&reach[i+1][remaining-m]){out.push(items[i]);remaining-=m;}}
 return remaining===0?out:null;
}
export function availableMarks(candidates:readonly MockCandidate[]):number{return candidates.reduce((s,c)=>s+(Number.isInteger(c.marks)?c.marks:0),0);}
