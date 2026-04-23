import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

type VerifyState = "loading" | "success" | "error";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => String(searchParams.get("token") || "").trim(), [searchParams]);
  const [state, setState] = useState<VerifyState>(token ? "loading" : "error");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This verification link is missing a token.");
      return;
    }

    let cancelled = false;

    async function verify() {
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (!response.ok) {
          setState("error");
          setMessage(data?.error || "This verification link is invalid or has expired.");
          return;
        }

        setState("success");
        setMessage("Your email has been verified. You can continue into LingoWatch now.");
      } catch {
        if (cancelled) return;
        setState("error");
        setMessage("We could not verify your email right now. Please try again.");
      }
    }

    void verify();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const accent = state === "success" ? "#0EA5A4" : "#6D5EF5";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1B202A] px-5 py-10 font-['DM_Sans',sans-serif]">
      <div className="w-full max-w-[560px] rounded-[32px] bg-white p-8 shadow-[0_20px_70px_rgba(0,0,0,0.3)] sm:p-10">
        <div
          className="mb-8 rounded-[28px] px-6 py-10 text-center"
          style={{ background: `linear-gradient(135deg, ${accent} 0%, #8f83ff 100%)` }}
        >
          <div className="mx-auto flex h-[74px] w-[74px] items-center justify-center rounded-full border border-white/30 bg-white/15 text-[32px] font-black text-white">
            {state === "success" ? "✓" : "@"}
          </div>
          <h1 className="mt-5 text-[32px] font-[800] leading-[1.15] text-white">
            {state === "loading" ? "Verifying your email..." : state === "success" ? "Email verified" : "Verification issue"}
          </h1>
        </div>

        <p className="mb-8 text-[15px] leading-8 text-[#667085]">{message || "Please wait while we confirm your email address."}</p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to={state === "success" ? "/login" : "/signup"}
            className="inline-flex h-[48px] flex-1 items-center justify-center rounded-full bg-[#6D5EF5] px-6 text-[15px] font-[800] text-white no-underline"
          >
            {state === "success" ? "Go to login" : "Back to sign up"}
          </Link>
          <Link
            to="/"
            className="inline-flex h-[48px] flex-1 items-center justify-center rounded-full border border-[#D0D5DD] px-6 text-[15px] font-[700] text-[#101828] no-underline"
          >
            Open homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
