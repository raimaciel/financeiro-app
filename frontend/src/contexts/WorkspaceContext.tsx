import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Workspace } from "@/types";

// Chave de persistencia no localStorage
const STORAGE_KEY = "financeiro_workspace_id";

interface WorkspaceContextData {
  /** Lista completa de workspaces do usuario */
  workspaces: Workspace[];
  /** ID do workspace atualmente selecionado */
  selectedWorkspaceId: string;
  /** Objeto completo do workspace selecionado */
  selectedWorkspace: Workspace | undefined;
  /** true enquanto a lista de workspaces esta sendo buscada */
  isLoading: boolean;
  /** true se ha um workspace valido selecionado */
  hasWorkspace: boolean;
  /** Troca o workspace ativo e persiste em localStorage */
  setSelectedWorkspaceId: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextData | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [selectedWorkspaceId, setSelectedWorkspaceIdState] = useState<string>(
    () => {
      try {
        return localStorage.getItem(STORAGE_KEY) ?? "";
      } catch {
        return "";
      }
    }
  );

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const res = await api.get("/workspaces");
      return res.data;
    },
    staleTime: 30_000,
  });

  // Auto-selecao: restaura do localStorage ou cai para workspaces[0].
  // Se o ID salvo nao existir mais (ex: apos reset de banco), usa o primeiro.
  useEffect(() => {
    if (isLoading || workspaces.length === 0) return;

    const ids = workspaces.map((w) => w.id);

    if (selectedWorkspaceId && ids.includes(selectedWorkspaceId)) {
      return; // ID salvo ainda e valido
    }

    const fallback = workspaces[0].id;
    setSelectedWorkspaceIdState(fallback);
    try {
      localStorage.setItem(STORAGE_KEY, fallback);
    } catch {
      // sem acesso ao localStorage
    }
  }, [workspaces, isLoading, selectedWorkspaceId]);

  const setSelectedWorkspaceId = (id: string) => {
    setSelectedWorkspaceIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // sem acesso ao localStorage
    }
  };

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);
  const hasWorkspace = Boolean(selectedWorkspaceId && selectedWorkspaceId.trim() !== "");

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        selectedWorkspaceId,
        selectedWorkspace,
        isLoading,
        hasWorkspace,
        setSelectedWorkspaceId,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextData {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error(
      "useWorkspace deve ser usado dentro de um <WorkspaceProvider>. " +
        "Certifique-se de que o WorkspaceProvider envolve as rotas que consomem esse hook."
    );
  }
  return context;
}
