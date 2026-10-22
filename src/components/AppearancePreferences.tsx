import { Check, Palette } from 'lucide-react';
import type { CSSProperties } from 'react';
import { appearanceThemes, type AppearanceTheme } from '../shared/appearance';
import { ModalShell } from './FormPrimitives';

export function AppearancePreferences({ name, theme, stored, onChoose, onClose }: {
  name: string; theme: AppearanceTheme; stored: boolean; onChoose: (theme: AppearanceTheme) => void; onClose: () => void;
}) {
  return <ModalShell title="Tu espacio DMP" className="appearance-panel" onClose={onClose}>
    <div className="appearance-content">
      <p className="appearance-user"><Palette size={18} aria-hidden="true" />{name}</p>
      <h4>Color de la interfaz</h4>
      <p>Elige el tono con el que te resulte más cómodo trabajar. Verás el cambio al instante.</p>
      <fieldset className="appearance-options"><legend className="sr-only">Elige un color</legend>
        {appearanceThemes.map(option => <label key={option.id} className={`appearance-option${theme === option.id ? ' is-selected' : ''}`} style={{ '--swatch-main': option.primary, '--swatch-background': option.background, '--swatch-soft': option.soft } as CSSProperties}>
          <input type="radio" name="appearance-color" value={option.id} checked={theme === option.id} onChange={() => onChoose(option.id)} />
          <span className="appearance-swatch" aria-hidden="true"><i /><span /><b /></span>
          <span className="appearance-option-copy"><strong>{option.name}</strong><small>{option.description}</small></span>
          <Check className="appearance-selected" size={17} aria-hidden="true" />
        </label>)}
      </fieldset>
      <p className="appearance-note">Solo cambia tu apariencia. Los avisos, errores y estados conservan sus colores.</p>
      <p role="status" className="appearance-save">{stored ? 'Se guarda automáticamente para tu usuario en este dispositivo. También funciona sin conexión.' : 'Color aplicado para esta sesión. Este navegador no ha permitido guardar la preferencia.'}</p>
    </div>
    <div className="modal-footer"><button type="button" onClick={() => onChoose('dmp')}>Restaurar verde DMP</button><button type="button" className="primary" onClick={onClose}>Listo</button></div>
  </ModalShell>;
}
