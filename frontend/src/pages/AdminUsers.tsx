import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { AdminUser, InviteCode } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ShieldAlert,
  ShieldCheck,
  Users,
  UserCheck,
  UserX,
  Search,
  Loader2,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  KeyRound,
  PlusCircle,
  Copy,
  Check,
  Trash2,
  Clock,
  CheckCheck,
  Timer,
  Pencil,
  Save,
} from "lucide-react";

export default function AdminUsers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "invites">("users");
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Estados do Modal de Novo Convite
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [hoursValid, setHoursValid] = useState<number>(24);
  const [maxUses, setMaxUses] = useState<number>(1);
  const [customCode, setCustomCode] = useState<string>("");
  const [copiedCodeId, setCopiedCodeId] = useState<number | null>(null);

  // Estado do Modal de Confirmação para Deletar Convite
  const [inviteToDelete, setInviteToDelete] = useState<InviteCode | null>(null);

  // Estados do Modal de Edição de Usuário
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [isConfirmEditOpen, setIsConfirmEditOpen] = useState(false);

  const isAdmin = user?.is_admin || (user as any)?.isAdmin;

  // 1. Buscar lista de todos os usuários
  const {
    data: users = [],
    isLoading: isLoadingUsers,
    isRefetching: isRefetchingUsers,
    refetch: refetchUsers,
  } = useQuery<AdminUser[]>({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const res = await api.get("/admin/users");
      return res.data;
    },
    enabled: !!isAdmin,
  });

  // 2. Buscar lista de códigos de convite
  const {
    data: inviteCodes = [],
    isLoading: isLoadingInvites,
    isRefetching: isRefetchingInvites,
    refetch: refetchInvites,
  } = useQuery<InviteCode[]>({
    queryKey: ["admin", "invite-codes"],
    queryFn: async () => {
      const res = await api.get("/admin/invite-codes");
      return res.data;
    },
    enabled: !!isAdmin,
  });

  // 3. Mutação para alternar status do usuário (bloquear / desbloquear)
  const toggleStatusMutation = useMutation({
    mutationFn: async (targetUserId: number | string) => {
      const res = await api.patch(`/admin/users/${targetUserId}/toggle-status`);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setFeedbackMessage({
        type: "success",
        text: data.message || "Status do usuário alterado com sucesso!",
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || "Erro ao alterar o status do usuário.";
      setFeedbackMessage({ type: "error", text: msg });
      setTimeout(() => setFeedbackMessage(null), 4000);
    },
  });

  // 3.1 Mutação para editar dados completos do usuário
  const updateUserMutation = useMutation({
    mutationFn: async (payload: { id: number | string; name: string; is_active: boolean; is_admin: boolean }) => {
      const res = await api.patch(`/admin/users/${payload.id}`, {
        name: payload.name,
        is_active: payload.is_active,
        is_admin: payload.is_admin,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setIsConfirmEditOpen(false);
      setEditingUser(null);
      setFeedbackMessage({
        type: "success",
        text: data.message || "Usuário atualizado com sucesso!",
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || "Erro ao atualizar usuário.";
      setFeedbackMessage({ type: "error", text: msg });
      setTimeout(() => setFeedbackMessage(null), 4000);
    },
  });

  // 4. Mutação para gerar novo código de convite
  const generateInviteMutation = useMutation({
    mutationFn: async (payload: { hoursValid: number; maxUses: number; code?: string }) => {
      const res = await api.post("/admin/invite-codes", payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "invite-codes"] });
      setIsGenerateModalOpen(false);
      setCustomCode("");
      setFeedbackMessage({
        type: "success",
        text: `Código ${data.inviteCode?.code || ""} gerado com sucesso!`,
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || "Erro ao gerar código de convite.";
      setFeedbackMessage({ type: "error", text: msg });
      setTimeout(() => setFeedbackMessage(null), 4000);
    },
  });

  // 5. Mutação para revogar código de convite
  const deleteInviteMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      const res = await api.delete(`/admin/invite-codes/${inviteId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "invite-codes"] });
      setInviteToDelete(null);
      setFeedbackMessage({
        type: "success",
        text: "Código de convite revogado com sucesso!",
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || "Erro ao revogar código de convite.";
      setFeedbackMessage({ type: "error", text: msg });
      setTimeout(() => setFeedbackMessage(null), 4000);
    },
  });

  const handleStartEdit = (u: AdminUser) => {
    setEditingUser(u);
    setEditName(u.name || "");
    setEditIsActive(Boolean(u.is_active ?? (u as any).isActive));
    setEditIsAdmin(Boolean(u.is_admin ?? (u as any).isAdmin));
  };

  const handleOpenEditConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (editName.trim().length < 2) {
      setFeedbackMessage({ type: "error", text: "O nome deve ter pelo menos 2 caracteres." });
      return;
    }
    setIsConfirmEditOpen(true);
  };

  const handleConfirmSaveEdit = () => {
    if (editingUser) {
      updateUserMutation.mutate({
        id: editingUser.id,
        name: editName.trim(),
        is_active: editIsActive,
        is_admin: editIsAdmin,
      });
    }
  };

  const handleCopyCode = (code: string, id: number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2500);
  };

  const handleGenerateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    generateInviteMutation.mutate({
      hoursValid,
      maxUses,
      code: customCode.trim() ? customCode.trim().toUpperCase() : undefined,
    });
  };

  const handleConfirmDeleteInvite = () => {
    if (inviteToDelete) {
      deleteInviteMutation.mutate(inviteToDelete.id);
    }
  };

  // Helper para verificar se está prestes a expirar (<= 2 horas)
  const getExpirationWarning = (expiresAt: string, status?: string) => {
    if (status !== "ativo") return null;
    const now = Date.now();
    const exp = new Date(expiresAt).getTime();
    const diffMs = exp - now;
    if (diffMs <= 0) return null;

    const diffHours = diffMs / (1000 * 60 * 60);
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffHours <= 2) {
      if (diffMinutes < 60) {
        return `⚠️ Expira em ${diffMinutes}min`;
      }
      const hours = Math.floor(diffHours);
      const mins = diffMinutes % 60;
      return mins > 0 ? `⚠️ Expira em ${hours}h ${mins}min` : `⚠️ Expira em ${hours}h`;
    }
    return null;
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="rounded-full bg-red-100 p-4 text-red-600 mb-4">
          <ShieldAlert className="h-12 w-12" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Acesso Restrito</h1>
        <p className="text-slate-600 max-w-md mb-6">
          Esta área é restrita a administradores do sistema. Se você acredita que deveria ter acesso, entre em contato com o suporte.
        </p>
        <Link to="/dashboard">
          <Button variant="default" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar ao Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  // Filtragem de usuários
  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Cálculos de KPIs de Usuários
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.is_active).length;
  const blockedUsers = users.filter((u) => !u.is_active).length;
  const adminCount = users.filter((u) => u.is_admin).length;

  // Cálculos de KPIs de Códigos de Convite
  const totalInvites = inviteCodes.length;
  const activeInvites = inviteCodes.filter((i) => i.status === "ativo").length;
  const expiringSoonInvites = inviteCodes.filter(
    (i) => i.status === "ativo" && getExpirationWarning(i.expires_at, i.status) !== null
  ).length;
  const exhaustedInvites = inviteCodes.filter((i) => i.status === "esgotado").length;
  const expiredInvites = inviteCodes.filter((i) => i.status === "expirado").length;

  const isPromotingToAdmin = Boolean(editIsAdmin && !editingUser?.is_admin);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            Painel do Administrador
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Controle de acesso, edição de usuários, moderação de contas e emissão de convites.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "invites" && (
            <Button
              onClick={() => setIsGenerateModalOpen(true)}
              className="gap-2 font-semibold shadow-xs"
            >
              <PlusCircle className="h-4 w-4" />
              Gerar Novo Convite
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeTab === "users") refetchUsers();
              else refetchInvites();
            }}
            disabled={isLoadingUsers || isRefetchingUsers || isLoadingInvites || isRefetchingInvites}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetchingUsers || isRefetchingInvites ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Alerta de Feedback */}
      {feedbackMessage && (
        <div
          className={`rounded-md p-4 flex items-center gap-3 border animate-in fade-in ${
            feedbackMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          {feedbackMessage.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          )}
          <span className="text-sm font-medium">{feedbackMessage.text}</span>
        </div>
      )}

      {/* Navegação por Abas Customizadas */}
      <div className="flex bg-slate-100 p-1 rounded-lg w-fit border border-slate-200">
        <button
          role="tab"
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
            activeTab === "users"
              ? "bg-white text-primary shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Users className="h-4 w-4" />
          Usuários Cadastrados ({totalUsers})
        </button>
        <button
          role="tab"
          onClick={() => setActiveTab("invites")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
            activeTab === "invites"
              ? "bg-white text-primary shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <KeyRound className="h-4 w-4" />
          Códigos de Convite ({activeInvites} ativos)
        </button>
      </div>

      {/* ======================= MODAL DE EDIÇÃO DE USUÁRIO ======================= */}
      <Dialog open={!!editingUser && !isConfirmEditOpen} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Editar Usuário
            </DialogTitle>
            <DialogDescription>
              Altere o nome, status da conta ou privilégios de administrador.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleOpenEditConfirm} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome Completo</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nome do usuário"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email">E-mail (Identificador)</Label>
              <Input
                id="edit-email"
                value={editingUser?.email || ""}
                disabled
                className="bg-slate-100 text-slate-600 cursor-not-allowed"
              />
              <p className="text-[11px] text-muted-foreground">
                O e-mail não pode ser alterado por motivos de segurança e integridade de acesso.
              </p>
            </div>

            <div className="pt-2 border-t space-y-3">
              <div className="flex items-start gap-3 p-2.5 rounded-lg border bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  id="edit-active"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                />
                <div className="grid gap-0.5">
                  <Label htmlFor="edit-active" className="text-sm font-semibold cursor-pointer">
                    Conta Ativa
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Quando desmarcado, o usuário é bloqueado e não conseguirá autenticar no sistema.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-lg border bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  id="edit-admin"
                  checked={editIsAdmin}
                  onChange={(e) => setEditIsAdmin(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                />
                <div className="grid gap-0.5">
                  <Label htmlFor="edit-admin" className="text-sm font-semibold cursor-pointer flex items-center gap-1.5">
                    Privilégios de Administrador
                    <ShieldCheck className="h-4 w-4 text-amber-600" />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Concede acesso total ao painel admin, lista de usuários e gestão de convites.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingUser(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="gap-2 font-semibold">
                Salvar Alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================= MODAL DE CONFIRMAÇÃO DE EDIÇÃO ======================= */}
      <Dialog open={isConfirmEditOpen} onOpenChange={setIsConfirmEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Save className="h-5 w-5 text-primary" />
              Confirmar Alterações
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-700">
              Deseja realmente salvar as alterações no usuário <strong>{editName}</strong> ({editingUser?.email})?
            </DialogDescription>
          </DialogHeader>

          {/* Aviso especial em destaque se estiver promovendo a Administrador */}
          {isPromotingToAdmin && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-start gap-2.5 animate-in fade-in">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-amber-800">Atenção: Promoção a Administrador</p>
                <p>
                  Você está concedendo privilégios de <strong>Administrador</strong> a este usuário. Ele terá permissão para gerenciar contas, bloquear usuários e emitir convites.
                </p>
              </div>
            </div>
          )}

          <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-md border">
            <div><strong>Novo Nome:</strong> {editName}</div>
            <div><strong>Status da Conta:</strong> {editIsActive ? "Ativa (Liberada)" : "Bloqueada"}</div>
            <div><strong>Perfil:</strong> {editIsAdmin ? "Administrador" : "Usuário Comum"}</div>
          </div>

          <DialogFooter className="pt-3 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmEditOpen(false)}
              disabled={updateUserMutation.isPending}
            >
              Voltar / Ajustar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSaveEdit}
              disabled={updateUserMutation.isPending}
              className="gap-2 font-semibold"
            >
              {updateUserMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                </>
              ) : (
                "Sim, confirmar e salvar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Geração de Convite */}
      <Dialog open={isGenerateModalOpen} onOpenChange={setIsGenerateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Gerar Código de Convite
            </DialogTitle>
            <DialogDescription>
              Defina o tempo de expiração e o limite de utilizações para este convite.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleGenerateSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="validity">Validade do Convite</Label>
              <select
                id="validity"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={hoursValid}
                onChange={(e) => setHoursValid(Number(e.target.value))}
              >
                <option value={24}>24 Horas (1 dia)</option>
                <option value={48}>48 Horas (2 dias)</option>
                <option value={168}>7 Dias (1 semana)</option>
                <option value={720}>30 Dias (1 mês)</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxUses">Limite de Usos</Label>
              <select
                id="maxUses"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value))}
              >
                <option value={1}>1 Uso (Individual / Descartável)</option>
                <option value={5}>5 Usos</option>
                <option value={10}>10 Usos</option>
                <option value={50}>50 Usos</option>
                <option value={999999}>Ilimitado</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customCode">Código Personalizado (Opcional)</Label>
              <Input
                id="customCode"
                placeholder="Deixe em branco para gerar aleatório"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                className="uppercase font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Ex: VIP2026, BETA-TESTER. Se vazio, gera ex: INV-8K2FA9.
              </p>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsGenerateModalOpen(false)}
                disabled={generateInviteMutation.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={generateInviteMutation.isPending} className="gap-2">
                {generateInviteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Gerando...
                  </>
                ) : (
                  "Criar Convite"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação para Revogar/Deletar Convite */}
      <Dialog open={!!inviteToDelete} onOpenChange={(open) => !open && setInviteToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Revogar Código de Convite
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-700">
              Deseja realmente revogar o convite <strong className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">{inviteToDelete?.code}</strong>?
              <br />
              <span className="text-xs text-red-600 font-medium mt-1 block">Esta ação não pode ser desfeita. Novos cadastros com este código serão bloqueados imediatamente.</span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setInviteToDelete(null)}
              disabled={deleteInviteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDeleteInvite}
              disabled={deleteInviteMutation.isPending}
              className="gap-1.5 font-semibold"
            >
              {deleteInviteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Revogando...
                </>
              ) : (
                "Sim, revogar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================= ABA 1: USUÁRIOS ======================= */}
      {activeTab === "users" && (
        <div className="space-y-6 animate-in fade-in">
          {/* Cards de Resumo (KPIs de Usuários) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-xs border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Total de Usuários</CardTitle>
                <Users className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{totalUsers}</div>
                <p className="text-xs text-muted-foreground mt-1">Cadastrados na plataforma</p>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-emerald-100 bg-emerald-50/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-emerald-800">Usuários Ativos</CardTitle>
                <UserCheck className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-700">{activeUsers}</div>
                <p className="text-xs text-emerald-600 mt-1">Acesso liberado ao app</p>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-red-100 bg-red-50/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-red-800">Usuários Bloqueados</CardTitle>
                <UserX className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-700">{blockedUsers}</div>
                <p className="text-xs text-red-600 mt-1">Impedidos de fazer login</p>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-amber-100 bg-amber-50/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-amber-800">Administradores</CardTitle>
                <ShieldCheck className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-700">{adminCount}</div>
                <p className="text-xs text-amber-600 mt-1">Acesso ao painel admin</p>
              </CardContent>
            </Card>
          </div>

          {/* Lista de Usuários */}
          <Card className="shadow-xs border-slate-200">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-900">Usuários Cadastrados</CardTitle>
                  <CardDescription>Visualize e gerencie os dados e permissões de cada conta de usuário</CardDescription>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou e-mail..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isLoadingUsers ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center p-12 text-slate-500">
                  <Users className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                  <p className="font-semibold text-slate-700">Nenhum usuário encontrado</p>
                  <p className="text-sm">Tente ajustar o termo da sua busca.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5">Usuário</th>
                        <th className="px-6 py-3.5">Perfil</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5">Cadastro</th>
                        <th className="px-6 py-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((u) => {
                        const isSelf = String(u.id) === String(user?.id);
                        const userInitials = u.name
                          ? u.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .substring(0, 2)
                          : "US";

                        return (
                          <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                            {/* Usuário */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9 border border-slate-200">
                                  <AvatarFallback className="bg-slate-100 text-slate-700 font-semibold text-xs">
                                    {userInitials}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-semibold text-slate-900 flex items-center gap-2">
                                    {u.name}
                                    {isSelf && (
                                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-slate-100">
                                        Você
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-500">{u.email}</div>
                                </div>
                              </div>
                            </td>

                            {/* Perfil */}
                            <td className="px-6 py-4">
                              {u.is_admin ? (
                                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 font-semibold text-xs">
                                  <ShieldCheck className="h-3 w-3 mr-1" />
                                  Administrador
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-slate-600 text-xs">
                                  Usuário
                                </Badge>
                              )}
                            </td>

                            {/* Status */}
                            <td className="px-6 py-4">
                              {u.is_active ? (
                                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 font-semibold text-xs">
                                  <UserCheck className="h-3 w-3 mr-1" />
                                  Ativo
                                </Badge>
                              ) : (
                                <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200 font-semibold text-xs">
                                  <UserX className="h-3 w-3 mr-1" />
                                  Bloqueado
                                </Badge>
                              )}
                            </td>

                            {/* Data de Cadastro */}
                            <td className="px-6 py-4 text-xs text-slate-500">
                              {u.created_at
                                ? new Date(u.created_at).toLocaleDateString("pt-BR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                  })
                                : "—"}
                            </td>

                            {/* Ações (Editar + Bloquear) */}
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStartEdit(u)}
                                  className="gap-1 text-xs font-semibold text-slate-700 hover:text-primary"
                                  title="Editar usuário"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Editar
                                </Button>

                                {isSelf ? (
                                  <span className="text-xs text-muted-foreground italic px-2">Conta atual</span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant={u.is_active ? "destructive" : "default"}
                                    disabled={toggleStatusMutation.isPending}
                                    onClick={() => toggleStatusMutation.mutate(u.id)}
                                    className="gap-1.5 text-xs font-semibold"
                                  >
                                    {toggleStatusMutation.isPending ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : u.is_active ? (
                                      <>
                                        <UserX className="h-3.5 w-3.5" />
                                        Bloquear
                                      </>
                                    ) : (
                                      <>
                                        <UserCheck className="h-3.5 w-3.5" />
                                        Desbloquear
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ======================= ABA 2: CÓDIGOS DE CONVITE ======================= */}
      {activeTab === "invites" && (
        <div className="space-y-6 animate-in fade-in">
          {/* Cards de Resumo (KPIs de Convites) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="shadow-xs border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Total</CardTitle>
                <KeyRound className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{totalInvites}</div>
                <p className="text-xs text-muted-foreground mt-1">Gerados no total</p>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-emerald-100 bg-emerald-50/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-emerald-800">Ativos</CardTitle>
                <Clock className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-700">{activeInvites}</div>
                <p className="text-xs text-emerald-600 mt-1">Válidos para uso</p>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-amber-200 bg-amber-50/40">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-amber-800">Expirando em Breve</CardTitle>
                <Timer className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-700">{expiringSoonInvites}</div>
                <p className="text-xs text-amber-600 mt-1">Vencem em até 2 horas</p>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-blue-100 bg-blue-50/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-800">Esgotados</CardTitle>
                <CheckCheck className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-700">{exhaustedInvites}</div>
                <p className="text-xs text-blue-600 mt-1">Limite atingido</p>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-slate-100 bg-slate-50/60">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Expirados</CardTitle>
                <Clock className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-700">{expiredInvites}</div>
                <p className="text-xs text-slate-500 mt-1">Prazo esgotado</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabela de Códigos de Convite */}
          <Card className="shadow-xs border-slate-200">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold text-slate-900">Histórico de Códigos de Convite</CardTitle>
              <CardDescription>
                Cada código possui prazo de expiração e limite de utilização antes de ser invalidado.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0">
              {isLoadingInvites ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : inviteCodes.length === 0 ? (
                <div className="text-center p-12 text-slate-500">
                  <KeyRound className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                  <p className="font-semibold text-slate-700">Nenhum código de convite gerado</p>
                  <p className="text-sm mb-4">Clique no botão acima para gerar seu primeiro convite temporário.</p>
                  <Button onClick={() => setIsGenerateModalOpen(true)} className="gap-2">
                    <PlusCircle className="h-4 w-4" /> Gerar Convite
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5">Código</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5">Expiração</th>
                        <th className="px-6 py-3.5">Utilizações</th>
                        <th className="px-6 py-3.5">Utilizado Por</th>
                        <th className="px-6 py-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inviteCodes.map((inv) => {
                        const isCopied = copiedCodeId === inv.id;
                        const expirationFormatted = new Date(inv.expires_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        });

                        const warningText = getExpirationWarning(inv.expires_at, inv.status);

                        return (
                          <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                            {/* Código com Botão Copiar */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-md text-sm tracking-wide">
                                  {inv.code}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-slate-500 hover:text-primary"
                                  onClick={() => handleCopyCode(inv.code, inv.id)}
                                  title="Copiar código de convite"
                                >
                                  {isCopied ? (
                                    <Check className="h-4 w-4 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </td>

                            {/* Status e Alerta de Expiração */}
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1 items-start">
                                {inv.status === "ativo" ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 font-semibold text-xs">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Ativo
                                  </Badge>
                                ) : inv.status === "esgotado" ? (
                                  <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200 font-semibold text-xs">
                                    <CheckCheck className="h-3 w-3 mr-1" />
                                    Esgotado
                                  </Badge>
                                ) : (
                                  <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 border-slate-200 font-semibold text-xs">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Expirado
                                  </Badge>
                                )}

                                {warningText && (
                                  <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-300 font-semibold text-[11px] px-1.5 py-0">
                                    {warningText}
                                  </Badge>
                                )}
                              </div>
                            </td>

                            {/* Data de Expiração */}
                            <td className="px-6 py-4 text-xs text-slate-600 font-medium">
                              {expirationFormatted}
                            </td>

                            {/* Utilizações */}
                            <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                              {inv.uses_count} de {inv.max_uses >= 999999 ? "∞" : inv.max_uses} usos
                            </td>

                            {/* Utilizado por */}
                            <td className="px-6 py-4 text-xs text-slate-500">
                              {inv.used_by_user_name ? (
                                <div>
                                  <span className="font-medium text-slate-800">{inv.used_by_user_name}</span>
                                  <div className="text-[11px] text-slate-400">{inv.used_by_user_email}</div>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">—</span>
                              )}
                            </td>

                            {/* Ações */}
                            <td className="px-6 py-4 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setInviteToDelete(inv)}
                                title="Revogar / Excluir convite"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
