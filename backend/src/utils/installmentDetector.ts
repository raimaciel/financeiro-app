export interface InstallmentDetectionResult {
	installmentCurrent: number | null;
	installmentTotal: number | null;
	hasInstallment: boolean;
	cleanDescription: string;
}

/**
 * Detecta padrões de parcelamento em descrições de transações bancárias.
 * Ex: "02/06", "PARC 02/06", "(2/6)", "PARC. 3/10", "PARCELA 04 DE 12", "01/12".
 */
export function detectInstallment(description: string): InstallmentDetectionResult {
	if (!description || typeof description !== 'string') {
		return {
			installmentCurrent: null,
			installmentTotal: null,
			hasInstallment: false,
			cleanDescription: description || '',
		};
	}

	const desc = description.trim();

	// Padrão 1: "PARC 02/06", "PARCELA 02/06", "(02/06)", " 02/06 ", "02/06" no final
	// Exclui datas como "15/08" checando se o segundo número faz sentido para parcelas (2 a 99)
	const regex1 = /(?:PARC(?:ELA)?\.?\s*|\s+|\()(\d{1,2})\s*(?:\/|\s+DE\s+)\s*(\d{1,2})\)?/i;
	const match = desc.match(regex1);

	if (match) {
		const current = parseInt(match[1], 10);
		const total = parseInt(match[2], 10);

		// Validações de sanidade para parcelas:
		// - Total deve ser entre 2 e 99
		// - Parcela atual deve ser >= 1 e <= Total
		if (total >= 2 && total <= 99 && current >= 1 && current <= total) {
			// Remove o sufixo de parcela da descrição limpa
			const cleanDescription = desc.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();

			return {
				installmentCurrent: current,
				installmentTotal: total,
				hasInstallment: true,
				cleanDescription: cleanDescription || desc,
			};
		}
	}

	return {
		installmentCurrent: null,
		installmentTotal: null,
		hasInstallment: false,
		cleanDescription: desc,
	};
}
