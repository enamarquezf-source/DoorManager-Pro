import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { demoRoles, type DemoRole } from './model';
import './welcome-preview.css';

const roleSteps: Record<DemoRole, readonly string[]> = {
  Tecnico: [
    'En Mi jornada, abre el parte asignado. En En campo, revisa cliente, centro y aviso.',
    'En Checks, abre cada equipo y revisa sus secciones. Marca Todo favorable si corresponde. Si hay un defecto, selecciona el componente afectado y descríbelo. La foto es opcional.',
    'Confirma cada bloque y finaliza cada check para sincronizarlo. Completa los tres equipos antes de cerrar el parte.',
    'En Completar parte → Registro, describe el trabajo y guarda. En Horas, selecciona trabajador y fecha. Introduce 90 minutos de ejemplo o indica Inicio y Fin.',
    'En Cierre, escribe un nombre ficticio, dibuja la firma y confirma que es de prueba. Guarda la firma.',
    'Pulsa Finalizar parte y Enviar a revisión. Cambia a SAT para consultar el mismo parte, ya finalizado técnicamente.',
  ],
  SAT: ['Crea un cliente y un centro con nombres y dirección ficticios.', 'Crea un parte, describe el aviso y asigna a Alex Demo.', 'Puedes cambiar a Técnico para ejecutarlo y volver a SAT para revisar el resultado.'],
  Oficina: ['Abre el parte ficticio preparado para facturar.', 'Revisa los conceptos y prepara el borrador. Puedes simular la emisión y el cobro con una referencia inventada.', 'En Cobros podrás comprobar cómo cambia el importe pendiente.'],
  Comercial: ['Crea un cliente con un nombre ficticio y abre un presupuesto.', 'Añade una descripción, una cantidad y un precio de ejemplo.', 'Simula la aceptación y genera un parte para que SAT pueda asignarlo.'],
  Gerencia: ['Abre el ejemplo de rentabilidad y compara ventas y costes.', 'Elige un periodo para analizar la actividad de cada empleado.', 'Prueba un estudio con horas, costes y notas ficticios. Puedes descargarlo en PDF.'],
};

const roleVideos: Record<DemoRole, string> = {
  Tecnico: 'tecnico-pantalla-completa',
  SAT: 'sat-pantalla-completa',
  Oficina: 'oficina-pantalla-completa',
  Comercial: 'comercial-pantalla-completa',
  Gerencia: 'gerencia-pantalla-completa',
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
  const chapters: DemoRole[] = experience === 'discover'
    ? ['Tecnico', 'Oficina', 'Gerencia']
    : experience === 'connected'
    ? ['SAT', 'Tecnico', 'Oficina', 'Gerencia']
    : [role];
  const [chapter, setChapter] = useState(0);
  const activeRole = chapters[chapter] ?? chapters[0];
  const video = roleVideos[activeRole];
  const recorded = true;

  return <dialog ref={dialog} className={`demo-welcome-preview${recorded ? ' is-wide' : ''}`} aria-labelledby="demo-welcome-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <span>RECORRIDO GRABADO EN LA DEMO</span>
    <h2 id="demo-welcome-title">{title}</h2>
    {chapters.length > 1 && <div className="demo-preview-chapters" role="group" aria-label="Capítulos de la presentación">{chapters.map((item, index) => <button key={item} type="button" aria-pressed={index === chapter} onClick={() => setChapter(index)}>{index + 1} · {demoRoles.find(option => option.id === item)?.title}</button>)}</div>}
    <video key={video} className={`demo-preview-video${recorded ? ' is-recorded' : ''}`} src={`/demo-intros/${video}.mp4`} aria-label={`Vídeo de introducción. ${demoRoles.find(option => option.id === activeRole)?.title}`} controls autoPlay muted playsInline preload="metadata" onEnded={() => { if (chapter < chapters.length - 1) setChapter(chapter + 1); }} />
    <details className="demo-preview-transcript"><summary>Qué vas a rellenar</summary><ol>{steps.map(step => <li key={step}>{step}</li>)}</ol></details>
    <p className="demo-preview-note">Usa solo datos ficticios. Tu espacio de prueba es temporal.</p>
    <footer><button type="button" onClick={onClose}>Volver</button><button type="button" className="demo-preview-start" onClick={onStart}>Empezar la demo <ArrowRight size={17} aria-hidden="true" /></button></footer>
  </dialog>;
}
