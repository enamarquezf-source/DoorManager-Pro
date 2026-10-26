import { WandSparkles } from 'lucide-react';
import { publicDemoEnabled } from './model';

export const demoExamples: Record<string,Record<string,string|number>> = {
  'Crear cliente': {legal_name:'Talleres Horizonte · ejemplo',trade_name:'Horizonte Demo',address:'Calle de Prueba, 12',city:'Zaragoza',province:'Zaragoza',postal_code:'50001',country:'España',notes:'Cliente ficticio para aprender el recorrido de DMP.'},
  'Crear centro': {name:'Nave de mantenimiento · ejemplo',address:'Calle de Prueba, 12',city:'Zaragoza',province:'Zaragoza',postal_code:'50001',country:'España',schedule:'Lunes a viernes, de 08:00 a 16:00',notes:'Centro ficticio. Selecciona el cliente al que pertenece.'},
  'Crear proveedor': {name:'Suministros Horizonte · ejemplo',trade_name:'Suministros Demo',city:'Zaragoza',province:'Zaragoza',country:'España',payment_method:'transferencia',payment_terms_days:30,internal_notes:'Proveedor ficticio. Sin cuenta bancaria ni encargos reales.'},
  'Crear material': {description:'Fotocélula de seguridad · ejemplo',manufacturer:'Fabricante de prueba',reference:'DEMO-FOTO',unit:'ud',cost:30,price:55,minimum_stock:2},
};
export function DemoExample({ title, onFill, enabled=publicDemoEnabled }: {title:string;onFill:(values:Record<string,string|number>)=>void;enabled?:boolean}) {
  const values=demoExamples[title];
  if(!enabled||!values)return null;
  return <aside className="demo-example"><WandSparkles size={20} aria-hidden="true"/><div><strong>Prueba sin empezar de cero</strong><p>Carga una propuesta ficticia en estos campos, revísala y cámbiala a tu gusto. No guarda ni crea registros por ti.</p><button type="button" onClick={()=>onFill({...values})}>Usar datos de ejemplo</button></div></aside>;
}
