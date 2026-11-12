# Projeto Orbe

Plataforma web responsiva de organização financeira pessoal e familiar, preparada para instalação como PWA. O documento funcional integral recebido está reproduzido em `projeto-original.txt` e resumido em `requisitos.md`.

## Princípios

- Planejado não significa realizado; pagamento e depósito exigem registro ou confirmação válida.
- Transferências entre contas não são receita ou despesa.
- Compra no cartão e liquidação da fatura não podem duplicar a despesa.
- Dados pessoais e familiares devem permanecer separados e respeitar permissões.
- Previsões são estimativas; avaliações anteriores precisam preservar seu conteúdo.

## Decisões

- Frontend estático (HTML, CSS e módulos ES), sem etapa de build.
- Firebase Authentication e Cloud Firestore guardam os dados; os números do painel vêm dos registros de cada usuário.
- Cloud Functions cuidam do que não pode depender do navegador (vencimentos e lembretes).
- Nenhuma chave privada vai para o navegador; a proteção dos dados está em `firestore.rules`.
