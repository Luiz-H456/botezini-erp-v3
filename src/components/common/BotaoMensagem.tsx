import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Check, Send, Copy } from 'lucide-react';
import { linkDoWhatsApp } from '@/utils/mensagensCliente';
import { BOTAO_SUAVE } from '@/components/finance/ui/estilo';

interface Props {
    /** Texto pronto. Vazio esconde o botão — não há o que enviar. */
    texto: string;
    /** Aparece no cabeçalho da prévia. */
    titulo: string;
    /** Quando houver, a prévia ganha o botão de enviar direto no WhatsApp. */
    telefone?: string | null;
    compacto?: boolean;
    /** Quando houver, o gatilho vira um botão de ação com este texto (em vez do "Mensagem" só com ícone). */
    rotulo?: string;
    /**
     * Chamado quando o link de enviar no WhatsApp, dentro da prévia, é clicado (depois de abrir).
     * Sem telefone não há link: copiar a mensagem é o envio (a pessoa vai colar em outro canal),
     * então a cópia que deu certo chama o mesmo callback.
     */
    onEnviar?: () => void;
}

/** Copia para a área de transferência. Devolve se deu certo. */
export async function copiarTexto(texto: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(texto);
        return true;
    } catch {
        // Clipboard bloqueado (http, permissão negada): cai no método antigo,
        // que continua funcionando em todo navegador.
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    }
}

/** Folga entre sair do botão e a prévia fechar, para dar tempo de alcançá-la. */
const ATRASO_MS = 220;

/**
 * Botão de mensagem pronta: passar o mouse mostra a prévia, clicar copia.
 *
 * A prévia é INTERAÇÃO, não só visual — dentro dela ficam "Copiar" e "Enviar no
 * WhatsApp". Por isso ela não pode fechar quando o mouse sai do botão: há um
 * atraso curto que a mantém aberta enquanto o ponteiro atravessa o espaço até
 * ela, e ela própria cancela o fechamento ao receber o mouse. Sem isso a caixa
 * sumiria no caminho e o botão de enviar seria inalcançável.
 *
 * Sai em portal para não ser cortada por tabelas e modais, que é onde a maioria
 * destes botões vive.
 */
export function BotaoMensagem({ texto, titulo, telefone, compacto, rotulo, onEnviar }: Props) {
    const [copiado, setCopiado] = useState(false);
    const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
    const ref = useRef<HTMLButtonElement>(null);
    const timer = useRef<number | null>(null);

    // Timer pendente ao desmontar deixaria setState em componente morto.
    useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

    const cancelarFechamento = useCallback(() => {
        if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    }, []);

    const abrir = useCallback(() => {
        cancelarFechamento();
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const LARGURA = 340;
        // Cartão perto do fim da tela (celular, kanban rolado): a prévia abre para cima,
        // senão "Copiar" e "Enviar" ficam fora da tela. 360 ≈ altura máxima da prévia.
        const cabeAbaixo = r.bottom + 8 + 360 <= window.innerHeight;
        setPos({
            ...(cabeAbaixo ? { top: r.bottom + 8 } : { bottom: window.innerHeight - r.top + 8 }),
            // Não deixa a prévia sair pela direita da janela.
            left: Math.max(8, Math.min(r.left, window.innerWidth - LARGURA - 8)),
        });
    }, [cancelarFechamento]);

    const fecharComAtraso = useCallback(() => {
        cancelarFechamento();
        timer.current = window.setTimeout(() => setPos(null), ATRASO_MS);
    }, [cancelarFechamento]);

    const link = linkDoWhatsApp(telefone, texto);

    const copiar = useCallback(async () => {
        const ok = await copiarTexto(texto);
        setCopiado(true);
        window.setTimeout(() => setCopiado(false), 1800);
        if (ok && !link) onEnviar?.();
    }, [texto, link, onEnviar]);

    if (!texto) return null;

    return (
        <>
            <button
                ref={ref}
                type="button"
                onClick={(e) => { e.stopPropagation(); copiar(); }}
                // Sem isto, o botão dentro de um card arrastável (kanban) faria o
                // card começar a ser arrastado ao ser clicado.
                onPointerDown={(e) => e.stopPropagation()}
                onMouseEnter={abrir}
                onMouseLeave={fecharComAtraso}
                onFocus={abrir}
                onBlur={fecharComAtraso}
                title={`${titulo} — clique para copiar`}
                className={rotulo ? `${BOTAO_SUAVE} shrink-0` : `inline-flex items-center gap-1.5 rounded-lg border font-black uppercase tracking-widest transition-colors shrink-0 ${
                    compacto ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-[10px]'
                } ${
                    copiado
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-white hover:border-zinc-600'
                }`}
            >
                {copiado ? <Check size={14} /> : <MessageCircle size={14} />}
                {copiado ? 'Copiado' : (rotulo ?? 'Mensagem')}
            </button>

            {pos && createPortal(
                <div
                    style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: 340, maxWidth: 'calc(100vw - 16px)', zIndex: 'var(--z-index-balao)' as unknown as number }}
                    onMouseEnter={cancelarFechamento}
                    onMouseLeave={fecharComAtraso}
                    className="bg-zinc-950 border border-zinc-700 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] overflow-hidden ease-out animate-in fade-in zoom-in-95 duration-150"
                >
                    <div className="px-3 py-2 border-b border-zinc-800">
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">{titulo}</span>
                    </div>
                    <p className="px-3 py-2.5 text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar">
                        {texto}
                    </p>
                    <div className="flex items-center gap-1.5 px-3 py-2 border-t border-zinc-800 bg-zinc-900/60">
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); copiar(); }}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-zinc-800 text-zinc-300 border border-zinc-700 hover:text-white hover:border-zinc-600 transition-colors"
                        >
                            {copiado ? <Check size={14} /> : <Copy size={14} />}
                            {copiado ? 'Copiado' : 'Copiar'}
                        </button>
                        {link && (
                            <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => { e.stopPropagation(); onEnviar?.(); }}
                                className="botao flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors"
                            >
                                <Send size={14} /> Enviar
                            </a>
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
