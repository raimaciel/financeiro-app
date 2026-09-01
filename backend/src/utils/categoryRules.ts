export interface CategoryRule {
	keywords: string[];
	categoryTarget: string; // Nome da categoria alvo
}

export const DEFAULT_CATEGORY_RULES: CategoryRule[] = [
	{
		categoryTarget: 'Transporte',
		keywords: [
			'UBER',
			'99APP',
			'99*',
			'99 *',
			'99 TECNOLOGIA',
			'TAXI',
			'CABIFY',
			'POSTO',
			'COMBUSTIVEL',
			'GASOLINA',
			'ETANOL',
			'IPIRANGA',
			'SHELL',
			'PETROBRAS',
			'BR DISTRIBUIDORA',
			'AUTO POSTO',
			'ESTACIONAMENTO',
			'ESTAC',
			'PEDAGIO',
			'SEM PARAR',
			'VELOE',
			'CONECTCAR',
			'AUTO PASS',
			'BILHETE UNICO',
			'METRO',
			'CPTM',
			'CCR',
		],
	},
	{
		categoryTarget: 'Alimentação',
		keywords: [
			'IFOOD',
			'RAPPI',
			'RESTAURANTE',
			'REST',
			'PADARIA',
			'BURGER',
			'MCDONALD',
			'MC DONALD',
			'BURGER KING',
			'BK',
			'PIZZARIA',
			'PIZZA',
			'LANCHONETE',
			'LANCHES',
			'BAR',
			'CAFE',
			'CAFETERIA',
			'STARBUCKS',
			'SUBWAY',
			'HABIB',
			'SPOLETO',
			'GIRAFFAS',
			'CHURRASCARIA',
			'DOCERIA',
			'SORVETERIA',
			'OUTBACK',
			'MADERO',
			'COCO BAMBU',
		],
	},
	{
		categoryTarget: 'Mercado',
		keywords: [
			'MERCADO',
			'SUPERMERCADO',
			'SUPERMERC',
			'HIPERMERCADO',
			'CARREFOUR',
			'EXTRA',
			'PAO DE ACUCAR',
			'ATACADAO',
			'ASSAI',
			'BIG',
			'HIROTA',
			'DIA %',
			'DIA BRASIL',
			'HORTIFRUTI',
			'SACOLAO',
			'QUITANDA',
			'ACOUgue',
			'AÇOUGUE',
			'SAM S CLUB',
			'SAMS CLUB',
			'ST MARCHE',
			'ZONA SUL',
			'GUANABARA',
		],
	},
	{
		categoryTarget: 'Assinaturas',
		keywords: [
			'NETFLIX',
			'SPOTIFY',
			'AMAZON PRIME',
			'PRIME VIDEO',
			'AMZN',
			'DISNEY',
			'DISNEYPLUS',
			'HBO',
			'HBOMAX',
			'MAX.COM',
			'YOUTUBE',
			'GOOGLE STORAGE',
			'GOOGLE ONE',
			'ICLOUD',
			'APPLE.COM/BILL',
			'STEAM',
			'PLAYSTATION',
			'PSN',
			'XBOX',
			'MICROSOFT',
			'DEEZER',
			'CRUNCHYROLL',
			'GLOBO PLAY',
			'GLOBOPLAY',
			'CHATGPT',
			'OPENAI',
		],
	},
	{
		categoryTarget: 'Saúde',
		keywords: [
			'FARMACIA',
			'DROGARIA',
			'DROGASIL',
			'DROGA RAIA',
			'RAIA',
			'PACHECO',
			'SAO PAULO',
			'PAGUE MENOS',
			'MEDICO',
			'CONSULTA',
			'HOSPITAL',
			'EXAME',
			'CLINICA',
			'UNIMED',
			'AMIL',
			'SULAMERICA',
			'BRADESCO SAUDE',
			'NOTREDAME',
			'DENTISTA',
			'ODONTO',
			'LABORATORIO',
			'FLEURY',
			'LAVOISIER',
			'DELBONI',
			'OTICA',
		],
	},
	{
		categoryTarget: 'Moradia',
		keywords: [
			'ENEL',
			'CPFL',
			'LIGHT',
			'ENERGISA',
			'CEMIG',
			'COELBA',
			'SABESP',
			'COPASA',
			'SANEPAR',
			'CEDAE',
			'COMGAS',
			'NATURGY',
			'CLARO',
			'VIVO',
			'TIM',
			'OI FIBRA',
			'INTERNET',
			'CONDOMINIO',
			'ALUGUEL',
			'IPTU',
			'SEGURO RESIDENCIAL',
			'LEROY MERLIN',
			'TELHANORTE',
			'C&C',
			'SODIMAC',
		],
	},
	{
		categoryTarget: 'Educação',
		keywords: [
			'EDUCACAO',
			'FACULDADE',
			'UNIVERSIDADE',
			'CURSO',
			'ESCOLA',
			'COLEGIO',
			'ALURA',
			'UDEMY',
			'COURSERA',
			'ROCKETSEAT',
			'IDIOMAS',
			'WIZARD',
			'CNA',
			'CCAA',
			'KUMON',
			'LIVRARIA',
			'SARAIVA',
			'LEITURA',
		],
	},
	{
		categoryTarget: 'Salário',
		keywords: [
			'SALARIO',
			'PRO-LABORE',
			'PRO LABORE',
			'DIVIDENDOS',
			'RENDIMENTO',
			'DOC RECEBIDO',
			'TED RECEBIDO',
			'PIX RECEBIDO',
			'REMUNERACAO',
			'BONUS',
			'PLR',
			'RESTITUICAO',
			'FOLHA DE PAGTO',
		],
	},
	{
		categoryTarget: 'Lazer',
		keywords: [
			'CINEMA',
			'CINEMARK',
			'CINEPOLIS',
			'KINOPLEX',
			'INGRESSO',
			'SHOW',
			'TEATRO',
			'HOTEL',
			'AIRBNB',
			'BOOKING',
			'CVC',
			'DECOLAR',
			'GOL LINHAS',
			'AZUL LINHAS',
			'LATAM',
			'PARQUE',
			'VIAGEM',
		],
	},
];

