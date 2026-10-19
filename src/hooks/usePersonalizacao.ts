import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storageService } from '@/services/storage';
import {
    PersonalizacaoPreco,
    PersonalizacaoHistorico,
    PersonalizacaoNotas,
    ArteBordado,
    TecnicaPersonalizacao,
} from '@/types';

const CHAVE = ['personalizacao'];

export const usePersonalizacaoMigrada = () => useQuery({
    queryKey: [...CHAVE, 'migrada'],
    queryFn: () => storageService.personalizacaoMigrada(),
    staleTime: 1000 * 60 * 10,
});

export const usePrecosPersonalizacao = () => useQuery({
    queryKey: [...CHAVE, 'precos'],
    queryFn: () => storageService.getPersonalizacaoPrecos(),
    staleTime: 1000 * 60 * 5,
});

export const useArtesBordado = () => useQuery({
    queryKey: [...CHAVE, 'artes'],
    queryFn: () => storageService.getArtesBordado(),
    staleTime: 1000 * 60 * 5,
});

export const useHistoricoPersonalizacao = () => useQuery({
    queryKey: [...CHAVE, 'historico'],
    queryFn: () => storageService.getPersonalizacaoHistorico(),
    staleTime: 1000 * 60 * 2,
});

export const useNotasPersonalizacao = () => useQuery({
    queryKey: [...CHAVE, 'notas'],
    queryFn: () => storageService.getPersonalizacaoNotas(),
    staleTime: 1000 * 60 * 5,
});

export const usePersonalizacaoMutations = () => {
    const qc = useQueryClient();
    // Uma invalidação só: as quatro listas se cruzam na tela (a divergência lê
    // tabela + histórico, a sugestão lê notas + artes), e invalidar por partes
    // deixaria um painel com número velho ao lado de outro com número novo.
    const invalidar = () => qc.invalidateQueries({ queryKey: CHAVE });

    return {
        savePreco: useMutation({
            mutationFn: (p: Partial<PersonalizacaoPreco>) => storageService.savePersonalizacaoPreco(p),
            onSuccess: invalidar,
        }),
        deletePreco: useMutation({
            mutationFn: (id: string) => storageService.deletePersonalizacaoPreco(id),
            onSuccess: invalidar,
        }),
        saveArte: useMutation({
            mutationFn: (a: Partial<ArteBordado>) => storageService.saveArteBordado(a),
            onSuccess: invalidar,
        }),
        deleteArte: useMutation({
            mutationFn: (id: string) => storageService.deleteArteBordado(id),
            onSuccess: invalidar,
        }),
        saveHistorico: useMutation({
            mutationFn: (h: Partial<PersonalizacaoHistorico>) => storageService.savePersonalizacaoHistorico(h),
            onSuccess: invalidar,
        }),
        deleteHistorico: useMutation({
            mutationFn: (id: string) => storageService.deletePersonalizacaoHistorico(id),
            onSuccess: invalidar,
        }),
        saveNotas: useMutation({
            mutationFn: (n: Partial<PersonalizacaoNotas> & { tecnica: TecnicaPersonalizacao }) =>
                storageService.savePersonalizacaoNotas(n),
            onSuccess: invalidar,
        }),
    };
};
