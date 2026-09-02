import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Workspaces from "@/pages/Workspaces";
import api from "@/lib/api";

const mockWorkspaces = [
  {
    id: "ws-1",
    name: "Finanças Pessoais",
    type: "personal",
    role: "owner",
    created_at: "2026-08-01T10:00:00.000Z",
  },
  {
    id: "ws-2",
    name: "Conta Conjunta",
    type: "couple",
    role: "editor",
    created_at: "2026-08-15T12:00:00.000Z",
  },
];

function renderWorkspaces() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Workspaces />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Página de Workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/workspaces") return Promise.resolve({ data: mockWorkspaces }) as any;
      return Promise.resolve({ data: [] }) as any;
    });

    vi.mocked(api.post).mockImplementation((url: string, data: any) => {
      if (url === "/workspaces") {
        return Promise.resolve({
          data: {
            id: "ws-new",
            name: data.name,
            type: data.type,
            role: "owner",
          },
        }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });

    vi.mocked(api.put).mockImplementation((url: string, data: any) => {
      return Promise.resolve({ data: { id: "ws-1", ...data } }) as any;
    });

    vi.mocked(api.delete).mockImplementation(() => {
      return Promise.resolve({ data: { success: true } }) as any;
    });
  });

  it("deve renderizar a listagem de workspaces com título e cards", async () => {
    renderWorkspaces();

    expect(screen.getByRole("heading", { name: "Workspaces" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Finanças Pessoais")).toBeInTheDocument();
      expect(screen.getByText("Conta Conjunta")).toBeInTheDocument();
    });
  });

  it("deve abrir o modal de 'Novo Workspace' e submeter o formulário disparando a requisição à API", async () => {
    renderWorkspaces();

    await waitFor(() => {
      expect(screen.getByText("Finanças Pessoais")).toBeInTheDocument();
    });

    const newBtn = screen.getByRole("button", { name: /Novo Workspace/i });
    fireEvent.click(newBtn);

    const nameInput = await screen.findByLabelText(/Nome do workspace/i);
    expect(nameInput).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: "Minha Empresa" } });

    const submitBtn = screen.getByRole("button", { name: "Criar Workspace" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/workspaces", {
        name: "Minha Empresa",
        type: "personal",
      });
    });
  });

  it("deve exibir mensagem de erro no modal quando a API recusar", async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: { data: { error: "Nome do workspace já existe" } },
    });

    renderWorkspaces();

    await waitFor(() => {
      expect(screen.getByText("Finanças Pessoais")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Novo Workspace/i }));

    const nameInput = await screen.findByLabelText(/Nome do workspace/i);
    fireEvent.change(nameInput, { target: { value: "Workspace Duplicado" } });

    const submitBtn = screen.getByRole("button", { name: "Criar Workspace" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Nome do workspace já existe")).toBeInTheDocument();
    });
  });
});
