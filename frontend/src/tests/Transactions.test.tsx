import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Transactions from "@/pages/Transactions";
import api from "@/lib/api";

const mockAccounts = [
  {
    id: "acc-1",
    workspace_id: "ws-1",
    name: "Conta Inter",
    bank_name: "Banco Inter",
    account_type: "checking",
    initial_balance: 1000,
    color: "#FF7A00",
    status: "active",
  },
  {
    id: "acc-2",
    workspace_id: "ws-1",
    name: "Poupança Nubank",
    bank_name: "Nubank",
    account_type: "savings",
    initial_balance: 5000,
    color: "#820AD1",
    status: "active",
  },
];

const mockCategories = [
  {
    id: 1,
    workspace_id: "ws-1",
    name: "Salário",
    type: "income",
    color: "#10B981",
    icon: "TrendingUp",
  },
  {
    id: 2,
    workspace_id: "ws-1",
    name: "Alimentação",
    type: "expense",
    color: "#EF4444",
    icon: "Utensils",
  },
];

const mockTransactions = [
  {
    id: 101,
    workspace_id: "ws-1",
    description: "Salário Empresa X",
    amount: 5000,
    type: "income",
    date: "2026-09-05",
    category_id: 1,
    category_name: "Salário",
    category_color: "#10B981",
    account_id: "acc-1",
    account_name: "Conta Inter",
    account_color: "#FF7A00",
    account_bank_name: "Banco Inter",
  },
  {
    id: 102,
    workspace_id: "ws-1",
    description: "Almoço Restaurante",
    amount: 45,
    type: "expense",
    date: "2026-09-05",
    category_id: 2,
    category_name: "Alimentação",
    category_color: "#EF4444",
    credit_card_id: null,
    account_id: null,
  },
];

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    selectedWorkspaceId: "ws-1",
    selectedWorkspace: { id: "ws-1", name: "Finanças Pessoais", role: "owner" },
    hasWorkspace: true,
    isLoading: false,
  }),
}));

function renderTransactions() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Transactions />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Página de Transações - Suporte a Contas Bancárias", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes("/categories")) {
        return Promise.resolve({ data: mockCategories }) as any;
      }
      if (url.includes("/credit-cards")) {
        return Promise.resolve({ data: [] }) as any;
      }
      if (url.includes("/accounts")) {
        return Promise.resolve({ data: mockAccounts }) as any;
      }
      if (url.includes("/transactions/summary")) {
        return Promise.resolve({
          data: {
            total_income: 5000,
            total_expense: 45,
            balance: 4955,
            pending_invoices: 0,
          },
        }) as any;
      }
      if (url.includes("/transactions")) {
        return Promise.resolve({ data: mockTransactions }) as any;
      }
      return Promise.resolve({ data: [] }) as any;
    });

    vi.mocked(api.post).mockImplementation((url: string, data: any) => {
      if (url.includes("/transactions")) {
        return Promise.resolve({
          data: {
            id: 103,
            workspace_id: "ws-1",
            ...data,
          },
        }) as any;
      }
      return Promise.reject(new Error("Not found"));
    });

    vi.mocked(api.put).mockImplementation((url: string, data: any) => {
      if (url.includes("/transactions")) {
        return Promise.resolve({
          data: {
            id: 101,
            workspace_id: "ws-1",
            ...data,
          },
        }) as any;
      }
      return Promise.reject(new Error("Not found"));
    });
  });

  it("deve exibir transações com o badge da conta bancária vinculada", async () => {
    renderTransactions();

    expect(await screen.findByText("Salário Empresa X")).toBeInTheDocument();
    expect(screen.getByText("Conta Inter")).toBeInTheDocument();
    expect(screen.getByText("Almoço Restaurante")).toBeInTheDocument();
  });

  it("deve abrir o modal de novo lançamento e salvar com sucesso", async () => {
    renderTransactions();

    const newBtn = await screen.findByRole("button", { name: /Novo Lançamento/i });
    fireEvent.click(newBtn);

    expect(screen.getByRole("heading", { name: "Novo Lançamento" })).toBeInTheDocument();

    const descInput = screen.getByLabelText(/Descrição \*/i);
    fireEvent.change(descInput, { target: { value: "Pix Recebido" } });

    const amountInput = screen.getByLabelText(/Valor \(R\$\) \*/i);
    fireEvent.change(amountInput, { target: { value: "250" } });

    const submitBtn = screen.getByRole("button", { name: /Criar Lançamento/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/workspaces/ws-1/transactions",
        expect.objectContaining({
          description: "Pix Recebido",
          amount: 250,
        })
      );
    });
  });

  it("deve renderizar a barra de filtros incluindo filtro de contas", async () => {
    renderTransactions();

    expect(await screen.findByText("Filtros:")).toBeInTheDocument();
    expect(screen.getByText("Todas as contas")).toBeInTheDocument();
  });
});
