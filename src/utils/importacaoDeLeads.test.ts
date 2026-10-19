import test from 'node:test';
import assert from 'node:assert';
import {
    dividirLinha, detectarSeparador, lerCsv, normalizarLinha, cnpjValido,
    classificarImportacao, resumirImportacao, COLUNAS_ESPERADAS, SEGMENTOS,
    ROTULO_DA_CATEGORIA, EXPLICACAO_DA_CATEGORIA, IMPORTAVEIS, valorEmReais, dataISO,
} from './importacaoDeLeads.ts';
import type { ClienteConhecido, LeadConhecido } from './importacaoDeLeads.ts';

const CABECALHO = COLUNAS_ESPERADAS.join(',');

const csv = (...linhas: string[]) => [CABECALHO, ...linhas].join('\n');

// CNPJs de teste: mesma raiz 11222333, estabelecimentos diferentes.
const MATRIZ = '11222333000181';
const FILIAL = '11222333000262';
const OUTRA = '99888777000155';

// ── dividir a linha ─────────────────────────────────────────────────────────

test('divide campos simples', () => {
    assert.deepStrictEqual(dividirLinha('a,b,c'), ['a', 'b', 'c']);
});

test('vírgula dentro de aspas não quebra o campo', () => {
    assert.deepStrictEqual(
        dividirLinha('"MERCADO SAO JOSE, LTDA",Zé,123'),
        ['MERCADO SAO JOSE, LTDA', 'Zé', '123']);
});

test('aspas dobradas viram uma aspa', () => {
    assert.deepStrictEqual(dividirLinha('"a ""b"" c",d'), ['a "b" c', 'd']);
});

test('campo vazio no meio e no fim é preservado', () => {
    assert.deepStrictEqual(dividirLinha('a,,c,'), ['a', '', 'c', '']);
});

test('ponto e vírgula quando é o separador', () => {
    assert.deepStrictEqual(dividirLinha('a;b;c', ';'), ['a', 'b', 'c']);
});

// ── separador ───────────────────────────────────────────────────────────────

test('Excel em português salva com ponto e vírgula — e isso é detectado', () => {
    assert.strictEqual(detectarSeparador('razao_social;cnpj;telefone'), ';');
    assert.strictEqual(detectarSeparador('razao_social,cnpj,telefone'), ',');
});

// ── ler o arquivo ───────────────────────────────────────────────────────────

test('lê o cabeçalho e as linhas', () => {
    const r = lerCsv(csv('ACME LTDA,Acme,,,,,,,,,,,'));
    assert.strictEqual(r.linhas.length, 1);
    assert.strictEqual(r.linhas[0].razao_social, 'ACME LTDA');
    assert.deepStrictEqual(r.faltando, []);
});

test('BOM do Excel não vira parte do primeiro cabeçalho', () => {
    const r = lerCsv('﻿' + csv('ACME LTDA,,,,,,,,,,,,'));
    assert.ok(r.colunas.includes('razao_social'), r.colunas.join('|'));
});

test('CRLF e linha em branco no fim não geram linha fantasma', () => {
    const r = lerCsv(CABECALHO + '\r\nACME LTDA,,,,,,,,,,,,\r\n\r\n');
    assert.strictEqual(r.linhas.length, 1);
});

test('cabeçalho com acento e espaço é normalizado', () => {
    const r = lerCsv('Razão Social,CNPJ\nACME,123');
    assert.ok(r.colunas.includes('razao_social'), r.colunas.join('|'));
    assert.ok(r.colunas.includes('cnpj'));
});

test('coluna que falta é apontada, não silenciada', () => {
    const r = lerCsv('razao_social,cnpj\nACME,');
    assert.ok(r.faltando.includes('telefone'));
    assert.ok(!r.faltando.includes('razao_social'));
});

