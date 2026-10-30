import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gravacoesDoConsumo, situacaoDaFicha, tecidoNaFicha, trazerDaFicha } from './planilhaDeProdutos.ts';

const insumos = new Map([
    ['brim', { id: 'brim', category: 'Tecidos' }],
    ['oxford', { id: 'oxford', category: 'tecido' }],
    ['linha', { id: 'linha', category: 'Linhas' }],
]);
const ficha = [
    { id: 'f1', insumo_id: 'linha', quantity: 1 },
    { id: 'f2', insumo_id: 'brim', quantity: 1.4 },
];

test('o tecido da ficha é a linha de insumo de tecido; aviamento não conta', () => {
    assert.equal(tecidoNaFicha(ficha, insumos)?.id, 'f2');
    assert.equal(tecidoNaFicha([ficha[0]], insumos), null);
});

test('mudar o consumo atualiza a linha de tecido que a ficha já tem (a lista de compras lê a ficha)', () => {
    const g = gravacoesDoConsumo(ficha, insumos, { tecidoId: 'brim', consumo: 1.5 });
    assert.deepEqual(g.produto, { default_fabric_insumo_id: 'brim', fabric_consumption_m: 1.5 });
    assert.deepEqual(g.ficha, { id: 'f2', insumo_id: 'brim', quantity: 1.5 });
});

test('trocar o tecido troca a MESMA linha: nada de duas linhas de tecido na ficha', () => {
    const g = gravacoesDoConsumo(ficha, insumos, { tecidoId: 'oxford', consumo: 1.4 });
    assert.deepEqual(g.ficha, { id: 'f2', insumo_id: 'oxford', quantity: 1.4 });
});

test('ficha sem tecido ganha a linha nova; as outras linhas não são tocadas', () => {
    const g = gravacoesDoConsumo([ficha[0]], insumos, { tecidoId: 'brim', consumo: 2 });
    assert.deepEqual(g.ficha, { insumo_id: 'brim', quantity: 2 });
});

test('situação: sem ficha, sem tecido na ficha, consumo diferente do produto, em dia', () => {
    assert.equal(situacaoDaFicha({ fabric_consumption_m: 1.4 }, [], insumos), 'sem-ficha');
    assert.equal(situacaoDaFicha({ fabric_consumption_m: 1.4 }, [ficha[0]], insumos), 'sem-tecido');
    assert.equal(situacaoDaFicha({ default_fabric_insumo_id: 'brim', fabric_consumption_m: 1.5 }, ficha, insumos), 'consumo-diferente',
        'o custo da peça leria 1,5 e a compra 1,4: as duas contas divergem');
    assert.equal(situacaoDaFicha({ default_fabric_insumo_id: 'brim', fabric_consumption_m: 1.4 }, ficha, insumos), 'ok');
    assert.equal(situacaoDaFicha({ fabric_consumption_m: null }, ficha, insumos), 'tecido-so-na-ficha', 'produto vazio e ficha com tecido: só falta trazer');
    assert.equal(situacaoDaFicha({ default_fabric_insumo_id: 'oxford', fabric_consumption_m: 1.4 }, ficha, insumos), 'consumo-diferente', 'tecido diferente também diverge');
});

test('trazer da ficha: o produto passa a ter o tecido e o consumo que a compra usa', () => {
    assert.deepEqual(trazerDaFicha(ficha, insumos), { default_fabric_insumo_id: 'brim', fabric_consumption_m: 1.4 });
    assert.equal(trazerDaFicha([ficha[0]], insumos), null, 'sem tecido na ficha não há o que trazer');
});
