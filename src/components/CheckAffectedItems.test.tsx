// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { CheckAffectedItems } from './CheckAffectedItems';
it('targets selection, notes, favorable confirmation and photos to the chosen component',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const select=vi.fn(),notes=vi.fn(),favorable=vi.fn(),photos=vi.fn();
 try {
  await act(async()=>root.render(<CheckAffectedItems items={[{id:'motor',title:'Motor'},{id:'banda',title:'Banda'}]} selected={['motor']} onSelect={select} notes={{}} onNotes={notes} remainingFavorable={false} onRemaining={()=>{}} onFavorable={favorable} onPhotos={photos} photos={[{id:'one',itemId:'motor',name:'Motor.jpg',dataUrl:'data:image/png;base64,YQ=='},{id:'two',itemId:'banda',name:'Banda.jpg',dataUrl:'data:image/png;base64,YQ=='}]}/>));
  const cards=host.querySelectorAll('article');
  await act(async()=>cards[0].querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());expect(select).toHaveBeenCalledWith('motor');
  await act(async()=>cards[1].querySelector<HTMLInputElement>('.check-item-favorable input')!.click());expect(favorable).toHaveBeenCalledWith('banda',true);
  const file=new File(['photo'],'motor.jpg',{type:'image/jpeg'});const input=cards[0].querySelector<HTMLInputElement>('input[type="file"]')!;Object.defineProperty(input,'files',{value:[file]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));expect(photos).toHaveBeenCalledWith('motor',[file]);
  expect(cards[0].textContent).toContain('Motor.jpg');expect(cards[0].textContent).not.toContain('Banda.jpg');expect(cards[1].querySelector('input[type="file"]')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});