/**
 * Remove acentos e normaliza texto para comparação.
 */
export function normalizeText(text: string): string {
	if (!text) return '';
	return text
		.toUpperCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim();
}

/**
 * Sugere uma categoria existente no workspace com base na descrição da transação.
 */
export function suggestCategory(
	description: string,
	existingCategories: Array<{ id: number; name: string; type?: string }>
): { categoryId: number | null; categoryName: string | null; matchedKeyword?: string } {
	if (!description || existingCategories.length === 0) {
		return { categoryId: null, categoryName: null };
	}

	const normalizedDesc = normalizeText(description);

	// 1. Procura match com as regras de palavras-chave
	for (const rule of DEFAULT_CATEGORY_RULES) {
		const foundKeyword = rule.keywords.find((kw) => {
			const normKw = normalizeText(kw);
			return normalizedDesc.includes(normKw);
		});

		if (foundKeyword) {
			const normTarget = normalizeText(rule.categoryTarget);

			// Tenta achar categoria no workspace cujo nome seja igual ou contenha a categoria alvo
			const matchedCategory = existingCategories.find((cat) => {
				const normCatName = normalizeText(cat.name);
				return (
					normCatName === normTarget ||
					normCatName.includes(normTarget) ||
					normTarget.includes(normCatName)
				);
			});

			if (matchedCategory) {
				return {
					categoryId: matchedCategory.id,
					categoryName: matchedCategory.name,
					matchedKeyword: foundKeyword,
				};
			}
		}
	}

	// 2. Se não casou por regra, tenta correspondência direta com o nome de alguma categoria cadastrada
	for (const cat of existingCategories) {
		const normCatName = normalizeText(cat.name);
		if (normCatName.length >= 3 && normalizedDesc.includes(normCatName)) {
			return {
				categoryId: cat.id,
				categoryName: cat.name,
				matchedKeyword: cat.name,
			};
		}
	}

	return { categoryId: null, categoryName: null };
}
