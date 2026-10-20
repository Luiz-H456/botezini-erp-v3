# =============================================================================
# CONFERIR UM BANCO DA V3 - SOMENTE LEITURA
#
#   .\scripts\v3_conferir_banco.ps1 -Alvo nuvem    # o banco novo (BOTEZINI_NOVO_DB_URI)
#   .\scripts\v3_conferir_banco.ps1 -Alvo local    # o Supabase local da v3
#
# Roda supabase\conferir_banco_novo.sql com a sessao em modo so-leitura. A URI nunca e
# impressa; recusa a conexao da producao.
# =============================================================================
param([ValidateSet('nuvem', 'local')][string]$Alvo = 'nuvem', [string]$Arquivo = 'supabase\conferir_banco_novo.sql')

$ErrorActionPreference = 'Stop'
$Raiz   = Split-Path -Parent $PSScriptRoot
$Sql    = Get-Content -Raw -Encoding UTF8 (Join-Path $Raiz $Arquivo)
$Imagem = 'supabase/postgres:17.6.1.167'
$antes  = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    if ($Alvo -eq 'local') {
        $Sql | & docker exec -i -e PGPASSWORD=postgres -e PGOPTIONS='-c default_transaction_read_only=on' supabase_db_botezini-v3 psql -h 127.0.0.1 -U supabase_admin -d postgres -tA -F '|' -f - 2>&1
    } else {
        # O perfil (variavel de usuario) e a fonte da verdade: o processo pode ter herdado um valor
        # velho de quando foi aberto (foi assim que a conferencia de 20/10 bateu em Oregon pausado).
        $doPerfil = [Environment]::GetEnvironmentVariable('BOTEZINI_NOVO_DB_URI', 'User')
        if ($doPerfil) { $env:BOTEZINI_NOVO_DB_URI = $doPerfil }
        if (-not $env:BOTEZINI_NOVO_DB_URI) { Write-Host 'BOTEZINI_NOVO_DB_URI nao definida.' -ForegroundColor Red; exit 1 }
        $prod = [Environment]::GetEnvironmentVariable('BOTEZINI_DB_URI', 'User')
        if ($prod -and $env:BOTEZINI_NOVO_DB_URI -eq $prod) { Write-Host 'Esta e a conexao da PRODUCAO. Recusando.' -ForegroundColor Red; exit 1 }
        $env:PGOPTIONS = '-c default_transaction_read_only=on'
        # \" : o PowerShell 5.1 nao escapa aspas dentro de argumento de executavel nativo.
        $cmd = 'psql \"$BOTEZINI_NOVO_DB_URI\" -tA -F \"|\" -v ON_ERROR_STOP=1 -f -'
        $Sql | & docker run -i --rm -e BOTEZINI_NOVO_DB_URI -e PGOPTIONS $Imagem sh -c $cmd 2>&1
    }
} finally { $ErrorActionPreference = $antes }
