import { useRef, useLayoutEffect, useCallback, useState } from 'react';
import { aplicarTab } from '@/utils/textoFormatado';
import { alturaAoArrastar, alturaMaximaNaJanela } from '@/utils/redimensionarArea';
import type { BordaArrastada } from '@/utils/redimensionarArea';

interface Props {
    value: string;
    onChange: (valor: string) => void;
    placeholder?: string;
    /** Altura inicial, em linhas. */
    linhas?: number;
    /** Teto do crescimento automático, em linhas. Depois disso, rola. */
    linhasMaximas?: number;
    /** Transforma em maiúscula ao digitar, como o resto dos campos de fábrica. */
    maiuscula?: boolean;
    disabled?: boolean;
    className?: string;
    id?: string;
    /**
     * Mostra uma alça para arrastar a altura, e em qual borda.
     *
     * Serve aos campos onde a observação pode ser longa e o crescimento
     * automático acaba tomando a tela, escondendo justamente o que a observação
     * descreve. Com a alça, quem escreve decide quanto quer ver.
     *
     * A borda importa: `'topo'` para caixa ancorada embaixo (rodapé do editor),
     * que cresce para cima na direção do espaço vazio; `'base'` para caixa em
     * fluxo normal (dentro do cartão de um item), que cresce para baixo. Alça
     * na borda errada faz o campo andar no sentido oposto ao gesto.
     *
     * `true` é atalho para `'topo'`.
     */
    redimensionavel?: boolean | BordaArrastada;
}

/**
 * Campo de texto que aceita Tab e cresce com o conteúdo.
 *
 * DOIS PROBLEMAS QUE ISTO RESOLVE
 *
 * O Tab, num textarea comum, pula para o próximo campo. Quem tentava organizar
 * a observação em lista perdia o texto e ia parar em outro lugar da tela. Aqui
 * o Tab recua, o Shift+Tab desrecua, e com várias linhas selecionadas o bloco
 * inteiro anda junto — como em qualquer editor.
 *
 * E a altura fixa escondia observação longa: o texto existia, mas só três
 * linhas apareciam, sem sinal de que havia mais. Quem escreveu não conseguia
 * reler o que escreveu. Agora o campo cresce até o teto e só então rola.
 *
 * O Escape continua saindo do campo — sem isso, o Tab deixaria de ser a rota de
 * fuga para quem navega por teclado, e o campo viraria uma armadilha.
 */
