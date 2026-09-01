import { describe, it, expect } from "vitest";
import {
  detectCardHeader,
  detectReferenceYear,
  parseAmountValue,
  extractInstallments,
  parseTransactionsFromText,
  parseLayoutDDMM,
  parseLayoutFullDate,
  parseLayoutMonthName,
} from "../utils/pdfParser";

describe("pdfParser - Detecção de Cabeçalhos de Cartão", () => {
  it("deve detectar cartão com 4 dígitos mascarados (ex: 5555****6768)", () => {
    const res = detectCardHeader("Cartão 5555****6768");
    expect(res).not.toBeNull();
    expect(res?.last4).toBe("6768");
  });

  it("deve detectar cartão com máscara longa (ex: 543882*******1711)", () => {
    const res = detectCardHeader("543882*******1711");
    expect(res).not.toBeNull();
    expect(res?.last4).toBe("1711");
  });

  it("deve detectar cartão com espaços e asteriscos (ex: CARTÃO 4203 **** **** 7380)", () => {
    const res = detectCardHeader("CARTÃO 4203 **** **** 7380");
    expect(res).not.toBeNull();
    expect(res?.last4).toBe("7380");
  });

  it("deve detectar padrão com bullets (ex: •••• 9988)", () => {
    const res = detectCardHeader("Cartão Adicional •••• 9988");
    expect(res).not.toBeNull();
    expect(res?.last4).toBe("9988");
  });

  it("deve retornar null para linhas normais de transação ou texto", () => {
    expect(detectCardHeader("15/08 Supermercado Extra 150,00")).toBeNull();
    expect(detectCardHeader("Total da Fatura: R$ 1.500,00")).toBeNull();
  });
});

describe("pdfParser - Conversão de Valores e Parcelas", () => {
  it("deve converter valor monetário pt-BR com débito negativo", () => {
    const val = parseAmountValue("150,50", "Supermercado");
    expect(val).toBe(-150.5);
  });

  it("deve converter valor com milhar e R$", () => {
    const val = parseAmountValue("R$ 1.234,56", "Notebook Dell");
    expect(val).toBe(-1234.56);
  });

  it("deve identificar créditos e estornos como valores positivos", () => {
    expect(parseAmountValue("100,00 CR", "Estorno Compra")).toBe(100.0);
    expect(parseAmountValue("500,00", "PAGAMENTO DE FATURA")).toBe(500.0);
    expect(parseAmountValue("-50,00", "Ajuste a crédito")).toBe(50.0);
  });

  it("deve extrair parcelamento da descrição", () => {
    const res = extractInstallments("LOJA RENNER 02/05");
    expect(res.cleanDescription).toBe("LOJA RENNER");
    expect(res.installmentCurrent).toBe(2);
    expect(res.installments).toBe(5);

    const res2 = extractInstallments("MAGAZINE LUIZA (3/10)");
    expect(res2.cleanDescription).toBe("MAGAZINE LUIZA");
    expect(res2.installmentCurrent).toBe(3);
    expect(res2.installments).toBe(10);
  });
});

describe("pdfParser - Layout 1 (DD/MM) com Múltiplos Cartões", () => {
  it("deve extrair transações associando aos respectivos cartões pelo contexto", () => {
    const sampleText = `
Fatura de Cartão de Crédito - Vencimento: 15/09/2026
Cartão Titular 5555****6768
10/08 Supermercado Pão de Açúcar 250,00
12/08 Uber *Trip 35,50
14/08 Pagamento de Fatura -2.000,00

Cartão Adicional 543882*******1711
15/08 Farmácia Drogasil 89,90
18/08 Restaurante Outback 01/02 180,00
    `;

    const txs = parseTransactionsFromText(sampleText, 2026);
    expect(txs.length).toBe(5);

    // Transações do titular 6768
    expect(txs[0].date).toBe("2026-08-10");
    expect(txs[0].description).toBe("Supermercado Pão de Açúcar");
    expect(txs[0].amount).toBe(-250.0);
    expect(txs[0].cardLast4).toBe("6768");

    expect(txs[1].cardLast4).toBe("6768");
    expect(txs[1].amount).toBe(-35.5);

    expect(txs[2].description).toBe("Pagamento de Fatura");
    expect(txs[2].amount).toBe(2000.0); // Pagamento = positivo

    // Transações do adicional 1711
    expect(txs[3].cardLast4).toBe("1711");
    expect(txs[3].amount).toBe(-89.9);

    expect(txs[4].cardLast4).toBe("1711");
    expect(txs[4].description).toBe("Restaurante Outback");
    expect(txs[4].installments).toBe(2);
    expect(txs[4].installmentCurrent).toBe(1);
  });
});

describe("pdfParser - Layout 2 (DD/MM/AAAA)", () => {
  it("deve extrair transações com datas completas", () => {
    const lines = [
      "CARTÃO 4203 **** **** 7380",
      "05/08/2026 POSTO SHELL 210,00",
      "08/08/2026 MERCADO LIVRE 02/06 360,00",
    ];

    const txs = parseLayoutFullDate(lines);
    expect(txs.length).toBe(2);
    expect(txs[0].date).toBe("2026-08-05");
    expect(txs[0].amount).toBe(-210.0);
    expect(txs[0].cardLast4).toBe("7380");
    expect(txs[1].installments).toBe(6);
    expect(txs[1].installmentCurrent).toBe(2);
  });
});

describe("pdfParser - Layout 3 (DD mês. AAAA)", () => {
  it("deve extrair transações com nomes de meses em português", () => {
    const lines = [
      "Cartão final 1234",
      "12 ago 2026 Netflix.com 55,90",
      "15 AGO 2026 SPOTIFY 34,90",
      "20 set Farmácia São Paulo 45,00",
    ];

    const txs = parseLayoutMonthName(lines, 2026);
    expect(txs.length).toBe(3);
    expect(txs[0].date).toBe("2026-08-12");
    expect(txs[0].description).toBe("Netflix.com");
    expect(txs[0].amount).toBe(-55.9);
    expect(txs[0].cardLast4).toBe("1234");
    expect(txs[1].date).toBe("2026-08-15");
    expect(txs[2].date).toBe("2026-09-20");
  });
});
