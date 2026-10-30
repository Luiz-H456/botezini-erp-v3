import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Scale, AlertTriangle, HelpCircle } from 'lucide-react';
import { formatCurrency } from '@/utils';
import {
    custoDaPeca, margemDoPreco, abaixoDoPiso, ROTULO_DA_FALTA, OVERHEAD_PADRAO,
} from '@/utils/custoDaPeca';
import type { FaltaNoCusto } from '@/utils/custoDaPeca';
import type { Product, Insumo, CompanyProfile } from '@/types';
import { useCustoDeReferencia } from '@/hooks/useTabelaVerdade';

/**
 * Mesmas esperas do badge de histórico, pelo mesmo motivo e no mesmo lugar.
 *
 * Este badge fica ao lado dos outros dois, embaixo de CADA linha de produto.
 * Descer o mouse pela tabela não pode abrir três balões em cascata.
 */
const ESPERA_PARA_ABRIR_MS = 1000;
const FOLGA_PARA_FECHAR_MS = 180;

const LARGURA = 300;
const MARGEM_DA_JANELA = 12;

/** Onde cada campo que falta é preenchido — a parte acionável da ausência. */
const ONDE_PREENCHER: Record<FaltaNoCusto, string> = {
    'tecido-nao-escolhido': 'Escolha o tecido nesta linha.',
    'tecido-sem-custo': 'Estoque › o insumo do tecido › custo médio.',
    'tecido-sem-rendimento': 'Estoque › o insumo do tecido › rendimento (metros por kg).',
    'consumo-nao-cadastrado': 'Cadastros › Produtos › calculadora › metros por peça.',
    'mao-de-obra-nao-cadastrada': 'Cadastros › Produtos › calculadora › custo/hora, operários e peças/dia.',
};

interface Props {
    produto?: Product | null;
    /** O tecido escolhido NESTA linha — é ele que define o custo, não o padrão. */
    tecido?: Insumo | null;
    /** Preço unitário digitado na linha. */
    precoAtual?: number;
    /** Alíquota e custo/hora da casa, usados quando o produto não os tem. */
    companyProfile?: CompanyProfile | null;
}

const pctTexto = (v: number) => `${(v * 100).toFixed(0)}%`;

/**
 * Custo da peça e margem do preço digitado, ao pé da linha do orçamento.
 *
 * O custo sempre existiu no cadastro do produto e nunca viajou até a tela onde
 * o preço é decidido. Vender abaixo do custo era, por isso, silencioso.
 *
 * A regra que atravessa o componente inteiro: quando o dado não existe, o badge
 * NÃO some e NÃO mostra R$ 0,00 — diz que falta, e diz onde se preenche. Um
 * custo zero exibido como se fosse real é pior que a ausência declarada, e é
 * exatamente o que faz o alerta de margem nunca disparar.
 *
 * Nada aqui trava o salvamento. Vender abaixo do custo às vezes é decisão.
 */
