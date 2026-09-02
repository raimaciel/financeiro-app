import { describe, it, expect } from 'vitest';
import { generateWorkspaceNotifications } from '../../src/utils/notificationGenerator';

describe('notificationGenerator - generateWorkspaceNotifications', () => {
	const fixedDate = new Date(2026, 9, 10); // 10/10/2026

	it('deve gerar notificação de orçamento em alerta quando atingir 80%', () => {
		const notifs = generateWorkspaceNotifications({
			workspaceId: 'ws-1',
			budgets: [
				{ id: 'b1', category_id: 1, monthly_limit: 1000, alert_threshold_percent: 80, category_name: 'Alimentação' },
			],
			expensesByCategory: { 1: 850 },
			currentDate: fixedDate,
		});

		expect(notifs).toHaveLength(1);
		expect(notifs[0].type).toBe('budget_warning');
		expect(notifs[0].severity).toBe('warning');
		expect(notifs[0].title).toContain('Alimentação');
	});

	it('deve gerar notificação de orçamento excedido com severidade danger', () => {
		const notifs = generateWorkspaceNotifications({
			workspaceId: 'ws-1',
			budgets: [
				{ id: 'b2', category_id: 2, monthly_limit: 500, alert_threshold_percent: 80, category_name: 'Lazer' },
			],
			expensesByCategory: { 2: 550 },
			currentDate: fixedDate,
		});

		expect(notifs).toHaveLength(1);
		expect(notifs[0].type).toBe('budget_exceeded');
		expect(notifs[0].severity).toBe('danger');
		expect(notifs[0].message).toContain('ultrapassado');
	});

	it('deve alertar sobre fatura próxima do vencimento (<= 3 dias) quando houver transações reais', () => {
		// Hoje = 10/10/2026. Cartão com closing_day = 5, due_day = 12 (vence em 2 dias: 12/10/2026)
		const notifs = generateWorkspaceNotifications({
			workspaceId: 'ws-1',
			creditCards: [
				{ id: 'c1', name: 'Nubank', closing_day: 5, due_day: 12 },
			],
			cardInvoices: [
				{ credit_card_id: 'c1', reference_month: '2026-09', status: 'paid' },
			],
			transactions: [
				{ credit_card_id: 'c1', amount: 150.0, date: '2026-10-02' },
			],
			currentDate: fixedDate,
		});

		const invoiceNotif = notifs.find((n) => n.type === 'invoice_due_soon');
		expect(invoiceNotif).toBeDefined();
		expect(invoiceNotif?.severity).toBe('warning');
	});

	it('não deve alertar sobre fatura quando não houver compras/transações reais (total 0)', () => {
		const notifs = generateWorkspaceNotifications({
			workspaceId: 'ws-1',
			creditCards: [
				{ id: 'c1', name: 'Nubank', closing_day: 5, due_day: 12 },
			],
			cardInvoices: [],
			transactions: [], // Sem compras
			currentDate: fixedDate,
		});

		const invoiceNotif = notifs.find((n) => n.type === 'invoice_due_soon');
		expect(invoiceNotif).toBeUndefined();
	});

	it('deve alertar sobre meta atingida e meta com prazo próximo', () => {
		const notifs = generateWorkspaceNotifications({
			workspaceId: 'ws-1',
			savingsGoals: [
				{ id: 'g1', name: 'Reserva', target_amount: 1000, current_amount: 1000, status: 'completed' },
				{ id: 'g2', name: 'Viagem', target_amount: 2000, current_amount: 500, target_date: '2026-10-15', status: 'active' },
			],
			currentDate: fixedDate,
		});

		const achieved = notifs.find((n) => n.type === 'goal_achieved');
		const deadline = notifs.find((n) => n.type === 'goal_deadline_near');

		expect(achieved).toBeDefined();
		expect(deadline).toBeDefined();
		expect(deadline?.severity).toBe('warning');
	});

	it('deve gerar lembrete de importação se última transação tem mais de 30 dias', () => {
		const notifs = generateWorkspaceNotifications({
			workspaceId: 'ws-1',
			lastTransactionDate: '2026-08-01', // > 60 dias antes de 10/10/2026
			currentDate: fixedDate,
		});

		const importNotif = notifs.find((n) => n.type === 'import_reminder');
		expect(importNotif).toBeDefined();
		expect(importNotif?.related_link).toBe('/import');
	});
});
