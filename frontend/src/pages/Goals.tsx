import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import api from "@/lib/api";
import type { FinancialGoalListResponse, BankAccount } from "@/types";
function formatCurrency(val: number): string { return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  Plus,
  CheckCircle2,
  Calendar,
  PiggyBank,
  Trash2,
  Sparkles,
  TrendingUp,
  Clock,
  Landmark,
  Coins,
  ChevronRight,
} from "lucide-react";

export default function Goals() {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id;

  // Modais
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  // Form State: Nova Meta
  const [goalName, setGoalName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [initialAmount, setInitialAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [accountId, setAccountId] = useState("");
  const [color, setColor] = useState("#10b981");
  const [errorMsg, setErrorMsg] = useState("");

  // Form State: Aporte
  const [depositAmount, setDepositAmount] = useState("");
  const [depositError, setDepositError] = useState("");

  // Buscar metas financeiras
  const { data, isLoading } = useQuery<FinancialGoalListResponse>({
    queryKey: ["financial_goals", workspaceId],
    queryFn: async () => {
      const res = await api.get(`/workspaces/${workspaceId}/goals`);
      return res.data;
    },
    enabled: !!workspaceId,
  });

  // Buscar contas banc�rias para vincular
  const { data: accounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank_accounts", workspaceId],
    queryFn: async () => {
      const res = await api.get(`/workspaces/${workspaceId}/accounts`);
      return res.data;
    },
    enabled: !!workspaceId,
  });

  // Mutation: Criar Meta
  const createGoalMutation = useMutation({
    mutationFn: async (payload: any) => {
      return api.post(`/workspaces/${workspaceId}/goals`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial_goals", workspaceId] });
      setIsCreateModalOpen(false);
      resetCreateForm();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error || "Erro ao criar meta.");
    },
  });

  // Mutation: Registrar Aporte
  const depositMutation = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      return api.patch(`/workspaces/${workspaceId}/goals/${id}`, { amount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial_goals", workspaceId] });
      setIsDepositModalOpen(false);
      setDepositAmount("");
      setSelectedGoalId(null);
    },
    onError: (err: any) => {
      setDepositError(err.response?.data?.error || "Erro ao registrar aporte.");
    },
  });

  // Mutation: Concluir Meta Manualmente
  const completeGoalMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.patch(`/workspaces/${workspaceId}/goals/${id}/complete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial_goals", workspaceId] });
    },
  });

  // Mutation: Excluir Meta
  const deleteGoalMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/workspaces/${workspaceId}/goals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial_goals", workspaceId] });
    },
  });

  const resetCreateForm = () => {
    setGoalName("");
    setTargetAmount("");
    setInitialAmount("");
    setDeadline("");
    setAccountId("");
    setColor("#10b981");
    setErrorMsg("");
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalName.trim()) {
      setErrorMsg("O nome da meta � obrigat�rio.");
      return;
    }
    const target = Number(targetAmount.replace(",", "."));
    if (isNaN(target) || target <= 0) {
      setErrorMsg("O valor alvo deve ser um n�mero positivo.");
      return;
    }

    const current = initialAmount ? Number(initialAmount.replace(",", ".")) : 0;

    createGoalMutation.mutate({
      name: goalName.trim(),
      target_amount: target,
      current_amount: current,
      deadline: deadline || null,
      account_id: accountId || null,
      color,
      icon: "Target",
    });
  };

  const handleOpenDeposit = (id: string) => {
    setSelectedGoalId(id);
    setDepositAmount("");
    setDepositError("");
    setIsDepositModalOpen(true);
  };

  const handleDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoalId) return;
    const amount = Number(depositAmount.replace(",", "."));
    if (isNaN(amount) || amount <= 0) {
      setDepositError("Informe um valor de aporte positivo.");
      return;
    }

    depositMutation.mutate({ id: selectedGoalId, amount });
  };

  const summary = data?.summary || {
    total_goals: 0,
    active_goals: 0,
    completed_goals: 0,
    total_target_amount: 0,
    total_saved_amount: 0,
    overall_percentage: 0,
  };

  const goals = data?.goals || [];

  return (
    <div className="space-y-6">
      {/* Cabe�alho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Target className="h-6 w-6 text-emerald-600" />
            Metas Financeiras
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Planeje objetivos de economia, registre aportes e acompanhe seu progresso.
          </p>
        </div>

        <Button
          onClick={() => {
            resetCreateForm();
            setIsCreateModalOpen(true);
          }}
          className="flex items-center gap-1.5 shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="h-4 w-4" />
          Nova Meta
        </Button>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Guardado
            </CardTitle>
            <PiggyBank className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(summary.total_saved_amount)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Soma de todos os aportes realizados</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Meta Global
            </CardTitle>
            <Target className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {formatCurrency(summary.total_target_amount)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Objetivo acumulado das metas</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Progresso Geral
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600">
              {summary.overall_percentage.toFixed(1)}%
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-2">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, summary.overall_percentage)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Status das Metas
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-900">{summary.total_goals}</span>
              <span className="text-xs text-slate-500">cadastradas</span>
            </div>
            <div className="flex gap-2 mt-1 text-xs">
              <span className="text-emerald-600 font-medium">?? {summary.active_goals} ativas</span>
              <span className="text-blue-600 font-medium">?? {summary.completed_goals} conclu�das</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid de Metas */}
      {isLoading ? (
        <div className="p-12 text-center text-sm text-slate-400">Carregando metas financeiras...</div>
      ) : goals.length === 0 ? (
        <Card className="border-slate-200 p-12 text-center space-y-3">
          <Sparkles className="h-12 w-12 text-emerald-500 mx-auto opacity-80" />
          <h3 className="font-bold text-lg text-slate-900">Comece a planejar suas metas</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Crie objetivos para sua reserva de emerg�ncia, f�rias, compra de bens ou investimentos e acompanhe cada aporte rumo ao seu alvo.
          </p>
          <Button
            onClick={() => {
              resetCreateForm();
              setIsCreateModalOpen(true);
            }}
            className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Criar Minha Primeira Meta
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {goals.map((item) => {
            const isCompleted = item.status === "completed" || item.current_amount >= item.target_amount;
            const percentage = item.progress_percentage || 0;

            return (
              <Card
                key={item.id}
                className={`border-slate-200 shadow-2xs overflow-hidden flex flex-col justify-between transition-all hover:shadow-md ${
                  isCompleted ? "bg-emerald-50/20 border-emerald-200" : "bg-white"
                }`}
              >
                <div>
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
                          style={{ backgroundColor: item.color || "#10b981" }}
                        >
                          <Target className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-base text-slate-900 leading-tight">{item.name}</h3>
                          {item.account_name && (
                            <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Landmark className="h-3 w-3" />
                              {item.account_name}
                            </span>
                          )}
                        </div>
                      </div>

                      <Badge
                        variant="secondary"
                        className={`text-[10px] font-bold ${
                          isCompleted
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {isCompleted ? "Conclu�da ??" : "Em andamento"}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-5 pt-0 space-y-4">
                    {/* Valores */}
                    <div className="flex items-baseline justify-between mt-2">
                      <div>
                        <span className="text-xs text-slate-400 block">Guardado</span>
                        <span className="text-xl font-black text-slate-900">
                          {formatCurrency(item.current_amount)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">Objetivo</span>
                        <span className="text-sm font-bold text-slate-600">
                          {formatCurrency(item.target_amount)}
                        </span>
                      </div>
                    </div>

                    {/* Barra de Progresso */}
                    <div className="space-y-1">
                      <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isCompleted ? "bg-emerald-500" : "bg-emerald-600"
                          }`}
                          style={{ width: `${Math.min(100, percentage)}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                        <span>{percentage.toFixed(1)}% conclu�do</span>
                        <span>
                          {item.remaining_amount > 0
                            ? `Faltam ${formatCurrency(item.remaining_amount)}`
                            : "Meta atingida!"}
                        </span>
                      </div>
                    </div>

                    {/* Deadline / Dias Restantes */}
                    {item.deadline && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>Prazo: {item.deadline}</span>
                        {item.days_remaining !== null && item.days_remaining !== undefined && (
                          <span
                            className={`font-semibold ml-auto ${
                              item.days_remaining < 0
                                ? "text-rose-600"
                                : item.days_remaining <= 7
                                ? "text-amber-600"
                                : "text-slate-600"
                            }`}
                          >
                            {item.days_remaining < 0
                              ? `Vencido h� ${Math.abs(item.days_remaining)} dias`
                              : item.days_remaining === 0
                              ? "Vence hoje"
                              : `Faltam ${item.days_remaining} dias`}
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </div>

                {/* A��es do Card */}
                <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
                  {!isCompleted ? (
                    <Button
                      size="sm"
                      onClick={() => handleOpenDeposit(item.id)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs"
                    >
                      <Coins className="h-3.5 w-3.5 mr-1" />
                      Registrar Aporte
                    </Button>
                  ) : (
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      Objetivo Alcan�ado!
                    </span>
                  )}

                  <div className="flex items-center gap-1">
                    {!isCompleted && (
                      <button
                        onClick={() => completeGoalMutation.mutate(item.id)}
                        className="p-2 text-slate-400 hover:text-emerald-600 rounded-md transition-colors text-xs font-medium"
                        title="Marcar como conclu�da manualmente"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteGoalMutation.mutate(item.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                      title="Excluir Meta"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Nova Meta */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-lg text-slate-900">Nova Meta Financeira</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-600">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da Meta *</label>
                <Input
                  type="text"
                  placeholder="Ex: Reserva de Emerg�ncia, Carro Novo"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Valor Alvo (R$) *</label>
                  <Input
                    type="text"
                    placeholder="Ex: 10000,00"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Valor Atual Guardado</label>
                  <Input
                    type="text"
                    placeholder="Ex: 1000,00"
                    value={initialAmount}
                    onChange={(e) => setInitialAmount(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Data Prazo (Opcional)</label>
                <Input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Conta Vinculada (Opcional)</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="">Nenhuma conta vinculada</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.bank_name || "Outro"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cor de Destaque</label>
                <div className="flex gap-2">
                  {["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#6366f1"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${color === c ? "scale-125 ring-2 ring-slate-400" : "opacity-80"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createGoalMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {createGoalMutation.isPending ? "Criando..." : "Criar Meta"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar Aporte */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Coins className="h-5 w-5 text-emerald-600" />
                Registrar Aporte
              </h3>
              <button
                onClick={() => setIsDepositModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {depositError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-600">
                {depositError}
              </div>
            )}

            <form onSubmit={handleDepositSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Valor do Aporte (R$) *
                </label>
                <Input
                  type="text"
                  placeholder="Ex: 500,00"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  autoFocus
                  required
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Este valor ser� somado ao saldo j� guardado nesta meta.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsDepositModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={depositMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {depositMutation.isPending ? "Confirmando..." : "Confirmar Aporte"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
