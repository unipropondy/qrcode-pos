import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import "./LoginPage.css";

/* ══════════════════════════════════════════════════
   QRDisplayPage — Shows the single common QR code
   that customers scan to open the Login page.
   Place this on your counter/display screen.
══════════════════════════════════════════════════ */

const ForkIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
    stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
    <path d="M7 2v20" />
    <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
  </svg>
);

const ScanIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="5 3 3 3 3 5" />
    <polyline points="19 3 21 3 21 5" />
    <polyline points="5 21 3 21 3 19" />
    <polyline points="19 21 21 21 21 19" />
    <line x1="3" y1="12" x2="21" y2="12" />
  </svg>
);

export default function QRDisplayPage() {
  // Build the login URL dynamically from the current browser location
  const loginUrl = `${window.location.origin}/login`;
  const [copied, setCopied] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(loginUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = time.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="qr-display-root">

      {/* Floating particles */}
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="qr-particle"
          style={{
            left: `${5 + i * 12}%`,
            width: `${3 + i * 2}px`,
            height: `${3 + i * 2}px`,
            animationDuration: `${10 + i * 2}s`,
            animationDelay: `${i * 1.2}s`,
          }}
        />
      ))}

      <div className="qr-display-card">

        {/* Live clock */}
        <div style={{
          position: "absolute",
          top: "20px",
          right: "24px",
          textAlign: "right"
        }}>
          <div style={{ fontSize: "22px", fontWeight: "800", color: "#fff", lineHeight: 1.1 }}>
            {timeStr}
          </div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
            {dateStr}
          </div>
        </div>

        {/* Brand */}
        <div className="qr-display-brand">
          <div className="qr-display-logo">
            <ForkIcon />
          </div>
          <div className="qr-display-name">QR POS</div>
          <div className="qr-display-tagline">
            Scan to view our menu &amp; place your order
          </div>
        </div>

        <div className="qr-display-divider" />

        {/* Scan label */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "rgba(255,255,255,0.55)",
          fontSize: "12px",
          fontWeight: "600",
          letterSpacing: "1.5px",
          textTransform: "uppercase"
        }}>
          <ScanIcon />
          Scan with your phone camera
        </div>

        {/* QR Code */}
        <div className="qr-display-box" aria-label={`QR code for ${loginUrl}`}>
          <QRCodeSVG
            value={loginUrl}
            size={192}
            level="H"
            includeMargin={false}
            fgColor="#1a1a2e"
          />
        </div>

        {/* Instruction */}
        <div className="qr-display-instruction">
          <div className="qr-display-inst-main">Point your camera at the QR code</div>
          <div className="qr-display-inst-sub">
            You'll be taken to the ordering page where you can<br />
            log in or create a new account.
          </div>
        </div>

        {/* URL Badge */}
        <button
          onClick={handleCopy}
          className="qr-display-url-badge"
          style={{
            cursor: "pointer",
            border: copied
              ? "1px solid rgba(34,197,94,0.4)"
              : "1px solid rgba(249,115,22,0.3)",
            background: copied
              ? "rgba(34,197,94,0.12)"
              : "rgba(249,115,22,0.12)",
            color: copied ? "#86efac" : "#fb923c",
            transition: "all 0.3s ease",
          }}
          title="Click to copy URL"
        >
          {copied ? "✓ Copied!" : loginUrl}
        </button>

        {/* Footer note */}
        <div style={{
          fontSize: "11px",
          color: "rgba(255,255,255,0.25)",
          textAlign: "center",
          lineHeight: 1.5
        }}>
          Multiple customers can scan this QR simultaneously
        </div>

      </div>
    </div>
  );
}
