#!/bin/sh
# =============================================================================
# MONTAR A CARGA DA V3 — roda DENTRO do contêiner descartável
#
# Chamado pelo scripts/v3_carregar_dump.ps1, depois que o dump de produção foi
# restaurado inteiro no contêiner descartável. Daqui sai um único arquivo,
# /tmp/v3/carga.sql, que o Supabase local da v3 aplica numa transação só.
#
# POR QUE NÃO DESPEJAR O DUMP DIRETO NO SUPABASE LOCAL
#   O dump traz auth, storage, vault e realtime inteiros, e o Supabase local já
#   nasce com os seus — de outra versão. Despejar um por cima do outro é colisão
#   de CREATE SCHEMA e de coluna que só existe de um lado. Então tira-se daqui
#   só o que é da Botezini:
#
#     - o schema public inteiro (tabelas, dados, funções, RLS, permissões);
#     - as contas de login (auth.users e auth.identities), para entrar com o
#       mesmo e-mail e senha;
#     - o bucket de anexos e as regras de acesso dele;
#     - os gatilhos que o sistema pendurou em auth (trg_on_new_user).
#
# A ORDEM IMPORTA
#   Contas antes do public: as chaves estrangeiras para auth.users nascem no fim
#   do public e conferem as linhas que já existem. Regras e gatilhos depois:
#   eles chamam funções que só existem quando o public chegou.
#
# Os arquivos do storage (as fotos e PDFs anexados) NÃO vêm: o dump só tem o
# registro deles, não o conteúdo. Na v3 um anexo antigo aparece listado e não
# abre; anexo novo funciona.
# =============================================================================
set -eu
D=/tmp/v3
rm -rf "$D"; mkdir -p "$D"
PSQL="psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tAq"

# SEM_DONO=1 (migracao para a nuvem): sem OWNER TO — quem aplica vira o dono.
pg_dump -U supabase_admin -d postgres --schema=public ${SEM_DONO:+--no-owner} -f "$D/public.sql"
pg_dump -U supabase_admin -d postgres --data-only --column-inserts \
    -t auth.users -t auth.identities -f "$D/contas.sql"

# O storage local é de outra versão: copiar a linha inteira do bucket quebra em
# coluna nova (versioning_status). Vão só as colunas que as duas têm.
$PSQL > "$D/antes.sql" <<'SQL'
SELECT format('INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES (%L, %L, %L, %s, %L);',
              id, name, public, coalesce(file_size_limit::text, 'NULL'), allowed_mime_types)
  FROM storage.buckets;
-- Extensões que moram no public (pg_trgm): o pg_dump --schema=public não as leva.
SELECT format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA public;', extname)
  FROM pg_extension WHERE extnamespace = 'public'::regnamespace;
SQL

# search_path vazio faz o Postgres escrever os nomes com schema — sem isso o
# gatilho saía chamando handle_new_user() solto, e não acharia a função.
$PSQL > "$D/depois.sql" <<'SQL'
SET search_path = '';
SELECT format('CREATE POLICY %I ON storage.objects AS %s FOR %s TO %s%s%s;',
              policyname, permissive, cmd, array_to_string(roles, ', '),
              coalesce(' USING (' || qual || ')', ''),
              coalesce(' WITH CHECK (' || with_check || ')', ''))
  FROM pg_catalog.pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';
SELECT pg_catalog.pg_get_triggerdef(t.oid) || ';'
  FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
 WHERE NOT t.tgisinternal AND c.relnamespace = 'auth'::regnamespace;
SQL

# \restrict é um meta-comando do pg_dump 17.6+ que amarra o arquivo à sessão
# que o gerou; dentro de uma carga montada ele só atrapalha.
sem_restrict() { grep -v -e '^\\restrict' -e '^\\unrestrict' "$1"; }

# Na nuvem o postgres nao pode mexer nos privilegios padrao do supabase_admin (e o
# projeto novo ja nasce com eles): so no modo SEM_DONO essas linhas saem.
sem_padroes_do_admin() {
    if [ -n "${SEM_DONO:-}" ]; then grep -v '^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin'; else cat; fi
}

{
    echo 'BEGIN;'
    sem_restrict "$D/contas.sql"
    cat "$D/antes.sql"
    sem_restrict "$D/public.sql" | sed 's/^CREATE SCHEMA public;$/CREATE SCHEMA IF NOT EXISTS public;/' | sem_padroes_do_admin
    cat "$D/depois.sql"
    echo "NOTIFY pgrst, 'reload schema';"
    echo 'COMMIT;'
} > "$D/carga.sql"

echo "carga montada: $(wc -c < "$D/carga.sql") bytes"
