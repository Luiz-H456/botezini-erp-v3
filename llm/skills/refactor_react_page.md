# Skill: Refactor React Page

**Description:**
Refactors large React files (> 800 lines) into smaller, maintainable, modular components.

**Instructions:**
1. Analyze the target `.tsx` file (e.g., `Finance.tsx` or `Dashboard.tsx`).
2. Identify independent functional UI blocks (e.g., Modals, Charts, Sidebar filters, Forms).
3. Propose a plan to extract these blocks into separate files (e.g., `FinanceComponents.tsx`, `FinanceModals.tsx`).
4. Ensure shared state (Zustand or React Context) is properly managed or passed as standard React props.
5. Extract types/interfaces to a shared type file if they are used across multiple extracted components.
6. Verify imports and dependencies.
7. Always check that the resulting files are under 300-400 lines for readability.
