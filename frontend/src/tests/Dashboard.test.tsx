import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Dashboard from "@/pages/Dashboard";
import api from "@/lib/api";

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
  accounts_balance: [
    {
      id: "acc-1",
      name: "Conta Inter",
      bank_name: "Banco Inter",
      color: "#FF7A00",
      account_type: "checking",
      initial_balance: 1000,
      current_balance: 1300,
    },
    {
      id: "acc-2",
      name: "Poupança Caixa",
      bank_name: "Caixa Econômica",
      color: "#005CA9",
      account_type: "savings",
      initial_balance: 2500,
      current_balance: 2500,
    },
  ],
  total_accounts_balance: 3800,
};

const mockWorkspaces = [{ id: "ws-1", name: "Casa", type: "personal", role: "owner" }];

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    selectedWorkspaceId: "ws-1",
    selectedWorkspace: { id: "ws-1", name: "Casa", role: "owner" },
    hasWorkspace: true,
    isLoading: false,
  }),
}));

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Dashboard — Métricas e Saldo por Conta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/workspaces") return Promise.resolve({ data: mockWorkspaces }) as any;
      if (url.includes("/dashboard")) return Promise.resolve({ data: mockDashboard }) as any;
      return Promise.resolve({ data: [] }) as any;
    });
  });

  it("estrutura do mock deve ter todos os campos obrigatórios", () => {
    expect(mockDashboard).toHaveProperty("summary");
    expect(mockDashboard).toHaveProperty("evolution_last_6_months");
    expect(mockDashboard.evolution_last_6_months).toHaveLength(6);
    expect(mockDashboard).toHaveProperty("expenses_by_category");
    expect(mockDashboard).toHaveProperty("top_expenses");
    expect(mockDashboard).toHaveProperty("cards_summary");
    expect(mockDashboard).toHaveProperty("invoices_summary");
    expect(mockDashboard).toHaveProperty("accounts_balance");
    expect(mockDashboard).toHaveProperty("total_accounts_balance");
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
    expect(total).toBeLessThanOrEqual(100.1);
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

  it("deve renderizar a seção 'Saldo por Conta' com os cards e o saldo total consolidado", async () => {
    renderDashboard();

    expect(await screen.findByText("Saldo por Conta")).toBeInTheDocument();
    expect(screen.getByText("Saldo Total em Contas:")).toBeInTheDocument();

    // Cards das contas
    expect(screen.getByText("Conta Inter")).toBeInTheDocument();
    expect(screen.getByText("Banco Inter")).toBeInTheDocument();
    expect(screen.getByText("Poupança Caixa")).toBeInTheDocument();
    expect(screen.getByText("Caixa Econômica")).toBeInTheDocument();

    // Badges de tipo
    expect(screen.getByText("Corrente")).toBeInTheDocument();
    expect(screen.getByText("Poupança")).toBeInTheDocument();
  });

  it("deve renderizar o estado vazio quando não houver contas cadastradas", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/workspaces") return Promise.resolve({ data: mockWorkspaces }) as any;
      if (url.includes("/dashboard")) {
        return Promise.resolve({
          data: {
            ...mockDashboard,
            accounts_balance: [],
            total_accounts_balance: 0,
          },
        }) as any;
      }
      return Promise.resolve({ data: [] }) as any;
    });

    renderDashboard();

    expect(await screen.findByText("Saldo por Conta")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma conta bancária cadastrada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cadastrar Conta/i })).toBeInTheDocument();
  });
});
