import './offline/registerWorker';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './styles.css';
import './operations-theme.css';
import './appearance.css';
import './demo/public-demo.css';
import App from './App';
import { queryClient } from './query/queryClient';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
