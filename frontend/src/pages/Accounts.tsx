import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { BankAccount, AccountType, AccountTransfer } from "@/types";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Landmark,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  Loader2,
  Wallet,
  PiggyBank,
  TrendingUp,
  Banknote,
  Building2,
  CheckCircle2,
  ArrowRightLeft,
  AlertCircle,
  Upload,
} from "lucide-react";

// ── Helpers e Mapas de Tipos ─────────────────────────────────────────────────

const ACCOUNT_TYPE_CONFIG: Record<
  AccountType,
  { label: string; icon: React.ReactNode; badgeClass: string }
> = {
  checking: {
    label: "Conta Corrente",
    icon: <Landmark className="h-4 w-4" />,
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  savings: {
    label: "Poupança / Reserva",
    icon: <PiggyBank className="h-4 w-4" />,
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  investment: {
    label: "Investimentos",
    icon: <TrendingUp className="h-4 w-4" />,
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
  },
  cash: {
    label: "Carteira / Dinheiro",
    icon: <Banknote className="h-4 w-4" />,
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

const COMMON_BANKS = [
  "Nubank",
  "Banco Inter",
  "Itaú",
  "Bradesco",
  "Banco do Brasil",
  "Santander",
  "Caixa Econômica",
  "C6 Bank",
  "BTG Pactual",
  "XP Investimentos",
  "Mercado Pago",
  "PicPay",
];

const PRESET_COLORS = [
  "#2563eb", // Azul
  "#820AD1", // Roxo Nubank
  "#FF7A00", // Laranja Inter
  "#ec4899", // Rosa
  "#10b981", // Verde
  "#f59e0b", // Âmbar
  "#64748b", // Ardósia
  "#0f172a", // Preto
];

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(val || 0);
}

// ── Componente Principal ────────────────────────────────────────────────────

export default function Accounts() {
  const queryClient = useQueryClient();
  const { selectedWorkspaceId, selectedWorkspace } = useWorkspace();
  const activeWorkspaceId = selectedWorkspaceId;
  const isViewer = selectedWorkspace?.role === "viewer";

  // Estados de Filtros e Modais
  const [filterType, setFilterType] = useState<string>("all");
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);

  // Estados de Transferência
  const [transferDialogOpen, setTransferDialogOpen] = useState<boolean>(false);
  const [transferFromAccountId, setTransferFromAccountId] = useState<string>("");
  const [transferToAccountId, setTransferToAccountId] = useState<string>("");
  const [transferAmount, setTransferAmount] = useState<string>("");
  const [transferDescription, setTransferDescription] = useState<string>("");
  const [transferDate, setTransferDate] = useState<string>(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [transferError, setTransferError] = useState<string | null>(null);

  // Formulário
  const [formName, setFormName] = useState<string>("");
  const [formBankName, setFormBankName] = useState<string>("");
  const [formAccountType, setFormAccountType] = useState<AccountType>("checking");
  const [formInitialBalance, setFormInitialBalance] = useState<string>("0");
  const [formColor, setFormColor] = useState<string>("#2563eb");
  const [formStatus, setFormStatus] = useState<"active" | "archived">("active");
  const [formError, setFormError] = useState<string | null>(null);

  // Query: Listar contas do workspace
  const {
    data: accounts = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<BankAccount[]>({
    queryKey: ["accounts", activeWorkspaceId],
    queryFn: async () => {
      if (!activeWorkspaceId) return [];
      const res = await api.get(`/workspaces/${activeWorkspaceId}/accounts`);
      return res.data;
    },
    enabled: !!activeWorkspaceId,
  });

  // Mutação: Criar Conta
  const createMutation = useMutation({
    mutationFn: async (payload: Partial<BankAccount>) => {
      const res = await api.post(`/workspaces/${activeWorkspaceId}/accounts`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts", activeWorkspaceId] });
      closeDialog();
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error || "Erro ao criar conta bancária.");
    },
  });

  // Mutação: Atualizar Conta
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<BankAccount> }) => {
      const res = await api.put(`/workspaces/${activeWorkspaceId}/accounts/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts", activeWorkspaceId] });
      closeDialog();
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error || "Erro ao atualizar conta bancária.");
    },
  });

  // Mutação: Deletar Conta
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/workspaces/${activeWorkspaceId}/accounts/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts", activeWorkspaceId] });
    },
  });

  // Query: Histórico de Transferências
  const {
    data: transfers = [],
    isLoading: loadingTransfers,
  } = useQuery<AccountTransfer[]>({
    queryKey: ["transfers", activeWorkspaceId],
    queryFn: async () => {
      if (!activeWorkspaceId) return [];
      const res = await api.get(`/workspaces/${activeWorkspaceId}/transfers`);
      return res.data;
    },
    enabled: !!activeWorkspaceId,
  });

  // Mutação: Criar Transferência
  const createTransferMutation = useMutation({
    mutationFn: async (payload: {
      from_account_id: string;
      to_account_id: string;
      amount: number;
      description?: string | null;
      date: string;
    }) => {
      const res = await api.post(`/workspaces/${activeWorkspaceId}/transfers`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers", activeWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["accounts", activeWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", activeWorkspaceId] });
      closeTransferDialog();
    },
    onError: (err: any) => {
      setTransferError(err.response?.data?.error || "Erro ao realizar transferência.");
    },
  });

  // Mutação: Deletar Transferência
  const deleteTransferMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/workspaces/${activeWorkspaceId}/transfers/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers", activeWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["accounts", activeWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", activeWorkspaceId] });
    },
  });

  const openTransferDialog = (fromAccount?: BankAccount) => {
    const activeAccs = accounts.filter((a) => a.status === "active");
    const defaultFrom = fromAccount?.id || (activeAccs.length > 0 ? activeAccs[0].id : "");
    const defaultTo = activeAccs.find((a) => a.id !== defaultFrom)?.id || "";

    setTransferFromAccountId(defaultFrom);
    setTransferToAccountId(defaultTo);
    setTransferAmount("");
    setTransferDescription("");
    setTransferError(null);
    setTransferDialogOpen(true);
  };

  const closeTransferDialog = () => {
    setTransferDialogOpen(false);
    setTransferError(null);
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError(null);

    if (!transferFromAccountId || !transferToAccountId) {
      setTransferError("Selecione as contas de origem e destino.");
      return;
    }

    if (transferFromAccountId === transferToAccountId) {
      setTransferError("A conta de destino deve ser diferente da conta de origem.");
      return;
    }

    const parsedAmount = parseFloat(transferAmount.replace(",", "."));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setTransferError("Informe um valor válido maior que zero.");
      return;
    }

    if (!transferDate) {
      setTransferError("Informe a data da transferência.");
      return;
    }

    createTransferMutation.mutate({
      from_account_id: transferFromAccountId,
      to_account_id: transferToAccountId,
      amount: parsedAmount,
      description: transferDescription.trim() || null,
      date: transferDate,
    });
  };

  // Abertura do Dialog
  const openCreateDialog = () => {
    setEditingAccount(null);
    setFormName("");
    setFormBankName("");
    setFormAccountType("checking");
    setFormInitialBalance("0");
    setFormColor("#2563eb");
    setFormStatus("active");
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (acc: BankAccount) => {
    setEditingAccount(acc);
    setFormName(acc.name);
    setFormBankName(acc.bank_name || "");
    setFormAccountType(acc.account_type);
    setFormInitialBalance(String(acc.initial_balance || 0));
    setFormColor(acc.color || "#2563eb");
    setFormStatus(acc.status);
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingAccount(null);
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError("O nome da conta é obrigatório.");
      return;
    }

    const balNum = parseFloat(formInitialBalance.replace(",", "."));
    if (isNaN(balNum)) {
      setFormError("Informe um saldo inicial válido.");
      return;
    }

    const payload = {
      name: formName.trim(),
      bank_name: formBankName.trim() || null,
      account_type: formAccountType,
      initial_balance: balNum,
      color: formColor,
      status: formStatus,
    };

    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleToggleArchive = (acc: BankAccount) => {
    const nextStatus = acc.status === "active" ? "archived" : "active";
    updateMutation.mutate({ id: acc.id, payload: { status: nextStatus } });
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Tem certeza que deseja excluir esta conta bancária?")) {
      deleteMutation.mutate(id);
    }
  };

  // Filtragem
  const filteredAccounts = accounts.filter((acc) => {
    if (!showArchived && acc.status === "archived") return false;
    if (showArchived && acc.status !== "archived") return false;
    if (filterType !== "all" && acc.account_type !== filterType) return false;
    return true;
  });

  // Métricas / KPIs
  const activeAccounts = accounts.filter((a) => a.status === "active");
  const totalInitialBalance = activeAccounts.reduce((acc, curr) => acc + (curr.initial_balance || 0), 0);
  const checkingCount = activeAccounts.filter((a) => a.account_type === "checking").length;
  const savingsCount = activeAccounts.filter((a) => a.account_type === "savings").length;
  const investmentCount = activeAccounts.filter((a) => a.account_type === "investment").length;
  const cashCount = activeAccounts.filter((a) => a.account_type === "cash").length;

  return (
    <div className="space-y-6">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Landmark className="h-6 w-6 text-primary" />
            Contas e Bancos
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastre suas contas bancárias, poupanças e carteiras de dinheiro para controlar entradas e saldos.
          </p>
        </div>

        {!isViewer && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Link to="/accounts/import">
              <Button variant="outline" className="flex items-center gap-2 shadow-xs font-semibold">
                <Upload className="h-4 w-4 text-primary" />
                Importar Extrato
              </Button>
            </Link>
            <Button onClick={openCreateDialog} className="flex items-center gap-2 shadow-xs font-semibold">
              <Plus className="h-4 w-4" />
              Nova Conta
            </Button>
          </div>
        )}
      </div>

      {/* ── Cards de Métricas / KPIs ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total de Contas Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{activeAccounts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {checkingCount} correntes · {savingsCount} poupanças
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Saldo Inicial Consolidado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(totalInitialBalance)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Soma dos saldos cadastrados</p>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Investimentos & Reservas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {savingsCount + investmentCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {savingsCount} reservas · {investmentCount} investimentos
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Carteiras / Dinheiro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{cashCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Dinheiro em espécie ou físico</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Barra de Filtros ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant={filterType === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("all")}
            className="text-xs h-8"
          >
            Todas ({accounts.length})
          </Button>
          <Button
            variant={filterType === "checking" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("checking")}
            className="text-xs h-8 flex items-center gap-1.5"
          >
            <Landmark className="h-3.5 w-3.5" />
            Corrente
          </Button>
          <Button
            variant={filterType === "savings" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("savings")}
            className="text-xs h-8 flex items-center gap-1.5"
          >
            <PiggyBank className="h-3.5 w-3.5" />
            Poupança
          </Button>
          <Button
            variant={filterType === "investment" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("investment")}
            className="text-xs h-8 flex items-center gap-1.5"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Investimento
          </Button>
          <Button
            variant={filterType === "cash" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("cash")}
            className="text-xs h-8 flex items-center gap-1.5"
          >
            <Banknote className="h-3.5 w-3.5" />
            Dinheiro
          </Button>
        </div>

        <Button
          variant={showArchived ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setShowArchived((prev) => !prev)}
          className="text-xs h-8 flex items-center gap-1.5 text-muted-foreground"
        >
          <Archive className="h-3.5 w-3.5" />
          {showArchived ? "Ver Ativas" : "Ver Arquivadas"}
        </Button>
      </div>

      {/* ── Listagem de Contas ──────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-2 text-primary" />
          <p className="text-sm">Carregando contas bancárias...</p>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 text-red-600">
          <AlertCircle className="h-8 w-8 mb-2" />
          <p className="text-sm font-medium">Erro ao carregar contas bancárias.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">
            Tentar novamente
          </Button>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-xl bg-slate-50/50">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-muted-foreground">
            <Landmark className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">
            {showArchived ? "Nenhuma conta arquivada" : "Nenhuma conta bancária cadastrada"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
            {showArchived
              ? "Contas inativas ou arquivadas aparecerão nesta aba."
              : "Cadastre suas contas para vincular receitas e acompanhar saldos em tempo real."}
          </p>
          {!isViewer && !showArchived && (
            <Button size="sm" onClick={openCreateDialog} className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              Cadastrar Primeira Conta
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAccounts.map((acc) => {
            const typeConfig = ACCOUNT_TYPE_CONFIG[acc.account_type] || ACCOUNT_TYPE_CONFIG.checking;
            const isArchived = acc.status === "archived";

            return (
              <Card
                key={acc.id}
                className={`relative overflow-hidden transition-all hover:shadow-md border-slate-200 ${
                  isArchived ? "opacity-60 bg-slate-50" : "bg-white"
                }`}
              >
                {/* Faixa lateral colorida */}
                <div
                  className="absolute top-0 bottom-0 left-0 w-1.5"
                  style={{ backgroundColor: acc.color || "#2563eb" }}
                />

                <CardContent className="p-5 pl-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                        style={{ backgroundColor: acc.color || "#2563eb" }}
                      >
                        {typeConfig.icon}
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-900 text-base leading-tight truncate">
                          {acc.name}
                        </h4>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <Building2 className="h-3 w-3" />
                          <span>{acc.bank_name || "Sem banco definido"}</span>
                        </div>
                      </div>
                    </div>

                    {!isViewer && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(acc)} className="gap-2">
                            <Pencil className="h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleArchive(acc)} className="gap-2">
                            {isArchived ? (
                              <>
                                <ArchiveRestore className="h-4 w-4" /> Desarquivar
                              </>
                            ) : (
                              <>
                                <Archive className="h-4 w-4" /> Arquivar
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(acc.id)}
                            className="gap-2 text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* Badges e Informações Adicionais */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-[11px] font-medium ${typeConfig.badgeClass}`}>
                        {typeConfig.label}
                      </Badge>

                      {isArchived && (
                        <Badge variant="secondary" className="text-[10px] bg-slate-200 text-slate-700">
                          Arquivada
                        </Badge>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                        Saldo Inicial
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        {formatCurrency(acc.initial_balance || 0)}
                      </span>
                    </div>
                  </div>

                  {!isViewer && !isArchived && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-end gap-1.5">
                      <Link to={`/accounts/import?accountId=${acc.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 gap-1.5 text-slate-600 hover:text-primary hover:bg-primary/10 font-semibold"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Extrato
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openTransferDialog(acc)}
                        className="text-xs h-7 gap-1.5 text-primary hover:text-primary hover:bg-primary/10 font-semibold"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Transferir
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Histórico de Transferências ───────────────────────────────────────── */}
      <div className="mt-8 space-y-3 pt-6 border-t">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            <h3 className="text-base font-bold text-slate-900">Histórico de Transferências</h3>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            {transfers.length} {transfers.length === 1 ? "transferência registrada" : "transferências registradas"}
          </span>
        </div>

        {transfers.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-slate-50/50 p-6 text-center">
            <p className="text-sm font-medium text-slate-600">Nenhuma transferência realizada</p>
            <p className="text-xs text-muted-foreground mt-1">
              Transfira valores entre suas contas para manter o fluxo financeiro organizado.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border divide-y overflow-hidden shadow-xs">
            {transfers.map((tr) => (
              <div
                key={tr.id}
                className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <ArrowRightLeft className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">
                        {tr.from_account_name || "Conta Origem"}
                      </span>
                      <span className="text-xs text-muted-foreground">➔</span>
                      <span className="text-sm font-semibold text-slate-900">
                        {tr.to_account_name || "Conta Destino"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{tr.date}</span>
                      {tr.description && (
                        <>
                          <span>•</span>
                          <span className="truncate">{tr.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span className="text-sm font-bold text-slate-900">
                    {formatCurrency(tr.amount)}
                  </span>
                  {!isViewer && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                      title="Excluir transferência"
                      onClick={() => {
                        if (confirm("Tem certeza que deseja excluir esta transferência?")) {
                          deleteTransferMutation.mutate(tr.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal de Criação / Edição ────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                {editingAccount ? "Editar Conta Bancária" : "Nova Conta Bancária"}
              </DialogTitle>
              <DialogDescription>
                Informe os detalhes da conta para acompanhamento financeiro no workspace.
              </DialogDescription>
            </DialogHeader>

            {formError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-4 py-4">
              {/* Nome da Conta */}
              <div className="space-y-1.5">
                <Label htmlFor="acc-name">Nome da Conta *</Label>
                <Input
                  id="acc-name"
                  placeholder="Ex: Conta Principal, Reserva Nubank, Carteira..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              {/* Banco / Instituição */}
              <div className="space-y-1.5">
                <Label htmlFor="acc-bank">Banco / Instituição</Label>
                <Input
                  id="acc-bank"
                  list="banks-suggestions"
                  placeholder="Ex: Nubank, Banco Inter, Itaú..."
                  value={formBankName}
                  onChange={(e) => setFormBankName(e.target.value)}
                />
                <datalist id="banks-suggestions">
                  {COMMON_BANKS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>

              {/* Tipo de Conta e Saldo Inicial */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="acc-type">Tipo de Conta</Label>
                  <Select
                    value={formAccountType}
                    onValueChange={(val: AccountType) => setFormAccountType(val)}
                  >
                    <SelectTrigger id="acc-type">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checking">🏦 Conta Corrente</SelectItem>
                      <SelectItem value="savings">🐖 Poupança / Reserva</SelectItem>
                      <SelectItem value="investment">📈 Investimentos</SelectItem>
                      <SelectItem value="cash">💵 Carteira / Dinheiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="acc-balance">Saldo Inicial (R$)</Label>
                  <Input
                    id="acc-balance"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={formInitialBalance}
                    onChange={(e) => setFormInitialBalance(e.target.value)}
                  />
                </div>
              </div>

              {/* Seletor de Cores */}
              <div className="space-y-1.5">
                <Label>Cor de Destaque</Label>
                <div className="flex items-center gap-2 pt-1">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`h-7 w-7 rounded-full transition-transform ${
                        formColor === c ? "scale-125 ring-2 ring-offset-2 ring-primary" : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                    title="Escolha uma cor personalizada"
                  />
                </div>
              </div>

              {/* Status (Apenas ao Editar) */}
              {editingAccount && (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="acc-status">Status</Label>
                  <Select
                    value={formStatus}
                    onValueChange={(val: "active" | "archived") => setFormStatus(val)}
                  >
                    <SelectTrigger id="acc-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">🟢 Ativa</SelectItem>
                      <SelectItem value="archived">⚪ Arquivada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : editingAccount ? (
                  "Salvar Alterações"
                ) : (
                  "Criar Conta"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal de Transferência entre Contas ────────────────────────────── */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleTransferSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-primary" />
                Transferir entre Contas
              </DialogTitle>
              <DialogDescription>
                Transfira saldo entre suas contas bancárias do workspace.
              </DialogDescription>
            </DialogHeader>

            {transferError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{transferError}</span>
              </div>
            )}

            <div className="space-y-4 py-3">
              {/* Conta de Origem */}
              <div className="space-y-1.5">
                <Label htmlFor="transfer-from">Conta de Origem (De) *</Label>
                <Select
                  value={transferFromAccountId}
                  onValueChange={setTransferFromAccountId}
                >
                  <SelectTrigger id="transfer-from">
                    <SelectValue placeholder="Selecione a conta de origem" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.status === "active")
                      .map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: acc.color || "#2563eb" }}
                            />
                            <span>{acc.name}</span>
                            {acc.bank_name && (
                              <span className="text-xs text-muted-foreground">({acc.bank_name})</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Conta de Destino */}
              <div className="space-y-1.5">
                <Label htmlFor="transfer-to">Conta de Destino (Para) *</Label>
                <Select
                  value={transferToAccountId}
                  onValueChange={setTransferToAccountId}
                >
                  <SelectTrigger id="transfer-to">
                    <SelectValue placeholder="Selecione a conta de destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.status === "active" && a.id !== transferFromAccountId)
                      .map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: acc.color || "#2563eb" }}
                            />
                            <span>{acc.name}</span>
                            {acc.bank_name && (
                              <span className="text-xs text-muted-foreground">({acc.bank_name})</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Valor e Data */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="transfer-amount">Valor (R$) *</Label>
                  <Input
                    id="transfer-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0,00"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="transfer-date">Data *</Label>
                  <Input
                    id="transfer-date"
                    type="date"
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Descrição */}
              <div className="space-y-1.5">
                <Label htmlFor="transfer-desc">Descrição (Opcional)</Label>
                <Input
                  id="transfer-desc"
                  placeholder="Ex: Reserva de emergência, Aporte..."
                  value={transferDescription}
                  onChange={(e) => setTransferDescription(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={closeTransferDialog}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createTransferMutation.isPending}>
                {createTransferMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Transferindo...
                  </>
                ) : (
                  "Confirmar Transferência"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
