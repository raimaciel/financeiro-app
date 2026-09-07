import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import type { Bindings, Variables } from '../auth';

const goalsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

goalsRouter.use('*', authMiddleware);

async function getWorkspaceMemberRole(db: D1Database, workspaceId: string, userId: string): Promise<string | null> {
	const member = await db
		.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
		.bind(workspaceId, userId)
		.first<{ role: string }>();

	return member ? member.role : null;
}

// 1. GET /workspaces/:workspaceId/goals - Listar metas financeiras com cálculo de progresso
goalsRouter.get('/workspaces/:workspaceId/goals', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role) {
			return c.json({ error: 'Acesso negado. Você não é membro deste workspace' }, 403);
		}

		let goalsList: any[] = [];
		try {
			const goalsResult = await db
				.prepare(`
					SELECT 
						g.*,
						ba.name AS account_name,
						ba.color AS account_color,
						ba.bank_name AS account_bank_name
					FROM financial_goals g
					LEFT JOIN bank_accounts ba ON g.account_id = ba.id
					WHERE g.workspace_id = ?
					ORDER BY 
						CASE WHEN g.status = 'active' THEN 1 WHEN g.status = 'completed' THEN 2 ELSE 3 END,
						g.created_at DESC
				`)
				.bind(workspaceId)
				.all<any>();

			goalsList = goalsResult.results || [];
		} catch {
			// Fallback caso a tabela savings_goals seja usada
			const fallbackResult = await db
				.prepare('SELECT * FROM savings_goals WHERE workspace_id = ? ORDER BY status ASC, created_at DESC')
				.bind(workspaceId)
				.all<any>();
			goalsList = fallbackResult.results || [];
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		let totalTargetAmount = 0;
		let totalCurrentAmount = 0;
		let activeGoals = 0;
		let completedGoals = 0;

		const enrichedGoals = goalsList.map((g) => {
			const target = Number(g.target_amount || 0);
			const current = Number(g.current_amount || 0);
			const percentage = target > 0 ? Number(Math.min(100, (current / target) * 100).toFixed(1)) : 0;
			const remaining = Number(Math.max(0, target - current).toFixed(2));

			const deadlineVal = g.deadline || g.target_date || null;
			let daysRemaining: number | null = null;
			if (deadlineVal) {
				const deadlineObj = new Date(deadlineVal + 'T00:00:00');
				const diffTime = deadlineObj.getTime() - today.getTime();
				daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
			}

			if (g.status === 'active') {
				activeGoals++;
				totalTargetAmount += target;
				totalCurrentAmount += current;
			} else if (g.status === 'completed') {
				completedGoals++;
				totalTargetAmount += target;
				totalCurrentAmount += current;
			}

			return {
				id: g.id,
				workspace_id: g.workspace_id,
				name: g.name,
				target_amount: target,
				current_amount: current,
				deadline: deadlineVal,
				target_date: deadlineVal,
				account_id: g.account_id || null,
				account_name: g.account_name || null,
				account_color: g.account_color || null,
				account_bank_name: g.account_bank_name || null,
				color: g.color || '#10b981',
				icon: g.icon || 'Target',
				status: g.status || 'active',
				progress_percentage: percentage,
				percentage,
				remaining_amount: remaining,
				days_remaining: daysRemaining,
				created_at: g.created_at,
				updated_at: g.updated_at,
			};
		});

		const overallPercentage =
			totalTargetAmount > 0 ? Number(((totalCurrentAmount / totalTargetAmount) * 100).toFixed(1)) : 0;

		return c.json({
			workspace_id: workspaceId,
			summary: {
				total_goals: goalsList.length,
				active_goals: activeGoals,
				completed_goals: completedGoals,
				total_target_amount: Number(totalTargetAmount.toFixed(2)),
				total_saved_amount: Number(totalCurrentAmount.toFixed(2)),
				overall_percentage: overallPercentage,
			},
			goals: enrichedGoals,
		});
	} catch (err: any) {
		console.error('Erro ao listar metas:', err);
		return c.json({ error: 'Erro ao buscar metas financeiras' }, 500);
	}
});

