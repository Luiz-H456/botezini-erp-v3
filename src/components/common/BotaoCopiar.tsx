import { useCallback, useState } from 'react';
import { Copy, Check, MessageCircle } from 'lucide-react';
import { linkDoWhatsApp } from '@/utils/mensagensCliente';

/**
 * Copiar um valor solto — telefone, e-mail, nome de contato.
 *
 * Diferente do BotaoMensagem, que copia uma MENSAGEM pronta com prévia. Aqui o
 * que se copia é o dado cru, para colar no discador, no cliente de e-mail ou
 * numa planilha. Na prospecção esse é o gesto do dia inteiro: o número está na
 * tela e precisa ir para outro lugar, e selecionar com o mouse um texto de
 * 9 pixels é um jeito ruim de passar o dia.
 */

async function paraAreaDeTransferencia(texto: string) {
    try {
        await navigator.clipboard.writeText(texto);
    } catch {
        // Área de transferência bloqueada (http, permissão negada): cai no
        // método antigo, que continua funcionando em todo navegador.
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
}

interface BotaoCopiarProps {
    /** O que vai para a área de transferência. */
    valor?: string | null;
    /** O que aparece na tela. Se omitido, mostra o próprio valor. */
    rotulo?: string;
    /** Texto do title, para quem passa o mouse. */
    titulo?: string;
    className?: string;
}

export const BotaoCopiar: React.FC<BotaoCopiarProps> = ({ valor, rotulo, titulo, className = '' }) => {
    const [copiado, setCopiado] = useState(false);

    const copiar = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!valor) return;
        await paraAreaDeTransferencia(valor);
        setCopiado(true);
        window.setTimeout(() => setCopiado(false), 1600);
    }, [valor]);

    if (!valor) return null;

    return (
        <button
            type="button"
            onClick={copiar}
            // Sem isto, o botão dentro de um cartão arrastável do kanban faria o
            // cartão começar a ser arrastado ao ser clicado.
            onPointerDown={e => e.stopPropagation()}
            title={titulo || `Copiar ${valor}`}
            className={`group/c inline-flex items-center gap-1 rounded-md px-1 -mx-1 transition-colors ${
                copiado ? 'text-emerald-400' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60'
            } ${className}`}
        >
            <span className="truncate">{rotulo ?? valor}</span>
            {copiado
                ? <Check size={12} className="shrink-0" />
                : <Copy size={12} className="shrink-0 opacity-0 group-hover/c:opacity-100 transition-opacity" />}
        </button>
    );
};

interface BotaoWhatsAppProps {
    telefone?: string | null;
    /** Mensagem já digitada na conversa. Opcional: sem ela, abre a conversa em branco. */
    texto?: string;
    compacto?: boolean;
    className?: string;
}

/**
 * Abre a conversa do WhatsApp naquele número, direto.
 *
 * O BotaoMensagem já leva ao WhatsApp, mas só depois de escolher uma mensagem
 * pronta. No primeiro contato da prospecção quem escreve é a pessoa, e o que
 * ela quer é a conversa aberta — não um texto que ela vai apagar antes de
 * digitar o dela.
 *
 * É um <a> e não um <button> porque abrir conversa é navegação: assim funciona
 * o clique do meio, o "abrir em nova aba" e o teclado, sem código nenhum.
 * Número curto demais não vira link quebrado — o botão simplesmente não existe.
 */
export const BotaoWhatsApp: React.FC<BotaoWhatsAppProps> = ({ telefone, texto, compacto, className = '' }) => {
    const link = linkDoWhatsApp(telefone, texto);
    if (!link) return null;

    return (
        <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            title={`Abrir conversa no WhatsApp — ${telefone}`}
            className={`botao inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 font-black uppercase tracking-widest hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-colors shrink-0 ${
                compacto ? 'px-1.5 py-1 text-[10px]' : 'px-2.5 py-1.5 text-[10px]'
            } ${className}`}
        >
            <MessageCircle size={compacto ? 10 : 11} />
            {!compacto && 'WhatsApp'}
        </a>
    );
};
