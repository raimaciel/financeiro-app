import { describe, it, expect } from "vitest";

// Funções utilitárias extraídas dos componentes para teste unitário
function formatCurrency(val: number): string {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function shiftMonth(yearMonth: string, delta: number): string {
  const [yyyy, mm] = yearMonth.split("-");
  const d = new Date(Number(yyyy), Number(mm) - 1 + delta, 1);
  const nextY = d.getFullYear();
  const nextM = String(d.getMonth() + 1).padStart(2, "0");
  return `${nextY}-${nextM}`;
}

function formatMonthLabel(yearMonth: string): string {
  const [yyyy, mm] = yearMonth.split("-");
  const date = new Date(Number(yyyy), Number(mm) - 1, 1);
  const monthName = date.toLocaleDateString("pt-BR", { month: "long" });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${yyyy}`;
}

describe("formatCurrency", () => {
  it("deve formatar número como moeda BRL", () => {
    const result = formatCurrency(1500);
    expect(result).toMatch(/R\$/);
    expect(result).toMatch(/1/);
    expect(result).toMatch(/500/);
  });

  it("deve formatar zero corretamente", () => {
    const result = formatCurrency(0);
    expect(result).toMatch(/R\$/);
    expect(result).toMatch(/0/);
  });

  it("deve formatar valores negativos", () => {
    const result = formatCurrency(-100);
    expect(result).toContain("100");
  });
});

describe("shiftMonth", () => {
  it("deve avançar um mês", () => {
    expect(shiftMonth("2026-01", 1)).toBe("2026-02");
  });

  it("deve retroceder um mês", () => {
    expect(shiftMonth("2026-03", -1)).toBe("2026-02");
  });

  it("deve mudar de ano ao avançar de dezembro", () => {
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("deve mudar de ano ao retroceder de janeiro", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("deve avançar 6 meses corretamente", () => {
    expect(shiftMonth("2026-01", 6)).toBe("2026-07");
  });
});

describe("formatMonthLabel", () => {
  it("deve retornar label em formato 'Mês de YYYY'", () => {
    const label = formatMonthLabel("2026-08");
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/[Aa]gosto/);
  });

  it("deve capitalizar o mês", () => {
    const label = formatMonthLabel("2026-01");
    expect(label[0]).toBe(label[0].toUpperCase());
  });
});
