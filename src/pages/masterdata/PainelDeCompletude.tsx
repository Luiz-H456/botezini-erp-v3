import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ClipboardList, Coins, ChevronRight, Check, TrendingUp, EyeOff, Eye,
    AlertTriangle, Loader2,
} from 'lucide-react';
import { formatCurrency } from '@/utils';
import { useCompletudeDoCadastro } from '@/hooks/useCompletudeDoCadastro';
import { quantosResolvem } from '@/utils/completudeDoCadastro';
import { produtosSemFichaQueVenderam } from '@/utils/completudeDosDados';
import { BOTAO_PRINCIPAL, BOTAO_SECUNDARIO, CARTAO, ITEM } from '@/components/finance/ui/estilo';
import type { LinhaPendente } from '@/utils/completudeDoCadastro';
import { InfoTooltip } from '@/components/common';
import { IndicadorRecarga } from '@/components/common/IndicadorRecarga';

interface Props {
    /** Abre a edição do produto, onde mora a ficha técnica. */
    onAbrirProduto: (produtoId: string) => void;
    /** Leva ao Estoque já buscando este insumo pelo nome. */
    onAbrirInsumo: (nomeDoInsumo: string) => void;
    /** Abre a ficha do primeiro produto sem ficha e deixa os outros na fila.
     *  Recebe os ids na ordem da lista: quem vende mais primeiro. */
    onComecarMutirao: (ids: string[]) => void;
    /** Rola até o painel ao montar: quem vem da fila do Início cai aqui. */
    destacar?: boolean;
    /** Chamado logo depois da rolagem do `destacar`: quem passou a abertura a descarta. */
    aoDestacar?: () => void;
    /** Sobe quando algo mudou lá fora (ficha, custo): o painel relê no lugar, sem remontar,
     *  e a rolagem e o "ver mais" ficam como estavam. */
    versao?: number;
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

/**
 * Cor da cobertura pelo que ela significa, não por gosto.
 *
 * Abaixo de 30% o custo do orçamento é chute na maioria das vendas; acima de
 * 70% dá para confiar na margem na maior parte delas. O meio é o meio.
 */
const tomDaCobertura = (v: number) =>
    v >= 0.7 ? 'text-emerald-400' : v >= 0.3 ? 'text-amber-400' : 'text-red-400';

const barraDaCobertura = (v: number) =>
    v >= 0.7 ? 'bg-emerald-500' : v >= 0.3 ? 'bg-amber-500' : 'bg-red-500';

/**
 * Uma pendência da lista.
 *
 * O peso aparece em três medidas porque cada uma responde uma pergunta
 * diferente: faturamento diz quanto dinheiro passa por um custo desconhecido,
 * peças dizem com que frequência o erro se repete, e pedidos dizem se é um
 * cliente só ou o catálogo inteiro.
 */
const Linha: React.FC<{
    linha: LinhaPendente;
    maiorFaturamento: number;
    onAbrir: () => void;
}> = ({ linha, maiorFaturamento, onAbrir }) => {
    const semGiro = linha.pecas === 0;
    const largura = maiorFaturamento > 0 ? (linha.faturamento / maiorFaturamento) * 100 : 0;

    return (
        <button
            onClick={onAbrir}
            className="w-full text-left group relative overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/60 transition-colors px-4 py-3"
        >
            {/* Barra de fundo proporcional ao maior da lista: dá a proporção sem
                pedir para ninguém comparar números de cabeça. */}
            <div
                className="absolute inset-y-0 left-0 bg-amber-500/[0.06] pointer-events-none transition-[width] duration-300"
                style={{ width: `${largura}%` }}
            />

            <div className="relative flex items-center gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-zinc-200 truncate group-hover:text-white transition-colors">
                        {linha.nome}
                    </p>
                    <p className="text-[10px] text-zinc-600 font-medium mt-0.5">
                        {semGiro
                            ? 'Nunca apareceu em pedido'
                            : `${linha.pecas.toLocaleString('pt-BR')} peças · ${linha.pedidos} ${linha.pedidos === 1 ? 'pedido' : 'pedidos'}`}
                    </p>
                </div>

                <div className="text-right shrink-0">
                    <p className={`text-xs font-mono font-black tabular-nums ${semGiro ? 'text-zinc-700' : 'text-zinc-300'}`}>
                        {semGiro ? '—' : formatCurrency(linha.faturamento)}
                    </p>
                    {!semGiro && linha.fatia >= 0.01 && (
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/70 mt-0.5">
                            {pct(linha.fatia)} do faturamento
                        </p>
                    )}
                </div>

                <ChevronRight size={14} className="text-zinc-700 group-hover:text-amber-500 transition-colors shrink-0" />
            </div>
        </button>
    );
};

const ListaPendente: React.FC<{
    titulo: string;
    icone: React.ElementType;
    linhas: LinhaPendente[];
    total: number;
    vazio: string;
    onAbrir: (l: LinhaPendente) => void;
    acao?: React.ReactNode;
}> = ({ titulo, icone: Icone, linhas, total, vazio, onAbrir, acao }) => {
    const [mostrarCauda, setMostrarCauda] = useState(false);

    const comGiro = useMemo(() => linhas.filter(l => l.pecas > 0), [linhas]);
    const semGiro = useMemo(() => linhas.filter(l => l.pecas === 0), [linhas]);
    const maior = comGiro[0]?.faturamento || 0;
    const foco = quantosResolvem(comGiro, 0.8);

    const visiveis = mostrarCauda ? [...comGiro, ...semGiro] : comGiro;

    return (
        <section className={`${CARTAO} p-5 flex flex-col gap-4 min-w-0`}>
            <header className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    <Icone size={14} className="text-amber-500" />
                    {titulo}
                </h3>
                <span className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-zinc-600 tabular-nums">
                        {linhas.length} de {total}
                    </span>
                    {acao}
                </span>
            </header>

            {linhas.length === 0 ? (
                <p className="flex items-center gap-2 text-xs text-emerald-400/80 font-medium py-6 justify-center">
                    <Check size={14} /> {vazio}
                </p>
            ) : (
                <>
                    {foco > 0 && (
                        <p className="flex items-start gap-2.5 text-[11px] text-zinc-400 leading-relaxed bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-3.5 py-2.5">
                            <TrendingUp size={13} className="text-amber-500 shrink-0 mt-0.5" />
                            <span>
                                Os <strong className="text-amber-400 font-black">{foco} primeiros</strong> respondem
                                por 80% do faturamento que passa por esta lista.
                            </span>
                        </p>
                    )}

                    <div className="flex flex-col gap-1.5">
                        {visiveis.map(l => (
                            <Linha key={l.id} linha={l} maiorFaturamento={maior} onAbrir={() => onAbrir(l)} />
                        ))}
                    </div>

                    {semGiro.length > 0 && (
                        <button
                            onClick={() => setMostrarCauda(v => !v)}
                            className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors py-1"
                        >
                            {mostrarCauda ? <EyeOff size={12} /> : <Eye size={12} />}
                            {mostrarCauda ? 'Esconder' : 'Mostrar'} os {semGiro.length} que nunca giraram
                        </button>
                    )}

                    {comGiro.length === 0 && !mostrarCauda && (
                        <p className="text-[11px] text-zinc-600 italic text-center py-2">
                            Nenhuma destas pendências apareceu em pedido.
                        </p>
                    )}
                </>
            )}
        </section>
    );
};

/**
 * Completude do cadastro — o painel do topo da aba Produtos: o que falta
 * preencher, na ordem em que compensa.
 *
 * Esta tela existe porque a lista alfabética de "o que falta" é verdadeira e
 * inútil: preencher tudo de uma vez não vai acontecer. Ordenada por giro, ela
 * responde outra pergunta — quais oito cadastros mudam metade do resultado.
 *
 * A cobertura no topo é o placar: quanto do faturamento passa por peças que dá
 * para custear inteiras. Ele começa baixo de propósito. É o número que o D2
 * (custo e piso no orçamento) usa para saber quando pode confiar em si mesmo.
 */
const Painel: React.FC<Omit<Props, 'destacar' | 'aoDestacar'>> = ({ onAbrirProduto, onAbrirInsumo, onComecarMutirao, versao = 0 }) => {
    const {
        completude: c, carregando, recarregando, erro, temDados, recarregar,
        totalDeProdutos, totalDeInsumos,
    } = useCompletudeDoCadastro();
    const [expandido, setExpandido] = useState(false);

    // A primeira leitura é do próprio gancho; as seguintes, a cada `versao` nova.
    const versaoLida = useRef(versao);
    useEffect(() => {
        if (versaoLida.current === versao) return;
        versaoLida.current = versao;
        void recarregar();
    }, [versao, recarregar]);

    if (carregando) {
        return (
            <div className="text-center p-16 text-zinc-600 flex flex-col items-center gap-4">
                <Loader2 size={28} className="animate-spin text-amber-500" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                    Cruzando cadastro com o que foi vendido...
                </span>
            </div>
        );
    }

    const faixaDeErro = erro && (
        <div className="flex items-center gap-3 bg-red-950/40 border border-red-900/60 text-red-200 rounded-2xl px-5 py-4">
            <AlertTriangle size={16} className="text-red-500 shrink-0" />
            <span className="text-xs font-medium flex-1">{erro}</span>
            <button onClick={recarregar} className="text-[10px] font-black uppercase tracking-widest text-red-300 hover:text-white transition-colors">
                Tentar de novo
            </button>
        </div>
    );

    // Primeira leitura falhou: não há o que mostrar, o erro ocupa o painel.
    // Recarga que falhou com dados já na tela: o conteúdo fica e o erro vira faixa acima dele.
    if (erro && !temDados) return faixaDeErro;

    // Recolhido quando está bom: cobertura alta e nada do que vende sem ficha.
    if (c.cobertura > 0.7 && produtosSemFichaQueVenderam(c) === 0 && !expandido) {
        return (
            <div className="space-y-3">
                {faixaDeErro}
                <div className={`${ITEM} flex items-center justify-between gap-3 px-4 py-3`}>
                    <p className="text-xs font-bold text-zinc-300">
                        Cobertura {pct(c.cobertura)} · tudo o que vende tem ficha técnica
                    </p>
                    <button onClick={() => setExpandido(true)} className={BOTAO_SECUNDARIO}>Ver detalhes</button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5 ease-out animate-in fade-in duration-200">
            {faixaDeErro}
            {/* ── Placar ─────────────────────────────────────────────────── */}
            <div className={`${CARTAO} p-5`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                        <h2 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                            Faturamento com custo apurável
                            <InfoTooltip>
                                Uma peça só é custeável quando o produto tem ficha técnica E todos os
                                insumos que ela usa têm custo cadastrado. Basta um furo para o custo da
                                peça inteira virar chute — por isso a conta é por peça, e não por campo
                                preenchido.
                            </InfoTooltip>
                        </h2>
                        <p className={`text-5xl font-black tabular-nums mt-2 ${tomDaCobertura(c.cobertura)}`}>
                            {pct(c.cobertura)}
                        </p>
                        <p className="text-xs text-zinc-500 font-medium mt-1">
                            {formatCurrency(c.faturamentoCoberto)} de {formatCurrency(c.faturamentoConhecido)} vendidos
                        </p>
                    </div>

                    <div className="flex items-center gap-6 text-right">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Produtos sem ficha</p>
                            <p className="text-2xl font-black text-zinc-300 tabular-nums">{c.produtosPendentes}</p>
                            <p className="text-[10px] text-zinc-600">de {totalDeProdutos}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Insumos sem custo</p>
                            <p className="text-2xl font-black text-zinc-300 tabular-nums">{c.insumosPendentes}</p>
                            <p className="text-[10px] text-zinc-600">de {totalDeInsumos}</p>
                        </div>
                        <IndicadorRecarga ativo={recarregando} />
                    </div>
                </div>

                <div className="h-1.5 bg-zinc-800/60 rounded-full overflow-hidden mt-5">
                    <div
                        className={`h-full rounded-full transition-[width] duration-500 ease-out ${barraDaCobertura(c.cobertura)}`}
                        style={{ width: `${Math.min(100, c.cobertura * 100)}%` }}
                    />
                </div>

                {c.pecasSemPreco > 0 && (
                    <p className="text-[10px] text-zinc-600 font-medium mt-3">
                        {c.pecasSemPreco.toLocaleString('pt-BR')} peças ficaram fora desta conta: não se achou o
                        preço na linha de orçamento de origem. Elas não entram como zero — entram como desconhecidas.
                    </p>
                )}
            </div>

            {/* ── As duas listas ─────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ListaPendente
                    titulo="Produtos sem ficha técnica"
                    icone={ClipboardList}
                    linhas={c.produtosSemFicha}
                    total={totalDeProdutos}
                    vazio="Todo produto cadastrado tem ficha."
                    onAbrir={l => onAbrirProduto(l.id)}
                    acao={c.produtosSemFicha.length > 0 && (
                        <button
                            onClick={() => onComecarMutirao(c.produtosSemFicha.map(l => l.id))}
                            className={BOTAO_PRINCIPAL}
                        >
                            Começar mutirão
                        </button>
                    )}
                />
                <ListaPendente
                    titulo="Insumos sem custo"
                    icone={Coins}
                    linhas={c.insumosSemCusto}
                    total={totalDeInsumos}
                    vazio="Todo insumo cadastrado tem custo."
                    onAbrir={l => onAbrirInsumo(l.nome)}
                />
            </div>
        </div>
    );
};

export const PainelDeCompletude: React.FC<Props> = ({ destacar, aoDestacar, ...resto }) => {
    const ref = useRef<HTMLDivElement>(null);

    // O invólucro existe em todos os estados do painel (carregando, erro,
    // pronto): é nele que o scroll mira, e ele já está na tela ao montar.
    useEffect(() => {
        if (!destacar) return;
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        aoDestacar?.();
    }, []);

    return <div ref={ref}><Painel {...resto} /></div>;
};

export default PainelDeCompletude;
