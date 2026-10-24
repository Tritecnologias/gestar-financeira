import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultGuide,guidedPalette,guidePreference,refinePreference,resetGuided,toGuided,defaultPreference,LIGHT_PRESET,DARK_PRESET,NEUTRAL_LABELS,derivePalette,contrast,parsePreference,loadPreference,preferenceKey} from '../src/lib/appearance.ts';

test('centro 50 preserva exatamente a base Claro; extremos são distintos e determinísticos',()=>{
 const g=defaultGuide();assert.deepEqual(guidedPalette(g),LIGHT_PRESET.palette);
 const low=guidedPalette({...g,intensity:0}),high=guidedPalette({...g,intensity:100});
 assert.notDeepEqual(low,high);assert.notDeepEqual(low,LIGHT_PRESET.palette);assert.notDeepEqual(high,LIGHT_PRESET.palette);
 assert.deepEqual(guidedPalette({...g,intensity:0}),low);assert.deepEqual(defaultGuide(),g);
});
test('famílias e neutros são previsíveis e passam pelo contraste já existente',()=>{
 const guides=[...Array.from({length:34},(_,i)=>({...defaultGuide(),family:'hue',hue:i*10})),...Object.keys(NEUTRAL_LABELS).map(neutral=>({...defaultGuide(),family:'neutral',neutral}))];
 for(const g of guides)for(const intensity of [0,50,100]){
  const palette=guidedPalette({...g,intensity}),r=derivePalette(palette);assert.equal(r.error,null,JSON.stringify({...g,intensity}));
  for(const token of ['--text-primary','--text-secondary','--action','--focus'])for(const bg of [palette.background,palette.surface,palette.sidebar,r.tokens['--surface-elevated']])assert(contrast(r.tokens[token],bg)>=4.5,token);
  assert.notEqual(r.tokens['--success'],r.tokens['--danger']);
 }
 assert.notDeepEqual(guidedPalette({...defaultGuide(),family:'hue',hue:0}),guidedPalette({...defaultGuide(),family:'hue',hue:120}));
 assert.notDeepEqual(guidedPalette({...defaultGuide(),family:'neutral',neutral:'black'}),guidedPalette({...defaultGuide(),family:'neutral',neutral:'lightGray'}));
});
test('A → B → C não acumula transformações nem reaproveita overrides manuais',()=>{
 const a=toGuided(defaultPreference('custom'));
 const b=guidePreference(a,{family:'hue',hue:120,intensity:0});
 const manual=refinePreference(b,'border','#123456');assert(manual.guide.advanced);
 const c=guidePreference(manual,{family:'hue',hue:240,intensity:100});
 assert.equal(c.guide.advanced,false);assert.deepEqual(c.palette,guidedPalette({...defaultGuide(),family:'hue',hue:240,intensity:100}));
 assert.equal(a.palette.border,LIGHT_PRESET.palette.border);
});
test('voltar às cores da base remove overrides; reset volta a 50/base DEZ',()=>{
 const p=guidePreference(toGuided(defaultPreference('custom')),{family:'neutral',neutral:'graphite',intensity:80});
 const refined=refinePreference(p,'accent','#FFAADD');assert.equal(refined.palette.accent,'#FFAADD');
 assert.deepEqual(guidePreference(refined,{}).palette,p.palette);
 const reset=resetGuided(refined);assert.deepEqual(reset.guide,defaultGuide());assert.deepEqual(reset.palette,LIGHT_PRESET.palette);
});
test('v1 personalizado migra em memória sem alterar cor ou apagar a chave existente',()=>{
 const key=preferenceKey('identity','user-a'),old={...defaultPreference('custom'),palette:{...DARK_PRESET.palette,accent:'#AAFFDD'}},raw=JSON.stringify(old);
 const store={getItem:k=>k===key?raw:null};const loaded=loadPreference(store,key),upgraded=toGuided(loaded);
 assert.equal(loaded.version,1);assert.equal(upgraded.version,2);assert.equal(upgraded.guide.advanced,true);assert.deepEqual(upgraded.palette,old.palette);assert.equal(store.getItem(key),raw);
 assert.deepEqual(toGuided(loaded),upgraded);assert.equal(loadPreference(store,preferenceKey('identity','user-b')).mode,'light');
});
test('v2 salva/recarrega guia e manual, mantendo chave pessoal e validação estrita',()=>{
 const p=guidePreference(toGuided(defaultPreference('custom')),{family:'hue',hue:300,intensity:75});assert.deepEqual(parsePreference(JSON.stringify(p)),p);
 const manual=refinePreference(p,'border','#AA7788');assert.deepEqual(parsePreference(JSON.stringify(manual)),manual);
 for(const guide of [{...p.guide,intensity:-1},{...p.guide,intensity:101},{...p.guide,hue:331},{...p.guide,family:'unsafe'},{...p.guide,neutral:'unsafe'},{...p.guide,advanced:'yes'},{...p.guide,secret:'no'}])assert.equal(parsePreference(JSON.stringify({...p,guide})),null);
 assert.equal(parsePreference(JSON.stringify({...p,token:'no'})),null);
});
test('v2 divergente conserva paleta válida como manual, sem reconstruí-la no carregamento',()=>{
 const p=toGuided(defaultPreference('custom'));p.palette.border='#AA7788';const loaded=parsePreference(JSON.stringify(p));assert.equal(loaded.guide.advanced,true);assert.equal(loaded.palette.border,'#AA7788');
});
test('cores semânticas não dependem da família escolhida em fundos claros',()=>{
 const colors=[0,120,240].map(hue=>derivePalette(guidedPalette({...defaultGuide(),family:'hue',hue})).tokens);
 for(const key of ['--success','--warning','--danger','--info'])assert(colors.every(c=>c[key]===colors[0][key]));
});
