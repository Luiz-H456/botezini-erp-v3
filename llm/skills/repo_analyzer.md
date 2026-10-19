# Skill: Repo Analyzer

**Description:**
Analyzes the repository structure, detects technical debt, and updates documentation.

**Instructions:**
1. Scan the repository root, `/src` structure, and `/supabase/migrations`.
2. Identify the core architecture, libraries used, and main flows.
3. Highlight technical debt (e.g., files > 800 lines, duplicate logic, unused dependencies).
4. Generate or update `docs/APP_ARCHITECTURE.md` using the rules in `llm/DOC_AUTOMATION.md`.
5. Only update the sections that changed; do not overwrite the entire document from scratch if it already exists.
