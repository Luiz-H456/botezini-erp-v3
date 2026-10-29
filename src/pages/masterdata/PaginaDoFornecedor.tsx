import { useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import type { Supplier } from '@/types';
import { useCatalogoDoFornecedor } from '@/hooks/useTabelaVerdade';
import { ConfigComercial } from '@/components/tabelaVerdade/ConfigComercial';
import { TabelaDePrecos } from '@/components/tabelaVerdade/TabelaDePrecos';
import { EditorDeTecido } from '@/components/tabelaVerdade/EditorDeTecido';
import { ComprasDoFornecedor } from '@/components/tabelaVerdade/ComprasDoFornecedor';
import { BOTAO_SECUNDARIO, ROTULO_PEQUENO } from '@/components/finance/ui/estilo';

type Aba = 'dados' | 'tabela' | 'compras';

export function PaginaDoFornecedor({ fornecedor, onVoltar, onEditar }: { fornecedor: Supplier; onVoltar: () => void; onEditar: () => void }) {
    const [aba, setAba] = useState<Aba>('tabela');
    const [editando, setEditando] = useState<{ linhaId: string; tipoId?: string } | null>(null);
    const { catalogo, erro, recarregar } = useCatalogoDoFornecedor(fornecedor.id);
    const ABAS: { id: Aba; rotulo: string }[] = [{ id: 'dados', rotulo: 'Dados' }, { id: 'tabela', rotulo: 'Tabela de preços' }, { id: 'compras', rotulo: 'Compras' }];
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <button type="button" aria-label="Voltar" onClick={onVoltar} className="h-11 w-11 inline-flex items-center justify-center text-zinc-400 hover:text-white"><ArrowLeft size={18} /></button>
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-white truncate">{fornecedor.company_name}</h2>
                        <p className="text-xs text-zinc-500">{catalogo ? `${catalogo.linhas.length} linha(s) · ${catalogo.tipos.length} tecido(s)` : 'Fornecedor'}</p>
                    </div>
                </div>
                <button type="button" className={BOTAO_SECUNDARIO} onClick={onEditar}><Pencil size={14} /> Editar dados</button>
            </div>
            <div role="tablist" className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
                {ABAS.map(a => (
                    <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
                        className={`px-3 h-11 text-sm whitespace-nowrap border-b-2 ${aba === a.id ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                        {a.rotulo}
                    </button>
                ))}
            </div>
            {erro && <p className="text-sm text-rose-400">{erro}</p>}
            {aba === 'dados' && (
                <div className="grid gap-6 md:grid-cols-2">
                    <dl className="space-y-2 text-sm">
                        {([['CNPJ', fornecedor.cnpj], ['Contato', fornecedor.contact_person], ['Telefone', fornecedor.phone], ['E-mail', fornecedor.email], ['Endereço', fornecedor.address]] as const)
                            .map(([r, v]) => (<div key={r}><dt className={ROTULO_PEQUENO}>{r}</dt><dd className="text-zinc-200">{v || '—'}</dd></div>))}
                    </dl>
                    {catalogo && (
                        <div>
                            <p className="text-xs text-zinc-500 mb-3">Padrão do fornecedor. Cada linha usa isto enquanto estiver marcada "usa o do fornecedor".</p>
                            <ConfigComercial fornecedorId={fornecedor.id} catalogo={catalogo} onSalvou={recarregar} />
                        </div>
                    )}
                </div>
            )}
            {aba === 'tabela' && catalogo && (
                <TabelaDePrecos fornecedorId={fornecedor.id} catalogo={catalogo} onMudou={recarregar}
                    onEditarTipo={(linhaId, tipoId) => setEditando({ linhaId, tipoId })} />
            )}
            {aba === 'compras' && catalogo && <ComprasDoFornecedor fornecedorId={fornecedor.id} catalogo={catalogo} />}
            {editando && catalogo && (
                <EditorDeTecido linhaId={editando.linhaId} tipoId={editando.tipoId} catalogo={catalogo}
                    onClose={() => setEditando(null)} onSalvou={() => { setEditando(null); recarregar(); }} />
            )}
        </div>
    );
}
