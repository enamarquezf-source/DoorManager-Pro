import { expect,it } from 'vitest';
import { checkItemResults,selectedCheckItemIds,validateCheckItemSelection } from './itemResults';
const items=[{id:'a',title:'Motor',component:'Motor'},{id:'b',title:'Banda de seguridad',component:'Seguridad'},{id:'c',title:'Fotocélulas',component:'Seguridad'}];
it('marks only the selected item and clears descriptions from the others',()=>{
 expect(checkItemResults(items,'No favorable',['b'],{b:'Banda rota'},'',true)).toEqual([{id:'a',result:'Todo favorable',observations:null},{id:'b',result:'No favorable',observations:'Banda rota'},{id:'c',result:'Todo favorable',observations:null}]);
});
it('keeps other items unreviewed unless the user confirms they are correct',()=>{
 expect(checkItemResults(items,'Problema leve',['a'],{},'Ruido en el motor',false).map(row=>row.result)).toEqual(['Problema leve','Sin revisar','Sin revisar']);
});
it('can confirm one unaffected component as favorable while leaving another unreviewed',()=>{
 expect(checkItemResults(items,'Problema leve',['a'],{},'Ruido',false,['b']).map(row=>row.result)).toEqual(['Problema leve','Todo favorable','Sin revisar']);
});
it('requires selection and an explanation and never maps an ambiguous component to every item',()=>{
 expect(selectedCheckItemIds(items,['Seguridad'])).toEqual([]);expect(selectedCheckItemIds(items,['Motor'])).toEqual(['a']);
 expect(validateCheckItemSelection(items,'Problema leve',[],{},'Ruido')).toContain('Selecciona');
 expect(validateCheckItemSelection(items,'Problema leve',['a'],{},'')).toContain('Describe');
 expect(validateCheckItemSelection(items,'Problema leve',['a'],{a:'Ruido'},'')).toBe('');
});
it('clears item defects when the section is explicitly rechecked as favorable',()=>{
 expect(checkItemResults(items,'Todo favorable',['a'],{a:'Defecto anterior'},'Antes fallaba',true).every(row=>row.result==='Todo favorable'&&row.observations===null)).toBe(true);
});
