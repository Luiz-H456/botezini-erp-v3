import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmarOperacao } from '@/components/common/ConfirmarOperacao';

/**
 * Fechar sem perder o que foi digitado (auditoria de 29/10, C2/C3).
 *
 * Antes, Esc ou um clique fora fechavam a janela e jogavam fora a compra da semana, a conta
 * nova, o pagamento. Agora toda saída passa por `pedirParaFechar`: sem alteração fecha na hora;
 * com alteração pergunta ("Sair sem salvar?", registro descartar-alteracoes). Com alteração
 * pendente, fechar a aba do navegador também avisa.
 *
 * "Alterou" vem de fora (`sujo`, quando a tela sabe comparar) ou do próprio hook: qualquer
 * mudança num campo dentro do painel marcado com `aoMexer` conta. Escolher numa lista sem digitar
 * não conta — custo pequeno: fechar sem perguntar quando só houve um clique numa opção.
 */
export function useSaidaProtegida(fechar: () => void, sujo?: boolean) {
    const [mexeu, setMexeu] = useState(false);
    const [perguntando, setPerguntando] = useState(false);
    const perguntandoRef = useRef(false);
    perguntandoRef.current = perguntando;
    const alterado = sujo ?? mexeu;
    const alteradoRef = useRef(alterado);
    alteradoRef.current = alterado;

    const pedirParaFechar = useCallback(() => {
        if (perguntandoRef.current) return;
        if (alteradoRef.current) setPerguntando(true);
        else fechar();
    }, [fechar]);

    useEffect(() => {
        if (!alterado) return;
        const aoSair = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', aoSair);
        return () => window.removeEventListener('beforeunload', aoSair);
    }, [alterado]);

    const confirmacao = perguntando ? (
        <ConfirmarOperacao operacaoId="descartar-alteracoes"
            onConfirmar={() => { setPerguntando(false); fechar(); }}
            onCancelar={() => setPerguntando(false)} />
    ) : null;

    /** Espalhe no painel: `<div {...aoMexer}>`. */
    const aoMexer = { onChangeCapture: () => { if (!alteradoRef.current) setMexeu(true); } };

    return { pedirParaFechar, confirmacao, aoMexer, alterado, marcarMexeu: () => setMexeu(true) };
}
