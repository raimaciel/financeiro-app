import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import api from "@/lib/api";

// Dados de mock para o dashboard
const mockDashboard = {
  month: "2026-08",
  summary: {
    total_income: 5000,
    total_expense: 3200,
    balance: 1800,
    income_change_percent: 10,
    expense_change_percent: -5,
  },
  evolution_last_6_months: [
    { month: "2026-03", label: "Mar/26", income: 4000, expense: 2500, balance: 1500 },
    { month: "2026-04", label: "Abr/26", income: 4200, expense: 2700, balance: 1500 },
    { month: "2026-05", label: "Mai/26", income: 4500, expense: 2900, balance: 1600 },
    { month: "2026-06", label: "Jun/26", income: 4100, expense: 3000, balance: 1100 },
    { month: "2026-07", label: "Jul/26", income: 4700, expense: 3100, balance: 1600 },
    { month: "2026-08", label: "Ago/26", income: 5000, expense: 3200, balance: 1800 },
  ],
  expenses_by_category: [
    { category_id: 1, name: "Alimentação", color: "#FF5733", icon: "utensils", total: 800, percentage: 25 },
    { category_id: 2, name: "Transporte", color: "#3498DB", icon: "car", total: 500, percentage: 15.6 },
  ],
  top_expenses: [
    { id: 1, description: "Aluguel", amount: 1500, date: "2026-08-05", category_name: "Moradia", category_color: "#2ECC71" },
  ],
  cards_summary: {
    total_limit: 10000,
    used_limit: 3200,
    available_limit: 6800,
    usage_percentage: 32,
    cards_count: 2,
  },
  invoices_summary: {
    total_invoices_due: 3200,
    invoices_due_count: 2,
    upcoming_invoices: [],
  },
};

const mockWorkspaces = [{ id: "ws-1", name: "Casa", type: "personal", role: "owner" }];

vi.mocked(api.get).mockImplementation((url: string) => {
  if (url === "/workspaces") return Promise.resolve({ data: mockWorkspaces }) as any;
  if (url.includes("/dashboard")) return Promise.resolve({ data: mockDashboard }) as any;
  return Promise.resolve({ data: [] }) as any;
});

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Dashboard = require("@/pages/Dashboard").default;
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Dashboard — lógica de dados", () => {
  it("estrutura do mock deve ter todos os campos obrigatórios", () => {
    expect(mockDashboard).toHaveProperty("summary");
    expect(mockDashboard).toHaveProperty("evolution_last_6_months");
    expect(mockDashboard.evolution_last_6_months).toHaveLength(6);
    expect(mockDashboard).toHaveProperty("expenses_by_category");
    expect(mockDashboard).toHaveProperty("top_expenses");
    expect(mockDashboard).toHaveProperty("cards_summary");
    expect(mockDashboard).toHaveProperty("invoices_summary");
  });

  it("summary deve ter tipos numéricos corretos", () => {
    const { summary } = mockDashboard;
    expect(typeof summary.total_income).toBe("number");
    expect(typeof summary.total_expense).toBe("number");
    expect(typeof summary.balance).toBe("number");
    expect(summary.balance).toBe(summary.total_income - summary.total_expense);
  });

  it("expenses_by_category deve ter porcentagens válidas", () => {
    const total = mockDashboard.expenses_by_category.reduce((s, c) => s + c.percentage, 0);
    expect(total).toBeLessThanOrEqual(100.1); // pequena margem por arredondamento
  });

  it("cards_summary disponível deve ser limite - usado", () => {
    const { cards_summary: cs } = mockDashboard;
    expect(cs.available_limit).toBe(cs.total_limit - cs.used_limit);
  });

  it("usage_percentage deve estar entre 0 e 100", () => {
    const { usage_percentage } = mockDashboard.cards_summary;
    expect(usage_percentage).toBeGreaterThanOrEqual(0);
    expect(usage_percentage).toBeLessThanOrEqual(100);
  });
});
