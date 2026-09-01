import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound } from "lucide-react";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      navigate("/dashboard", { replace: true });
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("O nome é obrigatório.");
      return;
    }

    if (!email || !email.includes("@")) {
      setError("Por favor, informe um e-mail válido.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (!inviteCode.trim()) {
      setError("O código de convite é obrigatório.");
      return;
    }

    try {
      setIsSubmitting(true);
      await register(name.trim(), email.trim(), password, inviteCode.trim());
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      const msg = err.response?.data?.error || "Erro ao realizar cadastro";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md shadow-md border-slate-200">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">Criar uma Conta</CardTitle>
          <CardDescription>Preencha os dados abaixo e informe seu código de convite</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-600 border border-red-200 animate-in fade-in">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha (mínimo 6 caracteres)</Label>
              <Input
                id="password"
                type="password"
                placeholder="******"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inviteCode" className="flex items-center gap-1.5 font-medium">
                <KeyRound className="h-4 w-4 text-amber-600" />
                Código de Convite
              </Label>
              <Input
                id="inviteCode"
                type="text"
                placeholder="Ex: FINANCEIRO2026"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                disabled={isSubmitting}
                required
                className="border-amber-200 focus-visible:ring-amber-500 font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">
                O cadastro requer um código de convite fornecido pelo administrador.
              </p>
            </div>

            <Button type="submit" className="w-full font-semibold mt-2" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cadastrando...
                </>
              ) : (
                "Criar Conta"
              )}
            </Button>
          </CardContent>

          <CardFooter className="flex justify-center border-t p-4">
            <span className="text-sm text-muted-foreground">
              Já tem uma conta?{" "}
              <Link to="/login" className="font-semibold text-primary hover:underline">
                Faça login
              </Link>
            </span>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
