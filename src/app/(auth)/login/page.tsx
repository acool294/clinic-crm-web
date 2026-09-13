"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertCircle, Loader2, Lock, Mail, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotNotice, setShowForgotNotice] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Please enter both your email address and password.");
      return;
    }

    setIsLoading(true);

    try {
      const { error: signInError } = await signIn(trimmedEmail, password);

      if (signInError) {
        setError(
          signInError.message || "Invalid credentials. Please verify your email and password."
        );
        setIsLoading(false);
      } else {
        router.push("/");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
      setError(message);
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-8 dark:from-slate-950 dark:to-slate-900">
      <Card className="w-full max-w-md border-slate-200/80 bg-white/95 shadow-xl shadow-blue-950/5 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
        <CardHeader className="space-y-3 pb-2 text-center">
          {/* Medical Cross Icon & Branding */}
          <div className="mx-auto flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-4 ring-blue-50 dark:ring-blue-950/50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10.5 3.75a1.5 1.5 0 0 1 3 0v5.25h5.25a1.5 1.5 0 0 1 0 3H13.5v5.25a1.5 1.5 0 0 1-3 0V12H5.25a1.5 1.5 0 0 1 0-3h5.25V3.75Z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <span className="mt-3 text-xs font-bold tracking-wider text-blue-600 uppercase dark:text-blue-400">
              MediFlow CRM
            </span>
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Welcome Back
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to your clinic dashboard
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {/* Error Message Display Area */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <div className="flex-1 leading-snug">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-xs font-semibold tracking-wide text-slate-700 uppercase dark:text-slate-300"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  placeholder="doctor@clinic.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={isLoading}
                  className="h-10 pl-9 text-sm"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-xs font-semibold tracking-wide text-slate-700 uppercase dark:text-slate-300"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotNotice((prev) => !prev)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={isLoading}
                  className="h-10 pl-9 pr-10 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot Password Information Notice */}
            {showForgotNotice && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-300">
                Please contact your clinic administrator or IT department to request a password reset for your staff account.
              </div>
            )}

            {/* Sign In Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className={cn(
                "h-10 w-full bg-blue-600 font-medium text-white hover:bg-blue-700 shadow-sm transition-colors cursor-pointer",
                "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </CardContent>

        {/* Footer */}
        <CardFooter className="justify-center border-t border-slate-100 bg-slate-50/60 py-4 text-center text-xs text-muted-foreground dark:border-slate-800 dark:bg-slate-900/40">
          <p>
            Powered by{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Clinic CRM Platform
            </span>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
