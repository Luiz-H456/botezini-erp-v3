import React from 'react';
import { Edit2, Trash2, Filter, Search, AlertTriangle, PanelRightOpen, Building2 } from 'lucide-react';
import { CaixaDeSelecao } from '@/components/common/CaixaDeSelecao';
import { CAMPO, CARTAO, BOTAO_PRINCIPAL, ROTULO } from '@/components/finance/ui/estilo';
import { rotuloDaSecao } from '@/utils/listaPorSetor';
import type { LinhaAgrupada, Setor } from '@/utils/listaPorSetor';


export type EntityTabType = 'clients' | 'suppliers' | 'products';

export interface EntityListTabProps<T> {
  entityType: EntityTabType;
  /** Já ordenadas por seção — ver ordenarPorSecao. */
  data: LinhaAgrupada<T>[];
  /** Setor a que as categorias desta página deveriam pertencer. */
  setorDaPagina: Setor;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  onAdd: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  pagination: React.ReactNode;
  getDisplayName: (item: T) => string;
  getSubInfo: (item: T) => string;
  getCategory: (item: T) => string;
  getContactOrPrice: (item: T) => React.ReactNode;
  /** Ação extra na linha, antes de editar/excluir. Serve para o que é
   *  específico da entidade (ex.: mensagem pronta para cliente) sem que este
   *  componente genérico precise conhecer o caso. */
  renderAcaoExtra?: (item: T) => React.ReactNode;
  /** Ação geral da aba, ao lado de "Novo". Para o que não pertence a nenhuma
   *  linha — como a mensagem de primeiro contato, que existe justamente antes
   *  de haver cadastro. */
  acaoGeral?: React.ReactNode;
  /** Abre a página completa da entidade. Só clientes têm uma, por enquanto. */
  onAbrirPagina?: (item: T) => void;
  /** Rótulo do grupo desta linha, mostrado ao lado do nome. */
  getGrupo?: (item: T) => string | undefined;
  /** Abre a página do grupo ao clicar no selo. */
  onAbrirGrupo?: (grupo: string) => void;
  /** Quando definido, a lista ganha caixas de seleção para ação em lote. */
  selecao?: {
    ids: Set<string>;
    alternar: (id: string) => void;
    alternarTodos: (ids: string[]) => void;
    barra: React.ReactNode;
  };
}

