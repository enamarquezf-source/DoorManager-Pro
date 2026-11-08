import { useState } from 'react';
import { ArrowRight, Copy, Link2 } from 'lucide-react';
import './launch-contact.css';

const email = 'enamarquezf@gmail.com';
const demoUrl = 'https://demo-doormanager-pro.pages.dev/';
export function DemoLaunchContact() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setMessage(label); }
    catch { setMessage(`Puedes seleccionar y copiar: ${value}`); }
  };
  return <section id="demo-contacto" className="demo-launch-contact" aria-labelledby="demo-contact-title">
    <div><span className="demo-eyebrow">HABLEMOS DE TU EMPRESA</span><h2 id="demo-contact-title">¿Cómo encaja DMP en tu día a día?</h2><p>Cuéntame cómo organizáis los avisos, las revisiones y la oficina. Podemos valorar qué necesitaríais para probar DMP con vuestro propio caso.</p></div>
    <div className="demo-contact-actions"><button type="button" className="demo-contact-primary" aria-expanded={open} aria-controls="demo-contact-details" onClick={() => setOpen(!open)}>Quiero probar DMP en mi empresa <ArrowRight size={17} aria-hidden="true" /></button><button type="button" onClick={() => void copy(demoUrl, 'Enlace copiado. Ya puedes compartir la demo.')}><Link2 size={16} aria-hidden="true" /> Copiar enlace de la demo</button></div>
    {open && <div id="demo-contact-details" className="demo-contact-details"><strong>Escríbeme y hablamos de lo que necesitas.</strong><p>Indica tu actividad, cuántas personas forman el equipo y qué proceso te gustaría mejorar. También puedes contarme qué has echado en falta en la demo.</p><label>Correo de contacto<input readOnly value={email} onFocus={event => event.target.select()} /></label><button type="button" onClick={() => void copy(email, 'Correo copiado. Pégalo en el servicio de correo que prefieras.')}><Copy size={16} aria-hidden="true" /> Copiar correo</button><small>Tú decides cuándo escribir. Estos botones no envían mensajes ni abren otra aplicación.</small></div>}
    <p className="demo-contact-status" role="status">{message}</p>
  </section>;
}
