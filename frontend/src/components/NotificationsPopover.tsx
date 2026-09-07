import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { NotificationItem, NotificationsResponse } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  CreditCard,
  Repeat,
  FileSpreadsheet,
  CheckCheck,
  ExternalLink,
  Target,
  Sparkles,
  Wallet,
  ArrowLeftRight,
  Trash2,
} from "lucide-react";

interface NotificationsPopoverProps {
  workspaceId: string;
}

export function NotificationsPopover({ workspaceId }: NotificationsPopoverProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Armazenamento de IDs de notificações lidas localmente como fallback
  const storageKey = `financeiro_read_notifications_${workspaceId}`;
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Atualiza localStorage e backend ao marcar como lida
  const markAsRead = async (id: string) => {
    setReadIds((prev) => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch (err) {
        console.error("Erro ao salvar notificação lida localmente:", err);
      }
      return updated;
    });

    try {
      await api.patch(`/workspaces/${workspaceId}/notifications/${id}/read`);
      queryClient.invalidateQueries({ queryKey: ["notifications", workspaceId] });
    } catch {
      // Falha silenciosa no backend, mantendo local
    }
  };

  const markAllAsRead = async (items: NotificationItem[]) => {
    const allIds = items.map((n) => n.id);
    setReadIds(allIds);
    try {
      localStorage.setItem(storageKey, JSON.stringify(allIds));
    } catch (err) {
      console.error("Erro ao marcar todas como lidas:", err);
    }

    try {
      await api.patch(`/workspaces/${workspaceId}/notifications/read-all`);
      queryClient.invalidateQueries({ queryKey: ["notifications", workspaceId] });
    } catch {
      // Falha silenciosa no backend
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await api.delete(`/workspaces/${workspaceId}/notifications/${id}`);
      queryClient.invalidateQueries({ queryKey: ["notifications", workspaceId] });
    } catch {
      // Se falhar no backend, apenas marca localmente como lida para não incomodar
      markAsRead(id);
    }
  };

  // Buscar notificações com polling a cada 60 segundos
  const { data, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ["notifications", workspaceId],
    queryFn: async () => {
      const res = await api.get(`/workspaces/${workspaceId}/notifications`);
      return res.data;
    },
    enabled: !!workspaceId,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const notifications = data?.notifications || data?.items || [];
  const unreadCount =
    data?.unread_count !== undefined
      ? data.unread_count
      : notifications.filter((n) => !readIds.includes(n.id) && !n.is_read).length;

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleItemClick = (item: NotificationItem) => {
    markAsRead(item.id);
    setIsOpen(false);
    if (item.related_link) {
      navigate(item.related_link);
    }
  };

  const renderIcon = (item: NotificationItem) => {
    switch (item.type) {
      case "invoice_overdue":
      case "budget_exceeded":
        return <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />;
      case "invoice_due":
      case "invoice_due_soon":
        return <CreditCard className="h-4 w-4 text-amber-600 shrink-0" />;
      case "low_balance":
        return <Wallet className="h-4 w-4 text-amber-600 shrink-0" />;
      case "budget_warning":
        return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />;
      case "goal_achieved":
        return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />;
      case "goal_deadline_near":
        return <Target className="h-4 w-4 text-amber-600 shrink-0" />;
      case "transfer_completed":
        return <ArrowLeftRight className="h-4 w-4 text-blue-600 shrink-0" />;
      case "recurring_pending":
        return <Repeat className="h-4 w-4 text-blue-600 shrink-0" />;
      case "import_reminder":
        return <FileSpreadsheet className="h-4 w-4 text-teal-600 shrink-0" />;
      default:
        return <Info className="h-4 w-4 text-slate-600 shrink-0" />;
    }
  };

  return (
    <div className="relative inline-block text-left" ref={popoverRef}>
      {/* Botão de Sino */}
      <button
        id="btn-notifications-bell"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notificações"
        className="relative p-2 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-hidden"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            id="notifications-badge"
            className="absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-xs animate-in zoom-in"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Painel Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
          {/* Header do Painel */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-sm text-slate-900">Notificações</h3>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-[10px] font-bold bg-rose-100 text-rose-700">
                  {unreadCount} nova(s)
                </Badge>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead(notifications)}
                className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar lidas
              </button>
            )}
          </div>

          {/* Lista de Notificações */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Carregando alertas...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Sparkles className="h-8 w-8 text-emerald-500 mx-auto opacity-80" />
                <p className="font-semibold text-xs text-slate-700">Tudo em ordem!</p>
                <p className="text-[11px] text-slate-400">Nenhum alerta pendente no momento.</p>
              </div>
            ) : (
              notifications.map((item) => {
                const isUnread =
                  item.is_read !== undefined
                    ? !item.is_read && !readIds.includes(item.id)
                    : !readIds.includes(item.id);

                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`p-3.5 flex items-start gap-3 cursor-pointer transition-colors hover:bg-slate-50 relative group ${
                      isUnread ? "bg-slate-50/70" : "bg-white"
                    }`}
                  >
                    {/* Indicador de Não Lida */}
                    {isUnread && (
                      <span className="absolute left-1.5 top-5 h-2 w-2 rounded-full bg-primary" />
                    )}

                    <div className="mt-0.5 p-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs shrink-0">
                      {renderIcon(item)}
                    </div>

                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center justify-between gap-1">
                        <h4
                          className={`text-xs font-bold truncate ${
                            isUnread ? "text-slate-900" : "text-slate-700"
                          }`}
                        >
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(item.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 rounded transition-opacity"
                            title="Dispensar notificação"
                            aria-label="Dispensar notificação"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                          <ExternalLink className="h-3 w-3 text-slate-400 opacity-60 shrink-0" />
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        {item.message}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
