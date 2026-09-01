import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  Workspace,
  Category,
  Budget,
  BudgetListResponse,
  SavingsGoal,
  SavingsGoalListResponse,
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
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Target,
  PiggyBank,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Calendar,
  RefreshCw,
  Coins,
  X,
  PieChart,
} from "lucide-react";

function formatCurrency(val: number): string {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getCurrentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface BudgetFormState {
  category_id: string;
  monthly_limit: number | string;
  alert_threshold_percent: string;
}

interface GoalFormState {
  name: string;
  target_amount: number | string;
  current_amount: number | string;
  target_date: string;
}

export default function BudgetsAndGoals() {
  const queryClient = useQueryClient();

  // Estados
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthStr());
  const [activeTab, setActiveTab] = useState<"budgets" | "goals">("budgets");

  // Modais de Orçamento
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [budgetForm, setBudgetForm] = useState<BudgetFormState>({
    category_id: "",
    monthly_limit: "",
    alert_threshold_percent: "80",
  });
  const [budgetFormError, setBudgetFormError] = useState<string | null>(null);

  // Modais de Meta
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [goalForm, setGoalForm] = useState<GoalFormState>({
    name: "",
    target_amount: "",
    current_amount: "0",
    target_date: "",
  });
  const [goalFormError, setGoalFormError] = useState<string | null>(null);

  // Modal de Depósito em Meta
  const [depositGoal, setDepositGoal] = useState<SavingsGoal | null>(null);
  const [depositAmount, setDepositAmount] = useState<number | string>("");
  const [depositError, setDepositError] = useState<string | null>(null);

  // Mensagem toast
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 1. Workspaces
  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const res = await api.get("/workspaces");
      return res.data;
    },
  });

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

  // 2. Categorias
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories", selectedWorkspaceId],
    queryFn: async () => {
      if (!selectedWorkspaceId) return [];
      const res = await api.get(`/workspaces/${selectedWorkspaceId}/categories`);
      return res.data;
    },
    enabled: !!selectedWorkspaceId,
  });

  const expenseCategories = useMemo(
    () => categories.filter((c) => !c.type || c.type === "expense"),
    [categories]
  );

  // 3. Orçamentos do Mês
  const { data: budgetData, isLoading: loadingBudgets } = useQuery<BudgetListResponse>({
    queryKey: ["budgets", selectedWorkspaceId, selectedMonth],
    queryFn: async () => {
      if (!selectedWorkspaceId) return { workspace_id: "", month: selectedMonth, summary: { total_budgeted: 0, total_spent: 0, total_remaining: 0, total_count: 0, ok_count: 0, warning_count: 0, exceeded_count: 0, in_alert_count: 0 }, budgets: [] };
      const res = await api.get(`/workspaces/${selectedWorkspaceId}/budgets?month=${selectedMonth}`);
      return res.data;
    },
    enabled: !!selectedWorkspaceId,
  });

  // 4. Metas de Economia
  const { data: goalData, isLoading: loadingGoals } = useQuery<SavingsGoalListResponse>({
    queryKey: ["savings-goals", selectedWorkspaceId],
    queryFn: async () => {
      if (!selectedWorkspaceId) return { workspace_id: "", summary: { total_goals: 0, active_goals: 0, completed_goals: 0, total_target_amount: 0, total_saved_amount: 0, overall_percentage: 0 }, goals: [] };
      const res = await api.get(`/workspaces/${selectedWorkspaceId}/goals`);
      return res.data;
    },
    enabled: !!selectedWorkspaceId,
  });

  // Mutações de Orçamento
  const saveBudgetMutation = useMutation({
    mutationFn: async () => {
      const limitNum = typeof budgetForm.monthly_limit === "number" ? budgetForm.monthly_limit : Number(String(budgetForm.monthly_limit).replace(",", "."));
      if (isNaN(limitNum) || limitNum <= 0) throw new Error("Informe um limite positivo");
      if (!budgetForm.category_id) throw new Error("Selecione uma categoria");

      const payload = {
        category_id: Number(budgetForm.category_id),
        monthly_limit: limitNum,
        alert_threshold_percent: Number(budgetForm.alert_threshold_percent) || 80,
      };

      if (editingBudget) {
        return (await api.put(`/workspaces/${selectedWorkspaceId}/budgets/${editingBudget.id}`, payload)).data;
      } else {
        return (await api.post(`/workspaces/${selectedWorkspaceId}/budgets`, payload)).data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setIsBudgetModalOpen(false);
      setEditingBudget(null);
      setBudgetForm({ category_id: "", monthly_limit: "", alert_threshold_percent: "80" });
      setBudgetFormError(null);
      setToastMessage({ type: "success", text: "Orçamento salvo com sucesso!" });
    },
    onError: (err: any) => {
      setBudgetFormError(err?.response?.data?.error || err.message || "Erro ao salvar orçamento");
    },
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: async (id: string) => {
      return (await api.delete(`/workspaces/${selectedWorkspaceId}/budgets/${id}`)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setToastMessage({ type: "success", text: "Orçamento removido com sucesso!" });
    },
    onError: (err: any) => {
      setToastMessage({ type: "error", text: err?.response?.data?.error || "Erro ao excluir orçamento" });
    },
  });

  // Mutações de Metas
  const saveGoalMutation = useMutation({
    mutationFn: async () => {
      if (!goalForm.name.trim()) throw new Error("Informe o nome da meta");
      const targetNum = typeof goalForm.target_amount === "number" ? goalForm.target_amount : Number(String(goalForm.target_amount).replace(",", "."));
      if (isNaN(targetNum) || targetNum <= 0) throw new Error("Informe um valor alvo positivo");
      const currentNum = typeof goalForm.current_amount === "number" ? goalForm.current_amount : Number(String(goalForm.current_amount || 0).replace(",", "."));

      const payload = {
        name: goalForm.name.trim(),
        target_amount: targetNum,
        current_amount: currentNum,
        target_date: goalForm.target_date || null,
      };

      if (editingGoal) {
        return (await api.put(`/workspaces/${selectedWorkspaceId}/goals/${editingGoal.id}`, payload)).data;
      } else {
        return (await api.post(`/workspaces/${selectedWorkspaceId}/goals`, payload)).data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savings-goals", selectedWorkspaceId] });
      setIsGoalModalOpen(false);
      setEditingGoal(null);
      setGoalForm({ name: "", target_amount: "", current_amount: "0", target_date: "" });
      setGoalFormError(null);
      setToastMessage({ type: "success", text: "Meta salva com sucesso!" });
    },
    onError: (err: any) => {
      setGoalFormError(err?.response?.data?.error || err.message || "Erro ao salvar meta");
    },
  });

  const depositMutation = useMutation({
    mutationFn: async () => {
      if (!depositGoal) return;
      const depNum = typeof depositAmount === "number" ? depositAmount : Number(String(depositAmount).replace(",", "."));
      if (isNaN(depNum) || depNum <= 0) throw new Error("Informe um valor positivo para guardar");

      return (await api.patch(`/workspaces/${selectedWorkspaceId}/goals/${depositGoal.id}/deposit`, { amount: depNum })).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["savings-goals", selectedWorkspaceId] });
      setDepositGoal(null);
      setDepositAmount("");
      setDepositError(null);
      setToastMessage({ type: "success", text: data?.message || "Depósito registrado com sucesso!" });
    },
    onError: (err: any) => {
      setDepositError(err?.response?.data?.error || err.message || "Erro ao depositar na meta");
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: async (id: string) => {
      return (await api.delete(`/workspaces/${selectedWorkspaceId}/goals/${id}`)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savings-goals", selectedWorkspaceId] });
      setToastMessage({ type: "success", text: "Meta removida com sucesso!" });
    },
    onError: (err: any) => {
      setToastMessage({ type: "error", text: err?.response?.data?.error || "Erro ao excluir meta" });
    },
  });

  // Handlers de Abertura de Modal
  const handleOpenCreateBudget = () => {
    setEditingBudget(null);
    setBudgetFormError(null);
    setBudgetForm({ category_id: "", monthly_limit: "", alert_threshold_percent: "80" });
    setIsBudgetModalOpen(true);
  };

  const handleOpenEditBudget = (item: Budget) => {
    setEditingBudget(item);
    setBudgetFormError(null);
    setBudgetForm({
      category_id: String(item.category_id),
      monthly_limit: item.monthly_limit,
      alert_threshold_percent: String(item.alert_threshold_percent || 80),
    });
    setIsBudgetModalOpen(true);
  };

  const handleOpenCreateGoal = () => {
    setEditingGoal(null);
    setGoalFormError(null);
    setGoalForm({ name: "", target_amount: "", current_amount: "0", target_date: "" });
    setIsGoalModalOpen(true);
  };

  const handleOpenEditGoal = (item: SavingsGoal) => {
    setEditingGoal(item);
    setGoalFormError(null);
    setGoalForm({
      name: item.name,
      target_amount: item.target_amount,
      current_amount: item.current_amount,
      target_date: item.target_date || "",
    });
    setIsGoalModalOpen(true);
  };

  const handleOpenDeposit = (item: SavingsGoal) => {
    setDepositGoal(item);
    setDepositAmount("");
    setDepositError(null);
  };

  const budgets = budgetData?.budgets || [];
  const budgetSummary = budgetData?.summary || {
    total_budgeted: 0,
    total_spent: 0,
    total_remaining: 0,
    total_count: 0,
    ok_count: 0,
    warning_count: 0,
    exceeded_count: 0,
    in_alert_count: 0,
  };

  const goals = goalData?.goals || [];
  const goalSummary = goalData?.summary || {
    total_goals: 0,
    active_goals: 0,
    completed_goals: 0,
    total_target_amount: 0,
    total_saved_amount: 0,
    overall_percentage: 0,
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <Target className="h-8 w-8 text-primary" />
            Orçamentos e Metas
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Defina tetos mensais de gastos por categoria e acompanhe suas metas de economia em tempo real.
          </p>
        </div>

        {/* Workspace + Seletor de Mês + Botões */}
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

          {activeTab === "budgets" ? (
            <>
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-40 bg-white h-9 text-xs font-semibold"
              />
              <Button
                disabled={!canEdit}
                onClick={handleOpenCreateBudget}
                className="gap-2 font-semibold shadow-sm"
              >
                <Plus className="h-4 w-4" /> Definir Orçamento
              </Button>
            </>
          ) : (
            <Button
              disabled={!canEdit}
              onClick={handleOpenCreateGoal}
              className="gap-2 font-semibold shadow-sm"
            >
              <Plus className="h-4 w-4" /> Nova Meta
            </Button>
          )}
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
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Navegação entre Abas */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("budgets")}
          className={`flex items-center gap-2 pb-3 px-4 text-sm font-bold border-b-2 transition-all ${
            activeTab === "budgets"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <PieChart className="h-4 w-4" />
          Orçamentos por Categoria ({budgets.length})
        </button>

        <button
          onClick={() => setActiveTab("goals")}
          className={`flex items-center gap-2 pb-3 px-4 text-sm font-bold border-b-2 transition-all ${
            activeTab === "goals"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <PiggyBank className="h-4 w-4" />
          Metas de Economia ({goals.length})
        </button>
      </div>

      {/* ============================================================== */}
      {/* ABA 1: ORÇAMENTOS POR CATEGORIA */}
      {/* ============================================================== */}
      {activeTab === "budgets" && (
        <div className="space-y-6">
          {/* CARDS DE RESUMO KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 shadow-sm bg-white border">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Orçado</span>
                <Target className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">
                {formatCurrency(budgetSummary.total_budgeted)}
              </p>
            </Card>

            <Card className="p-4 shadow-sm bg-white border">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">Gasto no Mês</span>
                <TrendingDown className="h-4 w-4 text-rose-500" />
              </div>
              <p className="text-2xl font-black text-rose-600 mt-2">
                {formatCurrency(budgetSummary.total_spent)}
              </p>
            </Card>

            <Card className="p-4 shadow-sm bg-white border">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">Saldo Disponível</span>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <p
                className={`text-2xl font-black mt-2 ${
                  budgetSummary.total_remaining >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatCurrency(budgetSummary.total_remaining)}
              </p>
            </Card>

            <Card className="p-4 shadow-sm bg-white border">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">Em Alerta</span>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-2xl font-black mt-2">
                {budgetSummary.in_alert_count > 0 ? (
                  <span className="text-amber-600 font-extrabold">
                    {budgetSummary.in_alert_count}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      ({budgetSummary.exceeded_count} estourado)
                    </span>
                  </span>
                ) : (
                  <span className="text-emerald-600 font-bold text-lg">Tudo em dia ✅</span>
                )}
              </p>
            </Card>
          </div>

          {/* GRID DE CARDS DE ORÇAMENTO */}
          {loadingBudgets ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
              Carregando orçamentos...
            </div>
          ) : budgets.length === 0 ? (
            <Card className="p-12 text-center text-slate-400 border border-dashed">
              <Target className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-700">Nenhum orçamento configurado para este mês</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Defina tetos de gastos por categoria para receber alertas antes que suas despesas excedam o planejado.
              </p>
              <Button
                disabled={!canEdit}
                onClick={handleOpenCreateBudget}
                className="mt-4 gap-2 font-semibold text-xs"
              >
                <Plus className="h-4 w-4" /> Definir Primeiro Orçamento
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {budgets.map((b) => {
                const isExceeded = b.status === "exceeded";
                const isWarning = b.status === "warning";

                return (
                  <Card
                    key={b.id}
                    className={`p-4 shadow-sm border transition-all hover:shadow-md ${
                      isExceeded
                        ? "border-rose-300 bg-rose-50/20"
                        : isWarning
                        ? "border-amber-300 bg-amber-50/20"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    {/* Topo do Card: Categoria + Badge de Alerta */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3.5 w-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: b.category_color || "#888" }}
                        />
                        <span className="font-extrabold text-slate-800 text-sm">
                          {b.category_name}
                        </span>
                      </div>

                      {isExceeded ? (
                        <Badge variant="outline" className="bg-rose-100 text-rose-800 border-rose-300 text-xs gap-1 font-bold">
                          <AlertOctagon className="h-3 w-3" /> Excedido
                        </Badge>
                      ) : isWarning ? (
                        <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs gap-1 font-bold">
                          <AlertTriangle className="h-3 w-3" /> Atenção ({b.percentage_used}%)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                          {b.percentage_used}%
                        </Badge>
                      )}
                    </div>

                    {/* Barra de Progresso Customizada */}
                    <div className="mt-4 space-y-1.5">
                      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isExceeded ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(100, b.percentage_used)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs font-semibold pt-1">
                        <span className="text-slate-600">
                          Gasto: <strong className="text-slate-900">{formatCurrency(b.spent_amount)}</strong>
                        </span>
                        <span className="text-slate-400">
                          Limite: <strong className="text-slate-700">{formatCurrency(b.monthly_limit)}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Restante & Ações */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                      <div className="text-xs">
                        {b.remaining_amount >= 0 ? (
                          <span className="text-emerald-700 font-medium">
                            Resta: <strong>{formatCurrency(b.remaining_amount)}</strong>
                          </span>
                        ) : (
                          <span className="text-rose-600 font-bold">
                            Estourou em: {formatCurrency(Math.abs(b.remaining_amount))}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!canEdit}
                          onClick={() => handleOpenEditBudget(b)}
                          className="h-7 w-7 text-slate-400 hover:text-slate-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!canEdit}
                          onClick={() => {
                            if (confirm(`Remover orçamento para a categoria "${b.category_name}"?`)) {
                              deleteBudgetMutation.mutate(b.id);
                            }
                          }}
                          className="h-7 w-7 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* ABA 2: METAS DE ECONOMIA */}
      {/* ============================================================== */}
      {activeTab === "goals" && (
        <div className="space-y-6">
          {/* CARDS DE RESUMO KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 shadow-sm bg-white border">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">Metas Ativas</span>
                <PiggyBank className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">
                {goalSummary.active_goals}{" "}
                <span className="text-xs font-normal text-slate-400">
                  ({goalSummary.completed_goals} concluídas)
                </span>
              </p>
            </Card>

            <Card className="p-4 shadow-sm bg-white border">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Alvo</span>
                <Target className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="text-2xl font-black text-indigo-600 mt-2">
                {formatCurrency(goalSummary.total_target_amount)}
              </p>
            </Card>

            <Card className="p-4 shadow-sm bg-white border">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Já Guardado</span>
                <Coins className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-black text-emerald-600 mt-2">
                {formatCurrency(goalSummary.total_saved_amount)}
              </p>
            </Card>

            <Card className="p-4 shadow-sm bg-white border">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">Progresso Geral</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-black text-emerald-700 mt-2">
                {goalSummary.overall_percentage}%
              </p>
            </Card>
          </div>

          {/* GRID DE CARDS DE METAS */}
          {loadingGoals ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
              Carregando metas...
            </div>
          ) : goals.length === 0 ? (
            <Card className="p-12 text-center text-slate-400 border border-dashed">
              <PiggyBank className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-700">Nenhuma meta de economia cadastrada</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Crie metas para viagens, reservas de emergência, compras planejadas e acompanhe seus depósitos.
              </p>
              <Button
                disabled={!canEdit}
                onClick={handleOpenCreateGoal}
                className="mt-4 gap-2 font-semibold text-xs"
              >
                <Plus className="h-4 w-4" /> Criar Primeira Meta
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {goals.map((g) => {
                const isCompleted = g.status === "completed" || g.progress_percentage >= 100;

                return (
                  <Card
                    key={g.id}
                    className={`p-4 shadow-sm border transition-all hover:shadow-md ${
                      isCompleted ? "border-emerald-200 bg-emerald-50/20" : "border-slate-200 bg-white"
                    }`}
                  >
                    {/* Topo do Card: Nome da Meta + Status */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-slate-800 text-sm">{g.name}</span>
                      {isCompleted ? (
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs font-bold gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Concluída
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs font-bold">
                          {g.progress_percentage}%
                        </Badge>
                      )}
                    </div>

                    {/* Barra de Progresso */}
                    <div className="mt-4 space-y-1.5">
                      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isCompleted ? "bg-emerald-500" : "bg-primary"
                          }`}
                          style={{ width: `${g.progress_percentage}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs font-semibold pt-1">
                        <span className="text-emerald-700">
                          Guardado: <strong className="text-slate-900">{formatCurrency(g.current_amount)}</strong>
                        </span>
                        <span className="text-slate-400">
                          Alvo: <strong className="text-slate-700">{formatCurrency(g.target_amount)}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Prazo e Restante */}
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      {g.target_date ? (
                        <div className="flex items-center gap-1 text-[11px]">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>
                            Prazo: {g.target_date}
                            {g.days_remaining !== null && (
                              <strong className="text-slate-700 ml-1">
                                ({g.days_remaining > 0 ? `faltam ${g.days_remaining}d` : "expirado"})
                              </strong>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">Sem data limite</span>
                      )}

                      {!isCompleted && (
                        <span className="font-medium text-slate-600">
                          Faltam: <strong>{formatCurrency(g.remaining_amount)}</strong>
                        </span>
                      )}
                    </div>

                    {/* Ações: Depositar / Editar / Excluir */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canEdit || isCompleted}
                        onClick={() => handleOpenDeposit(g)}
                        className="h-7 px-3 text-xs font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1.5"
                      >
                        <Coins className="h-3.5 w-3.5 text-indigo-600" />
                        Depositar
                      </Button>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!canEdit}
                          onClick={() => handleOpenEditGoal(g)}
                          className="h-7 w-7 text-slate-400 hover:text-slate-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!canEdit}
                          onClick={() => {
                            if (confirm(`Remover a meta "${g.name}"?`)) {
                              deleteGoalMutation.mutate(g.id);
                            }
                          }}
                          className="h-7 w-7 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: DEFINIR / EDITAR ORÇAMENTO */}
      {/* ============================================================== */}
      <Dialog open={isBudgetModalOpen} onOpenChange={setIsBudgetModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBudget ? "Editar Orçamento" : "Definir Novo Orçamento"}</DialogTitle>
            <DialogDescription>
              Estabeleça um teto de despesas para acompanhar o consumo no mês.
            </DialogDescription>
          </DialogHeader>

          {budgetFormError && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {budgetFormError}
            </div>
          )}

          <div className="space-y-4 py-2">
            {/* Categoria */}
            <div className="space-y-1.5">
              <Label htmlFor="b-cat">Categoria *</Label>
              <Select
                value={budgetForm.category_id}
                onValueChange={(val) => setBudgetForm((f) => ({ ...f, category_id: val }))}
                disabled={!!editingBudget}
              >
                <SelectTrigger id="b-cat" className="bg-white">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: cat.color || "#888" }}
                        />
                        <span>{cat.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Limite Mensal */}
            <div className="space-y-1.5">
              <Label htmlFor="b-limit">Limite Mensal (R$) *</Label>
              <CurrencyInput
                id="b-limit"
                value={budgetForm.monthly_limit}
                onChange={(val) => setBudgetForm((f) => ({ ...f, monthly_limit: val }))}
                placeholder="0,00"
              />
            </div>

            {/* Alerta Threshold */}
            <div className="space-y-1.5">
              <Label htmlFor="b-threshold">Percentual para Alerta de Atenção (%)</Label>
              <Select
                value={budgetForm.alert_threshold_percent}
                onValueChange={(val) => setBudgetForm((f) => ({ ...f, alert_threshold_percent: val }))}
              >
                <SelectTrigger id="b-threshold" className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="70">70% do orçamento</SelectItem>
                  <SelectItem value="80">80% do orçamento (Padrão)</SelectItem>
                  <SelectItem value="90">90% do orçamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsBudgetModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={saveBudgetMutation.isPending || !budgetForm.category_id}
              onClick={() => saveBudgetMutation.mutate()}
              className="gap-2 font-semibold"
            >
              {saveBudgetMutation.isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
              {editingBudget ? "Salvar Alterações" : "Definir Orçamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL: CRIAR / EDITAR META DE ECONOMIA */}
      {/* ============================================================== */}
      <Dialog open={isGoalModalOpen} onOpenChange={setIsGoalModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGoal ? "Editar Meta de Economia" : "Nova Meta de Economia"}</DialogTitle>
            <DialogDescription>
              Planeje objetivos financeiros futuros e acompanhe os depósitos.
            </DialogDescription>
          </DialogHeader>

          {goalFormError && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {goalFormError}
            </div>
          )}

          <div className="space-y-4 py-2">
            {/* Nome da Meta */}
            <div className="space-y-1.5">
              <Label htmlFor="g-name">Nome da Meta *</Label>
              <Input
                id="g-name"
                placeholder="Ex: Reserva de Emergência, Viagem Europa"
                value={goalForm.name}
                onChange={(e) => setGoalForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Valor Alvo e Já Guardado */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="g-target">Valor Alvo (R$) *</Label>
                <CurrencyInput
                  id="g-target"
                  value={goalForm.target_amount}
                  onChange={(val) => setGoalForm((f) => ({ ...f, target_amount: val }))}
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="g-current">Já Guardado (R$)</Label>
                <CurrencyInput
                  id="g-current"
                  value={goalForm.current_amount}
                  onChange={(val) => setGoalForm((f) => ({ ...f, current_amount: val }))}
                  placeholder="0,00"
                />
              </div>
            </div>

            {/* Data Limite */}
            <div className="space-y-1.5">
              <Label htmlFor="g-date">Data Alvo (Opcional)</Label>
              <Input
                id="g-date"
                type="date"
                value={goalForm.target_date}
                onChange={(e) => setGoalForm((f) => ({ ...f, target_date: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsGoalModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={saveGoalMutation.isPending || !goalForm.name}
              onClick={() => saveGoalMutation.mutate()}
              className="gap-2 font-semibold"
            >
              {saveGoalMutation.isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
              {editingGoal ? "Salvar Alterações" : "Criar Meta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL: DEPOSITAR NA META */}
      {/* ============================================================== */}
      <Dialog open={!!depositGoal} onOpenChange={(open) => !open && setDepositGoal(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-indigo-600" />
              Guardar Dinheiro
            </DialogTitle>
            <DialogDescription>
              Adicionar valor à meta <strong className="text-slate-800">{depositGoal?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          {depositError && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {depositError}
            </div>
          )}

          <div className="space-y-3 py-2">
            <div className="p-3 rounded-lg bg-indigo-50/60 border border-indigo-100 text-xs space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Guardado atualmente:</span>
                <strong className="text-slate-800">{formatCurrency(depositGoal?.current_amount || 0)}</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Meta total:</span>
                <strong className="text-slate-800">{formatCurrency(depositGoal?.target_amount || 0)}</strong>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dep-amount">Valor a Guardar (R$) *</Label>
              <CurrencyInput
                id="dep-amount"
                value={depositAmount}
                onChange={setDepositAmount}
                placeholder="0,00"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDepositGoal(null)}>
              Cancelar
            </Button>
            <Button
              disabled={depositMutation.isPending || !depositAmount}
              onClick={() => depositMutation.mutate()}
              className="gap-2 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {depositMutation.isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
              Confirmar Depósito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
