import { useCallback, useEffect, useMemo, useState } from 'react';
import { storageService } from '../services/storage';
import { leadRepository } from '../repositories/leadRepository';
import { useCargaProgressiva } from './useCargaProgressiva';
import {
    filaDeHoje, colunasDoFunil, conversaoPorEtapa, conversaoPor,
    motivosDePerda, cicloTipico,
} from '../utils/funilDeLeads';
import type { Lead, EtapaDoLead } from '../utils/funilDeLeads';
import { getTodayStr } from '../utils/date';
import type { Client } from '../types';

import { mensagemDeErro } from '@/utils/errorHandling';
/**
 * Tudo que a aba de prospecção precisa, numa carga só.
 *
 * Os clientes vêm junto porque a importação PRECISA deles para classificar: sem
 * saber quem já é cliente, um CSV de prospecção cria um funil que mente.
 */
export function useLeads() {
    const carga = useCargaProgressiva();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [clientes, setClientes] = useState<Client[]>([]);
    const [erro, setErro] = useState('');
    /** `false` quando a migração ainda não rodou — muda o vazio da tela. */
    const [migrado, setMigrado] = useState<boolean | null>(null);

    const carregar = useCallback(async () => {
        carga.iniciar();
        setErro('');
        try {
            const [ls, cs] = await Promise.all([
                storageService.getLeads(),
                storageService.getClients(),
            ]);
            setLeads(ls);
            setClientes(cs);
            setMigrado(leadRepository.migrado);
        } catch (e: any) {
            setErro(mensagemDeErro(e, 'Falha ao carregar a prospecção'));
        } finally {
            carga.terminar();
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    const hoje = getTodayStr();

    const fila = useMemo(() => filaDeHoje(leads, hoje), [leads, hoje]);
    const colunas = useMemo(() => colunasDoFunil(leads), [leads]);
    const conversao = useMemo(() => conversaoPorEtapa(leads), [leads]);
    const porOrigem = useMemo(() => conversaoPor(leads, 'origem'), [leads]);
    const porSegmento = useMemo(() => conversaoPor(leads, 'segmento'), [leads]);
    const perdas = useMemo(() => motivosDePerda(leads), [leads]);
    const ciclo = useMemo(() => cicloTipico(leads), [leads]);

    /**
     * Move de etapa e recarrega.
     *
     * A atualização otimista foi deixada de fora de propósito: mover etapa
     * dispara uma trava no banco (descarte sem motivo, cliente sem cadastro), e
     * pintar o cartão na coluna nova antes da confirmação mostraria um estado
     * que o banco pode recusar.
     */
    const mover = useCallback(async (
        id: string,
        status: EtapaDoLead,
        extras?: Parameters<typeof leadRepository.moverEtapa>[2],
    ) => {
        await storageService.moverLead(id, status, extras);
        await carregar();
    }, [carregar]);

    const salvar = useCallback(async (lead: Partial<Lead> & { id?: string }) => {
        await storageService.saveLead(lead);
        await carregar();
    }, [carregar]);

    const excluir = useCallback(async (id: string) => {
        await storageService.excluirLead(id);
        await carregar();
    }, [carregar]);

    return {
        leads, clientes, fila, colunas, conversao, porOrigem, porSegmento,
        perdas, ciclo, hoje, erro, migrado,
        carregando: carga.carregando,
        recarregando: carga.recarregando,
        recarregar: carregar,
        mover, salvar, excluir,
    };
}
