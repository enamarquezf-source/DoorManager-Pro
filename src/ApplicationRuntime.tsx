import './offline/registerWorker';
import { QueryClientProvider } from '@tanstack/react-query';
import './styles.css';
import './operations-theme.css';
import './appearance.css';
import './demo/public-demo.css';
import App from './App';
import { queryClient } from './query/queryClient';

export default function ApplicationRuntime() {
  return <QueryClientProvider client={queryClient}><App /></QueryClientProvider>;
}
