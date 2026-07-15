"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSessionId } from "../../utils/session";
import SearchableSelect from "@/components/molecules/SearchableSelect";
import LiveConsole from "@/components/organisms/LiveConsole";

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
  const [stepDurations, setStepDurations] = useState<Record<number, number>>({});
  
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
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  // Product Setup States
  const [isPromptingProduct, setIsPromptingProduct] = useState<boolean>(false);
  const [allowedUnitsList, setAllowedUnitsList] = useState<string[]>([]);
  const [productName, setProductName] = useState<string>("");
  const [productCoverage, setProductCoverage] = useState<string>("Tidak Mengajukan Fasilitas");
  const [productCapacity, setProductCapacity] = useState<string>("");
  const [productUnit, setProductUnit] = useState<string>("");
  const [isSubmittingProduct, setIsSubmittingProduct] = useState<boolean>(false);
  const [productError, setProductError] = useState<string>("");

  // KBLI 2025 states
  const [isPromptingKbli2025, setIsPromptingKbli2025] = useState<boolean>(false);
  const [kbli2025Options, setKbli2025Options] = useState<Array<{ code: string; title: string }>>([]);
  const [selectedKbli2025, setSelectedKbli2025] = useState<string>( "");
  const [isSubmittingKbli2025, setIsSubmittingKbli2025] = useState<boolean>(false);

  // Parameter & Risk States
  const [isPromptingParameter, setIsPromptingParameter] = useState<boolean>(false);
  const [riskData, setRiskData] = useState<{
    tingkatRisiko: string;
    skalaUsaha: string;
    jenisPerizinan: string;
    perizinanTunggal: boolean;
  } | null>(null);
  const [parameterOptions, setParameterOptions] = useState<string[]>([]);
  const [selectedParameter, setSelectedParameter] = useState<string>("");
  const [isSubmittingParameter, setIsSubmittingParameter] = useState<boolean>(false);
  const [parameterError, setParameterError] = useState<string>("");

  // Dynamic Background Process UI States
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [activeActivity, setActiveActivity] = useState<'idle' | 'typing' | 'clicking' | 'waiting'>('idle');
  const [activeSubStatus, setActiveSubStatus] = useState<string>("Bot sedang menginisialisasi otomatisasi...");

  const [userContact, setUserContact] = useState<{ nomorHp: string; email: string }>({ nomorHp: "", email: "" });
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(""));
  const otpRefs = useRef<HTMLInputElement[]>([]);

  const maskPhoneNumber = (num: string) => {
    if (!num) return "";
    if (num.length <= 8) return num;
    const start = num.slice(0, 4);
    const end = num.slice(-4);
    return `${start}-${"*".repeat(num.length - 8)}-${end}`;
  };

  const maskEmail = (emailStr: string) => {
    if (!emailStr) return "";
    const parts = emailStr.split("@");
    if (parts.length !== 2) return emailStr;
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 3) return `${name[0]}***@${domain}`;
    return `${name.slice(0, 2)}***${name.slice(-1)}@${domain}`;
  };

  const getFriendlyErrorMessage = (rawError: string) => {
    if (!rawError) {
      return "Terjadi kendala koneksi atau waktu tunggu habis (timeout) saat berinteraksi dengan portal OSS BKPM. Silakan klik 'Coba Lagi' di bawah untuk mengulangi otomatisasi, atau pilih 'Isi Manual' untuk melanjutkan pengisian secara mandiri.";
    }
    const isSystemError = 
      /locator|timeout|exceeded|waiting\s+for|page\.|selector|element|unexpected|failed|error|network/i.test(rawError);

    if (isSystemError) {
      return "Terjadi kendala koneksi atau waktu tunggu habis (timeout) saat berinteraksi dengan portal OSS BKPM. Silakan klik 'Coba Lagi' di bawah untuk mengulangi otomatisasi, atau pilih 'Isi Manual' untuk melanjutkan pengisian secara mandiri.";
    }
    return rawError;
  };

  const handleOtpDigitChange = (value: string, idx: number) => {
    const cleanVal = value.replace(/\D/g, "").slice(0, 1);
    const newDigits = [...otpDigits];
    newDigits[idx] = cleanVal;
    setOtpDigits(newDigits);

    const fullOtp = newDigits.join("");
    setOtp(fullOtp);

    if (cleanVal && idx < 5) {
      otpRefs.current[idx + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === "Backspace") {
      if (!otpDigits[idx] && idx > 0) {
        const newDigits = [...otpDigits];
        newDigits[idx - 1] = "";
        setOtpDigits(newDigits);
        setOtp(newDigits.join(""));
        otpRefs.current[idx - 1]?.focus();
      } else if (otpDigits[idx]) {
        const newDigits = [...otpDigits];
        newDigits[idx] = "";
        setOtpDigits(newDigits);
        setOtp(newDigits.join(""));
      }
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "");
    if (pasteData.length > 0) {
      const newDigits = [...otpDigits];
      const digitsToFill = pasteData.slice(0, 6).split("");
      
      for (let i = 0; i < 6; i++) {
        newDigits[i] = digitsToFill[i] || "";
      }
      
      setOtpDigits(newDigits);
      setOtp(newDigits.join(""));
      
      const targetFocusIdx = Math.min(digitsToFill.length, 5);
      otpRefs.current[targetFocusIdx]?.focus();
    }
  };

  const handleResendOtp = async () => {
    addLog("Meminta pengiriman ulang kode OTP dari portal OSS...", "warn");
    setTimeLeft(120);
    setOtpDigits(Array(6).fill(""));
    setOtp("");
    try {
      const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";
      await fetch(`${API_URL}/automation/resend-otp/${draftId}`, { method: "POST" });
      addLog("Permintaan Kirim Ulang OTP berhasil dikirim.", "success");
    } catch (err) {
      console.error(err);
      addLog("Kirim ulang OTP dipicu secara lokal.", "info");
    }
  };

  // Error and Update States
  const [failedStep, setFailedStep] = useState<number | null>(null);
  const [errorType, setErrorType] = useState<"nik" | "email" | "ktp_mismatch" | "generic" | null>(null);
  const [errorText, setErrorText] = useState<string>("");
  const [updatedValue, setUpdatedValue] = useState<string>("");
  const [updatedNik, setUpdatedNik] = useState<string>("");
  const [updatedNama, setUpdatedNama] = useState<string>("");
  const [isUpdatingDraft, setIsUpdatingDraft] = useState<boolean>(false);
  

  
  const streamRef = useRef<EventSource | null>(null);
  const elapsedTimerRef = useRef<any>(null);
  const failedStepRef = useRef<number | null>(null);
  
  // Countdown Timer State
  const [timeLeft, setTimeLeft] = useState<number>(120);

  // Format timeLeft into MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const clearElapsedTimer = () => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  useEffect(() => {
    let timerId: any;
    if (isPromptingOtp || isPromptingPassword || isPromptingProduct || isPromptingParameter || isPromptingKbli2025) {
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
  }, [isPromptingOtp, isPromptingPassword, isPromptingProduct, isPromptingParameter, isPromptingKbli2025]);

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



  // Handle step timers and real-time SSE stream
  const connectStream = () => {
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";
    const isBelum = typeof window !== "undefined" ? sessionStorage.getItem("akun_oss") || "belum" : "belum";
    setAkunOss(isBelum);

    try {
      addLog("Menghubungkan ke backend local NIB Assistant...", "info");
      const eventSource = new EventSource(`${API_URL}/automation/stream/${draftId}?akunOss=${isBelum}&sessionId=${getSessionId()}`);
      streamRef.current = eventSource;

      eventSource.onopen = () => {
        addLog("Koneksi SSE Backend Lokal BERHASIL. Mendengarkan stream otomatisasi...", "success");
        setStepDurations({});
        setElapsedSeconds(0);
        clearElapsedTimer();
        elapsedTimerRef.current = setInterval(() => {
          setElapsedSeconds((prev) => prev + 1);
        }, 1000);
      };

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && typeof payload.step === "number") {
            if (typeof payload.duration === "number") {
              setStepDurations((prev) => ({
                ...prev,
                [payload.step]: payload.duration,
              }));
            }
            if (payload.text) {
              let displayMsg = payload.text;
              const suffixIndex = displayMsg.indexOf(" (+");
              if (suffixIndex !== -1) {
                displayMsg = displayMsg.substring(0, suffixIndex);
              }
              setActiveSubStatus(displayMsg);

              const lowerText = displayMsg.toLowerCase();
              if (
                lowerText.includes("mengisi") || 
                lowerText.includes("mengetik") || 
                lowerText.includes("memasukkan") ||
                lowerText.includes("fill")
              ) {
                setActiveActivity("typing");
              } else if (
                lowerText.includes("klik") || 
                lowerText.includes("mengklik") || 
                lowerText.includes("click")
              ) {
                setActiveActivity("clicking");
              } else if (
                lowerText.includes("menunggu") || 
                lowerText.includes("wait") || 
                lowerText.includes("mendapatkan response")
              ) {
                setActiveActivity("waiting");
              } else {
                setActiveActivity("idle");
              }
            }

            if (payload.status === "error") {
              if (eventSource) {
                eventSource.close();
              }
              clearElapsedTimer();
              failedStepRef.current = payload.step;
              setFailedStep(payload.step);
              setErrorText(payload.text);
              setIsPromptingOtp(false);
              setIsPromptingPassword(false);
              setIsPromptingProduct(false);
              setIsPromptingParameter(false);
              setIsPromptingKbli2025(false);
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
              if (typeof window !== "undefined") {
                sessionStorage.setItem("akun_oss", "sudah");
              }
            }
            if (payload.step === 4 && failedStepRef.current === null) {
              if (typeof window !== "undefined") {
                sessionStorage.setItem("akun_oss", "sudah");
              }
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
              if (payload.text.includes("MENGISI_RINCIAN_PRODUK")) {
                setStatusText("Menunggu Anda melengkapi rincian produk...");
                setIsPromptingProduct(true);
                setAllowedUnitsList(Array.from(new Set(payload.data?.allowedUnits || ["Unit", "Kg", "Pcs"])));
                setIsPromptingOtp(false);
                setIsPromptingPassword(false);
                setIsPromptingParameter(false);
                setIsPromptingKbli2025(false);
              } else if (payload.text.includes("MENGISI_PARAMETER_RISIKO")) {
                setStatusText("Menunggu Anda melengkapi parameter risiko...");
                setIsPromptingParameter(true);
                setRiskData({
                  tingkatRisiko: payload.data?.tingkatRisiko || "Rendah",
                  skalaUsaha: payload.data?.skalaUsaha || "Mikro",
                  jenisPerizinan: payload.data?.jenisPerizinan || "NIB",
                  perizinanTunggal: !!payload.data?.perizinanTunggal
                });
                setParameterOptions(payload.data?.parameterOptions || []);
                setIsPromptingProduct(false);
                setIsPromptingOtp(false);
                setIsPromptingPassword(false);
                setIsPromptingKbli2025(false);
              } else if (payload.text.includes("PILIH_KBLI_2025")) {
                setStatusText("Menunggu konversi KBLI 2025...");
                setIsPromptingKbli2025(true);
                setKbli2025Options(payload.data?.options || []);
                setIsPromptingProduct(false);
                setIsPromptingOtp(false);
                setIsPromptingPassword(false);
                setIsPromptingParameter(false);
              } else if (payload.text.includes("Menyimpan data Produk/Jasa")) {
                setIsPromptingProduct(false);
                setStatusText("Menyimpan produk...");
              } else if (payload.text.includes("Menyimpan analisis Risiko")) {
                setIsPromptingParameter(false);
                setStatusText("Menyimpan parameter...");
              } else if (payload.text.includes("Memperbarui database ke KBLI 2025")) {
                setIsPromptingKbli2025(false);
                setStatusText("Menyimpan KBLI 2025...");
              } else {
                setStatusText("Merekam Rincian Produk/Jasa...");
              }
            }
            if (payload.step === 7 && payload.status === "success" && failedStepRef.current === null) {
              if (eventSource) {
                eventSource.close();
              }
              clearElapsedTimer();
              setStatusText("Proses Otomatisasi Selesai!");
              setIsPromptingOtp(false);
              setIsPromptingPassword(false);
              // Redirect to result page after 2 seconds
              setTimeout(() => {
                router.push(`/result?state=success&draftId=${draftId}`);
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
        setIsPromptingProduct(false);
        setIsPromptingParameter(false);
        setIsPromptingKbli2025(false);
        clearElapsedTimer();
        if (failedStepRef.current === null) {
          addLog("Koneksi backend terputus atau tidak terdeteksi.", "error");
          failedStepRef.current = 999;
          setFailedStep(999);
          setErrorType("generic");
          setErrorText("Koneksi ke server backend NIB Assistant terputus. Pastikan server backend Anda menyala, kemudian klik tombol 'Coba Lagi' di bawah untuk menghubungkan kembali dan mengulangi otomatisasi.");
          setStatusText("Koneksi Terputus");
        }
      };
    } catch (e) {
      addLog("Koneksi backend tidak terdeteksi.", "error");
      failedStepRef.current = 999;
      setFailedStep(999);
      setErrorType("generic");
      setErrorText("Gagal mendirikan koneksi ke server backend NIB Assistant.");
      setStatusText("Koneksi Gagal");
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("draft_form_data");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setUserContact({
            nomorHp: parsed.nomorHp || "",
            email: parsed.email || ""
          });
        } catch (e) {
          console.error("Gagal membaca detail kontak draf:", e);
        }
      }
    }
    connectStream();
    return () => {
      clearElapsedTimer();
      if (streamRef.current) {
        streamRef.current.close();
      }
    };
  }, []);

  const isAutomationActive = () => {
    return failedStep === null &&
      statusText !== "Proses Otomatisasi Selesai!" &&
      !statusText.includes("Terputus") &&
      !statusText.includes("Gagal") &&
      !statusText.includes("koneksi") &&
      !statusText.includes("Gagal mendirikan koneksi");
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isAutomationActive()) {
        e.preventDefault();
        e.returnValue = "Proses otomatisasi sedang berjalan. Jika Anda menutup halaman ini, otomatisasi akan dibatalkan. Apakah Anda yakin ingin keluar?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [failedStep, statusText]);

  const handleBackNavigation = () => {
    if (isAutomationActive()) {
      const confirmLeave = window.confirm("Proses otomatisasi sedang berjalan. Jika Anda keluar, otomatisasi akan dibatalkan. Apakah Anda yakin ingin keluar?");
      if (!confirmLeave) return;
    }
    router.push("/review");
  };

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
      setOtp("");
      setOtpDigits(Array(6).fill(""));
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError("");
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setCurrentStep(1);
      setStatusText("Memulai ulang otomatisasi...");
      setLogs([]);
      setStepDurations({});
      setIsPromptingProduct(false);
      setIsPromptingParameter(false);
      setIsPromptingKbli2025(false);
      setSelectedKbli2025("");
      clearElapsedTimer();
      setElapsedSeconds(0);

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
        setShowNewPassword(false);
        setShowConfirmPassword(false);
      });
  };

  const formatThousand = (val: string) => {
    return val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const handleProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      setProductError("Jenis produk/jasa wajib diisi.");
      return;
    }
    const rawCapacity = productCapacity.replace(/\D/g, "");
    if (!rawCapacity.trim() || isNaN(Number(rawCapacity)) || Number(rawCapacity) <= 0) {
      setProductError("Kapasitas valid wajib diisi.");
      return;
    }
    if (!productUnit) {
      setProductError("Satuan wajib dipilih.");
      return;
    }

    setProductError("");
    setIsSubmittingProduct(true);
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";

    fetch(`${API_URL}/automation/product/${draftId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jenisProdukJasa: productName,
        cangkupanProduk: productCoverage,
        kapasitas: rawCapacity,
        satuan: productUnit,
      })
    })
      .then(() => {
        addLog("Rincian produk berhasil dikirim ke backend.", "success");
      })
      .catch((err) => console.log("Offline or connection error", err))
      .finally(() => {
        setIsSubmittingProduct(false);
        setIsPromptingProduct(false);
        setProductName("");
        setProductCapacity("");
        setProductUnit("");
      });
  };

  const handleParameterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParameter) {
      setParameterError("Parameter wajib dipilih.");
      return;
    }

    setParameterError("");
    setIsSubmittingParameter(true);
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";

    fetch(`${API_URL}/automation/parameter/${draftId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parameter: selectedParameter })
    })
      .then(() => {
        addLog("Parameter kewenangan berhasil dikirim ke backend.", "success");
      })
      .catch((err) => console.log("Offline or connection error", err))
      .finally(() => {
        setIsSubmittingParameter(false);
        setIsPromptingParameter(false);
        setSelectedParameter("");
      });
  };

  const handleSubmitKbli2025 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKbli2025) return;
    setIsSubmittingKbli2025(true);
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";
    fetch(`${API_URL}/automation/parameter/${draftId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parameter: selectedKbli2025 })
    })
      .then((res) => {
        if (res.ok) {
          setIsPromptingKbli2025(false);
          setStatusText("Mengirim konversi KBLI 2025...");
          addLog(`KBLI 2025 terpilih ${selectedKbli2025} berhasil dikirim ke server.`, "success");
        } else {
          addLog("Gagal mengirim data KBLI 2025 ke server.", "error");
        }
      })
      .catch((err) => {
        console.error(err);
        addLog("Kesalahan koneksi saat mengirim KBLI 2025.", "error");
      })
      .finally(() => {
        setIsSubmittingKbli2025(false);
      });
  };

  const handleManualRedirect = () => {
    if (isAutomationActive()) {
      const confirmStop = window.confirm("Apakah Anda yakin ingin menghentikan bot otomatisasi?");
      if (!confirmStop) return;
    }
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") || "DEMO123" : "DEMO123";
    router.push(`/result?state=failed&draftId=${draftId}`);
  };

  const isBelumAkun = () => akunOss === "belum";

  const stepLabels = isBelumAkun() ? [
    { label: "Inisialisasi Portal", icon: "cloud_sync", step: 1 },
    { label: "Validasi NIK & OTP", icon: "mail", step: 2 },
    { label: "Detail Profil & Registrasi", icon: "app_registration", step: 3 },
    { label: "Login & Otentikasi", icon: "login", step: 4 },
    { label: "Kelola Lokasi Usaha", icon: "location_on", step: 5 },
    { label: "Kelola Detail Usaha", icon: "business_center", step: 6 }
  ] : [
    { label: "Inisialisasi Portal", icon: "cloud_sync", step: 1 },
    { label: "Login & Otentikasi", icon: "login", step: 4 },
    { label: "Kelola Lokasi Usaha", icon: "location_on", step: 5 },
    { label: "Kelola Detail Usaha", icon: "business_center", step: 6 }
  ];

  const renderTechnicalLogs = () => (
    <LiveConsole logs={logs} />
  );

  return (
    <div className="flex-grow flex flex-col bg-background min-h-screen font-sans">
      
      {/* ── Top Flat AppBar ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 md:px-8 h-16 w-full bg-white border-b border-border-light">
        <div className="flex items-center gap-2">
          <button onClick={handleBackNavigation} className="p-2 hover:bg-surface-container transition-all rounded text-on-surface-variant flex items-center justify-center" aria-label="Kembali">
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
                {getFriendlyErrorMessage(errorText)}
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

                  <div className="space-y-4 relative transition-all duration-350">
                    {stepLabels.map(({ label, icon, step }, idx) => {
                      const isCompleted = currentStep > step;
                      const isCurrent = currentStep === step;
                      const isActionRequired = isCurrent && (isPromptingOtp || isPromptingPassword);
                      const isPromptActive = isPromptingOtp || isPromptingPassword;
                      const shouldHide = isPromptActive && !isCurrent;
                      const isLastStep = idx === stepLabels.length - 1;
                      
                      // For line rendering: find if next step is hidden
                      const nextStepLabel = stepLabels[idx + 1];
                      const nextShouldHide = isPromptActive && nextStepLabel && nextStepLabel.step !== currentStep;

                      return (
                        <div 
                          key={step} 
                          className={`relative flex items-start gap-4 transition-all duration-350 ease-in-out origin-top ${
                            shouldHide 
                              ? "max-h-0 opacity-0 overflow-hidden pointer-events-none -mt-4 py-0" 
                              : "max-h-24 opacity-100"
                          } ${
                            isActionRequired 
                              ? "bg-warning/5 border border-warning/10 p-3 rounded-lg shadow-sm -mx-3" 
                              : ""
                          }`}
                        >
                          {/* Dynamic Line Connector Segment */}
                          {!isLastStep && !shouldHide && !nextShouldHide && (
                            <div 
                              className={`absolute left-4 -translate-x-1/2 top-8 bottom-[-16px] w-0.5 transition-all duration-350 ${
                                currentStep >= stepLabels[idx + 1].step
                                  ? "bg-success"
                                  : isActionRequired
                                    ? "bg-warning/30 border-dashed border-l border-warning/50"
                                    : isCurrent
                                      ? "bg-primary-container"
                                      : "border-dashed border-l border-outline-variant bg-transparent w-0"
                              }`}
                            />
                          )}

                          {/* Dot node */}
                          <div className={`relative flex items-center justify-center w-8 h-8 rounded-full shrink-0 z-10 border transition-all duration-350 hover:scale-105 shadow-sm ${
                            isActionRequired
                              ? "bg-warning/10 text-warning border-warning/40"
                              : isCompleted 
                                ? "bg-success/10 text-success border-success/30" 
                                : isCurrent 
                                  ? "bg-gradient-to-tr from-primary-container to-primary text-white border-primary-container" 
                                  : "bg-[#ECEEF0] text-outline border-border-light"
                          }`}>
                            {isActionRequired && (
                              <>
                                <span className="absolute inset-0 rounded-full bg-warning/20 pulse-ring" />
                                <span className="absolute inset-0 rounded-full bg-warning/10 animate-ping" />
                              </>
                            )}
                            {isCurrent && !isActionRequired && (
                              <span className="absolute -inset-0.5 rounded-full border border-primary-container border-t-transparent animate-spin" />
                            )}
                            {isCompleted ? (
                              <span className="material-symbols-outlined text-sm font-bold">check</span>
                            ) : (
                              <span className="material-symbols-outlined text-sm">{isActionRequired ? "priority_high" : icon}</span>
                            )}
                          </div>

                          {/* Text labels */}
                          <div className="pt-1 flex-1">
                            <div className="flex items-center flex-wrap">
                              <h4 className={`text-xs font-bold tracking-wide transition-colors duration-350 ${
                                isActionRequired 
                                  ? "text-warning font-extrabold" 
                                  : isCompleted 
                                    ? "text-on-surface/50 font-medium" 
                                    : isCurrent 
                                      ? "text-primary-container font-extrabold" 
                                      : "text-outline"
                              }`}>
                                {label}
                              </h4>

                              {stepDurations[step] !== undefined && (
                                <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-[#ECEEF0] text-on-surface-variant font-mono border border-border-light">
                                  {stepDurations[step]}s
                                </span>
                              )}
                              
                              {isActionRequired && (
                                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[8px] font-extrabold bg-warning/15 text-warning uppercase tracking-wider animate-pulse border border-warning/20">
                                  Butuh OTP
                                </span>
                              )}
                              {isCurrent && !isActionRequired && (
                                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[8px] font-extrabold bg-primary-container/10 text-primary-container uppercase tracking-wider animate-pulse border border-primary-container/10">
                                  Proses
                                </span>
                              )}
                            </div>
                            
                            {isCurrent && (
                              <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 flex items-center gap-1.5 transition-colors duration-350 ${
                                isActionRequired ? "text-warning animate-pulse" : "text-on-surface-variant"
                              }`}>
                                {!isActionRequired && (
                                  <span className="w-2.5 h-2.5 border-2 border-primary-container border-t-transparent rounded-full animate-spin shrink-0" />
                                )}
                                {isActionRequired 
                                  ? (isPromptingOtp ? "⚠️ Masukkan OTP dari Email" : (isBelumAkun() ? "⚠️ Atur Kata Sandi Baru" : "⚠️ Masukkan Kata Sandi"))
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
                <div className="bg-white border border-border-light rounded-xl">
                  <div className="bg-[#ECEEF0] border-b border-border-light px-3 py-2 flex items-center gap-3 rounded-t-xl">
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
                          <span className="material-symbols-outlined text-2xl animate-bounce">mail</span>
                        </div>
                        <h3 className="text-sm font-extrabold uppercase tracking-wider text-on-surface">Masukkan Kode OTP</h3>
                        <p className="text-[11px] text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                          Masukkan kode OTP yang dikirimkan ke Email Anda{" "}
                          {userContact.email ? (
                            <strong>({maskEmail(userContact.email)})</strong>
                          ) : ""}{" "}
                          untuk memvalidasi pendaftaran di portal OSS.
                        </p>
                      </div>

                      <form onSubmit={handleOtpSubmit} className="space-y-4 max-w-xs mx-auto">
                        <div className="flex flex-col gap-2.5 text-left">
                          <div className="flex justify-between items-center text-[9px] font-extrabold uppercase tracking-wider text-on-surface-variant">
                            <span>Kode Verifikasi</span>
                            <span className={`flex items-center gap-1 font-mono font-bold ${timeLeft < 25 ? "text-error animate-pulse" : "text-primary-container"}`}>
                              <span className="material-symbols-outlined text-[10px]">schedule</span>
                              {timeLeft > 0 ? formatTime(timeLeft) : "Waktu Habis"}
                            </span>
                          </div>
                          
                          <div className="flex gap-2 justify-center py-1">
                            {otpDigits.map((digit, idx) => (
                              <input
                                key={idx}
                                ref={(el) => { otpRefs.current[idx] = el!; }}
                                type="text"
                                maxLength={1}
                                value={digit}
                                onChange={(e) => handleOtpDigitChange(e.target.value, idx)}
                                onKeyDown={(e) => handleOtpKeyDown(e, idx)}
                                onPaste={handleOtpPaste}
                                className="w-10 h-12 rounded border border-border-light text-center font-bold text-lg focus:border-primary-container focus:outline-none bg-white text-on-surface shadow-sm"
                                disabled={timeLeft === 0}
                                autoFocus={idx === 0}
                                required
                              />
                            ))}
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmittingOtp || otp.length < 6 || timeLeft === 0}
                          className="w-full bg-primary-container hover:bg-primary text-white font-bold py-2.5 px-6 rounded text-xs uppercase tracking-wider min-h-[40px] flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                        >
                          {isSubmittingOtp ? "Memverifikasi..." : "Verifikasi & Lanjutkan"}
                        </button>

                        {timeLeft === 0 && (
                          <button
                            type="button"
                            onClick={handleResendOtp}
                            className="w-full border border-primary-container text-primary-container font-extrabold py-2.5 px-4 rounded text-xs uppercase tracking-wider hover:bg-primary-container/5 transition-all flex items-center justify-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-xs">refresh</span>
                            Kirim Ulang OTP
                          </button>
                        )}

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
                            <label className="text-[9px] font-bold text-on-surface-variant uppercase">
                              {isBelumAkun() ? "Kata Sandi Baru" : "Kata Sandi"}
                            </label>
                            <div className="relative w-full">
                              <input
                                type={showNewPassword ? "text" : "password"}
                                placeholder={isBelumAkun() ? "Minimal 8 karakter" : "Masukkan kata sandi Anda"}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full min-h-[40px] pl-3.5 pr-10 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none"
                                required
                              />
                              <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface flex items-center justify-center focus:outline-none"
                              >
                                <span className="material-symbols-outlined text-lg select-none">
                                  {showNewPassword ? "visibility_off" : "visibility"}
                                </span>
                              </button>
                            </div>
                          </div>

                          {isBelumAkun() && (
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-on-surface-variant uppercase">Konfirmasi Kata Sandi</label>
                              <div className="relative w-full">
                                <input
                                  type={showConfirmPassword ? "text" : "password"}
                                  placeholder="Ulangi kata sandi"
                                  value={confirmPassword}
                                  onChange={(e) => setConfirmPassword(e.target.value)}
                                  className="w-full min-h-[40px] pl-3.5 pr-10 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none"
                                  required
                                />
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface flex items-center justify-center focus:outline-none"
                                >
                                  <span className="material-symbols-outlined text-lg select-none">
                                    {showConfirmPassword ? "visibility_off" : "visibility"}
                                  </span>
                                </button>
                              </div>
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
                  ) : isPromptingProduct ? (
                    <div className="p-8 bg-white space-y-6 animate-fadeIn text-left">
                      <div className="text-center space-y-2">
                        <div className="w-12 h-12 rounded bg-primary-container/10 text-primary-container flex items-center justify-center mx-auto animate-bounce">
                          <span className="material-symbols-outlined text-2xl">inventory_2</span>
                        </div>
                        <h3 className="text-sm font-extrabold uppercase tracking-wider text-on-surface text-center">Lengkapi Rincian Produk/Jasa</h3>
                        <p className="text-[11px] text-on-surface-variant max-w-sm mx-auto leading-relaxed text-center">
                          KBLI terpilih memerlukan detail rincian produk atau jasa agar pendaftaran dapat diselesaikan secara otomatis.
                        </p>
                      </div>

                      <form onSubmit={handleProductSubmit} className="space-y-4 max-w-sm mx-auto">
                        {/* 1. Nama/Jenis Produk */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold text-on-surface-variant uppercase">Jenis Produk / Jasa</label>
                          <input
                            type="text"
                            placeholder="Contoh: Furnitur Kayu, Pakaian Jadi, dll"
                            value={productName}
                            onChange={(e) => setProductName(e.target.value)}
                            className="w-full min-h-[40px] px-3.5 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none text-on-surface"
                            required
                          />
                        </div>

                        {/* 2. Cangkupan Produk */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold text-on-surface-variant uppercase">Cangkupan Produk</label>
                          <select
                            value={productCoverage}
                            onChange={(e) => setProductCoverage(e.target.value)}
                            className="w-full min-h-[40px] px-3.5 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none text-on-surface"
                          >
                            <option value="Tidak Mengajukan Fasilitas">Tidak Mengajukan Fasilitas</option>
                            <option value="Semua cakupan produk yang termasuk dalam KBLI ini">
                              Semua cakupan produk yang termasuk dalam KBLI ini
                            </option>
                          </select>
                        </div>

                        {/* 3. Kapasitas & Satuan (Columns) */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-bold text-on-surface-variant uppercase">Kapasitas</label>
                            <input
                              type="text"
                              placeholder="100"
                              value={productCapacity}
                              onChange={(e) => setProductCapacity(formatThousand(e.target.value))}
                              className="w-full min-h-[40px] px-3.5 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none text-on-surface"
                              required
                            />
                          </div>
                           <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-bold text-on-surface-variant uppercase">Satuan</label>
                            <SearchableSelect
                              options={Array.from(new Set(allowedUnitsList)).map((unit) => ({
                                value: unit,
                                label: unit,
                              }))}
                              value={productUnit}
                              onChange={setProductUnit}
                              placeholder="Pilih Satuan"
                            />
                          </div>
                        </div>

                        {productError && (
                          <p className="text-[9px] text-error font-semibold leading-normal">{productError}</p>
                        )}

                        <button
                          type="submit"
                          disabled={isSubmittingProduct}
                          className="w-full bg-primary-container hover:bg-primary text-white font-bold py-2.5 px-6 rounded text-xs uppercase tracking-wider min-h-[40px] flex items-center justify-center gap-2 shadow-sm transition-all"
                        >
                          {isSubmittingProduct ? "Mengirim..." : "Kirim & Lanjutkan"}
                        </button>
                      </form>
                    </div>
                  ) : isPromptingKbli2025 ? (
                    <div className="p-8 bg-white space-y-6 animate-fadeIn text-left">
                      <div className="text-center space-y-2">
                        <div className="w-12 h-12 rounded bg-primary-container/10 text-primary-container flex items-center justify-center mx-auto animate-bounce">
                          <span className="material-symbols-outlined text-2xl animate-spin-slow text-[#1A4384]">category</span>
                        </div>
                        <h3 className="text-sm font-extrabold uppercase tracking-wider text-on-surface text-center">Konversi KBLI 2025</h3>
                        <p className="text-[11px] text-on-surface-variant max-w-sm mx-auto leading-relaxed text-center">
                          KBLI 2020 yang Anda pilih memerlukan konversi ke KBLI 2025 pada portal OSS. Silakan pilih opsi konversi yang sesuai di bawah ini.
                        </p>
                      </div>

                      <form onSubmit={handleSubmitKbli2025} className="space-y-4 max-w-sm mx-auto">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold text-on-surface-variant uppercase">Pilih KBLI 2025</label>
                          <SearchableSelect
                            options={kbli2025Options.map((opt) => ({
                              value: opt.code,
                              label: `${opt.code} - ${opt.title}`,
                            }))}
                            value={selectedKbli2025}
                            onChange={setSelectedKbli2025}
                            placeholder="Pilih KBLI 2025"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmittingKbli2025 || !selectedKbli2025}
                          className="w-full bg-primary-container hover:bg-primary text-white font-bold py-2.5 px-6 rounded text-xs uppercase tracking-wider min-h-[40px] flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                        >
                          {isSubmittingKbli2025 ? "Mengirim..." : "Kirim & Lanjutkan"}
                        </button>
                      </form>
                    </div>
                  ) : isPromptingParameter ? (
                    <div className="p-6 bg-white space-y-5 animate-fadeIn text-left">
                      <div className="text-center space-y-1">
                        <div className="w-10 h-10 rounded bg-primary-container/10 text-primary-container flex items-center justify-center mx-auto animate-bounce">
                          <span className="material-symbols-outlined text-xl">gavel</span>
                        </div>
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-on-surface text-center">Hasil Validasi Risiko</h3>
                        <p className="text-[10px] text-on-surface-variant max-w-xs mx-auto leading-relaxed text-center">
                          Hasil analisis risiko usaha berdasarkan KBLI dan parameter kegiatan usaha.
                        </p>
                      </div>

                      {/* Risk Validation Cards */}
                      {riskData && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="p-2.5 rounded border border-emerald-500 bg-emerald-50/20 text-center">
                              <span className="material-symbols-outlined text-emerald-600 text-sm block mb-1">speed</span>
                              <div className="text-[8px] font-bold text-on-surface-variant uppercase leading-none">Tingkat Risiko</div>
                              <div className="text-[11px] font-extrabold text-emerald-800 mt-1">{riskData.tingkatRisiko}</div>
                            </div>
                            <div className="p-2.5 rounded border border-emerald-500 bg-emerald-50/20 text-center">
                              <span className="material-symbols-outlined text-emerald-600 text-sm block mb-1">scale</span>
                              <div className="text-[8px] font-bold text-on-surface-variant uppercase leading-none">Skala Usaha</div>
                              <div className="text-[11px] font-extrabold text-emerald-800 mt-1">{riskData.skalaUsaha}</div>
                            </div>
                            <div className="p-2.5 rounded border border-emerald-500 bg-emerald-50/20 text-center">
                              <span className="material-symbols-outlined text-emerald-600 text-sm block mb-1">description</span>
                              <div className="text-[8px] font-bold text-on-surface-variant uppercase leading-none">Jenis Perizinan</div>
                              <div className="text-[11px] font-extrabold text-emerald-800 mt-1">{riskData.jenisPerizinan}</div>
                            </div>
                          </div>

                          {/* Perizinan Tunggal Alert Box */}
                          {riskData.perizinanTunggal && (
                            <div className="p-3 rounded border border-sky-200 bg-sky-50/50 flex gap-2.5 items-start">
                              <span className="material-symbols-outlined text-sky-600 text-base mt-0.5">info</span>
                              <div className="space-y-0.5">
                                <div className="text-[10px] font-extrabold text-sky-950 leading-tight">Kegiatan Usaha Memerlukan Perizinan Tunggal</div>
                                <div className="text-[9px] text-sky-700 leading-normal">
                                  Berdasarkan Produk/Jasa dan Skala Usaha, kegiatan usaha ini perlu memproses Perizinan Tunggal setelah NIB Terbit.
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <form onSubmit={handleParameterSubmit} className="space-y-4 max-w-sm mx-auto">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold text-on-surface-variant uppercase">Parameter</label>
                          <SearchableSelect
                            options={parameterOptions.map((opt) => ({
                              value: opt,
                              label: opt,
                            }))}
                            value={selectedParameter}
                            onChange={setSelectedParameter}
                            placeholder="Pilih Parameter Kewenangan"
                          />
                        </div>

                        {parameterError && (
                          <p className="text-[9px] text-error font-semibold leading-normal">{parameterError}</p>
                        )}

                        <button
                          type="submit"
                          disabled={isSubmittingParameter}
                          className="w-full bg-primary-container hover:bg-primary text-white font-bold py-2.5 px-6 rounded text-xs uppercase tracking-wider min-h-[40px] flex items-center justify-center gap-2 shadow-sm transition-all"
                        >
                          {isSubmittingParameter ? "Mengirim..." : "Kirim & Lanjutkan"}
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-white space-y-5 flex flex-col items-center justify-center animate-fadeIn relative">
                      {/* Live Timer Badge */}
                      <div className="absolute top-4 right-4 bg-emerald-50 text-emerald-700 border border-emerald-200/50 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 shadow-sm">
                        <span className="material-symbols-outlined text-xs animate-pulse">schedule</span>
                        {formatTime(elapsedSeconds)}
                      </div>

                      {/* Animated Activity Icon */}
                      <div className="w-16 h-16 bg-primary-container/10 text-primary-container rounded-full flex items-center justify-center relative">
                        {activeActivity === "typing" && (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="material-symbols-outlined text-3xl">keyboard</span>
                            <div className="flex gap-0.5 items-center mt-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-bounce [animation-delay:-0.3s]" />
                              <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-bounce [animation-delay:-0.15s]" />
                              <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-bounce" />
                            </div>
                          </div>
                        )}
                        {activeActivity === "clicking" && (
                          <div className="relative flex items-center justify-center">
                            <span className="material-symbols-outlined text-3xl z-10">touch_app</span>
                            <span className="absolute w-12 h-12 rounded-full bg-primary-container/30 animate-ping" />
                          </div>
                        )}
                        {activeActivity === "waiting" && (
                          <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
                        )}
                        {activeActivity === "idle" && (
                          <span className="material-symbols-outlined text-3xl animate-pulse">smart_toy</span>
                        )}
                      </div>

                      {/* Status Text Block */}
                      <div className="space-y-1.5 max-w-sm">
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-on-surface">
                          Proses Latar Belakang Aktif
                        </h4>
                        
                        {/* Dynamic Active Action Sub-status */}
                        <div className="bg-surface-container-low border border-border-light px-4 py-2.5 rounded-lg text-[11px] font-bold text-primary-container leading-relaxed flex items-start text-left gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0 mt-1.5" />
                          <span className="break-words">{activeSubStatus}</span>
                        </div>

                        <p className="text-[10px] text-on-surface-variant/80 font-medium">
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