// 2. POST /workspaces/:workspaceId/goals - Criar meta financeira
goalsRouter.post('/workspaces/:workspaceId/goals', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		const body = await c.req.json();
		const {
			name,
			target_amount,
			current_amount = 0,
			deadline,
			target_date,
			account_id = null,
			color = '#10b981',
			icon = 'Target',
		} = body;

		if (!name || typeof name !== 'string' || !name.trim()) {
			return c.json({ error: 'O nome da meta é obrigatório' }, 400);
		}

		const targetNum = Number(target_amount);
		if (isNaN(targetNum) || targetNum <= 0) {
			return c.json({ error: 'O valor alvo deve ser um número positivo maior que zero' }, 400);
		}

		const currentNum = Number(current_amount) || 0;
		const rawDeadline = deadline !== undefined ? deadline : target_date;
		const cleanDeadline =
			rawDeadline && /^\d{4}-\d{2}-\d{2}$/.test(String(rawDeadline).trim())
				? String(rawDeadline).trim()
				: null;

		const status = currentNum >= targetNum ? 'completed' : 'active';
		const id = crypto.randomUUID();

		try {
			await db
				.prepare(
					`INSERT INTO financial_goals (id, workspace_id, name, target_amount, current_amount, deadline, account_id, color, icon, status)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(id, workspaceId, name.trim(), targetNum, currentNum, cleanDeadline, account_id, color, icon, status)
				.run();
		} catch {
			// Fallback para savings_goals caso a tabela não tenha sido criada
			await db
				.prepare(
					`INSERT INTO savings_goals (id, workspace_id, user_id, name, target_amount, current_amount, target_date, status)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(id, workspaceId, Number(userId) || 1, name.trim(), targetNum, currentNum, cleanDeadline, status)
				.run();
		}

		return c.json(
			{
				message: 'Meta financeira criada com sucesso!',
				goal: {
					id,
					workspace_id: workspaceId,
					name: name.trim(),
					target_amount: targetNum,
					current_amount: currentNum,
					deadline: cleanDeadline,
					target_date: cleanDeadline,
					account_id,
					color,
					icon,
					status,
				},
			},
			201
		);
	} catch (err: any) {
		console.error('Erro ao criar meta:', err);
		return c.json({ error: 'Erro ao criar meta financeira' }, 500);
	}
});

// 3. PATCH /workspaces/:workspaceId/goals/:id - Atualizar meta ou registrar aporte
goalsRouter.patch('/workspaces/:workspaceId/goals/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const goalId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		// Busca a meta existente
		let existing: any = null;
		let tableName = 'financial_goals';

		existing = await db
			.prepare('SELECT * FROM financial_goals WHERE id = ? AND workspace_id = ?')
			.bind(goalId, workspaceId)
			.first<any>();

		if (!existing) {
			existing = await db
				.prepare('SELECT * FROM savings_goals WHERE id = ? AND workspace_id = ?')
				.bind(goalId, workspaceId)
				.first<any>();
			if (existing) {
				tableName = 'savings_goals';
			}
		}

		if (!existing) {
			return c.json({ error: 'Meta não encontrada' }, 404);
		}

		const body = await c.req.json();

		// Se for um aporte financeiro
		if (body.deposit_amount !== undefined || body.amount !== undefined) {
			const depositNum = Number(body.deposit_amount !== undefined ? body.deposit_amount : body.amount);
			if (isNaN(depositNum) || depositNum <= 0) {
				return c.json({ error: 'O valor do aporte deve ser um número positivo maior que zero' }, 400);
			}

			const newCurrent = Number((existing.current_amount + depositNum).toFixed(2));
			const newStatus = newCurrent >= existing.target_amount ? 'completed' : existing.status;

			if (tableName === 'financial_goals') {
				await db
					.prepare('UPDATE financial_goals SET current_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?')
					.bind(newCurrent, newStatus, goalId, workspaceId)
					.run();
			} else {
				await db
					.prepare('UPDATE savings_goals SET current_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?')
					.bind(newCurrent, newStatus, goalId, workspaceId)
					.run();
			}

			return c.json({
				message: newStatus === 'completed' ? 'Parabéns! Meta atingida com sucesso!' : 'Aporte registrado com sucesso!',
				current_amount: newCurrent,
				status: newStatus,
			});
		}

		// Atualização geral dos campos da meta
		const name = body.name !== undefined ? String(body.name).trim() : existing.name;
		const targetNum = body.target_amount !== undefined ? Number(body.target_amount) : existing.target_amount;
		const currentNum = body.current_amount !== undefined ? Number(body.current_amount) : existing.current_amount;
		const rawDeadline = body.deadline !== undefined ? body.deadline : (body.target_date !== undefined ? body.target_date : existing.deadline);
		const cleanDeadline =
			rawDeadline && /^\d{4}-\d{2}-\d{2}$/.test(String(rawDeadline).trim())
				? String(rawDeadline).trim()
				: null;
		const accountId = body.account_id !== undefined ? body.account_id : existing.account_id;
		const color = body.color || existing.color || '#10b981';
		const icon = body.icon || existing.icon || 'Target';

		let newStatus = body.status || existing.status;
		if (currentNum >= targetNum && newStatus === 'active') {
			newStatus = 'completed';
		}

		if (tableName === 'financial_goals') {
			await db
				.prepare(`
					UPDATE financial_goals 
					SET name = ?, target_amount = ?, current_amount = ?, deadline = ?, account_id = ?, color = ?, icon = ?, status = ?, updated_at = CURRENT_TIMESTAMP
					WHERE id = ? AND workspace_id = ?
				`)
				.bind(name, targetNum, currentNum, cleanDeadline, accountId, color, icon, newStatus, goalId, workspaceId)
				.run();
		} else {
			await db
				.prepare(`
					UPDATE savings_goals 
					SET name = ?, target_amount = ?, current_amount = ?, target_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP
					WHERE id = ? AND workspace_id = ?
				`)
				.bind(name, targetNum, currentNum, cleanDeadline, newStatus, goalId, workspaceId)
				.run();
		}

		return c.json({
			message: 'Meta financeira atualizada com sucesso!',
			goal: {
				id: goalId,
				workspace_id: workspaceId,
				name,
				target_amount: targetNum,
				current_amount: currentNum,
				deadline: cleanDeadline,
				target_date: cleanDeadline,
				account_id: accountId,
				color,
				icon,
				status: newStatus,
			},
		});
	} catch (err: any) {
		console.error('Erro ao atualizar meta:', err);
		return c.json({ error: 'Erro ao atualizar meta' }, 500);
	}
});

