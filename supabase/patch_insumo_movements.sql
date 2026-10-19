-- =============================================================================
-- PATCH: INSUMO MOVEMENTS TRIGGER
-- Updates current_stock and average_unit_cost on insumos when a movement occurs.
-- =============================================================================

CREATE OR REPLACE FUNCTION update_insumo_stock_and_cost()
RETURNS trigger AS $$
DECLARE
  v_insumo record;
  v_new_qty numeric;
  v_new_cost numeric;
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Movement quantity must be positive';
  END IF;

  -- Bloquear o registro de insumo para evitar race conditions
  SELECT * INTO v_insumo FROM insumos WHERE id = NEW.insumo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insumo not found';
  END IF;

  IF NEW.type = 'IN' THEN
    IF NEW.unit_cost IS NULL OR NEW.unit_cost <= 0 THEN
      RAISE EXCEPTION 'Unit cost must be positive for stock entry';
    END IF;

    -- Entrada: Soma estoque e recalcula custo médio
    v_new_qty := v_insumo.current_stock + NEW.quantity;
    
    IF v_new_qty > 0 THEN
      -- Média Ponderada
      v_new_cost := ((v_insumo.current_stock * v_insumo.average_unit_cost) + (NEW.quantity * NEW.unit_cost)) / v_new_qty;
    ELSE
      v_new_cost := NEW.unit_cost;
    END IF;

    -- Preenche campos vazios no NEW para consistência (Opcional)
    IF NEW.total_cost IS NULL THEN
      NEW.total_cost := NEW.quantity * NEW.unit_cost;
    END IF;

  ELSIF NEW.type = 'OUT' THEN
    IF v_insumo.current_stock < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for insumo %', NEW.insumo_id;
    END IF;

    -- Saída: Subtrai estoque, custo unitário é mantido como o custo médio atual
    v_new_qty := v_insumo.current_stock - NEW.quantity;
    v_new_cost := v_insumo.average_unit_cost;

    -- A saída sempre usa o custo médio atual para o cálculo do total_cost
    NEW.unit_cost := v_insumo.average_unit_cost;
    NEW.total_cost := NEW.quantity * v_insumo.average_unit_cost;
    
  ELSE
    RAISE EXCEPTION 'Invalid movement type. Must be IN or OUT.';
  END IF;

  -- Atualiza o insumo
  UPDATE insumos
  SET current_stock = v_new_qty,
      average_unit_cost = v_new_cost,
      updated_at = NOW()
  WHERE id = NEW.insumo_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_insumo_movements_after_insert ON insumo_movements;
CREATE TRIGGER trg_insumo_movements_after_insert
  BEFORE INSERT ON insumo_movements
  FOR EACH ROW EXECUTE FUNCTION update_insumo_stock_and_cost();
