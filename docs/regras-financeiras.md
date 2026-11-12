# Regras financeiras

- Uma previsão, compromisso ou parcela pendente não altera o saldo realizado.
- Uma confirmação de pagamento deve guardar data, origem e responsável.
- Uma transferência deve ter origem e destino e não afeta totais de receita/despesa.
- Compra no cartão entra como despesa na data da compra (dashboard, gráfico e movimentações). O saldo da conta não muda nesse momento.
- O pagamento da fatura baixa o saldo da conta e é gravado como movimentação com `sourceCardId`; essa movimentação não entra nos totais de despesa, para não contar a compra duas vezes.
- Compra parcelada conta cada parcela na data da compra (o valor total cai no mês da compra).
- Depósitos de meta registram intenção/movimentação declarada e não provam transferência bancária.
- Saldo registrado, saldo previsto e saldo devedor são indicadores distintos.
- Mudanças relevantes devem guardar trilha de auditoria e avaliações passadas são imutáveis.
- Escopo e permissão familiar devem ser verificados no backend e nas regras do banco.