export function EntityListTab<T extends { id: string }>({
  entityType,
  data,
  setorDaPagina,
  onEdit,
  onDelete,
  onAdd,
  searchTerm,
  onSearchChange,
  pagination,
  getDisplayName,
  getSubInfo,
  getCategory,
  getContactOrPrice,
  renderAcaoExtra,
  acaoGeral,
  onAbrirPagina,
  getGrupo,
  onAbrirGrupo,
  selecao,
}: EntityListTabProps<T>) {
  const labels = {
    clients: 'Clientes',
    suppliers: 'Fornecedores',
    products: 'Produtos',
  };

  return (
    <div className="ease-out animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex gap-3 w-full md:w-auto mb-4">
        <div className="relative flex-1 md:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder={`Buscar ${labels[entityType].toLowerCase()}...`}
            className={`${CAMPO} w-full pl-9`}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {acaoGeral}
        <button
          onClick={onAdd}
          className={BOTAO_PRINCIPAL}
        >
          Novo
        </button>
      </div>

      {selecao?.barra}

      <div className={`${CARTAO} overflow-x-auto`}>
        <table className="w-full text-left">
          <thead className={`bg-zinc-950/40 border-b border-zinc-800 ${ROTULO}`}>
            <tr>
              {selecao && (
                <th className="p-4 w-10">
                  {(() => {
                    const marcados = data.filter(l => selecao.ids.has(l.item.id)).length;
                    return (
                      <CaixaDeSelecao
                        marcada={data.length > 0 && marcados === data.length}
                        // Traço no lugar do visto quando só parte da pagina esta
                        // marcada: sem isso a caixa fica vazia e parece que nada
                        // foi selecionado.
                        parcial={marcados > 0 && marcados < data.length}
                        titulo="Selecionar todos desta página"
                        onToggle={() => selecao.alternarTodos(data.map(l => l.item.id))}
                      />
                    );
                  })()}
                </th>
              )}
              <th className="p-4">Nome / Descrição</th>
              <th className="p-4">Categoria</th>
              <th className="p-4">
                {entityType === 'products' ? 'Preço (T1)' : 'Contato'}
              </th>
              <th className="p-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70 text-[11px]">
            {data.map(({ item, secao }, i) => {
              // Cabeçalho de seção sempre que o SETOR muda, e cabeçalho de
              // categoria sempre que a categoria muda. A seção repete no topo
              // da página seguinte quando um grupo atravessa a paginação —
              // sem isso a segunda página abriria com nomes soltos, sem dizer
              // de que categoria são.
              const anterior = i > 0 ? data[i - 1].secao : null;
              const mudouSetor = !anterior || anterior.setor !== secao.setor;
              // Na seção "Sem categoria" o cabeçalho de seção já diz tudo —
              // repetir a categoria embaixo seria a mesma frase duas vezes.
              const mudouCategoria = secao.setor !== null
                && (mudouSetor || anterior!.categoria !== secao.categoria);

              return (
                <React.Fragment key={item.id}>
                  {mudouSetor && (
                    <tr className="bg-zinc-950/60">
                      <td colSpan={selecao ? 5 : 4} className="px-4 pt-4 pb-2 border-t border-zinc-800">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${secao.forasteira ? 'text-amber-500' : 'text-zinc-500'}`}>
                          {secao.forasteira && <AlertTriangle size={12} className="inline mb-0.5 mr-1.5" />}
                          {rotuloDaSecao(secao.setor, setorDaPagina, entityType)}
                        </span>
                        {secao.forasteira && (
                          <span className="ml-2 text-[10px] font-bold text-zinc-600 normal-case tracking-normal">
                            — categoria de outro setor; abra Cadastros › Categorias para mover
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                  {mudouCategoria && (
                    <tr className="bg-zinc-900/30">
                      <td colSpan={selecao ? 5 : 4} className="px-4 py-1.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                          {secao.categoria}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr className={`group transition-colors ${selecao?.ids.has(item.id) ? 'bg-amber-500/[0.06]' : 'hover:bg-zinc-800/50'}`}>
                    {selecao && (
                      <td className="p-4">
                        <CaixaDeSelecao
                          marcada={selecao.ids.has(item.id)}
                          onToggle={() => selecao.alternar(item.id)}
                          titulo={`Selecionar ${getDisplayName(item)}`}
                        />
                      </td>
                    )}
                    <td className="p-4">
                      {/* O nome já tinha aparência de clicável (muda de cor no
                          hover) e não fazia nada. Agora abre a página completa,
                          que é o que a aparência prometia. */}
                      {onAbrirPagina ? (
                        <div>
                          <button onClick={() => onAbrirPagina(item)} className="text-left group/nome">
                            <p className="font-black text-white uppercase tracking-tight group-hover/nome:text-amber-500 transition-colors">{getDisplayName(item)}</p>
                            <p className="text-[10px] text-zinc-500 font-mono mt-0.5 opacity-70">{getSubInfo(item)}</p>
                          </button>
                          {/* Selo do grupo abaixo do nome: e o que responde
                              "de que grupo e esta empresa?" sem abrir o cadastro.
                              Clicavel porque quem ve o nome do grupo quer o total
                              dele, nao a linha de uma filial. */}
                          {getGrupo?.(item) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onAbrirGrupo?.(getGrupo!(item)!); }}
                              title={`Ver o grupo ${getGrupo!(item)}`}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500/90 border border-amber-500/25 hover:bg-amber-500/20 transition-colors"
                            >
                              <Building2 size={12} /> {getGrupo!(item)}
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="font-black text-white uppercase tracking-tight group-hover:text-amber-500 transition-colors">{getDisplayName(item)}</p>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5 opacity-70">{getSubInfo(item)}</p>
                        </>
                      )}
                    </td>
                    <td className="p-4 text-zinc-400 font-bold uppercase tracking-widest">
                      <span className="bg-zinc-950/50 border border-zinc-800 text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-[0.15em] text-zinc-400">
                        {getCategory(item) || 'Geral'}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-zinc-400">
                      {getContactOrPrice(item)}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-150">
                        {renderAcaoExtra?.(item)}
                        {onAbrirPagina && (
                          <button
                            onClick={() => onAbrirPagina(item)}
                            title="Abrir página completa"
                            className="p-2.5 bg-zinc-950 hover:bg-zinc-900 rounded-xl text-zinc-500 hover:text-amber-500 border border-zinc-800 transition-all hover:border-amber-500/30 active:scale-90"
                          >
                            <PanelRightOpen size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => onEdit(item)}
                          aria-label="Editar"
                          className="p-2.5 bg-zinc-950 hover:bg-zinc-900 rounded-xl text-zinc-500 hover:text-white border border-zinc-800 transition-all hover:border-zinc-700 active:scale-90"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => onDelete(item)}
                          aria-label="Excluir"
                          className="p-2.5 bg-zinc-950 hover:bg-rose-950/30 rounded-xl text-zinc-600 hover:text-rose-500 border border-zinc-800 transition-all hover:border-rose-900/50 active:scale-90"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={selecao ? 5 : 4} className="p-5 text-center">
                  <div className="flex flex-col items-center gap-2 text-zinc-600">
                    <Filter size={32} strokeWidth={1} />
                    <p className="text-sm">Nenhum registro encontrado.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {pagination}
      </div>
    </div>
  );
}
