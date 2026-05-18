"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

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
      addLog("Menghubungkan ke backend local NIB Assistant (port 3001)...", "info");
      const eventSource = new EventSource(`http://localhost:3001/automation/stream/${draftId}?akunOss=${isBelum}`);
      streamRef.current = eventSource;

      eventSource.onopen = () => {
        addLog("Koneksi SSE Backend Lokal BERHASIL. Mendengarkan stream otomatisasi...", "success");
      };

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && typeof payload.step === "number") {
            if (payload.status === "error") {
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
              setCurrentStep(payload.step);
            }
            addLog(payload.text, payload.status || "info");
            
            // Map text to UI Status indicator
            if (payload.step === 1) setStatusText("Membuka Portal OSS");
            if (payload.step === 2 && payload.status !== "error") {
              if (payload.text.includes("PENTING")) {
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
            if (payload.step === 3) setStatusText("Mengisi formulir data pemilik & lokasi...");
            if (payload.step === 4) setStatusText("Memilih Sektor KBLI & Modal Usaha...");
            if (payload.step === 5) setStatusText("Draft NIB siap! Menunggu konfirmasi final.");
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
        setFailedStep((prev) => {
          if (prev === null) {
            addLog("Koneksi backend tidak terdeteksi.", "warn");
          }
          return prev;
        });
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

        const response = await fetch(`http://localhost:3001/drafts/${draftId}`, {
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
    fetch(`http://localhost:3001/automation/confirm/${draftId}`, { method: "POST" })
      .then(() => console.log("Login confirmed to backend"))
      .catch((err) => console.log("Offline or connection error: using simulated progression", err));

    addLog("Persetujuan diterima: User melaporkan login berhasil.", "success");
    addLog("Melakukan sinkronisasi session state browser...", "info");
  };

  // Submit OTP
  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) return;

    setIsSubmittingOtp(true);
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";

    fetch(`http://localhost:3001/automation/otp/${draftId}`, {
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

    fetch(`http://localhost:3001/automation/password/${draftId}`, {
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

  return (
    <div className="flex-1 flex flex-col md:items-center justify-start bg-background min-h-screen">
      <div className="w-full max-w-max-width-form flex-grow flex flex-col relative bg-background pb-32 md:shadow-lg md:my-6 md:rounded-2xl md:border md:border-border-light overflow-hidden">
        
        {/* Top AppBar */}
        <header className="sticky top-0 z-50 flex items-center justify-between px-4 h-16 w-full bg-background border-b border-border-light">
          <button
            onClick={() => router.push("/review")}
            className="text-primary hover:bg-primary-fixed-dim/20 transition-all p-2 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Kembali"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          
          <h1 className="font-sans text-lg font-bold text-primary absolute left-1/2 transform -translate-x-1/2">
            Status Otomatisasi
          </h1>

          <button
            onClick={() => router.push("/")}
            className="text-primary hover:bg-primary-fixed-dim/20 transition-all p-2 rounded-full flex items-center justify-center focus:outline-none"
            aria-label="Bantuan"
          >
            <span className="material-symbols-outlined">help</span>
          </button>
        </header>

        {/* Main Content */}
        <main className="px-4 py-6 flex-grow space-y-6">
          
          {/* Header status prompt */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-primary mb-1.5 leading-tight">
              Kami sedang membantu mengisi OSS
            </h2>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-error-container/30 border border-error-container rounded-xl text-xs text-error font-semibold leading-relaxed max-w-md">
              <span className="material-symbols-outlined text-base">warning</span>
              <span>Jangan tutup halaman ini. Otomatisasi berjalan di sistem.</span>
            </div>
          </div>

          {/* Status Card Indicator with Pulse Ring */}
          <div className={`rounded-2xl p-4 border shadow-sm flex items-center gap-4 transition-all duration-300 ${
            failedStep !== null
              ? "bg-rose-50 border-rose-200"
              : "bg-surface-card border-border-light"
          }`}>
            <div className={`relative w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
              failedStep !== null
                ? "bg-rose-100 text-rose-600"
                : "bg-primary/10 text-primary"
            }`}>
              {currentStep < 5 && failedStep === null ? (
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              ) : null}
              <span className={`material-symbols-outlined text-2xl ${
                failedStep !== null
                  ? "text-rose-600"
                  : currentStep < 5
                  ? "animate-spin"
                  : "text-emerald-500"
              }`}>
                {failedStep !== null ? "error" : currentStep < 5 ? "sync" : "verified"}
              </span>
            </div>
            <div>
              <h3 className={`font-bold text-sm ${failedStep !== null ? "text-rose-800" : "text-on-surface"}`}>
                {failedStep !== null
                  ? "Otomatisasi Terhenti"
                  : currentStep === 5
                  ? "Otomatisasi Selesai"
                  : "Otomatisasi Sedang Berjalan"}
              </h3>
              <p className={`text-xs italic ${failedStep !== null ? "text-rose-600" : "text-on-surface-variant"}`}>
                {statusText}
              </p>
            </div>
          </div>

          {/* Notification Alert and Update Option */}
          {failedStep !== null && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 space-y-4 shadow-sm animate-fade-in">
              <div className="flex gap-3">
                <span className="material-symbols-outlined text-rose-500 text-2xl shrink-0">warning</span>
                <div>
                  <h4 className="font-bold text-sm text-rose-800">
                    {errorType === "ktp_mismatch"
                      ? "Verifikasi Data KTP Gagal"
                      : errorType === "generic"
                      ? "Kegagalan Sistem Otomatisasi"
                      : "Verifikasi NIK & Email Gagal"}
                  </h4>
                  <p className="text-xs text-rose-700 mt-1 leading-relaxed">{errorText}</p>
                </div>
              </div>
              
              <div className="border-t border-rose-200/60 pt-4">
                <form onSubmit={handleRestartAutomation} className="space-y-3.5">
                  {errorType === "ktp_mismatch" ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-rose-800">
                          Nama Pemilik Baru (Sesuai KTP)
                        </label>
                        <input
                          type="text"
                          placeholder="Contoh: ARYANTO WICAKSONO"
                          value={updatedNama}
                          onChange={(e) => setUpdatedNama(e.target.value)}
                          className="w-full bg-white border border-rose-300 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm text-rose-900 placeholder:text-rose-300 font-semibold"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-rose-800">
                          Nomor NIK Baru (16 Digit)
                        </label>
                        <input
                          type="text"
                          maxLength={16}
                          placeholder="Contoh: 3175081108770004"
                          value={updatedNik}
                          onChange={(e) => setUpdatedNik(e.target.value)}
                          className="w-full bg-white border border-rose-300 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm text-rose-900 placeholder:text-rose-300 font-semibold"
                        />
                      </div>
                      <p className="text-[10px] text-rose-600 italic">
                        *Anda boleh mengisi nama pemilik saja, NIK saja, atau keduanya jika salah ketik.
                      </p>
                    </div>
                  ) : errorType === "generic" ? (
                    <div className="py-1">
                      <p className="text-xs text-rose-700 leading-relaxed font-semibold">
                        Terjadi kegagalan teknis dalam mengeksekusi browser otomatisasi (kemungkinan timeout atau kendala koneksi server portal OSS). Silakan coba lagi.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-rose-800">
                        Masukkan {errorType === "nik" ? "Nomor NIK Baru (16 Digit)" : "Alamat Email Baru"}
                      </label>
                      <input
                        type={errorType === "nik" ? "text" : "email"}
                        maxLength={errorType === "nik" ? 16 : 100}
                        placeholder={errorType === "nik" ? "Contoh: 3175081108770004" : "Contoh: namabaru@email.com"}
                        value={updatedValue}
                        onChange={(e) => setUpdatedValue(e.target.value)}
                        className="w-full bg-white border border-rose-300 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm text-rose-900 placeholder:text-rose-300 font-semibold"
                        required
                      />
                    </div>
                  )}
                  
                  <button
                    type="submit"
                    disabled={
                      isUpdatingDraft || 
                      (errorType !== "ktp_mismatch" && errorType !== "generic" && !updatedValue.trim()) ||
                      (errorType === "ktp_mismatch" && !updatedNik.trim() && !updatedNama.trim())
                    }
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 px-6 rounded-full text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUpdatingDraft ? (
                      <>
                        <span className="animate-spin text-sm">sync</span>
                        <span>Memproses Perubahan...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">refresh</span>
                        <span>
                          {errorType === "generic"
                            ? "Mulai Ulang Otomatisasi"
                            : "Perbarui & Mulai Ulang Otomatisasi"}
                        </span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Vertical Stepper Timeline */}
          <div className="bg-surface-card rounded-2xl p-5 border border-border-light shadow-sm">
            <div className="relative pl-6 border-l-2 border-outline-variant/60 ml-3.5 space-y-6">
              
              {/* Step 1: Connect Chrome */}
              <div className="relative">
                <div className={`absolute -left-[35px] top-0 w-6.5 h-6.5 rounded-full flex items-center justify-center text-xs font-bold border-2 border-surface-card z-10 ${
                  currentStep > 1
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-high text-on-surface-variant animate-pulse"
                }`}>
                  {currentStep > 1 ? (
                    <span className="material-symbols-outlined text-sm font-bold">check</span>
                  ) : "1"}
                </div>
                <div className={`text-sm font-bold ${currentStep > 1 ? "line-through text-outline-variant" : "text-on-surface"}`}>
                  Membuka Portal Resmi OSS
                </div>
              </div>

              {/* Step 2: User Action Login */}
              <div className="relative">
                <div className={`absolute -left-[35px] top-0 w-6.5 h-6.5 rounded-full flex items-center justify-center text-xs font-bold border-2 border-surface-card z-10 ${
                  failedStep === 2
                    ? "bg-rose-500 text-white animate-pulse"
                    : currentStep > 2
                    ? "bg-primary text-on-primary"
                    : currentStep === 2
                    ? "bg-amber-500 text-white animate-pulse"
                    : "bg-surface-container-high text-on-surface-variant"
                }`}>
                  {failedStep === 2 ? (
                    <span className="material-symbols-outlined text-sm font-bold">close</span>
                  ) : currentStep > 2 ? (
                    <span className="material-symbols-outlined text-sm font-bold">check</span>
                  ) : currentStep === 2 ? (
                    <span className="material-symbols-outlined text-sm font-bold">priority_high</span>
                  ) : "2"}
                </div>
                <div className="text-sm font-bold">
                  <span className={
                    failedStep === 2
                      ? "text-rose-600 font-extrabold"
                      : currentStep > 2
                      ? "line-through text-outline-variant"
                      : currentStep === 2
                      ? "text-amber-600 font-extrabold"
                      : "text-outline"
                  }>
                    {akunOss === "belum" ? "Registrasi Akun & Verifikasi OTP" : "Menunggu Login & OTP"}
                  </span>
                </div>
                {currentStep === 2 && failedStep === null && (
                  <div className="mt-1.5 space-y-3">
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      {akunOss === "belum"
                        ? isPromptingPassword 
                          ? "Kata sandi Anda akan digunakan untuk masuk ke akun OSS baru Anda. Silakan isi kata sandi baru."
                          : isPromptingOtp
                          ? "Silakan salin kode OTP yang masuk ke email Anda lalu masukkan di bawah."
                          : "Sistem sedang menginput NIK & Email Anda di formulir registrasi OSS..."
                        : "Sistem mendeteksi tab login portal OSS terbuka. Silakan isi sandi/OTP, lalu klik tombol konfirmasi di bawah."}
                    </p>
                    
                    {akunOss === "belum" ? (
                      isPromptingPassword ? (
                        <form onSubmit={handlePasswordSubmit} className="space-y-3 max-w-xs mt-2 bg-surface-container/20 p-3 rounded-2xl border border-border-light shadow-sm">
                          <div>
                            <label className="block text-xs font-bold text-on-surface-variant mb-1">Kata Sandi Baru</label>
                            <input
                              type="password"
                              placeholder="Minimal 8 karakter (huruf, angka, simbol)"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full bg-surface-container border border-border-light rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-primary shadow-sm"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-on-surface-variant mb-1">Konfirmasi Kata Sandi</label>
                            <input
                              type="password"
                              placeholder="Ulangi Kata Sandi"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="w-full bg-surface-container border border-border-light rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-primary shadow-sm"
                              required
                            />
                          </div>
                          {passwordError && (
                            <p className="text-[10px] text-error font-semibold leading-normal">{passwordError}</p>
                          )}
                          <button
                            type="submit"
                            disabled={isSubmittingPassword || !newPassword || !confirmPassword}
                            className="w-full bg-primary hover:bg-primary-container text-on-primary font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:bg-outline-variant disabled:text-outline disabled:cursor-not-allowed"
                          >
                            {isSubmittingPassword ? "Mengonfigurasi..." : "Buat Kata Sandi"}
                            <span className="material-symbols-outlined text-sm">lock</span>
                          </button>
                        </form>
                      ) : isPromptingOtp ? (
                        <form onSubmit={handleOtpSubmit} className="flex items-center gap-2 max-w-xs mt-2">
                          <input
                            type="text"
                            placeholder="Masukkan OTP"
                            maxLength={6}
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            className="flex-1 bg-surface-container border border-border-light rounded-xl py-2 px-3 text-xs font-bold font-mono tracking-widest text-center focus:outline-none focus:border-primary shadow-sm"
                          />
                          <button
                            type="submit"
                            disabled={isSubmittingOtp || !otp}
                            className="bg-primary hover:bg-primary-container text-on-primary font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-1 shadow-sm transition-all disabled:bg-outline-variant disabled:text-outline disabled:cursor-not-allowed shrink-0"
                          >
                            {isSubmittingOtp ? "Mengirim..." : "Verifikasi"}
                            <span className="material-symbols-outlined text-sm">send</span>
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2 mt-2 py-1.5 text-xs text-on-surface-variant font-semibold animate-pulse">
                          <span className="material-symbols-outlined text-base animate-spin">sync</span>
                          <span>Menunggu formulir registrasi dimuat...</span>
                        </div>
                      )
                    ) : (
                      <button
                        onClick={handleUserLoggedIn}
                        className="bg-primary hover:bg-primary-container text-on-primary font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all mt-1"
                      >
                        Saya sudah login
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Step 3: Autocomplete Profile */}
              <div className="relative">
                <div className={`absolute -left-[35px] top-0 w-6.5 h-6.5 rounded-full flex items-center justify-center text-xs font-bold border-2 border-surface-card z-10 ${
                  currentStep > 3
                    ? "bg-primary text-on-primary"
                    : currentStep === 3
                    ? "bg-primary/20 text-primary border-primary animate-pulse"
                    : "bg-surface-container-high text-on-surface-variant"
                }`}>
                  {currentStep > 3 ? (
                    <span className="material-symbols-outlined text-sm font-bold">check</span>
                  ) : "3"}
                </div>
                <div className={`text-sm font-bold ${currentStep > 3 ? "line-through text-outline-variant" : currentStep === 3 ? "text-primary" : "text-outline"}`}>
                  Mengisi Data Profil Pemilik
                </div>
              </div>

              {/* Step 4: Choose KBLI sector */}
              <div className="relative">
                <div className={`absolute -left-[35px] top-0 w-6.5 h-6.5 rounded-full flex items-center justify-center text-xs font-bold border-2 border-surface-card z-10 ${
                  currentStep > 4
                    ? "bg-primary text-on-primary"
                    : currentStep === 4
                    ? "bg-primary/20 text-primary border-primary animate-pulse"
                    : "bg-surface-container-high text-on-surface-variant"
                }`}>
                  {currentStep > 4 ? (
                    <span className="material-symbols-outlined text-sm font-bold">check</span>
                  ) : "4"}
                </div>
                <div className={`text-sm font-bold ${currentStep > 4 ? "line-through text-outline-variant" : currentStep === 4 ? "text-primary" : "text-outline"}`}>
                  Memilih Sektor Usaha & KBLI
                </div>
              </div>

              {/* Step 5: Finished */}
              <div className="relative">
                <div className={`absolute -left-[35px] top-0 w-6.5 h-6.5 rounded-full flex items-center justify-center text-xs font-bold border-2 border-surface-card z-10 ${
                  currentStep === 5
                    ? "bg-emerald-500 text-white"
                    : "bg-surface-container-high text-on-surface-variant"
                }`}>
                  {currentStep === 5 ? (
                    <span className="material-symbols-outlined text-sm font-bold">check</span>
                  ) : "5"}
                </div>
                <div className={`text-sm font-bold ${currentStep === 5 ? "text-emerald-600 font-extrabold" : "text-outline"}`}>
                  Selesai & Terbitkan NIB Draft
                </div>
              </div>

            </div>
          </div>

          {/* Premium Glass Terminal/Logs Window */}
          <div className="bg-neutral-900 rounded-2xl p-4 text-xs font-mono text-zinc-300 shadow-lg border border-neutral-800">
            <div className="flex justify-between items-center pb-2.5 mb-2.5 border-b border-neutral-800 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
              <span>Konsol Log NIB Assistant</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Connection
              </span>
            </div>
            
            <div className="max-h-[160px] overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-800">
              {logs.map((log, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-zinc-600 font-semibold">{log.time}</span>
                  <span className={`font-bold shrink-0 ${
                    log.type === "success"
                      ? "text-emerald-400"
                      : log.type === "warn"
                      ? "text-amber-400"
                      : log.type === "error"
                      ? "text-rose-400"
                      : "text-sky-400"
                  }`}>
                    [{log.type.toUpperCase()}]
                  </span>
                  <span className="text-zinc-200 leading-normal">{log.text}</span>
                </div>
              ))}
              <div ref={consoleEndRef} />
            </div>
          </div>

        </main>

        {/* Bottom Persistent Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 md:absolute md:-bottom-2 bg-surface-card border-t border-border-light px-4 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-40 md:rounded-b-2xl">
          <div className="max-w-max-width-form mx-auto flex items-center justify-between gap-4">
            {failedStep !== null ? (
              <div className="w-full text-center py-2 text-xs font-semibold text-rose-600 animate-pulse flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-sm font-bold">warning</span>
                <span>Otomatisasi Terhenti: Silakan perbarui NIK/Email pada form merah di atas.</span>
              </div>
            ) : currentStep === 2 ? (
              <div className="w-full text-center py-2 text-xs font-semibold text-amber-600 animate-pulse flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-sm font-bold">priority_high</span>
                <span>Silakan isi konfirmasi / OTP langsung pada Langkah 2 di atas.</span>
              </div>
            ) : currentStep === 5 ? (
              <button
                onClick={() => router.push("/")}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-on-primary font-bold py-4 px-6 rounded-full text-sm flex items-center justify-center gap-1.5 shadow-sm transition-all"
              >
                Kembali ke Halaman Utama
                <span className="material-symbols-outlined text-lg">home</span>
              </button>
            ) : (
              <div className="w-full text-center py-2 text-xs font-semibold text-outline animate-pulse">
                ⚙️ NIB Assistant sedang melakukan otomatisasi... mohon tunggu.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
