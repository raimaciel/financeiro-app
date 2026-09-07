import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Goals from "@/pages/Goals";
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
    currentWorkspace: { id: "ws-goals-test", name: "Workspace Metas" },
  }),
}));

const mockGoalsData = {
  workspace_id: "ws-goals-test",
  summary: {
    total_goals: 2,
    active_goals: 1,
    completed_goals: 1,
    total_target_amount: 15000.0,
    total_saved_amount: 8000.0,
    overall_percentage: 53.3,
  },
  goals: [
    {
      id: "goal-1",
      workspace_id: "ws-goals-test",
      name: "Reserva de Emerg�ncia",
      target_amount: 10000.0,
      current_amount: 3000.0,
      deadline: "2027-12-31",
      days_remaining: 450,
      progress_percentage: 30.0,
      remaining_amount: 7000.0,
      account_name: "Nubank",
      color: "#10b981",
      icon: "Target",
      status: "active",
    },
    {
      id: "goal-2",
      workspace_id: "ws-goals-test",
      name: "Viagem Praia",
      target_amount: 5000.0,
      current_amount: 5000.0,
      deadline: "2026-11-15",
      days_remaining: 30,
      progress_percentage: 100.0,
      remaining_amount: 0.0,
      color: "#3b82f6",
      icon: "Target",
      status: "completed",
    },
  ],
};

const mockAccounts = [
  { id: "acc-1", name: "Nubank", bank_name: "Nubank" },
  { id: "acc-2", name: "Inter", bank_name: "Inter" },
];

vi.mocked(api.get).mockImplementation((url: string) => {
  if (url.includes("/goals")) {
    return Promise.resolve({ data: mockGoalsData }) as any;
  }
  if (url.includes("/accounts")) {
    return Promise.resolve({ data: mockAccounts }) as any;
  }
  return Promise.resolve({ data: [] }) as any;
});

vi.mocked(api.post).mockResolvedValue({ data: { message: "Meta criada com sucesso!", goal: { id: "goal-new" } } } as any);
vi.mocked(api.patch).mockResolvedValue({ data: { message: "Sucesso!", current_amount: 3500.0, status: "active" } } as any);
vi.mocked(api.delete).mockResolvedValue({ data: { message: "Meta removida com sucesso!" } } as any);

function renderGoals() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Goals />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("P�gina de Metas Financeiras - Fase 10", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("1. deve renderizar o t�tulo, KPIs e os cards das metas", async () => {
    renderGoals();

    expect(screen.getByText("Metas Financeiras")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Reserva de Emerg�ncia")).toBeInTheDocument();
      expect(screen.getByText("Viagem Praia")).toBeInTheDocument();
      expect(screen.getByText("30.0% conclu�do")).toBeInTheDocument();
      expect(screen.getByText("100.0% conclu�do")).toBeInTheDocument();
    });
  });

  it("2. deve abrir modal 'Nova Meta', preencher formul�rio e submeter com sucesso", async () => {
    renderGoals();

    const newGoalBtn = screen.getByRole("button", { name: /Nova Meta/i });
    fireEvent.click(newGoalBtn);

    expect(screen.getByText("Nova Meta Financeira")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("Ex: Reserva de Emerg�ncia, Carro Novo");
    fireEvent.change(nameInput, { target: { value: "Comprar Notebook" } });

    const targetInput = screen.getByPlaceholderText("Ex: 10000,00");
    fireEvent.change(targetInput, { target: { value: "4500,00" } });

    const submitBtn = screen.getByRole("button", { name: /Criar Meta/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/workspaces/ws-goals-test/goals",
        expect.objectContaining({
          name: "Comprar Notebook",
          target_amount: 4500,
        })
      );
    });
  });

  it("3. deve abrir modal de aporte e registrar dep�sito na meta", async () => {
    renderGoals();

    await waitFor(() => {
      expect(screen.getByText("Reserva de Emerg�ncia")).toBeInTheDocument();
    });

    const depositBtn = screen.getByRole("button", { name: /Registrar Aporte/i });
    fireEvent.click(depositBtn);

    expect(screen.getByRole("heading", { name: /Registrar Aporte/i })).toBeInTheDocument();

    const amountInput = screen.getByPlaceholderText("Ex: 500,00");
    fireEvent.change(amountInput, { target: { value: "500,00" } });

    const confirmBtn = screen.getByRole("button", { name: /Confirmar Aporte/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/workspaces/ws-goals-test/goals/goal-1",
        { amount: 500 }
      );
    });
  });

  it("4. deve marcar meta como conclu�da manualmente ao clicar no bot�o correspondente", async () => {
    renderGoals();

    await waitFor(() => {
      expect(screen.getByText("Reserva de Emerg�ncia")).toBeInTheDocument();
    });

    const completeBtn = screen.getByTitle("Marcar como conclu�da manualmente");
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/workspaces/ws-goals-test/goals/goal-1/complete");
    });
  });

  it("5. deve excluir meta ao clicar no bot�o de lixeira", async () => {
    renderGoals();

    await waitFor(() => {
      expect(screen.getByText("Reserva de Emerg�ncia")).toBeInTheDocument();
    });

    const deleteBtns = screen.getAllByTitle("Excluir Meta");
    expect(deleteBtns.length).toBeGreaterThan(0);

    fireEvent.click(deleteBtns[0]);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/workspaces/ws-goals-test/goals/goal-1");
    });
  });
});
