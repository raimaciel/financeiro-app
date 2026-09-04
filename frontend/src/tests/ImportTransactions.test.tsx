import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ImportTransactions from "@/pages/ImportTransactions";
import * as pdfParser from "@/utils/pdfParser";
import api from "@/lib/api";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, name: "Usuário Teste", email: "teste@teste.com" },
    token: "valid-token",
    isLoading: false,
  }),
}));

const mockWorkspaces = [{ id: "ws-1", name: "Workspace Teste", type: "personal", role: "owner" }];
const mockCategories = [
  { id: 1, name: "Alimentação", color: "#FF5733", type: "expense" },
  { id: 2, name: "Transporte", color: "#3357FF", type: "expense" },
];
const mockCreditCards = [
  { id: "card-2583", name: "Caixa Sim Internacional", closing_day: 25, due_day: 10, limit_amount: 5000, last_four_digits: "2583" },
  { id: "card-2424", name: "Caixa Sim Internacional", closing_day: 25, due_day: 10, limit_amount: 3000, last_four_digits: "2424" },
];

const mockParseResponse = {
  filename: "extrato_nubank.csv",
  fileType: "csv" as const,
  totalCount: 2,
  duplicatesCount: 1,
  newCount: 1,
  summary: {
    bankName: "Nubank",
    fileType: "csv",
    startDate: "2026-08-01",
    endDate: "2026-08-30",
  },
  transactions: [
    {
      tempId: "tx-1",
      date: "2026-08-15",
      description: "Supermercado Extra",
      amount: 150.5,
      type: "expense" as const,
      categoryId: 1,
      categoryName: "Alimentação",
      installments: 1,
      installmentCurrent: 1,
      isPossibleDuplicate: false,
      duplicateReason: null,
      selected: true,
    },
    {
      tempId: "tx-2",
      date: "2026-08-16",
      description: "Uber *Trip",
      amount: 45.0,
      type: "expense" as const,
      categoryId: 2,
      categoryName: "Transporte",
      installments: 1,
      installmentCurrent: 1,
      isPossibleDuplicate: true,
      duplicateReason: "Transação similar já existe",
      selected: false,
    },
  ],
};

vi.mocked(api.get).mockImplementation((url: string) => {
  if (url === "/workspaces") return Promise.resolve({ data: mockWorkspaces }) as any;
  if (url.includes("/categories")) return Promise.resolve({ data: mockCategories }) as any;
  if (url.includes("/credit-cards")) return Promise.resolve({ data: mockCreditCards }) as any;
  return Promise.resolve({ data: [] }) as any;
});

vi.mocked(api.post).mockImplementation((url: string, data: any) => {
  if (url.includes("/import/preview")) {
    return Promise.resolve({
      data: {
        success: true,
        totalCount: 2,
        precisaRevisao: true,
        mesReferenciaFatura: "2026-09",
        anoFatura: 2026,
        mesFatura: 9,
        dataVencimento: "2026-09-10",
        transactions: [
          {
            id: "caixa-tx-1",
            date: "2026-09-06",
            dataTransacao: "06/06",
            dataCompetencia: "2026-09-06",
            dataParcial: "06/06",
            description: "NORMATEL HOME CENTER 03 DE 03 FORTALEZA",
            descricao: "NORMATEL HOME CENTER 03 DE 03 FORTALEZA",
            amount: 154.3,
            valor: 154.3,
            type: "expense",
            tipo: "D",
            cartao: "Caixa Sim Internacional (•••• 2583)",
            cardLabel: "Caixa Sim Internacional (•••• 2583)",
            cartaoDigitos: "2583",
            creditCardId: "card-2583",
            cartaoIdentificado: true,
            precisaRevisao: true,
            selected: true,
          },
          {
            id: "caixa-tx-2",
            date: "2026-09-07",
            dataTransacao: "07/05",
            dataCompetencia: "2026-09-07",
            dataParcial: "07/05",
            description: "AMAZONMKTPLC AMOPERACO 04 DE 04 RIO DE JANEIR",
            descricao: "AMAZONMKTPLC AMOPERACO 04 DE 04 RIO DE JANEIR",
            amount: 89.9,
            valor: 89.9,
            type: "expense",
            tipo: "D",
            cartao: "Caixa Sim Internacional (•••• 2583)",
            cardLabel: "Caixa Sim Internacional (•••• 2583)",
            cartaoDigitos: "2583",
            creditCardId: "card-2583",
            cartaoIdentificado: true,
            precisaRevisao: true,
            selected: true,
          },
        ],
      },
    }) as any;
  }
  if (url.includes("/import/parse")) return Promise.resolve({ data: mockParseResponse }) as any;
  if (url.includes("/import/confirm")) return Promise.resolve({ data: { success: true, count: 2, message: "2 transações importadas com sucesso!" } }) as any;
  return Promise.resolve({ data: {} }) as any;
});

