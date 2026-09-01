-- Adicionar coluna installment_group_id para agrupar parcelas de uma mesma transação
ALTER TABLE transactions ADD COLUMN installment_group_id TEXT;
