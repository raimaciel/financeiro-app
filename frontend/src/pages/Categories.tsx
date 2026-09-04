import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Category } from "@/types";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  Loader2,
  Tags,
  ShoppingCart,
  Home,
  Car,
  Utensils,
  Heart,
  Briefcase,
  GraduationCap,
  Plane,
  Gift,
  TrendingUp,
  DollarSign,
  Smartphone,
  Music,
  Coffee,
  Shirt,
  Dumbbell,
  Baby,
  Stethoscope,
  Zap,
  Droplets,
  Wifi,
  Bus,
  PiggyBank,
  Building2,
  TreePine,
  ShoppingBag,
  Wallet,
  CircleDollarSign,
} from "lucide-react";

// ── Ícones disponíveis ──────────────────────────────────────────────────────

const ICONS: Record<string, React.ReactNode> = {
  ShoppingCart: <ShoppingCart className="h-4 w-4" />,
  Home: <Home className="h-4 w-4" />,
  Car: <Car className="h-4 w-4" />,
  Utensils: <Utensils className="h-4 w-4" />,
  Heart: <Heart className="h-4 w-4" />,
  Briefcase: <Briefcase className="h-4 w-4" />,
  GraduationCap: <GraduationCap className="h-4 w-4" />,
  Plane: <Plane className="h-4 w-4" />,
  Gift: <Gift className="h-4 w-4" />,
  TrendingUp: <TrendingUp className="h-4 w-4" />,
  DollarSign: <DollarSign className="h-4 w-4" />,
  Smartphone: <Smartphone className="h-4 w-4" />,
  Music: <Music className="h-4 w-4" />,
  Coffee: <Coffee className="h-4 w-4" />,
  Shirt: <Shirt className="h-4 w-4" />,
  Dumbbell: <Dumbbell className="h-4 w-4" />,
  Baby: <Baby className="h-4 w-4" />,
  Stethoscope: <Stethoscope className="h-4 w-4" />,
  Zap: <Zap className="h-4 w-4" />,
  Droplets: <Droplets className="h-4 w-4" />,
  Wifi: <Wifi className="h-4 w-4" />,
  Bus: <Bus className="h-4 w-4" />,
  PiggyBank: <PiggyBank className="h-4 w-4" />,
  Building2: <Building2 className="h-4 w-4" />,
  TreePine: <TreePine className="h-4 w-4" />,
  ShoppingBag: <ShoppingBag className="h-4 w-4" />,
  Wallet: <Wallet className="h-4 w-4" />,
  CircleDollarSign: <CircleDollarSign className="h-4 w-4" />,
};

const ICON_KEYS = Object.keys(ICONS);

// Ícone grande (para preview e cards)
const ICONS_LG: Record<string, React.ReactNode> = Object.fromEntries(
  Object.entries(ICONS).map(([k]) => [
    k,
    React.cloneElement(ICONS[k] as React.ReactElement, { className: "h-5 w-5" }),
  ])
);

// ── Paleta de cores ──────────────────────────────────────────────────────────

const COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308",
  "#84CC16", "#22C55E", "#10B981", "#14B8A6",
  "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6",
  "#A855F7", "#EC4899", "#F43F5E", "#64748B",
];

// ── API calls ──────────────────────────────────────────────────────────────

const fetchCategories = async (workspaceId: string): Promise<Category[]> => {
  const res = await api.get(`/workspaces/${workspaceId}/categories`);
  return res.data;
};

const createCategory = async ({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: { name: string; type: string; color: string; icon: string };
}) => {
  const res = await api.post(`/workspaces/${workspaceId}/categories`, data);
  return res.data;
};

const updateCategory = async ({
  workspaceId,
  id,
  data,
}: {
  workspaceId: string;
  id: number;
  data: { name: string; type: string; color: string; icon: string };
}) => {
  const res = await api.put(`/workspaces/${workspaceId}/categories/${id}`, data);
  return res.data;
};

