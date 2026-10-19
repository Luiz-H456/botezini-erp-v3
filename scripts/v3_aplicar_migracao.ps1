# =============================================================================
# APLICAR A MIGRACAO NO BANCO NOVO (projeto novo e VAZIO do Supabase)
#
#   1. Crie o projeto novo no Supabase (nada de reaproveitar o de producao).
#   2. Em Connect, copie a conexao "Session pooler" (usuario postgres.<ref>,
#      porta 5432) e guarde na variavel de ambiente, SEM colar em chat:
#         $env:BOTEZINI_NOVO_DB_URI = 'postgresql://postgres.xxxx:SENHA@...pooler.supabase.com:5432/postgres'
#   3. powershell -ExecutionPolicy Bypass -File .\scripts\v3_aplicar_migracao.ps1
#
# TRAVAS (o script se recusa a rodar se...)
#   - BOTEZINI_NOVO_DB_URI nao existir;
#   - for IGUAL a BOTEZINI_DB_URI (a conexao da producao);
#   - o schema public do banco ja tiver qualquer tabela (so entra em banco vazio).
# A URI nunca e impressa. A migracao e uma transacao so: ou tudo, ou nada.
# =============================================================================

param([string]$Arquivo)

$ErrorActionPreference = 'Stop'
$Raiz   = Split-Path -Parent $PSScriptRoot
$Imagem = 'supabase/postgres:17.6.1.167'
if (-not $Arquivo) { $Arquivo = Join-Path $Raiz 'migracao\botezini_v3_migracao.sql' }

function Falhar([string]$Msg) { Write-Host ""; Write-Host "  $Msg" -ForegroundColor Red; exit 1 }

# PowerShell 5.1 nao escapa aspas dentro de argumento de executavel nativo: por isso
# o \" no comando do sh, e o SQL entra por stdin (sem aspas para estragar).
function Invoke-Psql {
    param([string]$Sql, [string]$ArquivoNaPasta)
    $antes = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($ArquivoNaPasta) {
            $cmd = 'psql \"$BOTEZINI_NOVO_DB_URI\" -q -v ON_ERROR_STOP=1 -f /m/' + $ArquivoNaPasta
            & docker run --rm -e BOTEZINI_NOVO_DB_URI -v "${script:Pasta}:/m:ro" $Imagem sh -c $cmd 2>&1
        } else {
            $cmd = 'psql \"$BOTEZINI_NOVO_DB_URI\" -tA -v ON_ERROR_STOP=1 -f -'
            $Sql | & docker run -i --rm -e BOTEZINI_NOVO_DB_URI $Imagem sh -c $cmd 2>&1
        }
    } finally { $ErrorActionPreference = $antes }
}

Write-Host ""
Write-Host "  APLICAR A MIGRACAO NO BANCO NOVO" -ForegroundColor Cyan
Write-Host "  --------------------------------"

if (-not $env:BOTEZINI_NOVO_DB_URI) { Falhar "Defina `$env:BOTEZINI_NOVO_DB_URI com a conexao Session pooler do projeto NOVO." }
if ($env:BOTEZINI_DB_URI -and ($env:BOTEZINI_NOVO_DB_URI -eq $env:BOTEZINI_DB_URI)) { Falhar "Esta e a conexao da PRODUCAO. Recusando." }
if (-not (Test-Path $Arquivo)) { Falhar "Migracao nao encontrada: $Arquivo (rode scripts\v3_montar_migracao.ps1)." }
$script:Pasta = Split-Path -Parent (Resolve-Path $Arquivo)
$Nome = Split-Path -Leaf $Arquivo

& docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Falhar "Docker nao esta respondendo. Abra o Docker Desktop." }

Write-Host "  Conferindo que o banco novo esta vazio..." -ForegroundColor DarkGray
$n = Invoke-Psql -Sql "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'" | Select-Object -Last 1
if ($LASTEXITCODE -ne 0 -or "$n".Trim() -notmatch '^\d+$') { Falhar "Nao consegui conectar no banco novo: $n" }
if ([int]"$n".Trim() -ne 0) { Falhar "O schema public do banco novo ja tem $n tabela(s). So aplico em banco VAZIO. Recusando." }

Write-Host "  Aplicando (pode levar um ou dois minutos)..." -ForegroundColor DarkGray
$saidaPsql = Invoke-Psql -ArquivoNaPasta $Nome
if ($LASTEXITCODE -ne 0) {
    $saidaPsql | Select-Object -Last 15 | ForEach-Object { Write-Host "    $_" }
    Falhar "A migracao falhou e foi desfeita inteira (transacao). O banco novo continua vazio."
}

$consulta = "SELECT 'pedidos ' || (SELECT count(*) FROM public.orders) || ' | orcamentos ' || (SELECT count(*) FROM public.budgets) || ' | clientes ' || (SELECT count(*) FROM public.clients) || ' | insumos ' || (SELECT count(*) FROM public.insumos) || ' | contas financeiras ' || (SELECT count(*) FROM public.financial_obligations) || ' | logins ' || (SELECT count(*) FROM auth.users)"
$contagem = Invoke-Psql -Sql $consulta | Select-Object -Last 1
Write-Host ""
Write-Host "  MIGRACAO APLICADA" -ForegroundColor Green
Write-Host "  $contagem"
Write-Host "  Compare com as contagens do v3_montar_migracao.ps1. Depois rode scripts\v3_conferir_banco.ps1"
Write-Host ""