function renderImport() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <WorkspaceProvider>
          <ImportTransactions />
        </WorkspaceProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Página de Importação de Extratos", () => {
  it("deve renderizar o título e a área de upload de arquivo", async () => {
    renderImport();
    expect(screen.getByText(/Importar Extrato Bancário/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Clique para selecionar ou arraste o arquivo aqui/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Conta \/ Cartão de Destino/i).length).toBeGreaterThan(0);
    });
  });

  it("deve renderizar o botão de processamento desabilitado sem arquivo", async () => {
    renderImport();
    const btn = await screen.findByRole("button", { name: /Processar Arquivo/i });
    expect(btn).toBeDisabled();
  });

  it("deve renderizar a tabela de preview quando o backend retornar transações analisadas (CSV)", async () => {
    const { container } = renderImport();

    await waitFor(() => {
      expect(screen.getAllByText(/Conta \/ Cartão de Destino/i).length).toBeGreaterThan(0);
    });

    const file = new File(["Data,Valor,Descricao\n2026-08-15,-150.50,Supermercado"], "extrato.csv", {
      type: "text/csv",
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput, { target: { files: [file] } });

    const submitBtn = await screen.findByRole("button", { name: /Processar Arquivo/i });
    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled();
    });

    fireEvent.click(submitBtn);

    const previewHeader = await screen.findByText(/Revisão do Extrato/i);
    expect(previewHeader).toBeInTheDocument();

    const descText = await screen.findByText("Supermercado Extra");
    expect(descText).toBeInTheDocument();
  });

  it("deve processar fatura Caixa exibindo descrição completa, competência da fatura e vinculação por últimos 4 dígitos (Bugs 1, 2 e 3)", async () => {
    vi.spyOn(pdfParser, "extractTextFromPdf").mockResolvedValue(`
CAIXA ECONOMICA FEDERAL
Vencimento: 10/09/2026

(Cartão 2583)
06/06 NORMATEL HOME CENTER 03 DE 03 FORTALEZA 154,30D
07/05 AMAZONMKTPLC AMOPERACO 04 DE 04 RIO DE JANEIR 89,90D
    `);

    const { container } = renderImport();

    await waitFor(() => {
      expect(screen.getAllByText(/Conta \/ Cartão de Destino/i).length).toBeGreaterThan(0);
    });

    const caixaPdf = new File(["%PDF dummy caixa"], "fatura_caixa.pdf", {
      type: "application/pdf",
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [caixaPdf] } });

    const submitBtn = await screen.findByRole("button", { name: /Processar Arquivo/i });
    fireEvent.click(submitBtn);

    // Banner de revisão manual
    expect(await screen.findByText(/Fatura com Revisão Manual/i)).toBeInTheDocument();

    // Bug 1: Descrição completa sem corte de "03 DE 03 FORTALEZA"
    expect(await screen.findByDisplayValue("NORMATEL HOME CENTER 03 DE 03 FORTALEZA")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("AMAZONMKTPLC AMOPERACO 04 DE 04 RIO DE JANEIR")).toBeInTheDocument();

    // Bug 2: Data de competência da fatura exibida (2026-09-06) e indicação da compra original (06/06)
    expect(await screen.findByText("2026-09-06")).toBeInTheDocument();
    expect(await screen.findByText(/Compra: 06\/06/i)).toBeInTheDocument();

    // Bug 3: Vinculação automática com cartão cadastrado
    expect((await screen.findAllByText(/Vinculado automaticamente/i)).length).toBeGreaterThan(0);

    // Confirmar importação
    const confirmBtn = screen.getByRole("button", { name: /Confirmar Importação/i });
    fireEvent.click(confirmBtn);

    // Modal de confirmação
    expect(await screen.findByText(/Confirmar Gravação no Banco/i)).toBeInTheDocument();

    const saveBtn = screen.getByRole("button", { name: /Salvar Transações no Banco/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/import/confirm",
        expect.objectContaining({
          workspaceId: "ws-1",
          transactions: expect.arrayContaining([
            expect.objectContaining({
              date: "2026-09-06",
              dataCompetencia: "2026-09-06",
              dataTransacao: "06/06",
              descricao: "NORMATEL HOME CENTER 03 DE 03 FORTALEZA",
              creditCardId: "card-2583",
              valor: 154.3,
            }),
          ]),
        })
      );
    });
  });
});
