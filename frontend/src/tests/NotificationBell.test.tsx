import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationsPopover } from "@/components/NotificationsPopover";
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

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockApiResponse = {
  workspace_id: "ws-test-bell",
  total_count: 4,
  unread_count: 3,
  notifications: [
    {
      id: "notif-inv-due",
      workspace_id: "ws-test-bell",
      type: "invoice_due",
      title: "Fatura próxima do vencimento: Cartão Black",
      message: "A fatura no valor de R$ 450.00 vence em 2 dia(s).",
      severity: "warning",
      related_link: "/credit-cards",
      is_read: false,
      created_at: "2026-10-10T10:00:00Z",
    },
    {
      id: "notif-inv-overdue",
      workspace_id: "ws-test-bell",
      type: "invoice_overdue",
      title: "Fatura vencida: Nubank",
      message: "A fatura no valor de R$ 900.00 venceu em 2026-10-01.",
      severity: "danger",
      related_link: "/credit-cards",
      is_read: false,
      created_at: "2026-10-02T10:00:00Z",
    },
    {
      id: "notif-low-balance",
      workspace_id: "ws-test-bell",
      type: "low_balance",
      title: "Saldo baixo: Conta Inter",
      message: "A conta Conta Inter está com saldo de R$ 42.50.",
      severity: "warning",
      related_link: "/accounts",
      is_read: false,
      created_at: "2026-10-10T08:00:00Z",
    },
    {
      id: "notif-read-item",
      workspace_id: "ws-test-bell",
      type: "transfer_completed",
      title: "Transferência Realizada",
      message: "Transferência de R$ 200.00 realizada.",
      severity: "info",
      related_link: "/transfers",
      is_read: true,
      created_at: "2026-10-09T14:00:00Z",
    },
  ],
};

vi.mocked(api.get).mockImplementation((url: string) => {
  if (url.includes("/notifications")) {
    return Promise.resolve({ data: mockApiResponse }) as any;
  }
  return Promise.resolve({ data: [] }) as any;
});

vi.mocked(api.patch).mockResolvedValue({ data: { success: true } } as any);
vi.mocked(api.delete).mockResolvedValue({ data: { success: true } } as any);

function renderBell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NotificationsPopover workspaceId="ws-test-bell" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("NotificationBell & Popover - Fase 9", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("1. deve renderizar o sino e o badge com o unread_count do backend", async () => {
    renderBell();

    const bellBtn = screen.getByRole("button", { name: /Notificações/i });
    expect(bellBtn).toBeInTheDocument();

    await waitFor(() => {
      const badge = screen.getByText("3");
      expect(badge).toBeInTheDocument();
    });
  });

  it("2. deve abrir o dropdown e exibir lista de alertas com títulos e mensagens", async () => {
    renderBell();

    const bellBtn = screen.getByRole("button", { name: /Notificações/i });
    fireEvent.click(bellBtn);

    await waitFor(() => {
      expect(screen.getByText("Fatura próxima do vencimento: Cartão Black")).toBeInTheDocument();
      expect(screen.getByText("Fatura vencida: Nubank")).toBeInTheDocument();
      expect(screen.getByText("Saldo baixo: Conta Inter")).toBeInTheDocument();
      expect(screen.getByText("Transferência Realizada")).toBeInTheDocument();
    });
  });

  it("3. deve chamar endpoint PATCH /read ao clicar em um alerta e navegar para o link relacionado", async () => {
    renderBell();

    const bellBtn = screen.getByRole("button", { name: /Notificações/i });
    fireEvent.click(bellBtn);

    const dueItem = await screen.findByText("Fatura próxima do vencimento: Cartão Black");
    fireEvent.click(dueItem);

    expect(api.patch).toHaveBeenCalledWith("/workspaces/ws-test-bell/notifications/notif-inv-due/read");
    expect(mockNavigate).toHaveBeenCalledWith("/credit-cards");
  });

  it("4. deve chamar endpoint PATCH /read-all ao clicar em 'Marcar lidas'", async () => {
    renderBell();

    const bellBtn = screen.getByRole("button", { name: /Notificações/i });
    fireEvent.click(bellBtn);

    const markAllBtn = await screen.findByRole("button", { name: /Marcar lidas/i });
    fireEvent.click(markAllBtn);

    expect(api.patch).toHaveBeenCalledWith("/workspaces/ws-test-bell/notifications/read-all");
  });

  it("5. deve chamar endpoint DELETE ao clicar no botão de dispensar notificação", async () => {
    renderBell();

    const bellBtn = screen.getByRole("button", { name: /Notificações/i });
    fireEvent.click(bellBtn);

    const deleteBtns = await screen.findAllByRole("button", { name: /Dispensar notificação/i });
    expect(deleteBtns.length).toBeGreaterThan(0);

    fireEvent.click(deleteBtns[0]);
    expect(api.delete).toHaveBeenCalledWith("/workspaces/ws-test-bell/notifications/notif-inv-due");
  });

  it("6. deve exibir estado vazio quando não houver notificações", async () => {
    vi.mocked(api.get).mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          workspace_id: "ws-test-bell",
          total_count: 0,
          unread_count: 0,
          notifications: [],
        },
      }) as any
    );

    renderBell();

    const bellBtn = screen.getByRole("button", { name: /Notificações/i });
    fireEvent.click(bellBtn);

    await waitFor(() => {
      expect(screen.getByText("Tudo em ordem!")).toBeInTheDocument();
      expect(screen.getByText("Nenhum alerta pendente no momento.")).toBeInTheDocument();
    });
  });
});