export function AreaDeTexto({
    value, onChange, placeholder, linhas = 3, linhasMaximas = 16,
    maiuscula = false, disabled, className = '', id, redimensionavel = false,
}: Props) {
    const borda: BordaArrastada = redimensionavel === 'base' ? 'base' : 'topo';
    const ref = useRef<HTMLTextAreaElement>(null);
    /**
     * Onde o cursor deve parar depois que o React repintar o campo.
     *
     * Trocar o `value` de um textarea controlado joga o cursor para o fim —
     * então, sem isto, cada Tab mandava quem estava editando o meio do texto
     * lá para o final. Restaurar num `requestAnimationFrame` não bastava: ele
     * corre fora do compasso do commit, e às vezes a posição era escrita antes
     * de o React trocar o valor, sendo desfeita em seguida. O layout effect
     * roda depois da mutação do DOM e antes da pintura — a posição certa é a
     * única que o olho chega a ver.
     */
    const selecaoPendente = useRef<{ inicio: number; fim: number } | null>(null);
    /**
     * Altura escolhida na mão. Enquanto for null, o campo cresce sozinho.
     *
     * Uma vez arrastado, o manual manda: as duas regras brigando fariam o
     * campo voltar ao tamanho automático na próxima tecla, desfazendo o que
     * a pessoa acabou de ajustar.
     */
    const [alturaManual, setAlturaManual] = useState<number | null>(null);
    const arraste = useRef<{ y0: number; altura0: number } | null>(null);

    // Cresce até o teto. Em layout effect, para o usuário nunca ver o salto.
    const ajustarAltura = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const estilo = window.getComputedStyle(el);
        const alturaDaLinha = parseFloat(estilo.lineHeight) || 16;
        const molduras = parseFloat(estilo.paddingTop) + parseFloat(estilo.paddingBottom)
            + parseFloat(estilo.borderTopWidth) + parseFloat(estilo.borderBottomWidth);
        const teto = alturaDaLinha * linhasMaximas + molduras;
        const piso = alturaDaLinha * linhas + molduras;

        el.style.height = 'auto';
        const desejada = el.scrollHeight;

        if (alturaManual !== null) {
            el.style.height = `${alturaManual}px`;
            el.style.overflowY = desejada > alturaManual ? 'auto' : 'hidden';
            return;
        }

        el.style.height = `${Math.min(Math.max(desejada, piso), teto)}px`;
        el.style.overflowY = desejada > teto ? 'auto' : 'hidden';
    }, [linhas, linhasMaximas, alturaManual]);

    useLayoutEffect(() => {
        ajustarAltura();
        const alvo = selecaoPendente.current;
        if (alvo && ref.current) {
            ref.current.setSelectionRange(alvo.inicio, alvo.fim);
            selecaoPendente.current = null;
        }
    }, [value, ajustarAltura]);

    const limites = () => ({
        minima: 56,
        maxima: alturaMaximaNaJanela(typeof window !== 'undefined' ? window.innerHeight : 800),
    });

    const aoPressionarAlca = (e: React.PointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        const alturaAtual = ref.current?.getBoundingClientRect().height || 0;
        arraste.current = { y0: e.clientY, altura0: alturaAtual };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    const aoArrastarAlca = (e: React.PointerEvent<HTMLDivElement>) => {
        const a = arraste.current;
        if (!a) return;
        setAlturaManual(alturaAoArrastar(a.altura0, e.clientY - a.y0, limites(), borda));
    };

    const aoSoltarAlca = (e: React.PointerEvent<HTMLDivElement>) => {
        arraste.current = null;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* já liberado */ }
    };

    const aoTeclar = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Escape') {
            e.currentTarget.blur();
            return;
        }
        if (e.key !== 'Tab') return;

        const el = e.currentTarget;
        const r = aplicarTab(el.value, el.selectionStart, el.selectionEnd, e.shiftKey);
        if (r.texto === el.value) {
            // Shift+Tab sem recuo para tirar: deixa o Tab fazer o papel dele e
            // sair do campo, em vez de engolir a tecla e prender o foco.
            if (e.shiftKey) return;
        }
        e.preventDefault();
        selecaoPendente.current = { inicio: r.inicio, fim: r.fim };
        onChange(r.texto);
    };

    const campo = (
        <textarea
            id={id}
            ref={ref}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            rows={linhas}
            onKeyDown={aoTeclar}
            onChange={e => onChange(maiuscula ? e.target.value.toUpperCase() : e.target.value)}
            // `resize-none` porque a altura é automática; deixar a alça de
            // redimensionar brigaria com ela a cada tecla.
            className={`resize-none ${className}`}
        />
    );

    if (!redimensionavel) return campo;

    return (
        <div className="relative">
            {/* Alça na borda de cima. `touch-none` para o dedo arrastar a alça
                em vez de rolar a página, e duplo clique devolve o campo ao
                crescimento automático — sem isso, quem arrasta uma vez fica
                preso àquela altura para sempre. */}
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Arraste para mudar a altura do campo"
                title="Arraste para mudar a altura · duplo clique volta ao automático"
                onPointerDown={aoPressionarAlca}
                onPointerMove={aoArrastarAlca}
                onPointerUp={aoSoltarAlca}
                onPointerCancel={aoSoltarAlca}
                onDoubleClick={() => setAlturaManual(null)}
                className={`group/alca absolute left-0 right-0 h-4 flex items-center justify-center cursor-ns-resize touch-none z-10 ${borda === 'base' ? '-bottom-2' : '-top-2'}`}
            >
                <span className={`h-1 w-16 rounded-full transition-colors ${alturaManual !== null
                    ? 'bg-amber-500/50 group-hover/alca:bg-amber-500'
                    : 'bg-zinc-700 group-hover/alca:bg-amber-500/70'}`} />
            </div>
            {campo}
        </div>
    );
}
