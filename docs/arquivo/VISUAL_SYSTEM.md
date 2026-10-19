# Sistema Visual: Botezini Premium (V2)

Este documento define os tokens de design e a linguagem visual que deve ser aplicada em todo o ERP Botezini, tomando como referência o módulo de **Finanças**.

## 1. Paleta de Cores (Zinc & Gold)

| Elemento | Token Tailwind | Hex | Uso |
| :--- | :--- | :--- | :--- |
| **Background Principal** | `bg-zinc-950` | #09090b | Fundo base da aplicação. |
| **Cards & Containers** | `bg-zinc-900` | #18181b | Superfícies secundárias (cards, sidebars). |
| **Bordas** | `border-zinc-800` | #27272a | Divisores e contornos de cards. |
| **Accent Primary (Gold)** | `text-amber-500` | #f59e0b | Interatividade, status premium, destaque. |
| **Accent Success** | `text-emerald-500` | #10b981 | Receitas, concluídos, positivo. |
| **Accent Danger** | `text-rose-500` | #f43f5e | Despesas, atrasos, crítico. |
| **Texto Primário** | `text-white` | #ffffff | Títulos e valores importantes. |
| **Texto Secundário** | `text-zinc-400` | #a1a1aa | Parágrafos e descrições. |
| **Texto Terciário (Labels)** | `text-zinc-500/60`| - | Metadados, labels de campos. |

## 2. Tipografia e Pesos

- **Títulos de Seção**: `font-black uppercase tracking-widest text-[11px] text-zinc-500`
- **Valores Monetários/IDs**: `font-mono font-bold`
- **Corpo de Texto**: `font-medium text-sm`
- **Labels de Status/Badges**: `font-black uppercase text-[8px] tracking-wider`

## 3. Formas e Efeitos

- **Bordas Arredondadas**: 
  - Cards: `rounded-xl` ou `rounded-2xl`
  - Inputs/Botões: `rounded-lg`
  - Badges: `rounded` (pequeno)
- **Efeitos**:
  - Glassmorphism: `bg-zinc-900/60 backdrop-blur-md`
  - Sombras: `shadow-xl shadow-black/20`
  - Hover: `hover:border-zinc-600 transition-all duration-200`

## 4. Componentes Padronizados (a serem replicados)

1. **PremiumCard**: Fundo `zinc-900`, borda `zinc-800`, `rounded-xl`, hover com destaque na borda.
2. **StatusBadge**: Borda fina, fundo transparente (mais escuro que o texto), texto em `uppercase font-black`.
3. **GhostButton**: Botão apenas com borda `zinc-800` e texto `zinc-500`, que ganha vida (cor) no hover.
4. **MiniStats**: Informações densas, usando tipografia pequena e pesos pesados.
