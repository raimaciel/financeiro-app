import React, { createContext, useContext, useState, useEffect } from "react";
import api from "@/lib/api";
import type { User } from "@/types";

interface AuthContextData {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, inviteCode: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadStorageData() {
      const storedToken = localStorage.getItem("token");
      const storedUser = localStorage.getItem("user");

      if (storedToken) {
        try {
          const meRes = await api.get("/me");
          setToken(storedToken);
          if (storedUser) {
            try {
              const parsedUser = JSON.parse(storedUser);
              // Sincroniza flags mais recentes do /me se disponíveis
              if (meRes.data) {
                parsedUser.is_admin = meRes.data.is_admin ?? parsedUser.is_admin;
                parsedUser.isAdmin = meRes.data.isAdmin ?? parsedUser.isAdmin;
                parsedUser.is_active = meRes.data.is_active ?? parsedUser.is_active;
                parsedUser.isActive = meRes.data.isActive ?? parsedUser.isActive;
              }
              setUser(parsedUser);
            } catch {
              setUser(null);
            }
          }
        } catch {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    }
    loadStorageData();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.post("/login", { email, password });
    const { token: t, user: u } = response.data;
    localStorage.setItem("token", t);
    localStorage.setItem("user", JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const register = async (name: string, email: string, password: string, inviteCode: string) => {
    const response = await api.post("/register", { name, email, password, inviteCode });
    const { token: t, user: u } = response.data;
    localStorage.setItem("token", t);
    localStorage.setItem("user", JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  return React.createElement(
    AuthContext.Provider,
    { value: { user, token, isLoading, login, register, logout } },
    children
  );
};

export function useAuth(): AuthContextData {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  return context;
}
