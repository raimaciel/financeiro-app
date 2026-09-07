import React, { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import type {
  BankAccount,
  ReconciliationMatchItem,
  ReconciliationMatchResponse,
  ReconciliationAction,
  ReconciliationConfirmResponse,
} from "@/types";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  Loader2,
  Landmark,
  GitMerge,
  Plus,
  EyeOff,
  Link2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  CheckCheck,
  CircleDot,
  Info,
} from "lucide-react";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.slice(0, 10).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return isoDate;
}

const fetchAccounts = async (workspaceId: string): Promise<BankAccount[]> => {
  const res = await api.get(`/workspaces/${workspaceId}/accounts`);
  return res.data;
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode; bg: string; border: string }
> = {
  matched_exact: {
    label: "Match Exato",
    color: "text-emerald-700",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  matched_approximate: {
    label: "Match Aproximado",
    color: "text-amber-700",
    icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  unmatched: {
    label: "Sem Match",
    color: "text-red-700",
    icon: <XCircle className="h-4 w-4 text-red-500" />,
    bg: "bg-red-50",
    border: "border-red-200",
  },
};

const ACTION_LABELS: Record<ReconciliationAction, string> = {
  ignore: "Ignorar",
  link_existing: "Vincular ao existente",
  create_new: "Criar novo lancamento",
};

const ACTION_ICONS: Record<ReconciliationAction, React.ReactNode> = {
  ignore: <EyeOff className="h-3.5 w-3.5" />,
  link_existing: <Link2 className="h-3.5 w-3.5" />,
  create_new: <Plus className="h-3.5 w-3.5" />,
};

interface ItemRowProps {
  item: ReconciliationMatchItem;
  onActionChange: (id: string, action: ReconciliationAction) => void;
}

const ReconciliationItemRow: React.FC<ItemRowProps> = ({ item, onActionChange }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[item.status];
  const selectedAction = item.selected_action ?? item.suggested_action;

  const availableActions: ReconciliationAction[] =
    item.status === "matched_exact"
      ? ["ignore", "link_existing"]
      : item.status === "matched_approximate"
      ? ["link_existing", "ignore", "create_new"]
      : ["create_new", "ignore"];

  return (
    <div
      className={`rounded-lg border ${cfg.border} ${cfg.bg} transition-all`}
      data-testid={`reconciliation-item-${item.id}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Expandir detalhes"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <span className="shrink-0">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-800 truncate">{item.description}</span>
            {item.difference_days !== undefined && item.difference_days > 0 && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                Delta {item.difference_days}d
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
            <span>{formatDateBR(item.date)}</span>
            <span
              className={`font-semibold ${
                item.type === "income" ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {item.type === "expense" ? "-" : "+"}
              {formatCurrency(item.amount)}
            </span>
            {item.category_name && (
              <Badge variant="secondary" className="text-xs">
                {item.category_name}
              </Badge>
            )}
          </div>
        </div>
        <Select
          value={selectedAction}
          onValueChange={(v) => onActionChange(item.id, v as ReconciliationAction)}
        >
          <SelectTrigger
            className="w-[185px] h-8 text-xs shrink-0"
            data-testid={`action-select-${item.id}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableActions.map((action) => (
              <SelectItem key={action} value={action} className="text-xs">
                <span className="flex items-center gap-1.5">
                  {ACTION_ICONS[action]}
                  {ACTION_LABELS[action]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {expanded && item.matched_transaction && (
        <div className="px-4 pb-3 border-t border-slate-200 mt-1 pt-2">
          <p className="text-xs text-slate-500 mb-1.5 font-medium flex items-center gap-1">
            <Info className="h-3.5 w-3.5" /> Lancamento vinculado no sistema:
          </p>
          <div className="rounded-md bg-white border border-slate-200 px-3 py-2 flex items-center gap-3">
            <CircleDot className="h-4 w-4 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0 text-xs text-slate-600">
              <p className="font-medium truncate">{item.matched_transaction.description}</p>
              <p className="text-slate-400">
                {formatDateBR(item.matched_transaction.date)} -{" "}
                <span
                  className={
                    item.matched_transaction.type === "income"
                      ? "text-emerald-600"
                      : "text-red-600"
                  }
                >
                  {item.matched_transaction.type === "expense" ? "-" : "+"}
                  {formatCurrency(item.matched_transaction.amount)}
                </span>
              </p>
            </div>
            {item.matched_transaction.reconciled ? (
              <Badge className="bg-emerald-100 text-emerald-700 text-xs">Conciliado</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Pendente</Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function Reconciliation() {
  const navigate = useNavigate();
  const { selectedWorkspaceId } = useWorkspace();
  const workspaceId = selectedWorkspaceId ?? "";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [matchResults, setMatchResults] = useState<ReconciliationMatchResponse | null>(null);
  const [itemActions, setItemActions] = useState<Record<string, ReconciliationAction>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<
    "all" | "matched_exact" | "matched_approximate" | "unmatched"
  >("all");

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ["accounts", workspaceId],
    queryFn: () => fetchAccounts(workspaceId),
    enabled: !!workspaceId,
  });

  const matchMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<ReconciliationMatchResponse>(
        `/workspaces/${workspaceId}/accounts/${selectedAccountId}/reconciliation/match`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      return res.data;
    },
    onSuccess: (data) => {
      setMatchResults(data);
      setErrorMsg(null);
      setSuccessMsg(null);
      const defaults: Record<string, ReconciliationAction> = {};
      data.items.forEach((item) => {
        defaults[item.id] = item.suggested_action;
      });
      setItemActions(defaults);
      setActiveFilter("all");
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.error ?? "Erro ao processar extrato.");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!matchResults) return;
      const decisions = matchResults.items.map((item) => ({
        action: itemActions[item.id] ?? item.suggested_action,
        transaction_id: item.matched_transaction?.id ?? null,
        statement_item: {
          id: item.id,
          date: item.date,
          amount: item.amount,
          description: item.description,
          type: item.type,
          category_id: item.category_id ?? null,
          external_id: item.external_id ?? null,
        },
      }));
      const res = await api.post<ReconciliationConfirmResponse>(
        `/workspaces/${workspaceId}/accounts/${selectedAccountId}/reconciliation/confirm`,
        { decisions }
      );
      return res.data;
    },
    onSuccess: (data) => {
      setSuccessMsg(data?.message ?? "Conciliacao concluida com sucesso!");
      setMatchResults(null);
      setItemActions({});
      setErrorMsg(null);
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.error ?? "Erro ao confirmar conciliacao.");
    },
  });

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (!selectedAccountId) {
        setErrorMsg("Selecione uma conta bancaria antes de enviar o extrato.");
        return;
      }
      const file = e.dataTransfer.files[0];
      if (file) matchMutation.mutate(file);
    },
    [selectedAccountId, matchMutation]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedAccountId) {
      setErrorMsg("Selecione uma conta bancaria antes de enviar o extrato.");
      return;
    }
    const file = e.target.files?.[0];
    if (file) matchMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleActionChange = (id: string, action: ReconciliationAction) => {
    setItemActions((prev) => ({ ...prev, [id]: action }));
  };

  const filteredItems =
    matchResults?.items.filter((item) =>
      activeFilter === "all" ? true : item.status === activeFilter
    ) ?? [];

  const totalItems = matchResults?.total_items ?? 0;
  const exactCount = matchResults?.matched_exact_count ?? 0;
  const approxCount = matchResults?.matched_approximate_count ?? 0;
  const unmatchedCount = matchResults?.unmatched_count ?? 0;
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/accounts")}
          className="shrink-0"
          id="btn-back-reconciliation"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <GitMerge className="h-6 w-6 text-primary" />
            Conciliacao Bancaria
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Importe um extrato OFX ou CSV e reconcilie automaticamente com seus lancamentos.
          </p>
        </div>
      </div>

      {successMsg && (
        <div
          className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800"
          data-testid="success-message"
        >
          <CheckCheck className="h-5 w-5 shrink-0 text-emerald-600" />
          <span className="text-sm font-medium">{successMsg}</span>
          <button
            type="button"
            className="ml-auto text-emerald-400 hover:text-emerald-600"
            onClick={() => setSuccessMsg(null)}
          >
            x
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          className="flex items-center gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800"
          data-testid="error-message"
        >
          <XCircle className="h-5 w-5 shrink-0 text-red-600" />
          <span className="text-sm">{errorMsg}</span>
          <button
            type="button"
            className="ml-auto text-red-400 hover:text-red-600"
            onClick={() => setErrorMsg(null)}
          >
            x
          </button>
        </div>
      )}

      {!matchResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Landmark className="h-4 w-4 text-primary" />
              1. Selecione a conta bancaria
            </CardTitle>
            <CardDescription>
              Escolha a conta que deseja conciliar com o extrato importado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Conta Bancaria</label>
              {loadingAccounts ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando contas...
                </div>
              ) : (
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger
                    className="w-full max-w-sm"
                    id="select-reconciliation-account"
                    data-testid="select-reconciliation-account"
                  >
                    <SelectValue placeholder="Selecione uma conta..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0 inline-block"
                            style={{ backgroundColor: acc.color }}
                          />
                          {acc.name} - {acc.bank_name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                2. Importe o extrato (OFX ou CSV)
              </label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => selectedAccountId && fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-all select-none ${
                  !selectedAccountId
                    ? "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
                    : dragOver
                    ? "border-primary bg-primary/5 scale-[1.01] cursor-pointer"
                    : "border-slate-300 hover:border-primary hover:bg-slate-50 cursor-pointer"
                }`}
                data-testid="upload-zone"
              >
                {matchMutation.isPending ? (
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                ) : (
                  <Upload className={`h-10 w-10 transition-colors ${dragOver ? "text-primary" : "text-slate-300"}`} />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-600">
                    {matchMutation.isPending
                      ? "Processando extrato..."
                      : dragOver
                      ? "Solte o arquivo aqui"
                      : "Arraste e solte ou clique para selecionar"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Formatos suportados: .OFX, .CSV</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ofx,.csv,text/plain"
                  className="hidden"
                  onChange={handleFileChange}
                  data-testid="file-input"
                  id="reconciliation-file-input"
                />
              </div>
              {!selectedAccountId && (
                <p className="text-xs text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Selecione uma conta acima antes de importar o extrato.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {matchResults && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: "all", label: "Total", value: totalItems, extra: "itens", klass: "border-slate-200", active: "border-primary bg-primary/5 ring-1 ring-primary" },
              { key: "matched_exact", label: "Match Exato", value: exactCount, extra: "alta confianca", klass: "border-slate-200 hover:border-emerald-200", active: "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400" },
              { key: "matched_approximate", label: "Aprox.", value: approxCount, extra: "media confianca", klass: "border-slate-200 hover:border-amber-200", active: "border-amber-400 bg-amber-50 ring-1 ring-amber-400" },
              { key: "unmatched", label: "Sem Match", value: unmatchedCount, extra: "sem match", klass: "border-slate-200 hover:border-red-200", active: "border-red-400 bg-red-50 ring-1 ring-red-400" },
            ].map(({ key, label, value, extra, klass, active }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveFilter(key as any)}
                className={`rounded-lg border p-3 text-left transition-all bg-white ${activeFilter === key ? active : klass}`}
                id={`filter-${key}`}
                data-testid={`filter-${key}`}
              >
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-xl font-bold text-slate-800">{value}</p>
                <p className="text-xs text-slate-400">{extra}</p>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: selectedAccount?.color ?? "#64748b" }}
              />
              <span className="font-medium">{matchResults.account.name}</span>
              {matchResults.account.bank_name && (
                <span className="text-slate-400">- {matchResults.account.bank_name}</span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setMatchResults(null); setItemActions({}); setErrorMsg(null); }}
              id="btn-new-import"
              data-testid="btn-new-import"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Novo Extrato
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Itens do Extrato
                {activeFilter !== "all" && (
                  <Badge variant="secondary" className="text-xs">
                    {STATUS_CONFIG[activeFilter]?.label}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>Revise cada item e defina a acao antes de confirmar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {filteredItems.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  Nenhum item nesta categoria.
                </div>
              ) : (
                filteredItems.map((item) => (
                  <ReconciliationItemRow
                    key={item.id}
                    item={{ ...item, selected_action: itemActions[item.id] ?? item.suggested_action }}
                    onActionChange={handleActionChange}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
              className="gap-2"
              id="btn-confirm-reconciliation"
              data-testid="btn-confirm-reconciliation"
              size="lg"
            >
              {confirmMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              {confirmMutation.isPending ? "Processando..." : "Confirmar Conciliacao"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
