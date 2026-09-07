import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Budgets from "@/pages/Budgets";
import api from "@/lib/api";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    currentWorkspace: { id: "ws-budgets-test", name: "Workspace Teste" },
  }),
}));

const mockBudgetsData = {
  workspace_id: "ws-budgets-test",
  month: "2026-10",
  summary: {
    total_budgeted: 1800.0,
    total_spent: 1250.0,
    total_remaining: 550.0,
    total_count: 2,
    ok_count: 1,
    warning_count: 1,
    exceeded_count: 0,
    in_alert_count: 1,
  },
  budgets: [
    {
      id: "b-1",
      workspace_id: "ws-budgets-test",
      category_id: 1,
      category_name: "Alimenta��o",
      category_color: "#ef4444",
      monthly_limit: 1000.0,
      spent_amount: 850.0,
      remaining_amount: 150.0,
      percentage_used: 85.0,
      alert_threshold_percent: 80,
      status: "warning",
    },
    {
      id: "b-2",
      workspace_id: "ws-budgets-test",
      category_id: 2,
      category_name: "Transporte",
      category_color: "#3b82f6",
      monthly_limit: 800.0,
      spent_amount: 400.0,
      remaining_amount: 400.0,
      percentage_used: 50.0,
      alert_threshold_percent: 80,
      status: "ok",
    },
  ],
};

const mockCategories = [
  { id: 1, name: "Alimenta��o", type: "expense" },
  { id: 2, name: "Transporte", type: "expense" },
  { id: 3, name: "Lazer", type: "expense" },
];

vi.mocked(api.get).mockImplementation((url: string) => {
  if (url.includes("/budgets")) {
    return Promise.resolve({ data: mockBudgetsData }) as any;
  }
  if (url.includes("/categories")) {
    return Promise.resolve({ data: mockCategories }) as any;
  }
  return Promise.resolve({ data: [] }) as any;
});

vi.mocked(api.post).mockResolvedValue({ data: { message: "Or�amento definido com sucesso!", id: "b-new" } } as any);
vi.mocked(api.delete).mockResolvedValue({ data: { message: "Or�amento removido com sucesso!" } } as any);

function renderBudgets() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Budgets />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("P�gina de Or�amentos por Categoria - Fase 10", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("1. deve renderizar o t�tulo, KPIs de resumo e a listagem de or�amentos", async () => {
    renderBudgets();

    expect(screen.getByText("Or�amentos por Categoria")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Alimenta��o")).toBeInTheDocument();
      expect(screen.getByText("Transporte")).toBeInTheDocument();
      expect(screen.getByText("85.0%")).toBeInTheDocument();
      expect(screen.getByText("50.0%")).toBeInTheDocument();
    });
  });

  it("2. deve exibir o status correto por cor e badges (Aten��o para 85% e Normal para 50%)", async () => {
    renderBudgets();

    await waitFor(() => {
      expect(screen.getByText("Aten��o")).toBeInTheDocument();
      expect(screen.getByText("Normal")).toBeInTheDocument();
    });
  });

  it("3. deve abrir o modal ao clicar em 'Definir Or�amento' e submeter com sucesso", async () => {
    renderBudgets();

    await waitFor(() => {
      expect(screen.getByText("Alimenta��o")).toBeInTheDocument();
    });

    const openModalBtn = screen.getByRole("button", { name: /Definir Or�amento/i });
    fireEvent.click(openModalBtn);

    expect(screen.getByText("Definir Or�amento Mensal")).toBeInTheDocument();

    // Seleciona categoria
    const categorySelect = screen.getByRole("combobox");
    fireEvent.change(categorySelect, { target: { value: "3" } });

    // Preenche valor
    const limitInput = screen.getByPlaceholderText("Ex: 800,00");
    fireEvent.change(limitInput, { target: { value: "600,00" } });

    // Submete
    const saveBtn = screen.getByRole("button", { name: /Salvar Or�amento/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/workspaces/ws-budgets-test/budgets",
        expect.objectContaining({
          category_id: 3,
          limit_amount: 600,
        })
      );
    });
  });

  it("4. deve disparar exclus�o ao clicar no �cone de lixeira", async () => {
    renderBudgets();

    await waitFor(() => {
      expect(screen.getByText("Alimenta��o")).toBeInTheDocument();
    });

    const deleteBtns = screen.getAllByTitle("Excluir Or�amento");
    expect(deleteBtns.length).toBeGreaterThan(0);

    fireEvent.click(deleteBtns[0]);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/workspaces/ws-budgets-test/budgets/b-1");
    });
  });
});
