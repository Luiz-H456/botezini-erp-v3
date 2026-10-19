import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    vendasDoProduto, resumirProduto, historicoPorProduto, posicaoNoHistorico, mediaPonderada,
    sugerirPrecoDeFechamento, taxaConfiavel, bandaRealizada, linhasNormalizadas, curvaDeDesconto,
    medianaDeFechados, vendasDeClientes,
} from './historicoDeProduto.ts';
import type {
    OrcamentoDoHistorico, VendaDoProduto, LinhaNormalizada,
} from './historicoDeProduto.ts';

const nomes: Record<string, string> = { c1: 'Metalúrgica Alfa', c2: 'Frigorífico Beta' };
const nomeDoCliente = (id?: string) => (id && nomes[id]) || '—';

const base: OrcamentoDoHistorico[] = [
    {
        id: 'o1', serial_number: '001', client_id: 'c1', date: '2026-01-10', status: 'Converted',
        items: [
            { product_id: 'p1', color: 'Azul', size: 'M', quantity: 100, unit_price: 45, fabric_name: 'Brim' },
            { product_id: 'p2', color: 'Branco', size: 'G', quantity: 10, unit_price: 30 },
        ],
    },
    {
        id: 'o2', serial_number: '002', client_id: 'c2', date: '2026-03-05', status: 'Sent',
        items: [
            { product_id: 'p1', color: 'AZUL', size: 'G', quantity: 20, unit_price: 62 },
        ],
    },
    {
        id: 'o3', serial_number: '003', client_id: 'c1', date: '2026-02-01', status: 'Draft',
        items: [
            { product_id: 'p1', color: 'Cinza', size: 'M', quantity: 40, unit_price: 50 },
            { product_id: 'p1', color: '', size: '', quantity: 0, unit_price: 0 }, // linha em branco
        ],
    },
];

test('vendas vêm da mais recente para a mais antiga', () => {
    const v = vendasDoProduto(base, 'p1', nomeDoCliente);
    assert.deepEqual(v.map(x => x.data), ['2026-03-05', '2026-02-01', '2026-01-10']);
});

test('linha sem preço fica de fora — não é venda por R$ 0', () => {
    const v = vendasDoProduto(base, 'p1', nomeDoCliente);
    assert.equal(v.length, 3);
    assert.ok(v.every(x => x.valorUnit > 0));
});

test('produto sem histórico devolve lista vazia', () => {
    assert.deepEqual(vendasDoProduto(base, 'inexistente', nomeDoCliente), []);
    assert.deepEqual(vendasDoProduto(base, '', nomeDoCliente), []);
});

test('o orçamento aberto na tela é excluído do próprio histórico', () => {
    const v = vendasDoProduto(base, 'p1', nomeDoCliente, 'o2');
    assert.equal(v.length, 2);
    assert.ok(!v.some(x => x.orcamentoId === 'o2'));
});

test('fechado marca só aprovado e convertido', () => {
    const v = vendasDoProduto(base, 'p1', nomeDoCliente);
    assert.deepEqual(
        v.map(x => [x.status, x.fechado]),
        [['Sent', false], ['Draft', false], ['Converted', true]],
    );
});

test('nome do cliente sai da função recebida', () => {
    const v = vendasDoProduto(base, 'p1', nomeDoCliente);
    assert.equal(v[0].cliente, 'Frigorífico Beta');
    assert.equal(v[2].cliente, 'Metalúrgica Alfa');
});

test('resumo: faixa, mediana e último preço', () => {
    const r = resumirProduto(vendasDoProduto(base, 'p1', nomeDoCliente))!;
    assert.equal(r.menor, 45);
    assert.equal(r.maior, 62);
    assert.equal(r.mediana, 50);
    assert.equal(r.ultimo, 62);          // o mais recente, não o maior
    assert.equal(r.ultimaData, '2026-03-05');
});

test('média é ponderada pela quantidade', () => {
    const r = resumirProduto(vendasDoProduto(base, 'p1', nomeDoCliente))!;
    // (100×45 + 20×62 + 40×50) / 160 = 7740/160 = 48.375
    assert.equal(r.medio, 48.38);
    assert.equal(r.quantidadeTotal, 160);
    // média simples seria (45+62+50)/3 ≈ 52.33 — a ponderada tem de ser menor
    assert.ok(r.medio < 52);
});

