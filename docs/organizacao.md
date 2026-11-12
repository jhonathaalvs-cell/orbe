# Organização do projeto

## Padrões

- Pastas e arquivos de código em inglês, em minúsculas e com hífen. O texto das telas continua em português.
- Uma pasta por tela em `src/pages/`, com `index.html` (marcação) e um `.js` de mesmo nome (comportamento).
- O que serve a mais de uma tela fica em `src/utils/`; o acesso ao Firestore fica só em `src/services/`.
- As chaves `data-page` do menu (`inicio`, `contas`, `compromissos`, `metas`, `cartoes`, `perfil`) são identificadores de rota, não nomes de pasta.
- Arquivos de texto em UTF-8, sem BOM, com fim de linha LF (`.gitattributes`).
- Pasta nova só entra no repositório quando tem arquivo real.

## Mapa antigo → novo

| Antes | Agora |
|---|---|
| `src/pages/contas/` | `src/pages/accounts/` |
| `src/pages/compromissos/` | `src/pages/commitments/` |
| `src/pages/cartoes/` | `src/pages/cards/` |
| `src/pages/metas/` | `src/pages/goals/` |
| `src/pages/perfil/` | `src/pages/profile/` |
| `src/styles/base.css`, `layout.css`, `responsive.css` | `src/styles/core/` |
| `src/styles/components.css`, `dialogs.css`, `sidebar-nav.css`, `mobile-nav.css` | `src/styles/components/` |
| `src/styles/auth.css`, `dashboard.css`, `accounts.css`, `commitments.css`, `goals.css`, `cards.css`, `profile.css` | `src/styles/pages/` |
| `src/services/firebase/firebase.js` (454 linhas) | dividido em `firebase/client.js`, `firebase/errors.js`, `auth/auth.js` e `database/*.js`; `firebase/firebase.js` re-exporta tudo |
| `escapeHtml`, `todayKey`, toast e formatação de moeda repetidos em 5 páginas | `src/utils/dom.js`, `date.js`, `toast.js`, `format.js` |
| `functions/src/index.js` único | `schedules/`, `financial/`, `notifications/` e `lib/` |
| `firebase-config.local.js`, `firebase-config.local.example.js`, `config.js` | removidos / renomeado para `firebase-config.example.js` |
| mais de 25 pastas vazias com `.gitkeep` | removidas |

## Fora do escopo desta organização (decisões pendentes)

- Os CSS não tiveram o conteúdo alterado. `pages/dashboard.css` também estiliza contas, compromissos, metas e cartões; separar o que é compartilhado muda a cascata e exige conferência visual.
- `public/service-worker.js` não controla o app (o escopo dele é `/public/`). Ativá-lo exige estratégia de atualização do cache para não servir código velho.
- Faltam testes das regras no emulador do Firestore.

## Correções feitas junto com a reorganização

- **Dashboard travado em "Não foi possível carregar seus dados financeiros"**: o `dashboard.js` procurava um `.form-note` dentro do formulário de movimentação, que deixou de existir na v2.4. O erro acontecia a cada carga, antes de desenhar saldo, gráfico, metas e compromissos. O campo de conta agora entra antes do campo de cartão.
- **Falhas de leitura isoladas**: cada leitura do dashboard é independente e falhas aparecem no console com o código do erro.
- **Cartão de crédito conta como despesa no mês da compra** (decisão: opção A). O pagamento da fatura só baixa o saldo.
- **Segunda compra na mesma fatura**: a gravação perdia o `createdAt` da fatura e a regra negava. Agora ele é preservado.
- **Regra de `transactions`**: descrição até 80 caracteres, igual ao nome do compromisso que o pagamento copia.
- **Textos com acento quebrado** em `main.js`, limite de parcelas na mensagem (48 → 10) e nome do arquivo de configuração nas mensagens.
