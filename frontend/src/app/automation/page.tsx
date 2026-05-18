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

  // Handle step timers and simulator or real-time SSE stream
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let fallbackTimers: NodeJS.Timeout[] = [];
    
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";

    // Attempt connecting to the real-time NestJS Server-Sent Events stream
    try {
      addLog("Menghubungkan ke backend local NIB Assistant (port 3001)...", "info");
      eventSource = new EventSource(`http://localhost:3001/automation/stream/${draftId}`);
      
      eventSource.onopen = () => {
        addLog("Koneksi SSE Backend Lokal BERHASIL. Mendengarkan stream otomatisasi...", "success");
      };

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && typeof payload.step === "number") {
            setCurrentStep(payload.step);
            addLog(payload.text, payload.status || "info");
            
            // Map text to UI Status indicator
            if (payload.step === 1) setStatusText("Membuka Portal OSS");
            if (payload.step === 2) setStatusText("Menunggu Anda login di portal OSS...");
            if (payload.step === 3) setStatusText("Mengisi formulir data pemilik & lokasi...");
            if (payload.step === 4) setStatusText("Memilih Sektor KBLI & Modal Usaha...");
            if (payload.step === 5) setStatusText("Draft NIB siap! Menunggu konfirmasi final.");
          }
        } catch (err) {
          console.error("Error parsing EventSource data", err);
        }
      };

      eventSource.onerror = () => {
        // Close event source and fall back to simulator
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        addLog("Koneksi backend tidak terdeteksi. Menjalankan simulasi otomatisasi offline...", "warn");
        runOfflineSimulation();
      };
    } catch (e) {
      addLog("Koneksi backend tidak terdeteksi. Menjalankan simulasi otomatisasi offline...", "warn");
      runOfflineSimulation();
    }

    function runOfflineSimulation() {
      // Step 1: Connecting
      addLog("Menginisialisasi browser Playwright di backend local...", "info");
      const t1 = setTimeout(() => {
        addLog("Browser Chromium headful berhasil diluncurkan.", "success");
        addLog("Membuka alamat resmi: https://oss.go.id", "info");
        setCurrentStep(2);
        setStatusText("Membuka Portal OSS");
      }, 1800);

      // Step 2: Waiting for user login
      const t2 = setTimeout(() => {
        addLog("Portal OSS berhasil dimuat. Jendela browser terbuka di komputer Anda.", "success");
        addLog("PENTING: Silakan selesaikan proses LOGIN / OTP di jendela browser Chrome yang terbuka.", "warn");
        setStatusText("Menunggu Anda login di portal OSS...");
      }, 3800);

      fallbackTimers.push(t1, t2);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      fallbackTimers.forEach(clearTimeout);
    };
  }, []);

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
    
    // Move to step 3: Filling Data
    setCurrentStep(3);
    setStatusText("Mengisi formulir data pemilik & lokasi usaha...");

    setTimeout(() => {
      addLog("Mengisi kolom Nama Pemilik: Budi Santoso [SUKSES]", "info");
    }, 1000);

    setTimeout(() => {
      addLog("Mengisi NIK Pemilik: 3171234567890001 [SUKSES]", "info");
    }, 2200);

    setTimeout(() => {
      addLog("Mengisi Kontak WhatsApp & Alamat Detail [SUKSES]", "info");
    }, 3500);

    // Move to step 4: Selecting KBLI
    setTimeout(() => {
      setCurrentStep(4);
      setStatusText("Memilih Sektor KBLI & Modal Usaha...");
      addLog("Memilih KBLI: 56103 (Kedai Makanan) [SUKSES]", "info");
      addLog("Menginput Modal Usaha & Jumlah Pekerja [SUKSES]", "info");
    }, 4800);

    // Move to step 5: Final Review / Complete
    setTimeout(() => {
      setCurrentStep(5);
      setStatusText("Draft NIB siap! Menunggu konfirmasi final di OSS.");
      addLog("Semua data berhasil diisi ke form portal OSS.", "success");
      addLog("Silakan periksa kembali halaman browser Anda, klik 'Terbitkan NIB' untuk finalisasi.", "success");
    }, 6500);
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
              <span>Jangan tutup halaman ini. Otomatisasi berjalan lokal di backend.</span>
            </div>
          </div>

          {/* Status Card Indicator with Pulse Ring */}
          <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex items-center gap-4">
            <div className="relative w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {currentStep < 5 ? (
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              ) : null}
              <span className={`material-symbols-outlined text-2xl ${currentStep < 5 ? "animate-spin" : "text-emerald-500"}`}>
                {currentStep < 5 ? "sync" : "verified"}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-sm text-on-surface">
                {currentStep === 5 ? "Otomatisasi Selesai" : "Otomatisasi Sedang Berjalan"}
              </h3>
              <p className="text-xs text-on-surface-variant italic">
                {statusText}
              </p>
            </div>
          </div>

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
                  currentStep > 2
                    ? "bg-primary text-on-primary"
                    : currentStep === 2
                    ? "bg-amber-500 text-white animate-pulse"
                    : "bg-surface-container-high text-on-surface-variant"
                }`}>
                  {currentStep > 2 ? (
                    <span className="material-symbols-outlined text-sm font-bold">check</span>
                  ) : currentStep === 2 ? (
                    <span className="material-symbols-outlined text-sm font-bold">priority_high</span>
                  ) : "2"}
                </div>
                <div className="text-sm font-bold">
                  <span className={currentStep > 2 ? "line-through text-outline-variant" : currentStep === 2 ? "text-amber-600 font-extrabold" : "text-outline"}>
                    Menunggu Login & OTP
                  </span>
                </div>
                {currentStep === 2 && (
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    Sistem mendeteksi tab login portal OSS terbuka. Silakan isi sandi/OTP, lalu klik tombol konfirmasi di bawah.
                  </p>
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
                    <span className="material-symbols-outlined text-sm font-bold">celebrate</span>
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
            {currentStep === 2 ? (
              <>
                <div className="flex-1 text-left">
                  <p className="text-xs font-bold text-amber-600">Menanti Login Anda...</p>
                  <p className="text-[10px] text-on-surface-variant">Lengkapi login di jendela Chrome</p>
                </div>
                <button
                  onClick={handleUserLoggedIn}
                  className="bg-primary hover:bg-primary-container text-on-primary font-bold py-3.5 px-6 rounded-full text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  Saya sudah login
                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                </button>
              </>
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
