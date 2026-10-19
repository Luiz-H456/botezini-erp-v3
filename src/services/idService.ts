
import { supabase } from './supabase';
import { getNow } from '../utils';

export const idService = {
  /**
   * Gera um UUID v4 padrão com fallback para ambientes inseguros.
   * Corrige o erro "crypto.randomUUID is not a function".
   */
  generateUUID: (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    
    // Fallback compatível com todos os browsers (RFC4122)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  /**
   * Gera o próximo ID sequencial baseado no último registro do banco de dados.
   * Formato: PREFIXO-ANO-NNN (ex: ORC-BZ-2026-001)
   * 
   * @param type 'budget' | 'order'
   */
  getNextSequence: async (type: 'budget' | 'order'): Promise<string> => {
    const now = getNow();
    const year = now.getFullYear();
    const prefix = type === 'budget' ? 'ORC-BZ' : 'PED-BZ';
    
    // Fallback immediately if not configured to prevent fetch error
    if (!supabase) {
        return `${prefix}-${year}-${Date.now().toString().slice(-3)}`;
    }
    
    const table = type === 'budget' ? 'budgets' : 'orders';
    const column = type === 'budget' ? 'serial_number' : 'order_number';
    
    const searchPattern = `${prefix}-${year}-%`;

    try {
      const { data, error } = await supabase
        .from(table)
        .select(column)
        .ilike(column, searchPattern)
        .order(column, { ascending: false }) 
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('Erro ao buscar sequência:', error.message);
      }

      let nextNum = 1;

      if (data) {
        const currentId = (data as any)[column] as string;
        const parts = currentId.split('-');
        if (parts.length >= 3) {
           const lastNumStr = parts[parts.length - 1];
           const lastNum = parseInt(lastNumStr, 10);
           if (!isNaN(lastNum)) {
             nextNum = lastNum + 1;
           }
        }
      }

      return `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`;

    } catch (err) {
      console.error('Falha crítica ao gerar ID sequencial, usando fallback de timestamp.', err);
      return `${prefix}-${year}-${Date.now().toString().slice(-3)}`;
    }
  }
};
