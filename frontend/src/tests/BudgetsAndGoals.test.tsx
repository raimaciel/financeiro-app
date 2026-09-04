import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BudgetsAndGoals from "@/pages/BudgetsAndGoals";
import api from "@/lib/api";

const mockWorkspaces = [{ id: "ws-1", name: "Workspace Teste", type: "personal", role: "owner" }];
const mockCategories = [
  { id: 1, name: "Alimentação", color: "#FF5733", type: "expense" },
  { id: 2, name: "Transporte", color: "#3357FF", type: "expense" },
];

const mockBudgetsResponse = {
  workspace_id: "ws-1",
  month: "2026-09",
  summary: {
    total_budgeted: 1000.0,
    total_spent: 850.0,
    total_remaining: 150.0,
    total_count: 1,
    ok_count: 0,
    warning_count: 1,
    exceeded_count: 0,
    in_alert_count: 1,
  },
  budgets: [
    {
      id: "b-1",
      workspace_id: "ws-1",
      category_id: 1,
      category_name: "Alimentação",
      category_color: "#FF5733",
      monthly_limit: 1000.0,
      spent_amount: 850.0,
      remaining_amount: 150.0,
      percentage_used: 85.0,
      status: "warning",
      alert_threshold_percent: 80,
    },
  ],
};

const mockGoalsResponse = {
  workspace_id: "ws-1",
  summary: {
    total_goals: 1,
    active_goals: 1,
    completed_goals: 0,
    total_target_amount: 5000.0,
    total_saved_amount: 2500.0,
    overall_percentage: 50.0,
  },
  goals: [
    {
      id: "g-1",
      workspace_id: "ws-1",
      user_id: 1,
      name: "Reserva de Emergência",
      target_amount: 5000.0,
      current_amount: 2500.0,
      target_date: "2026-12-31",
      status: "active",
      progress_percentage: 50.0,
      remaining_amount: 2500.0,
      days_remaining: 120,
    },
  ],
};

vi.mocked(api.get).mockImplementation((url: string) => {
  if (url === "/workspaces") return Promise.resolve({ data: mockWorkspaces }) as any;
  if (url.includes("/categories")) return Promise.resolve({ data: mockCategories }) as any;
  if (url.includes("/budgets")) return Promise.resolve({ data: mockBudgetsResponse }) as any;
  if (url.includes("/goals")) return Promise.resolve({ data: mockGoalsResponse }) as any;
  return Promise.resolve({ data: [] }) as any;
});

function renderBudgets() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <WorkspaceProvider>
          <BudgetsAndGoals />
        </WorkspaceProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Página de Orçamentos e Metas", () => {
  it("deve renderizar a aba de orçamentos por categoria com KPIs e cards de limite", async () => {
    renderBudgets();

    expect(screen.getByText(/Orçamentos e Metas/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Alimentação")).toBeInTheDocument();
      expect(screen.getByText(/Atenção/i)).toBeInTheDocument();
    });
  });

  it("deve alternar para a aba de metas e exibir metas cadastradas", async () => {
    renderBudgets();

    const goalsTabBtn = screen.getByRole("button", { name: /Metas de Economia/i });
    fireEvent.click(goalsTabBtn);

    await waitFor(() => {
      expect(screen.getByText("Reserva de Emergência")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Depositar/i })).toBeInTheDocument();
    });
  });

  it("deve abrir o modal de novo orçamento ao clicar em Definir Orçamento", async () => {
    renderBudgets();

    const newBtn = screen.getByRole("button", { name: /Definir Orçamento/i });
    fireEvent.click(newBtn);

    await waitFor(() => {
      expect(screen.getByText(/Estabeleça um teto de despesas/i)).toBeInTheDocument();
    });
  });
});
