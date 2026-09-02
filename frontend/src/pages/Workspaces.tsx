import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Workspace } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Users,
  Briefcase,
  Heart,
  User,
  Loader2,
  FolderKanban,
} from "lucide-react";

// Helpers
const TYPE_LABELS: Record<string, string> = {
  personal: "Pessoal",
  couple: "Casal",
  business: "Empresa",
};

const TYPE_COLORS: Record<string, string> = {
  personal: "bg-blue-100 text-blue-700",
  couple: "bg-pink-100 text-pink-700",
  business: "bg-amber-100 text-amber-700",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  personal: <User className="h-5 w-5" />,
  couple: <Heart className="h-5 w-5" />,
  business: <Briefcase className="h-5 w-5" />,
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  editor: "Editor",
  viewer: "Visualizador",
};

// API calls
const fetchWorkspaces = async (): Promise<Workspace[]> => {
  const res = await api.get("/workspaces");
  return res.data;
};

const createWorkspace = async (data: { name: string; type: string }) => {
  try {
    const res = await api.post("/workspaces", data);
    return res.data;
  } catch (err) {
    console.error("[createWorkspace API call failed]:", err);
    throw err;
  }
};

const updateWorkspace = async ({
  id,
  data,
}: {
  id: string;
  data: { name: string; type: string };
}) => {
  try {
    const res = await api.put(`/workspaces/${id}`, data);
    return res.data;
  } catch (err) {
    console.error("[updateWorkspace API call failed]:", err);
    throw err;
  }
};

const deleteWorkspace = async (id: string) => {
  try {
    const res = await api.delete(`/workspaces/${id}`);
    return res.data;
  } catch (err) {
    console.error("[deleteWorkspace API call failed]:", err);
    throw err;
  }
};

interface ToastState {
  message: string;
  type: "success" | "error";
}

type FormMode = "create" | "edit";

interface FormState {
  name: string;
  type: "personal" | "couple" | "business";
}

const EMPTY_FORM: FormState = { name: "", type: "personal" };

export default function Workspaces() {
  const queryClient = useQueryClient();

  // Toast
  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Modal estado
  const [modalOpen, setModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  // Confirmação de exclusão
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  // Queries e mutations
  const { data: workspaces = [], isLoading, isError } = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces,
  });

  const createMutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      showToast("Workspace criado com sucesso!", "success");
      closeModal();
    },
    onError: (err: any) => {
      console.error("[createWorkspace Mutation Error]:", err);
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Erro ao criar workspace. Verifique sua conexão e tente novamente.";
      setFormError(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      showToast("Workspace atualizado com sucesso!", "success");
      closeModal();
    },
    onError: (err: any) => {
      console.error("[updateWorkspace Mutation Error]:", err);
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Erro ao atualizar workspace.";
      setFormError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      showToast("Workspace excluído com sucesso!", "success");
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      console.error("[deleteWorkspace Mutation Error]:", err);
      showToast(err.response?.data?.error || "Erro ao excluir workspace", "error");
      setDeleteTarget(null);
    },
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setFormMode("create");
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (ws: Workspace) => {
    setForm({ name: ws.name, type: ws.type });
    setFormError("");
    setFormMode("edit");
    setEditingId(ws.id);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(EMPTY_FORM);
    setFormError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!form.name.trim()) {
      setFormError("O nome do workspace é obrigatório.");
      return;
    }

    if (formMode === "create") {
      createMutation.mutate({ name: form.name.trim(), type: form.type });
    } else if (editingId) {
      updateMutation.mutate({ id: editingId, data: { name: form.name.trim(), type: form.type } });
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg px-5 py-4 shadow-lg text-sm font-medium transition-all animate-in slide-in-from-bottom-4 ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workspaces</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gerencie seus espaços financeiros (pessoal, casal ou empresa).
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 font-semibold shadow-xs">
          <Plus className="h-4 w-4" />
          Novo Workspace
        </Button>
      </div>

      {/* Estado de loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Estado de erro na listagem */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          Não foi possível carregar os workspaces. Tente recarregar a página.
        </div>
      )}

      {/* Estado vazio */}
      {!isLoading && !isError && workspaces.length === 0 && (
        <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 mb-3">
            <FolderKanban className="h-6 w-6" />
          </div>
          <CardTitle className="text-base">Nenhum workspace encontrado</CardTitle>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Crie seu primeiro workspace para começar a organizar suas contas e transações.
          </p>
          <Button onClick={openCreate} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Criar Workspace
          </Button>
        </Card>
      )}

      {/* Grid de cards */}
      {!isLoading && workspaces.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <Card
              key={ws.id}
              className="flex flex-col justify-between transition-shadow hover:shadow-md"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TYPE_COLORS[ws.type] || "bg-slate-100 text-slate-700"}`}>
                      {TYPE_ICONS[ws.type] || <FolderKanban className="h-5 w-5" />}
                    </div>
                    <div>
                      <CardTitle className="text-base leading-snug">{ws.name}</CardTitle>
                      <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[ws.type]}`}>
                        {TYPE_LABELS[ws.type] || ws.type}
                      </span>
                    </div>
                  </div>

                  {/* Menu de ações (só para owner) */}
                  {ws.role === "owner" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openEdit(ws)}
                          className="gap-2 cursor-pointer"
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(ws)}
                          className="gap-2 cursor-pointer text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex-1 pb-3">
                {ws.created_at && (
                  <p className="text-xs text-muted-foreground">
                    Criado em{" "}
                    {new Date(ws.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
              </CardContent>

              <CardFooter className="border-t pt-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span>Seu papel:</span>
                  <Badge variant="outline" className="text-xs py-0">
                    {ROLE_LABELS[ws.role ?? ""] ?? ws.role}
                  </Badge>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {formMode === "create" ? "Novo Workspace" : "Editar Workspace"}
            </DialogTitle>
            <DialogDescription>
              {formMode === "create"
                ? "Crie um novo espaço financeiro compartilhado ou pessoal."
                : "Atualize as informações do workspace."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {formError && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ws-name">Nome do workspace</Label>
              <Input
                id="ws-name"
                placeholder="Ex: Finanças da Casa"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={isMutating}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ws-type">Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(val) =>
                  setForm((f) => ({ ...f, type: val as FormState["type"] }))
                }
                disabled={isMutating}
              >
                <SelectTrigger id="ws-type">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4" /> Pessoal
                    </span>
                  </SelectItem>
                  <SelectItem value="couple">
                    <span className="flex items-center gap-2">
                      <Heart className="h-4 w-4" /> Casal
                    </span>
                  </SelectItem>
                  <SelectItem value="business">
                    <span className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" /> Empresa
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeModal} disabled={isMutating}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isMutating}>
                {isMutating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {formMode === "create" ? "Criando..." : "Salvando..."}
                  </>
                ) : formMode === "create" ? (
                  "Criar Workspace"
                ) : (
                  "Salvar Alterações"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal confirmação de exclusão */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Excluir Workspace</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o workspace{" "}
              <span className="font-semibold text-foreground">
                "{deleteTarget?.name}"
              </span>
              ? Esta ação não pode ser desfeita e todos os membros serão removidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Sim, excluir
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