test('arquivo vazio não quebra', () => {
    const r = lerCsv('');
    assert.deepStrictEqual(r.linhas, []);
    assert.strictEqual(r.faltando.length, COLUNAS_ESPERADAS.length);
    assert.deepStrictEqual(lerCsv(null).linhas, []);
});

test('linha mais curta que o cabeçalho preenche com vazio', () => {
    const r = lerCsv('razao_social,cnpj,telefone\nACME');
    assert.strictEqual(r.linhas[0].cnpj, '');
    assert.strictEqual(r.linhas[0].telefone, '');
});

// ── normalizar ──────────────────────────────────────────────────────────────

test('CNPJ só vale completo — pela metade é o mesmo que não ter', () => {
    assert.strictEqual(cnpjValido('11.222.333/0001-81'), MATRIZ);
    assert.strictEqual(cnpjValido('11222333'), undefined);
    assert.strictEqual(cnpjValido(''), undefined);
    assert.strictEqual(cnpjValido(null), undefined);
});

test('telefone fica só com dígitos', () => {
    const l = normalizarLinha({ razao_social: 'A', telefone: '(11) 98765-4321' });
    assert.strictEqual(l.telefone, '11987654321');
});

test('segmento fora da lista vira "outro", não uma categoria nova', () => {
    assert.strictEqual(normalizarLinha({ razao_social: 'A', segmento: 'saude' }).segmento, 'saude');
    assert.strictEqual(normalizarLinha({ razao_social: 'A', segmento: 'SAUDE' }).segmento, 'saude');
    assert.strictEqual(normalizarLinha({ razao_social: 'A', segmento: 'hospitalar' }).segmento, 'outro');
    assert.strictEqual(normalizarLinha({ razao_social: 'A', segmento: '' }).segmento, undefined);
});

test('todo segmento da lista é aceito como está', () => {
    for (const s of SEGMENTOS) {
        assert.strictEqual(normalizarLinha({ razao_social: 'A', segmento: s }).segmento, s);
    }
});

test('porte lê o número e ignora o resto; zero e lixo viram ausência', () => {
    assert.strictEqual(normalizarLinha({ razao_social: 'A', porte_funcionarios: '250' }).porte_funcionarios, 250);
    assert.strictEqual(normalizarLinha({ razao_social: 'A', porte_funcionarios: '0' }).porte_funcionarios, undefined);
    assert.strictEqual(normalizarLinha({ razao_social: 'A', porte_funcionarios: 'muitos' }).porte_funcionarios, undefined);
});

test('UF sobe para maiúscula e corta em duas letras', () => {
    assert.strictEqual(normalizarLinha({ razao_social: 'A', uf: 'sp' }).uf, 'SP');
    assert.strictEqual(normalizarLinha({ razao_social: 'A', uf: 'São Paulo' }).uf, 'SÃ');
});

test('observacao do CSV vira as notas do lead', () => {
    const l = normalizarLinha({ razao_social: 'A', observacao: 'compra em janeiro' });
    assert.strictEqual(l.notas, 'compra em janeiro');
});

// ── classificar ─────────────────────────────────────────────────────────────

const clientes: ClienteConhecido[] = [
    { id: 'cli1', company_name: 'ACME MATRIZ', cnpj: MATRIZ },
];

const classificar = (texto: string, cs = clientes, ls: LeadConhecido[] = []) =>
    classificarImportacao(lerCsv(texto), cs, ls);

test('empresa desconhecida é nova', () => {
    const r = classificar(csv(`NOVA LTDA,,${OUTRA},,,,,,,,,,`));
    assert.strictEqual(r.linhas[0].categoria, 'novo');
});

test('CNPJ que já é cliente NÃO importa, e diz de quem se trata', () => {
    const r = classificar(csv(`ACME,,${MATRIZ},,,,,,,,,,`));
    assert.strictEqual(r.linhas[0].categoria, 'ja-cliente');
    assert.strictEqual(r.linhas[0].clienteRelacionado?.nome, 'ACME MATRIZ');
    assert.ok(!r.aImportar.includes(r.linhas[0]));
});