export const CustoDaPecaBadge: React.FC<Props> = ({
    produto, tecido, precoAtual, companyProfile,
}) => {
    const [aberto, setAberto] = useState(false);
    const [aguardando, setAguardando] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const ancoraRef = useRef<HTMLButtonElement>(null);
    const esperaRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fechaRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Tabela verdade (v3.1): o custo de referência do tecido vence o custo médio.
    const referencia = useCustoDeReferencia();
    const tecidoComTabela = useMemo(
        () => (tecido ? { ...tecido, custo_referencia: referencia.get(tecido.id) ?? null } : tecido),
        [tecido, referencia],
    );
    const custo = useMemo(() => custoDaPeca({
        consumoM: produto?.fabric_consumption_m,
        tecido: tecidoComTabela,
        overheadPercent: produto?.overhead_percent,
        operarios: produto?.labor_workers,
        pecasPorDia: produto?.pieces_daily_capacity,
        // O custo/hora do produto vence o da casa; a casa é o padrão de quem
        // ainda não diferenciou peça a peça.
        custoHora: produto?.labor_hourly_rate || companyProfile?.labor_cost_per_hour,
        aliquota: (companyProfile?.default_tax_rate || 0) / 100,
    }), [produto, tecidoComTabela, companyProfile]);

    const margem = margemDoPreco(precoAtual, custo);
    const noVermelho = abaixoDoPiso(precoAtual, custo);

    const limpar = () => {
        if (esperaRef.current) clearTimeout(esperaRef.current);
        if (fechaRef.current) clearTimeout(fechaRef.current);
        esperaRef.current = null;
        fechaRef.current = null;
    };

    const posicionar = useCallback(() => {
        const el = ancoraRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const largura = Math.min(LARGURA, window.innerWidth - MARGEM_DA_JANELA * 2);
        // Prende à janela nas duas pontas: a linha do orçamento chega perto da
        // borda direita, e o balão escapava da tela nos itens mais à direita.
        const left = Math.max(
            MARGEM_DA_JANELA,
            Math.min(r.left, window.innerWidth - largura - MARGEM_DA_JANELA),
        );
        setPos({ top: r.bottom + 6, left });
    }, []);

    const aoEntrar = () => {
        limpar();
        setAguardando(true);
        esperaRef.current = setTimeout(() => {
            setAguardando(false);
            posicionar();
            setAberto(true);
        }, ESPERA_PARA_ABRIR_MS);
    };

    const agendarFechamento = () => {
        limpar();
        setAguardando(false);
        fechaRef.current = setTimeout(() => setAberto(false), FOLGA_PARA_FECHAR_MS);
    };

    useEffect(() => limpar, []);

    useEffect(() => {
        if (!aberto) return;
        window.addEventListener('scroll', posicionar, true);
        window.addEventListener('resize', posicionar);
        return () => {
            window.removeEventListener('scroll', posicionar, true);
            window.removeEventListener('resize', posicionar);
        };
    }, [aberto, posicionar]);

    // Sem produto escolhido não há do que falar. Diferente de "produto sem
    // custo", que é justamente o que este badge existe para dizer.
    if (!produto) return null;

    const tom = noVermelho
        ? 'text-rose-400 border-rose-500/40 bg-rose-950/25 hover:border-rose-400/60'
        : !custo.temAlgo
            ? 'text-zinc-500 border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
            : custo.completo
                ? 'text-emerald-400/90 border-emerald-500/25 bg-emerald-950/20 hover:border-emerald-500/50'
                : 'text-amber-500/90 border-amber-500/25 bg-amber-950/15 hover:border-amber-500/50';

    const rotulo = !custo.temAlgo
        ? 'Custo não cadastrado'
        : noVermelho
            ? `Piso ${formatCurrency(custo.piso)}`
            // O "≥" é o que separa um custo apurado de um custo parcial. Sem ele
            // o parcial passaria por completo e enganaria para menos.
            : `${custo.completo ? '' : '≥ '}${formatCurrency(custo.producao)}`;

    const Linha = ({ rotulo: r, valor, tom: t }: { rotulo: string; valor: string; tom?: string }) => (
        <div className="flex items-baseline justify-between gap-3 text-[11px]">
            <span className="text-zinc-500">{r}</span>
            <span className={`font-mono font-bold tabular-nums ${t || 'text-zinc-300'}`}>{valor}</span>
        </div>
    );

    return (
        <>
            <button
                ref={ancoraRef}
                type="button"
                onMouseEnter={aoEntrar}
                onMouseLeave={agendarFechamento}
                onFocus={aoEntrar}
                onBlur={agendarFechamento}
                onClick={(e) => {
                    e.preventDefault();
                    limpar();
                    setAguardando(false);
                    if (aberto) { setAberto(false); return; }
                    posicionar();
                    setAberto(true);
                }}
                className={`relative overflow-hidden mt-1 flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${tom}`}
                title={noVermelho
                    ? `Este preço não cobre o custo. Piso: ${formatCurrency(custo.piso)}`
                    : 'Custo de produção da peça — segure o mouse para ver a conta'}
            >
                {noVermelho
                    ? <AlertTriangle size={12} className="shrink-0" />
                    : !custo.temAlgo
                        ? <HelpCircle size={12} className="shrink-0" />
                        : <Scale size={12} className="shrink-0" />}

                <span className="font-mono tracking-tight truncate">{rotulo}</span>

                {margem !== null && !noVermelho && (
                    <span className={`ml-auto shrink-0 ${custo.completo ? 'text-emerald-500/70' : 'text-amber-500/60'}`}>
                        {pctTexto(margem)}
                    </span>
                )}

                {aguardando && (
                    <span
                        className="absolute bottom-0 left-0 h-[2px] w-full origin-left bg-zinc-500"
                        style={{ animation: `preencher-barra ${ESPERA_PARA_ABRIR_MS}ms linear forwards` }}
                    />
                )}
            </button>

            {aberto && pos && createPortal(
                <div
                    onMouseEnter={limpar}
                    onMouseLeave={agendarFechamento}
                    style={{ top: pos.top, left: pos.left, width: Math.min(LARGURA, window.innerWidth - MARGEM_DA_JANELA * 2) }}
                    className="fixed z-balao bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl shadow-black/60 p-3.5 flex flex-col gap-2.5 ease-out animate-in fade-in duration-150"
                >
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
                        Custo por peça
                    </p>

                    <div className="flex flex-col gap-1">
                        <Linha
                            rotulo={`Tecido${produto.fabric_consumption_m ? ` (${produto.fabric_consumption_m} m)` : ''}`}
                            valor={custo.tecido === null ? '—' : formatCurrency(custo.tecido)}
                            tom={custo.tecido === null ? 'text-zinc-700' : undefined}
                        />
                        <Linha
                            rotulo={`Insumos e energia (${produto.overhead_percent ?? OVERHEAD_PADRAO}%)`}
                            valor={custo.overhead === null ? '—' : formatCurrency(custo.overhead)}
                            tom={custo.overhead === null ? 'text-zinc-700' : undefined}
                        />
                        <Linha
                            rotulo="Mão de obra"
                            valor={custo.maoDeObra === null ? '—' : formatCurrency(custo.maoDeObra)}
                            tom={custo.maoDeObra === null ? 'text-zinc-700' : undefined}
                        />
                    </div>

                    <div className="border-t border-zinc-900 pt-2 flex flex-col gap-1">
                        <Linha
                            rotulo={custo.completo ? 'Custo de produção' : 'Custo conhecido (piso)'}
                            valor={custo.temAlgo ? formatCurrency(custo.producao) : '—'}
                            tom="text-white"
                        />
                        {custo.aliquota > 0 && (
                            <Linha
                                rotulo={`Piso com imposto (${pctTexto(custo.aliquota)})`}
                                valor={custo.temAlgo ? formatCurrency(custo.piso) : '—'}
                                tom={noVermelho ? 'text-rose-400' : 'text-zinc-300'}
                            />
                        )}
                        {margem !== null && (
                            <Linha
                                rotulo={`Margem em ${formatCurrency(precoAtual || 0)}`}
                                valor={pctTexto(margem)}
                                tom={margem < 0 ? 'text-rose-400' : margem < 0.2 ? 'text-amber-400' : 'text-emerald-400'}
                            />
                        )}
                    </div>

                    {noVermelho && (
                        <p className="flex items-start gap-2 text-[10px] leading-relaxed text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-lg px-2.5 py-2">
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                            <span>
                                O preço não cobre {custo.completo ? 'o custo' : 'nem o custo já conhecido'}.
                                Prejuízo de {formatCurrency(custo.piso - (precoAtual || 0))} por peça.
                            </span>
                        </p>
                    )}

                    {custo.faltas.length > 0 && (
                        <div className="flex flex-col gap-1.5 border-t border-zinc-900 pt-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500/70">
                                {custo.temAlgo ? 'A conta está incompleta' : 'Sem dado para calcular'}
                            </p>
                            {custo.faltas.map(f => (
                                <div key={f} className="text-[10px] leading-snug">
                                    <span className="text-zinc-300 font-bold">{ROTULO_DA_FALTA[f]}</span>
                                    <span className="text-zinc-600"> — {ONDE_PREENCHER[f]}</span>
                                </div>
                            ))}
                            {custo.temAlgo && (
                                <p className="text-[10px] text-zinc-600 leading-snug mt-0.5">
                                    O valor acima é o mínimo: o que falta só aumenta o custo e reduz a margem.
                                </p>
                            )}
                        </div>
                    )}
                </div>,
                document.body,
            )}
        </>
    );
};

export default CustoDaPecaBadge;
