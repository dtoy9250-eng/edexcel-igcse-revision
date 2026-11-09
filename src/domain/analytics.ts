export type PerformanceRecord={attempt_id:string;topic_id:string;earned:number;available:number;seconds:number;submitted_at:string;misconceptions:string[];accepted_validated:boolean};
export type TopicPerformance={topic_id:string;attempts:number;earned:number;available:number;accuracy:number|null;seconds:number;improvement:number|null;mistakes:{tag:string;count:number}[]};
function ratio(items:readonly PerformanceRecord[]):number|null{const max=items.reduce((s,r)=>s+r.available,0);return max?items.reduce((s,r)=>s+r.earned,0)/max:null;}
export function aggregatePerformance(records:readonly PerformanceRecord[],topicIds:readonly string[]):TopicPerformance[]{
 const valid=records.filter(r=>r.accepted_validated);const seen=new Set<string>();
 for(const r of valid){
  if(seen.has(r.attempt_id))throw new Error('DUPLICATE_ACCEPTED_ATTEMPT');seen.add(r.attempt_id);
  if(!Number.isInteger(r.earned)||!Number.isInteger(r.available)||r.available<1||r.earned<0||r.earned>r.available||!Number.isInteger(r.seconds)||r.seconds<0||r.seconds>86400||!Number.isFinite(Date.parse(r.submitted_at)))throw new Error('INVALID_PERFORMANCE_RECORD');
 }
 return [...new Set(topicIds)].map(topic_id=>{
  const rows=valid.filter(r=>r.topic_id===topic_id).sort((a,b)=>Date.parse(a.submitted_at)-Date.parse(b.submitted_at));
  const midpoint=Math.floor(rows.length/2),before=ratio(rows.slice(0,midpoint)),after=ratio(rows.slice(midpoint));
  const mistakes=new Map<string,number>();for(const r of rows)for(const tag of new Set(r.misconceptions))mistakes.set(tag,(mistakes.get(tag)??0)+1);
  return {topic_id,attempts:rows.length,earned:rows.reduce((s,r)=>s+r.earned,0),available:rows.reduce((s,r)=>s+r.available,0),accuracy:ratio(rows),
   seconds:rows.reduce((s,r)=>s+r.seconds,0),improvement:rows.length>=4&&before!==null&&after!==null?after-before:null,
   mistakes:[...mistakes].map(([tag,count])=>({tag,count})).sort((a,b)=>b.count-a.count||a.tag.localeCompare(b.tag))};
 });
}
export function recommend(performance:readonly TopicPerformance[],limit=3){
 if(!Number.isInteger(limit)||limit<0||limit>20)throw new Error('INVALID_RECOMMENDATION_LIMIT');
 return performance.map(p=>({topic_id:p.topic_id,kind:p.attempts===0?'diagnostic' as const:'targeted' as const,
 priority:p.accuracy===null?0.5:(1-p.accuracy)*Math.log2(p.available+2)+p.mistakes.filter(m=>m.count>=2).length*0.2,
 sample_size:p.attempts,reason:p.attempts===0?'No assessed attempts yet. Start with a diagnostic question.':
 `${p.earned}/${p.available} marks across ${p.attempts} validated attempt${p.attempts===1?'':'s'}.${p.mistakes.some(m=>m.count>=2)?' Repeated misconceptions were recorded.':''}`
 })).sort((a,b)=>b.priority-a.priority||a.topic_id.localeCompare(b.topic_id)).slice(0,limit);
}
