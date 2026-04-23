import { useState } from "react";
import { Link } from "react-router-dom";

const EMAIL_RE = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailErr("");
    setStatus("");
    setError("");

    if (!EMAIL_RE.test(email.toLowerCase())) {
      setEmailErr("Please enter a valid email.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Could not send reset email.");
      }

      setStatus(data?.message || "If an account exists for that email, a reset link has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1B202A] px-5 py-10 font-['DM_Sans',sans-serif]">
      <div className="w-full max-w-[520px] rounded-[32px] bg-[#f5f5f5] px-6 py-10 shadow-[0_12px_50px_rgba(0,0,0,0.35)] sm:px-[60px]">
        <Link to="/">
          <img src="/Logo.png" alt="LingoWatch" className="mb-6 h-[60px] w-[60px] object-contain" />
        </Link>

        <h1 className="mb-2 text-[24px] font-[600] text-[#0f0f0f]">Forgot your password?</h1>
        <p className="mb-6 text-[14px] leading-7 text-[#667085]">
          Enter your email and we will send you a secure reset link.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label className="mb-5 block">
            <span className="mb-2 block text-[12px] font-[600] text-[#555]">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailErr("");
              }}
              placeholder="name@example.com"
              className={`h-[46px] w-full rounded-[10px] border px-4 text-[15px] outline-none transition-all ${emailErr ? "border-[#e53e3e] bg-[#fff5f5]" : "border-[#e0e0e0] bg-white"}`}
            />
            {emailErr ? <div className="mt-1 text-[12px] text-[#e53e3e]">{emailErr}</div> : null}
          </label>

          {status ? <div className="mb-4 rounded-[14px] bg-[#ecfdf3] px-4 py-3 text-[13px] leading-6 text-[#0f5132]">{status}</div> : null}
          {error ? <div className="mb-4 rounded-[14px] bg-[#fef3f2] px-4 py-3 text-[13px] leading-6 text-[#b42318]">{error}</div> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mb-5 h-[48px] w-full rounded-[12px] bg-[#0f0f0f] text-[15px] font-[600] text-white transition-opacity disabled:cursor-default disabled:opacity-70"
          >
            {isSubmitting ? "Sending reset link..." : "Send reset link"}
          </button>
        </form>

        <div className="text-[13px] text-[#667085]">
          <span>Remembered your password? </span>
          <Link to="/login" className="font-[700] text-[#0f0f0f] no-underline">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
