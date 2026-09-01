import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RecurringTransactions from "@/pages/RecurringTransactions";
import api from "@/lib/api";

const mockWorkspaces = [{ id: "ws-1", name: "Workspace Teste", type: "personal", role: "owner" }];
const mockCategories = [
  { id: 1, name: "Moradia", color: "#FF5733", type: "expense" },
  { id: 2, name: "Salário", color: "#33FF57", type: "income" },
];
const mockCreditCards = [
  { id: "card-1", name: "Nubank Roxinho", closing_day: 25, due_day: 5, limit_amount: 5000 },
];

const mockRecurringResponse = {
  workspace_id: "ws-1",
  summary: {
    active_count: 2,
    paused_count: 0,
    total_count: 2,
    monthly_expenses_total: 1200.0,
    monthly_income_total: 4500.0,
    monthly_balance: 3300.0,
  },
  recurrings: [
    {
      id: "rec-1",
      workspace_id: "ws-1",
      user_id: 1,
      description: "Aluguel Apartamento",
      amount: 1200.0,
      type: "expense",
      frequency: "monthly",
      day_of_month: 5,
      start_date: "2026-01-01",
      status: "active",
      last_generated_date: "2026-08-05",
      category_name: "Moradia",
      category_color: "#FF5733",
    },
    {
      id: "rec-2",
      workspace_id: "ws-1",
      user_id: 1,
      description: "Salário Mensal",
      amount: 4500.0,
      type: "income",
      frequency: "monthly",
      day_of_month: 5,
      start_date: "2026-01-01",
      status: "active",
      last_generated_date: "2026-08-05",
      category_name: "Salário",
      category_color: "#33FF57",
    },
  ],
};

const mockSuggestionsResponse = {
  suggestions: [
    {
      id: "sug-1",
      description: "Netflix Assinatura",
      amount: 55.9,
      type: "expense",
      frequency: "monthly",
      day_of_month: 15,
      confidence: "high",
      occurrencesCount: 3,
      sampleDates: ["2026-06-15", "2026-07-15", "2026-08-15"],
      explanation: "Identificado em 3 meses (dia ~15, valor R$ 55,90)",
    },
  ],
};

vi.mocked(api.get).mockImplementation((url: string) => {
  if (url === "/workspaces") return Promise.resolve({ data: mockWorkspaces }) as any;
  if (url.includes("/categories")) return Promise.resolve({ data: mockCategories }) as any;
  if (url.includes("/credit-cards")) return Promise.resolve({ data: mockCreditCards }) as any;
  if (url.includes("/recurring/suggestions")) return Promise.resolve({ data: mockSuggestionsResponse }) as any;
  if (url.includes("/recurring")) return Promise.resolve({ data: mockRecurringResponse }) as any;
  return Promise.resolve({ data: [] }) as any;
});

function renderRecurring() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RecurringTransactions />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Página de Transações Recorrentes", () => {
  it("deve renderizar o título, KPIs e sugestões detectadas", async () => {
    renderRecurring();

    expect(screen.getByText(/Transações Recorrentes/i)).toBeInTheDocument();

    await waitFor(() => {
      // Sugestão
      expect(screen.getByText(/Netflix Assinatura/i)).toBeInTheDocument();
      // Recorrências cadastradas
      expect(screen.getByText(/Aluguel Apartamento/i)).toBeInTheDocument();
      expect(screen.getByText(/Salário Mensal/i)).toBeInTheDocument();
    });
  });

  it("deve abrir o modal de criação ao clicar em Nova Recorrência", async () => {
    renderRecurring();

    const newBtn = screen.getByRole("button", { name: /Nova Recorrência/i });
    fireEvent.click(newBtn);

    await waitFor(() => {
      expect(screen.getByText(/Configure o lançamento automático periódico/i)).toBeInTheDocument();
    });
  });
});
