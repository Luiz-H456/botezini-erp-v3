import React from 'react';
import { Check, Lock, Package } from 'lucide-react';

/**
 * As marcas de uma categoria financeira: custo fixo e custo do produto.
 *
 * São dois eixos independentes, e o texto de cada um precisa ser idêntico no
 * formulário de criação rápida e na aba de gerenciamento — três cópias do mesmo
 * parágrafo iam divergir na primeira vez que alguém ajustasse uma só.
 */

export const EXEMPLOS_FIXO = 'aluguel, folha, contador, internet';
export const EXEMPLOS_VARIAVEL = 'tecido, aviamento, frete de entrega, comissão';
export const EXEMPLOS_CPV = 'tecido, aviamento, malha, mão de obra de costura';

interface CaixaProps {
    marcado: boolean;
    onToggle: () => void;
    titulo: string;
    Icone: React.ComponentType<{ size?: number; className?: string }>;
    frase: string;
    /** Linha de baixo, que muda conforme marcado ou não. */
    consequencia: React.ReactNode;
}

/** Caixa grande, para o formulário onde há espaço para explicar. */
export const CaixaDeMarca: React.FC<CaixaProps> = ({
    marcado, onToggle, titulo, Icone, frase, consequencia,
}) => (
    <button type="button" onClick={onToggle} aria-pressed={marcado}
        className={`w-full text-left flex gap-3 p-3.5 rounded-xl border transition-all ${marcado
            ? 'bg-amber-500/10 border-amber-500/50'
            : 'bg-zinc-950/50 border-zinc-800 hover:border-zinc-700'}`}>
        <span className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center mt-0.5 transition-all ${marcado
            ? 'bg-amber-500 border-amber-500' : 'border-zinc-700'}`}>
            {marcado && <Check size={13} className="text-black" strokeWidth={4} />}
        </span>
        <span className="min-w-0">
            <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${marcado ? 'text-amber-500' : 'text-zinc-300'}`}>
                <Icone size={12} /> {titulo}
            </span>
            <span className="block text-[10px] font-bold text-zinc-400 mt-1.5 leading-snug">{frase}</span>
            <span className="block text-[10px] text-zinc-600 mt-1.5 leading-snug">{consequencia}</span>
        </span>
    </button>
);

/** Botão compacto, para a linha da lista onde só cabe o rótulo. */
export const MarcaCompacta: React.FC<{
    marcado: boolean; onToggle: () => void; ocupado?: boolean; rotulo: string; titulo: string;
}> = ({ marcado, onToggle, ocupado, rotulo, titulo }) => (
    <button onClick={onToggle} disabled={ocupado} aria-pressed={marcado} title={titulo}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors disabled:opacity-40 ${marcado
            ? 'bg-amber-500/10 text-amber-500 border-amber-500/40'
            : 'bg-zinc-950/60 text-zinc-600 border-zinc-800 hover:text-zinc-400'}`}>
        <span className={`w-3 h-3 rounded-[3px] border shrink-0 flex items-center justify-center ${marcado
            ? 'bg-amber-500 border-amber-500' : 'border-zinc-700'}`}>
            {marcado && <Check size={8} className="text-black" strokeWidth={4} />}
        </span>
        <span className="text-[9px] font-black uppercase tracking-widest">{rotulo}</span>
    </button>
);

/** As duas marcas juntas, na ordem em que se pergunta. */
export const MarcasDaCategoria: React.FC<{
    custoFixo: boolean; onCustoFixo: () => void;
    custoDoProduto: boolean; onCustoDoProduto: () => void;
}> = ({ custoFixo, onCustoFixo, custoDoProduto, onCustoDoProduto }) => (
    <div className="space-y-2">
        <CaixaDeMarca
            marcado={custoFixo} onToggle={onCustoFixo}
            titulo="Custo fixo" Icone={Lock}
            frase={`Sai todo mês independente de quanto você produz — ${EXEMPLOS_FIXO}.`}
            consequencia={custoFixo
                ? 'Entra no custo fixo do ponto de equilíbrio.'
                : <>Desmarcado = <b className="text-zinc-500">variável</b>, que cresce com a produção ({EXEMPLOS_VARIAVEL}).</>}
        />
        <CaixaDeMarca
            marcado={custoDoProduto} onToggle={onCustoDoProduto}
            titulo="Custo do produto (CPV)" Icone={Package}
            frase={`O gasto vira parte da peça vendida — ${EXEMPLOS_CPV}.`}
            consequencia={custoDoProduto
                ? 'Entra no CPV e reduz o lucro bruto do Resultado.'
                : <>Desmarcado = despesa da operação, que entra abaixo do lucro bruto. Comissão é variável mas <b className="text-zinc-500">não</b> é CPV.</>}
        />
    </div>
);
