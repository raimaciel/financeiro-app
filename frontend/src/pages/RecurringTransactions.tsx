import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  Workspace,
  Category,
  CreditCard,
  RecurringTransaction,
  SuggestedRecurring,
  RecurringListResponse,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Repeat,
  Plus,
  Play,
  Pause,
  Trash2,
  Pencil,
  MoreVertical,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Search,
  Check,
  X,
  CreditCard as CreditCardIcon,
  HelpCircle,
} from "lucide-react";

function formatCurrency(val: number): string {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface FormState {
  description: string;
  amount: number | string;
  type: "income" | "expense";
  category_id: string;
  credit_card_id: string;
  frequency: "monthly" | "weekly" | "yearly";
  day_of_month: string;
  start_date: string;
  end_date: string;
}

const EMPTY_FORM: FormState = {
  description: "",
  amount: "",
  type: "expense",
  category_id: "none",
  credit_card_id: "none",
  frequency: "monthly",
  day_of_month: "5",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
};

export default function RecurringTransactions() {
  const queryClient = useQueryClient();

  // Estados principais
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [activeTabFilter, setActiveTabFilter] = useState<"all" | "active" | "paused" | "expense" | "income">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringTransaction | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Lista de sugestões ignoradas localmente nesta sessão
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  // Mensagens de feedback
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 1. Busca Workspaces
  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const res = await api.get("/workspaces");
      return res.data;
    },
  });

  // Define workspace inicial
  React.useEffect(() => {
    if (workspaces.length > 0 && !selectedWorkspaceId) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
  }, [workspaces, selectedWorkspaceId]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId),
    [workspaces, selectedWorkspaceId]
  );

  const canEdit = activeWorkspace?.role !== "viewer";

  // 2. Busca Categorias do Workspace
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories", selectedWorkspaceId],
    queryFn: async () => {
      if (!selectedWorkspaceId) return [];
      const res = await api.get(`/workspaces/${selectedWorkspaceId}/categories`);
      return res.data;
    },
    enabled: !!selectedWorkspaceId,
  });

  // 3. Busca Cartões de Crédito do Workspace
  const { data: creditCards = [] } = useQuery<CreditCard[]>({
    queryKey: ["credit-cards", selectedWorkspaceId],
    queryFn: async () => {
      if (!selectedWorkspaceId) return [];
      const res = await api.get(`/workspaces/${selectedWorkspaceId}/credit-cards`);
      return res.data;
    },
    enabled: !!selectedWorkspaceId,
  });

  // 4. Busca Recorrências cadastradas
  const { data: recurringData, isLoading } = useQuery<RecurringListResponse>({
    queryKey: ["recurring", selectedWorkspaceId],
    queryFn: async () => {
      if (!selectedWorkspaceId) return { workspace_id: "", summary: { active_count: 0, paused_count: 0, total_count: 0, monthly_expenses_total: 0, monthly_income_total: 0, monthly_balance: 0 }, recurrings: [] };
      const res = await api.get(`/workspaces/${selectedWorkspaceId}/recurring`);
      return res.data;
    },
    enabled: !!selectedWorkspaceId,
  });

  // 5. Busca Sugestões Detectadas
  const { data: suggestionsData } = useQuery<{ suggestions: SuggestedRecurring[] }>({
    queryKey: ["recurring-suggestions", selectedWorkspaceId],
    queryFn: async () => {
      if (!selectedWorkspaceId) return { suggestions: [] };
      const res = await api.get(`/workspaces/${selectedWorkspaceId}/recurring/suggestions`);
      return res.data;
    },
    enabled: !!selectedWorkspaceId,
  });

  // 6. Mutação: Criar ou Editar Recorrência
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspaceId) throw new Error("Workspace não selecionado");

      const amountNum = typeof form.amount === "number" ? form.amount : Number(String(form.amount).replace(",", "."));
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error("Informe um valor positivo");
      }

      if (!form.description.trim()) {
        throw new Error("Informe a descrição da recorrência");
      }

      const payload = {
        description: form.description.trim(),
        amount: amountNum,
        type: form.type,
        category_id: form.category_id !== "none" ? Number(form.category_id) : null,
        credit_card_id: form.credit_card_id !== "none" ? form.credit_card_id : null,
        frequency: form.frequency,
        day_of_month: Number(form.day_of_month) || 5,
        start_date: form.start_date,
        end_date: form.end_date ? form.end_date : null,
      };

      if (editingItem) {
        return (await api.put(`/workspaces/${selectedWorkspaceId}/recurring/${editingItem.id}`, payload)).data;
      } else {
        return (await api.post(`/workspaces/${selectedWorkspaceId}/recurring`, payload)).data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["recurring-suggestions", selectedWorkspaceId] });
      setIsModalOpen(false);
      setEditingItem(null);
      setForm(EMPTY_FORM);
      setFormError(null);
      setToastMessage({ type: "success", text: editingItem ? "Recorrência atualizada com sucesso!" : "Recorrência cadastrada com sucesso!" });
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.error || err.message || "Erro ao salvar recorrência");
    },
  });

  // 7. Mutação: Pausar / Reativar
  const togglePauseMutation = useMutation({
    mutationFn: async (id: string) => {
      return (await api.patch(`/workspaces/${selectedWorkspaceId}/recurring/${id}/pause`)).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["recurring", selectedWorkspaceId] });
      setToastMessage({ type: "success", text: data.message || "Status da recorrência alterado!" });
    },
    onError: (err: any) => {
      setToastMessage({ type: "error", text: err?.response?.data?.error || "Erro ao alterar status" });
    },
  });

  // 8. Mutação: Excluir
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return (await api.delete(`/workspaces/${selectedWorkspaceId}/recurring/${id}`)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["recurring-suggestions", selectedWorkspaceId] });
      setToastMessage({ type: "success", text: "Recorrência removida com sucesso!" });
    },
    onError: (err: any) => {
      setToastMessage({ type: "error", text: err?.response?.data?.error || "Erro ao excluir recorrência" });
    },
  });

  // 9. Mutação: Gerar Transações Pendentes
  const generateMutation = useMutation({
    mutationFn: async (recurringId?: string) => {
      const payload = recurringId ? { recurringId } : {};
      return (await api.post(`/workspaces/${selectedWorkspaceId}/recurring/generate`, payload)).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["recurring", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setToastMessage({ type: "success", text: data.message || "Transações geradas com sucesso!" });
    },
    onError: (err: any) => {
      setToastMessage({ type: "error", text: err?.response?.data?.error || "Erro ao gerar transações" });
    },
  });

  // Handlers do formulário
  const handleOpenCreateModal = (suggestion?: SuggestedRecurring) => {
    setEditingItem(null);
    setFormError(null);
    if (suggestion) {
      setForm({
        description: suggestion.description,
        amount: suggestion.amount,
        type: suggestion.type,
        category_id: suggestion.category_id ? String(suggestion.category_id) : "none",
        credit_card_id: suggestion.credit_card_id ? suggestion.credit_card_id : "none",
        frequency: suggestion.frequency || "monthly",
        day_of_month: String(suggestion.day_of_month || 5),
        start_date: new Date().toISOString().slice(0, 10),
        end_date: "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: RecurringTransaction) => {
    setEditingItem(item);
    setFormError(null);
    setForm({
      description: item.description,
      amount: item.amount,
      type: item.type,
      category_id: item.category_id ? String(item.category_id) : "none",
      credit_card_id: item.credit_card_id ? item.credit_card_id : "none",
      frequency: item.frequency || "monthly",
      day_of_month: String(item.day_of_month || 5),
      start_date: item.start_date || new Date().toISOString().slice(0, 10),
      end_date: item.end_date || "",
    });
    setIsModalOpen(true);
  };

  const handleDismissSuggestion = (id: string) => {
    setDismissedSuggestions((prev) => new Set(prev).add(id));
  };

  // Filtragem de sugestões ativas
  const activeSuggestions = useMemo(() => {
    const raw = suggestionsData?.suggestions || [];
    return raw.filter((sug) => !dismissedSuggestions.has(sug.id));
  }, [suggestionsData, dismissedSuggestions]);

  // Filtragem de recorrências
  const recurrings = recurringData?.recurrings || [];
  const summary = recurringData?.summary || {
    active_count: 0,
    paused_count: 0,
    total_count: 0,
    monthly_expenses_total: 0,
    monthly_income_total: 0,
    monthly_balance: 0,
  };

  const filteredRecurrings = useMemo(() => {
    return recurrings.filter((item) => {
      if (activeTabFilter === "active" && item.status !== "active") return false;
      if (activeTabFilter === "paused" && item.status !== "paused") return false;
      if (activeTabFilter === "expense" && item.type !== "expense") return false;
      if (activeTabFilter === "income" && item.type !== "income") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const descMatch = item.description.toLowerCase().includes(q);
        const catMatch = item.category_name?.toLowerCase().includes(q);
        const cardMatch = item.credit_card_name?.toLowerCase().includes(q);
        return descMatch || catMatch || cardMatch;
      }
      return true;
    });
  }, [recurrings, activeTabFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <Repeat className="h-8 w-8 text-primary" />
            Transações Recorrentes
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Automatize contas fixas, assinaturas e salários com detecção automática e geração programada de lançamentos.
          </p>
        </div>

        {/* Workspace + Botões de Ação */}
        <div className="flex flex-wrap items-center gap-3">
          {workspaces.length > 1 && (
            <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
              <SelectTrigger className="w-[180px] bg-white">
                <SelectValue placeholder="Workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>
                    {ws.name} ({ws.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="outline"
            disabled={summary.active_count === 0 || generateMutation.isPending || !canEdit}
            onClick={() => generateMutation.mutate(undefined)}
            className="gap-2 border-slate-300 hover:bg-slate-100 font-semibold"
          >
            {generateMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Play className="h-4 w-4 text-emerald-600" />
            )}
            Gerar Pendentes
          </Button>

          <Button
            disabled={!canEdit}
            onClick={() => handleOpenCreateModal()}
            className="gap-2 font-semibold shadow-sm"
          >
            <Plus className="h-4 w-4" /> Nova Recorrência
          </Button>
        </div>
      </div>

      {/* Alerta de Feedback (Toast/Banner) */}
      {toastMessage && (
        <div
          className={`p-4 rounded-lg flex items-start justify-between gap-3 text-sm font-medium ${
            toastMessage.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-rose-50 border border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* SEÇÃO 1: SUGESTÕES DETECTADAS PELO MOTOR DE PADRÕES */}
      {activeSuggestions.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40 shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b border-amber-100 bg-amber-100/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-base text-amber-900">
                  Sugestões de Recorrências Detectadas ({activeSuggestions.length})
                </CardTitle>
              </div>
              <Badge variant="outline" className="bg-amber-200/60 text-amber-800 border-amber-300 text-xs">
                Auto-Detecção Inteligente
              </Badge>
            </div>
            <CardDescription className="text-amber-800/80 text-xs">
              Identificamos estes lançamentos repetidos no seu histórico. Confirme para ativá-los como recorrências automáticas.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeSuggestions.map((sug) => (
                <div
                  key={sug.id}
                  className="p-3.5 rounded-lg bg-white border border-amber-200/80 shadow-xs flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-sm">{sug.description}</span>
                      <span
                        className={`text-sm font-extrabold ${
                          sug.type === "expense" ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {sug.type === "expense" ? "-" : "+"}
                        {formatCurrency(sug.amount)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{sug.explanation}</p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDismissSuggestion(sug.id)}
                      className="h-7 px-2 text-xs text-slate-400 hover:text-slate-600"
                    >
                      Ignorar
                    </Button>
                    <Button
                      size="sm"
                      disabled={!canEdit}
                      onClick={() => handleOpenCreateModal(sug)}
                      className="h-7 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1"
                    >
                      <Check className="h-3.5 w-3.5" /> Confirmar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SEÇÃO 2: CARDS DE RESUMO KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 shadow-sm bg-white border">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Recorrências Ativas</span>
            <Repeat className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {summary.active_count}{" "}
            <span className="text-xs font-normal text-slate-400">({summary.paused_count} pausadas)</span>
          </p>
        </Card>

        <Card className="p-4 shadow-sm bg-white border">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Despesas Fixas / Mês</span>
            <TrendingDown className="h-4 w-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-600 mt-2">
            -{formatCurrency(summary.monthly_expenses_total)}
          </p>
        </Card>

        <Card className="p-4 shadow-sm bg-white border">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Receitas Fixas / Mês</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2">
            +{formatCurrency(summary.monthly_income_total)}
          </p>
        </Card>

        <Card className="p-4 shadow-sm bg-white border">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Balanço Comprometido</span>
            <Calendar className="h-4 w-4 text-slate-400" />
          </div>
          <p
            className={`text-2xl font-black mt-2 ${
              summary.monthly_balance >= 0 ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {formatCurrency(summary.monthly_balance)}
          </p>
        </Card>
      </div>

      {/* SEÇÃO 3: FILTROS E BUSCA */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setActiveTabFilter("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTabFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Todas ({recurrings.length})
          </button>
          <button
            onClick={() => setActiveTabFilter("active")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTabFilter === "active" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Ativas ({summary.active_count})
          </button>
          {summary.paused_count > 0 && (
            <button
              onClick={() => setActiveTabFilter("paused")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTabFilter === "paused" ? "bg-white text-amber-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Pausadas ({summary.paused_count})
            </button>
          )}
          <button
            onClick={() => setActiveTabFilter("expense")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTabFilter === "expense" ? "bg-white text-rose-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Despesas
          </button>
          <button
            onClick={() => setActiveTabFilter("income")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTabFilter === "income" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Receitas
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar recorrência..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white h-9 text-xs"
          />
        </div>
      </div>

      {/* SEÇÃO 4: TABELA DE RECORRÊNCIAS */}
      <Card className="shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100/80 border-b text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Descrição</th>
                <th className="py-3 px-4">Valor</th>
                <th className="py-3 px-4">Frequência</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4">Cartão / Conta</th>
                <th className="py-3 px-4">Última Gerada</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                    Carregando transações recorrentes...
                  </td>
                </tr>
              ) : filteredRecurrings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Repeat className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">Nenhuma recorrência cadastrada</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Cadastre uma nova regra ou confira as sugestões detectadas acima.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRecurrings.map((item) => {
                  const isPaused = item.status === "paused";
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-slate-50/80 ${
                        isPaused ? "opacity-60 bg-slate-50/40" : ""
                      }`}
                    >
                      {/* Descrição */}
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {item.description}
                      </td>

                      {/* Valor */}
                      <td className="py-3 px-4">
                        <span
                          className={`font-bold ${
                            item.type === "expense" ? "text-rose-600" : "text-emerald-600"
                          }`}
                        >
                          {item.type === "expense" ? "-" : "+"}
                          {formatCurrency(item.amount)}
                        </span>
                      </td>

                      {/* Frequência */}
                      <td className="py-3 px-4 text-slate-600">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>
                            {item.frequency === "monthly"
                              ? `Mensal (todo dia ${item.day_of_month || 1})`
                              : item.frequency === "weekly"
                              ? "Semanal"
                              : "Anual"}
                          </span>
                        </div>
                      </td>

                      {/* Categoria */}
                      <td className="py-3 px-4">
                        {item.category_name ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: item.category_color || "#888" }}
                            />
                            <span className="text-xs font-medium text-slate-700">{item.category_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>

                      {/* Cartão / Conta */}
                      <td className="py-3 px-4">
                        {item.credit_card_name ? (
                          <div className="flex items-center gap-1.5 text-xs text-slate-700">
                            <CreditCardIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{item.credit_card_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Conta Corrente / Dinheiro</span>
                        )}
                      </td>

                      {/* Última Gerada */}
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {item.last_generated_date ? (
                          <Badge variant="outline" className="text-[11px] font-normal">
                            {item.last_generated_date}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">Pendente</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        {item.status === "active" ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                            Ativa
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                            Pausada
                          </Badge>
                        )}
                      </td>

                      {/* Menu de Ações */}
                      <td className="py-3 px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4 text-slate-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={!canEdit}
                              onClick={() => generateMutation.mutate(item.id)}
                            >
                              <Play className="h-4 w-4 mr-2 text-emerald-600" />
                              Gerar Agora
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!canEdit}
                              onClick={() => togglePauseMutation.mutate(item.id)}
                            >
                              {item.status === "active" ? (
                                <>
                                  <Pause className="h-4 w-4 mr-2 text-amber-600" />
                                  Pausar
                                </>
                              ) : (
                                <>
                                  <Play className="h-4 w-4 mr-2 text-emerald-600" />
                                  Reativar
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!canEdit}
                              onClick={() => handleOpenEditModal(item)}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={!canEdit}
                              onClick={() => {
                                if (confirm("Deseja realmente remover esta regra de recorrência?")) {
                                  deleteMutation.mutate(item.id);
                                }
                              }}
                              className="text-rose-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MODAL DE CADASTRO / EDIÇÃO DE RECORRÊNCIA */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Editar Recorrência" : "Nova Transação Recorrente"}
            </DialogTitle>
            <DialogDescription>
              Configure o lançamento automático periódico para este workspace.
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formError}
            </div>
          )}

          <div className="space-y-4 py-2">
            {/* Tipo: Despesa ou Receita */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: "expense" }))}
                className={`py-2 text-xs font-bold rounded-lg border flex items-center justify-center gap-2 transition-all ${
                  form.type === "expense"
                    ? "bg-rose-50 border-rose-400 text-rose-700 shadow-xs"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <TrendingDown className="h-4 w-4 text-rose-500" />
                Despesa Fixa
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: "income" }))}
                className={`py-2 text-xs font-bold rounded-lg border flex items-center justify-center gap-2 transition-all ${
                  form.type === "income"
                    ? "bg-emerald-50 border-emerald-400 text-emerald-700 shadow-xs"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Receita Fixa
              </button>
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label htmlFor="rec-desc">Descrição *</Label>
              <Input
                id="rec-desc"
                placeholder="Ex: Netflix, Aluguel, Salário, Internet"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Valor e Dia do Mês */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rec-amount">Valor (R$) *</Label>
                <CurrencyInput
                  id="rec-amount"
                  value={form.amount}
                  onChange={(val) => setForm((f) => ({ ...f, amount: val }))}
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rec-day">Dia do Mês (1-31) *</Label>
                <Select
                  value={form.day_of_month}
                  onValueChange={(val) => setForm((f) => ({ ...f, day_of_month: val }))}
                >
                  <SelectTrigger id="rec-day" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        Todo dia {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Categoria e Cartão */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rec-cat">Categoria</Label>
                <Select
                  value={form.category_id}
                  onValueChange={(val) => setForm((f) => ({ ...f, category_id: val }))}
                >
                  <SelectTrigger id="rec-cat" className="bg-white">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem Categoria</SelectItem>
                    {categories
                      .filter((c) => !c.type || c.type === form.type)
                      .map((cat) => (
                        <SelectItem key={cat.id} value={String(cat.id)}>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: cat.color || "#999" }}
                            />
                            <span>{cat.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rec-card">Cartão / Conta</Label>
                <Select
                  value={form.credit_card_id}
                  onValueChange={(val) => setForm((f) => ({ ...f, credit_card_id: val }))}
                >
                  <SelectTrigger id="rec-card" className="bg-white">
                    <SelectValue placeholder="Destino" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Conta Corrente / Dinheiro</SelectItem>
                    {creditCards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        <div className="flex items-center gap-2">
                          <CreditCardIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{card.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Data Inicial e Data Final */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rec-start">Data de Início *</Label>
                <Input
                  id="rec-start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rec-end">Data Final (Opcional)</Label>
                <Input
                  id="rec-end"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={saveMutation.isPending || !form.description}
              onClick={() => saveMutation.mutate()}
              className="gap-2 font-semibold"
            >
              {saveMutation.isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
              {editingItem ? "Salvar Alterações" : "Criar Recorrência"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
