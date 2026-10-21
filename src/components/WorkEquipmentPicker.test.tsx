import { renderToStaticMarkup } from 'react-dom/server';
import { describe,expect,it } from 'vitest';
import { WorkEquipmentPicker } from './WorkEquipmentPicker';
const render=(mode:string)=>renderToStaticMarkup(<WorkEquipmentPicker values={{site_id:'s',equipment_mode:mode,equipment_selection:[]}} setValues={()=>{}} filteredEquipment={[]} equipmentTypes={{data:[],loading:false}}/>);
describe('three nonblocking equipment paths',()=>{
 it('offers all three choices regardless of work type or template availability',()=>{const html=render('unknown');expect(html).toContain('Ya existe');expect(html).toContain('Crear equipo');expect(html).toContain('Sin identificar');expect(html).toContain('Puedes continuar sin equipo');expect(html).not.toContain('required');});
 it('allows provisional equipment without requiring a known type, brand, model or serial',()=>{const html=render('new');expect(html).toContain('Por identificar');expect(html).toContain('Tipo de equipo (opcional)');expect(html).not.toContain('required');});
});