test('quantidade total zerada cai na média simples em vez de 0/0', () => {
    const semQtd: OrcamentoDoHistorico[] = [{
        id: 'x', client_id: 'c1', date: '2026-01-01', status: 'Sent',
        items: [
            { product_id: 'p9', quantity: 0, unit_price: 10 },
            { product_id: 'p9', quantity: 0, unit_price: 20 },
        ],
    }];
    const r = resumirProduto(vendasDoProduto(semQtd, 'p9', nomeDoCliente))!;
    assert.equal(r.medio, 15);
    assert.ok(Number.isFinite(r.medio));
});

test('mediana com número par de preços é a média dos dois centrais', () => {
    const par: OrcamentoDoHistorico[] = [{
        id: 'x', client_id: 'c1', date: '2026-01-01', status: 'Sent',
        items: [
            { product_id: 'p9', quantity: 1, unit_price: 10 },
            { product_id: 'p9', quantity: 1, unit_price: 20 },
            { product_id: 'p9', quantity: 1, unit_price: 30 },
            { product_id: 'p9', quantity: 1, unit_price: 44 },
        ],
    }];
    const r = resumirProduto(vendasDoProduto(par, 'p9', nomeDoCliente))!;
    assert.equal(r.mediana, 25);
});

test('cores agrupam ignorando caixa e saem da mais pedida para a menos', () => {
    const r = resumirProduto(vendasDoProduto(base, 'p1', nomeDoCliente))!;
    assert.deepEqual(r.cores.map(c => c.cor), ['AZUL', 'CINZA']);
    assert.equal(r.cores[0].quantidade, 120);   // 100 + 20
    assert.equal(r.cores[0].ocorrencias, 2);
    assert.equal(r.cores[1].quantidade, 40);
});

test('cada cor tem sua própria média ponderada e sua faixa', () => {
    const r = resumirProduto(vendasDoProduto(base, 'p1', nomeDoCliente))!;
    const azul = r.cores.find(c => c.cor === 'AZUL')!;
    // (100×45 + 20×62) / 120 = 5740/120 = 47.83
    assert.equal(azul.valorMedio, 47.83);
    assert.equal(azul.menor, 45);
    assert.equal(azul.maior, 62);

    const cinza = r.cores.find(c => c.cor === 'CINZA')!;
    assert.equal(cinza.valorMedio, 50);
    assert.equal(cinza.menor, 50);
    assert.equal(cinza.maior, 50);   // uma ocorrência só: faixa colapsa no valor
});

test('média separa fechado de não fechado', () => {
    const r = resumirProduto(vendasDoProduto(base, 'p1', nomeDoCliente))!;
    assert.equal(r.medioFechado, 45);            // só o Converted, 100 peças a 45
    // não fechados: 20×62 + 40×50 = 1240+2000 = 3240 / 60 = 54
    assert.equal(r.medioAberto, 54);
    assert.equal(r.fechados, 1);
    assert.equal(r.abertos, 2);
});

test('sem nada fechado a média fechada é null, e não zero', () => {
    const soAberto: OrcamentoDoHistorico[] = [{
        id: 'x', client_id: 'c1', date: '2026-01-01', status: 'Sent',
        items: [{ product_id: 'p9', quantity: 5, unit_price: 20 }],
    }];
    const r = resumirProduto(vendasDoProduto(soAberto, 'p9', nomeDoCliente))!;
    assert.equal(r.medioFechado, null);
    assert.equal(r.medioAberto, 20);
});

test('sem nada em aberto a média aberta é null', () => {
    const soFechado: OrcamentoDoHistorico[] = [{
        id: 'x', client_id: 'c1', date: '2026-01-01', status: 'Approved',
        items: [{ product_id: 'p9', quantity: 5, unit_price: 20 }],
    }];
    const r = resumirProduto(vendasDoProduto(soFechado, 'p9', nomeDoCliente))!;
    assert.equal(r.medioAberto, null);
    assert.equal(r.medioFechado, 20);
});

test('média ponderada: lista vazia é null, não zero', () => {
    assert.equal(mediaPonderada([]), null);
    assert.equal(mediaPonderada(undefined as any), null);
});

