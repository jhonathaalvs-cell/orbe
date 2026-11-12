# Orbe — Gestão financeira pessoal e familiar

Plataforma web responsiva de organização financeira, descrita em `docs/projeto.md` e especificada integralmente em `docs/projeto-original.txt`. Frontend estático com módulos ES; dados e login em Firebase (Authentication e Cloud Firestore); rotinas agendadas em Cloud Functions.

## Iniciar

Sirva a pasta por HTTP em localhost (por exemplo, com a extensão Live Server do VS Code) e abra a URL local. Os módulos não funcionam ao abrir via `file://`. Não há etapa de build.

## Firebase

1. A configuração pública do app web fica em `src/services/firebase/firebase-config.js`. Ela não contém chave privada; os dados são protegidos por `firestore.rules`.
2. No Firebase Console, ative **Authentication → Email/Password** e crie o **Cloud Firestore**.
3. Instale Node.js 22 e o Firebase CLI, rode `firebase login` e `npm install` dentro de `functions/`.
4. Na raiz, publique: `firebase deploy --only firestore:rules,firestore:indexes,functions --project orbe-5fa05`.
5. Cadastre uma conta e use o app. Detalhes em [docs/firebase.md](docs/firebase.md).

## O que já funciona

- Cadastro, login, perfil (nome, moeda, fuso, lembretes) e redefinição de senha.
- Dashboard com saldo, receitas, despesas, fluxo e movimentações calculados dos seus registros.
- Contas e carteiras, com transferências.
- Compromissos recorrentes, vencimentos e confirmação de pagamento sem duplicar despesa.
- Cartões de crédito: compras, parcelamento e faturas. A compra conta como despesa na data da compra; pagar a fatura baixa o saldo da conta.
- Metas com depósitos e análise de prazo.
- Função agendada que gera vencimentos e lembretes internos (precisa ser publicada).

Ainda não: famílias, dívidas, calendário, relatórios, avaliações e push. Veja [docs/roadmap.md](docs/roadmap.md).

## Estrutura

```text
index.html                entrada do app
firebase.json             hosting, regras, índices e functions
firestore.rules           regras de segurança do Firestore
firestore.indexes.json    índices compostos (vazio por enquanto)
public/                   manifest, ícone e service worker
src/app/                  main.js (rotas e navegação) e page-styles.js
src/pages/<tela>/         index.html + <tela>.js
                          login, dashboard, profile, accounts, commitments, goals, cards
src/services/
  firebase/               client.js, errors.js, firebase-config.js e firebase.js (ponto único de importação)
  auth/                   login, cadastro, logout
  database/               um arquivo por domínio do Firestore
src/utils/                date.js, dom.js, format.js, toast.js
src/styles/               main.css + core/, components/ e pages/
functions/src/            index.js, schedules/, financial/, notifications/, lib/
docs/                     requisitos, modelo de dados, regras financeiras, roadmap e organização
```

Convenções e o mapa de pastas antigas para as novas estão em [docs/organizacao.md](docs/organizacao.md).
