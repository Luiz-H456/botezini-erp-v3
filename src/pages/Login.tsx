import React, { useState } from 'react';
import { authService } from '@/services/auth';
import { CARTAO, ROTULO, ROTULO_PEQUENO, CAMPO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';
import { Lock, Mail, AlertTriangle, ArrowRight, ShieldCheck, HelpCircle, X, Loader2 } from 'lucide-react';

interface Props {
    onLoginSuccess: () => void;
}

const Login: React.FC<Props> = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showHelp, setShowHelp] = useState(false);

    // A TELA DE LOGIN NÃO BUSCA O PERFIL DA EMPRESA.
    //
    // Ela buscava, e não tinha como dar certo: `company_profile` fica atrás da
    // autenticação, e aqui ainda não há sessão. O pedido voltava 401, o
    // logotipo nunca chegava, e a tela caía no texto estático — depois de
    // mostrar um spinner que existia só para esperar uma resposta que nunca
    // vinha. Eram dois dos quatro erros vermelhos do console a cada abertura.
    //
    // Se um dia a marca precisar aparecer aqui de verdade, o caminho não é
    // tentar de novo: é publicar logotipo e nome num lugar legível sem sessão,
    // porque a tela de login é, por definição, anterior a ela.

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            await authService.signIn(email, password);
            onLoginSuccess();
        } catch (err: any) {
            console.error(err);
            if (err.message.includes('Invalid login credentials')) {
                setError('Credenciais incorretas. Verifique e tente novamente.');
            } else if (err.message.includes('Email not confirmed')) {
                setError('Email não confirmado. Verifique sua caixa de entrada.');
            } else {
                setError('Acesso negado. Contate o administrador.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen min-h-svh bg-zinc-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.02]"
                style={{ backgroundImage: 'linear-gradient(#444 1px, transparent 1px), linear-gradient(90deg, #444 1px, transparent 1px)', backgroundSize: '60px 60px' }}>
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none opacity-50"></div>
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-amber-600/5 rounded-full blur-[100px] pointer-events-none"></div>

            <div className={`w-full max-w-md ${CARTAO} p-5 overflow-hidden relative z-10 ease-out animate-in fade-in zoom-in-95 duration-200`}>
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent"></div>
                <div className="flex flex-col items-center mb-6 justify-center">
                    <div className="w-16 h-16 mb-4 flex items-center justify-center bg-amber-500/10 rounded-2xl border border-amber-500/20">
                        <ShieldCheck size={32} className="text-amber-500" />
                    </div>

                    <h1 className="text-xs font-black text-white tracking-widest text-center uppercase">
                        BOTEZINI ERP
                    </h1>
                    <div className={`${ROTULO} mt-2 flex items-center gap-2`}>
                        <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
                        Ambiente Seguro • Acesso Restrito
                    </div>
                </div>

                {error && (
                    <div className="bg-rose-500/5 border border-rose-500/20 p-3 rounded-xl flex items-center gap-3 mb-6 ease-out animate-in slide-in-from-top-2 duration-200">
                        <AlertTriangle className="text-rose-500 shrink-0" size={18} />
                        <p className="text-[11px] font-bold text-rose-200 uppercase tracking-wide leading-relaxed">{error}</p>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1.5">
                        <label className={ROTULO_PEQUENO}>Email Corporativo</label>
                        <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-amber-500 transition-colors" size={16} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={`${CAMPO} w-full pl-10 text-base sm:text-sm`}
                                aria-label="Email corporativo"
                                placeholder="usuario@empresa.com"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className={ROTULO_PEQUENO}>Senha</label>
                        <div className="relative group">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-amber-500 transition-colors" size={16} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={`${CAMPO} w-full pl-10 text-base sm:text-sm`}
                                aria-label="Senha"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className={`${BOTAO_PRINCIPAL} w-full mt-6`}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 size={14} className="animate-spin" /> Autenticando...
                            </>
                        ) : (
                            <>
                                Acessar Sistema <ArrowRight size={14} />
                            </>
                        )}
                    </button>
                </form>

                <div className={`mt-6 flex justify-between items-center ${ROTULO_PEQUENO}`}>
                    <button onClick={() => setShowHelp(true)} className="hover:text-amber-500 flex items-center gap-2 h-10 transition-colors">
                        <HelpCircle size={14} className="text-zinc-500" /> Primeiro Acesso?
                    </button>
                    <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> SSL Ativo</span>
                </div>
            </div>

            {/* Help Modal */}
            {showHelp && (
                <div className="fixed inset-0 bg-zinc-950/90 z-50 flex items-center justify-center p-4 ease-out animate-in fade-in duration-200">
                    <div className={`${CARTAO} max-w-sm w-full p-5 overflow-hidden relative`}>
                        <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/30"></div>
                        <button onClick={() => setShowHelp(false)} aria-label="Fechar" className={`${BOTAO_SECUNDARIO} w-10 px-0 absolute top-3 right-3`}><X size={18} /></button>
                        <div className="mb-4 text-amber-500 bg-amber-500/10 w-12 h-12 rounded-2xl flex items-center justify-center border border-amber-500/20"><Lock size={24} /></div>
                        <h3 className="text-xs font-black text-white mb-3 uppercase tracking-widest">Acesso Restrito</h3>
                        <p className="text-[11px] text-zinc-400 mb-4 leading-relaxed font-bold uppercase tracking-wide">
                            Por motivos de segurança industrial, este sistema não permite auto-cadastro na rede externa.
                        </p>
                        <ul className={`${ROTULO} space-y-3 mb-6 leading-loose`}>
                            <li className="flex items-start gap-2"><div className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 shrink-0"></div> Solicite sua credencial ao Administrador.</li>
                            <li className="flex items-start gap-2"><div className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 shrink-0"></div> Novos usuários iniciam no nível "Fábrica".</li>
                            <li className="flex items-start gap-2"><div className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 shrink-0"></div> Acesso administrativo requer token físico.</li>
                        </ul>
                        <button onClick={() => setShowHelp(false)} className={`${BOTAO_SECUNDARIO} w-full`}>Entendido</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Login;