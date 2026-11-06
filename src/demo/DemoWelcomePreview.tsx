import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { demoRoles, type DemoRole } from './model';
import './welcome-preview.css';

const roleSteps: Record<DemoRole, readonly string[]> = {
  Tecnico: ['Abre el parte de ejemplo y revisa uno de sus equipos.', 'Marca el resultado de cada comprobación. Si todo está bien, puedes dejarlo como favorable.', 'En el recorrido completo, anota un trabajo ficticio, registra sus horas y firma antes de enviarlo.'],
  SAT: ['Crea un cliente y un centro con nombres y dirección ficticios.', 'Crea un parte, describe el aviso y asigna a Alex Demo.', 'Puedes cambiar a Técnico para ejecutarlo y volver a SAT para revisar el resultado.'],
  Oficina: ['Abre el parte ficticio preparado para facturar.', 'Revisa los conceptos y prepara el borrador. Puedes simular la emisión y el cobro con una referencia inventada.', 'En Cobros podrás comprobar cómo cambia el importe pendiente.'],
  Comercial: ['Crea un cliente con un nombre ficticio y abre un presupuesto.', 'Añade una descripción, una cantidad y un precio de ejemplo.', 'Simula la aceptación y genera un parte para que SAT pueda asignarlo.'],
  Gerencia: ['Abre el ejemplo de rentabilidad y compara ventas y costes.', 'Elige un periodo para analizar la actividad de cada empleado.', 'Prueba un estudio con horas, costes y notas ficticios. Puedes descargarlo en PDF.'],
};

export function DemoWelcomePreview({ role, experience, onClose, onStart }: {
  role: DemoRole;
  experience: 'work' | 'connected' | 'discover';
  onClose: () => void;
  onStart: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  const steps = experience === 'discover'
    ? ['Abre un parte preparado y finaliza un check para ver cómo trabaja el técnico.', 'Pasa por Oficina para consultar un parte de ejemplo y por Gerencia para ver cobros y márgenes.', 'La visita usa datos ya preparados. Introduce solo datos ficticios si quieres probar algún campo.']
    : experience === 'connected'
    ? ['En SAT, inventa un cliente y un centro, describe el aviso y asigna el parte a Alex Demo.', 'Como Técnico, revisa el equipo, anota el trabajo y registra las horas. Envía el parte y vuelve a SAT para validarlo.', 'En Oficina, revisa la factura y simula el cobro. En Gerencia, consulta cómo queda reflejado en los resultados.']
    : roleSteps[role];
  const title = experience === 'discover' ? 'Descubrir DMP' : experience === 'connected' ? 'Mi recorrido completo' : `Prueba de ${demoRoles.find(option => option.id === role)?.title}`;

  return <dialog ref={dialog} className="demo-welcome-preview" aria-labelledby="demo-welcome-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <span>ANTES DE EMPEZAR</span>
    <h2 id="demo-welcome-title">{title}</h2>
    <p>Esto es lo que harás en la prueba. La guía te acompañará paso a paso.</p>
    <ol>{steps.map(step => <li key={step}>{step}</li>)}</ol>
    <p className="demo-preview-note">Usa solo datos ficticios. Tu espacio de prueba es temporal.</p>
    <footer><button type="button" onClick={onClose}>Volver</button><button type="button" className="demo-preview-start" onClick={onStart}>Empezar la demo <ArrowRight size={17} aria-hidden="true" /></button></footer>
  </dialog>;
}