// 4. PATCH /workspaces/:workspaceId/goals/:id/complete - Concluir meta manualmente
goalsRouter.patch('/workspaces/:workspaceId/goals/:id/complete', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const goalId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		try {
			await db
				.prepare("UPDATE financial_goals SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?")
				.bind(goalId, workspaceId)
				.run();
		} catch {
			await db
				.prepare("UPDATE savings_goals SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?")
				.bind(goalId, workspaceId)
				.run();
		}

		return c.json({ message: 'Meta concluída com sucesso!', id: goalId, status: 'completed' });
	} catch (err: any) {
		console.error('Erro ao concluir meta:', err);
		return c.json({ error: 'Erro ao concluir meta' }, 500);
	}
});

// 5. DELETE /workspaces/:workspaceId/goals/:id - Excluir meta financeira
goalsRouter.delete('/workspaces/:workspaceId/goals/:id', async (c) => {
	try {
		const workspaceId = c.req.param('workspaceId');
		const goalId = c.req.param('id');
		const userId = String(c.get('userId'));
		const db = c.env.financeiro_db || (c.env as any).DB;

		const role = await getWorkspaceMemberRole(db, workspaceId, userId);
		if (!role || role === 'viewer') {
			return c.json({ error: 'Acesso negado ou permissão insuficiente' }, 403);
		}

		let deleted = false;
		try {
			const res = await db
				.prepare('DELETE FROM financial_goals WHERE id = ? AND workspace_id = ?')
				.bind(goalId, workspaceId)
				.run();
			if (res.meta && res.meta.changes > 0) deleted = true;
		} catch {
			// ignore
		}

		if (!deleted) {
			const res2 = await db
				.prepare('DELETE FROM savings_goals WHERE id = ? AND workspace_id = ?')
				.bind(goalId, workspaceId)
				.run();
			if (res2.meta && res2.meta.changes > 0) deleted = true;
		}

		return c.json({ message: 'Meta removida com sucesso!' });
	} catch (err: any) {
		console.error('Erro ao remover meta:', err);
		return c.json({ error: 'Erro ao remover meta' }, 500);
	}
});

export default goalsRouter;
