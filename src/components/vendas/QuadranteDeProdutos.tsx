import React, { useMemo, useState } from 'react';
import { AlertTriangle, Crown, Gem, Minus, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/utils';
import {
    montarQuadrantes, potencialDoAjuste, ROTULO_DO_QUADRANTE,
    EXPLICACAO_DO_QUADRANTE, MINIMO_DE_PRODUTOS,
} from '@/utils/quadranteDeProdutos';
import type { Quadrante, PontoDoQuadrante } from '@/utils/quadranteDeProdutos';
import type { MargemDoProduto } from '@/utils/lucratividade';
import { CARTAO, ROTULO_PEQUENO } from '@/components/finance/ui/estilo';

interface Props {
    margens: MargemDoProduto[];
}

const ICONE: Record<Quadrante, React.ElementType> = {
    'ocupa-e-nao-paga': AlertTriangle,
    'carro-chefe': Crown,
    'joia-escondida': Gem,
    'cauda': Minus,
};

const TOM: Record<Quadrante, { texto: string; borda: string; ponto: string }> = {
    'ocupa-e-nao-paga': { texto: 'text-rose-400', borda: 'border-rose-500/30 bg-rose-950/15', ponto: 'bg-rose-500' },
    'carro-chefe': { texto: 'text-emerald-400', borda: 'border-emerald-500/30 bg-emerald-950/15', ponto: 'bg-emerald-500' },
    'joia-escondida': { texto: 'text-sky-400', borda: 'border-sky-500/30 bg-sky-950/15', ponto: 'bg-sky-400' },
    'cauda': { texto: 'text-zinc-500', borda: 'border-zinc-800 bg-zinc-950/40', ponto: 'bg-zinc-600' },
};

/** A ordem de leitura: o problema primeiro, a oportunidade depois. */
const ORDEM: Quadrante[] = ['ocupa-e-nao-paga', 'joia-escondida', 'carro-chefe', 'cauda'];

const pct = (v: number) => `${v.toFixed(0)}%`;

/**
 * Volume contra margem.
 *
 * As duas informações já existiam em colunas separadas, e o cruzamento delas só
 * aparecia se alguém ordenasse uma, decorasse o topo, ordenasse a outra e
 * comparasse de cabeça. Ninguém faz isso.
 *
 * O canto de baixo à direita é o produto que ocupa a fábrica e não paga por
 * ela. Ele nunca chama atenção sozinho porque é campeão de faturamento — está
 * no topo de toda lista ordenada por venda e parece o carro-chefe.
 *
 * Os cortes são MEDIANAS da própria carteira. Um limiar fixo diria mais sobre o
 * setor do que sobre esta fábrica, e poria tudo do mesmo lado quando o negócio
 * inteiro estivesse acima ou abaixo dele.
 */
export const QuadranteDeProdutos: React.FC<Props> = ({ margens }) => {
    const [emFoco, setEmFoco] = useState<PontoDoQuadrante | null>(null);

    const q = useMemo(() => montarQuadrantes(margens.map(m => ({
        produto: m.produto,
        pecas: m.pecas,
        margemPct: m.margemPct,
        contribuicaoTotal: m.contribuicaoTotal,
        precoMedio: m.precoMedio,
        custoUnitario: m.custoUnitario,
    }))), [margens]);

    const potencial = useMemo(() => potencialDoAjuste(q), [q]);
    const vermelhos = q.porQuadrante['ocupa-e-nao-paga'];

    if (q.pontos.length < MINIMO_DE_PRODUTOS) {
        return (
            <div className={`${CARTAO} flex items-start gap-3 p-5`}>
                <TrendingUp size={16} className="text-zinc-600 shrink-0 mt-0.5" />
                <div>
                    <p className="text-xs font-black text-white uppercase tracking-tight">
                        Ainda não há o que cruzar
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed max-w-2xl">
                        São precisos ao menos {MINIMO_DE_PRODUTOS} produtos com custo cadastrado e venda no
                        período. Com menos, a mediana separa um de dois e o quadrante vira um nome
                        pomposo para uma lista de três linhas.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {vermelhos.length > 0 && (
                <div className="flex items-start gap-3 bg-rose-950/15 border border-rose-500/25 rounded-2xl px-5 py-4">
                    <AlertTriangle size={17} className="text-rose-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <p className="text-xs font-black text-white uppercase tracking-tight">
                            {vermelhos.length} {vermelhos.length === 1 ? 'produto ocupa' : 'produtos ocupam'} a
                            fábrica sem pagar por ela
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed max-w-3xl">
                            {vermelhos.slice(0, 3).map(p => p.produto).join(', ')}
                            {vermelhos.length > 3 && ` e mais ${vermelhos.length - 3}`}.
                            {potencial > 0 && (
                                <> Levá-los à margem mediana da casa ({pct(q.corteDeMargem)}) valeria da
                                ordem de <strong className="text-rose-300">{formatCurrency(potencial)}</strong> no
                                mesmo volume — é ordem de grandeza, não promessa: o volume muda quando o preço muda.</>
                            )}
                        </p>
                    </div>
                </div>
            )}

            {/* ── O mapa ─────────────────────────────────────────────────── */}
            <div className={`${CARTAO} p-5`}>
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                    <p className={ROTULO_PEQUENO}>
                        Margem da peça ↑ · peças vendidas →
                    </p>
                    <p className="text-[10px] text-zinc-600">
                        cortes na mediana da casa: {q.corteDeVolume.toLocaleString('pt-BR')} peças
                        e {pct(q.corteDeMargem)}
                    </p>
                </div>

                <div className="relative h-72 rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden">
                    {/* As linhas de corte. Ficam atrás dos pontos e são discretas:
                        são referência, não conteúdo. */}
                    <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-800" />
                    <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-800" />

                    <span className="absolute bottom-2 right-3 text-[9px] font-black uppercase tracking-widest text-rose-500/50">
                        ocupa e não paga
                    </span>
                    <span className="absolute top-2 right-3 text-[9px] font-black uppercase tracking-widest text-emerald-500/40">
                        carro-chefe
                    </span>
                    <span className="absolute top-2 left-3 text-[9px] font-black uppercase tracking-widest text-sky-500/40">
                        joia escondida
                    </span>

                    {q.pontos.map(p => {
                        // A posição usa o quadrante, não o valor cru: os pontos
                        // se espalham dentro do próprio canto em vez de se
                        // amontoarem na origem quando um produto sozinho tem
                        // dez vezes o volume dos outros.
                        const meiaLargura = p.pecas >= q.corteDeVolume ? 50 : 0;
                        const meiaAltura = p.margemPct >= q.corteDeMargem ? 0 : 50;
                        const dentroX = p.pecas >= q.corteDeVolume
                            ? (p.x - (q.corteDeVolume / q.maiorVolume)) / Math.max(0.01, 1 - q.corteDeVolume / q.maiorVolume)
                            : p.x / Math.max(0.01, q.corteDeVolume / q.maiorVolume);
                        const esquerda = meiaLargura + Math.min(0.92, Math.max(0.06, dentroX)) * 46;
                        const alto = meiaAltura + (1 - Math.min(0.92, Math.max(0.06, p.y))) * 46;

                        return (
                            <button
                                key={p.produto}
                                onMouseEnter={() => setEmFoco(p)}
                                onMouseLeave={() => setEmFoco(null)}
                                onClick={() => setEmFoco(emFoco?.produto === p.produto ? null : p)}
                                style={{ left: `${esquerda}%`, top: `${alto}%` }}
                                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-150 ${TOM[p.quadrante].ponto} ${
                                    emFoco?.produto === p.produto ? 'scale-150 ring-2 ring-white/40' : ''
                                }`}
                                // O tamanho carrega a contribuição total: o ponto
                                // grande é o que move dinheiro de verdade.
                                title={p.produto}
                            >
                                <span
                                    className="block"
                                    style={{
                                        width: `${6 + Math.min(14, Math.sqrt(Math.max(0, p.contribuicaoTotal)) / 8)}px`,
                                        height: `${6 + Math.min(14, Math.sqrt(Math.max(0, p.contribuicaoTotal)) / 8)}px`,
                                    }}
                                />
                            </button>
                        );
                    })}

                    {emFoco && (
                        <div className="absolute bottom-3 left-3 bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2.5 pointer-events-none max-w-[70%]">
                            <p className="text-xs font-black text-white truncate">{emFoco.produto}</p>
                            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                {emFoco.pecas.toLocaleString('pt-BR')} peças · margem {pct(emFoco.margemPct)} ·
                                {' '}{formatCurrency(emFoco.contribuicaoTotal)} no total
                            </p>
                            <p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${TOM[emFoco.quadrante].texto}`}>
                                {ROTULO_DO_QUADRANTE[emFoco.quadrante]}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── As quatro listas ───────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {ORDEM.map(quad => {
                    const itens = q.porQuadrante[quad];
                    const Icone = ICONE[quad];
                    return (
                        <section key={quad} className={`rounded-2xl border p-5 space-y-3 ${TOM[quad].borda}`}>
                            <header>
                                <h3 className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${TOM[quad].texto}`}>
                                    <Icone size={14} /> {ROTULO_DO_QUADRANTE[quad]}
                                    <span className="ml-auto text-zinc-600 tabular-nums">{itens.length}</span>
                                </h3>
                                <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
                                    {EXPLICACAO_DO_QUADRANTE[quad]}
                                </p>
                            </header>

                            {itens.length === 0 ? (
                                <p className="text-[10px] text-zinc-700 italic py-2">nenhum produto aqui</p>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    {itens.slice(0, 8).map(p => (
                                        <div key={p.produto} className="flex items-center gap-3 text-[11px]">
                                            <span className="text-zinc-300 font-bold truncate flex-1">{p.produto}</span>
                                            <span className="text-zinc-600 tabular-nums shrink-0">
                                                {p.pecas.toLocaleString('pt-BR')} pçs
                                            </span>
                                            <span className={`font-mono font-black tabular-nums w-10 text-right shrink-0 ${TOM[quad].texto}`}>
                                                {pct(p.margemPct)}
                                            </span>
                                        </div>
                                    ))}
                                    {itens.length > 8 && (
                                        <p className="text-[10px] text-zinc-700 pt-1">e mais {itens.length - 8}</p>
                                    )}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>
        </div>
    );
};

export default QuadranteDeProdutos;