test('clientes distintos não contam o mesmo duas vezes', () => {
    const r = resumirProduto(vendasDoProduto(base, 'p1', nomeDoCliente))!;
    assert.equal(r.clientes, 2);   // c1 aparece em dois orçamentos
    assert.equal(r.ocorrencias, 3);
    assert.equal(r.fechados, 1);
});

test('resumo sem histórico é null, e não um resumo zerado', () => {
    assert.equal(resumirProduto([]), null);
    assert.equal(resumirProduto(vendasDoProduto(base, 'nada', nomeDoCliente)), null);
});

test('histórico por produto bate com a busca produto a produto', () => {
    const mapa = historicoPorProduto(base, nomeDoCliente);
    assert.deepEqual(mapa.get('p1'), vendasDoProduto(base, 'p1', nomeDoCliente));
    assert.deepEqual(mapa.get('p2'), vendasDoProduto(base, 'p2', nomeDoCliente));
    assert.equal(mapa.has('inexistente'), false);
});

test('histórico por produto respeita a exclusão do orçamento aberto', () => {
    const mapa = historicoPorProduto(base, nomeDoCliente, 'o1');
    assert.equal(mapa.get('p1')!.length, 2);
    assert.equal(mapa.has('p2'), false);   // p2 só existia no orçamento excluído
});

test('posição do preço digitado dentro da faixa', () => {
    const r = resumirProduto(vendasDoProduto(base, 'p1', nomeDoCliente));
    assert.equal(posicaoNoHistorico(40, r), 'abaixo');
    assert.equal(posicaoNoHistorico(70, r), 'acima');
    assert.equal(posicaoNoHistorico(50, r), 'dentro');
    assert.equal(posicaoNoHistorico(45, r), 'dentro');   // o extremo ainda é dentro
    assert.equal(posicaoNoHistorico(0, r), null);
    assert.equal(posicaoNoHistorico(50, null), null);
});

// ── banda de preço realizado e sugestão ──────────────────────────────────────

let seq = 0;
const venda = (valorUnit: number, fechado: boolean, quantidade = 1): VendaDoProduto => ({
    orcamentoId: `o${++seq}`, serial: '', data: '2026-01-01', clienteId: 'c1', cliente: 'X',
    cor: '', tamanho: '', tecido: '', quantidade, valorUnit,
    status: fechado ? 'Approved' : 'Sent', fechado,
});
const repetir = (n: number, f: () => VendaDoProduto) => Array.from({ length: n }, f);

test('taxa confiável desconta a incerteza: 1 de 1 não vale o mesmo que 8 de 8', () => {
    assert.ok(taxaConfiavel(1, 1) < 0.6);
    assert.ok(taxaConfiavel(8, 8) > 0.85);
    assert.ok(taxaConfiavel(8, 8) > taxaConfiavel(1, 1));
    assert.equal(taxaConfiavel(0, 5), 0);
    assert.equal(taxaConfiavel(0, 0), 0);
    for (let n = 1; n <= 30; n++) {
        for (let f = 0; f <= n; f++) {
            const t = taxaConfiavel(f, n);
            assert.ok(t >= 0 && t <= 1 && Number.isFinite(t), `taxa fora de faixa em ${f}/${n}`);
            assert.ok(t <= f / n + 1e-9, `${f}/${n} não pode passar da taxa crua`);
        }
    }
});

// ── banda realizada (Marn & Rosiello) ────────────────────────────────────────

test('a banda só olha venda fechada — orçamento perdido não é preço realizado', () => {
    const b = bandaRealizada([
        venda(100, true, 1), venda(90, true, 1),
        venda(10, false, 1000),   // perdido e enorme: não pode entrar
    ], 100)!;
    assert.equal(b.base, 2);
    assert.ok(b.p10 >= 0.9, 'o perdido a 10% não pode puxar a banda para baixo');
});

test('percentis da banda são ponderados pelo volume', () => {
    // 1 linha a 100% da tabela contra 9 linhas-peça a 60%: a mediana de VOLUME
    // tem de cair em 60%, não no meio das duas linhas.
    const b = bandaRealizada([
        venda(100, true, 1),
        venda(60, true, 9),
    ], 100)!;
    assert.equal(b.mediana, 0.6);
});

