-- =============================================================================
-- CORRIGIR O CUSTO DO BRIM LEVE CEDROPAC — PADRÃO (bancos já migrados)
--
-- A limpeza de 15/10 juntou o "BRIM CEDRO" (custo médio R$ 29,00/m no backup de produção
-- de 16/10) ao "Brim Leve Cedropac — Padrão", que tinha custo zero, e o custo se perdeu.
-- Efeito: o lucro por pedido mostra o material desses pedidos como incompleto.
-- A limpeza já foi corrigida para as próximas migrações; este arquivo conserta o banco
-- que já recebeu a migração. Só mexe se o custo ainda for zero: rodar de novo não muda nada.
-- =============================================================================

-- ANTES (somente leitura)
SELECT 'antes' AS momento, name, unit, average_unit_cost FROM public.insumos WHERE name = 'Brim Leve Cedropac — Padrão';

UPDATE public.insumos
   SET average_unit_cost = 29.00, updated_at = now()
 WHERE name = 'Brim Leve Cedropac — Padrão' AND coalesce(average_unit_cost, 0) = 0;

-- DEPOIS (somente leitura)
SELECT 'depois' AS momento, name, unit, average_unit_cost FROM public.insumos WHERE name = 'Brim Leve Cedropac — Padrão';
