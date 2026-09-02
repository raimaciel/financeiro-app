import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { CreditCard, Invoice, Workspace, InvoiceForecastResponse } from "@/types";
import { BrandBadge, BRAND_ICONS } from "@/components/BrandIcons";
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
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  CreditCard as CreditCardIcon,
  CalendarDays,
  Calendar,
  Receipt,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  Sparkles,
  RefreshCw,
  Building2,
  Upload,
  Image as ImageIcon,
  X,
} from "lucide-react";

// Paleta de cores para cartões
const CARD_COLORS = [
  "#1a1a2e", "#16213e", "#0f3460", "#533483",
  "#1b4332", "#2d6a4f", "#1d3557", "#457b9d",
  "#6d2b3d", "#c1121f", "#e63946", "#f4a261",
  "#2b2d42", "#44355b", "#3a0ca3", "#480ca8",
];

function contrastColor(hex: string): string {
  if (!hex || hex.length < 7) return "#ffffff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a1a" : "#ffffff";
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const [yyyy, mm, dd] = dateStr.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function formatMonthYear(refMonth: string): string {
  if (!refMonth) return "";
  const [yyyy, mm] = refMonth.split("-");
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const idx = parseInt(mm, 10) - 1;
  return `${monthNames[idx] || mm} ${yyyy}`;
}

// Queries da API
const fetchWorkspaces = async (): Promise<Workspace[]> => {
  const res = await api.get("/workspaces");
  return res.data;
};

const fetchCards = async (workspaceId: string): Promise<CreditCard[]> => {
  const res = await api.get(`/workspaces/${workspaceId}/credit-cards`);
  return res.data;
};

const fetchInvoices = async (workspaceId: string, cardId: string): Promise<Invoice[]> => {
  const res = await api.get(`/cards/${cardId}/invoices`);
  return res.data;
};

const fetchForecast = async (workspaceId: string, cardId: string): Promise<InvoiceForecastResponse> => {
  const res = await api.get(`/workspaces/${workspaceId}/credit-cards/${cardId}/invoice/forecast?months=6`);
  return res.data;
};

const createCard = async ({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: Partial<CreditCard>;
}) => {
  const res = await api.post(`/workspaces/${workspaceId}/credit-cards`, data);
  return res.data;
};

const updateCard = async ({
  workspaceId,
  id,
  data,
}: {
  workspaceId: string;
  id: string;
  data: Partial<CreditCard>;
}) => {
  const res = await api.put(`/workspaces/${workspaceId}/credit-cards/${id}`, data);
  return res.data;
};

const deleteCard = async ({
  workspaceId,
  id,
}: {
  workspaceId: string;
  id: string;
}) => {
  const res = await api.delete(`/workspaces/${workspaceId}/credit-cards/${id}`);
  return res.data;
};

const payInvoice = async ({
  workspaceId,
  invoiceId,
}: {
  workspaceId: string;
  invoiceId: string;
}) => {
  const res = await api.post(`/invoices/${invoiceId}/pay`);
  return res.data;
};

interface FormState {
  name: string;
  cardType: "physical" | "virtual";
  bankName: string;
  brand: string;
  lastFourDigits: string;
  institution: string;
  cardTier: "standard" | "gold" | "platinum" | "black" | "infinite" | string;
  limit_amount: number | string;
  closing_day: string;
  due_day: string;
  color: string;
  existingImageUrl?: string | null;
  imageFile?: File | null;
  imagePreviewUrl?: string | null;
  removeImage?: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  cardType: "physical",
  bankName: "",
  brand: "",
  lastFourDigits: "",
  institution: "",
  cardTier: "standard",
  limit_amount: "",
  closing_day: "25",
  due_day: "5",
  color: "#1a1a2e",
  existingImageUrl: null,
  imageFile: null,
  imagePreviewUrl: null,
  removeImage: false,
};

type FormMode = "create" | "edit";
interface ToastState { message: string; type: "success" | "error" }

// Card Visual Item
function CardItem({
  card,
  workspaceId,
  onEdit,
  onDelete,
  onOpenInvoices,
}: {
  card: CreditCard;
  workspaceId: string;
  onEdit: (c: CreditCard) => void;
  onDelete: (c: CreditCard) => void;
  onOpenInvoices: (c: CreditCard) => void;
}) {
  const textColor = contrastColor(card.color ?? "#1a1a2e");
  const bg = card.color ?? "#1a1a2e";

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", workspaceId, card.id],
    queryFn: () => fetchInvoices(workspaceId, card.id),
    enabled: !!workspaceId && !!card.id,
  });

  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const currentInvoice =
    invoices.find((inv) => inv.start_date && inv.closing_date && todayISO >= inv.start_date && todayISO <= inv.closing_date) ||
    invoices.find((inv) => inv.reference_month === currentMonthISO) ||
    invoices.find((inv) => inv.status === 'open') ||
    (invoices.length > 0 ? invoices[0] : null);
  const isVirtual = (card.cardType || card.card_type) === "virtual";
  const tier = card.cardTier || card.card_tier || "standard";
  const bankName = card.bankName || card.bank_name;
  const last4 = card.lastFourDigits || card.last_four_digits;
  const hasImage = !!(card.card_image_url || card.cardImageUrl || card.image_url || card.imageUrl);
  const cardImageSrc = card.imageUrl || card.image_url || (card.card_image_url ? `/cards/${card.id}/image` : null);

  return (
    <div className="flex flex-col gap-2">
      <div
        onClick={() => onOpenInvoices(card)}
        className="relative rounded-2xl p-5 shadow-lg flex flex-col justify-between min-h-[190px] transition-all hover:-translate-y-1 hover:shadow-xl cursor-pointer group select-none overflow-hidden"
        style={{
          backgroundColor: bg,
          color: hasImage ? "#ffffff" : textColor,
        }}
      >
        {/* Background Foto do Cartão se existir */}
        {hasImage && cardImageSrc ? (
          <>
            <img
              src={cardImageSrc}
              alt={card.name}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/40 pointer-events-none" />
          </>
        ) : (
          <>
            <div
              className="absolute -right-12 -bottom-12 w-48 h-48 rounded-full opacity-10 pointer-events-none"
              style={{ backgroundColor: textColor }}
            />
            <div
              className="absolute -left-8 -top-8 w-32 h-32 rounded-full opacity-10 pointer-events-none"
              style={{ backgroundColor: textColor }}
            />
          </>
        )}

        <div className="flex items-start justify-between relative z-10">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <BrandBadge brand={card.brand} />
              {tier && tier.toLowerCase() !== "standard" && (
                <span
                  className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded tracking-wide border shadow-2xs backdrop-blur-xs"
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.22)",
                    borderColor: "rgba(255, 255, 255, 0.35)",
                    color: hasImage ? "#ffffff" : textColor,
                  }}
                >
                  {tier}
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold tracking-tight truncate max-w-[180px] drop-shadow-xs">
              {card.name}
            </h3>
            {bankName && (
              <p className="text-xs font-medium flex items-center gap-1 mt-0.5 opacity-90 drop-shadow-xs">
                <Building2 className="h-3 w-3 inline opacity-90" />
                {bankName}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full border shadow-2xs backdrop-blur-xs flex items-center gap-1"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                borderColor: "rgba(255, 255, 255, 0.3)",
                color: hasImage ? "#ffffff" : textColor,
              }}
            >
              {isVirtual ? "💳 Virtual" : "🏦 Físico"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button
                  className="p-1 rounded-full hover:bg-black/20 transition-colors opacity-80 hover:opacity-100 ml-1"
                  style={{ color: hasImage ? "#ffffff" : textColor }}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => onOpenInvoices(card)}>
                  <Receipt className="h-4 w-4 mr-2" />
                  Ver Faturas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(card)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(card)} className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="space-y-2 relative z-10 mt-3">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-xs tracking-widest opacity-85 select-all drop-shadow-xs">
              •••• {last4 || "----"}
            </span>
            <div className="text-right">
              <span className="text-[11px] opacity-80 mr-1.5">Limite:</span>
              <span className="text-sm font-bold drop-shadow-xs">
                {formatCurrency(card.limit_amount ?? 0)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs opacity-85 pt-1.5 border-t border-white/25">
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              <span>Fecha dia {card.closing_day}</span>
            </div>
            <div className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>Vence dia {card.due_day}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Resumo da Fatura Atual */}
      <div
        onClick={() => onOpenInvoices(card)}
        className="bg-white border rounded-xl p-3 shadow-xs hover:border-slate-300 transition-colors cursor-pointer flex items-center justify-between text-xs"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Receipt className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <span className="font-semibold text-slate-900">
              Fatura {currentInvoice ? formatMonthYear(currentInvoice.reference_month) : "Atual"}:
            </span>{" "}
            <span className="font-bold text-slate-800">
              {currentInvoice ? formatCurrency(currentInvoice.total_amount) : "R$ 0,00"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {currentInvoice ? (
            currentInvoice.status === "paid" ? (
              <span className="text-green-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Paga
              </span>
            ) : currentInvoice.days_until_due < 0 ? (
              <span className="text-red-600 font-semibold">
                Venceu há {Math.abs(currentInvoice.days_until_due)}d
              </span>
            ) : (
              <span className="text-muted-foreground font-medium">
                Vence em {currentInvoice.days_until_due === 0 ? "hoje" : `${currentInvoice.days_until_due}d`}
              </span>
            )
          ) : (
            <span className="text-muted-foreground">Sem lançamentos</span>
          )}
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </div>
      </div>
    </div>
  );
}

