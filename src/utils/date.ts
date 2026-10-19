
/**
 * Standalone date utility to avoid heavy dependencies (like Zod) during testing.
 */

export const getNow = () => new Date();

export const getTodayStr = (referenceDate: Date = getNow()) => {
  const y = referenceDate.getFullYear();
  const m = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const d = String(referenceDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
