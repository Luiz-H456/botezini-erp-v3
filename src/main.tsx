
import './index.css';
import React, { Component, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ENV, CONFIG_STATUS } from '@/config/env';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true, // Recarrega automaticamente os relatórios pesados
      staleTime: 1000 * 60 * 5, // 5 minutos de cache até considerar 'stale'
    },
  },
});

// --- DIAGNÓSTICO DE AMBIENTE (DEBUG) ---
console.group("🚀 BOTEZINI ERP - System Bootstrap");

// Teste Definitivo de Sanidade
console.log("1. ENV MODE =", ENV.MODE);
console.log("2. CONFIG STATUS =", CONFIG_STATUS);

if (CONFIG_STATUS.supabase) {
  console.log("✅ Supabase Configured");
} else {
  console.error("❌ Supabase Missing Keys");
}

console.groupEnd();
// ----------------------------------------

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

// Simple Error Boundary to catch render errors
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("React Error Boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen h-svh bg-zinc-950 text-white flex flex-col items-center justify-center p-8 text-center font-mono">
          <div className="bg-red-900/20 border border-red-800 p-6 rounded-lg max-w-2xl">
            <h1 className="text-xl font-bold text-red-500 mb-4">CRITICAL SYSTEM ERROR</h1>
            <p className="text-zinc-400 mb-4">O sistema encontrou um erro irrecuperável na renderização.</p>
            <pre className="text-xs text-red-300 bg-black/50 p-4 rounded overflow-auto text-left whitespace-pre-wrap">
              {this.state.error?.toString()}
            </pre>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => window.location.reload()}
                className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded font-bold uppercase text-xs transition-colors"
              >
                Reiniciar Sistema
              </button>
              <p className="text-[10px] text-zinc-600 mt-2">Verifique o console (F12) para detalhes do ambiente.</p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
