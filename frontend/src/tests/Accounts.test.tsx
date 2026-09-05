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

const mockTransfers = [
  {
    id: "tr-1",
    workspace_id: "ws-1",
    from_account_id: "acc-1",
    to_account_id: "acc-2",
    from_account_name: "Conta Corrente Inter",
    to_account_name: "Reserva de Emergência",
    amount: 1500,
    description: "Aporte mensal",
    date: "2026-09-05",
    created_at: "2026-09-05T12:00:00.000Z",
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
    vi.spyOn(window, "confirm").mockImplementation(() => true);

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes("/transfers")) {
        return Promise.resolve({ data: mockTransfers }) as any;
      }
      if (url.includes("/accounts")) {
        return Promise.resolve({ data: mockAccounts }) as any;
      }
      return Promise.resolve({ data: [] }) as any;
    });

    vi.mocked(api.post).mockImplementation((url: string, data: any) => {
      if (url.includes("/transfers")) {
        return Promise.resolve({
          data: {
            id: "tr-new",
            workspace_id: "ws-1",
            ...data,
          },
        }) as any;
      }
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

    vi.mocked(api.delete).mockImplementation((url: string) => {
      return Promise.resolve({ data: { message: "Excluído com sucesso" } }) as any;
    });
  });

  it("deve renderizar o título, KPIs e lista de contas cadastradas", async () => {
    renderAccounts();

    expect(await screen.findByText("Contas e Bancos")).toBeInTheDocument();
    expect(screen.getByText(/Cadastre suas contas bancárias/i)).toBeInTheDocument();

    // KPIs
    expect(screen.getByText("Total de Contas Ativas")).toBeInTheDocument();
    expect(screen.getByText("Saldo Inicial Consolidado")).toBeInTheDocument();

    // Contas (verificadas pelos títulos dos cards)
    expect(await screen.findByRole("heading", { name: "Conta Corrente Inter" })).toBeInTheDocument();
    expect(screen.getByText("Banco Inter")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reserva de Emergência" })).toBeInTheDocument();
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

  it("deve abrir o modal de transferência, preencher valor e transferir entre contas", async () => {
    renderAccounts();

    // Clica no botão "Transferir" do primeiro card
    const transferBtns = await screen.findAllByRole("button", { name: /Transferir/i });
    expect(transferBtns.length).toBeGreaterThan(0);
    fireEvent.click(transferBtns[0]);

    // O modal deve ser exibido
    expect(await screen.findByText("Transferir entre Contas")).toBeInTheDocument();

    // Preenche o valor
    const amountInput = screen.getByLabelText(/Valor \(R\$\) \*/i);
    fireEvent.change(amountInput, { target: { value: "500" } });

    // Preenche a descrição
    const descInput = screen.getByLabelText(/Descrição/i);
    fireEvent.change(descInput, { target: { value: "Reserva de emergência" } });

    // Submete o formulário
    const submitBtn = screen.getByRole("button", { name: /Confirmar Transferência/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/workspaces/ws-1/transfers",
        expect.objectContaining({
          amount: 500,
          description: "Reserva de emergência",
        })
      );
    });
  });

  it("deve exibir o histórico de transferências e permitir exclusão", async () => {
    renderAccounts();

    expect(await screen.findByText("Histórico de Transferências")).toBeInTheDocument();
    expect(await screen.findByText("Aporte mensal")).toBeInTheDocument();

    const deleteBtn = await screen.findByTitle("Excluir transferência");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/workspaces/ws-1/transfers/tr-1");
    });
  });
});