test('vazamento é o que a cauda de baixo deixou na mesa', () => {
    const b = bandaRealizada([
        venda(100, true, 10),
        venda(100, true, 10),
        venda(80, true, 10),
    ], 100)!;
    assert.equal(b.mediana, 1);
    assert.equal(b.linhasAbaixo, 1);
    assert.equal(b.pecasAbaixo, 10);
    // (1,00 − 0,80) × R$ 100 × 10 peças = R$ 200
    assert.equal(b.vazamento, 200);
});

test('sem tabela ou sem venda fechada não há banda', () => {
    assert.equal(bandaRealizada([venda(50, true)], 0), null);
    assert.equal(bandaRealizada([venda(50, true)], null), null);
    assert.equal(bandaRealizada([venda(50, false), venda(60, false)], 100), null);
    assert.equal(bandaRealizada([venda(50, true)], 100), null, 'uma venda só não é banda');
});

test('largura da banda sai em pontos percentuais', () => {
    const b = bandaRealizada([
        venda(70, true, 1), venda(80, true, 1), venda(90, true, 1), venda(100, true, 1),
    ], 100)!;
    assert.ok(b.largura > 0 && b.largura <= 100);
    assert.equal(b.largura, Math.round((b.p75 - b.p25) * 1000) / 10);
});

test('mediana de fechados ignora perdido e pondera por volume', () => {
    // 1 linha a 100 contra 9 peças a 60: a mediana de VOLUME é 60.
    assert.equal(medianaDeFechados([venda(100, true, 1), venda(60, true, 9)]), 60);
    // O perdido, mesmo gigante, não entra.
    assert.equal(medianaDeFechados([venda(80, true, 1), venda(10, false, 999)]), 80);
    assert.equal(medianaDeFechados([venda(50, false)]), null, 'nada fechado é null, não zero');
    assert.equal(medianaDeFechados([]), null);
});

test('imposto sobre a venda: o gross-up cobre o que o multiplicador não cobria', () => {
    // A conta da calculadora, reproduzida aqui para travar a regra.
    const custo = 29.20, markup = 2.5;
    const precoCom = (aliq: number) => (custo * markup) / (1 - aliq);

    for (const aliq of [0, 0.06, 0.18, 0.35]) {
        const preco = precoCom(aliq);
        const imposto = preco * aliq;
        // O que sobra depois do imposto é exatamente o markup pretendido.
        assert.ok(Math.abs((preco - imposto) - custo * markup) < 1e-9,
            `alíquota ${aliq}: sobrou ${preco - imposto}, devia sobrar ${custo * markup}`);
    }

    // A conta antiga (custo × (1 + alíquota) × markup) provisiona a menos.
    const antiga = custo * (1 + 0.18) * markup;
    assert.ok(antiga < precoCom(0.18), 'a conta antiga tinha de sair mais barata');

    // Ponto de equilíbrio: a receita cobre custo + o imposto que ela gera.
    const equilibrio = custo / (1 - 0.18);
    assert.ok(Math.abs(equilibrio - equilibrio * 0.18 - custo) < 1e-9);
});

// ── normalização pela tabela ─────────────────────────────────────────────────

const listas = new Map([['p1', 100], ['p2', 50]]);

test('índice é o preço em fração da tabela do próprio produto', () => {
    const orcs: OrcamentoDoHistorico[] = [{
        id: 'o1', client_id: 'c1', date: '2026-01-01', status: 'Approved',
        items: [
            { product_id: 'p1', quantity: 10, unit_price: 85 },   // 85% de 100
            { product_id: 'p2', quantity: 10, unit_price: 45 },   // 90% de 50
        ],
    }];
    const l = linhasNormalizadas(orcs, listas);
    assert.deepEqual(l.map(x => x.indice), [0.85, 0.9]);
    assert.ok(l.every(x => x.fechado));
});

test('produto sem tabela cadastrada fica de fora da normalização', () => {
    const orcs: OrcamentoDoHistorico[] = [{
        id: 'o1', client_id: 'c1', date: '2026-01-01', status: 'Sent',
        items: [
            { product_id: 'p1', quantity: 1, unit_price: 90 },
            { product_id: 'semTabela', quantity: 1, unit_price: 90 },
            { product_id: 'p1', quantity: 1, unit_price: 0 },      // sem preço
        ],
    }];
    const l = linhasNormalizadas(orcs, listas);
    assert.equal(l.length, 1);
    assert.equal(l[0].productId, 'p1');
});

