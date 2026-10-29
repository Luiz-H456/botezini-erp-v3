import { useEffect, useState } from 'react';
import { Plus, Trash2, Truck, CalendarClock } from 'lucide-react';
import { tabelaVerdadeRepository } from '@/repositories/tabelaVerdadeRepository';
import type { Catalogo, ModoFrete, TVLinha } from '@/utils/tabelaVerdade';
import { CAMPO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SUAVE } from '@/components/finance/ui/estilo';

const MODOS: { valor: ModoFrete; rotulo: string }[] = [
    { valor: 'cif', rotulo: 'CIF (por conta deles)' },
    { valor: 'por_kg', rotulo: 'Por kg' },
    { valor: 'fixo', rotulo: 'Fixo por remessa' },
    { valor: 'cotacao', rotulo: 'A cotar' },
];

type CondUI = { id?: string; nome: string; padrao: boolean };

/** Frete e condições de pagamento: do fornecedor (sem `linha`) ou de uma linha, com "usa o do fornecedor". */
export function ConfigComercial({ fornecedorId, linha, catalogo, onSalvou }: {
    fornecedorId: string; linha?: TVLinha; catalogo: Catalogo; onSalvou: () => void;
}) {
    const chaveLinha = linha?.id ?? null;
    const condAtuais = catalogo.condicoes.filter(c => c.fornecedor_id === fornecedorId && c.linha_id === chaveLinha && c.ativa)
        .sort((a, b) => a.ordem - b.ordem);
    const freteAtual = catalogo.fretes.find(f => f.fornecedor_id === fornecedorId && f.linha_id === chaveLinha) ?? null;

    const [usaFrete, setUsaFrete] = useState(linha?.usa_frete_do_fornecedor ?? false);
    const [usaCond, setUsaCond] = useState(linha?.usa_condicoes_do_fornecedor ?? false);
    const [modo, setModo] = useState<ModoFrete>(freteAtual?.modo ?? 'cotacao');
    const [valor, setValor] = useState(freteAtual?.valor != null ? String(freteAtual.valor) : '');
    const [remessa, setRemessa] = useState(freteAtual?.remessa_tipica_kg != null ? String(freteAtual.remessa_tipica_kg) : '');
    const [conds, setConds] = useState<CondUI[]>(condAtuais.map(c => ({ id: c.id, nome: c.nome, padrao: c.padrao })));
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        setConds(condAtuais.map(c => ({ id: c.id, nome: c.nome, padrao: c.padrao })));
        setModo(freteAtual?.modo ?? 'cotacao');
        setValor(freteAtual?.valor != null ? String(freteAtual.valor) : '');
        setRemessa(freteAtual?.remessa_tipica_kg != null ? String(freteAtual.remessa_tipica_kg) : '');
        setUsaFrete(linha?.usa_frete_do_fornecedor ?? false);
        setUsaCond(linha?.usa_condicoes_do_fornecedor ?? false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [catalogo, chaveLinha]);

    const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
    const salvar = async () => {
        setErro('');
        const lista = conds.filter(c => c.nome.trim());
        if (!(linha && usaCond) && lista.length === 0) { setErro('Informe ao menos uma condição de pagamento.'); return; }
        if (!(linha && usaFrete) && (modo === 'por_kg' || modo === 'fixo') && !(num(valor)! >= 0)) { setErro('Informe o valor do frete.'); return; }
        setSalvando(true);
        try {
            await tabelaVerdadeRepository.salvarComercial({
                fornecedor_id: fornecedorId,
                linha_id: chaveLinha,
                ...(linha ? { usa_frete_do_fornecedor: usaFrete, usa_condicoes_do_fornecedor: usaCond } : {}),
                frete: { modo, valor: modo === 'cif' || modo === 'cotacao' ? null : num(valor), remessa_tipica_kg: modo === 'fixo' ? num(remessa) : null },
                condicoes: lista.map((c, i) => ({ id: c.id, nome: c.nome.trim(), ordem: i + 1, padrao: c.padrao })),
            });
            onSalvou();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não consegui salvar.');
        } finally {
            setSalvando(false);
        }
    };

    const freteTravado = !!linha && usaFrete;
    const condTravadas = !!linha && usaCond;
    return (
        <div className="space-y-4">
            <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <span className={`${ROTULO_PEQUENO} flex items-center gap-1.5`}><Truck size={14} /> Frete</span>
                    {linha && (
                        <label className="flex items-center gap-2 text-xs text-zinc-400">
                            <input type="checkbox" checked={usaFrete} onChange={e => setUsaFrete(e.target.checked)} /> usa o do fornecedor
                        </label>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <select className={CAMPO} value={modo} disabled={freteTravado} onChange={e => setModo(e.target.value as ModoFrete)}>
                        {MODOS.map(m => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
                    </select>
                    {(modo === 'por_kg' || modo === 'fixo') && (
                        <input className={`${CAMPO} w-32`} inputMode="decimal" disabled={freteTravado} value={valor}
                            placeholder={modo === 'por_kg' ? 'R$ por kg' : 'R$ por remessa'} onChange={e => setValor(e.target.value)} />
                    )}
                    {modo === 'fixo' && (
                        <input className={`${CAMPO} w-40`} inputMode="decimal" disabled={freteTravado} value={remessa}
                            placeholder="remessa típica (kg)" onChange={e => setRemessa(e.target.value)} />
                    )}
                </div>
                {modo === 'fixo' && !remessa && !freteTravado && (
                    <p className="text-xs text-amber-400/90">Sem a remessa típica o frete fixo não entra no custo de referência (fica como pendência).</p>
                )}
            </section>

            <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <span className={`${ROTULO_PEQUENO} flex items-center gap-1.5`}><CalendarClock size={14} /> Condições de pagamento</span>
                    {linha && (
                        <label className="flex items-center gap-2 text-xs text-zinc-400">
                            <input type="checkbox" checked={usaCond} onChange={e => setUsaCond(e.target.checked)} /> usa as do fornecedor
                        </label>
                    )}
                </div>
                {conds.map((c, i) => (
                    <div key={c.id ?? `nova-${i}`} className="flex items-center gap-2">
                        <input className={`${CAMPO} flex-1 min-w-0`} value={c.nome} disabled={condTravadas} placeholder="Ex.: 30 dias"
                            onChange={e => setConds(prev => prev.map((x, k) => (k === i ? { ...x, nome: e.target.value } : x)))} />
                        <label className="flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
                            <input type="radio" name={`padrao-${chaveLinha ?? 'f'}`} aria-label={`${c.nome || 'Esta condição'} é a padrão`} checked={c.padrao} disabled={condTravadas}
                                onChange={() => setConds(prev => prev.map((x, k) => ({ ...x, padrao: k === i })))} /> padrão
                        </label>
                        {!condTravadas && (
                            <button type="button" aria-label="Tirar condição" className="h-11 w-11 inline-flex items-center justify-center text-zinc-500 hover:text-rose-400"
                                onClick={() => setConds(prev => prev.filter((_, k) => k !== i))}><Trash2 size={16} /></button>
                        )}
                    </div>
                ))}
                {!condTravadas && (
                    <button type="button" className={BOTAO_SUAVE} onClick={() => setConds(prev => [...prev, { nome: '', padrao: prev.length === 0 }])}>
                        <Plus size={14} /> Condição
                    </button>
                )}
                <p className="text-xs text-zinc-500">A condição padrão é a que entra nos cálculos; as outras ficam para consulta.</p>
            </section>

            {erro && <p className="text-xs text-rose-400">{erro}</p>}
            <button type="button" className={BOTAO_PRINCIPAL} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar frete e condições'}</button>
        </div>
    );
}

