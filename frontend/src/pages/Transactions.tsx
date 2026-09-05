import React, { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Transaction, TransactionSummary, Category, CreditCard, BankAccount } from "@/types";
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
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard as CreditCardIcon,
  Landmark,
  Banknote,
  Tag,
  Filter,
  Layers,
  X,
  Paperclip,
  FileText,
  Image as ImageIcon,
  UploadCloud,
  Eye,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  ShoppingCart,
  Home,
  Car,
  Utensils,
  Heart,
  Briefcase,
  GraduationCap,
  Plane,
  Gift,
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
  CircleDollarSign,
} from "lucide-react";

// ── Ícones do sistema ───────────────────────────────────────────────────────

const ICONS_MAP: Record<string, React.ReactNode> = {
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

function renderCategoryIcon(iconName?: string) {
  if (iconName && ICONS_MAP[iconName]) {
    return ICONS_MAP[iconName];
  }
  return <Tag className="h-4 w-4" />;
}

// ── Helpers de Formatação e Data ───────────────────────────────────────────

function formatCurrency(val: number): string {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTodayString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getCurrentYearMonth(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function formatMonthLabel(yearMonth: string): string {
  const [yyyy, mm] = yearMonth.split("-");
  const date = new Date(Number(yyyy), Number(mm) - 1, 1);
  const monthName = date.toLocaleDateString("pt-BR", { month: "long" });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${yyyy}`;
}

function shiftMonth(yearMonth: string, delta: number): string {
  const [yyyy, mm] = yearMonth.split("-");
  const d = new Date(Number(yyyy), Number(mm) - 1 + delta, 1);
  const nextY = d.getFullYear();
  const nextM = String(d.getMonth() + 1).padStart(2, "0");
  return `${nextY}-${nextM}`;
}

function formatDateHeader(dateStr: string): string {
  const [yyyy, mm, dd] = dateStr.split("-");
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── API calls ──────────────────────────────────────────────────────────────

const fetchCategories = async (workspaceId: string): Promise<Category[]> => {
  const res = await api.get(`/workspaces/${workspaceId}/categories`);
  return res.data;
};

const fetchCards = async (workspaceId: string): Promise<CreditCard[]> => {
  const res = await api.get(`/workspaces/${workspaceId}/credit-cards`);
  return res.data;
};

const fetchAccounts = async (workspaceId: string): Promise<BankAccount[]> => {
  const res = await api.get(`/workspaces/${workspaceId}/accounts`);
  return res.data;
};

const fetchTransactions = async (
  workspaceId: string,
  month: string,
  type?: string,
  categoryId?: string,
  cardId?: string,
  accountId?: string
): Promise<Transaction[]> => {
  const params = { month } as any;
  if (type && type !== "all") params.type = type;
  if (categoryId && categoryId !== "all") params.category_id = categoryId;
  if (cardId && cardId !== "all" && cardId !== "none") {
    params.credit_card_id = cardId;
  }
  if (accountId && accountId !== "all") {
    params.account_id = accountId;
  }

  const res = await api.get(`/workspaces/${workspaceId}/transactions`, { params });
  return res.data;
};

const fetchSummary = async (workspaceId: string, month: string): Promise<TransactionSummary> => {
  const res = await api.get(`/workspaces/${workspaceId}/transactions/summary`, {
    params: { month },
  });
  return res.data;
};

const createTransaction = async ({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: any;
}) => {
  const res = await api.post(`/workspaces/${workspaceId}/transactions`, data);
  return res.data;
};

const updateTransaction = async ({
  workspaceId,
  id,
  data,
}: {
  workspaceId: string;
  id: number;
  data: any;
}) => {
  const res = await api.put(`/workspaces/${workspaceId}/transactions/${id}`, data);
  return res.data;
};

const deleteTransaction = async ({
  workspaceId,
  id,
  all,
}: {
  workspaceId: string;
  id: number;
  all?: boolean;
}) => {
  const res = await api.delete(`/workspaces/${workspaceId}/transactions/${id}`, {
    params: { all: all ? "true" : undefined },
  });
  return res.data;
};

const uploadAttachment = async ({
  workspaceId,
  transactionId,
  file,
}: {
  workspaceId: string;
  transactionId: number;
  file: File;
}) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post(`/workspaces/${workspaceId}/transactions/${transactionId}/attachment`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

const deleteAttachment = async ({
  workspaceId,
  transactionId,
}: {
  workspaceId: string;
  transactionId: number;
}) => {
  const res = await api.delete(`/workspaces/${workspaceId}/transactions/${transactionId}/attachment`);
  return res.data;
};

// ── Tipos de Estado ────────────────────────────────────────────────────────

interface FormState {
  description: string;
  amount: string;
  type: "expense" | "income";
  date: string;
  category_id: string;
  credit_card_id: string;
  account_id: string;
  installments: string;
}

const EMPTY_FORM: FormState = {
  description: "",
  amount: "",
  type: "expense",
  date: getTodayString(),
  category_id: "",
  credit_card_id: "none",
  account_id: "none",
  installments: "1",
};

interface ToastState {
  message: string;
  type: "success" | "error";
}

// ── Componente Principal ───────────────────────────────────────────────────

export default function Transactions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    selectedWorkspaceId,
    hasWorkspace,
  } = useWorkspace();
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentYearMonth());

  // Filtros
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterCard, setFilterCard] = useState<string>("all");
  const [filterAccount, setFilterAccount] = useState<string>("all");

  // Toast
  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Modal formulário
  const [modalOpen, setModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  // Estado de arquivo para anexo no modal
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);

  // Modal visualização de anexo
  const [previewAttachmentTx, setPreviewAttachmentTx] = useState<Transaction | null>(null);

  // Modal exclusão
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", selectedWorkspaceId],
    queryFn: () => fetchCategories(selectedWorkspaceId),
    enabled: !!selectedWorkspaceId,
  });

  const { data: cards = [] } = useQuery({
    queryKey: ["credit-cards", selectedWorkspaceId],
    queryFn: () => fetchCards(selectedWorkspaceId),
    enabled: !!selectedWorkspaceId,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", selectedWorkspaceId],
    queryFn: () => fetchAccounts(selectedWorkspaceId),
    enabled: !!selectedWorkspaceId,
  });

  const {
    data: transactions = [],
    isLoading: loadingTransactions,
    isError: errorTransactions,
  } = useQuery({
    queryKey: [
      "transactions",
      selectedWorkspaceId,
      selectedMonth,
      filterType,
      filterCategory,
      filterCard,
      filterAccount,
    ],
    queryFn: () =>
      fetchTransactions(
        selectedWorkspaceId,
        selectedMonth,
        filterType,
        filterCategory,
        filterCard,
        filterAccount
      ),
    enabled: !!selectedWorkspaceId,
  });

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["transactions-summary", selectedWorkspaceId, selectedMonth],
    queryFn: () => fetchSummary(selectedWorkspaceId, selectedMonth),
    enabled: !!selectedWorkspaceId,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: async (createdTx: any) => {
      const tx = Array.isArray(createdTx) ? createdTx[0] : createdTx;

      // Se houver arquivo selecionado, fazer o upload agora
      if (selectedFile && tx?.id) {
        try {
          setIsUploadingAttachment(true);
          await uploadAttachment({
            workspaceId: selectedWorkspaceId,
            transactionId: tx.id,
            file: selectedFile,
          });
        } catch (uploadErr) {
          console.warn("Erro ao fazer upload do comprovante:", uploadErr);
          showToast("Lançamento salvo, mas houve erro no anexo.", "error");
        } finally {
          setIsUploadingAttachment(false);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["transactions", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", selectedWorkspaceId] });
      showToast("Lançamento adicionado com sucesso!", "success");
      closeModal();
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error || "Erro ao salvar transação");
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateTransaction,
    onSuccess: async () => {
      // Se houver novo arquivo selecionado no modo de edição
      if (selectedFile && editingTransaction?.id) {
        try {
          setIsUploadingAttachment(true);
          await uploadAttachment({
            workspaceId: selectedWorkspaceId,
            transactionId: editingTransaction.id,
            file: selectedFile,
          });
        } catch (uploadErr) {
          console.warn("Erro ao atualizar anexo:", uploadErr);
        } finally {
          setIsUploadingAttachment(false);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["transactions", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", selectedWorkspaceId] });
      showToast("Lançamento atualizado com sucesso!", "success");
      closeModal();
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error || "Erro ao atualizar transação");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", selectedWorkspaceId] });
      showToast("Lançamento excluído com sucesso!", "success");
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      showToast(err.response?.data?.error || "Erro ao excluir transação", "error");
      setDeleteTarget(null);
    },
  });

  const removeAttachmentMutation = useMutation({
    mutationFn: deleteAttachment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", selectedWorkspaceId] });
      showToast("Comprovante removido com sucesso!", "success");
      if (editingTransaction) {
        setEditingTransaction({
          ...editingTransaction,
          receipt_url: null,
          attachment_name: null,
          attachment_type: null,
          attachment_size: null,
        });
      }
    },
    onError: (err: any) => {
      showToast(err.response?.data?.error || "Erro ao remover comprovante", "error");
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      date: getTodayString(),
    });
    setSelectedFile(null);
    setFilePreview(null);
    setFormError("");
    setFormMode("create");
    setEditingTransaction(null);
    setModalOpen(true);
  };

  const openEdit = (tx: Transaction) => {
    setForm({
      description: tx.description || "",
      amount: String(tx.amount),
      type: tx.type,
      date: tx.date,
      category_id: tx.category_id ? String(tx.category_id) : "",
      credit_card_id: tx.credit_card_id || "none",
      account_id: tx.account_id || tx.accountId || "none",
      installments: tx.installments ? String(tx.installments) : "1",
    });
    setSelectedFile(null);
    setFilePreview(null);
    setFormError("");
    setFormMode("edit");
    setEditingTransaction(tx);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedFile(null);
    setFilePreview(null);
    setFormError("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validações
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      setFormError("O arquivo selecionado é maior que o limite de 5MB.");
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setFormError("Formato não suportado. Utilize imagens (JPG, PNG, WEBP) ou PDF.");
      return;
    }

    setFormError("");
    setSelectedFile(file);

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!hasWorkspace) {
      setFormError("Nenhum workspace selecionado. Crie ou selecione um workspace primeiro.");
      return;
    }

    if (!form.description.trim()) {
      setFormError("A descrição do lançamento é obrigatória.");
      return;
    }

    const amountNum = Number(form.amount.replace(",", "."));
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError("Informe um valor numérico positivo.");
      return;
    }

    if (!form.date) {
      setFormError("Informe uma data válida.");
      return;
    }

    const installmentsNum =
      form.credit_card_id !== "none" && form.type === "expense"
        ? Math.max(1, Number(form.installments) || 1)
        : 1;

    const payload = {
      description: form.description.trim(),
      amount: amountNum,
      type: form.type,
      date: form.date,
      category_id: form.category_id ? Number(form.category_id) : null,
      credit_card_id: form.credit_card_id !== "none" ? form.credit_card_id : null,
      account_id: form.account_id !== "none" ? form.account_id : null,
      installments: installmentsNum,
    };

    if (formMode === "create") {
      createMutation.mutate({ workspaceId: selectedWorkspaceId, data: payload });
    } else if (editingTransaction) {
      updateMutation.mutate({ workspaceId: selectedWorkspaceId, id: editingTransaction.id, data: payload });
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending || isUploadingAttachment;

  // Filtrar lista localmente se filtro for "none" para cartão
  const displayTransactions = useMemo(() => {
    if (filterCard === "none") {
      return transactions.filter((t) => !t.credit_card_id);
    }
    return transactions;
  }, [transactions, filterCard]);

  // Agrupar transações por data
  const groupedByDate = useMemo(() => {
    const groups = {} as Record<string, Transaction[]>;
    displayTransactions.forEach((tx) => {
      const d = tx.date;
      if (!groups[d]) groups[d] = [];
      groups[d].push(tx);
    });
    return groups;
  }, [displayTransactions]);

  const datesOrder = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  // Categorias filtradas pelo tipo no modal
  const modalCategories = categories.filter((c) => c.type === form.type);

  // URL do backend para anexo
  const getAttachmentUrl = (txId: number) => {
    return `http://127.0.0.1:8787/workspaces/${selectedWorkspaceId}/transactions/${txId}/attachment`;
  };

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

      {/* Header com Seletor de Workspace e Ação de Novo Lançamento */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controle de receitas, despesas, faturas, parcelamentos e comprovantes.
          </p>
        </div>
        <Button
          id="btn-nova-transacao"
          onClick={openCreate}
          disabled={!selectedWorkspaceId}
          className="gap-2 sm:self-start bg-primary font-semibold"
        >
          <Plus className="h-4 w-4" />
          Novo Lançamento
        </Button>
      </div>

      {/* Barra de Navegação Mensal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border shadow-sm">
        <div className="text-sm font-semibold text-slate-700">
          Período de Referência
        </div>

        {/* Navegador de Mês */}
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
            title="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-sm font-semibold min-w-[170px] justify-center">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{formatMonthLabel(selectedMonth)}</span>
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
            title="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {selectedMonth !== getCurrentYearMonth() && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-primary"
              onClick={() => setSelectedMonth(getCurrentYearMonth())}
            >
              Mês atual
            </Button>
          )}
        </div>
      </div>

      {/* Cards de Resumo Financeiro */}
      {selectedWorkspaceId && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-green-500 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Receitas do Mês
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                {loadingSummary ? "..." : formatCurrency(summary?.total_income || 0)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Despesas do Mês
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">
                {loadingSummary ? "..." : formatCurrency(summary?.total_expense || 0)}
              </p>
            </CardContent>
          </Card>

          <Card
            className={`border-l-4 shadow-sm ${
              (summary?.balance || 0) >= 0 ? "border-l-blue-500" : "border-l-amber-500"
            }`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Saldo do Mês
              </CardTitle>
              <Wallet className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p
                className={`text-2xl font-bold ${
                  (summary?.balance || 0) >= 0 ? "text-slate-900" : "text-amber-600"
                }`}
              >
                {loadingSummary ? "..." : formatCurrency(summary?.balance || 0)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Barra de Filtros */}
      {selectedWorkspaceId && (
        <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-3 rounded-lg border text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium mr-2">
            <Filter className="h-4 w-4" />
            <span>Filtros:</span>
          </div>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-36 h-8 text-xs bg-white">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="expense">Apenas Despesas</SelectItem>
              <SelectItem value="income">Apenas Receitas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-44 h-8 text-xs bg-white">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterCard} onValueChange={setFilterCard}>
            <SelectTrigger className="w-44 h-8 text-xs bg-white">
              <SelectValue placeholder="Forma de Pagamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as formas</SelectItem>
              <SelectItem value="none">Dinheiro / Pix</SelectItem>
              {cards.map((card) => (
                <SelectItem key={card.id} value={card.id}>
                  {card.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterAccount} onValueChange={setFilterAccount}>
            <SelectTrigger className="w-44 h-8 text-xs bg-white">
              <SelectValue placeholder="Conta / Banco" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {accounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.name}{acc.bank_name ? ` (${acc.bank_name})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(filterType !== "all" || filterCategory !== "all" || filterCard !== "all" || filterAccount !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setFilterType("all");
                setFilterCategory("all");
                setFilterCard("all");
                setFilterAccount("all");
              }}
            >
              <X className="h-3 w-3" /> Limpar filtros
            </Button>
          )}
        </div>
      )}

      {/* Lista de Transações Agrupadas por Data */}
      {selectedWorkspaceId && (
        <div className="space-y-6">
          {loadingTransactions && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {errorTransactions && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Não foi possível carregar os lançamentos. Tente recarregar a página.
            </div>
          )}

          {!loadingTransactions && !errorTransactions && displayTransactions.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center bg-white">
              <ArrowLeftRight className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="font-semibold text-base">Nenhuma transação encontrada</p>
              <p className="text-sm text-muted-foreground mt-1 mb-5">
                Não há lançamentos registrados para este período ou com os filtros selecionados.
              </p>
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                Registrar Lançamento
              </Button>
            </div>
          )}

          {!loadingTransactions &&
            datesOrder.map((dateStr) => {
              const dayTransactions = groupedByDate[dateStr] || [];

              return (
                <div key={dateStr} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {formatDateHeader(dateStr)}
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>

                  <div className="bg-white rounded-xl border shadow-sm divide-y">
                    {dayTransactions.map((tx) => {
                      const isIncome = tx.type === "income";
                      const hasAttachment = !!tx.receipt_url;

                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-slate-50 transition-colors group"
                        >
                          {/* Lado Esquerdo: Ícone da categoria + Detalhes */}
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                              style={{ backgroundColor: tx.category_color || "#64748B" }}
                            >
                              {renderCategoryIcon(tx.category_icon)}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-slate-900 truncate">
                                  {tx.description || "Sem descrição"}
                                </p>
                                {hasAttachment && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewAttachmentTx(tx)}
                                    className="text-primary hover:text-primary/80 transition-colors"
                                    title="Ver comprovante anexado"
                                  >
                                    <Paperclip className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                {tx.category_name && (
                                  <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                    {tx.category_name}
                                  </span>
                                )}

                                {tx.credit_card_name ? (
                                  <span className="flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                    <CreditCardIcon className="h-3 w-3" />
                                    {tx.credit_card_name}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                    <Banknote className="h-3 w-3" />
                                    Dinheiro/Pix
                                  </span>
                                )}

                                {tx.account_name && (
                                  <span
                                    className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border"
                                    style={{
                                      backgroundColor: tx.account_color ? `${tx.account_color}18` : "#F1F5F9",
                                      borderColor: tx.account_color ? `${tx.account_color}35` : "#E2E8F0",
                                      color: tx.account_color || "#334155",
                                    }}
                                  >
                                    <Landmark className="h-3 w-3" />
                                    {tx.account_name}
                                  </span>
                                )}

                                {tx.installments && tx.installments > 1 && (
                                  <span className="flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                                    <Layers className="h-3 w-3" />
                                    {tx.installment_current}/{tx.installments}x
                                  </span>
                                )}

                                {hasAttachment && (
                                  <span
                                    onClick={() => setPreviewAttachmentTx(tx)}
                                    className="cursor-pointer flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.2 rounded border border-blue-200 transition-colors"
                                  >
                                    <FileText className="h-3 w-3" /> Comprovante
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Lado Direito: Valor + Menu de Ações */}
                          <div className="flex items-center gap-3 shrink-0 ml-4">
                            <p
                              className={`text-base font-bold tracking-tight ${
                                isIncome ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {isIncome ? "+ " : "- "}
                              {formatCurrency(tx.amount)}
                            </p>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {hasAttachment && (
                                  <DropdownMenuItem
                                    onClick={() => setPreviewAttachmentTx(tx)}
                                    className="gap-2 cursor-pointer text-blue-600 font-medium"
                                  >
                                    <Eye className="h-4 w-4" />
                                    Ver Comprovante
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => openEdit(tx)}
                                  className="gap-2 cursor-pointer"
                                >
                                  <Pencil className="h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setDeleteTarget(tx)}
                                  className="gap-2 cursor-pointer text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Modal Criar / Editar Lançamento */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {formMode === "create" ? "Novo Lançamento" : "Editar Lançamento"}
            </DialogTitle>
            <DialogDescription>
              Registre uma despesa ou receita e anexe seus comprovantes no Cloudflare R2.
            </DialogDescription>
          </DialogHeader>

          <form id="transaction-form" onSubmit={handleSubmit} className="space-y-4 py-2">
            {formError && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            {/* Toggle Tipo: Despesa vs Receita */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: "expense", installments: "1" }))}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
                  form.type === "expense"
                    ? "border-red-500 bg-red-50 text-red-700 shadow-sm"
                    : "border-slate-200 text-muted-foreground hover:bg-slate-50"
                }`}
              >
                <TrendingDown className="h-4 w-4" /> Despesa
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    type: "income",
                    credit_card_id: "none",
                    installments: "1",
                  }))
                }
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
                  form.type === "income"
                    ? "border-green-500 bg-green-50 text-green-700 shadow-sm"
                    : "border-slate-200 text-muted-foreground hover:bg-slate-50"
                }`}
              >
                <TrendingUp className="h-4 w-4" /> Receita
              </button>
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="tx-desc">Descrição *</Label>
              <Input
                id="tx-desc"
                placeholder="Ex: Supermercado, Aluguel, Salário..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                disabled={isMutating}
                autoFocus
              />
            </div>

            {/* Valor e Data */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tx-amount">Valor (R$) *</Label>
                <Input
                  id="tx-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  disabled={isMutating}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tx-date">Data *</Label>
                <Input
                  id="tx-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  disabled={isMutating}
                />
              </div>
            </div>

            {/* Categoria */}
            <div className="space-y-2">
              <Label htmlFor="tx-category">Categoria</Label>
              <Select
                value={form.category_id}
                onValueChange={(val) => setForm((f) => ({ ...f, category_id: val }))}
              >
                <SelectTrigger id="tx-category">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {modalCategories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        <span>{c.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Conta / Banco */}
            <div className="space-y-2">
              <Label htmlFor="tx-account">Conta / Banco (Opcional)</Label>
              <Select
                value={form.account_id}
                onValueChange={(val) => setForm((f) => ({ ...f, account_id: val }))}
              >
                <SelectTrigger id="tx-account">
                  <SelectValue placeholder="Selecione uma conta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Nenhuma conta vinculada</span>
                  </SelectItem>
                  {accounts
                    .filter((a) => a.status === "active" || a.id === form.account_id)
                    .map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: acc.color || "#3B82F6" }}
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

            {/* Forma de Pagamento */}
            {form.type === "expense" && (
              <div className="space-y-2">
                <Label htmlFor="tx-payment">Forma de Pagamento</Label>
                <Select
                  value={form.credit_card_id}
                  onValueChange={(val) => setForm((f) => ({ ...f, credit_card_id: val }))}
                >
                  <SelectTrigger id="tx-payment">
                    <SelectValue placeholder="Selecione a forma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <div className="flex items-center gap-2">
                        <Banknote className="h-4 w-4 text-slate-500" />
                        <span>Dinheiro / Pix / Débito</span>
                      </div>
                    </SelectItem>
                    {cards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        <div className="flex items-center gap-2">
                          <CreditCardIcon className="h-4 w-4 text-indigo-600" />
                          <span>{card.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Campo Parcelas */}
            {form.type === "expense" && form.credit_card_id !== "none" && formMode === "create" && (
              <div className="space-y-2 bg-purple-50/50 p-3 rounded-lg border border-purple-100">
                <Label htmlFor="tx-installments" className="text-purple-900 font-semibold">
                  Parcelamento
                </Label>
                <Select
                  value={form.installments}
                  onValueChange={(val) => setForm((f) => ({ ...f, installments: val }))}
                >
                  <SelectTrigger id="tx-installments" className="bg-white">
                    <SelectValue placeholder="Quantidade de parcelas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">À vista (1x)</SelectItem>
                    {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}x de{" "}
                        {form.amount && !isNaN(Number(form.amount))
                          ? formatCurrency(Number(form.amount) / n)
                          : "..."}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Campo de Comprovante / Anexo (Cloudflare R2) */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-primary" /> Anexar Comprovante (R2)
                </span>
                <span className="text-muted-foreground font-normal lowercase">Max 5MB (JPG, PNG, PDF)</span>
              </Label>

              {/* Anexo existente se em modo de edição */}
              {formMode === "edit" && editingTransaction?.receipt_url && !selectedFile && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">
                        {editingTransaction.attachment_name || "Comprovante anexado"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatFileSize(editingTransaction.attachment_size)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-primary"
                      onClick={() => setPreviewAttachmentTx(editingTransaction)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-600 hover:text-red-700"
                      disabled={removeAttachmentMutation.isPending}
                      onClick={() =>
                        removeAttachmentMutation.mutate({
                          workspaceId: selectedWorkspaceId,
                          transactionId: editingTransaction.id,
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
                    </Button>
                  </div>
                </div>
              )}

              {/* Novo arquivo selecionado */}
              {selectedFile ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50/50 border border-blue-200 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    {filePreview ? (
                      <img
                        src={filePreview}
                        alt="Preview"
                        className="h-10 w-10 object-cover rounded-lg border border-slate-200 shrink-0"
                      />
                    ) : (
                      <FileText className="h-6 w-6 text-primary shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{selectedFile.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-red-600 hover:text-red-700"
                    onClick={() => {
                      setSelectedFile(null);
                      setFilePreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <X className="h-4 w-4 mr-1" /> Cancelar
                  </Button>
                </div>
              ) : (
                /* Dropzone / Upload button */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-primary/50 hover:bg-slate-50/50 rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5"
                >
                  <UploadCloud className="h-6 w-6 text-muted-foreground" />
                  <p className="text-xs font-semibold text-slate-700">
                    Clique para selecionar ou arraste o comprovante
                  </p>
                  <p className="text-[11px] text-muted-foreground">JPG, PNG, WEBP ou PDF até 5MB</p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </form>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeModal} disabled={isMutating}>
              Cancelar
            </Button>
            <Button type="submit" form="transaction-form" disabled={isMutating}>
              {isMutating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isUploadingAttachment
                    ? "Enviando comprovante..."
                    : formMode === "create"
                    ? "Registrando..."
                    : "Salvando..."}
                </>
              ) : formMode === "create" ? (
                "Criar Lançamento"
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL VISUALIZAÇÃO DE COMPROVANTE (R2) ─────────────────────────── */}
      <Dialog
        open={!!previewAttachmentTx}
        onOpenChange={(open) => {
          if (!open) setPreviewAttachmentTx(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          {previewAttachmentTx && (
            <>
              <DialogHeader className="p-4 border-b bg-slate-50 shrink-0">
                <div className="flex items-center justify-between pr-6">
                  <div>
                    <DialogTitle className="text-base font-bold flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-primary" />
                      Comprovante do Lançamento
                    </DialogTitle>
                    <DialogDescription className="text-xs mt-0.5">
                      {previewAttachmentTx.description} • {formatCurrency(previewAttachmentTx.amount)}
                    </DialogDescription>
                  </div>
                  <a
                    href={getAttachmentUrl(previewAttachmentTx.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline font-semibold"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir em nova aba
                  </a>
                </div>
              </DialogHeader>

              <div className="p-4 overflow-y-auto flex-1 flex flex-col items-center justify-center min-h-[300px] bg-slate-100/50">
                {previewAttachmentTx.attachment_type === "application/pdf" ||
                previewAttachmentTx.attachment_name?.toLowerCase().endsWith(".pdf") ? (
                  <div className="flex flex-col items-center gap-4 py-8 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 shadow-sm">
                      <FileText className="h-8 w-8" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">
                        {previewAttachmentTx.attachment_name || "Documento PDF"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatFileSize(previewAttachmentTx.attachment_size)}
                      </p>
                    </div>
                    <a
                      href={getAttachmentUrl(previewAttachmentTx.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button className="gap-2">
                        <Download className="h-4 w-4" /> Visualizar / Baixar PDF
                      </Button>
                    </a>
                  </div>
                ) : (
                  <div className="w-full flex items-center justify-center">
                    <img
                      src={getAttachmentUrl(previewAttachmentTx.id)}
                      alt="Comprovante"
                      className="max-h-[60vh] max-w-full rounded-lg shadow-md object-contain border bg-white"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="p-3 border-t bg-slate-50 shrink-0">
                <Button variant="outline" size="sm" onClick={() => setPreviewAttachmentTx(null)}>
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Confirmação de Exclusão */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Excluir Lançamento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o lançamento{" "}
              <span className="font-semibold text-foreground">
                "{deleteTarget?.description || "Sem descrição"}"
              </span>{" "}
              no valor de{" "}
              <span className="font-semibold text-foreground">
                {deleteTarget && formatCurrency(deleteTarget.amount)}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>

          {deleteTarget?.installment_group_id && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">⚠️ Este lançamento faz parte de uma compra parcelada.</p>
              <p>
                Você pode optar por remover apenas esta parcela ({deleteTarget.installment_current}/
                {deleteTarget.installments}) ou todas as parcelas do grupo.
              </p>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>

            {deleteTarget?.installment_group_id ? (
              <>
                <Button
                  variant="destructive"
                  onClick={() =>
                    deleteTarget &&
                    deleteMutation.mutate({
                      workspaceId: selectedWorkspaceId,
                      id: deleteTarget.id,
                      all: false,
                    })
                  }
                  disabled={deleteMutation.isPending}
                >
                  Excluir só esta parcela
                </Button>
                <Button
                  variant="destructive"
                  className="bg-red-800 hover:bg-red-900"
                  onClick={() =>
                    deleteTarget &&
                    deleteMutation.mutate({
                      workspaceId: selectedWorkspaceId,
                      id: deleteTarget.id,
                      all: true,
                    })
                  }
                  disabled={deleteMutation.isPending}
                >
                  Excluir todas as parcelas
                </Button>
              </>
            ) : (
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
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