test('o orçamento aberto na tela não entra na curva da casa', () => {
    const orcs: OrcamentoDoHistorico[] = [
        { id: 'o1', date: '2026-01-01', status: 'Sent', items: [{ product_id: 'p1', quantity: 1, unit_price: 90 }] },
        { id: 'o2', date: '2026-01-02', status: 'Sent', items: [{ product_id: 'p1', quantity: 1, unit_price: 80 }] },
    ];
    assert.equal(linhasNormalizadas(orcs, listas, 'o1').length, 1);
});

// ── curva de desconto ────────────────────────────────────────────────────────

/** Gera n linhas normalizadas num índice, com f delas fechadas. */
const linhas = (indice: number, n: number, f: number): LinhaNormalizada[] =>
    Array.from({ length: n }, (_, i) => ({
        productId: 'p1', indice, preco: indice * 100, quantidade: 1, fechado: i < f,
    }));

test('curva exige amostra da casa inteira, não de um produto', () => {
    assert.equal(curvaDeDesconto(linhas(0.9, 10, 5)), null, '10 linhas não bastam');
    assert.equal(curvaDeDesconto([]), null);
});

test('curva usa cortes fixos e legíveis, não quantis', () => {
    const c = curvaDeDesconto([
        ...linhas(0.75, 10, 9),
        ...linhas(0.85, 10, 7),
        ...linhas(0.97, 10, 4),
        ...linhas(1.05, 10, 1),
    ])!;
    assert.equal(c.length, 4);
    assert.deepEqual(c.map(f => f.indiceMin), [0, 0.80, 0.95, 1.00]);
    assert.equal(c[3].indiceMax, Infinity);
    assert.deepEqual(c.map(f => `${f.fechados}/${f.linhas}`), ['9/10', '7/10', '4/10', '1/10']);
});

test('faixa magra da curva funde com a vizinha em vez de virar anedota', () => {
    const c = curvaDeDesconto([
        ...linhas(0.85, 20, 15),
        ...linhas(0.97, 20, 8),
        ...linhas(1.05, 2, 2),        // 2 linhas: não pode ser faixa sozinha
    ])!;
    assert.ok(c.every(f => f.linhas >= 8), `faixa magra sobreviveu: ${JSON.stringify(c.map(f => f.linhas))}`);
    assert.equal(c.reduce((s, f) => s + f.linhas, 0), 42, 'nenhuma linha pode sumir na fusão');
});

// ── sugestão ─────────────────────────────────────────────────────────────────

const curvaSaudavel = curvaDeDesconto([
    ...linhas(0.75, 12, 11),   // desconto fundo: fecha quase sempre
    ...linhas(0.85, 12, 9),
    ...linhas(0.97, 12, 5),
    ...linhas(1.05, 12, 1),    // acima da tabela: quase nunca fecha
])!;

test('sem T1 cadastrado não há régua e a sugestão diz isso', () => {
    const r = sugerirPrecoDeFechamento([venda(50, true)], curvaSaudavel, { lista: 0 });
    assert.equal(r.ok, false);
    assert.match((r as any).motivo, /Sem preço T1/);
});

test('sem curva da casa a sugestão diz isso, e não inventa uma', () => {
    const r = sugerirPrecoDeFechamento([venda(50, true)], null, { lista: 100 });
    assert.equal(r.ok, false);
    assert.match((r as any).motivo, /orçamentos suficientes na casa/);
});

test('o objetivo é margem, não faturamento — o CMV muda a resposta', () => {
    const vendas = repetir(6, () => venda(60, true, 10));
    const semCusto = sugerirPrecoDeFechamento(vendas, curvaSaudavel, { lista: 100 });
    const comCusto = sugerirPrecoDeFechamento(vendas, curvaSaudavel, { lista: 100, custo: 70 });
    assert.equal(semCusto.ok, true);
    assert.equal(comCusto.ok, true);

    const s1 = (semCusto as any).sugestao;
    const s2 = (comCusto as any).sugestao;
    assert.equal(s1.usouMargem, false);
    assert.equal(s2.usouMargem, true);
    assert.match(s1.memoria, /maximiza faturamento, não margem/);
    // Com CMV alto, descontar fundo deixa de compensar: a sugestão sobe.
    assert.ok(s2.preco > s1.preco, `margem devia empurrar o preço para cima: ${s1.preco} → ${s2.preco}`);
});