test('filial de cliente é achada pela raiz — a venda mais fácil da lista', () => {
    const r = classificar(csv(`ACME UNIDADE 2,,${FILIAL},,,,,,,,,,`));
    assert.strictEqual(r.linhas[0].categoria, 'filial-de-cliente');
    assert.strictEqual(r.linhas[0].clienteRelacionado?.id, 'cli1');
    assert.ok(r.aImportar.includes(r.linhas[0]), 'filial entra no funil');
});

test('cliente exato vence filial: a mesma empresa é mais forte que o grupo', () => {
    const r = classificar(csv(`ACME,,${MATRIZ},,,,,,,,,,`));
    assert.strictEqual(r.linhas[0].categoria, 'ja-cliente');
});

test('lead que já existe é atualizado, não duplicado', () => {
    const r = classificar(csv(`NOVA,,${OUTRA},,,,,,,,,,`), clientes, [{ id: 'ld1', cnpj: OUTRA }]);
    assert.strictEqual(r.linhas[0].categoria, 'ja-lead');
    assert.strictEqual(r.linhas[0].leadExistenteId, 'ld1');
});

test('sem razão social não há o que importar', () => {
    const r = classificar(csv(`,Fantasia,${OUTRA},,,,,,,,,,`));
    assert.strictEqual(r.linhas[0].categoria, 'incompleto');
    assert.strictEqual(r.aImportar.length, 0);
});

test('sem CNPJ entra como novo — não há com o que cruzar', () => {
    const r = classificar(csv('SEM CNPJ LTDA,,,,,,,,,,,,'));
    assert.strictEqual(r.linhas[0].categoria, 'novo');
});

test('a mesma empresa repetida no arquivo não entra duas vezes', () => {
    const r = classificar(csv(
        `NOVA,,${OUTRA},,,,,,,,,,`,
        `NOVA DE NOVO,,${OUTRA},,,,,,,,,,`));
    assert.strictEqual(r.linhas[0].categoria, 'novo');
    assert.strictEqual(r.linhas[1].categoria, 'ja-lead');
});

test('importar o mesmo arquivo duas vezes não duplica nada', () => {
    const arquivo = csv(`NOVA,,${OUTRA},,,,,,,,,,`);
    const primeira = classificar(arquivo);
    assert.strictEqual(primeira.contagem['novo'], 1);

    // Segunda rodada, já com o lead gravado.
    const segunda = classificar(arquivo, clientes, [{ id: 'ld1', cnpj: OUTRA }]);
    assert.strictEqual(segunda.contagem['novo'], 0);
    assert.strictEqual(segunda.contagem['ja-lead'], 1);
});

test('a contagem por categoria soma o total do arquivo', () => {
    const r = classificar(csv(
        `NOVA,,${OUTRA},,,,,,,,,,`,
        `ACME,,${MATRIZ},,,,,,,,,,`,
        `ACME 2,,${FILIAL},,,,,,,,,,`,
        `,,,,,,,,,,,,`));
    assert.deepStrictEqual(r.contagem, {
        'novo': 1, 'ja-cliente': 1, 'filial-de-cliente': 1, 'ja-lead': 0, 'incompleto': 1,
    });
    const soma = Object.values(r.contagem).reduce((a, b) => a + b, 0);
    assert.strictEqual(soma, r.total);
});

test('o número da linha aponta o lugar no arquivo', () => {
    const r = classificar(csv('A LTDA,,,,,,,,,,,,', 'B LTDA,,,,,,,,,,,,'));
    assert.deepStrictEqual(r.linhas.map(l => l.numero), [1, 2]);
});

test('cliente sem CNPJ cadastrado não bloqueia ninguém', () => {
    const r = classificar(csv(`NOVA,,${OUTRA},,,,,,,,,,`), [{ id: 'x', company_name: 'SEM CNPJ' }]);
    assert.strictEqual(r.linhas[0].categoria, 'novo');
});

