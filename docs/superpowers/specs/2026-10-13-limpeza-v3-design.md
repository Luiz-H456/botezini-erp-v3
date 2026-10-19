# Limpeza v3 — desenho (S6)

- **Data:** 13/10/2026.
- **Branch:** `v3`.
- **Roteiro:** `2026-10-08-roteiro-v3-design.md`, seção S6, mais as listas "Ficou para depois" do S0 ao S5.
- **Respostas do Luiz (13/10):**
  1. A linha antiga do Início "<mês> fecha em −R$ X" sai.
  2. Quantidade ou valor só com ponto e 3 dígitos depois dele, como "1.000", é milhar.
  3. Copiar a mensagem do orçamento para cliente sem telefone marca o orçamento como "Enviado".
  4. "Já foi pago?" pergunta o meio de pagamento, já sugerindo o último usado.

## 1. Regras

- **Nada no banco.**
- **Nenhuma função some.** O que sai é código morto ou duplicado, e cada remoção é conferida com `grep` antes.
- **Documento antigo é arquivado, não apagado:** vai de `docs/` para `docs/arquivo/`. Os specs e planos de
  `docs/superpowers/` são história e ficam onde estão.
- **Visual e ícones:** seguem `estilo.ts` e a regra de 10/10, em que tamanho de ícone nunca diminui.
- **Testes e tipos:** `node --test` e `tsc` limpos.

## 2. O que muda, por área

### A. Contas puras e números

- **`parseBRL`:** "1.000", "2.500" e "1.234.567", isto é, ponto seguido de exatamente 3 dígitos e sem vírgula, viram
  milhar. "1.5", "12.50" e "1,5" continuam decimais. Isso vale para todo campo que usa `parseBRL`, inclusive as
  entradas de estoque e o Receber compra. Tem testes.

### B. Início (fila)

- Sai a linha "<mês> fecha em −R$ X". Fica só "Caixa fica negativo em dd/mm". A função `projecaoDoMes` continua
  existindo, porque Finanças a usa.
- Pendências do S1:
  - `production_stage` passa a ser comparado com `trim`;
  - o id da linha deixa de depender da ordem;
  - "Atenção" deixa de contar como linha nos contadores;
  - entram testes de borda;
  - recarga: a corrida ao sair e entrar é descartada, e "hoje" é recalculado depois da meia-noite;
  - a gaveta do menu no celular prende o Tab dentro dela.

### C. Vender (pendências do S3)

- **Meio de pagamento:** o orçamento antigo regravado mantém o meio de pagamento (`payment_method` passa por
  `planoParaMostrar`).
- **"Editar parcelas":** o prazo de entrega conta da data de emissão.
- **Erro depois de salvar:** quando o salvar já gravou e o erro vem depois, a mensagem não diz "Não consegui salvar".
- **Ctrl+S com erro de validação:** o cursor volta ao campo.
- **Orçamento antigo com `has_band:false`:** deixa de contar como "com especificação".
- **"Orçamento de origem":** sai do ⋯, porque o chip à vista já faz o mesmo.
- **Envio sem telefone:** copiar a mensagem marca o orçamento como Enviado (resposta 3).
- **"Abrir ficha":** ganha o estado de carregando, e o clique duplo não dispara duas vezes.
- **"Ver o que receber":** a rolagem centraliza depois que a linha se expande.
- **PDF:** destaca a 1ª parcela como entrada só quando ela é entrada (`descreverCondicao`).
- **Sem mudança:** a troca de produto religar a Faixa fica como está, porque é o mesmo comportamento de manga,
  gênero e modelagem.

### D. Dinheiro (pendências do S0)

- **"Já foi pago?":** ganha o campo meio de pagamento, pré-preenchido com o meio mais usado nos pagamentos daquele
  fornecedor ou cliente (resposta 4).
- **"Recalcular scores":** passa a dar retorno na tela.
- **Desfazer conferência:** o botão diz "Desfazer conferência" em vez de "Confirmar reversão".
- **`AttachmentViewer` e `ConfirmDialog`:** passam a abrir em portal.
- **Painel Filtros:**
  - Esc fecha primeiro a lista aberta dentro dele, e só depois o painel;
  - o foco fica preso no painel.
- **`Finance.tsx`:** saem os campos mortos (`confirmTarget.title/message`, a guarda sempre verdadeira,
  `includeInactive`).

### E. Cadastros (pendências do S2)

- **Leitura de setores que falha:** a tela Setores mostra o erro em vez de "nenhum setor".
- **Meta sugerida:** lê as categorias no modo estrito.
- **Painel de Completude:** recarrega sem remontar; a rolagem e o "ver mais" ficam.
- **Arquivos e tipos:**
  - `CompletudeTab.tsx` é renomeado para `PainelDeCompletude.tsx`;
  - os casts `as any` nos ganchos da completude e da meta são tipados.
- **Testes:** `calcularMetaSugerida` ganha teste.
- **Detalhes visuais anotados no S2:** cores de valor nos campos, recuo da lista e botões de confirmar em
  Categorias.

### F. Fábrica (pendências do S4)

- **Menu ⋯:** passa a abrir em posição fixa, calculada pelo botão, e não é mais cortado por nenhuma tabela. Com isso
  some o `paraCima`.
- **Baixa pelo Quadro de um pedido sem itens:** em vez de "resta 0 de 0", aparece "este pedido não tem peças
  cadastradas".
- **`abrirBaixa`:** ganha guarda contra clique duplo.

### G. Remoções

Antes de cada remoção, o `grep` tem de confirmar que nada mais usa o que sai.
- **`Dashboard.tsx` velho** e o que só ele usa.
- **`SimuladorPanel.tsx`.**
- **Reexports de `PcpTab` e `ABAS_DA_FABRICA` em `PCP.tsx`:** quem importa passa a importar de
  `@/utils/pcpAbas`.
- **`usePcpCapacity.loads`:** sai se ninguém mais usa.
- **Comentários no código** que citam `LateralDaSecao`, `AbasDaSecao` e `factoryMode`.
- **Documentos antigos da raiz de `docs/`:** vão para `docs/arquivo/`. São os `auditoria-*`, `arquitetura/`,
  `APP_ARCHITECTURE.md`, `RESTYLING_PLAN.md`, `implementation_plan.md` e os outros planos antigos. Ficam na raiz
  `docs/superpowers/`, `docs/qa/`, `docs/security-audit/` e `mensagens-whatsapp.md`.

## 3. Conferência

- Suíte e tipos limpos.
- **Navegador:**
  - o Início sem a linha antiga;
  - "1.000" lido como mil num campo de quantidade, só olhando o total, sem gravar;
  - o ⋯ do Estoque com 1 linha;
  - nenhuma tela quebrada pelas remoções: abrir todas as seções;
  - console sem erro novo.
- **Roteiro:** S6 passa a "Pronto".
