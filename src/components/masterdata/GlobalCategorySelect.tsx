import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { SearchableSelect } from '@/components/common';
import { opcoesDeCategoria } from '@/utils/opcoesAgrupadas';
import { SETOR } from '@/components/masterdata/setoresDeCategoria';
import { AtalhosDeCategoria } from '@/components/masterdata/AtalhosDeCategoria';
import type { GlobalCategory } from '@/types';

export interface GlobalCategorySelectProps {
  /** Todas as categorias globais (serão filtradas por domínio). */
  categories: GlobalCategory[];
  domain: 'crm' | 'inventory' | 'finance';
  /** id da categoria global selecionada. */
  value?: string;
  /** Retorna o id e o nome (para o app gravar os dois campos sincronizados). */
  onChange: (globalCategoryId: string, name: string) => void;
  onCreateNew: () => void;
  /** Desliga a frase de ajuda quando a tela já explica por outro caminho. */
  semAjuda?: boolean;
  /**
   * Mostra também as categorias dos outros setores, depois das deste e sob um
   * cabeçalho que diz de onde vieram. Ligado nos cadastros porque a casa já tem
   * registro classificado com categoria de outro setor: escondê-las fazia a
   * categoria procurada simplesmente sumir da lista.
   */
  incluirOutrosSetores?: boolean;
}

/**
 * Seletor ÚNICO de categoria, baseado no catálogo global (fonte oficial).
 *
 * Só a categoria de dentro do grupo é escolhível. O grupo entra como cabeçalho
 * e não pode ser selecionado: ele existe para dar hierarquia à lista, não para
 * receber lançamento. Escolher o grupo era o que produzia relatório com o gasto
 * repartido entre um nível e outro, sem ninguém conseguir dizer qual estava certo.
 *
 * Traz junto duas coisas que o campo sozinho não dizia:
 *
 *  - PARA QUE SERVE. "Categoria" não diz nada sobre a consequência. Saber que a
 *    do financeiro monta o DRE e o ponto de equilíbrio, e a do cliente segmenta
 *    a carteira, é o que faz alguém escolher com cuidado em vez de escolher a
 *    primeira da lista.
 *
 *  - ATALHOS. Numa casa com poucas categorias, abrir um menu para escolher entre
 *    quatro é trabalho que não precisa existir. Passando de oito eles somem: aí
 *    deixariam de ser atalho e virariam uma segunda lista competindo com a
 *    primeira, sem o campo de busca que a primeira tem.
 */
export const GlobalCategorySelect: React.FC<GlobalCategorySelectProps> = ({
  categories, domain, value, onChange, onCreateNew, semAjuda, incluirOutrosSetores,
}) => {
  const setor = SETOR[domain];

  const options = useMemo(
    () => opcoesDeCategoria(categories, domain, value, incluirOutrosSetores),
    [categories, domain, value, incluirOutrosSetores]);

  const opcoesDoSetor = useMemo(
    () => opcoesDeCategoria(categories, domain, value),
    [categories, domain, value]);

  const porId = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const escolher = (id: string) => onChange(id, porId.get(id)?.name || '');

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-stretch">
        <div className="flex-1 min-w-0">
          <SearchableSelect
            value={value || ''}
            onChange={(val: string) => escolher(val)}
            options={options}
            placeholder="Escolher"
            className="w-full text-[10px] font-black uppercase tracking-widest"
          />
        </div>
        <button
          type="button"
          onClick={onCreateNew}
          title="Nova categoria" aria-label="Nova categoria"
          className="bg-zinc-950/50 border border-zinc-800 text-zinc-500 hover:text-amber-500 hover:border-amber-500/30 w-10 px-0 rounded-xl transition-all active:scale-95 shrink-0 flex items-center justify-center shadow-inner"
        >
          <Plus size={18} />
        </button>
      </div>

      {!semAjuda && (
        <p className="text-[10px] text-zinc-600 font-bold leading-relaxed ml-1">
          {setor.paraQue}
        </p>
      )}

      {/* Atalhos só do setor da tela. Oferecer categoria de outro setor como
          atalho seria transformar o desalinhamento em caminho rápido. */}
      <AtalhosDeCategoria opcoes={opcoesDoSetor} valor={value} onEscolher={escolher} />

      {options.length === 0 && (
        <p className="text-[10px] text-amber-500/80 font-bold leading-relaxed ml-1">
          Nenhuma categoria cadastrada neste setor ainda — use o + para criar a primeira.
        </p>
      )}
    </div>
  );
};
