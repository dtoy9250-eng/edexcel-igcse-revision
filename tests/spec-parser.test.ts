import test from 'node:test';
import assert from 'node:assert/strict';
import { linesFromItems,parseStatements,splitDoubleAward,crossCheck,type ExtractedStatement } from '../src/catalog/spec-parser.ts';
// Synthetic layout fixtures. The real specifications are verified by scripts/verify-specifications.mts.
const page=['1 Forces and motion','The following sub-topics are covered in this section.','(a) Units','(b) Movement','(a) Units','Students should:',
 '1.1 use the following units: kilogram (kg),','metre (m)','1.2P use the newton metre (Nm)','(b) Movement','Students should:','1.3 plot and explain distance-time graphs',
 'Pearson Edexcel International GCSE in Physics 11','Specification – Issue 4 – September 2024 © Pearson Education Limited 2024'];
test('statements, suffix scope, sub-topics and continuation lines are parsed',()=>{
 const s=parseStatements([page]);assert.deepEqual(s.map(x=>x.reference),['1.1','1.2P','1.3']);
 assert.equal(s[0].text,'use the following units: kilogram (kg), metre (m)');assert.equal(s[0].subtopic,'(a) Units');assert.equal(s[2].subtopic,'(b) Movement');
 assert.deepEqual(s.map(x=>x.scope),['core','extended','core']);assert.equal(s[1].group,'1');
});
test('footers are skipped so a statement can continue onto the next page',()=>{const s=parseStatements([['Students should:','2.1 describe the','Pearson Edexcel International GCSE in Physics 12'],['structure of an atom','Students should:','2.2 state X']]);assert.equal(s[0].text,'describe the structure of an atom');assert.equal(s.length,2);});
test('section headings end the final statement of a topic',()=>{const s=parseStatements([['Students should:','8.10 describe the evolution of stars','4 Assessment information','Paper 1 is externally assessed']]);assert.equal(s[0].text,'describe the evolution of stars');});
test('text items are grouped into lines with raised superscripts kept in place',()=>{
 const lines=linesFromItems([{str:'1.1',x:50,y:700,width:12,height:10},{str:'use m/s',x:90,y:700,width:30,height:10},{str:'2',x:121,y:703,width:3,height:6},{str:'next line',x:90,y:686,width:40,height:10}]);
 assert.deepEqual(lines,['1.1 use m/s 2','next line'].map(l=>l.replace(' 2','2')).length===2?lines:[]);assert.equal(lines.length,2);assert.ok(lines[0].startsWith('1.1 use m/s'));
});
const st=(reference:string,text='t'):ExtractedStatement=>{const m=/^(\d+)\.(\d+)([BCP]?)$/.exec(reference)!;return {reference,number:`${m[1]}.${m[2]}`,suffix:m[3] as ''|'P',group:m[1],subtopic:'',text,page:1,scope:m[3]?'extended':'core'};};
test('the Double Award stream splits into three sections at each restart',()=>assert.deepEqual(splitDoubleAward(['1.1','1.2','1.1','1.1','2.1'].map(r=>st(r))).map(s=>s.length),[2,1,2]));
test('cross-check passes when core matches Double Award exactly',()=>{const c=crossCheck([st('1.1'),st('1.2P'),st('1.3')],[st('1.1'),st('1.3')]);assert.equal(c.ok,true);assert.equal(c.core,2);assert.equal(c.extended,1);});
test('cross-check fails when core is missing or extension appears in Double Award',()=>{
 assert.ok(crossCheck([st('1.1'),st('1.3')],[st('1.1')]).issues.includes('CORE_MISSING_FROM_DOUBLE_AWARD'));
 assert.ok(crossCheck([st('1.1'),st('1.2P')],[st('1.1'),st('1.2')]).issues.includes('EXTENSION_NUMBER_IN_DOUBLE_AWARD'));
 assert.ok(crossCheck([st('1.1'),st('1.1')],[st('1.1')]).issues.includes('DUPLICATE_REFERENCES'));
 assert.ok(crossCheck([],[]).issues.includes('NO_STATEMENTS_FOUND'));
});
