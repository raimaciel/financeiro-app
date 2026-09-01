import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminUsers from "@/pages/AdminUsers";
import api from "@/lib/api";

const mockAdminUser = {
  id: 1,
  name: "Admin User",
  email: "admin@test.com",
  is_admin: true,
  isAdmin: true,
  is_active: true,
  isActive: true,
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockAdminUser,
    isLoading: false,
    token: "mock-token",
  }),
}));

const mockUsersList = [
  {
    id: 1,
    name: "Admin User",
    email: "admin@test.com",
    is_active: true,
    isActive: true,
    is_admin: true,
    isAdmin: true,
    created_at: "2026-08-01T10:00:00Z",
  },
  {
    id: 2,
    name: "Carlos Teste",
    email: "carlos@test.com",
    is_active: true,
    isActive: true,
    is_admin: false,
    isAdmin: false,
    created_at: "2026-08-15T12:00:00Z",
  },
];

// Convite que expira em 45 minutos (<= 2h)
const expiringDate = new Date(Date.now() + 45 * 60 * 1000).toISOString();

const mockInviteCodes = [
  {
    id: 10,
    code: "INV-EXPIRING",
    expires_at: expiringDate,
    max_uses: 5,
    uses_count: 1,
    created_at: "2026-09-01T10:00:00Z",
    status: "ativo",
  },
];

vi.mocked(api.get).mockImplementation((url: string) => {
  if (url === "/admin/users") return Promise.resolve({ data: mockUsersList }) as any;
  if (url === "/admin/invite-codes") return Promise.resolve({ data: mockInviteCodes }) as any;
  return Promise.resolve({ data: [] }) as any;
});

vi.mocked(api.patch).mockImplementation((url: string, payload: any) => {
  if (url === "/admin/users/2/toggle-status") {
    return Promise.resolve({
      data: {
        message: "Usuário bloqueado com sucesso",
        user: { id: 2, name: "Carlos Teste", email: "carlos@test.com", is_active: false },
      },
    }) as any;
  }
  if (url === "/admin/users/2") {
    return Promise.resolve({
      data: {
        message: "Usuário atualizado com sucesso",
        user: { id: 2, name: payload?.name || "Carlos Teste", email: "carlos@test.com", is_active: payload?.is_active, is_admin: payload?.is_admin },
      },
    }) as any;
  }
  return Promise.resolve({ data: {} }) as any;
});

vi.mocked(api.delete).mockImplementation((url: string) => {
  if (url.includes("/admin/invite-codes/10")) {
    return Promise.resolve({ data: { message: "Código de convite revogado com sucesso" } }) as any;
  }
  return Promise.resolve({ data: {} }) as any;
});

function renderAdminUsers() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AdminUsers />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Página de Painel do Administrador (Admin)", () => {
  it("deve renderizar os KPIs de usuários e a tabela de usuários", async () => {
    renderAdminUsers();

    expect(screen.getByText(/Painel do Administrador/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Carlos Teste")).toBeInTheDocument();
    });

    expect(screen.getByText("Total de Usuários")).toBeInTheDocument();
    expect(screen.getByText("Usuários Ativos")).toBeInTheDocument();
  });

  it("deve abrir o modal de edição, permitir alterar nome e permissão de admin, exibir alerta de promoção e confirmar salvamento", async () => {
    renderAdminUsers();

    await waitFor(() => {
      expect(screen.getByText("Carlos Teste")).toBeInTheDocument();
    });

    // Clica no botão de Editar do usuário Carlos (índice 1 da lista)
    const editBtns = screen.getAllByRole("button", { name: /Editar/i });
    fireEvent.click(editBtns[1]);

    // Modal de Edição Aberto
    expect(screen.getByText("Editar Usuário")).toBeInTheDocument();
    expect(screen.getByDisplayValue("carlos@test.com")).toBeDisabled();

    // Altera o Nome
    const nameInput = screen.getByLabelText("Nome Completo");
    fireEvent.change(nameInput, { target: { value: "Carlos Administrador" } });

    // Marca o checkbox de Administrador
    const adminCheckbox = screen.getByLabelText(/Privilégios de Administrador/i);
    fireEvent.click(adminCheckbox);

    // Clica em Salvar Alterações para abrir modal de confirmação
    const submitBtn = screen.getByRole("button", { name: "Salvar Alterações" });
    fireEvent.click(submitBtn);

    // Modal de Confirmação aberto com aviso de promoção a admin
    expect(screen.getByText("Confirmar Alterações")).toBeInTheDocument();
    expect(screen.getByText(/Promoção a Administrador/i)).toBeInTheDocument();

    // Confirma o salvamento
    const confirmBtn = screen.getByRole("button", { name: /Sim, confirmar e salvar/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/admin/users/2", {
        name: "Carlos Administrador",
        is_active: true,
        is_admin: true,
      });
    });
  });

  it("deve alternar para a aba de Códigos de Convite, exibir badge de alerta de expiração e exigir confirmação para revogar", async () => {
    renderAdminUsers();

    const tabTrigger = screen.getByRole("tab", { name: /Convite/i });
    fireEvent.click(tabTrigger);

    await waitFor(() => {
      expect(screen.getByText("INV-EXPIRING")).toBeInTheDocument();
    });

    // Verifica o badge de alerta de expiração (< 2h)
    expect(screen.getByText(/Expira em \d+min/i)).toBeInTheDocument();

    // Clica no botão de lixeira para abrir modal de confirmação
    const deleteBtn = screen.getByTitle("Revogar / Excluir convite");
    fireEvent.click(deleteBtn);

    // Modal de confirmação aberto
    expect(screen.getByText(/Deseja realmente revogar o convite/i)).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: /Sim, revogar/i });

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/admin/invite-codes/10");
    });
  });
});
