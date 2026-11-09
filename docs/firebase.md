# Integração Firebase

O cliente inicializa Firebase App, Authentication e Cloud Firestore com módulos ES importados da CDN oficial. Não é necessário colocar chaves privadas no navegador.

## Configuração local

Os valores do app web ficam em `src/services/firebase/firebase-config.local.js`, ignorado pelo Git. O arquivo `firebase-config.local.example.js` documenta os campos esperados. O ID e a API key web identificam o projeto no cliente; não concedem acesso ao Firestore sem usuário autenticado e regras de segurança.

## Autenticação e dados

- Provedor: e-mail e senha.
- Perfil criado em `users/{uid}`.
- Perfil com nome, moeda base, fuso horário e preferências dos lembretes.
- Movimentações salvas em `users/{uid}/transactions/{transactionId}`.
- Compromissos em `users/{uid}/commitments/{commitmentId}` e vencimentos em `occurrences/{YYYY-MM-DD}`.
- Lembretes internos em `users/{uid}/notifications/{notificationId}` com IDs determinísticos para evitar duplicidade.
- Regras negam o acesso anônimo, limitam o acesso ao `uid` autenticado e validam os campos escritos. Edição/exclusão de movimentações fica bloqueada até haver trilha de auditoria.
- Confirmar pagamento atualiza o vencimento e cria a despesa atomicamente. O sistema nunca confirma pagamento pelo usuário.
- Todas as outras coleções permanecem negadas até serem implementadas com regras próprias.

## Ativação no Console

Ative Email/Password em Authentication, crie o Cloud Firestore e publique `firestore.rules`. Para habilitar a automação, instale Node.js 22 e Firebase CLI e publique `firebase deploy --only firestore:rules,functions --project orbe-5fa05`. A função verifica os perfis de hora em hora e executa os lembretes às 08:00 no fuso de cada pessoa. Funções agendadas usam Cloud Scheduler e podem exigir o plano Blaze. Use localhost/HTTPS para servir o app; módulos não funcionam em `file://`.

Analytics foi omitido da inicialização: não é necessário para login ou Firestore e pode ser ligado depois com atenção a consentimento, privacidade e compatibilidade do navegador.
