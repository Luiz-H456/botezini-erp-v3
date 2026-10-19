import test from 'node:test';
import assert from 'node:assert';
import {
    OPERACOES, operacao, descricaoEstaCompleta, rotuloEhVago,
    ROTULO_DA_REVERSIBILIDADE, ROTULOS_VAGOS,
} from './operacoesSemVolta.ts';
import type { DescricaoDaOperacao } from './operacoesSemVolta.ts';

const todas = Object.values(OPERACOES);

// ── A regra que o incidente do saldo criou ──────────────────────────────────

test('toda operação registrada está completa', () => {
    for (const d of todas) {
        assert.ok(descricaoEstaCompleta(d), `${d.id} incompleta`);
    }
});

test('nenhuma diz só que "é irreversível" — todas dizem o QUE se perde', () => {
    for (const d of todas) {
        const c = d.consequencia.toLowerCase();
        assert.ok(d.consequencia.length > 40,
            `${d.id}: consequência curta demais para informar algo — "${d.consequencia}"`);
        assert.ok(!/^(esta a..o . irrevers.vel|n.o pode ser desfeit)/.test(c),
            `${d.id}: consequência genérica`);
    }
});

test('nenhum botão de confirmar é vago', () => {
    for (const d of todas) {
        assert.ok(!rotuloEhVago(d.rotuloConfirmar),
            `${d.id}: "${d.rotuloConfirmar}" não diz o que vai acontecer`);
    }
});

test('rotuloEhVago pega as formas comuns, com espaço e maiúscula', () => {
    for (const v of ROTULOS_VAGOS) {
        assert.ok(rotuloEhVago(v));
        assert.ok(rotuloEhVago(` ${v.toUpperCase()} `));
    }
    assert.ok(!rotuloEhVago('Excluir pedido'));
});

test('o que dá para desfazer explica COMO; o que não dá, não promete', () => {
    for (const d of todas) {
        if (d.reversibilidade === 'sem-volta') {
            assert.ok(!d.comoDesfazer, `${d.id}: diz que não tem volta mas explica como voltar`);
        } else {
            assert.ok(d.comoDesfazer && d.comoDesfazer.length > 10,
                `${d.id}: precisa dizer como desfazer`);
        }
    }
});

test('o título é uma pergunta — é o que faz alguém parar e ler', () => {
    for (const d of todas) {
        assert.ok(d.titulo.trim().endsWith('?'), `${d.id}: "${d.titulo}"`);
    }
});

test('o que destrói dado é marcado como perigo', () => {
    for (const id of ['sincronizar-saldos', 'excluir-pedido', 'excluir-orcamento',
                      'excluir-insumo', 'cancelar-lancamento']) {
        assert.ok(OPERACOES[id].perigo, `${id} deveria ser perigo`);
    }
});

test('o que só muda estado NÃO é pintado de vermelho', () => {
    // Alarme em tudo é o mesmo que alarme em nada: se conciliar parece tão
    // grave quanto excluir um pedido, os dois passam a ser clicados igual.
    for (const id of ['conciliar', 'desfazer-conciliacao', 'inativar-conta', 'ajustar-saldo']) {
        assert.ok(!OPERACOES[id].perigo, `${id} não deveria ser perigo`);
    }
});

// ── Os casos que motivaram o arquivo ────────────────────────────────────────

test('sincronizar saldos diz que APAGA, e manda anotar antes', () => {
    const d = OPERACOES['sincronizar-saldos'];
    assert.ok(/apaga/i.test(d.oQueFaz), d.oQueFaz);
    assert.ok(d.antesDeContinuar && /anote/i.test(d.antesDeContinuar));
    assert.strictEqual(d.reversibilidade, 'compensavel');
});

test('sincronizar saldos NÃO se descreve como conserto', () => {
    const d = OPERACOES['sincronizar-saldos'];
    const texto = `${d.titulo} ${d.oQueFaz}`.toLowerCase();
    assert.ok(!/corrig|consert|ajust/.test(texto),
        'o texto antigo dizia "corrigir divergências" e foi o que fez o clique parecer seguro');
});

test('cancelar lançamento avisa que o pagamento não volta', () => {
    assert.ok(/n.o . estornado/i.test(OPERACOES['cancelar-lancamento'].consequencia));
});

test('excluir pedido avisa das cobranças e do estoque', () => {
    const c = OPERACOES['excluir-pedido'].consequencia.toLowerCase();
    assert.ok(c.includes('receber'), c);
    assert.ok(c.includes('estoque'), c);
});

test('conciliar explica que é uma afirmação sua, não um movimento', () => {
    const d = OPERACOES['conciliar'];
    assert.ok(/n.o move dinheiro/i.test(d.consequencia), d.consequencia);
    assert.strictEqual(d.reversibilidade, 'reversivel');
});

// ── Estrutura ───────────────────────────────────────────────────────────────

test('a chave do registro bate com o id de dentro', () => {
    for (const [chave, d] of Object.entries(OPERACOES)) {
        assert.strictEqual(chave, d.id);
    }
});

test('operacao() acha pelo id e devolve null no desconhecido', () => {
    assert.strictEqual(operacao('conciliar')?.id, 'conciliar');
    assert.strictEqual(operacao('nao-existe'), null);
    assert.strictEqual(operacao(''), null);
});

test('toda reversibilidade tem rótulo legível', () => {
    for (const d of todas) {
        assert.ok(ROTULO_DA_REVERSIBILIDADE[d.reversibilidade].length > 0);
    }
});

test('descricaoEstaCompleta reprova o que falta', () => {
    const boa: DescricaoDaOperacao = OPERACOES['excluir-lead'];
    assert.ok(descricaoEstaCompleta(boa));
    assert.ok(!descricaoEstaCompleta({ ...boa, consequencia: '' }));
    assert.ok(!descricaoEstaCompleta({ ...boa, rotuloConfirmar: '  ' }));
    assert.ok(!descricaoEstaCompleta({
        ...boa, reversibilidade: 'reversivel', comoDesfazer: undefined,
    }));
});
