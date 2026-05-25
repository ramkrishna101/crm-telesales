import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import AppRouter from './router/AppRouter';
import { useSocket } from './hooks/useSocket';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

// Initialises Socket.io connection once user is authenticated
function SocketBootstrap() {
  useSocket();
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <SocketBootstrap />
        <AppRouter />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#16233a',
              color: '#edf4ff',
              border: '1px solid #304869',
              borderRadius: '10px',
              fontSize: '0.875rem',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#101a2d' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#101a2d' } },
          }}
        />
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
