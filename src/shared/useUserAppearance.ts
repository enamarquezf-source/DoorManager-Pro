import { useLayoutEffect, useState } from 'react';
import { appearanceKey, applyAppearance, readAppearance, saveAppearance, validAppearance, type AppearanceTheme } from './appearance';

export function useUserAppearance(profile: { id: string; company_id: string } | null) {
  const [theme, setTheme] = useState<AppearanceTheme>('dmp');
  const [stored, setStored] = useState(true);
  const companyId = profile?.company_id;
  const profileId = profile?.id;
  useLayoutEffect(() => {
    if (!companyId || !profileId) { applyAppearance('dmp'); setTheme('dmp'); return; }
    const scope = { companyId, profileId };
    const initial = readAppearance(scope);
    setTheme(initial); setStored(true); applyAppearance(initial);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== appearanceKey(scope) && event.key !== null) return;
      const next = validAppearance(event.newValue);
      setTheme(next); setStored(true); applyAppearance(next);
    };
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('storage', onStorage); applyAppearance('dmp'); };
  }, [companyId, profileId]);

  const choose = (next: AppearanceTheme) => {
    if (!companyId || !profileId) return;
    applyAppearance(next); setTheme(next);
    setStored(saveAppearance({ companyId, profileId }, next));
  };
  return { theme, stored, choose };
}
