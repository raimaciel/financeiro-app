/**
 * Engine Agnóstica de Competência e Normalização de Faturas de Cartão de Crédito.
 * 
 * Responsabilidades (Camada 2):
 * 1. Recebe transações brutas de QUALQUER banco (Camada 1: Caixa, Nubank, Itaú, etc.).
 * 2. Aplica a competência da fatura: todas as transações da fatura de referência (ex: 2026-09)
 *    terão sua data contábil (competenceDate / date) no mês/ano da fatura (ex: 2026-09-DD),
 *    independentemente de quando a compra original foi feita (ex: Junho, Maio, etc.).
 * 3. Preserva a data original da compra (originalDate) como metadado histórico.
 * 4. Preserva 100% da descrição sem truncamento.
 * 5. Vincula automaticamente o cartão de crédito do workspace via 4 dígitos finais.
 */

export interface RawExtractedTransaction {
	description: string; // Descrição completa sem truncamento
	amount: number; // Valor numérico positivo
	type: 'D' | 'C'; // 'D' (Débito) ou 'C' (Crédito / Pagamento / Estorno)
	originalDate: string; // Data da COMPRA impressa no documento (DD/MM ou DD/MM/AAAA)
	cardLastDigits: string | null; // Últimos 4 dígitos do cartão (ex: "2583")
	cardLabel?: string; // Rótulo do cartão no documento (ex: "Cartão 2583")
	installmentInfo?: { current: number; total: number } | null;
	sourceBank: string; // 'caixa' | 'nubank' | 'itau' | 'generic'
}

export interface RawInvoiceHeader {
	invoiceReferenceMonth?: string; // "YYYY-MM" (ex: "2026-09")
	invoiceDueDate?: string; // "YYYY-MM-DD" (ex: "2026-09-10")
	invoiceClosingDate?: string; // "YYYY-MM-DD"
	invoiceYear?: number; // 2026
	invoiceMonth?: number; // 9
	sourceBank?: string;
	bankName?: string;
}

export interface CreditCardRef {
	id: string;
	name: string;
	last_four_digits?: string | null;
	brand?: string | null;
}

export interface CategoryRef {
	id: number;
	name: string;
	type?: string;
}

export interface NormalizedImportTransaction {
	id: string;
	date: string; // "YYYY-MM-DD" - Data de COMPETÊNCIA da fatura para gravação no banco
	dataCompetencia: string; // "YYYY-MM-DD"
	dataTransacao: string; // "DD/MM" ou "DD/MM/AAAA" - Data original da compra
	dataParcial: string; // "DD/MM" - Compatibilidade
	ano: number;
	mes: number;
	mesReferenciaFatura: string; // "YYYY-MM"
	dataVencimento?: string;
	description: string; // Descrição completa sem truncamento
	descricao: string;
	amount: number;
	valor: number;
	type: 'income' | 'expense';
	tipo: 'D' | 'C';
	creditCardId: string | null;
	cartao: string;
	cardLabel: string;
	cartaoDigitos: string | null;
	cartaoIdentificado: boolean;
	installments: number;
	installmentCurrent: number;
	categoryId: number | null;
	categoryName: string | null;
	precisaRevisao: boolean;
	selected: boolean;
}

/**
 * Normaliza uma lista de transações brutas de qualquer banco aplicando a competência da fatura.
 */
