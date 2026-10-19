import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
    /** Classe do contêiner. Precisa dar altura — o gráfico herda dela. */
    className?: string;
    style?: React.CSSProperties;
    children: ReactNode;
}

/**
 * Só desenha o filho depois que o espaço existe de verdade.
 *
 * O PROBLEMA. O recharts mede o contêiner ao montar. Quando ele monta antes de
 * o navegador ter feito o layout — e é o que acontece com uma tela carregada
 * sob `Suspense` —, a medida vem zero, o recharts desconta a borda e chega a
 * `-1`. O console enche com:
 *
 *     The width(-1) and height(-1) of chart should be greater than 0
 *
 * Não é um gráfico quebrado: ele se conserta no segundo quadro. Mas o aviso
 * fica, e console cheio de aviso inofensivo é como alarme que toca todo dia —
 * some o erro de verdade no meio, e ninguém olha mais.
 *
 * A SOLUÇÃO É ESPERAR, e não silenciar. O ResizeObserver avisa quando o
 * contêiner ganha tamanho; até lá o filho não existe, então não há o que medir
 * errado. O gráfico aparece um quadro depois — invisível para quem usa.
 *
 * Por que não `minHeight` no ResponsiveContainer: isso muda o que ele desenha
 * quando a medida falha, não impede a medida de falhar. O aviso continua.
 */
export function QuandoCouber({ className, style, children }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const [cabe, setCabe] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const conferir = () => {
            const { width, height } = el.getBoundingClientRect();
            // Os dois, e não só um: contêiner de largura total num painel ainda
            // fechado tem largura e altura zero, e um de altura fixa dentro de
            // uma coluna que ainda não se resolveu tem altura e largura zero.
            if (width > 0 && height > 0) setCabe(true);
        };

        conferir();
        const observador = new ResizeObserver(conferir);
        observador.observe(el);
        return () => observador.disconnect();
    }, []);

    return (
        <div ref={ref} className={className} style={style}>
            {cabe ? children : null}
        </div>
    );
}

export default QuandoCouber;
