"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface LogMessage {
  time: string;
  type: "info" | "success" | "warn" | "error";
  text: string;
}

export default function AutomationPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [statusText, setStatusText] = useState<string>("Sistem sedang bersiap...");
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  
  // Registration and OTP States
  const [akunOss, setAkunOss] = useState<string>("belum");
  const [otp, setOtp] = useState<string>("");
  const [isSubmittingOtp, setIsSubmittingOtp] = useState<boolean>(false);
  const [isPromptingOtp, setIsPromptingOtp] = useState<boolean>(false);

  // Password Setup States
  const [isPromptingPassword, setIsPromptingPassword] = useState<boolean>(false);
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [passwordError, setPasswordError] = useState<string>("");
  const [isSubmittingPassword, setIsSubmittingPassword] = useState<boolean>(false);

  // Error and Update States
  const [failedStep, setFailedStep] = useState<number | null>(null);
  const [errorType, setErrorType] = useState<"nik" | "email" | "ktp_mismatch" | "generic" | null>(null);
  const [errorText, setErrorText] = useState<string>("");
  const [updatedValue, setUpdatedValue] = useState<string>("");
  const [updatedNik, setUpdatedNik] = useState<string>("");
  const [updatedNama, setUpdatedNama] = useState<string>("");
  const [isUpdatingDraft, setIsUpdatingDraft] = useState<boolean>(false);
  
  // Accordion open state for technical logs
  const [isLogsOpen, setIsLogsOpen] = useState<boolean>(false);
  
  const streamRef = useRef<EventSource | null>(null);
  const failedStepRef = useRef<number | null>(null);
  
  // Countdown Timer State
  const [timeLeft, setTimeLeft] = useState<number>(120);

  // Format timeLeft into MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    let timerId: any;
    if (isPromptingOtp || isPromptingPassword) {
      setTimeLeft(120);
      timerId = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerId);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimeLeft(120);
    }

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [isPromptingOtp, isPromptingPassword]);

  // Add Log helper
  const addLog = (text: string, type: "info" | "success" | "warn" | "error" = "info") => {
    const time = new Date().toLocaleTimeString("id-ID", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    setLogs((prev) => [...prev, { time, type, text }]);
  };

  // Scroll to bottom of terminal
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Handle step timers and real-time SSE stream
  const connectStream = () => {
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";
    const isBelum = typeof window !== "undefined" ? sessionStorage.getItem("akun_oss") || "belum" : "belum";
    setAkunOss(isBelum);

    try {
      addLog("Menghubungkan ke backend local NIB Assistant...", "info");
      const eventSource = new EventSource(`${API_URL}/automation/stream/${draftId}?akunOss=${isBelum}`);
      streamRef.current = eventSource;

      eventSource.onopen = () => {
        addLog("Koneksi SSE Backend Lokal BERHASIL. Mendengarkan stream otomatisasi...", "success");
      };

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && typeof payload.step === "number") {
            if (payload.status === "error") {
              failedStepRef.current = payload.step;
              setFailedStep(payload.step);
              setErrorText(payload.text);
              if (payload.text.toLowerCase().includes("ktp")) {
                setErrorType("ktp_mismatch");
              } else if (payload.text.toLowerCase().includes("nik")) {
                setErrorType("nik");
              } else if (payload.text.toLowerCase().includes("email")) {
                setErrorType("email");
              } else {
                setErrorType("generic");
              }
              setStatusText("Otomatisasi Gagal");
            } else {
              if (failedStepRef.current === null) {
                setCurrentStep(payload.step);
              }
            }
            addLog(payload.text, payload.status || "info");
            
            // Map text to UI Status indicator
            if (payload.step === 1) setStatusText("Membuka Portal OSS");
            if (payload.step === 2 && payload.status !== "error") {
              if (payload.text.includes("OTP") && payload.status === "warn") {
                setStatusText("Menunggu Anda memasukkan OTP...");
                setIsPromptingOtp(true);
              } else if (payload.text.includes("Silakan masukkan kata sandi")) {
                setStatusText("Menunggu Anda mengatur Kata Sandi...");
                setIsPromptingPassword(true);
                setIsPromptingOtp(false);
              } else if (payload.text.includes("OTP diterima") || payload.text.includes("Verifikasi berhasil") || payload.text.includes("SUKSES")) {
                setIsPromptingOtp(false);
              } else if (payload.text.includes("Mengisi") || payload.text.includes("Mengklik")) {
                setStatusText("Mengisi form registrasi...");
              } else {
                setStatusText("Membuka Portal OSS");
              }
            }
            if (payload.step === 3 && failedStepRef.current === null) {
              setStatusText("Mengisi detail akun & mendaftar...");
              setIsPromptingOtp(false);
              setIsPromptingPassword(false);
            }
            if (payload.step === 4 && failedStepRef.current === null) {
              if (payload.text.includes("Silakan masukkan kata sandi")) {
                setStatusText("Menunggu Anda memasukkan Kata Sandi...");
                setIsPromptingPassword(true);
                setIsPromptingOtp(false);
              } else if (payload.text.includes("CAPTCHA")) {
                setStatusText("Menunggu Anda menyelesaikan CAPTCHA...");
                setIsPromptingOtp(true);
                setIsPromptingPassword(false);
              } else if (payload.text.includes("Login berhasil")) {
                setIsPromptingOtp(false);
                setIsPromptingPassword(false);
                setStatusText("Login Berhasil!");
              } else {
                setStatusText("Autentikasi & Login OSS...");
              }
            }
            if (payload.step === 5 && failedStepRef.current === null) {
              setStatusText("Mengelola Lokasi Usaha...");
              setIsPromptingOtp(false);
              setIsPromptingPassword(false);
            }
            if (payload.step === 6 && failedStepRef.current === null) {
              setStatusText("Proses Otomatisasi Selesai!");
              setIsPromptingOtp(false);
              setIsPromptingPassword(false);
              // Redirect to result page after 2 seconds
              setTimeout(() => {
                router.push("/result?state=success");
              }, 2000);
            }
          }
        } catch (err) {
          console.error("Error parsing EventSource data", err);
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
        }
        if (failedStepRef.current === null) {
          addLog("Koneksi backend tidak terdeteksi.", "warn");
        }
      };
    } catch (e) {
      addLog("Koneksi backend tidak terdeteksi.", "warn");
    }
  };

  useEffect(() => {
    connectStream();
    return () => {
      if (streamRef.current) {
        streamRef.current.close();
      }
    };
  }, []);

  const handleRestartAutomation = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (e) {
      if (errorType !== "ktp_mismatch" && errorType !== "generic" && !updatedValue.trim()) return;
      if (errorType === "ktp_mismatch" && !updatedNik.trim() && !updatedNama.trim()) return;
    }

    setIsUpdatingDraft(true);
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";

    try {
      if (e && errorType !== "generic") {
        let bodyData = {};
        let successMsg = "";
        if (errorType === "nik") {
          bodyData = { nik: updatedValue.trim() };
          successMsg = `[Sistem] Berhasil memperbarui NIK menjadi: ${updatedValue}`;
        } else if (errorType === "email") {
          bodyData = { email: updatedValue.trim() };
          successMsg = `[Sistem] Berhasil memperbarui Email menjadi: ${updatedValue}`;
        } else if (errorType === "ktp_mismatch") {
          bodyData = {
            ...(updatedNik.trim() ? { nik: updatedNik.trim() } : {}),
            ...(updatedNama.trim() ? { namaPemilik: updatedNama.trim().toUpperCase() } : {}),
          };
          successMsg = `[Sistem] Berhasil memperbarui data KTP (${updatedNik.trim() ? "NIK" : ""} ${updatedNama.trim() ? "Nama" : ""})`;
        }

        const response = await fetch(`${API_URL}/drafts/${draftId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyData)
        });
        
        if (!response.ok) throw new Error("Gagal memperbarui draf");

        addLog(successMsg, "success");
      } else {
        addLog("[Sistem] Memulai ulang otomatisasi...", "info");
      }
      
      failedStepRef.current = null;
      setFailedStep(null);
      setErrorType(null);
      setErrorText("");
      setUpdatedValue("");
      setUpdatedNik("");
      setUpdatedNama("");
      setCurrentStep(1);
      setStatusText("Memulai ulang otomatisasi...");
      setLogs([]);
      setIsPromptingOtp(false);
      setIsPromptingPassword(false);

      if (streamRef.current) {
        streamRef.current.close();
      }
      
      connectStream();
    } catch (err: any) {
      console.error(err);
      addLog(`Gagal memperbarui data: ${err.message || String(err)}`, "error");
    } finally {
      setIsUpdatingDraft(false);
    }
  };

  const handleUserLoggedIn = () => {
    if (currentStep !== 2 && currentStep !== 4) return;

    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";
    fetch(`${API_URL}/automation/confirm/${draftId}`, { method: "POST" })
      .then(() => console.log("Login confirmed to backend"))
      .catch((err) => console.log("Offline or connection error: using simulated progression", err));

    addLog("Persetujuan diterima: User melaporkan login/CAPTCHA selesai.", "success");
    addLog("Melakukan sinkronisasi session state browser...", "info");
    setIsPromptingOtp(false);
    setIsPromptingPassword(false);
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) return;

    setIsSubmittingOtp(true);
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";

    fetch(`${API_URL}/automation/otp/${draftId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp })
    })
      .then(() => {
        addLog(`Kode OTP (${otp}) terkirim ke backend.`, "success");
      })
      .catch((err) => console.log("Offline or connection error", err))
      .finally(() => {
        setIsSubmittingOtp(false);
        setIsPromptingOtp(false);
        setOtp("");
      });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) return;

    if (newPassword !== confirmPassword && isBelumAkun()) {
      setPasswordError("Kata sandi dan konfirmasi kata sandi tidak cocok.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("Kata sandi harus minimal 8 karakter.");
      return;
    }

    setPasswordError("");
    setIsSubmittingPassword(true);
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";

    fetch(`${API_URL}/automation/password/${draftId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword })
    })
      .then(() => {
        addLog("Kata sandi berhasil dikirim ke backend.", "success");
      })
      .catch((err) => console.log("Offline or connection error", err))
      .finally(() => {
        setIsSubmittingPassword(false);
        setIsPromptingPassword(false);
        setNewPassword("");
        setConfirmPassword("");
      });
  };

  const handleManualRedirect = () => {
    router.push("/result?state=failed");
  };

  const isBelumAkun = () => akunOss === "belum";

  const stepLabels = isBelumAkun() ? [
    { label: "Inisialisasi Portal", icon: "cloud_sync", step: 1 },
    { label: "Validasi NIK & OTP", icon: "sms", step: 2 },
    { label: "Detail Profil & Registrasi", icon: "app_registration", step: 3 },
    { label: "Login & Otentikasi", icon: "login", step: 4 },
    { label: "Kelola Lokasi Usaha", icon: "location_on", step: 5 }
  ] : [
    { label: "Inisialisasi Portal", icon: "cloud_sync", step: 1 },
    { label: "Login & Otentikasi", icon: "login", step: 4 },
    { label: "Kelola Lokasi Usaha", icon: "location_on", step: 5 }
  ];

  const renderTechnicalLogs = () => (
    <div className="border border-border-light rounded-lg overflow-hidden bg-white">
      <button
        onClick={() => setIsLogsOpen(!isLogsOpen)}
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container transition-all"
      >
        <span>[ Developer Mode ] Log Teknis Bot</span>
        <span className="material-symbols-outlined text-lg transition-transform duration-200" style={{ transform: isLogsOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
          expand_more
        </span>
      </button>
      
      {isLogsOpen && (
        <div className="bg-[#1E1E1E] text-[#D4D4D4] font-mono text-[11px] p-4 h-48 overflow-y-auto border-t border-[#333] scrollbar-thin">
          {logs.length === 0 ? (
            <div className="text-outline italic">Mendengarkan output terminal...</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="flex gap-2 mb-1">
                <span className="text-[#569CD6]">[{log.time}]</span>
                <span className={
                  log.type === "success" 
                    ? "text-[#4EC9B0]" 
                    : log.type === "warn" 
                      ? "text-[#DCDCAA]" 
                      : log.type === "error" 
                        ? "text-[#F48771]" 
                        : ""
                }>
                  {log.text}
                </span>
              </div>
            ))
          )}
          <div ref={consoleEndRef} />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-grow flex flex-col bg-background min-h-screen font-sans">
      
      {/* ── Top Flat AppBar ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 md:px-8 h-16 w-full bg-white border-b border-border-light">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/review")} className="p-2 hover:bg-surface-container transition-all rounded text-on-surface-variant flex items-center justify-center" aria-label="Kembali">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <div className="flex flex-col">
            <span className="text-sm font-extrabold text-primary-container leading-none uppercase">NIB Assistant</span>
            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mt-0.5">Automator Monitor</span>
          </div>
        </div>
        <button onClick={handleManualRedirect} className="text-[10px] font-bold uppercase tracking-wider text-error border border-error/30 hover:bg-error/5 px-3 py-1.5 rounded transition-all">
          Hentikan Bot
        </button>
      </header>

      {/* ── Main Container ── */}
      <main className="flex-grow flex justify-center w-full px-4 py-8 pb-32 md:pb-12">
        <div className="w-full max-w-[640px] md:max-w-6xl flex flex-col gap-6">
          
          {/* ── FULL SCREEN STATE SHIFT OVERLAY: RECOVERABLE VERIFICATION ERROR ── */}
          {failedStep !== null && errorType !== "generic" && (
            <div className="bento-card border border-error/30 bg-error/5 p-8 space-y-6 animate-fadeIn max-w-[640px] mx-auto w-full">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded bg-error/10 text-error flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-2xl">warning</span>
                </div>
                <h2 className="text-base font-extrabold uppercase tracking-wider text-error">Verifikasi Data Gagal</h2>
                <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                  {errorText || "Data NIK tidak terdaftar atau tidak cocok dengan sistem Dukcapil di portal OSS."}
                </p>
              </div>

              <form onSubmit={handleRestartAutomation} className="space-y-4 max-w-xs mx-auto">
                {errorType === "ktp_mismatch" ? (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase">Nama Lengkap (Sesuai KTP)</label>
                      <input 
                        type="text" 
                        placeholder="Nama Pemilik Baru" 
                        value={updatedNama} 
                        onChange={(e) => setUpdatedNama(e.target.value)} 
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none"
                        required 
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase">NIK Baru (16-Digit)</label>
                      <input 
                        type="text" 
                        maxLength={16} 
                        placeholder="NIK Baru" 
                        value={updatedNik} 
                        onChange={(e) => setUpdatedNik(e.target.value.replace(/\D/g, ""))} 
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs font-mono tracking-wider focus:border-primary-container focus:outline-none"
                        required 
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase">
                      {errorType === "nik" ? "Nomor NIK Baru" : "Alamat Email Baru"}
                    </label>
                    <input 
                      type={errorType === "nik" ? "text" : "email"} 
                      maxLength={errorType === "nik" ? 16 : 100} 
                      placeholder={errorType === "nik" ? "NIK Baru" : "Email Baru"} 
                      value={updatedValue} 
                      onChange={(e) => setUpdatedValue(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs font-semibold focus:border-primary-container focus:outline-none" 
                      required 
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isUpdatingDraft || (errorType !== "ktp_mismatch" && !updatedValue.trim()) || (errorType === "ktp_mismatch" && !updatedNik.trim() && !updatedNama.trim())}
                  className="w-full bg-primary-container hover:bg-primary text-white font-bold py-3 px-6 rounded text-xs uppercase tracking-wider min-h-[44px] flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">{isUpdatingDraft ? "sync" : "refresh"}</span>
                  {isUpdatingDraft ? "Memperbarui..." : "Perbarui & Mulai Ulang"}
                </button>

                <button
                  type="button"
                  onClick={handleManualRedirect}
                  className="w-full border border-border-light text-on-surface-variant font-bold py-2 px-4 rounded text-[10px] uppercase tracking-wider hover:bg-surface-container"
                >
                  Lanjutkan Secara Manual
                </button>
              </form>
            </div>
          )}

          {/* ── STANDALONE STATE: UNRECOVERABLE / GENERIC SYSTEM FAILURE ── */}
          {failedStep !== null && errorType === "generic" && (
            <div className="bento-card border border-error/30 bg-error/5 p-8 space-y-6 animate-fadeIn text-center max-w-[640px] mx-auto w-full">
              <div className="w-12 h-12 rounded bg-error/10 text-error flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-2xl">error_outline</span>
              </div>
              <h2 className="text-base font-extrabold uppercase tracking-wider text-error">Otomatisasi Terhenti</h2>
              <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                {errorText || "Terjadi kesalahan internal. Struktur halaman portal OSS BKPM mengalami perubahan."}
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-xs mx-auto pt-2">
                <button
                  onClick={() => handleRestartAutomation()}
                  className="flex-1 bg-primary-container hover:bg-primary text-white font-bold py-2.5 px-4 rounded text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">refresh</span> Coba Lagi
                </button>
                <button
                  onClick={handleManualRedirect}
                  className="flex-1 border border-border-light text-on-surface font-bold py-2.5 px-4 rounded text-xs uppercase tracking-wider hover:bg-surface-container"
                >
                  Isi Manual
                </button>
              </div>
            </div>
          )}

          {/* ── STANDARD MONITORING VIEW (Timeline + Mock Browser) ── */}
          {failedStep === null && (
            <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6 items-start animate-fadeIn w-full">
              
              {/* Left Column: Sidebar (Sticky on desktop) */}
              <div className="md:sticky md:top-24 space-y-6">
                {/* Status Header */}
                <div className="bento-card flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-primary-container/10 text-primary-container flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-xl animate-spin">sync</span>
                    </div>
                    <div>
                      <h3 className="text-xs font-extrabold text-on-surface uppercase tracking-wide">
                        {statusText}
                      </h3>
                      <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider mt-0.5">
                        Bot sedang bekerja di portal OSS
                      </p>
                    </div>
                  </div>
                  <div className="w-20 bg-surface-container rounded-full h-1.5 overflow-hidden shrink-0">
                    <div 
                      className="bg-primary-container h-1.5 rounded-full transition-all duration-1000 ease-in-out" 
                      style={{ width: `${(currentStep / 5) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Steps timeline list */}
                <div className="bento-card space-y-4">
                  <h3 className="text-xs font-extrabold uppercase tracking-wide text-on-surface-variant border-b border-border-light pb-2 mb-2">
                    Langkah Proses Pengisian
                  </h3>

                  <div className={`space-y-4 relative transition-all duration-350 ${
                    isPromptingOtp || isPromptingPassword 
                      ? "" 
                      : "before:absolute before:inset-y-0 before:left-4 before:-translate-x-px before:w-0.5 before:bg-border-light"
                  }`}>
                    {stepLabels.map(({ label, icon, step }) => {
                      const isCompleted = currentStep > step || (step === 5 && currentStep === 5);
                      const isCurrent = currentStep === step;
                      const isActionRequired = isCurrent && (isPromptingOtp || isPromptingPassword);
                      const isPromptActive = isPromptingOtp || isPromptingPassword;
                      const shouldHide = isPromptActive && !isCurrent;

                      return (
                        <div 
                          key={step} 
                          className={`relative flex items-start gap-4 transition-all duration-350 ease-in-out origin-top ${
                            shouldHide 
                              ? "max-h-0 opacity-0 overflow-hidden pointer-events-none -mt-4 py-0" 
                              : "max-h-24 opacity-100"
                          } ${
                            isActionRequired 
                              ? "bg-amber-50/70 border border-amber-200/50 p-3 rounded-md shadow-sm -mx-3" 
                              : ""
                          }`}
                        >
                          {/* Dot node */}
                          <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 z-10 border transition-all duration-350 ${
                            isActionRequired
                              ? "bg-amber-500 text-white border-amber-500 relative"
                              : isCompleted 
                                ? "bg-success text-white border-success" 
                                : isCurrent 
                                  ? "bg-primary-container text-white border-primary-container animate-pulse" 
                                  : "bg-[#ECEEF0] text-on-surface-variant border-border-light"
                          }`}>
                            {isActionRequired && (
                              <span className="absolute inset-0 rounded-full bg-amber-500/30 pulse-ring" />
                            )}
                            {isCompleted ? (
                              <span className="material-symbols-outlined text-sm font-bold">check</span>
                            ) : (
                              <span className="material-symbols-outlined text-sm">{isActionRequired ? "priority_high" : icon}</span>
                            )}
                          </div>

                          {/* Text labels */}
                          <div className="pt-1.5 flex-1">
                            <h4 className={`text-xs font-bold uppercase tracking-wide transition-colors duration-350 ${
                              isActionRequired 
                                ? "text-amber-700 font-extrabold" 
                                : isCompleted 
                                  ? "text-on-surface" 
                                  : isCurrent 
                                    ? "text-primary-container font-extrabold" 
                                    : "text-outline"
                            }`}>
                              {label}
                            </h4>
                            {isCurrent && (
                              <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 transition-colors duration-350 ${
                                isActionRequired ? "text-amber-600 animate-pulse" : "text-on-surface-variant"
                              }`}>
                                {isActionRequired 
                                  ? (isPromptingOtp ? "⚠️ Tindakan Diperlukan: Masukkan OTP" : "⚠️ Tindakan Diperlukan: Atur Kata Sandi")
                                  : "Sedang diproses..."
                                }
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Browser & Logs */}
              <div className="space-y-6">
                {/* Mock browser session */}
                <div className="bg-white border border-border-light rounded-xl overflow-hidden">
                  <div className="bg-[#ECEEF0] border-b border-border-light px-3 py-2 flex items-center gap-3">
                    <div className="flex gap-1 shrink-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-error" />
                      <div className="w-2.5 h-2.5 rounded-full bg-warning" />
                      <div className="w-2.5 h-2.5 rounded-full bg-success" />
                    </div>
                    <div className="flex-1 bg-white border border-border-light rounded px-2.5 py-1 text-[10px] font-bold text-on-surface-variant flex items-center gap-1.5 truncate">
                      <span className="material-symbols-outlined text-xs text-success">lock</span>
                      <span>
                        {isPromptingOtp 
                          ? (currentStep === 4 ? "https://oss.go.id/login/captcha" : "https://oss.go.id/register/otp")
                          : isPromptingPassword 
                            ? (isBelumAkun() ? "https://oss.go.id/register/setup-password" : "https://oss.go.id/login/auth")
                            : "https://oss.go.id/register"
                        }
                      </span>
                    </div>
                  </div>
                  
                  {isPromptingOtp ? (
                    <div className="p-8 bg-white space-y-6 animate-fadeIn">
                      <div className="text-center space-y-2">
                        <div className="w-12 h-12 rounded bg-primary-container/10 text-primary-container flex items-center justify-center mx-auto">
                          <span className="material-symbols-outlined text-2xl animate-bounce">sms</span>
                        </div>
                        <h3 className="text-sm font-extrabold uppercase tracking-wider text-on-surface">Masukkan Kode OTP</h3>
                        <p className="text-[11px] text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                          Masukkan kode OTP yang dikirimkan ke WhatsApp/SMS nomor HP Anda untuk memvalidasi pendaftaran di portal OSS.
                        </p>
                      </div>

                      <form onSubmit={handleOtpSubmit} className="space-y-4 max-w-xs mx-auto">
                        <div className="flex flex-col gap-1.5 text-left">
                          <div className="flex justify-between items-center text-[9px] font-extrabold uppercase tracking-wider text-on-surface-variant">
                            <span>Kode Verifikasi</span>
                            <span className={`flex items-center gap-1 font-mono font-bold ${timeLeft < 25 ? "text-error animate-pulse" : "text-primary-container"}`}>
                              <span className="material-symbols-outlined text-[10px]">schedule</span>
                              {timeLeft > 0 ? formatTime(timeLeft) : "Waktu Habis"}
                            </span>
                          </div>
                          <input
                            type="text"
                            placeholder="------"
                            maxLength={6}
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            className="w-full min-h-[44px] px-3.5 py-2.5 rounded border border-border-light bg-white text-center font-mono text-lg tracking-widest font-extrabold focus:border-primary-container focus:outline-none"
                            disabled={timeLeft === 0}
                            required
                            autoFocus
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmittingOtp || otp.length < 4 || timeLeft === 0}
                          className="w-full bg-primary-container hover:bg-primary text-white font-bold py-2.5 px-6 rounded text-xs uppercase tracking-wider min-h-[40px] flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                        >
                          {isSubmittingOtp ? "Memverifikasi..." : "Verifikasi & Lanjutkan"}
                        </button>

                        {currentStep === 4 && (
                          <button
                            type="button"
                            onClick={handleUserLoggedIn}
                            className="w-full border border-border-light text-on-surface-variant font-bold py-2 px-4 rounded text-[9px] uppercase tracking-wider hover:bg-surface-container"
                          >
                            Saya Sudah Selesaikan CAPTCHA di Chrome
                          </button>
                        )}
                      </form>
                    </div>
                  ) : isPromptingPassword ? (
                    <div className="p-8 bg-white space-y-6 animate-fadeIn">
                      <div className="text-center space-y-2">
                        <div className="w-12 h-12 rounded bg-primary-container/10 text-primary-container flex items-center justify-center mx-auto">
                          <span className="material-symbols-outlined text-2xl">lock</span>
                        </div>
                        <h3 className="text-sm font-extrabold uppercase tracking-wider text-on-surface">
                          {isBelumAkun() ? "Buat Sandi Akun OSS Baru" : "Masukkan Kata Sandi OSS Anda"}
                        </h3>
                        <p className="text-[11px] text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                          {isBelumAkun() 
                            ? "Konfigurasikan kata sandi baru untuk akun portal OSS BKPM yang sedang didaftarkan." 
                            : "Bot membutuhkan sandi OSS Anda untuk melanjutkan proses login otomatis."}
                        </p>
                      </div>

                      <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-xs mx-auto">
                        <div className="flex flex-col gap-3 text-left">
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-bold text-on-surface-variant uppercase">Kata Sandi Baru</label>
                            <input
                              type="password"
                              placeholder="Minimal 8 karakter"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full min-h-[40px] px-3.5 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none"
                              required
                            />
                          </div>

                          {isBelumAkun() && (
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-on-surface-variant uppercase">Konfirmasi Kata Sandi</label>
                              <input
                                type="password"
                                placeholder="Ulangi kata sandi"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full min-h-[40px] px-3.5 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none"
                                required
                              />
                            </div>
                          )}

                          {passwordError && (
                            <p className="text-[9px] text-error font-semibold leading-normal">{passwordError}</p>
                          )}
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmittingPassword || !newPassword}
                          className="w-full bg-primary-container hover:bg-primary text-white font-bold py-2.5 px-6 rounded text-xs uppercase tracking-wider min-h-[40px] flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                        >
                          {isSubmittingPassword ? "Menyimpan..." : "Kirim & Lanjutkan"}
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-white space-y-4">
                      <div className="w-14 h-14 bg-primary-container/10 text-primary-container rounded-full flex items-center justify-center mx-auto">
                        <span className="material-symbols-outlined text-3xl animate-pulse">smart_toy</span>
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-on-surface">Proses Latar Belakang Aktif</h4>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed max-w-xs mx-auto mt-1">
                          NIB Assistant sedang mengisi data formulir secara otomatis di browser Chrome terenkripsi. Tolong jangan tutup halaman ini.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Technical Logs inside Right Column on normal view */}
                {renderTechnicalLogs()}
              </div>

            </div>
          )}

          {/* Technical Logs below error card on error states */}
          {failedStep !== null && (
            <div className="max-w-[640px] mx-auto w-full mt-6">
              {renderTechnicalLogs()}
            </div>
          )}

        </div>
      </main>

    </div>
  );
}