test('faixa que não paga o custo é descartada da otimização', () => {
    const r = sugerirPrecoDeFechamento(
        repetir(6, () => venda(80, true, 10)), curvaSaudavel, { lista: 100, custo: 78 });
    const s = (r as any).sugestao;
    assert.ok(s.faixas.some((f: any) => f.abaixoDoCusto), 'as faixas fundas ficam abaixo do custo');
    assert.ok(s.faixa.preco > 78, 'a vencedora tem de pagar o custo');
});

test('custo acima de toda a tabela vira diagnóstico de custo, não de desconto', () => {
    const r = sugerirPrecoDeFechamento(
        repetir(6, () => venda(80, true)), curvaSaudavel, { lista: 100, custo: 500 });
    assert.equal(r.ok, false);
    assert.match((r as any).motivo, /abaixo do CMV/);
    assert.ok((r as any).faixas.length > 0, 'a curva continua vindo para a tela mostrar');
});

test('a sugestão não passa do T1 nem desce abaixo do piso cadastrado', () => {
    // Curva bem-comportada (fechamento não sobe com o preço) em que, mesmo
    // assim, o topo rende mais: 105 × 70% bate 75 × 92%. Sem cerca, a sugestão
    // sairia acima do próprio T1.
    const curvaCara = curvaDeDesconto([
        ...linhas(0.75, 12, 12),
        ...linhas(0.85, 12, 11),
        ...linhas(0.97, 12, 10),
        ...linhas(1.05, 12, 10),
    ])!;
    const r = sugerirPrecoDeFechamento(repetir(6, () => venda(90, true)), curvaCara,
        { lista: 100, tier2: 90, tier3: 80 });
    const s = (r as any).sugestao;
    assert.ok(s.preco <= 100, 'não pode recomendar acima da própria tabela');
    assert.equal(s.limitadoPelaTabela, true);
    assert.match(s.memoria, /aparada na sua própria tabela/);
});

test('nunca manda baixar: ótimo abaixo do praticado vira "não há espaço de alta"', () => {
    // O caso do jaleco: sai no mínimo de R$ 73, o T1 cadastrado está em R$ 80 e
    // a curva da casa aponta para R$ 68 — abaixo do piso que já se pratica.
    const vendas = repetir(8, () => venda(73, true, 20));
    const r = sugerirPrecoDeFechamento(vendas, curvaSaudavel, { lista: 80, custo: 40 });
    assert.equal(r.ok, false, 'não pode existir sugestão de corte');
    assert.match((r as any).motivo, /NÃO é recomendação de baixar/);
    assert.match((r as any).motivo, /R\$ 73,00/);
    assert.ok((r as any).faixas.length > 0, 'a curva continua vindo para a tela');
});

test('a sugestão nunca fica abaixo do que a peça já fechou', () => {
    // Varre preços praticados de baixo para cima: em nenhum deles o conselho
    // pode ser um preço menor que o praticado.
    for (const praticado of [10, 30, 50, 60, 70, 75, 85, 95, 120]) {
        for (const custo of [0, 20, 55]) {
            const vendas = repetir(5, () => venda(praticado, true, 10));
            const r = sugerirPrecoDeFechamento(vendas, curvaSaudavel, { lista: 100, custo });
            if (!r.ok) continue;
            const s = (r as any).sugestao;
            assert.ok(s.preco >= praticado,
                `praticado ${praticado} (custo ${custo}) → sugeriu ${s.preco}`);
            assert.ok(s.diferenca >= 0, `diferença negativa em ${praticado}: ${s.diferenca}`);
        }
    }
});

test('curva invertida não vira sugestão — o desconto não é o que decide', () => {
    const curvaInvertida = curvaDeDesconto([
        ...linhas(0.75, 12, 1),    // desconto fundo fecha quase nada
        ...linhas(0.85, 12, 3),
        ...linhas(0.97, 12, 10),   // preço cheio fecha quase sempre
        ...linhas(1.05, 12, 11),
    ])!;
    const r = sugerirPrecoDeFechamento(repetir(6, () => venda(90, true)), curvaInvertida, { lista: 100 });
    assert.equal(r.ok, false);
    assert.match((r as any).motivo, /não melhora com desconto/);
    assert.equal((r as any).faixas.length, 4, 'a curva continua vindo para a tela');
});