export function normalizeInvoiceTransactions(
	rawTransactions: RawExtractedTransaction[],
	header: RawInvoiceHeader,
	workspaceCreditCards: CreditCardRef[] = [],
	workspaceCategories: CategoryRef[] = [],
	defaultCreditCardId?: string | null
): {
	mesReferenciaFatura: string;
	anoFatura: number;
	mesFatura: number;
	dataVencimento?: string;
	transactions: NormalizedImportTransaction[];
} {
	const now = new Date();
	const effectiveYear = header.invoiceYear || (header.invoiceReferenceMonth ? parseInt(header.invoiceReferenceMonth.split('-')[0], 10) : now.getFullYear());
	const effectiveMonth = header.invoiceMonth || (header.invoiceReferenceMonth ? parseInt(header.invoiceReferenceMonth.split('-')[1], 10) : now.getMonth() + 1);
	const mesReferenciaFatura = header.invoiceReferenceMonth || `${effectiveYear}-${String(effectiveMonth).padStart(2, '0')}`;

	const normalizedList: NormalizedImportTransaction[] = rawTransactions.map((raw, idx) => {
		// 1. Extrair dia da transação original (ex: "06/06" -> "06")
		const dayPart = (raw.originalDate || '01/01').split('/')[0].replace(/\D/g, '').padStart(2, '0') || '01';
		const safeDayNum = Math.min(28, Math.max(1, parseInt(dayPart, 10)));
		const safeDay = String(safeDayNum).padStart(2, '0');

		// 2. Definir a DATA DE COMPETÊNCIA: sempre no mês/ano da fatura importada!
		const competenceDate = `${effectiveYear}-${String(effectiveMonth).padStart(2, '0')}-${safeDay}`;

		// 3. Vinculação automática do cartão pelo final de 4 dígitos
		let matchedCardId: string | null = null;
		let matchedCardLabel = raw.cardLabel || (raw.cardLastDigits ? `Cartão final ${raw.cardLastDigits}` : 'Cartão');
		let isCardIdentified = false;

		if (raw.cardLastDigits && workspaceCreditCards.length > 0) {
			const matched = workspaceCreditCards.find((c) => {
				if (c.last_four_digits && c.last_four_digits.trim() === raw.cardLastDigits) return true;
				if (c.name && c.name.includes(raw.cardLastDigits!)) return true;
				return false;
			});

			if (matched) {
				matchedCardId = matched.id;
				matchedCardLabel = `${matched.name}${matched.last_four_digits ? ` (•••• ${matched.last_four_digits})` : ''}`;
				isCardIdentified = true;
			}
		}

		if (!matchedCardId && defaultCreditCardId && defaultCreditCardId !== 'none') {
			const fallbackCard = workspaceCreditCards.find((c) => c.id === defaultCreditCardId);
			if (fallbackCard) {
				matchedCardId = fallbackCard.id;
				matchedCardLabel = `${fallbackCard.name}${fallbackCard.last_four_digits ? ` (•••• ${fallbackCard.last_four_digits})` : ''}`;
			}
		}

		// 4. Detecção de parcelamento
		const installments = raw.installmentInfo?.total || 1;
		const installmentCurrent = raw.installmentInfo?.current || 1;

		// 5. Tipo
		const type: 'income' | 'expense' = raw.type === 'C' ? 'income' : 'expense';

		// 6. Sugestão de categoria
		let suggestedCatId: number | null = null;
		let suggestedCatName: string | null = null;
		if (workspaceCategories.length > 0) {
			const descLower = raw.description.toLowerCase();
			const typeCats = workspaceCategories.filter((c) => !c.type || c.type === type);
			for (const cat of typeCats) {
				if (descLower.includes(cat.name.toLowerCase())) {
					suggestedCatId = cat.id;
					suggestedCatName = cat.name;
					break;
				}
			}
		}

		return {
			id: `inv-tx-${idx}-${Date.now()}`,
			date: competenceDate, // Campo principal para persistência no banco e filtro do dashboard
			dataCompetencia: competenceDate,
			dataTransacao: raw.originalDate, // Preservada para histórico
			dataParcial: raw.originalDate,
			ano: effectiveYear,
			mes: effectiveMonth,
			mesReferenciaFatura,
			dataVencimento: header.invoiceDueDate,
			description: raw.description, // Completa sem truncamento
			descricao: raw.description,
			amount: Math.abs(raw.amount),
			valor: Math.abs(raw.amount),
			type,
			tipo: raw.type,
			creditCardId: matchedCardId,
			cartao: matchedCardLabel,
			cardLabel: matchedCardLabel,
			cartaoDigitos: raw.cardLastDigits,
			cartaoIdentificado: isCardIdentified,
			installments,
			installmentCurrent,
			categoryId: suggestedCatId,
			categoryName: suggestedCatName,
			precisaRevisao: true,
			selected: true,
		};
	});

	return {
		mesReferenciaFatura,
		anoFatura: effectiveYear,
		mesFatura: effectiveMonth,
		dataVencimento: header.invoiceDueDate,
		transactions: normalizedList,
	};
}