const deleteCategory = async ({
  workspaceId,
  id,
}: {
  workspaceId: string;
  id: number;
}) => {
  const res = await api.delete(`/workspaces/${workspaceId}/categories/${id}`);
  return res.data;
};

// ── Toast ──────────────────────────────────────────────────────────────────

interface ToastState { message: string; type: "success" | "error" }

// ── Form ───────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  type: "income" | "expense";
  color: string;
  icon: string;
}
const EMPTY_FORM: FormState = {
  name: "",
  type: "expense",
  color: "#3B82F6",
  icon: "ShoppingCart",
};

type FormMode = "create" | "edit";

// ── Componente principal ───────────────────────────────────────────────────

export default function Categories() {
  const queryClient = useQueryClient();

  // workspace selecionado
  const {
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    selectedWorkspace,
    hasWorkspace,
    isLoading: loadingWorkspaces,
  } = useWorkspace();

  // toast
  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // aba ativa
  const [activeTab, setActiveTab] = useState<"expense" | "income">("expense");

  // modal criar/editar
  const [modalOpen, setModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  // confirmação exclusão
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────

  const {
    data: categories = [],
    isLoading: loadingCategories,
    isError: errorCategories,
  } = useQuery({
    queryKey: ["categories", selectedWorkspaceId],
    queryFn: () => fetchCategories(selectedWorkspaceId),
    enabled: !!selectedWorkspaceId,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", selectedWorkspaceId] });
      showToast("Categoria criada com sucesso!", "success");
      closeModal();
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error || "Erro ao criar categoria");
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", selectedWorkspaceId] });
      showToast("Categoria atualizada com sucesso!", "success");
      closeModal();
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error || "Erro ao atualizar categoria");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", selectedWorkspaceId] });
      showToast("Categoria excluída com sucesso!", "success");
      setDeleteTarget(null);
      setDeleteError("");
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || "Erro ao excluir categoria";
      setDeleteError(msg);
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, type: activeTab });
    setFormError("");
    setFormMode("create");
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setForm({
      name: cat.name,
      type: cat.type,
      color: cat.color,
      icon: cat.icon,
    });
    setFormError("");
    setFormMode("edit");
    setEditingId(cat.id);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!hasWorkspace) {
      setFormError("Nenhum workspace selecionado. Crie ou selecione um workspace primeiro.");
      return;
    }

    if (!form.name.trim()) {
      setFormError("O nome da categoria é obrigatório.");
      return;
    }

    if (formMode === "create") {
      createMutation.mutate({ workspaceId: selectedWorkspaceId, data: form });
    } else if (editingId !== null) {
      updateMutation.mutate({ workspaceId: selectedWorkspaceId, id: editingId, data: form });
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  const filtered = categories.filter((c: Category) => c.type === activeTab);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg px-5 py-4 shadow-lg text-sm font-medium animate-in slide-in-from-bottom-4 ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorias</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize suas receitas e despesas por categoria.
          </p>
        </div>
        <Button
          id="btn-nova-categoria"
          onClick={openCreate}
          disabled={!selectedWorkspaceId}
          className="gap-2 sm:self-start"
        >
          <Plus className="h-4 w-4" />
          Nova Categoria
        </Button>
      </div>

      {/* Alerta quando não houver workspace selecionado */}
      {!hasWorkspace && !loadingWorkspaces && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Você ainda não tem nenhum workspace selecionado. Crie ou selecione um workspace no topo primeiro para adicionar categorias.
        </div>
      )}

      {/* Abas receita/despesa */}
      {selectedWorkspaceId && (
        <>
          <div className="flex gap-1 border-b">
            {(["expense", "income"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? tab === "expense"
                      ? "border-red-500 text-red-600"
                      : "border-green-500 text-green-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "expense" ? "💸 Despesas" : "💰 Receitas"}
                {!loadingCategories && (
                  <Badge
                    variant="secondary"
                    className="ml-2 text-xs"
                  >
                    {categories.filter((c: Category) => c.type === tab).length}
                  </Badge>
                )}
              </button>
            ))}
          </div>

          {/* Loading categorias */}
          {loadingCategories && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Erro */}
          {errorCategories && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Não foi possível carregar as categorias. Tente recarregar.
            </div>
          )}

          {/* Lista vazia */}
          {!loadingCategories && !errorCategories && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
              <Tags className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-semibold">
                Nenhuma {activeTab === "expense" ? "despesa" : "receita"} cadastrada
              </p>
              <p className="text-sm text-muted-foreground mt-1 mb-5">
                Crie sua primeira categoria de {activeTab === "expense" ? "despesa" : "receita"}.
              </p>
              <Button onClick={openCreate} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Criar categoria
              </Button>
            </div>
          )}

          {/* Grid de categorias */}
          {!loadingCategories && filtered.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.map((cat: Category) => (
                <Card
                  key={cat.id}
                  className="group flex items-center gap-3 p-3 hover:shadow-md transition-shadow"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: cat.color }}
                  >
                    {ICONS_LG[cat.icon] ?? <Tags className="h-5 w-5" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cat.type === "income" ? "Receita" : "Despesa"}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => openEdit(cat)}
                        className="gap-2 cursor-pointer"
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => { setDeleteTarget(cat); setDeleteError(""); }}
                        className="gap-2 cursor-pointer text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal criar/editar */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {formMode === "create" ? "Nova Categoria" : "Editar Categoria"}
            </DialogTitle>
            <DialogDescription>
              {selectedWorkspace
                ? `Workspace: ${selectedWorkspace.name}`
                : "Configure os dados da categoria."}
            </DialogDescription>
          </DialogHeader>

          <form id="category-form" onSubmit={handleSubmit} className="space-y-5 py-2">
            {formError && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="cat-name">Nome</Label>
              <Input
                id="cat-name"
                placeholder="Ex: Alimentação"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={isMutating}
                autoFocus
              />
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo</Label>
              <div className="flex gap-2">
                {(["expense", "income"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                      form.type === t
                        ? t === "expense"
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-green-500 bg-green-50 text-green-700"
                        : "border-slate-200 text-muted-foreground hover:bg-slate-50"
                    }`}
                  >
                    {t === "expense" ? "💸 Despesa" : "💰 Receita"}
                  </button>
                ))}
              </div>
            </div>

            {/* Cor */}
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color }))}
                    className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${
                      form.color === color
                        ? "ring-2 ring-offset-2 ring-slate-900 scale-110"
                        : ""
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>

            {/* Ícone */}
            <div className="space-y-2">
              <Label>Ícone</Label>
              <div className="grid grid-cols-7 gap-1.5 max-h-40 overflow-y-auto pr-1">
                {ICON_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, icon: key }))}
                    title={key}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-colors ${
                      form.icon === key
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 hover:bg-slate-100 text-slate-600"
                    }`}
                  >
                    {ICONS[key]}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 border p-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: form.color }}
              >
                {ICONS_LG[form.icon] ?? <Tags className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-sm font-medium">{form.name || "Nome da categoria"}</p>
                <p className="text-xs text-muted-foreground">
                  {form.type === "expense" ? "Despesa" : "Receita"}
                </p>
              </div>
            </div>
          </form>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeModal} disabled={isMutating}>
              Cancelar
            </Button>
            <Button type="submit" form="category-form" disabled={isMutating}>
              {isMutating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {formMode === "create" ? "Criando..." : "Salvando..."}
                </>
              ) : formMode === "create" ? (
                "Criar Categoria"
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal confirmação exclusão */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) { setDeleteTarget(null); setDeleteError(""); }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Excluir Categoria</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a categoria{" "}
              <span className="font-semibold text-foreground">
                "{deleteTarget?.name}"
              </span>
              ? Categorias vinculadas a transações não podem ser removidas.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {deleteError}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setDeleteTarget(null); setDeleteError(""); }}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteTarget &&
                deleteMutation.mutate({
                  workspaceId: selectedWorkspaceId,
                  id: deleteTarget.id,
                })
              }
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