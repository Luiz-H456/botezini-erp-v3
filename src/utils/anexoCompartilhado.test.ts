import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    contarOutrasReferencias, decidirRemocao, mensagemDaRemocao,
    type RegistroComAnexos,
} from './anexoCompartilhado.ts';

const FOTO = 'orcamentos/abc/camisa-frente.jpg';
const OUTRA = 'orcamentos/abc/camisa-costas.jpg';

const reg = (id: string, fotos: string[]): RegistroComAnexos =>
    ({ id, reference_photos: fotos });

// ── o defeito que originou o arquivo ────────────────────────────────────────

test('DUPLICATA NÃO SALVA: o original conta, e o arquivo NÃO é apagado', () => {
    // Este é o caso do relato. A duplicata ainda não tem id, aponta para os
    // mesmos caminhos do original, e tirar a foto dela apagava o arquivo do
    // bucket — deixando o original com uma imagem quebrada.
    const registros = [reg('original', [FOTO, OUTRA])];
    const d = decidirRemocao(FOTO, registros, '');
    assert.equal(d.apagarArquivo, false);
    assert.equal(d.outrosUsos, 1);
});

test('ORÇAMENTO E PEDIDO: a conversão copia os caminhos, e o pedido conta', () => {
    // Corrigir só duplicata↔original deixaria este caso quebrado igual.
    const registros = [reg('orcamento-1', [FOTO]), reg('pedido-1', [FOTO])];
    assert.equal(decidirRemocao(FOTO, registros, 'orcamento-1').apagarArquivo, false);
});

test('ÚLTIMA referência: aí sim o arquivo vai embora', () => {
    const registros = [reg('orcamento-1', [FOTO])];
    const d = decidirRemocao(FOTO, registros, 'orcamento-1');
    assert.equal(d.apagarArquivo, true);
    assert.equal(d.outrosUsos, 0);
});

// ── a contagem ──────────────────────────────────────────────────────────────

test('o próprio registro nunca conta contra si', () => {
    assert.equal(contarOutrasReferencias(FOTO, [reg('eu', [FOTO])], 'eu'), 0);
});

test('conta cada registro uma vez, mesmo com o caminho repetido dentro dele', () => {
    // Um mesmo caminho duplicado na lista de um registro é um registro só a
    // apontar para o arquivo, não dois.
    assert.equal(contarOutrasReferencias(FOTO, [reg('a', [FOTO, FOTO])], ''), 1);
});

test('registro sem fotos não atrapalha a contagem', () => {
    const registros = [
        { id: 'a' } as RegistroComAnexos,
        { id: 'b', reference_photos: null },
        reg('c', []),
        reg('d', [FOTO]),
    ];
    assert.equal(contarOutrasReferencias(FOTO, registros, ''), 1);
});

test('caminho parecido não conta — a comparação é exata', () => {
    // "camisa-frente.jpg" e "camisa-frente-2.jpg" são arquivos diferentes.
    const registros = [reg('a', ['orcamentos/abc/camisa-frente-2.jpg'])];
    assert.equal(contarOutrasReferencias(FOTO, registros, ''), 0);
});

test('caminho vazio não sai contando o mundo', () => {
    assert.equal(contarOutrasReferencias('', [reg('a', [FOTO])], ''), 0);
});

test('lista vazia e nula não explodem', () => {
    assert.equal(contarOutrasReferencias(FOTO, [], ''), 0);
    assert.equal(contarOutrasReferencias(FOTO, null as any, ''), 0);
});

// ── desvincular é incondicional ─────────────────────────────────────────────

test('desvincular acontece SEMPRE, apagar é que é condicional', () => {
    // Quem clicou em remover quer a foto fora deste orçamento. Se o
    // desvincular dependesse da contagem, uma falha na consulta deixaria a
    // foto colada na tela e o clique pareceria não ter funcionado.
    for (const registros of [[], [reg('outro', [FOTO])], [reg('eu', [FOTO])]]) {
        assert.equal(decidirRemocao(FOTO, registros, 'eu').desvincular, true);
    }
});

// ── a mensagem ──────────────────────────────────────────────────────────────

test('quando apaga de vez, a mensagem é curta', () => {
    assert.equal(mensagemDaRemocao(decidirRemocao(FOTO, [], 'eu')), 'Foto removida.');
});

test('quando o arquivo sobrevive, a mensagem DIZ isso', () => {
    // Quem removeu pode estar tentando apagar a imagem de vez. Sair em
    // silêncio deixaria a pessoa achando que apagou.
    const um = mensagemDaRemocao(decidirRemocao(FOTO, [reg('a', [FOTO])], 'eu'));
    assert.match(um, /continua em 1 outro registro/);
    assert.doesNotMatch(um, /1 outros/, 'concordância no singular');

    const varios = mensagemDaRemocao(
        decidirRemocao(FOTO, [reg('a', [FOTO]), reg('b', [FOTO])], 'eu'));
    assert.match(varios, /continua em 2 outros registros/);
});

test('a mensagem fala na voz da tela em que a pessoa está', () => {
    // A mesma função serve o orçamento e o cadastro do cliente. Dizer "deste
    // orçamento" na página do cliente manda a pessoa procurar no lugar errado.
    const d = decidirRemocao(FOTO, [reg('a', [FOTO])], 'eu');
    assert.match(mensagemDaRemocao(d), /removida deste orçamento/);
    assert.match(mensagemDaRemocao(d, 'deste cadastro'), /removida deste cadastro/);
    // Quando some de vez, não há de onde falar: a frase é uma só.
    assert.equal(mensagemDaRemocao(decidirRemocao(FOTO, [], 'eu'), 'deste cadastro'), 'Foto removida.');
});
