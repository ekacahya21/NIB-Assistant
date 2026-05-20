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
              // Only advance currentStep if no step has failed
              if (failedStepRef.current === null) {
                setCurrentStep(payload.step);
              }
            }
            addLog(payload.text, payload.status || "info");
            
            // Map text to UI Status indicator
            if (payload.step === 1) setStatusText("Membuka Portal OSS");
            if (payload.step === 2 && payload.status !== "error") {
              if (payload.text.includes("OTP") && payload.status === "warn") {
                setStatusText(isBelum === "belum" ? "Menunggu Anda memasukkan OTP..." : "Menunggu Anda login di portal OSS...");
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
            if (payload.step === 3 && failedStepRef.current === null) setStatusText("Mengisi formulir data pemilik & lokasi...");
            if (payload.step === 4 && failedStepRef.current === null) setStatusText("Memilih Sektor KBLI & Modal Usaha...");
            if (payload.step === 5 && failedStepRef.current === null) setStatusText("Draft NIB siap! Menunggu konfirmasi final.");
          }
        } catch (err) {
          console.error("Error parsing EventSource data", err);
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
        }
        // Only log warning if not a planned verification error
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

  const handleRestartAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (errorType !== "ktp_mismatch" && errorType !== "generic" && !updatedValue.trim()) return;
    if (errorType === "ktp_mismatch" && !updatedNik.trim() && !updatedNama.trim()) return;

    setIsUpdatingDraft(true);
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";

    try {
      if (errorType !== "generic") {
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
      
      // Reset States
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
      
      // Connect stream again to restart
      connectStream();
    } catch (err: any) {
      console.error(err);
      addLog(`Gagal memperbarui data: ${err.message || String(err)}`, "error");
    } finally {
      setIsUpdatingDraft(false);
    }
  };

  // Resume after user clicks "Saya sudah login"
  const handleUserLoggedIn = () => {
    if (currentStep !== 2) return;

    // Optional: ping backend that login was confirmed
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";
    fetch(`${API_URL}/automation/confirm/${draftId}`, { method: "POST" })
      .then(() => console.log("Login confirmed to backend"))
      .catch((err) => console.log("Offline or connection error: using simulated progression", err));

    addLog("Persetujuan diterima: User melaporkan login berhasil.", "success");
    addLog("Melakukan sinkronisasi session state browser...", "info");
  };

  // Reset and restart the entire registration wizard from scratch
  const handleResetAndRestartWizard = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("draft_form_data");
      sessionStorage.removeItem("wizard_step");
      sessionStorage.removeItem("skala_usaha");
      sessionStorage.removeItem("draft_id");
    }
    router.push("/wizard");
  };

  // Submit OTP
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
      .then(() => console.log("OTP sent to backend"))
      .catch((err) => console.log("Offline or connection error: using simulated progression", err))
      .finally(() => {
        setIsSubmittingOtp(false);
      });
  };

  // Submit Password
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) return;

    if (newPassword !== confirmPassword) {
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
      .then(() => console.log("Password sent to backend"))
      .catch((err) => console.log("Offline or connection error: using simulated progression", err))
      .finally(() => {
        setIsSubmittingPassword(false);
        setIsPromptingPassword(false);
        addLog("Kata sandi baru berhasil dikirim ke backend.", "success");
      });
  };
  // Step label data
  const stepLabels = [
    { label: "Validasi Data", icon: "verified", step: 1 },
    { label: akunOss === "belum" ? "Registrasi Akun & OTP" : "Login & OTP", icon: "login", step: 2 },
    { label: "Profil Pemilik", icon: "person", step: 3 },
    { label: "Sektor & KBLI", icon: "category", step: 4 },
    { label: "Terbitkan NIB", icon: "draft", step: 5 },
  ];

  return (
    <div className="flex flex-col bg-background min-h-screen h-screen overflow-hidden">
      {/* Top AppBar */}
      <header className="flex-none flex items-center justify-between px-4 h-14 w-full bg-background border-b border-border-light z-50">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/review")}
            className="text-primary hover:bg-primary/10 transition-all p-2 rounded-xl flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Kembali"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold text-primary">NIB Assistant</h1>
        </div>
        <button
          onClick={() => router.push("/")}
          className="p-2 text-on-surface-variant hover:opacity-80 transition-opacity rounded-full hover:bg-surface-container-high active:scale-95"
          aria-label="Bantuan"
        >
          <span className="material-symbols-outlined text-[24px]">help</span>
        </button>
      </header>

      {/* Main Split Layout */}
      <main className="flex-1 w-full grid grid-cols-1 lg:grid-cols-12 h-[calc(100vh-56px)] overflow-hidden">
        
        {/* Left Column: Progress Timeline */}
        <section className="lg:col-span-3 bg-surface-card flex flex-col h-full border-r border-border-light overflow-y-auto">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-primary mb-2">Progress Otomatisasi</h2>
            <p className="text-base text-on-surface-variant mb-8">Sistem sedang memproses data Anda ke portal OSS.</p>

            {/* Vertical Stepper */}
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-border-light">
              {stepLabels.map(({ label, icon, step }) => {
                const isCompleted = failedStep === null ? (currentStep > step) : (step < failedStep);
                const isCurrent = failedStep === null && currentStep === step;
                const isFailed = failedStep === step;
                const isWaiting = step === 2 && isCurrent && failedStep === null;

                return (
                  <div key={step} className="relative flex items-start gap-4 group">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 z-10 relative ${
                      isFailed ? "bg-rose-500 text-white border border-rose-500"
                      : isCompleted ? "bg-primary text-on-primary border border-primary"
                      : isCurrent ? "border-2 border-primary bg-surface-card text-primary"
                      : "border border-outline-variant bg-surface-card text-outline-variant"
                    }`}>
                      {isCurrent && !isFailed && <div className="absolute inset-0 rounded-full bg-primary/20 pulse-ring" />}
                      {isFailed ? <span className="material-symbols-outlined text-[18px]">close</span>
                      : isCompleted ? <span className="material-symbols-outlined text-[18px]" style={{fontVariationSettings: "'FILL' 1"}}>check</span>
                      : isCurrent ? <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                      : <span className="material-symbols-outlined text-[18px]">{icon}</span>}
                    </div>
                    <div className={`flex-1 ${step < stepLabels.length ? "pb-4" : ""}`}>
                      <div className="flex items-center justify-between mb-1">
                        <h3 className={`text-sm font-semibold ${isFailed ? "text-rose-600" : isCurrent ? "text-primary font-bold" : isCompleted ? "text-on-surface" : "text-outline"}`}>{label}</h3>
                        {isCurrent && !isFailed && <span className="text-xs text-primary font-medium">Sedang Proses</span>}
                      </div>
                      {isCurrent && !isFailed && <p className="text-xs text-on-surface-variant">{statusText}</p>}
                      {isFailed && <p className="text-xs text-rose-600">{errorText}</p>}
                      {isCompleted && step === 1 && <p className="text-xs text-on-surface-variant">Semua data valid.</p>}

                      {/* Step 2: Interactive inputs */}
                      {isWaiting && (
                        <div className="mt-3 space-y-3">
                          {akunOss === "belum" ? (
                            isPromptingPassword ? (
                              <form onSubmit={handlePasswordSubmit} className="space-y-3 mt-1">
                                <div className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant">
                                  <span>Buat Kata Sandi Baru:</span>
                                  <span className={`flex items-center gap-1 font-mono ${timeLeft < 20 ? "text-error animate-pulse" : "text-primary"}`}>
                                    <span className="material-symbols-outlined text-[12px]">schedule</span>
                                    {timeLeft > 0 ? formatTime(timeLeft) : "Waktu Habis"}
                                  </span>
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Kata Sandi Baru</label>
                                  <input type="password" placeholder="Minimal 8 karakter" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={timeLeft === 0}
                                    className="w-full bg-surface-container border border-border-light rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-primary disabled:opacity-50" required />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Konfirmasi</label>
                                  <input type="password" placeholder="Ulangi" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={timeLeft === 0}
                                    className="w-full bg-surface-container border border-border-light rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-primary disabled:opacity-50" required />
                                </div>
                                {passwordError && <p className="text-[10px] text-error font-semibold">{passwordError}</p>}
                                <button type="submit" disabled={isSubmittingPassword || !newPassword || !confirmPassword || timeLeft === 0}
                                  className="w-full bg-primary text-on-primary font-bold py-2 px-4 rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-50">
                                  {isSubmittingPassword ? "Mengonfigurasi..." : "Buat Kata Sandi"}
                                </button>
                              </form>
                            ) : isPromptingOtp ? (
                              <div className="space-y-2 mt-1">
                                <div className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant">
                                  <span>Masukkan Kode OTP:</span>
                                  <span className={`flex items-center gap-1 font-mono ${timeLeft < 20 ? "text-error animate-pulse" : "text-primary"}`}>
                                    <span className="material-symbols-outlined text-[12px]">schedule</span>
                                    {timeLeft > 0 ? formatTime(timeLeft) : "Waktu Habis"}
                                  </span>
                                </div>
                                <form onSubmit={handleOtpSubmit} className="flex items-center gap-2">
                                  <input type="text" placeholder="Kode OTP" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} disabled={timeLeft === 0}
                                    className="flex-1 bg-surface-container border border-border-light rounded-lg py-2 px-3 text-xs font-bold font-mono tracking-widest text-center focus:outline-none focus:border-primary disabled:opacity-50" />
                                  <button type="submit" disabled={isSubmittingOtp || !otp || timeLeft === 0}
                                    className="bg-primary text-on-primary font-bold py-2 px-4 rounded-lg text-xs disabled:opacity-50 shrink-0">
                                    {isSubmittingOtp ? "..." : "Kirim"}
                                  </button>
                                </form>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 py-1.5 text-xs text-on-surface-variant font-semibold animate-pulse">
                                <span className="material-symbols-outlined text-base animate-spin">sync</span>
                                <span>Menunggu form dimuat...</span>
                              </div>
                            )
                          ) : (
                            <button onClick={handleUserLoggedIn} className="bg-primary text-on-primary font-bold py-2 px-4 rounded-lg text-xs flex items-center gap-1.5 mt-1">
                              Saya sudah login <span className="material-symbols-outlined text-sm">open_in_new</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Error Recovery Panel */}
          {failedStep !== null && (
            <div className="mt-auto p-4 bg-rose-50 border-t border-rose-200">
              <form onSubmit={handleRestartAutomation} className="space-y-3">
                <div className="flex gap-3 mb-2">
                  <span className="material-symbols-outlined text-rose-500 text-xl shrink-0">warning</span>
                  <div>
                    <h4 className="text-sm font-bold text-rose-800">{errorType === "ktp_mismatch" ? "Verifikasi KTP Gagal" : errorType === "generic" ? "Kegagalan Sistem" : "Verifikasi Gagal"}</h4>
                    <p className="text-xs text-rose-700 mt-0.5">{errorText}</p>
                  </div>
                </div>
                {errorType === "ktp_mismatch" ? (
                  <div className="space-y-2">
                    <input type="text" placeholder="Nama Pemilik Baru" value={updatedNama} onChange={(e) => setUpdatedNama(e.target.value)} className="w-full bg-white border border-rose-300 rounded-lg py-2 px-3 text-xs text-rose-900 placeholder:text-rose-300" />
                    <input type="text" maxLength={16} placeholder="NIK Baru (16 Digit)" value={updatedNik} onChange={(e) => setUpdatedNik(e.target.value)} className="w-full bg-white border border-rose-300 rounded-lg py-2 px-3 text-xs text-rose-900 placeholder:text-rose-300" />
                  </div>
                ) : errorType !== "generic" ? (
                  <input type={errorType === "nik" ? "text" : "email"} maxLength={errorType === "nik" ? 16 : 100} placeholder={errorType === "nik" ? "NIK Baru" : "Email Baru"} value={updatedValue} onChange={(e) => setUpdatedValue(e.target.value)}
                    className="w-full bg-white border border-rose-300 rounded-lg py-2 px-3 text-xs text-rose-900 placeholder:text-rose-300" required />
                ) : null}
                <button type="submit" disabled={isUpdatingDraft || (errorType !== "ktp_mismatch" && errorType !== "generic" && !updatedValue.trim()) || (errorType === "ktp_mismatch" && !updatedNik.trim() && !updatedNama.trim())}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <span className="material-symbols-outlined text-sm">{isUpdatingDraft ? "sync" : "refresh"}</span>
                  {isUpdatingDraft ? "Memproses..." : errorType === "generic" ? "Mulai Ulang" : "Perbarui & Mulai Ulang"}
                </button>
              </form>
            </div>
          )}
        </section>

        {/* Right Column: Browser Session + Terminal */}
        <section className="lg:col-span-9 bg-surface-container-low flex flex-col h-full overflow-hidden">
          {/* Mock Browser Header */}
          <div className="bg-surface-container-high px-4 py-3 flex items-center gap-4 border-b border-border-light flex-none">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-error" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
            </div>
            <div className="flex-1 max-w-2xl bg-surface rounded-md px-3 py-1.5 flex items-center gap-2 border border-border-light text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px]">lock</span>
              <span className="text-xs truncate">https://oss.go.id/auth/login</span>
            </div>
          </div>

          {/* Browser Content Area */}
          <div className="flex-1 relative flex items-center justify-center p-8 overflow-y-auto">
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
              <span className="material-symbols-outlined text-[300px]">smart_toy</span>
            </div>
            <div className="w-full max-w-lg bg-surface-card rounded-xl shadow-lg border border-border-light p-10 text-center space-y-6 z-10 relative">
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-md ${failedStep !== null ? "bg-rose-100" : currentStep === 5 ? "bg-emerald-100" : "bg-primary-container"}`}>
                <span className={`material-symbols-outlined text-[40px] ${failedStep !== null ? "text-rose-600" : currentStep === 5 ? "text-emerald-600" : "text-on-primary-container animate-pulse"}`}>
                  {failedStep !== null ? "error" : currentStep === 5 ? "verified" : "speed"}
                </span>
              </div>
              <div>
                <h3 className={`text-xl font-semibold mb-3 ${failedStep !== null ? "text-rose-700" : currentStep === 5 ? "text-emerald-700" : "text-primary"}`}>
                  {failedStep !== null ? "Otomatisasi Terhenti" : currentStep === 5 ? "NIB Draft Berhasil!" : "Mengamankan Sesi"}
                </h3>
                <p className="text-base text-on-surface-variant px-4">
                  {failedStep !== null ? "Terjadi masalah. Periksa panel kiri untuk detail." : currentStep === 5 ? "Draft NIB Anda telah berhasil dibuat di portal OSS." : "NIB Assistant sedang membangun jalur aman untuk mengirimkan data Anda. Harap jangan menutup jendela ini."}
                </p>
              </div>
              {failedStep === null && currentStep < 5 && (
                <div className="w-full bg-surface-container-high rounded-full h-2.5 overflow-hidden mt-4">
                  <div className="bg-primary h-2.5 rounded-full transition-all duration-1000 ease-in-out relative overflow-hidden" style={{ width: `${(currentStep / 5) * 100}%` }}>
                    <div className="absolute inset-0 bg-white/20 -skew-x-12 animate-shimmer" />
                  </div>
                </div>
              )}
              {currentStep === 5 && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-2">
                  <button onClick={() => router.push("/")} className="px-8 py-3 rounded-full bg-primary text-on-primary font-semibold text-sm hover:opacity-90 flex items-center justify-center gap-2 shadow-md">
                    Kembali ke Beranda <span className="material-symbols-outlined text-[18px]">home</span>
                  </button>
                  <button onClick={handleResetAndRestartWizard} className="px-8 py-3 rounded-full bg-surface-container border border-border-light text-on-surface font-semibold text-sm hover:bg-surface-container-high flex items-center justify-center gap-2 shadow-md">
                    Mulai Kembali <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                  </button>
                </div>
              )}
              {failedStep !== null && (
                <button onClick={handleResetAndRestartWizard} className="mt-2 px-8 py-3 rounded-full bg-surface-container border border-border-light text-on-surface font-semibold text-sm hover:bg-surface-container-high flex items-center justify-center gap-2 mx-auto shadow-md">
                  Mulai Kembali <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                </button>
              )}
            </div>
          </div>

          {/* Terminal Console */}
          <div className="bg-[#1e1e1e] text-[#d4d4d4] font-mono text-[13px] p-4 h-40 overflow-y-auto border-t border-[#333] flex-none scrollbar-thin">
            {logs.map((log, index) => (
              <div key={index} className="flex gap-2 mb-1.5">
                <span className="text-[#569cd6]">[{log.time}]</span>
                <span className={log.type === "success" ? "text-[#4ec9b0]" : log.type === "warn" ? "text-[#dcdcaa]" : log.type === "error" ? "text-[#f48771]" : ""}>
                  {log.type !== "info" ? `${log.type.toUpperCase()}: ` : ""}{log.text}
                </span>
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </section>
      </main>
    </div>
  );
}

