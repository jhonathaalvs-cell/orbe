# Modelo de dados inicial (conceitual)

| Coleção | Uso |
|---|---|
| users | Perfil, preferências e moeda do usuário |
| families / familyMembers / invitations | Grupos, permissões e convites |
| accounts / categories / transactions | Contas, categorias e registros efetivados |
| commitments / commitmentOccurrences | Regras recorrentes e vencimentos confirmáveis |
| debts / installments | Contratos e histórico de parcelas |
| cards / invoices / installmentPurchases | Cartões, faturas e compras parceladas |
| goals / goalMovements | Metas e depósitos, retiradas ou ajustes registrados |
| notifications / devices | Histórico interno e tokens de dispositivos |
| evaluations / audit | Avaliações preservadas e eventos auditáveis |

Este modelo ainda não autoriza operações. Antes de conectar o Firestore, definir IDs, proprietário, escopo pessoal/familiar, validações, índices e regras de segurança por coleção. Saldo deve ser calculado a partir de movimentos válidos e nunca misturar planejado com realizado.
