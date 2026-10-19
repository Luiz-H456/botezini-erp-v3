import test from 'node:test';
import assert from 'node:assert';
import {
    tratamento, msgPrimeiroContato, msgCompletarCadastro, msgCobrarGrade,
    msgFechamento, msgProducaoIniciada, msgEntregue, msgEntregaParcial,
    msgLembreteDeVencimento, msgCobrancaVencida, linkDoWhatsApp,
    msgPedidoConfirmado, msgAndamento, msgCobrarEntrada,
    msgAbordagemDeLead, msgRetomarOrcamento,
} from './mensagensCliente.ts';
import type { DadosDoCliente } from './mensagensCliente.ts';

const HOSPITAL: DadosDoCliente = {
    company_name: 'Hospital Santa Casa Ltda',
    contact_person: 'Maria Fernanda Souza',
    cnpj: '12.345.678/0001-90',
    inscricao_estadual: 'ISENTO',
    phone: '(34) 99123-4567',
    email: 'compras@santacasa.com.br',
    address: 'Rua das Flores, 100 — Uberaba/MG',
};

// ── Tratamento ──────────────────────────────────────────────────────────────

test('usa o primeiro nome do contato, não a razão social', () => {
    // "Olá, Hospital Santa Casa Ltda" não é jeito de falar com gente.
    assert.strictEqual(tratamento(HOSPITAL), 'Maria');
});

test('sem contato, cai na razão social', () => {
    assert.strictEqual(tratamento({ company_name: 'Colégio Alfa' }), 'Colégio Alfa');
});

test('sem nada, não deixa buraco na mensagem', () => {
    assert.strictEqual(tratamento({}), 'tudo bem');
    assert.strictEqual(tratamento(undefined), 'tudo bem');
});

test('nome só com espaços conta como ausente', () => {
    assert.strictEqual(tratamento({ contact_person: '   ', company_name: 'Alfa' }), 'Alfa');
});

// ── Cadastro ────────────────────────────────────────────────────────────────

test('o primeiro contato não depende de dado nenhum', () => {
    const m = msgPrimeiroContato();
    assert.match(m, /Razão social/);
    assert.ok(!m.includes('undefined'));
});

test('completar cadastro pede SÓ o que falta', () => {
    const m = msgCompletarCadastro({ company_name: 'Alfa', cnpj: '123', phone: '34999' });
    assert.match(m, /E-mail/);
    assert.match(m, /Endereço/);
    assert.ok(!m.includes('CNPJ'), 'não pode pedir o que já está preenchido');
    assert.ok(!m.includes('Telefone'));
});

test('cadastro completo não gera mensagem', () => {
    // String vazia é o sinal de "não há o que pedir" — a tela esconde o botão.
    assert.strictEqual(msgCompletarCadastro(HOSPITAL), '');
});

// ── Fechamento ──────────────────────────────────────────────────────────────

test('o fechamento MOSTRA os dados fiscais em vez de perguntá-los', () => {
    // Repetir "me confirma seu CNPJ" para quem já está cadastrado é fazer o
    // cliente trabalhar de novo, e abre espaço para erro de digitação.
    const m = msgFechamento(HOSPITAL, { serial_number: 'ORC-001', delivery_time_days: 15, down_payment_value: 5000 });
    assert.match(m, /Hospital Santa Casa Ltda/);
    assert.match(m, /12\.345\.678\/0001-90/);
    assert.match(m, /15 dias úteis/);
    assert.match(m, /R\$\s*5\.000,00/);
    assert.ok(!/confirma a razão social/i.test(m), 'não deve reperguntar');
});

test('fechamento sem prazo e sem entrada deixa lacuna, não inventa', () => {
    const m = msgFechamento({ company_name: 'Alfa' }, {});
    assert.match(m, /___/);
    assert.ok(!m.includes('undefined'));
    assert.ok(!m.includes('NaN'));
});

// ── Produção e entrega ──────────────────────────────────────────────────────

