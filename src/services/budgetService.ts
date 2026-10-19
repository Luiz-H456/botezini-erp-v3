import { BudgetItem, BudgetCustomization, BudgetExtra } from '../types';
import { round2 } from '../utils';

export const budgetService = {
  calculateTotals: (
    items: BudgetItem[],
    customizations: BudgetCustomization[],
    extras: BudgetExtra[],
    discount: number
  ) => {
    const subtotal_items = round2(items.reduce((acc, i) => acc + i.total, 0));
    const subtotalCustom = round2(customizations.reduce((acc, c) => acc + c.total, 0));
    const subtotal_extras = round2(extras.reduce((acc, e) => acc + e.total, 0));

    const grossTotal = round2(subtotal_items + subtotalCustom + subtotal_extras);
    const total_amount = round2(Math.max(0, grossTotal - discount));

    return {
      subtotal_items,
      subtotalCustom,
      subtotal_extras,
      total_amount
    };
  },

  calculatePayments: (total_amount: number, down_payment_percent: number) => {
    const down_payment_value = round2(total_amount * (down_payment_percent / 100));
    const delivery_payment_value = round2(total_amount - down_payment_value);
    return { down_payment_value, delivery_payment_value };
  }
};