test('sugestão traz a base que a sustenta e a confiança correspondente', () => {
    const r = sugerirPrecoDeFechamento(repetir(6, () => venda(60, true, 10)), curvaSaudavel, { lista: 100 });
    const s = (r as any).sugestao;
    assert.equal(s.baseDaCurva, 48);
    assert.equal(s.confianca, 'baixa');    // 12 linhas na vencedora
    assert.equal(s.lista, 100);
    assert.equal(s.porCem, Math.round(s.faixa.retorno * 100));
    assert.equal(s.diferenca, Math.round((s.preco - s.precoHoje) * 100) / 100);
});

test('a memória nunca sai com NaN, undefined ou R$ vazio', () => {
    const curvas = [curvaSaudavel, curvaDeDesconto([
        ...linhas(0.7, 15, 15), ...linhas(0.9, 15, 8), ...linhas(1.2, 15, 0),
    ])!];
    const refs: any[] = [
        { lista: 100 }, { lista: 100, custo: 40 }, { lista: 100, custo: 0 },
        { lista: 100, tier2: 92, tier3: 85, custo: 55 },
        { lista: 0.5, custo: 0.2 },
    ];
    for (const curva of curvas) {
        for (const ref of refs) {
            for (const vendas of [[], repetir(4, () => venda(80, seq % 2 === 0, seq % 5))]) {
                const r = sugerirPrecoDeFechamento(vendas, curva, ref);
                const texto = r.ok ? (r as any).sugestao.memoria : (r as any).motivo;
                assert.equal(typeof texto, 'string');
                assert.ok(texto.length > 0);
                assert.ok(!/NaN|undefined|Infinity/.test(texto), `texto ruim: ${texto}`);
                if (r.ok) {
                    const s = (r as any).sugestao;
                    assert.ok(Number.isFinite(s.preco) && s.preco > 0, `preço ruim: ${s.preco}`);
                    assert.ok(Number.isFinite(s.ganho) && Number.isFinite(s.diferenca));
                    assert.ok(s.faixas.every((f: any) => Number.isFinite(f.retorno) && f.retorno >= 0));
                }
            }
        }
    }
});

test('data com hora é cortada para o dia', () => {
    const comHora: OrcamentoDoHistorico[] = [{
        id: 'x', client_id: 'c1', date: '2026-05-09T13:45:00Z', status: 'Sent',
        items: [{ product_id: 'p9', quantity: 1, unit_price: 10 }],
    }];
    assert.equal(vendasDoProduto(comHora, 'p9', nomeDoCliente)[0].data, '2026-05-09');
});

test('orçamento sem itens ou lista indefinida não quebra', () => {
    const vazios: OrcamentoDoHistorico[] = [
        { id: 'a', client_id: 'c1', date: '2026-01-01' },
        { id: 'b', client_id: 'c1', date: '2026-01-02', items: [] },
    ];
    assert.deepEqual(vendasDoProduto(vazios, 'p1', nomeDoCliente), []);
    assert.equal(historicoPorProduto(vazios, nomeDoCliente).size, 0);
    assert.deepEqual(vendasDoProduto(undefined as any, 'p1', nomeDoCliente), []);
});

// ─── recorte por grupo de clientes ───────────────────────────────────────────

test('vendasDeClientes devolve só as orçadas dos clientes pedidos', () => {
    const vendas = [
        { clienteId: 'a', valorUnit: 10 },
        { clienteId: 'b', valorUnit: 20 },
        { clienteId: 'c', valorUnit: 30 },
    ] as any;
    const r = vendasDeClientes(vendas, ['a', 'c']);
    assert.deepEqual(r.map((v: any) => v.clienteId), ['a', 'c']);
});

test('grupo vazio devolve vazio — e não a lista inteira disfarçada de grupo', () => {
    const vendas = [{ clienteId: 'a' }, { clienteId: 'b' }] as any;
    assert.deepEqual(vendasDeClientes(vendas, []), []);
    assert.deepEqual(vendasDeClientes(vendas, undefined), []);
});

test('cliente do grupo sem orçada nenhuma não inventa linha', () => {
    const vendas = [{ clienteId: 'a' }] as any;
    assert.deepEqual(vendasDeClientes(vendas, ['z']), []);
});

test('lista de vendas nula não quebra', () => {
    assert.deepEqual(vendasDeClientes(undefined, ['a']), []);
});
