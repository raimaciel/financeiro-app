import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
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
  { id: "card-1", name: "Nubank Roxinho (6768)", closing_day: 25, due_day: 5, limit_amount: 5000, last_four_digits: "6768" },
  { id: "card-2", name: "Inter Adicional (1711)", closing_day: 20, due_day: 10, limit_amount: 3000, last_four_digits: "1711" },
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
        transactions: [
          {
            dataParcial: "05/03",
            descricao: "SUPERMERCADO ABC",
            valor: 154.3,
            tipo: "D",
            cartao: "Cartão 1234",
            precisaRevisao: true,
          },
          {
            dataParcial: "15/03",
            descricao: "ESTORNO COMPRA",
            valor: 80.0,
            tipo: "C",
            cartao: "Cartão 1234",
            precisaRevisao: true,
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
        <ImportTransactions />
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

  it("deve processar fatura em PDF e exibir transações agrupadas por múltiplos cartões", async () => {
    vi.spyOn(pdfParser, "extractTextFromPdf").mockResolvedValue(`
Fatura de Cartão - Vencimento: 15/09/2026
Cartão Titular 5555****6768
10/08 Supermercado Pão de Açúcar 250,00
12/08 Uber *Trip 35,50

Cartão Adicional 543882*******1711
15/08 Farmácia Drogasil 89,90
    `);

    const { container } = renderImport();

    await waitFor(() => {
      expect(screen.getAllByText(/Conta \/ Cartão de Destino/i).length).toBeGreaterThan(0);
    });

    const pdfFile = new File(["%PDF-1.4 dummy content"], "fatura_agosto.pdf", {
      type: "application/pdf",
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    const submitBtn = await screen.findByRole("button", { name: /Processar Arquivo/i });
    fireEvent.click(submitBtn);

    const multiCardBadge = await screen.findByText((c) => c.includes("Múltiplos Cartões"));
    expect(multiCardBadge).toBeInTheDocument();

    expect((await screen.findAllByText(/6768/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/1711/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText("Supermercado Pão de Açúcar")).toBeInTheDocument();
    expect(await screen.findByText("Farmácia Drogasil")).toBeInTheDocument();
  });

  it("deve processar fatura Caixa com REVISÃO MANUAL exibindo campo ANO editável e sem adivinhar ano", async () => {
    vi.spyOn(pdfParser, "extractTextFromPdf").mockResolvedValue(`
CAIXA ECONOMICA FEDERAL
Nome do Titular: JOAO DA SILVA
CPF: 123.456.789-00

(Cartão 1234)
05/03 SUPERMERCADO ABC 154,30D
15/03 ESTORNO COMPRA 80,00C
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
    expect(await screen.findByText(/Fatura com Revisão Manual Obrigatória/i)).toBeInTheDocument();

    // Verificar Data Parcial e valor
    expect(await screen.findByText("05/03")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("SUPERMERCADO ABC")).toBeInTheDocument();

    // Botão Confirmar Importação
    const confirmBtn = screen.getByRole("button", { name: /Confirmar Importação/i });
    expect(confirmBtn).toBeInTheDocument();

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
              dataParcial: "05/03",
              ano: 2026,
              descricao: "SUPERMERCADO ABC",
              valor: 154.3,
            }),
          ]),
        })
      );
    });
  });
});
