import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dadosBancariosDoOrcamento, colunasOpcionaisDoPerfil, alturaDoQuadroBancario, QUADRO_BANCARIO } from './perfilDaEmpresa.ts';

const antigos = { bank_name: 'Itaú', agency: '0001', account_number: '123-4', bank_holder: 'Botezini', pix_key: 'cnpj' };

test('com banco escolhido, o orçamento usa os dados dele — inteiros, sem misturar com os antigos', () => {
    const d = dadosBancariosDoOrcamento({
        ...antigos,
        banco_do_orcamento: { bank_name: 'Sicoob', agency: '3000', account_number: '9-9', titular: 'Sueli', chave_pix: null },
    });
    assert.deepEqual(d, { bank_name: 'Sicoob', agency: '3000', account_number: '9-9', holder: 'Sueli', pix_key: null });
});

test('sem banco escolhido (ou inativado), volta aos dados antigos da empresa', () => {
    assert.deepEqual(dadosBancariosDoOrcamento({ ...antigos, banco_do_orcamento: null }),
        { bank_name: 'Itaú', agency: '0001', account_number: '123-4', holder: 'Botezini', pix_key: 'cnpj' });
    assert.deepEqual(dadosBancariosDoOrcamento({ ...antigos }),
        { bank_name: 'Itaú', agency: '0001', account_number: '123-4', holder: 'Botezini', pix_key: 'cnpj' });
});

test('aliases antigos de agência e conta ainda valem', () => {
    const d = dadosBancariosDoOrcamento({ bank_name: 'Itaú', bank_agency: '0002', bank_account: '55' });
    assert.equal(d.agency, '0002');
    assert.equal(d.account_number, '55');
});

test('a coluna nova só vai ao banco quando ela existe (veio na leitura)', () => {
    assert.deepEqual(colunasOpcionaisDoPerfil({ bank_name: 'X' }), {});
    assert.deepEqual(colunasOpcionaisDoPerfil({ banco_do_orcamento_id: null }), { banco_do_orcamento_id: null });
    assert.deepEqual(colunasOpcionaisDoPerfil({ banco_do_orcamento_id: 'b1' }), { banco_do_orcamento_id: 'b1' });
});

// O total do orçamento é escrito em BRANCO sobre o quadro preto de pagamento. Em 22/10 a altura do
// quadro era estimada com passos menores que os do desenho e sem a linha do total: com banco,
// agência, titular e PIX, o fundo acabava antes e o valor saía branco no branco (ORC-BZ-2026-064).
test('o quadro de pagamento tem altura para todas as linhas E para o total', () => {
    const cheio = { bank_name: 'Santander', agency: '3305', account_number: '130001682', holder: 'Confecções Botezini', pix_key: '01016923000102' };
    const q = QUADRO_BANCARIO;
    const baseDoTotal = q.inicio + 3 * q.linha + q.pix + q.baseDoTotal;     // onde o desenho escreve o valor
    assert.equal(alturaDoQuadroBancario(cheio), 51);
    assert.ok(alturaDoQuadroBancario(cheio) >= baseDoTotal + 2, 'o valor do total cabe dentro do fundo preto');
});

test('cada linha opcional soma o mesmo passo que o desenho anda', () => {
    const vazio = { bank_name: null, agency: null, account_number: null, holder: null, pix_key: null };
    const q = QUADRO_BANCARIO;
    assert.equal(alturaDoQuadroBancario(vazio), q.inicio + q.total);
    assert.equal(alturaDoQuadroBancario({ ...vazio, bank_name: 'X' }) - alturaDoQuadroBancario(vazio), q.linha);
    assert.equal(alturaDoQuadroBancario({ ...vazio, account_number: '1' }) - alturaDoQuadroBancario(vazio), q.linha);  // agência OU conta: uma linha
    assert.equal(alturaDoQuadroBancario({ ...vazio, holder: 'T' }) - alturaDoQuadroBancario(vazio), q.linha);
    assert.equal(alturaDoQuadroBancario({ ...vazio, pix_key: 'p' }) - alturaDoQuadroBancario(vazio), q.pix);
});
