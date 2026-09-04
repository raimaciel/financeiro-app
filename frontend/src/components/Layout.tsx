import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Briefcase,
  Plus,
  Loader2,
} from "lucide-react";

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isAdmin = user?.is_admin || (user as any)?.isAdmin;

  const {
    workspaces,
    selectedWorkspaceId,
    selectedWorkspace,
    setSelectedWorkspaceId,
    hasWorkspace,
    isLoading: loadingWorkspaces,
  } = useWorkspace();
  const activeWorkspaceId = selectedWorkspaceId;

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
            {/* Seletor Global de Workspace */}
            {loadingWorkspaces ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground bg-slate-50 border rounded-md">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">Carregando...</span>
              </div>
            ) : hasWorkspace ? (
              <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
                <SelectTrigger
                  id="global-workspace-select"
                  className="h-9 w-40 sm:w-48 bg-white border-slate-200 text-xs sm:text-sm font-medium"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{selectedWorkspace?.name || "Workspace"}</span>
                  </div>
                </SelectTrigger>
                <SelectContent align="end">
                  {workspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id} className="text-xs sm:text-sm">
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span>{ws.name}</span>
                        {ws.role && (
                          <span className="text-[10px] text-muted-foreground uppercase bg-slate-100 px-1.5 py-0.5 rounded">
                            {ws.role}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <NavLink
                to="/workspaces"
                className="text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-md border border-amber-200 transition-colors flex items-center gap-1.5"
                title="Nenhum workspace selecionado. Clique para criar um."
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Criar Workspace</span>
              </NavLink>
            )}

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
