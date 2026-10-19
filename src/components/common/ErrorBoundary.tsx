import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    fallback?: ReactNode;
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

/**
 * Generic ErrorBoundary — catches render errors in child tree
 * and displays a fallback instead of crashing the whole module.
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: undefined });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div className="flex flex-col items-center justify-center py-8 px-4 rounded-xl bg-zinc-900/30 border border-zinc-800 text-center">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center mb-3">
                        <AlertTriangle size={20} className="text-rose-500" />
                    </div>
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">
                        ERRO AO RENDERIZAR COMPONENTE
                    </p>
                    <p className="text-[9px] text-zinc-600 font-bold mb-4 max-w-[200px]">
                        {this.state.error?.message || 'Erro desconhecido'}
                    </p>
                    <button
                        onClick={this.handleRetry}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-400 text-[9px] font-black uppercase rounded-lg hover:bg-zinc-700 hover:text-white transition-all"
                    >
                        <RefreshCw size={12} /> Tentar novamente
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
