import { useState } from 'react';
import { X, MessageCircle, ArrowRight, Copy, Check } from 'lucide-react';
import { copiarTexto } from './BotaoMensagem';
import { BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

export interface AcaoDoPasso {
    rotulo: string;
    onClick?: () => void;
    href?: string | null;
    whatsapp?: boolean;
    /**
     * Texto para copiar quando não há `href` (cliente sem telefone). O botão vira "Copiar mensagem",
     * copia, e só então chama `onClick` — copiar é o envio, a pessoa cola em outro canal.
     */
    copiar?: string;
    /** Rótulo do botão de copiar; padrão "Copiar mensagem". */
    rotuloCopiar?: string;
}

function BotaoCopiarPasso({ a, classe }: { a: AcaoDoPasso; classe: string }) {
    const [estado, setEstado] = useState<'copiado' | 'falhou' | null>(null);
    const copiar = async () => {
        const ok = await copiarTexto(a.copiar || '');
        setEstado(ok ? 'copiado' : 'falhou');
        window.setTimeout(() => setEstado(null), 1800);
        if (ok) a.onClick?.();
    };
    return (
        <button type="button" onClick={copiar} className={classe}>
            {estado === 'copiado' ? <Check size={14} /> : <Copy size={14} />}
            {estado === 'copiado' ? 'Copiado' : estado === 'falhou' ? 'Não copiou' : (a.rotuloCopiar ?? 'Copiar mensagem')}
        </button>
    );
}

interface Props {
    titulo: string;
    principal: AcaoDoPasso;
    secundario?: AcaoDoPasso;
    /** Abre a janela completa (regra do Luiz: atalho nunca esconde nuance). */
    maisOpcoes?: () => void;
    /** Rótulo do link de `maisOpcoes`, quando ele leva a outra tela e não a uma janela maior. */
    rotuloMaisOpcoes?: string;
    /** Quando a ação principal não pode acontecer (ex.: cliente sem telefone). */
    aviso?: string;
    onFechar: () => void;
}

/** O próximo passo, oferecido onde a ação acabou. Seguir nunca é obrigatório. */
export function ProximoPasso({ titulo, principal, secundario, maisOpcoes, rotuloMaisOpcoes = 'mais opções', aviso, onFechar }: Props) {
    const botao = (a: AcaoDoPasso, classe: string) => !a.href && a.copiar
        ? <BotaoCopiarPasso a={a} classe={classe} />
        : a.href
        ? <a href={a.href} target="_blank" rel="noopener noreferrer" onClick={a.onClick} className={classe}>
            {a.whatsapp ? <MessageCircle size={13} /> : null}{a.rotulo}<ArrowRight size={12} /></a>
        : <button type="button" onClick={a.onClick} disabled={!a.onClick} className={classe}>{a.rotulo}<ArrowRight size={12} /></button>;
    return (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="min-w-0 flex-1 text-[10px] font-black uppercase tracking-widest text-amber-400">{titulo}</p>
            {aviso && <span className="text-[10px] font-bold text-zinc-500">{aviso}</span>}
            {botao(principal, BOTAO_PRINCIPAL)}
            {secundario && botao(secundario, BOTAO_SECUNDARIO)}
            {maisOpcoes && <button type="button" onClick={maisOpcoes} className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300">{rotuloMaisOpcoes}</button>}
            <button type="button" onClick={onFechar} aria-label="Fechar" className="h-10 w-10 rounded-xl text-zinc-600 hover:bg-zinc-900 hover:text-white"><X size={14} className="mx-auto" /></button>
        </div>
    );
}