// ── o resumo ────────────────────────────────────────────────────────────────

test('o resumo diz o que vai acontecer, sem eufemismo', () => {
    const r = classificar(csv(
        `NOVA,,${OUTRA},,,,,,,,,,`,
        `ACME 2,,${FILIAL},,,,,,,,,,`));
    assert.strictEqual(resumirImportacao(r), 'Importar 1 novos, 1 filiais');
});

test('arquivo só de clientes já cadastrados diz que não há o que importar', () => {
    const r = classificar(csv(`ACME,,${MATRIZ},,,,,,,,,,`));
    assert.strictEqual(resumirImportacao(r), 'Nada a importar deste arquivo');
});

test('toda categoria tem rótulo e explicação', () => {
    for (const c of Object.keys(ROTULO_DA_CATEGORIA) as (keyof typeof ROTULO_DA_CATEGORIA)[]) {
        assert.ok(ROTULO_DA_CATEGORIA[c].length > 0, `${c} sem rótulo`);
        assert.ok(EXPLICACAO_DA_CATEGORIA[c].length > 0, `${c} sem explicação`);
    }
});

test('cliente e incompleto nunca são importáveis', () => {
    assert.ok(!IMPORTAVEIS.includes('ja-cliente'));
    assert.ok(!IMPORTAVEIS.includes('incompleto'));
});


// ── fase 4 da Prospecção 2.0: capital social, CNAE e abertura ───────────────

test('capital social no padrao brasileiro', () => {
    assert.equal(valorEmReais('1.500.000,00'), 1500000);
    assert.equal(valorEmReais('250000'), 250000);
    assert.equal(valorEmReais('R$ 10.000,50'), 10000.5);
});

test('ponto isolado com tres casas e MILHAR, nao decimal', () => {
    // O erro que custa mil vezes: "1.500" e mil e quinhentos, nao um e meio.
    assert.equal(valorEmReais('1.500'), 1500);
    assert.equal(valorEmReais('12.000'), 12000);
});

test('mas ponto decimal de verdade continua decimal', () => {
    assert.equal(valorEmReais('1500.75'), 1500.75);
});

test('capital vazio ou ilegivel vira indefinido, e nao zero', () => {
    assert.equal(valorEmReais(''), undefined);
    assert.equal(valorEmReais(null), undefined);
    assert.equal(valorEmReais('nao informado'), undefined);
});

test('data aceita ISO e o formato que o brasileiro digita', () => {
    assert.equal(dataISO('2020-05-14'), '2020-05-14');
    assert.equal(dataISO('14/05/2020'), '2020-05-14');
});

test('data ilegivel nao vira data errada', () => {
    assert.equal(dataISO('maio de 2020'), undefined);
    assert.equal(dataISO(''), undefined);
});

test('planilha ANTIGA continua importando, sem os campos novos', () => {
    // As tres colunas entraram no fim da lista de proposito: quem ja tem
    // planilha gerada nao precisa refaze-la.
    const l = normalizarLinha({
        razao_social: 'Empresa X', segmento: 'saude', porte_funcionarios: '80',
    });
    assert.equal(l.razao_social, 'Empresa X');
    assert.equal(l.capital_social, undefined);
    assert.equal(l.cnae_principal, undefined);
    assert.equal(l.data_abertura, undefined);
});

test('capital ZERO nao e gravado — ausencia nao e afirmacao', () => {
    const l = normalizarLinha({ razao_social: 'X', capital_social: '0' });
    assert.equal(l.capital_social, undefined);
});

test('planilha nova traz os tres campos', () => {
    const l = normalizarLinha({
        razao_social: 'Hospital Y', capital_social: '2.500.000,00',
        cnae_principal: '8610-1/01', data_abertura: '14/05/2010',
    });
    assert.equal(l.capital_social, 2500000);
    assert.equal(l.cnae_principal, '8610-1/01');
    assert.equal(l.data_abertura, '2010-05-14');
});
