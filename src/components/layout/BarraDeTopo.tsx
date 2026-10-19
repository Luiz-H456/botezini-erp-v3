import { Hexagon, Menu } from 'lucide-react';
import type { View } from '@/utils/navegacao';
import type { CompanyProfile, UserProfile } from '@/types';
import { MenuDoUsuario } from './MenuDoUsuario';

interface Props {
    onNavegar: (view: View) => void;
    onAbrirMenu: () => void;
    /** A gaveta do menu (celular) está aberta. */
    menuAberto: boolean;
    companyProfile?: CompanyProfile | null;
    userProfile: UserProfile | null;
    onAbrirPerfil: () => void;
    onSair: () => void;
    /** Ações do lado direito que já existiam na faixa antiga (privacidade etc). */
    acoes?: React.ReactNode;
}

/** A barra de cima: logo, ações e menu do usuário. O menu das seções mora no `MenuDoApp`. */
export function BarraDeTopo({
    onNavegar, onAbrirMenu, menuAberto, companyProfile, userProfile,
    onAbrirPerfil, onSair, acoes,
}: Props) {
    return (
        <header className="h-14 shrink-0 bg-zinc-950 border-b border-zinc-800 flex items-center gap-2 sm:gap-4 px-2 sm:px-4 z-cabecalho print:hidden">
            <button
                type="button"
                onClick={onAbrirMenu}
                aria-label="Abrir menu"
                aria-expanded={menuAberto}
                className="md:hidden h-10 w-10 shrink-0 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            >
                <Menu size={18} />
            </button>
            <button
                onClick={() => onNavegar('dashboard')}
                title="Início"
                className="flex items-center gap-2.5 shrink-0 pr-3 border-r border-zinc-800/70 h-8 group"
            >
                {companyProfile?.logo_url
                    ? <img src={companyProfile.logo_url} alt="" className="w-7 h-7 object-contain" />
                    : <Hexagon className="text-amber-500 fill-amber-500/10" size={22} />}
                <span className="hidden lg:block text-[10px] font-black text-zinc-300 tracking-[0.2em] truncate max-w-[130px] group-hover:text-white transition-colors">
                    {companyProfile?.name?.toUpperCase() || 'BOTEZINI'}
                </span>
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-2 shrink-0">
                {acoes}
                <MenuDoUsuario perfil={userProfile} onAbrirPerfil={onAbrirPerfil} onSair={onSair} />
            </div>
        </header>
    );
}
