import { useCallback, useState, type ComponentType } from 'react';
import { PublicDemoEntry } from './PublicDemoEntry';
import type { DemoSession } from './model';
import './landing.css';

// Offline precaching starts with the application, not the first-visit landing.
const loadApplication = () => import('../ApplicationRuntime');
const loadServices = () => Promise.all([import('./service'), import('../lib/supabase/client')]);

export default function DemoLandingRuntime() {
  const [Application, setApplication] = useState<ComponentType | null>(null);
  const checkReady = useCallback(async () => {
    const [{ publicDemoService }, { supabase }] = await loadServices();
    const { data, error } = await supabase.auth.getSession();
    if (!error && data.session) {
      const runtime = await loadApplication();
      setApplication(() => runtime.default);
      return false;
    }
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
