import { describe, it, expect } from 'vitest';
import { suggestCategory } from '../../src/utils/categoryRules';

describe('suggestCategory', () => {
	const workspaceCategories = [
		{ id: 1, name: 'Alimentação', type: 'expense' },
		{ id: 2, name: 'Transporte', type: 'expense' },
		{ id: 3, name: 'Mercado', type: 'expense' },
		{ id: 4, name: 'Assinaturas', type: 'expense' },
		{ id: 5, name: 'Saúde', type: 'expense' },
		{ id: 6, name: 'Moradia', type: 'expense' },
		{ id: 7, name: 'Salário', type: 'income' },
	];

	it('deve sugerir Transporte para Uber ou 99', () => {
		const res1 = suggestCategory('UBER *TRIP 1234', workspaceCategories);
		expect(res1.categoryId).toBe(2);
		expect(res1.categoryName).toBe('Transporte');

		const res2 = suggestCategory('99APP CORRIDA', workspaceCategories);
		expect(res2.categoryId).toBe(2);
	});

	it('deve sugerir Alimentação para Ifood e restaurantes', () => {
		const res1 = suggestCategory('IFOOD *RESTAURANTE DA VILLA', workspaceCategories);
		expect(res1.categoryId).toBe(1);
		expect(res1.categoryName).toBe('Alimentação');

		const res2 = suggestCategory('MC DONALDS SHOPPING', workspaceCategories);
		expect(res2.categoryId).toBe(1);
	});

	it('deve sugerir Mercado para Carrefour, Extra e Pão de Açúcar', () => {
		const res = suggestCategory('CARREFOUR HIPER', workspaceCategories);
		expect(res.categoryId).toBe(3);
		expect(res.categoryName).toBe('Mercado');
	});

	it('deve sugerir Assinaturas para Netflix, Spotify, etc.', () => {
		const res1 = suggestCategory('NETFLIX.COM ASSINATURA', workspaceCategories);
		expect(res1.categoryId).toBe(4);

		const res2 = suggestCategory('Spotify AB', workspaceCategories);
		expect(res2.categoryId).toBe(4);
	});

	it('deve sugerir Saúde para Drogasil, farmácias e consultas', () => {
		const res = suggestCategory('DROGASIL FILIAL 12', workspaceCategories);
		expect(res.categoryId).toBe(5);
	});

	it('deve sugerir Salário para recebimentos de proventos', () => {
		const res = suggestCategory('TED RECEBIDO - SALARIO', workspaceCategories);
		expect(res.categoryId).toBe(7);
	});

	it('deve retornar null se não encontrar categoria correspondente', () => {
		const res = suggestCategory('LOJA DE FERRAMENTAS XYZ', workspaceCategories);
		expect(res.categoryId).toBeNull();
		expect(res.categoryName).toBeNull();
	});
});
