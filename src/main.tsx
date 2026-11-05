import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { publicDemoEnabled } from './demo/model';
import './demo/touch-layout.css';

if (publicDemoEnabled) document.documentElement.classList.add('demo-touch-layout');

const Entry = lazy(() => publicDemoEnabled && window.location.pathname === '/'
  ? import('./demo/DemoLandingRuntime')
  : import('./ApplicationRuntime'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<p role="status" style={{ padding: 24, fontFamily: 'system-ui', color: '#183d43' }}>Preparando DMP…</p>}><Entry /></Suspense>
  </StrictMode>,
);
