# Modelo de dados (Cloud Firestore)

Tudo fica dentro de `users/{uid}`; as regras (`firestore.rules`) só liberam o acesso ao próprio dono e validam cada campo. Coleções marcadas com (CF) só são escritas pela Cloud Function.

## Implementado

| Caminho | Conteúdo | Observações |
|---|---|---|
| `users/{uid}` | nome, e-mail, moeda, fuso, `notificationPreferences` | criado no cadastro; sem listagem |
| `…/transactions/{id}` | `type` (income/expense), `description`, `amount`, `category`, `date`, `accountId`, `createdAt` | imutável depois de criada. Campos extras só em pagamentos: `sourceCommitmentId`/`sourceOccurrenceId` (compromisso) e `sourceCardId`/`sourceInvoiceMonth` (fatura) |
| `…/accounts/{id}` | `name`, `type`, `openingBalance`, `openingDate`, `active` | só `name` e `active` podem mudar |
| `…/transfers/{id}` | origem, destino, `amount`, `description`, `date` | não conta como receita nem despesa |
| `…/commitments/{id}` | `name`, `amount`, `category`, `frequency`, `startDate`, `endDate`, `active` | nasce junto com a primeira ocorrência |
| `…/commitments/{id}/occurrences/{AAAA-MM-DD}` | `dueDate`, `status` (pending/paid/skipped), `paidAt`, `transactionId` | pagar cria a despesa na mesma operação |
| `…/notifications/{id}` (CF) | lembretes internos | o cliente só marca `read` |
| `…/goals/{id}` e `…/deposits/{id}` | meta, valor alvo, histórico de alvo; depósitos | depósitos declarados, não provam transferência |
| `…/creditCards/{id}` | `name`, `brand`, `lastFour`, `creditLimit`, `closingDay`, `dueDay`, `active` | |
| `…/creditCards/{id}/purchases/{id}` | compra ou parcela, `invoiceMonth`, `dueDate` | criada junto com a atualização da fatura |
| `…/creditCards/{id}/invoices/{AAAA-MM}` | `total`, `purchaseCount`, `status` (open/paid), dados do pagamento | o total só cresce com uma compra gravada na mesma operação |

## Previsto (ainda sem regras)

Famílias e integrantes, convites, categorias, dívidas e parcelas, avaliações e trilha de auditoria. Antes de implementar cada uma: definir proprietário, escopo pessoal/familiar, validações, índices e regras. Saldo é calculado a partir de movimentos válidos e nunca mistura planejado com realizado.
