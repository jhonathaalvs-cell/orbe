# Integração Firebase

O cliente inicializa Firebase App, Authentication e Cloud Firestore com módulos ES da CDN oficial. Não há chaves privadas no navegador.

## Configuração

Os valores públicos do app web ficam em `src/services/firebase/firebase-config.js`, incluído no repositório para permitir a execução como site estático. `firebase-config.example.js` documenta os campos. A API key web identifica o projeto; sem usuário autenticado e sem passar pelas regras ela não dá acesso a dados.

## Onde fica cada coisa em `src/services/`

| Arquivo | Responsabilidade |
|---|---|
| `firebase/client.js` | inicialização única (`auth`, `db`, `firebaseReady`) |
| `firebase/errors.js` | traduz erros do Firebase em mensagens para a tela |
| `firebase/firebase.js` | ponto único de importação usado pelas páginas |
| `auth/auth.js` | login, cadastro, logout, redefinição de senha |
| `database/*.js` | um arquivo por domínio: transactions, accounts (e transferências), goals, cards, commitments, notifications, profile |

## Dados e regras

- Provedor: e-mail e senha. Perfil em `users/{uid}`.
- Esquema completo em [banco-de-dados.md](banco-de-dados.md).
- As regras negam acesso anônimo, limitam tudo ao `uid` dono do caminho e validam os campos escritos. Movimentações não podem ser editadas nem apagadas até existir trilha de auditoria.
- Pagar compromisso e pagar fatura gravam o vencimento/fatura e a despesa na mesma operação. O sistema nunca confirma pagamento pelo usuário.
- Qualquer outro caminho permanece negado.

## Ativação

Ative Email/Password em Authentication, crie o Cloud Firestore e publique regras e funções:

```text
firebase deploy --only firestore:rules,firestore:indexes,functions --project orbe-5fa05
```

Requer Node.js 22 e Firebase CLI. A função agendada roda de hora em hora e executa os lembretes às 08:00 no fuso de cada pessoa; Cloud Scheduler pode exigir o plano Blaze. Sirva o app por localhost/HTTPS; módulos não funcionam em `file://`.

Para publicar o site: `firebase deploy --only hosting`. O arquivo `firebase.json` deixa de fora do site as regras, a pasta `functions/` e os documentos.

Analytics ficou fora da inicialização: não é necessário para login nem Firestore e exige atenção a consentimento e privacidade.
