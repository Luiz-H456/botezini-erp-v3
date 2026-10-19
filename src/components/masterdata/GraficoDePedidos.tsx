import React from 'react';
import { formatCurrency } from '@/utils';
import type { MesDoCliente } from '@/utils/dossieDoCliente';

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const rotuloDoMes = (mes: string) => {
    const [a, m] = mes.split('-').map(Number);
    if (!a || !m) return mes;
    return `${MES_CURTO[m - 1]}/${String(a).slice(2)}`;
};

/**
 * Preenche os meses sem pedido entre o primeiro e o último.
 *
 * Sem isso o gráfico mentiria: três pedidos em janeiro, maio e setembro
 * apareceriam como três barras vizinhas, sugerindo compra constante. O buraco
 * é a informação mais importante aqui — é ele que mostra o cliente sumido.
 */
function comMesesVazios(serie: MesDoCliente[]): MesDoCliente[] {
    if (serie.length === 0) return [];
    const saida: MesDoCliente[] = [];
    const [aInicio, mInicio] = serie[0].mes.split('-').map(Number);
    const [aFim, mFim] = serie[serie.length - 1].mes.split('-').map(Number);
    const porMes = new Map(serie.map(s => [s.mes, s]));

    let total = aInicio * 12 + (mInicio - 1);
    const fim = aFim * 12 + (mFim - 1);
    // Teto de 36 colunas: além disso a barra fica com menos de um pixel e o
    // gráfico deixa de ser legível — melhor mostrar o período recente inteiro.
    const passos = Math.min(fim - total, 35);
    total = fim - passos;

    for (let t = total; t <= fim; t++) {
        const a = Math.floor(t / 12);
        const m = (t % 12) + 1;
        const chave = `${a}-${String(m).padStart(2, '0')}`;
        saida.push(porMes.get(chave) || { mes: chave, pedidos: 0, valor: 0 });
    }
    return saida;
}

/**
 * Pedidos ao longo do tempo, em barras.
 *
 * SVG na mão em vez de biblioteca de gráfico: é uma série pequena, de uma
 * dimensão, e a página já carrega dados demais para somar um pacote de
 * charting por causa de doze barras.
 */
export const GraficoDePedidos: React.FC<{ serie: MesDoCliente[] }> = ({ serie }) => {
    const dados = comMesesVazios(serie);
    if (dados.length === 0) {
        return (
            <p className="text-[11px] text-zinc-600 font-bold py-8 text-center">
                Nenhum pedido para desenhar ainda.
            </p>
        );
    }

    const maior = Math.max(...dados.map(d => d.valor), 1);
    const ALTURA = 120;

    return (
        <div className="space-y-2">
            <div className="flex items-end gap-1 h-[120px]">
                {dados.map(d => {
                    const altura = d.valor > 0 ? Math.max(3, (d.valor / maior) * ALTURA) : 2;
                    return (
                        <div key={d.mes} className="flex-1 min-w-0 flex flex-col justify-end group relative">
                            <div
                                style={{ height: altura }}
                                className={`rounded-t transition-colors ${d.valor > 0
                                    ? 'bg-amber-500/70 group-hover:bg-amber-500'
                                    : 'bg-zinc-800'}`}
                            />
                            {/* Tooltip nativo: numa barra de 8px, um balão em
                                portal seria mais código do que o dado vale. */}
                            <span className="absolute inset-0" title={
                                d.valor > 0
                                    ? `${rotuloDoMes(d.mes)} — ${d.pedidos} pedido${d.pedidos > 1 ? 's' : ''}, ${formatCurrency(d.valor)}`
                                    : `${rotuloDoMes(d.mes)} — sem pedido`
                            } />
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center justify-between text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                <span>{rotuloDoMes(dados[0].mes)}</span>
                <span className="font-mono normal-case tracking-normal text-zinc-700">
                    pico {formatCurrency(maior)}
                </span>
                <span>{rotuloDoMes(dados[dados.length - 1].mes)}</span>
            </div>
        </div>
    );
};
