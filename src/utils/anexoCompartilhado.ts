/**
 * Quando apagar de verdade o arquivo de um anexo, e quando só desvinculá-lo.
 *
 * O DEFEITO QUE ORIGINOU ISTO. Duplicar um orçamento copiava
 * `reference_photos` — que é uma lista de CAMINHOS no bucket, não de imagens.
 * A cópia e o original passavam a apontar para os mesmos arquivos. Tirar uma
 * foto da cópia chamava `deleteAttachment`, o arquivo era removido do bucket, e
 * o original continuava listando um caminho que já não existia: foto quebrada
 * num orçamento que ninguém tinha aberto.
 *
 * Os erros 400 em `financial-attachments` no console eram isso — URL assinada
 * pedida para arquivo já apagado.
 *
 * A PARTILHA É MAIS AMPLA QUE A DUPLICATA. A conversão em pedido também copia
 * `reference_photos`, e "Guardar" na página do cliente traz a foto do orçamento
 * para o cadastro. São três tabelas apontando para o mesmo arquivo. Qualquer
 * correção que resolvesse só duplicata↔original deixaria os outros dois
 * caminhos quebrados do mesmo jeito.
 *
 * A REGRA, ENTÃO: remover a foto de um registro tira o caminho DAQUELE
 * registro. O arquivo só é apagado quando nenhum outro registro aponta para
 * ele — que é contagem de referência, e é a única forma de acertar todos os
 * casos de partilha de uma vez, inclusive os que ainda não existem.
 *
 * Órfão no bucket custa alguns kilobytes. Foto quebrada num orçamento que o
 * cliente vai receber custa uma conversa.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export interface RegistroComAnexos {
    id: string;
    reference_photos?: string[] | null;
}

/**
 * Quantos OUTROS registros apontam para este caminho.
 *
 * @param idDoAtual  o registro de onde a foto está saindo. Excluído da conta —
 *   ele é justamente quem está soltando o arquivo. String vazia quando o
 *   registro ainda não foi salvo (uma duplicata recém-criada), e aí ninguém é
 *   excluído: o original conta, que é exatamente o caso do defeito.
 */
export function contarOutrasReferencias(
    caminho: string,
    registros: RegistroComAnexos[],
    idDoAtual: string,
): number {
    if (!caminho) return 0;
    let n = 0;
    for (const r of registros || []) {
        if (idDoAtual && r.id === idDoAtual) continue;
        if ((r.reference_photos || []).includes(caminho)) n++;
    }
    return n;
}

export interface DecisaoDeRemocao {
    /** Tirar o caminho da lista deste registro. Sempre verdadeiro. */
    desvincular: true;
    /** Apagar o arquivo do bucket. Só quando ninguém mais aponta para ele. */
    apagarArquivo: boolean;
    /** Quantos outros registros seguem usando. Zero quando vai apagar. */
    outrosUsos: number;
}

export function decidirRemocao(
    caminho: string,
    registros: RegistroComAnexos[],
    idDoAtual: string,
): DecisaoDeRemocao {
    const outrosUsos = contarOutrasReferencias(caminho, registros, idDoAtual);
    return { desvincular: true, apagarArquivo: outrosUsos === 0, outrosUsos };
}

/**
 * O que a tela diz depois de remover.
 *
 * Quando o arquivo sobrevive em outro lugar, isso precisa ser dito: quem
 * removeu pode estar tentando apagar a imagem de vez, e sair em silêncio
 * deixaria a pessoa achando que apagou.
 *
 * @param origem  de onde a foto saiu, na voz da tela em que a pessoa está:
 *   "deste orçamento", "deste cadastro".
 */
export function mensagemDaRemocao(d: DecisaoDeRemocao, origem = 'deste orçamento'): string {
    if (d.apagarArquivo) return 'Foto removida.';
    return d.outrosUsos === 1
        ? `Foto removida ${origem}. O arquivo continua em 1 outro registro.`
        : `Foto removida ${origem}. O arquivo continua em ${d.outrosUsos} outros registros.`;
}