export default function CreditCards() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [toast, setToast] = useState<ToastState | null>(null);

  // Modais de Cartão
  const [modalOpen, setModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CreditCard | null>(null);

  // Modal de Faturas
  const [invoicesCard, setInvoicesCard] = useState<CreditCard | null>(null);
  const [selectedInvoiceIndex, setSelectedInvoiceIndex] = useState<number>(0);
  const [invoiceTab, setInvoiceTab] = useState<"invoices" | "forecast">("invoices");

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces,
  });

  React.useEffect(() => {
    if (workspaces.length > 0 && !selectedWorkspaceId) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
  }, [workspaces, selectedWorkspaceId]);

  const activeWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);
  const canEdit = activeWorkspace?.role !== "viewer";

  const { data: cards = [], isLoading: loadingCards } = useQuery<CreditCard[]>({
    queryKey: ["credit-cards", selectedWorkspaceId],
    queryFn: () => fetchCards(selectedWorkspaceId),
    enabled: !!selectedWorkspaceId,
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["invoices", selectedWorkspaceId, invoicesCard?.id],
    queryFn: () => fetchInvoices(selectedWorkspaceId, invoicesCard!.id),
    enabled: !!selectedWorkspaceId && !!invoicesCard?.id,
  });

  // Seleciona a fatura do mês atual por padrão quando as faturas do modal carregam
  React.useEffect(() => {
    if (invoices.length > 0) {
      const now = new Date();
      const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const currentMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const activeIdx = invoices.findIndex(
        (inv) =>
          (inv.start_date && inv.closing_date && todayISO >= inv.start_date && todayISO <= inv.closing_date) ||
          inv.reference_month === currentMonthISO ||
          inv.status === 'open'
      );
      if (activeIdx !== -1) {
        setSelectedInvoiceIndex(activeIdx);
      } else {
        setSelectedInvoiceIndex(0);
      }
    }
  }, [invoices]);

  const { data: forecastData, isLoading: loadingForecast } = useQuery<InvoiceForecastResponse>({
    queryKey: ["invoice-forecast", selectedWorkspaceId, invoicesCard?.id],
    queryFn: () => fetchForecast(selectedWorkspaceId, invoicesCard!.id),
    enabled: !!selectedWorkspaceId && !!invoicesCard?.id && invoiceTab === "forecast",
  });

  const selectedInvoice: Invoice | null = invoices[selectedInvoiceIndex] ?? null;

  const deleteMutation = useMutation({
    mutationFn: deleteCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-cards", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteTarget(null);
      showToast("Cartão excluído com sucesso!", "success");
    },
    onError: (err: any) => {
      showToast(err.response?.data?.error || "Erro ao excluir cartão.", "error");
    },
  });

  const payMutation = useMutation({
    mutationFn: payInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      showToast("Fatura marcada como paga!", "success");
    },
    onError: (err: any) => {
      showToast(err.response?.data?.error || "Erro ao pagar fatura.", "error");
    },
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setFormMode("create");
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (card: CreditCard) => {
    const existingImg = card.imageUrl || card.image_url || (card.card_image_url ? `/cards/${card.id}/image` : null);
    setForm({
      name: card.name,
      cardType: card.cardType || card.card_type || "physical",
      bankName: card.bankName || card.bank_name || "",
      brand: card.brand ?? "",
      lastFourDigits: card.lastFourDigits || card.last_four_digits || "",
      institution: card.institution || "",
      cardTier: card.cardTier || card.card_tier || "standard",
      limit_amount: card.limit_amount ?? "",
      closing_day: String(card.closing_day),
      due_day: String(card.due_day),
      color: card.color ?? "#1a1a2e",
      existingImageUrl: existingImg,
      imageFile: null,
      imagePreviewUrl: null,
      removeImage: false,
    });
    setFormError("");
    setFormMode("edit");
    setEditingId(card.id);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (form.imagePreviewUrl) {
      URL.revokeObjectURL(form.imagePreviewUrl);
    }
    setModalOpen(false);
    setFormError("");
    setIsSubmitting(false);
  };

  const handleOpenInvoices = (card: CreditCard) => {
    setInvoicesCard(card);
    setSelectedInvoiceIndex(0);
    setInvoiceTab("invoices");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFormError("Por favor, selecione um arquivo de imagem válido (JPG, PNG, WEBP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFormError("A imagem selecionada excede o limite máximo de 5MB.");
      return;
    }

    setFormError("");
    const preview = URL.createObjectURL(file);
    setForm((prev) => ({
      ...prev,
      imageFile: file,
      imagePreviewUrl: preview,
      removeImage: false,
    }));
  };

  const handleRemoveImage = () => {
    if (form.imagePreviewUrl) {
      URL.revokeObjectURL(form.imagePreviewUrl);
    }
    setForm((prev) => ({
      ...prev,
      imageFile: null,
      imagePreviewUrl: null,
      existingImageUrl: null,
      removeImage: true,
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!form.name.trim()) {
      setFormError("O nome do cartão é obrigatório.");
      return;
    }

    const closingDay = Number(form.closing_day);
    const dueDay = Number(form.due_day);

    if (!form.closing_day || isNaN(closingDay) || closingDay < 1 || closingDay > 31) {
      setFormError("Dia de fechamento inválido (1 a 31).");
      return;
    }

    if (!form.due_day || isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
      setFormError("Dia de vencimento inválido (1 a 31).");
      return;
    }

    if (form.lastFourDigits && form.lastFourDigits.length > 0 && form.lastFourDigits.length < 4) {
      setFormError("Os últimos 4 dígitos devem conter exatamente 4 números.");
      return;
    }

    const limitAmount = typeof form.limit_amount === "number" ? form.limit_amount : Number(String(form.limit_amount || 0).replace(",", "."));

    const payload = {
      name: form.name.trim(),
      cardType: form.cardType,
      bankName: form.bankName ? form.bankName.trim() : undefined,
      brand: form.brand.trim() || undefined,
      lastFourDigits: form.lastFourDigits ? form.lastFourDigits.trim() : undefined,
      institution: form.institution ? form.institution.trim() : undefined,
      cardTier: form.cardTier,
      limit_amount: limitAmount,
      closing_day: closingDay,
      due_day: dueDay,
      color: form.color,
    };

    setIsSubmitting(true);

    try {
      let cardId = editingId;

      if (formMode === "create") {
        const created = await createCard({ workspaceId: selectedWorkspaceId, data: payload });
        cardId = created.id;
      } else if (editingId) {
        await updateCard({ workspaceId: selectedWorkspaceId, id: editingId, data: payload });
      }

      // Processar upload ou remoção da imagem se necessário
      if (cardId) {
        if (form.imageFile) {
          const formData = new FormData();
          formData.append("cardImage", form.imageFile);
          await api.post(`/workspaces/${selectedWorkspaceId}/credit-cards/${cardId}/image`, formData);
        } else if (form.removeImage && formMode === "edit") {
          try {
            await api.delete(`/workspaces/${selectedWorkspaceId}/credit-cards/${cardId}/image`);
          } catch (delErr) {
            console.warn("Erro ao remover imagem:", delErr);
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["credit-cards", selectedWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      closeModal();
      showToast(formMode === "create" ? "Cartão cadastrado com sucesso!" : "Cartão atualizado com sucesso!", "success");
    } catch (err: any) {
      setFormError(err.response?.data?.error || "Erro ao salvar cartão de crédito.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <CreditCardIcon className="h-8 w-8 text-primary" />
            Cartões de Crédito e Faturas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controle limites, identificação, datas de fechamento/vencimento, faturas abertas e previsão de compras parceladas.
          </p>
        </div>

        <div className="flex items-center gap-3">
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
            disabled={!canEdit}
            onClick={openCreate}
            className="gap-2 font-semibold shadow-xs"
          >
            <Plus className="h-4 w-4" /> Novo Cartão
          </Button>
        </div>
      </div>

      {/* Listagem de Cartões */}
      {loadingCards ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : cards.length === 0 ? (
        <Card className="p-12 text-center text-slate-400 border border-dashed">
          <CreditCardIcon className="h-10 w-10 mx-auto text-slate-300 mb-2" />
          <p className="font-semibold text-slate-700">Nenhum cartão cadastrado neste workspace</p>
          <p className="text-xs text-slate-400 mt-1">
            Cadastre seu primeiro cartão de crédito para acompanhar faturas e limites.
          </p>
          <Button
            disabled={!canEdit}
            onClick={openCreate}
            className="mt-4 gap-2 font-semibold text-xs"
          >
            <Plus className="h-4 w-4" /> Cadastrar Cartão
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              workspaceId={selectedWorkspaceId}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
              onOpenInvoices={handleOpenInvoices}
            />
          ))}
        </div>
      )}

      {/* MODAL: CADASTRO / EDIÇÃO DE CARTÃO */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {formMode === "create" ? "Novo Cartão de Crédito" : "Editar Cartão de Crédito"}
            </DialogTitle>
            <DialogDescription>
              Configure os dados de identificação, limite e os dias de fechamento e vencimento da fatura.
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5 py-1">
            {/* 1. Nome do Cartão (Largura total) */}
            <div className="space-y-1.5">
              <Label htmlFor="card-name">Nome do Cartão *</Label>
              <Input
                id="card-name"
                placeholder="Ex: Nubank Ultravioleta, Itaú Personnalité"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* 2. Grid 2 colunas: Tipo de Cartão + Tier do Cartão */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="card-type">Tipo de Cartão</Label>
                <Select
                  value={form.cardType}
                  onValueChange={(val: "physical" | "virtual") => setForm((f) => ({ ...f, cardType: val }))}
                >
                  <SelectTrigger id="card-type" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="physical">🏦 Físico</SelectItem>
                    <SelectItem value="virtual">💳 Virtual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="card-tier">Tier do Cartão</Label>
                <Select
                  value={form.cardTier}
                  onValueChange={(val) => setForm((f) => ({ ...f, cardTier: val }))}
                >
                  <SelectTrigger id="card-tier" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard / Básico</SelectItem>
                    <SelectItem value="gold">Gold</SelectItem>
                    <SelectItem value="platinum">Platinum</SelectItem>
                    <SelectItem value="black">Black</SelectItem>
                    <SelectItem value="infinite">Infinite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 3. Grid 2 colunas: Banco / Emissor + Bandeira */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="card-bank" className="font-semibold text-slate-800 flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-primary" /> Banco / Emissor
                </Label>
                <Input
                  id="card-bank"
                  placeholder="Ex: Nubank, Itaú, Inter, Bradesco"
                  value={form.bankName}
                  onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="card-brand">Bandeira (Opcional)</Label>
                <Select
                  value={form.brand}
                  onValueChange={(val) => setForm((f) => ({ ...f, brand: val }))}
                >
                  <SelectTrigger id="card-brand" className="bg-white">
                    <SelectValue placeholder="Selecione a bandeira" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mastercard">
                      <div className="flex items-center gap-2">
                        <BRAND_ICONS.mastercard className="h-4 w-6 inline-block" />
                        <span>Mastercard</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="Visa">
                      <div className="flex items-center gap-2">
                        <BRAND_ICONS.visa className="h-4 w-6 inline-block" />
                        <span>Visa</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="Elo">
                      <div className="flex items-center gap-2">
                        <BRAND_ICONS.elo className="h-4 w-6 inline-block" />
                        <span>Elo</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="American Express">
                      <div className="flex items-center gap-2">
                        <BRAND_ICONS.amex className="h-4 w-6 inline-block" />
                        <span>American Express</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="Hipercard">
                      <div className="flex items-center gap-2">
                        <BRAND_ICONS.hipercard className="h-4 w-6 inline-block" />
                        <span>Hipercard</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="Outra">
                      <div className="flex items-center gap-2">
                        <CreditCardIcon className="h-4 w-4 text-slate-500" />
                        <span>Outra</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 4. Grid 2 colunas: Últimos 4 dígitos + Instituição */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="card-digits">Últimos 4 dígitos</Label>
                <Input
                  id="card-digits"
                  type="text"
                  maxLength={4}
                  placeholder="1234"
                  value={form.lastFourDigits}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setForm((f) => ({ ...f, lastFourDigits: val }));
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="card-institution">Instituição (Opcional)</Label>
                <Input
                  id="card-institution"
                  placeholder="Ex: Nu Pagamentos S.A."
                  value={form.institution}
                  onChange={(e) => setForm((f) => ({ ...f, institution: e.target.value }))}
                />
              </div>
            </div>

            {/* 5. Limite Total (Largura total) */}
            <div className="space-y-1.5">
              <Label htmlFor="card-limit">Limite Total (R$)</Label>
              <CurrencyInput
                id="card-limit"
                value={form.limit_amount}
                onChange={(val) => setForm((f) => ({ ...f, limit_amount: val }))}
                placeholder="0,00"
              />
            </div>

            {/* 6. Grid 2 colunas: Dias de Fechamento e Vencimento */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="card-closing">Dia do Fechamento (1-31) *</Label>
                <Select
                  value={form.closing_day}
                  onValueChange={(val) => setForm((f) => ({ ...f, closing_day: val }))}
                >
                  <SelectTrigger id="card-closing" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        Dia {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="card-due">Dia do Vencimento (1-31) *</Label>
                <Select
                  value={form.due_day}
                  onValueChange={(val) => setForm((f) => ({ ...f, due_day: val }))}
                >
                  <SelectTrigger id="card-due" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        Dia {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 7. Foto do Cartão (Upload de Imagem Opcional) */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <Label htmlFor="card-photo" className="flex items-center gap-1.5 text-xs font-semibold">
                <ImageIcon className="h-3.5 w-3.5 text-primary" /> Foto / Imagem do Cartão (Opcional)
              </Label>

              {/* Preview de imagem */}
              {(form.imagePreviewUrl || form.existingImageUrl) && (
                <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100 h-24 flex items-center justify-center group">
                  <img
                    src={form.imagePreviewUrl || form.existingImageUrl!}
                    alt="Preview do Cartão"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-md transition-colors"
                    title="Remover imagem"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  id="card-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2 text-xs font-semibold h-8"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {form.imagePreviewUrl || form.existingImageUrl ? "Trocar Foto" : "Enviar Foto do Cartão"}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  JPG, PNG ou WEBP (máx. 5MB)
                </span>
              </div>
            </div>

            {/* 8. Cor do Cartão */}
            <div className="space-y-1.5 pt-1 border-t border-slate-100">
              <Label className="text-xs font-semibold">Cor de Fundo do Cartão</Label>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {CARD_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`h-5 w-5 rounded-full transition-transform ${
                      form.color === c ? "scale-125 ring-2 ring-primary ring-offset-2" : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={closeModal} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-2 font-semibold">
                {isSubmitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                {formMode === "create" ? "Criar Cartão" : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: DETALHES DE FATURAS E PREVISÃO FUTURA */}
      <Dialog open={!!invoicesCard} onOpenChange={(open) => !open && setInvoicesCard(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <DialogTitle className="text-lg">Faturas: {invoicesCard?.name}</DialogTitle>
              </div>
              <Badge variant="outline" className="text-xs">
                Fecha dia {invoicesCard?.closing_day} • Vence dia {invoicesCard?.due_day}
              </Badge>
            </div>
            <DialogDescription>
              Acompanhe lançamentos da fatura atual, histórico e previsão de parcelas futuras.
            </DialogDescription>
          </DialogHeader>

          {/* Abas dentro do Modal de Faturas */}
          <div className="flex items-center gap-2 border-b border-slate-200 pt-1">
            <button
              onClick={() => setInvoiceTab("invoices")}
              className={`flex items-center gap-2 pb-2 px-3 text-xs font-bold border-b-2 transition-all ${
                invoiceTab === "invoices"
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              Faturas por Mês ({invoices.length})
            </button>

            <button
              onClick={() => setInvoiceTab("forecast")}
              className={`flex items-center gap-2 pb-2 px-3 text-xs font-bold border-b-2 transition-all ${
                invoiceTab === "forecast"
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Previsão Futura (Parcelas)
            </button>
          </div>

          {/* ABA 1: FATURAS POR MÊS */}
          {invoiceTab === "invoices" && (
            <div className="space-y-4 pt-2">
              {loadingInvoices ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                  Carregando faturas...
                </div>
              ) : invoices.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">Nenhuma fatura encontrada para este cartão.</p>
              ) : (
                <>
                  {/* Seletor de Faturas */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {invoices.map((inv, idx) => (
                      <button
                        key={inv.id}
                        onClick={() => setSelectedInvoiceIndex(idx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all border ${
                          selectedInvoiceIndex === idx
                            ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {formatMonthYear(inv.reference_month)}
                      </button>
                    ))}
                  </div>

                  {/* Card Destaque da Fatura Selecionada */}
                  {selectedInvoice && (
                    <Card className="bg-slate-50 border shadow-xs">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-slate-900">
                                Fatura de {formatMonthYear(selectedInvoice.reference_month)}
                              </h3>
                              <Badge
                                className={`text-[11px] font-bold ${
                                  selectedInvoice.status === "paid"
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                    : selectedInvoice.status === "closed"
                                    ? "bg-amber-100 text-amber-800 border-amber-200"
                                    : "bg-blue-100 text-blue-800 border-blue-200"
                                }`}
                              >
                                {selectedInvoice.status === "paid"
                                  ? "Fatura Paga"
                                  : selectedInvoice.status === "closed"
                                  ? "Fatura Fechada"
                                  : "Fatura Aberta"}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Compras de {formatDateBR(selectedInvoice.start_date)} até {formatDateBR(selectedInvoice.closing_date)}
                            </p>
                          </div>

                          <div className="text-left sm:text-right">
                            <span className="text-xs text-slate-400 font-semibold uppercase">Total da Fatura</span>
                            <p className="text-2xl font-black text-slate-900">
                              {formatCurrency(selectedInvoice.total_amount)}
                            </p>
                          </div>
                        </div>

                        {/* Informações de Vencimento e Ação de Pagar */}
                        <div className="flex items-center justify-between pt-1 text-xs">
                          <div className="text-slate-600">
                            <span>Vencimento: <strong>{formatDateBR(selectedInvoice.due_date)}</strong></span>
                            {selectedInvoice.status !== "paid" && (
                              <span className="ml-2 text-slate-400">
                                ({selectedInvoice.days_until_due < 0 ? `venceu há ${Math.abs(selectedInvoice.days_until_due)}d` : `em ${selectedInvoice.days_until_due}d`})
                              </span>
                            )}
                          </div>

                          {selectedInvoice.status !== "paid" && canEdit && (
                            <Button
                              size="sm"
                              onClick={() => payMutation.mutate({ workspaceId: selectedWorkspaceId, invoiceId: selectedInvoice.id })}
                              className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como Paga
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}

          {/* ABA 2: PREVISÃO FUTURA (PARCELAS) */}
          {invoiceTab === "forecast" && (
            <div className="space-y-4 pt-2">
              {loadingForecast ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                  Calculando projeções de parcelas...
                </div>
              ) : !forecastData || forecastData.forecast.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">Nenhuma compra parcelada futura encontrada.</p>
              ) : (
                <>
                  <div className="p-3 rounded-lg bg-indigo-50/60 border border-indigo-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-indigo-600" />
                      <span className="font-semibold text-indigo-900">Total Comprometido nos Próximos 6 Meses:</span>
                    </div>
                    <strong className="text-indigo-900 text-sm font-black">
                      {formatCurrency(forecastData.total_committed_future)}
                    </strong>
                  </div>

                  <div className="space-y-3">
                    {forecastData.forecast.map((m) => (
                      <div
                        key={m.reference_month}
                        className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-extrabold text-sm text-slate-900">{m.month_label}</span>
                            <span className="text-xs text-slate-400 block">
                              Fecha em {formatDateBR(m.closing_date)} • Vence em {formatDateBR(m.due_date)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-black text-rose-600">
                              {formatCurrency(m.predicted_total)}
                            </span>
                            <span className="text-[11px] text-slate-400 block">
                              {m.installments_count} parcela(s)
                            </span>
                          </div>
                        </div>

                        {/* Itens detalhados */}
                        {m.items.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 space-y-1">
                            {m.items.map((it, i) => (
                              <div key={i} className="flex items-center justify-between text-xs text-slate-600">
                                <span className="truncate max-w-[240px]">
                                  {it.description}{" "}
                                  {it.installments > 1 && (
                                    <span className="text-purple-700 bg-purple-50 px-1 py-0.2 rounded font-semibold text-[10px]">
                                      {it.installment_current}/{it.installments}x
                                    </span>
                                  )}
                                </span>
                                <span className="font-semibold text-slate-800">{formatCurrency(it.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
