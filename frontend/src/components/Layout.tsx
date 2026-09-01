import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Workspace } from "@/types";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import {
  LayoutDashboard,
  FolderKanban,
  Tags,
  CreditCard,
  ArrowLeftRight,
  FileSpreadsheet,
  Repeat,
  Target,
  ShieldCheck,
  LogOut,
} from "lucide-react";

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isAdmin = user?.is_admin || (user as any)?.isAdmin;

  // Buscar workspace ativo para alimentar o sino de notificações
  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const res = await api.get("/workspaces");
      return res.data;
    },
    enabled: !!user,
  });

  const activeWorkspaceId = workspaces.length > 0 ? workspaces[0].id : "";

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2)
    : "US";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-white shadow-xs">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <span className="text-xl font-extrabold tracking-tight text-primary">Financeiro App</span>
            
            <nav className="hidden md:flex items-center gap-1">
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive ? "bg-slate-100 text-primary font-semibold" : "text-muted-foreground hover:bg-slate-50 hover:text-primary"
                  }`
                }
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </NavLink>

              <NavLink
                to="/workspaces"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive ? "bg-slate-100 text-primary font-semibold" : "text-muted-foreground hover:bg-slate-50 hover:text-primary"
                  }`
                }
              >
                <FolderKanban className="h-4 w-4" />
                Workspaces
              </NavLink>

              <NavLink
                to="/categories"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive ? "bg-slate-100 text-primary font-semibold" : "text-muted-foreground hover:bg-slate-50 hover:text-primary"
                  }`
                }
              >
                <Tags className="h-4 w-4" />
                Categorias
              </NavLink>

              <NavLink
                to="/credit-cards"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive ? "bg-slate-100 text-primary font-semibold" : "text-muted-foreground hover:bg-slate-50 hover:text-primary"
                  }`
                }
              >
                <CreditCard className="h-4 w-4" />
                Cartões
              </NavLink>

              <NavLink
                to="/budgets"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive ? "bg-slate-100 text-primary font-semibold" : "text-muted-foreground hover:bg-slate-50 hover:text-primary"
                  }`
                }
              >
                <Target className="h-4 w-4" />
                Orçamentos
              </NavLink>

              <NavLink
                to="/recurring"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive ? "bg-slate-100 text-primary font-semibold" : "text-muted-foreground hover:bg-slate-50 hover:text-primary"
                  }`
                }
              >
                <Repeat className="h-4 w-4" />
                Recorrências
              </NavLink>

              <NavLink
                to="/import"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive ? "bg-slate-100 text-primary font-semibold" : "text-muted-foreground hover:bg-slate-50 hover:text-primary"
                  }`
                }
              >
                <FileSpreadsheet className="h-4 w-4" />
                Importar Extrato
              </NavLink>

              <NavLink
                to="/transactions"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive ? "bg-slate-100 text-primary font-semibold" : "text-muted-foreground hover:bg-slate-50 hover:text-primary"
                  }`
                }
              >
                <ArrowLeftRight className="h-4 w-4" />
                Transações
              </NavLink>

              {isAdmin && (
                <NavLink
                  to="/admin/usuarios"
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive ? "bg-amber-100 text-amber-900 font-semibold" : "text-amber-700 hover:bg-amber-50 hover:text-amber-900"
                    }`
                  }
                >
                  <ShieldCheck className="h-4 w-4" />
                  Usuários (Admin)
                </NavLink>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Sino de Notificações Global */}
            {activeWorkspaceId && (
              <NotificationsPopover workspaceId={activeWorkspaceId} />
            )}

            <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
              <Avatar className="h-9 w-9 border">
                <AvatarFallback className="bg-slate-200 text-slate-700 font-semibold">{userInitials}</AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-sm font-semibold leading-none">{user?.name}</span>
                <span className="text-xs text-muted-foreground">{user?.email}</span>
              </div>
            </div>

            <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
              <LogOut className="h-5 w-5 text-slate-600 hover:text-red-600" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};
