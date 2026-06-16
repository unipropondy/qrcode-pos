import React, { useState } from "react";
import "./LoginPage.css";
import { BASE_URL } from "./Configs/api";

const API = `${BASE_URL}/api`;

/* ══════════════════════════════════════════════════
   SVG Icons
══════════════════════════════════════════════════ */
const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const PhoneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);



const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const CheckIcon = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
    stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ForkIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none"
    stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
    <path d="M7 2v20" />
    <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
  </svg>
);

/* ══════════════════════════════════════════════════
   LoginPage Component
══════════════════════════════════════════════════ */
export default function LoginPage({ onLoginSuccess }) {
  const [tab, setTab] = useState("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successUser, setSuccessUser] = useState("");

  // Sign In fields
  const [siUsername, setSiUsername] = useState("");
  const [siPassword, setSiPassword] = useState("");

  // Sign Up fields

  const [suUsername, setSuUsername] = useState("");
  const [suPhone, setSuPhone] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");

  const switchTab = (t) => {
    setTab(t);
    setError("");
    setShowPass(false);
    setShowConfirmPass(false);
  };

  /* ── Sign In ─────────────────────────────────── */
  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    if (!siUsername.trim() || !siPassword.trim()) {
      setError("Please enter your username and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: siUsername.trim(), password: siPassword }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("qr_pos_user", JSON.stringify(data.user));
        setSuccessUser(data.user.FullName || data.user.UserName);
        setShowSuccess(true);
        setTimeout(() => {
          if (onLoginSuccess) onLoginSuccess(data.user);
        }, 1400);
      } else {
        setError(data.message || "Login failed. Please try again.");
      }
    } catch (err) {
      setError("Cannot connect to server. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Sign Up ─────────────────────────────────── */
  const handleSignUp = async (e) => {
    e.preventDefault();
    setError("");
    if (!suUsername.trim() || !suPassword.trim()) {
      setError("Username and password are required.");
      return;
    }
    if (!suPhone.trim()) {
      setError("Phone number is required.");
      return;
    }
    if (suPassword !== suConfirm) {
      setError("Passwords do not match.");
      return;
    }
    if (suPassword.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: suUsername.trim(),
          username: suUsername.trim(),
          password: suPassword,
          phone: suPhone.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("qr_pos_user", JSON.stringify(data.user));
        setSuccessUser(data.user.FullName || data.user.UserName || suUsername.trim());
        setShowSuccess(true);
        setTimeout(() => {
          if (onLoginSuccess) onLoginSuccess(data.user);
        }, 1400);
      } else {
        setError(data.message || "Registration failed. Please try again.");
      }
    } catch (err) {
      setError("Cannot connect to server. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root">
      {/* Floating particles */}
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="qr-particle"
          style={{
            left: `${10 + i * 15}%`,
            width: `${4 + i * 2}px`,
            height: `${4 + i * 2}px`,
            animationDuration: `${8 + i * 3}s`,
            animationDelay: `${i * 1.5}s`,
          }}
        />
      ))}

      <div className="login-card">

        {/* Brand */}
        <div className="login-brand">
          <div className="login-logo-ring">
            <ForkIcon />
          </div>
          <div className="login-brand-name">QR POS</div>
          <div className="login-brand-sub">Restaurant Ordering System</div>
        </div>

        {/* Tab Switcher */}
        <div className="login-tabs" role="tablist">
          <button
            id="tab-signin"
            className={`login-tab ${tab === "signin" ? "active" : ""}`}
            onClick={() => switchTab("signin")}
            role="tab"
            aria-selected={tab === "signin"}
          >
            Sign In
          </button>
          <button
            id="tab-signup"
            className={`login-tab ${tab === "signup" ? "active" : ""}`}
            onClick={() => switchTab("signup")}
            role="tab"
            aria-selected={tab === "signup"}
          >
            Sign Up
          </button>
        </div>

        {/* ── SIGN IN FORM ────────────────────────── */}
        {tab === "signin" && (
          <form className="login-form" onSubmit={handleSignIn} key="signin">
            <div className="login-field">
              <label className="login-label" htmlFor="si-username">Username</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><UserIcon /></span>
                <input
                  id="si-username"
                  className="login-input"
                  type="text"
                  placeholder="Enter your username"
                  value={siUsername}
                  onChange={(e) => setSiUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="si-password">Password</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><LockIcon /></span>
                <input
                  id="si-password"
                  className="login-input"
                  type={showPass ? "text" : "password"}
                  placeholder="Enter your password"
                  value={siPassword}
                  onChange={(e) => setSiPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {error && (
              <div className="login-error" role="alert">
                <AlertIcon /> {error}
              </div>
            )}

            <button
              id="btn-signin"
              type="submit"
              className={`login-submit-btn ${loading ? "loading" : ""}`}
              disabled={loading}
            >
              {loading && <span className="login-spinner" />}
              Sign In
            </button>

            <div className="login-switch">
              Don't have an account?{" "}
              <button type="button" onClick={() => switchTab("signup")}>
                Sign Up
              </button>
            </div>
          </form>
        )}

        {/* ── SIGN UP FORM ────────────────────────── */}
        {tab === "signup" && (
          <form className="login-form" onSubmit={handleSignUp} key="signup">
            {/* Full Name field removed as requested */}

            <div className="login-field">
              <label className="login-label" htmlFor="su-username">Username *</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><UserIcon /></span>
                <input
                  id="su-username"
                  className="login-input"
                  type="text"
                  placeholder="Choose a username"
                  value={suUsername}
                  onChange={(e) => setSuUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="su-phone">Phone Number *</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><PhoneIcon /></span>
                <input
                  id="su-phone"
                  className="login-input"
                  type="tel"
                  placeholder="Enter phone number"
                  value={suPhone}
                  onChange={(e) => setSuPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="su-password">Password *</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><LockIcon /></span>
                <input
                  id="su-password"
                  className="login-input"
                  type={showPass ? "text" : "password"}
                  placeholder="Create a password"
                  value={suPassword}
                  onChange={(e) => setSuPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="su-confirm">Confirm Password *</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><LockIcon /></span>
                <input
                  id="su-confirm"
                  className="login-input"
                  type={showConfirmPass ? "text" : "password"}
                  placeholder="Re-enter your password"
                  value={suConfirm}
                  onChange={(e) => setSuConfirm(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowConfirmPass((v) => !v)}
                  aria-label={showConfirmPass ? "Hide password" : "Show password"}
                >
                  {showConfirmPass ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {error && (
              <div className="login-error" role="alert">
                <AlertIcon /> {error}
              </div>
            )}

            <button
              id="btn-signup"
              type="submit"
              className={`login-submit-btn ${loading ? "loading" : ""}`}
              disabled={loading}
            >
              {loading && <span className="login-spinner" />}
              Create Account
            </button>

            <div className="login-switch">
              Already have an account?{" "}
              <button type="button" onClick={() => switchTab("signin")}>
                Sign In
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="login-loading-overlay" role="status" aria-live="polite">
          <div className="login-large-spinner" />
          <div className="login-loading-text">Processing...</div>
        </div>
      )}

      {/* Success Overlay */}
      {showSuccess && (
        <div className="login-success-overlay" role="status" aria-live="polite">
          <div className="login-success-box">
            <div className="login-success-icon">
              <CheckIcon />
            </div>
            <div className="login-success-title">Welcome, {successUser}!</div>
            <div className="login-success-sub">Redirecting to menu…</div>
          </div>
        </div>
      )}
    </div>
  );
}
