import { useState, useRef, useCallback } from 'react';

/**
 * Separa "ainda não tenho nada para mostrar" de "estou buscando dados novos".
 *
 * O problema que isto resolve: quase todo hook do app fazia `setLoading(true)`
 * em TODA carga, e as telas fazem `if (loading) return <spinner/>`. Como toda
 * ação (mover cartão no kanban, salvar uma conta, apagar um cadastro) recarrega
 * os dados para refletir a mudança, a tela inteira era trocada por um spinner e
 * remontada — o "soft reload". Além do susto visual, a remontagem perde a
 * rolagem da página, a posição horizontal do quadro e qualquer estado local.
 *
 * A recarga em si está certa: é o que garante que o usuário veja o efeito do
 * que acabou de fazer. O erro era esconder a tela enquanto ela acontece.
 *
 *   carregando   → true só até a PRIMEIRA carga terminar. É o único caso em que
 *                  faz sentido bloquear a tela: não existe conteúdo anterior.
 *   recarregando → true nas cargas seguintes. Os dados antigos continuam na
 *                  tela e são substituídos quando os novos chegam.
 */
export function useCargaProgressiva() {
    const [carregando, setCarregando] = useState(true);
    const [recarregando, setRecarregando] = useState(false);
    const jaCarregou = useRef(false);

    const iniciar = useCallback(() => {
        // A decisão usa ref, não estado: `iniciar` é chamado dentro do próprio
        // load e precisa enxergar o resultado da carga anterior imediatamente,
        // sem esperar o próximo render.
        if (jaCarregou.current) setRecarregando(true);
        else setCarregando(true);
    }, []);

    const terminar = useCallback(() => {
        jaCarregou.current = true;
        setCarregando(false);
        setRecarregando(false);
    }, []);

    return { carregando, recarregando, iniciar, terminar };
}
