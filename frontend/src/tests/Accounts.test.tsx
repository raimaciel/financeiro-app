import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Accounts from "@/pages/Accounts";
import api from "@/lib/api";

const mockAccounts = [
  {
    id: "acc-1",
    workspace_id: "ws-1",
    name: "Conta Corrente Inter",
    bank_name: "Banco Inter",
    account_type: "checking",
    initial_balance: 2500,
    color: "#FF7A00",
    status: "active",
    created_at: "2026-09-01T10:00:00.000Z",
  },
  {
    id: "acc-2",
    workspace_id: "ws-1",
    name: "Reserva de Emergência",
    bank_name: "Nubank",
    account_type: "savings",
    initial_balance: 10000,
    color: "#820AD1",
    status: "active",
    created_at: "2026-09-02T10:00:00.000Z",
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

function renderAccounts() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Accounts />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Página de Contas e Bancos", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes("/accounts")) {
        return Promise.resolve({ data: mockAccounts }) as any;
      }
      return Promise.resolve({ data: [] }) as any;
    });

    vi.mocked(api.post).mockImplementation((url: string, data: any) => {
      if (url.includes("/accounts")) {
        return Promise.resolve({
          data: {
            id: "acc-new",
            workspace_id: "ws-1",
            ...data,
            status: "active",
          },
        }) as any;
      }
      return Promise.reject(new Error("Not found"));
    });
  });

  it("deve renderizar o título, KPIs e lista de contas cadastradas", async () => {
    renderAccounts();

    expect(await screen.findByText("Contas e Bancos")).toBeInTheDocument();
    expect(screen.getByText(/Cadastre suas contas bancárias/i)).toBeInTheDocument();

    // KPIs
    expect(screen.getByText("Total de Contas Ativas")).toBeInTheDocument();
    expect(screen.getByText("Saldo Inicial Consolidado")).toBeInTheDocument();

    // Contas
    expect(await screen.findByText("Conta Corrente Inter")).toBeInTheDocument();
    expect(screen.getByText("Banco Inter")).toBeInTheDocument();
    expect(screen.getByText("Reserva de Emergência")).toBeInTheDocument();
    expect(screen.getByText("Nubank")).toBeInTheDocument();
  });

  it("deve abrir o modal de 'Nova Conta' e submeter com sucesso", async () => {
    renderAccounts();

    const newBtn = await screen.findByRole("button", { name: /Nova Conta/i });
    fireEvent.click(newBtn);

    expect(screen.getByText("Nova Conta Bancária")).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Nome da Conta/i);
    fireEvent.change(nameInput, { target: { value: "Carteira Dinheiro" } });

    const bankInput = screen.getByLabelText(/Banco \/ Instituição/i);
    fireEvent.change(bankInput, { target: { value: "Espécie" } });

    const balanceInput = screen.getByLabelText(/Saldo Inicial/i);
    fireEvent.change(balanceInput, { target: { value: "350" } });

    const submitBtn = screen.getByRole("button", { name: /Criar Conta/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/workspaces/ws-1/accounts",
        expect.objectContaining({
          name: "Carteira Dinheiro",
          bank_name: "Espécie",
          initial_balance: 350,
        })
      );
    });
  });
});
