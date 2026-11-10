import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Volume2, VolumeX } from 'lucide-react';
import { demoRoles, type DemoRole } from './model';
import { introVideos } from './introVideos';
import './welcome-preview.css';

const roleSteps: Record<DemoRole, readonly string[]> = {
  Tecnico: [
    'En Mi jornada, abre el parte asignado. En Intervención, revisa cliente, centro y aviso.',
    'En Checks, abre cada equipo y revisa sus secciones. Marca Todo favorable si corresponde. Si hay un defecto, selecciona el componente afectado y descríbelo. La foto es opcional.',
    'Confirma cada bloque y finaliza cada check para sincronizarlo. Completa los tres equipos antes de cerrar el parte.',
    'En Registro, describe el trabajo y guarda. En Horas, selecciona trabajador y fecha. Introduce 90 minutos de ejemplo o indica Inicio y Fin.',
    'En Cierre, escribe un nombre ficticio, dibuja la firma y confirma que es de prueba. Guarda la firma.',
    'Pulsa Finalizar parte y Enviar a revisión. Cambia a SAT para consultar el mismo parte, ya finalizado técnicamente.',
  ],
  SAT: ['Crea un cliente y un centro con nombres y dirección ficticios.', 'Crea un parte, describe el aviso y asigna a Alex Demo.', 'Puedes cambiar a Técnico para ejecutarlo y volver a SAT para revisar el resultado.'],
  Oficina: ['Abre el parte ficticio preparado para facturar.', 'Revisa los conceptos y prepara el borrador. Puedes simular la emisión y el cobro con una referencia inventada.', 'En Cobros podrás comprobar cómo cambia el importe pendiente.'],
  Comercial: ['Crea un cliente con un nombre ficticio y abre un presupuesto.', 'Añade una descripción, una cantidad y un precio de ejemplo.', 'Simula la aceptación y genera un parte para que SAT pueda asignarlo.'],
  Gerencia: ['Abre el ejemplo de rentabilidad y compara ventas y costes.', 'Elige un periodo para analizar la actividad de cada empleado.', 'Prueba un estudio con horas, costes y notas ficticios. Puedes descargarlo en PDF.'],
};

const roleVideos: Record<DemoRole, keyof typeof introVideos> = {
  Tecnico: 'tecnico', SAT: 'sat', Oficina: 'oficina', Comercial: 'comercial', Gerencia: 'gerencia',
};

export function DemoWelcomePreview({ role, experience, onClose, onStart }: {
  role: DemoRole;
  experience: 'work' | 'connected' | 'discover';
  onClose: () => void;
  onStart: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const hasListened = useRef(false);
  const [narrationEnabled, setNarrationEnabled] = useState(false);
  const toggleNarration = () => {
    const enabled = !narrationEnabled;
    setNarrationEnabled(enabled);
    if (player.current) {
      player.current.muted = !enabled;
      if (enabled) {
        if (!hasListened.current) { player.current.currentTime = 0; hasListened.current = true; }
        void player.current.play().catch(() => { /* Native controls remain available. */ });
      }
    }
  };
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  const steps = experience === 'discover'
    ? ['Técnico: completa un check, registra el trabajo, las horas y el desplazamiento, firma y finaliza el parte.', 'SAT: revisa el trabajo y los costes y envía el mismo parte a Oficina. Allí emite su factura y registra un cobro ficticio.', 'Gerencia: consulta cobros y gastos, y guarda un estudio de costes.']
    : experience === 'connected'
    ? ['En SAT, inventa un cliente y un centro, describe el aviso y asigna el parte a Alex Demo.', 'Como Técnico, revisa el equipo, anota el trabajo y registra las horas. Envía el parte y vuelve a SAT para validarlo.', 'En Oficina, revisa la factura y simula el cobro. En Gerencia, consulta cómo queda reflejado en los resultados.']
    : roleSteps[role];
  const title = experience === 'discover' ? 'Descubrir DMP' : experience === 'connected' ? 'Mi recorrido completo' : `Prueba de ${demoRoles.find(option => option.id === role)?.title}`;
  const film = introVideos[experience === 'discover' ? 'descubrir' : experience === 'connected' ? 'recorrido' : roleVideos[role]];
  const video = film.file;
  const poster = `/demo-intros/${video}.jpg`;
  const duration = film.seconds < 60 ? `${film.seconds} s` : `${Math.floor(film.seconds / 60)} min ${film.seconds % 60} s`;
  const recorded = true;

  return <dialog ref={dialog} className={`demo-welcome-preview${recorded ? ' is-wide' : ''}`} aria-labelledby="demo-welcome-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <span>PANTALLAS REALES · {duration}</span>
    <h2 id="demo-welcome-title">{title}</h2>
    <video ref={player} key={video} className={`demo-preview-video${recorded ? ' is-recorded' : ''}${experience === 'work' ? '' : ' is-overview'}`} src={`/demo-intros/${video}.mp4`} poster={poster} aria-label={`Vídeo de introducción. ${title}`} controls autoPlay muted={!narrationEnabled} playsInline preload="metadata">
      <track kind="chapters" src={`/demo-intros/${video}.vtt`} srcLang="es" label="Etapas del recorrido" />
      <track kind="subtitles" src={`/demo-intros/${video}.es.vtt`} srcLang="es" label="Español" />
    </video>
    <div className="demo-preview-audio"><button type="button" aria-pressed={narrationEnabled} onClick={toggleNarration}>{narrationEnabled ? <VolumeX size={17} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}{narrationEnabled ? 'Silenciar narración' : 'Escuchar narración'}</button><span>Narración con voz de IA</span></div>
    <p className="demo-preview-note">{experience === 'discover' ? 'Un parte preparado, cuatro perfiles y un recorrido guiado hasta el estudio de costes.' : experience === 'connected' ? 'Qué crear, rellenar y validar en cada perfil. Montaje de casos ficticios de la demo.' : 'Una presentación breve. La guía te indicará cada acción al entrar.'}</p>
    <details className="demo-preview-transcript"><summary>Qué vas a rellenar</summary><ol>{steps.map(step => <li key={step}>{step}</li>)}</ol></details>
    <p className="demo-preview-note">Usa solo datos ficticios. Tu espacio de prueba es temporal.</p>
    <footer><button type="button" onClick={onClose}>Volver</button><button type="button" className="demo-preview-start" onClick={onStart}>Empezar la demo <ArrowRight size={17} aria-hidden="true" /></button></footer>
  </dialog>;
}
