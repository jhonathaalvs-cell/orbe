# Orbe — Gestão financeira pessoal e familiar

Primeira base da plataforma descrita em `docs/projeto.md` e especificada integralmente em `docs/projeto-original.txt`. A autenticação por e-mail/senha e os dados financeiros usam Firebase via módulos CDN. O resumo e as movimentações são reais; metas e módulos ainda não implementados permanecem demonstrativos.

## Iniciar

Sirva a pasta por HTTP em localhost (por exemplo, com a extensão Live Server do VS Code) e abra a URL local. Os módulos Firebase não funcionam ao abrir diretamente via `file://`. Este ambiente não tem Node.js/npm instalado.

## Firebase

1. A configuração recebida está em `src/services/firebase/firebase-config.local.js`, arquivo ignorado pelo Git. Ele contém a configuração pública do app web, não uma chave privada.
2. No Firebase Console, ative **Authentication → Email/Password** e crie a base do **Cloud Firestore**.
3. Publique as regras atualizadas de `firestore.rules` pelo Firebase Console ou Firebase CLI.
4. Instale Node.js 22 e Firebase CLI, autentique com `firebase login`, rode `npm install` dentro de `functions/` e, na raiz, publique com `firebase deploy --only firestore:rules,functions --project orbe-5fa05`.
5. Inicie em localhost. Cadastre uma conta. Compromissos geram ocorrências e lembretes; pagamentos entram no histórico apenas quando você confirma.

As regras concedem acesso somente ao usuário autenticado dono do caminho e validam os campos das movimentações. Nunca use credenciais de conta de serviço no navegador. Veja [docs/firebase.md](docs/firebase.md) para detalhes.

A automação agendada usa Cloud Scheduler e pode exigir o plano Blaze/billing habilitado no projeto.

## O que está nesta primeira entrega

- Dashboard responsivo com saldo e fluxo calculados dos seus registros.
- Navegação pelos módulos previstos, identificando os módulos que ainda serão desenvolvidos.
- Cadastro e login com Firebase Authentication.
- Movimentações por usuário no Cloud Firestore, protegidas por regras.
- Compromissos recorrentes, vencimentos e confirmação de pagamento sem duplicar despesa.
- Função agendada idempotente para gerar ocorrências e lembretes internos.
- Página de perfil separada com preferências e redefinição de senha.
- Manifest e service worker iniciais para o shell da aplicação.
- Estrutura organizada para evoluir o frontend, serviços e backend Firebase.

## Estrutura

```text
public/                  arquivos públicos, manifest, logo e service worker
src/app/                  entrada e roteamento da aplicação
src/pages/auth/           login e cadastro
src/pages/dashboard/      dashboard e interações financeiras
src/pages/profile/        perfil do usuário e preferências
src/assets/               imagens e demais ativos da interface
src/components/           componentes de layout, formulários, gráficos e tabelas
src/config/               configuração da aplicação
src/hooks/                hooks de interface
src/pages/                páginas por módulo
src/services/             integração Firebase, auth e dados
src/styles/               base global e estilos por rota: layout, componentes, painel, modais, login e perfil
src/utils/                formatação e funções auxiliares
functions/src/            rotinas de backend futuras
docs/                     requisitos, dados, regras e roadmap
```

## Próximas etapas

1. Implementar contas, categorias e relatórios completos.
2. Completar notificações push e preferências.
3. Entregar os módulos familiar, cartões, dívidas e metas por etapas.

Resumo, transações e compromissos usam Firestore. A automação de lembretes depende da implantação da Cloud Function; ela verifica os perfis de hora em hora e respeita o fuso escolhido. Metas ainda são demonstrativas; notificações são internas, sem push.
