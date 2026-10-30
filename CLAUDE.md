# CLAUDE.md — Botezini ERP

Adaptado de [github.com/jbarbier/CLAUDE.md](https://github.com/jbarbier/CLAUDE.md). O que
não cabe neste projeto foi removido de propósito, e o que foi removido está listado
no fim — porque uma regra importada que ninguém segue é pior que regra nenhuma: ensina
que as regras aqui são decorativas.

---

## Como trabalhar

**Esta seção não se negocia.**

O custo marginal de fazer completo é quase zero com IA. Faça inteiro. Faça certo. Com
teste. Com o porquê escrito. Nunca ofereça "deixar para depois" quando a solução
definitiva está ao alcance. Nunca entregue contorno quando o conserto existe. O padrão
não é "passa" — é "está feito, e eu sei onde quebraria".

Dá para terceirizar a digitação. Não dá para terceirizar o entendimento. Antes de dizer
que algo está pronto, você precisa conseguir explicar por que o código está certo e
exatamente onde ele quebraria. Teste passando não é entendimento. Se não consegue
descrever os modos de falha em voz alta, está adivinhando.

Quando o Luiz pede algo, a resposta é o resultado, não um plano para construí-lo.

---

## O banco é dele, não seu

**Regra pétrea, dada em 11/09/2026, depois de algo aparecer errado no financeiro.**

Não toque no banco de produção a não ser que o Luiz peça explicitamente. Nem escrita,
nem leitura de diagnóstico.

O motivo: é o banco vivo de uma empresa que fatura com ele. Quando algo aparece errado,
a primeira pergunta é "o que mexeu ali" — e cada escrita sua é uma resposta possível que
atrapalha o diagnóstico. Quem roda é quem consegue parar no meio.

**Como trabalhar com SQL, então:**

1. Escreva o arquivo em `supabase/`, com uma consulta **somente leitura** no começo que
   mostre o estado antes, e outra no fim que confirme o resultado.
2. Teste contra o dump de produção restaurado num contêiner descartável. Nunca contra a
   `BOTEZINI_DB_URI`.
3. Entregue a lista na ordem de rodar, dizendo o que cada arquivo faz e o que ele
   assume.

A exceção já autorizada é o backup: `scripts/backup.ps1` e `scripts/conferir_backup.ps1`
só leem, e o segundo nem conhece a conexão de produção.

---

## Ambiente v3 (esta pasta)

Desde 06/10/2026 a v3 mora em `Documentos\botezinipvd-v3`, branch `v3`, isolada da
produção — **inclusive o banco**. A pasta `botezinipvd-1` continua sendo a produção.

- **Banco:** Supabase local no Docker, projeto `botezini-v3`, portas 553xx (API em
  `127.0.0.1:55321`, Studio em `127.0.0.1:55323`, Postgres em `55322`). A faixa 543xx
  é de outro banco local antigo (`supabase_db_botezinipvd-1`), que não é da v3.
- **App:** `npm run dev:v3` → `localhost:5175`, lendo `.env.v3.local`. O
  `vite.config.ts` se recusa a subir em modo `v3` se a URL do Supabase não for local.
- **Recarregar do zero:** `scripts\v3_carregar_dump.ps1` zera o banco da v3 e o enche
  com o backup mais recente de `..\botezinipvd-1\backups` (ou `-Dump caminho`). Não
  conhece a `BOTEZINI_DB_URI`.
- **Sem vínculo com a nuvem.** A `supabase/.temp` (com o project-ref de produção)
  estava commitada; na v3 ela saiu do git. Nunca rode `supabase link` nem nada com
  `--linked` aqui. SQL novo roda primeiro neste banco — é ele o "contêiner
  descartável" da regra acima.
- Anexos antigos aparecem listados e não abrem: o dump traz o registro, não o arquivo.
- **Depois de recarregar o dump**, reaplique as migrações da v3 em ordem
  (`supabase/financeiro_v3_1_entrega.sql`, `supabase/financeiro_v3_2_conferencia_e_entrega.sql`, …, `supabase/estampas_v3_d.sql`, `supabase/custos_personalizacao_v3_e.sql`) e recrie o usuário de teste com
  `sh scripts/v3/criar_usuario_teste.sh` — o reset apaga os dois.
- **Usuário de teste** (`V3_TESTE_EMAIL`/`V3_TESTE_SENHA` em `.env.v3.local`) é admin e
  existe só no banco local. É ele que verifica as telas; a conta real do Luiz não.

---

## Terminar com o servidor de pé

**Todo turno que mexe no ERP termina com o dev server rodando.** Sem perguntar, sem
esperar ser pedido:

```
preview_start  →  { name: "botezini-erp" }     # .claude/launch.json, porta 5174
```

Depois confira o console. O login é o máximo que você alcança sozinho — as credenciais
são dele. Se o build ou os testes falharem, diga junto: servidor de pé com código
quebrado não é entrega.

---

## Tamanho da tarefa — triagem antes de gastar

**Toda tarefa começa com um bloco de triagem, antes do trabalho.** Três linhas:

```
Tamanho: pequeno | médio | grande — por quê
Testes: locais (quais) | suíte inteira — por quê
Banco: nenhum | arquivo SQL a entregar (qual)
```

- **pequeno** — texto, cor, renomear, ajuste de configuração, edição mecânica em um ou
  dois arquivos sem mudança de comportamento. Rode só o que cobre o que foi tocado.
  Mudança não-comportamental não pede teste novo.
- **médio** — mudança de comportamento localizada, correção de defeito. Correção sempre
  entrega o teste de regressão junto.
- **grande** — funcionalidade nova, mudança que atravessa camadas, qualquer coisa que
  exija julgamento. Suíte inteira, `tsc`, build.

Na dúvida entre dois tamanhos, escolha o menor e diga que escolheu. Subir no meio é
barato; queimar protocolo grande numa vírgula não é.

---

## Os dois espaços

**Espaço latente = trabalho de modelo.** Julgamento, ambiguidade, texto, decisão de
produto. Custo: tokens. Variabilidade: alta.

**Espaço determinístico = código.** Precisão, reprodutibilidade, custo zero por execução,
testável.

**A regra:** se a mesma pergunta feita duas vezes tem por definição a mesma resposta
certa, é trabalho determinístico. Escreva o script. Se você se pegar fazendo aritmética,
conversão de data, contagem de arquivos ou análise de CSV dentro de uma resposta, pare e
escreva o script.

O laço que faz isso valer: o modelo escreve o script, e o script restringe o modelo para
sempre. Um defeito no espaço latente vira uma trava no determinístico, e o caminho de
falha antigo fica inalcançável. É de onde saíram `escritasDeRisco.test.ts` e
`camadas.test.ts`.

---

## Testes

Este projeto tem **1.283 testes** em 68 arquivos, todos de função pura, rodando com o
executor do Node sem framework:

```bash
node --test --experimental-strip-types "src/utils/*.test.ts"
npx tsc --noEmit
npx vite build
```

- **Regra de negócio mora em `src/utils/`, sem import do app.** É o que torna esses
  testes possíveis sem mock. Lógica nova que dá para isolar, isola.
- **Toda correção de defeito entrega o teste que teria pego o defeito.** O teste é a
  prova de que está consertado.
- **O teste prende a intenção, não a implementação.** `porte desconhecido vale o MEIO,
  não zero` diz por que, e falha quando alguém inverter a decisão sem saber que era uma.
- **Teste que varre texto precisa provar que sabe reprovar.** Um erro de escape faz o
  padrão nunca casar, e teste verde ninguém investiga. Veja o quarto caso em
  `escritasDeRisco.test.ts`.
- **"Adiciono teste depois" está banido.** Se não está no diff, não está feito.

Não há CI. Enquanto não houver, rodar é sua responsabilidade, e o relatório final diz o
que rodou.

---

## Operação sem volta mostra a consequência

**Regra dada pelo Luiz.** Toda operação irreversível avisa o que vai fazer **e qual é a
consequência**, antes de fazer.

O registro está em `src/utils/operacoesSemVolta.ts`, com testes que rejeitam rótulo
vago: "sim", "ok" e "confirmar" reprovam. O botão diz o verbo da ação — `Excluir pedido`,
`Cancelar a série` — e o texto diz o que se perde.

Uma operação marcada `sem-volta` não pode ter campo `comoDesfazer`: prometer um caminho
de volta com uma mão e negar com a outra é pior que não avisar.

---

## O padrão que já custou dinheiro duas vezes

**Campo calculado pelo banco, cliente gravando a linha inteira.** Aconteceu duas vezes
nesta base, as duas com consequência financeira:

- `bank_accounts.initial_balance` — o formulário guardava o zero de quando abriu, e
  salvar depois de ancorar o saldo reescrevia o zero.
- `orders.total_amount` — o kanban do PCP mandava o pedido inteiro a cada arrastada de
  cartão, e devolvia o total de antes do aditivo.

O conserto nunca é "lembrar de recarregar antes de salvar" — isso é pedir que ninguém
erre. É a gravação parar de carregar campo que não é dela: liste os campos, não espalhe
o objeto.

`escritasDeRisco.test.ts` varre o código-fonte procurando a reincidência.

---

## Arquitetura real

Quatro camadas, e a regra crítica mora na de baixo:

```
páginas (18)  →  hooks (34)  →  repositórios (14)  →  PostgREST  →  PostgreSQL
                      ↑
             regra pura em utils/ (73 arquivos, testável sem app)
```

- **Nenhuma página fala com o Supabase.** O repositório é a única porta.
- **Dinheiro só muda por RPC.** Pagar, estornar, cancelar e conciliar são funções no
  banco — é onde a checagem de acesso e o rastro ficam juntos. O aplicativo cria e edita
  obrigação; não decide que uma conta está paga ou cancelada.
- **Autorização é RLS, não interface.** Não há backend próprio: o navegador fala direto
  com o PostgREST usando a chave anônima. Esconder um botão não protege nada.
- **Políticas de RLS somam por OU.** Uma política frouxa esquecida anula todas as
  estritas. Foi assim que 26 políticas do modelo antigo continuaram dando acesso de
  escrita financeira a uma conta de fábrica.

---

## Antes de construir, procure

Três camadas, nesta ordem:

1. **Já existe neste repositório?** Esta é a primeira por um motivo: nesta base eu já
   reconstruí `filaDeHoje` e `conversaoPor` do zero, as duas com o mesmo cuidado que a
   versão original tinha. Duas respostas para a mesma pergunta divergem no dia em que
   alguém corrige uma delas. Procure em `src/utils/` antes de escrever util novo.
2. **Existe biblioteca padrão?** Use.
3. **Primeiros princípios.** Só quando as duas primeiras não servem, e aí escreva por
   quê.

E quando o código antigo e o seu discordarem, **a base pode estar certa**: uma tentativa
de misturar pontuação nova na fila existente foi barrada por um teste que defendia uma
decisão anterior deliberada. Regra que a base boa não passa é regra errada, não base
errada.

---

## Ramificação

O Luiz trabalha sozinho neste repositório, e nada vai para `main` direto. Uma sessão por
vez.

- Trabalhe no ramo de trabalho atual (`feat/...`), commit e push normais.
- Nunca `main`. Nunca `--force` fora de ramo próprio.
- Se um dia duas sessões rodarem ao mesmo tempo neste repositório, pare e configure
  worktree por sessão antes — duas sessões num mesmo checkout se sobrescrevem, e o
  arquivo original tem o bloco pronto para isso.

---

## Confusão

Pare e pergunte quando houver:

- duas leituras plausíveis do pedido que levariam a trabalhos diferentes;
- operação destrutiva de alcance incerto;
- contradição entre o que foi pedido e um padrão que a base já segue.

Nomeie a ambiguidade em uma frase, apresente 2 ou 3 opções com a diferença real entre
elas, e pergunte. Não vale para código rotineiro nem para mudança óbvia.

---

## Segurança

- Nunca commite segredo. `.env*` está no `.gitignore`; confira antes de qualquer commit
  que o toque.
- Nunca rode `rm -rf`, `git reset --hard`, `DROP TABLE` ou equivalente sem confirmação.
- Nunca pule hook de pre-commit com `--no-verify`.
- Nunca commite binário nem saída compilada.
- A senha do banco mora na variável de ambiente do usuário. Não a leia, não a imprima,
  não a peça por mensagem.
- **Captura de tela expõe dado real.** O modo privado esconde valores; nome de cliente e
  descrição de conta continuam visíveis, e descrição de conta carrega folha de
  pagamento. Antes de qualquer imagem sair daqui, isso precisa ser dito.

---

## Como falar com o Luiz

- Português. Direto, curto, concreto. Sem preâmbulo.
- Nome de arquivo e linha, não descrição vaga: `src/utils/conferenciaDeSaldo.ts:47`, não
  "tem um problema na conferência".
- Se algo está quebrado, diga. Se você quebrou, diga que foi você.
- Quando errar e perceber, corrija e siga. Sem cerimônia e sem contabilizar erros
  passados.
- Termine com a próxima ação, não com um resumo do que acabou de fazer.

---

## Status final

Ao fim de toda tarefa, um destes:

- **PRONTO** — tudo feito, com evidência de cada afirmação, testes no diff.
- **PRONTO COM RESSALVA** — feito, com algo que o Luiz precisa saber. Liste cada ponto.
- **BLOQUEADO** — não dá para seguir. Diga o que bloqueia e o que já foi tentado.
- **FALTA CONTEXTO** — diga exatamente o que falta.

"Parcialmente feito" não é status.

---

## O que foi removido do original, e por quê

Listado porque regra importada que ninguém segue ensina que as regras aqui são
decorativas.

| Seção | Por que saiu |
|---|---|
| Worktree por sessão, PR, cleanup (~2.000 palavras) | Uma pessoa, uma sessão, sem revisão por terceiro. Virou o parágrafo "Ramificação", com a condição que traria a seção de volta. |
| Arquitetura services-first | Este é um SPA em camadas, não serviços. A seção "Arquitetura real" descreve o que existe. |
| Fan-out, torneio de variantes, crítico cego | Nunca foi usado aqui, e importar cerimônia não praticada é o pior tipo de regra morta. Se um dia houver trabalho grande o bastante, o arquivo original tem o bloco. |
| Acesso a LLM pelo Claude Code local | Não há LLM dentro deste sistema. O que existe é um pré-prompt copiado para uma IA externa, e um importador que trata a saída como entrada não confiável. |
| Auto-avaliação com nota de 1 a 10 e laço | Substituída pelo que já funciona aqui: o teste é a nota, e o crítico é o dado real. |
| "Sem travessão" e a lista de palavras banidas | Preferência de escrita do autor original, não sua. Se quiser, é uma linha em "Como falar com o Luiz". |
| Jobs de longa duração e backfill | Parcialmente aplicável — as migrações SQL são disso. O essencial está em "O banco é dele": consulta de antes, consulta de depois, teste no dump restaurado. |

**Para outros agentes:** copie este arquivo como `AGENTS.md` (Codex, Cursor) ou
`GEMINI.md`. No Windows, copie em vez de criar link simbólico.