test('produção iniciada traz número e prazo formatados', () => {
    const m = msgProducaoIniciada(HOSPITAL, { order_number: '1042', deadline: '2026-09-15' });
    assert.match(m, /#1042/);
    assert.match(m, /15\/09\/2026/);
});

test('entrega parcial lista as peças que saíram', () => {
    const m = msgEntregaParcial(HOSPITAL, { order_number: '1042' }, [
        { descricao: 'Polo Azul Claro', quantidade: 18 },
        { descricao: 'Polo Azul Escuro', quantidade: 4 },
    ]);
    assert.match(m, /Polo Azul Claro: 18 peças/);
    assert.match(m, /Polo Azul Escuro: 4 peças/);
});

test('entrega com saldo real em aberto menciona o saldo', () => {
    const m = msgEntregue(HOSPITAL, { order_number: '1042' }, 4000);
    assert.match(m, /R\$\s*4\.000,00/);
});

test('entrega quitada, ou saldo desconhecido, NÃO cobra nada', () => {
    // Cobrar quem já pagou tudo é o tipo de erro que custa o cliente.
    for (const saldo of [0, -50, null]) {
        const m = msgEntregue(HOSPITAL, { order_number: '1042' }, saldo);
        assert.ok(!/saldo/i.test(m), String(saldo));
        assert.match(m, /entregue/i);
    }
});

// ── Cobrança ────────────────────────────────────────────────────────────────

test('lembrete traz valor e vencimento em pt-BR', () => {
    const m = msgLembreteDeVencimento(HOSPITAL, { remaining_amount: 1234.5, due_date: '2026-09-05' });
    assert.match(m, /R\$\s*1\.234,50/);
    assert.match(m, /05\/09\/2026/);
});

test('cobrança vencida informa os dias de atraso quando conhecidos', () => {
    const m = msgCobrancaVencida(HOSPITAL, { remaining_amount: 800, due_date: '2026-08-01' }, 9);
    assert.match(m, /\(9 dias\)/);
    assert.match(m, /comprovante/);
});

test('sem os dias de atraso, a frase continua correta', () => {
    const m = msgCobrancaVencida(HOSPITAL, { remaining_amount: 800, due_date: '2026-08-01' });
    assert.ok(!m.includes('dias)'));
    assert.ok(!m.includes('undefined'));
});

test('valor ausente vira R$ 0,00 e não NaN', () => {
    const m = msgLembreteDeVencimento(HOSPITAL, { due_date: '2026-09-05' });
    assert.ok(!m.includes('NaN'));
});

test('data ausente vira lacuna visível, não "Invalid Date"', () => {
    const m = msgLembreteDeVencimento(HOSPITAL, { remaining_amount: 100 });
    assert.match(m, /___/);
    assert.ok(!/Invalid/i.test(m));
});

// ── Link do WhatsApp ────────────────────────────────────────────────────────

test('acrescenta o DDI 55 quando falta', () => {
    // Telefone cadastrado à mão quase nunca tem o 55 — sem ele o link abre uma
    // conversa com número inválido.
    assert.strictEqual(linkDoWhatsApp('(34) 99123-4567'), 'https://wa.me/5534991234567');
});

test('não duplica o DDI quando já existe', () => {
    assert.strictEqual(linkDoWhatsApp('55 34 99123-4567'), 'https://wa.me/5534991234567');
});

test('telefone curto demais não gera link', () => {
    assert.strictEqual(linkDoWhatsApp('1234'), null);
    assert.strictEqual(linkDoWhatsApp(''), null);
    assert.strictEqual(linkDoWhatsApp(undefined), null);
});

test('o texto vai codificado na URL', () => {
    const url = linkDoWhatsApp('34991234567', 'Olá, tudo bem?') as string;
    assert.ok(url.includes('text=Ol%C3%A1%2C%20tudo%20bem%3F'));
});

// ── Invariante geral ────────────────────────────────────────────────────────

test('NENHUMA mensagem vaza undefined, null ou NaN com dados vazios', () => {
    // O defeito que mais assusta o cliente: receber "Olá, undefined".
    const vazio = {};
    const mensagens = [
        msgPrimeiroContato(vazio),
        msgCobrarGrade(vazio),
        msgFechamento(vazio, {}),
        msgProducaoIniciada(vazio, {}),
        msgEntregue(vazio, {}, null),
        msgEntregaParcial(vazio, {}, []),
        msgLembreteDeVencimento(vazio, {}),
        msgCobrancaVencida(vazio, {}),
        msgCobrarEntrada(vazio, {}),
    ];
    for (const m of mensagens) {
        assert.ok(!m.includes('undefined'), `vazou undefined: ${m.slice(0, 60)}`);
        assert.ok(!m.includes('null'), `vazou null: ${m.slice(0, 60)}`);
        assert.ok(!m.includes('NaN'), `vazou NaN: ${m.slice(0, 60)}`);
    }
});

test('nenhuma mensagem começa ou termina com linha em branco', () => {
    const m = msgProducaoIniciada(HOSPITAL, { order_number: '1', deadline: '2026-09-15' });
    assert.strictEqual(m, m.trim());
});

// ── Confirmação e andamento ─────────────────────────────────────────────────

test('a confirmação cita a data da conversão junto com a previsão', () => {
    // O prazo conta da CONFIRMAÇÃO. Deixar isso implícito gera discussão depois:
    // o cliente conta do orçamento, a fábrica conta da aprovação.
    const m = msgPedidoConfirmado(HOSPITAL, {
        order_number: '1042', confirmado_em: '2026-08-10', prazo_dias: 15, deadline: '2026-08-31',
    });
    assert.match(m, /#1042/);
    assert.match(m, /10\/08\/2026/);
    assert.match(m, /15 dias úteis a partir da confirmação/);
    assert.match(m, /31\/08\/2026/);
});

test('a confirmação NÃO fala de dinheiro, com ou sem saldo', () => {
    // Ela é sobre PRAZO. Valor já foi combinado no fechamento, e repeti-lo aqui
    // transforma uma boa notícia em cobrança.
    for (const pago of [5000, 2000, 0]) {
        const m = msgPedidoConfirmado(HOSPITAL, {
            order_number: '1', total_amount: 5000, amount_paid: pago, deadline: '2026-08-31',
        });
        assert.ok(!/saldo/i.test(m), 'não pode citar saldo');
        assert.ok(!/R\$/.test(m), 'não pode citar valor');
    }
});

test('cada etapa da produção tem sua própria frase', () => {
    const etapas = ['Aguardando Material', 'Corte', 'Personalização', 'Costura', 'Finalização', 'Transporte'];
    const textos = etapas.map(e => msgAndamento(HOSPITAL, { order_number: '1' }, e));
    // Nenhuma repetida: se duas etapas dessem a mesma frase, avisar não
    // informaria nada.
    assert.strictEqual(new Set(textos).size, etapas.length);
    assert.match(textos[1], /no corte/);
    assert.match(textos[3], /na costura/);
});

test('etapa desconhecida não vaza o nome interno da coluna', () => {
    const m = msgAndamento(HOSPITAL, { order_number: '1' }, 'ENFESTO_INTERNO_XYZ');
    assert.ok(!m.includes('ENFESTO_INTERNO_XYZ'));
    assert.match(m, /em andamento na produção/);
});

test('sem etapa informada, a mensagem continua válida', () => {
    const m = msgAndamento(HOSPITAL, { order_number: '1' });
    assert.ok(!m.includes('undefined'));
    assert.match(m, /#1/);
});

test('a IE entra nos dados fiscais do fechamento', () => {
    const m = msgFechamento(HOSPITAL, { serial_number: 'ORC-1' });
    assert.match(m, /IE ISENTO/);
});

test('"ISENTO" conta como preenchido — é valor, não ausência', () => {
    // Se contasse como vazio, a mensagem ficaria pedindo a IE para sempre de
    // todo cliente do Simples.
    const isento = { ...HOSPITAL, inscricao_estadual: 'ISENTO' };
    assert.strictEqual(msgCompletarCadastro(isento), '');
});

test('cliente sem IE recebe o pedido dela', () => {
    const semIE = { ...HOSPITAL, inscricao_estadual: undefined };
    assert.match(msgCompletarCadastro(semIE), /Inscrição estadual/);
});

// ── Cobrança da entrada ─────────────────────────────────────────────────────

test('a cobrança da entrada traz o valor e o saldo que fica para a entrega', () => {
    const m = msgCobrarEntrada(HOSPITAL, {
        serial_number: 'ORC-042', total_amount: 10000, down_payment_value: 4000,
    });
    assert.ok(m.includes('ORC-042'), 'cita o orçamento');
    assert.ok(m.includes('4.000,00'), 'cita a entrada');
    assert.ok(m.includes('6.000,00'), 'cita o saldo restante');
});

test('a entrada explica o MOTIVO, não só cobra — é o que libera o tecido', () => {
    const m = msgCobrarEntrada(HOSPITAL, { down_payment_value: 500 });
    assert.ok(/tecido/i.test(m), 'diz o que a entrada destrava');
});

test('sem chave PIX cadastrada, deixa a lacuna visível em vez de omitir', () => {
    const m = msgCobrarEntrada(HOSPITAL, { down_payment_value: 500 });
    assert.ok(m.includes('*PIX:* ___'), 'lacuna explícita para preencher na hora');
});

test('com chave PIX, ela entra na mensagem', () => {
    const m = msgCobrarEntrada(HOSPITAL, { down_payment_value: 500, chave_pix: '12345678000190' });
    assert.ok(m.includes('12345678000190'));
});

test('sem valor de entrada a frase continua de pé, sem "R$ 0,00"', () => {
    const m = msgCobrarEntrada(HOSPITAL, {});
    assert.ok(!m.includes('R$ 0,00'), 'não cobra zero reais');
    assert.ok(m.includes('entrada combinada'));
});

test('o prazo só aparece quando existe', () => {
    const com = msgCobrarEntrada(HOSPITAL, { down_payment_value: 100, delivery_time_days: 15 });
    assert.ok(com.includes('15 dias úteis'));
    const sem = msgCobrarEntrada(HOSPITAL, { down_payment_value: 100 });
    assert.ok(sem.includes('prazo começa a contar'));
});

// ── msgAbordagemDeLead ──────────────────────────────────────────────────────

test('a abordagem fria usa o primeiro nome do contato', () => {
    const m = msgAbordagemDeLead({ contato_nome: 'Maria Aparecida Souza' });
    assert.ok(m.startsWith('Ola, Maria!'), m.split('\n')[0]);
});

test('sem contato, cumprimenta sem inventar nome', () => {
    const m = msgAbordagemDeLead({ razao_social: 'ACME LTDA' });
    assert.ok(m.startsWith('Ola! Tudo bem?'), m.split('\n')[0]);
    assert.ok(!m.includes('undefined'));
});

test('cita a fantasia quando existe, e a razao social quando nao', () => {
    assert.ok(msgAbordagemDeLead({ razao_social: 'X LTDA', nome_fantasia: 'Padaria X' }).includes('Padaria X'));
    assert.ok(msgAbordagemDeLead({ razao_social: 'X LTDA' }).includes('X LTDA'));
});

test('a cidade entra na frase quando se sabe', () => {
    assert.ok(msgAbordagemDeLead({ cidade: 'Ribeirao Preto' }).includes('Ribeirao Preto'));
    assert.ok(!msgAbordagemDeLead({}).includes('atende bastante empresa em'));
});

test('nao pede CNPJ nem endereco — e o jeito de ser bloqueado na primeira frase', () => {
    const m = msgAbordagemDeLead({ contato_nome: 'Joao' }).toLowerCase();
    assert.ok(!m.includes('cnpj'), m);
    assert.ok(!m.includes('inscricao'), m);
    assert.ok(!m.includes('endereco'), m);
});

test('termina com uma pergunta, nao com um pedido', () => {
    assert.ok(msgAbordagemDeLead({}).trim().endsWith('sem compromisso.'));
});

test('o nome da casa e configuravel, com padrao', () => {
    assert.ok(msgAbordagemDeLead({}, 'Confeccoes Teste').includes('Confeccoes Teste'));
    assert.ok(msgAbordagemDeLead({}).includes('Botezini Uniformes'));
});

// ── msgRetomarOrcamento ─────────────────────────────────────────────────────

test('retomar cita o numero do orcamento e nao repete os valores', () => {
    const m = msgRetomarOrcamento({ contato_person: 'x' } as never, {
        serial_number: 'ORC-2026-010', total_amount: 4500,
    });
    assert.ok(m.includes('ORC-2026-010'));
    assert.ok(!m.includes('4.500'), 'reenviar valor parece cobranca');
});

test('o tempo so aparece depois de uma semana', () => {
    const o = { serial_number: 'ORC-1' };
    assert.ok(!msgRetomarOrcamento({}, o, 3).includes('3 dias'));
    assert.ok(msgRetomarOrcamento({}, o, 12).includes('12 dias'));
});

test('a validade so e citada quando esta perto', () => {
    const o = { serial_number: 'ORC-1' };
    assert.ok(msgRetomarOrcamento({}, o, 10, 2).includes('2 dias'));
    assert.ok(msgRetomarOrcamento({}, o, 10, 0).includes('hoje'));
    assert.ok(!msgRetomarOrcamento({}, o, 10, 40).includes('validade'));
    assert.ok(!msgRetomarOrcamento({}, o, 10, -5).includes('validade'),
        'orcamento ja vencido nao ganha aviso de validade');
});

test('retomar sempre pergunta o motivo do silencio', () => {
    const m = msgRetomarOrcamento({}, { serial_number: 'ORC-1' });
    assert.ok(m.toLowerCase().includes('ajustar') || m.toLowerCase().includes('duvida'), m);
});

test('sem contato cadastrado nao deixa buraco na mensagem', () => {
    const m = msgRetomarOrcamento({}, { serial_number: 'ORC-1' });
    assert.ok(!m.includes('undefined'));
    assert.ok(!m.includes('null'));
});
