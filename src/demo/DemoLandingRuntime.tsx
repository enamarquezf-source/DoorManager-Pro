import { useCallback, useState, type ComponentType } from 'react';
import { PublicDemoEntry } from './PublicDemoEntry';
import type { DemoSession } from './model';
import './landing.css';

// Offline precaching starts with the application, not the first-visit landing.
const loadApplication = () => import('../ApplicationRuntime');
const loadServices = () => Promise.all([import('./service'), import('../lib/supabase/client')]);

async function refreshInstalledLanding() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return;
    const activate = () => registration.waiting?.postMessage({ type: 'DMP_ACTIVATE_UPDATE' });
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') activate();
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (window.location.pathname === '/' && !document.querySelector('dialog[open]')) window.location.reload();
    }, { once: true });
    await registration.update();
    activate();
  } catch { /* Keep the entry available when the update cannot be downloaded. */ }
}

export default function DemoLandingRuntime() {
  const [Application, setApplication] = useState<ComponentType | null>(null);
  const checkReady = useCallback(async () => {
    const [{ publicDemoService }, { authStorageKey }] = await loadServices();
    // A saved token only chooses the restoration screen. AuthProvider still
    // validates it and the profile before allowing any protected route.
    let hasSavedSession = false;
    try { hasSavedSession = Boolean(localStorage.getItem(authStorageKey)); } catch { /* Continue with the public entry. */ }
    if (hasSavedSession) {
      const runtime = await loadApplication();
      setApplication(() => runtime.default);
      return false;
    }
    void refreshInstalledLanding();
    return publicDemoService.ready();
  }, []);
  const onReady = useCallback(async (session: DemoSession) => {
    const runtime = await loadApplication();
    window.history.replaceState(null, '', session.role === 'Tecnico' ? '/app/tecnico' : '/app/inicio');
    setApplication(() => runtime.default);
  }, []);
  if (Application) return <Application />;
  return <PublicDemoEntry checkReady={checkReady} start={async (role, token) => {
    const [{ publicDemoService }] = await loadServices();
    return publicDemoService.start(role, token);
  }} onReady={onReady} />;
}
