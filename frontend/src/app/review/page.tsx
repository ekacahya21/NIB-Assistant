"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSessionId } from "../../utils/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const getTimestampSeconds = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
};

export default function ReviewPage() {
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    namaPemilik: "",
    nik: "",
    tanggalLahir: "",
    jenisKelamin: "Laki-laki",
    nomorHp: "",
    email: "",
    alamatKtp: "",
    alamatKtpRaw: "",
    provinsiKtp: "",
    kotaKabupatenKtp: "",
    kecamatanKtp: "",
    kelurahanKtp: "",
    kodePosKtp: "",
    isAddressSame: false,
    alamatUsaha: "",
    alamatUsahaRaw: "",
    provinsi: "",
    kotaKabupaten: "",
    kecamatan: "",
    kelurahan: "",
    kodePos: "",
    latitude: "-6.2088",
    longitude: "106.8456",
    fotoLokasi: "",
    luasTanah: "",
    jumlahPekerjaLakiLaki: "0",
    jumlahPekerjaPerempuan: "0",
    jumlahPekerja: "0",
    modalUsaha: "",
    namaUsaha: "",
    ceritaUsaha: "",
    sumberPembiayaan: "modal_sendiri",
    omzetTahunan: "0",
    modalKerja: "0",
    sudahBerjalan: "belum",
    tanggalMulaiUsaha: "",
    tanggalMulaiOperasional: "",
    jenisProdukJasa: "",
    cangkupanProduk: "",
    kapasitas: "0",
    satuan: "",
    ossPassword: ""
  });

  const [downloadingNps, setDownloadingNps] = useState(false);
  const [downloadingPhoto, setDownloadingPhoto] = useState(false);

  const downloadNpsPdf = async () => {
    setDownloadingNps(true);
    try {
      const res = await fetch(`${API_URL}/documents/generate-nps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          alamatUsaha: formData.alamatUsahaRaw || formData.alamatUsaha,
          latitude: formData.latitude || "-6.2088",
          longitude: formData.longitude || "106.8456",
          luasTanah: formData.luasTanah || "0"
        })
      });
      if (!res.ok) throw new Error("Gagal mengunduh berkas PDF");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dokumen_administrasi_${getTimestampSeconds()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert("Gagal mengunduh Dokumen Administrasi. Pastikan server backend Anda aktif.");
    } finally {
      setDownloadingNps(false);
    }
  };

  const downloadPhotoPdf = async () => {
    if (!formData.fotoLokasi) {
      alert("Foto lokasi tidak ditemukan.");
      return;
    }
    setDownloadingPhoto(true);
    try {
      const res = await fetch(`${API_URL}/documents/convert-photo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fotoLokasi: formData.fotoLokasi
        })
      });
      if (!res.ok) throw new Error("Gagal mengunduh berkas PDF");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foto_lokasi_${getTimestampSeconds()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert("Gagal mengunduh PDF Foto Lokasi. Pastikan server backend Anda aktif.");
    } finally {
      setDownloadingPhoto(false);
    }
  };

  const [selectedKbli, setSelectedKbli] = useState<any>({
    code: "56103",
    title: "Kedai Makanan",
    description: "Usaha jasa pangan yang bertempat di sebagian atau seluruh bangunan tetap...",
    version: "2020"
  });

  // Consent Checklist state
  const [consent1, setConsent1] = useState(false);
  const [consent2, setConsent2] = useState(false);

  const isAllConsentGiven = consent1 && consent2;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedData = sessionStorage.getItem("draft_form_data");
      const storedKbli = sessionStorage.getItem("selected_kbli");

      if (storedData) {
        try {
          const parsedData = JSON.parse(storedData);
          const fullAddress = `${parsedData.alamatUsaha || ""}${
            parsedData.kelurahan ? `, Kel. ${parsedData.kelurahan}` : ""
          }${parsedData.kecamatan ? `, Kec. ${parsedData.kecamatan}` : ""}${
            parsedData.kotaKabupaten ? `, ${parsedData.kotaKabupaten}` : ""
          }${parsedData.provinsi ? `, ${parsedData.provinsi}` : ""}${
            parsedData.kodePos ? ` ${parsedData.kodePos}` : ""
          }`;

          const fullKtpAddress = `${parsedData.alamatKtp || ""}${
            parsedData.kelurahanKtp ? `, Kel. ${parsedData.kelurahanKtp}` : ""
          }${parsedData.kecamatanKtp ? `, Kec. ${parsedData.kecamatanKtp}` : ""}${
            parsedData.kotaKabupatenKtp ? `, ${parsedData.kotaKabupatenKtp}` : ""
          }${parsedData.provinsiKtp ? `, ${parsedData.provinsiKtp}` : ""}${
            parsedData.kodePosKtp ? ` ${parsedData.kodePosKtp}` : ""
          }`;

          setFormData({
            ...parsedData,
            alamatUsahaRaw: parsedData.alamatUsaha || "",
            alamatUsaha: fullAddress,
            alamatKtpRaw: parsedData.alamatKtp || "",
            alamatKtp: fullKtpAddress
          });
        } catch (e) {
          console.error("Error parsing form data", e);
        }
      }

      const storedAkunOss = sessionStorage.getItem("akun_oss") || "belum";
      setAkunOss(storedAkunOss);

      if (storedKbli) {
        try {
          setSelectedKbli(JSON.parse(storedKbli));
        } catch (e) {
          console.error("Error parsing KBLI data", e);
        }
      }
    }
  }, []);

  // Account mode state
  const [akunOss, setAkunOss] = useState<string>("belum");

  // Step 2 Verification States (Background Registration tracking)
  const [isVerifyingStep2, setIsVerifyingStep2] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [verifyingStatusText, setVerifyingStatusText] = useState("Menghubungkan...");
  const [verifyingLogs, setVerifyingLogs] = useState<{ text: string; type: string }[]>([]);
  const [isPromptingOtp, setIsPromptingOtp] = useState(false);
  const [isPromptingPassword, setIsPromptingPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(""));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmittingOtp, setIsSubmittingOtp] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [registrationCompleted, setRegistrationCompleted] = useState(false);
  const [isWaitingForRegistration, setIsWaitingForRegistration] = useState(false);
  const [verifyingErrorText, setVerifyingErrorText] = useState("");
  const [verifyingStep, setVerifyingStep] = useState(1);
  const [verifyingTimeLeft, setVerifyingTimeLeft] = useState(120);

  const streamRef = useRef<EventSource | null>(null);
  const verifyTimerRef = useRef<any>(null);
  const otpRefs = useRef<HTMLInputElement[]>([]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const regDone = sessionStorage.getItem("registration_completed") === "true";
      const isBelum = (sessionStorage.getItem("akun_oss") || "belum") === "belum";
      const draftId = sessionStorage.getItem("draft_id");
      setRegistrationCompleted(regDone);

      if (isBelum && !regDone && draftId) {
        // The registration is still running in the background! Re-connect to stream.
        setIsVerifyingStep2(true);
        setIsMinimized(true);
        startVerificationStream(draftId);
      }
    }
    return () => {
      if (streamRef.current) streamRef.current.close();
      if (verifyTimerRef.current) clearInterval(verifyTimerRef.current);
    };
  }, []);

  const startVerificationStream = (draftId: string) => {
    setVerifyingErrorText("");
    setIsPromptingOtp(false);
    setIsPromptingPassword(false);
    setVerifyingLogs([]);
    setVerifyingStatusText("Menghubungkan ke backend local...");

    try {
      const eventSource = new EventSource(`${API_URL}/automation/stream/${draftId}?phase=registration&akunOss=belum&sessionId=${getSessionId()}`);
      streamRef.current = eventSource;

      setVerifyingTimeLeft(120);
      if (verifyTimerRef.current) clearInterval(verifyTimerRef.current);
      verifyTimerRef.current = setInterval(() => {
        setVerifyingTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload) {
            setVerifyingLogs((prev) => [...prev, { text: payload.text, type: payload.status }]);
            if (payload.status === "error") {
              setVerifyingErrorText(payload.text);
              setVerifyingStatusText("Registrasi Gagal");
              setIsPromptingOtp(false);
              setIsPromptingPassword(false);
              setIsWaitingForRegistration(false);
              setShowVerificationModal(true);
              setIsMinimized(false);
              eventSource.close();
              if (verifyTimerRef.current) clearInterval(verifyTimerRef.current);
              if (draftId) {
                fetch(`${API_URL}/automation/cancel/${draftId}`, { method: "POST" })
                  .catch((err) => console.error("Gagal membatalkan otomatisasi:", err));
              }
            } else {
              setVerifyingStep(payload.step);
              if (payload.step === 1) setVerifyingStatusText("Membuka Portal OSS");
              if (payload.step === 2) {
                if (payload.text.includes("OTP") && payload.status === "warn") {
                  setVerifyingStatusText("Menunggu Anda memasukkan OTP...");
                  setIsPromptingOtp(true);
                  setShowVerificationModal(true);
                  setIsMinimized(false);
                } else if (payload.text.includes("Silakan masukkan kata sandi")) {
                  setVerifyingStatusText("Menunggu Anda mengatur Kata Sandi...");
                  setIsPromptingPassword(true);
                  setIsPromptingOtp(false);
                  setShowVerificationModal(true);
                  setIsMinimized(false);
                } else if (payload.text.includes("OTP diterima") || payload.text.includes("Verifikasi berhasil") || payload.text.includes("SUKSES")) {
                  setIsPromptingOtp(false);
                } else {
                  setVerifyingStatusText("Memproses validasi NIK & Email...");
                }
              }
              if (payload.step === 3) {
                setVerifyingStatusText("Mengisi detail akun & menyelesaikan pendaftaran...");
                setIsPromptingOtp(false);
                setIsPromptingPassword(false);
              }
              if (payload.step === 7 && payload.status === "success") {
                eventSource.close();
                if (verifyTimerRef.current) clearInterval(verifyTimerRef.current);
                setVerifyingStatusText("Pendaftaran Berhasil!");
                setRegistrationCompleted(true);
                sessionStorage.setItem("registration_completed", "true");
                sessionStorage.setItem("akun_oss", "sudah");
                
                // Show floating success toast
                setShowSuccessToast(true);
                setTimeout(() => setShowSuccessToast(false), 5000);

                setTimeout(() => {
                  setIsVerifyingStep2(false);
                  setShowVerificationModal(false);
                  setIsMinimized(false);
                }, 1500);
              }
            }
          }
        } catch (e) {
          console.error("Error parsing message", e);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        if (verifyTimerRef.current) clearInterval(verifyTimerRef.current);
        setVerifyingErrorText("Koneksi backend terputus atau tidak terdeteksi. Silakan coba lagi.");
        setVerifyingStatusText("Koneksi Terputus");
        setIsWaitingForRegistration(false);
        setShowVerificationModal(true);
        setIsMinimized(false);
        if (draftId) {
          fetch(`${API_URL}/automation/cancel/${draftId}`, { method: "POST" })
            .catch((err) => console.error("Gagal membatalkan otomatisasi:", err));
        }
      };
    } catch (e) {
      setVerifyingErrorText("Gagal mendirikan koneksi.");
      setVerifyingStatusText("Koneksi Gagal");
    }
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

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6 || isSubmittingOtp) return;

    setIsSubmittingOtp(true);
    const draftId = sessionStorage.getItem("draft_id") || "DEMO123";

    try {
      const res = await fetch(`${API_URL}/automation/otp/${draftId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp })
      });
      if (res.ok) {
        setVerifyingLogs((prev) => [...prev, { text: `Mengirimkan OTP: ${otp} ke backend...`, type: "success" }]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingOtp(false);
      setIsPromptingOtp(false);
      setOtp("");
      setOtpDigits(Array(6).fill(""));
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim() || isSubmittingPassword) return;

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
    const draftId = sessionStorage.getItem("draft_id") || "DEMO123";

    try {
      const res = await fetch(`${API_URL}/automation/password/${draftId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword })
      });
      if (res.ok) {
        setVerifyingLogs((prev) => [...prev, { text: "Mengirimkan kata sandi ke backend...", type: "success" }]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingPassword(false);
      setIsPromptingPassword(false);
    }
  };

  const handleCancelWaiting = async () => {
    setIsWaitingForRegistration(false);
    const draftId = typeof window !== "undefined" ? sessionStorage.getItem("draft_id") : null;
    if (draftId) {
      try {
        await fetch(`${API_URL}/automation/cancel/${draftId}`, { method: "POST" });
      } catch (err) {
        console.error("Gagal membatalkan otomatisasi:", err);
      }
    }
    if (streamRef.current) streamRef.current.close();
    if (verifyTimerRef.current) clearInterval(verifyTimerRef.current);
    setIsVerifyingStep2(false);
    setShowVerificationModal(false);
    setIsMinimized(false);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleProceedToAutomation = async () => {
    if (!isAllConsentGiven || isSubmitting) return;

    if (akunOss !== "sudah" && isVerifyingStep2 && !registrationCompleted) {
      setIsWaitingForRegistration(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        namaPemilik: formData.namaPemilik,
        nik: formData.nik,
        tanggalLahir: formData.tanggalLahir,
        jenisKelamin: formData.jenisKelamin,
        nomorHp: formData.nomorHp,
        email: formData.email,
        alamatUsaha: formData.alamatUsahaRaw || formData.alamatUsaha,
        alamatKtp: formData.alamatKtpRaw || formData.alamatKtp,
        provinsiKtp: formData.provinsiKtp,
        kotaKabupatenKtp: formData.kotaKabupatenKtp,
        kecamatanKtp: formData.kecamatanKtp,
        kelurahanKtp: formData.kelurahanKtp,
        kodePosKtp: formData.kodePosKtp,
        provinsi: formData.provinsi,
        kotaKabupaten: formData.kotaKabupaten,
        kecamatan: formData.kecamatan,
        kelurahan: formData.kelurahan,
        kodePos: formData.kodePos,
        latitude: formData.latitude,
        longitude: formData.longitude,
        namaUsaha: formData.namaUsaha,
        ceritaUsaha: formData.ceritaUsaha,
        modalUsaha: formData.modalUsaha,
        jumlahPekerja: formData.jumlahPekerja,
        jumlahPekerjaLakiLaki: formData.jumlahPekerjaLakiLaki || "0",
        jumlahPekerjaPerempuan: formData.jumlahPekerjaPerempuan || "0",
        kbliCode: selectedKbli.code,
        kbliTitle: selectedKbli.title,
        luasTanah: formData.luasTanah || "0",
        fotoLokasi: formData.fotoLokasi || "",
        sumberPembiayaan: formData.sumberPembiayaan,
        omzetTahunan: formData.omzetTahunan,
        modalKerja: formData.modalKerja,
        sudahBerjalan: formData.sudahBerjalan,
        tanggalMulaiUsaha: formData.tanggalMulaiUsaha,
        tanggalMulaiOperasional: formData.tanggalMulaiOperasional,
        jenisProdukJasa: formData.jenisProdukJasa,
        cangkupanProduk: formData.cangkupanProduk,
        kapasitas: formData.kapasitas,
        satuan: formData.satuan,
        ossPassword: formData.ossPassword || (typeof window !== "undefined" ? sessionStorage.getItem("oss_password") || "" : ""),
        registrationCompleted: typeof window !== "undefined" ? (sessionStorage.getItem("akun_oss") === "sudah" || sessionStorage.getItem("registration_completed") === "true") : false,
        sessionId: getSessionId(),
      };

      const res = await fetch(`${API_URL}/drafts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Gagal menyimpan draf di server.");
      const savedDraft = await res.json();
      if (savedDraft && savedDraft.id) {
        sessionStorage.setItem("draft_id", savedDraft.id);
      }

      sessionStorage.setItem("automation_step", "start");
      router.push("/automation");
    } catch (e) {
      console.error(e);
      alert("Gagal melakukan sinkronisasi draf dengan server backend.");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (registrationCompleted && isWaitingForRegistration) {
      const timer = setTimeout(() => {
        setIsWaitingForRegistration(false);
        handleProceedToAutomation();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [registrationCompleted, isWaitingForRegistration]);

  const handleEditSection = (stepNum: number) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("edit_redirect", "review");
      sessionStorage.setItem("wizard_step", stepNum.toString());
    }
    router.push("/wizard");
  };

  return (
    <div className="flex-grow flex flex-col bg-background min-h-screen font-sans">
      
      {/* ── Top AppBar ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 md:px-8 h-16 w-full bg-white border-b border-border-light">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              if (typeof window !== "undefined") {
                sessionStorage.setItem("wizard_step", "4");
              }
              router.push("/wizard");
            }} 
            className="p-2 hover:bg-surface-container transition-all rounded text-on-surface-variant flex items-center justify-center" 
            aria-label="Kembali"
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <div className="flex flex-col">
            <span className="text-sm font-extrabold text-primary-container leading-none uppercase">NIB Assistant</span>
            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mt-0.5">Konfirmasi Akhir</span>
          </div>
        </div>
        <button onClick={() => router.push("/")} className="p-2 hover:bg-surface-container transition-all rounded text-on-surface-variant flex items-center justify-center" aria-label="Bantuan">
          <span className="material-symbols-outlined text-lg">help</span>
        </button>
      </header>

      {/* ── Main Container (max 640px) ── */}
      <main className="flex-grow flex justify-center w-full px-4 py-8 pb-32 md:pb-12">
        <div className="w-full max-w-[640px] flex flex-col gap-6">
          
          {/* Page Title */}
          <div>
            <h1 className="text-lg font-extrabold uppercase tracking-wide text-on-surface">Review & Persetujuan</h1>
            <p className="text-xs text-on-surface-variant leading-relaxed mt-1">
              Periksa kembali draf data izin usaha Anda. Semua informasi akan diproses secara otomatis ke sistem OSS resmi BKPM RI.
            </p>
          </div>

          {/* Stepper Progress (Finished Wizard) */}
          <div className="w-full bg-white border border-border-light rounded-lg p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              <span>Status Pengisian</span>
              <span className="text-success font-extrabold flex items-center gap-0.5">
                <span className="material-symbols-outlined text-xs">check_circle</span> Form Lengkap
              </span>
            </div>
            <div className="w-full h-1 bg-success rounded-full" />
          </div>

          {/* 5 Summary Cards */}
          <div className="space-y-4">
            
            {/* Card 1: Identitas Pemilik / Akun OSS */}
            <div className="bento-card relative">
              <div className="flex justify-between items-center border-b border-border-light pb-2 mb-3">
                <span className="text-xs font-extrabold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary-container text-sm">
                    {akunOss === "sudah" ? "account_circle" : "person"}
                  </span>
                  {akunOss === "sudah" ? "KREDENSIAL AKUN OSS" : "IDENTITAS PEMILIK"}
                </span>
                <button 
                  onClick={() => handleEditSection(1)} 
                  className="text-primary-container font-extrabold text-[10px] uppercase tracking-wider hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xs">edit</span> Ubah
                </button>
              </div>
              {akunOss === "sudah" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Email / Username OSS</span>
                    <span className="block font-bold text-on-surface mt-0.5">{formData.email}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Kata Sandi OSS</span>
                    <span className="block font-mono font-bold text-on-surface mt-0.5">••••••••</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Nama Lengkap</span>
                    <span className="block font-bold text-on-surface mt-0.5">{formData.namaPemilik}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">NIK (16-Digit)</span>
                    <span className="block font-mono font-bold text-on-surface mt-0.5">{formData.nik}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Tanggal Lahir</span>
                    <span className="block font-semibold text-on-surface mt-0.5">{formData.tanggalLahir}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Jenis Kelamin</span>
                    <span className="block font-semibold text-on-surface mt-0.5">{formData.jenisKelamin}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Nomor WhatsApp</span>
                    <span className="block font-semibold text-on-surface mt-0.5">{formData.nomorHp}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Alamat Email</span>
                    <span className="block font-semibold text-on-surface mt-0.5">{formData.email}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Card 2: Alamat KTP (Only for new registrations) */}
            {akunOss !== "sudah" && (
              <div className="bento-card">
                <div className="flex justify-between items-center border-b border-border-light pb-2 mb-3">
                  <span className="text-xs font-extrabold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary-container text-sm">badge</span>
                    ALAMAT DOMISILI KTP
                  </span>
                  <button 
                    onClick={() => handleEditSection(2)} 
                    className="text-primary-container font-extrabold text-[10px] uppercase tracking-wider hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-xs">edit</span> Ubah
                  </button>
                </div>
                <div className="text-xs">
                  <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Alamat Sesuai KTP</span>
                  <p className="font-semibold text-on-surface leading-relaxed mt-0.5">{formData.alamatKtp}</p>
                </div>
              </div>
            )}

            {/* Card 3: Alamat Usaha & Peta Koordinat */}
            <div className="bento-card">
              <div className="flex justify-between items-center border-b border-border-light pb-2 mb-3">
                <span className="text-xs font-extrabold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary-container text-sm">store</span>
                  LOKASI USAHA & KOORDINAT
                </span>
                <button 
                  onClick={() => handleEditSection(2)} 
                  className="text-primary-container font-extrabold text-[10px] uppercase tracking-wider hover:underline flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-xs">edit</span> Ubah
                </button>
              </div>
              <div className="flex flex-col md:flex-row gap-4 text-xs">
                <div className="flex-1 space-y-3">
                  <div>
                    <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Alamat Tempat Usaha</span>
                    <p className="font-semibold text-on-surface leading-relaxed mt-0.5">{formData.alamatUsaha}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Luas Lahan</span>
                      <span className="block font-bold text-on-surface mt-0.5">{formData.luasTanah || "0"} m²</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Koordinat</span>
                      <span className="block font-mono font-bold text-on-surface mt-0.5">{formData.latitude}, {formData.longitude}</span>
                    </div>
                  </div>
                </div>
                {/* Micro static osm frame preview */}
                <div className="w-full md:w-40 h-24 bg-surface-container rounded overflow-hidden border border-border-light relative shrink-0">
                  <iframe 
                    title="Map" 
                    width="100%" 
                    height="100%" 
                    frameBorder="0" 
                    scrolling="no" 
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(formData.longitude || "106.8456") - 0.0015}%2C${parseFloat(formData.latitude || "-6.2088") - 0.0015}%2C${parseFloat(formData.longitude || "106.8456") + 0.0015}%2C${parseFloat(formData.latitude || "-6.2088") + 0.0015}&layer=mapnik&marker=${formData.latitude || "-6.2088"}%2C${formData.longitude || "106.8456"}`} 
                  />
                </div>
              </div>
            </div>

            {/* Card 4: Profil/Cerita Usaha */}
            <div className="bento-card">
              <div className="flex justify-between items-center border-b border-border-light pb-2 mb-3">
                <span className="text-xs font-extrabold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary-container text-sm">storefront</span>
                  PROFIL USAHA & OPERASIONAL
                </span>
                <button 
                  onClick={() => handleEditSection(4)} 
                  className="text-primary-container font-extrabold text-[10px] uppercase tracking-wider hover:underline flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-xs">edit</span> Ubah
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Nama Usaha / Toko</span>
                  <span className="block font-extrabold text-on-surface mt-0.5">{formData.namaUsaha}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Modal Usaha</span>
                  <span className="block font-bold text-primary-container mt-0.5">
                    Rp {formData.modalUsaha ? parseInt(formData.modalUsaha).toLocaleString("id-ID") : "0"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Jumlah Pekerja</span>
                  <span className="block font-bold text-on-surface mt-0.5">{formData.jumlahPekerja || "0"} Orang</span>
                </div>
                <div>
                  <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Sumber Pembiayaan</span>
                  <span className="block font-bold text-on-surface mt-0.5 capitalize">
                    {formData.sumberPembiayaan === "pinjaman" ? "Pinjaman" : "Modal Sendiri"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Status Berjalan</span>
                  <span className="block font-bold text-on-surface mt-0.5 capitalize">
                    {formData.sudahBerjalan === "sudah" ? "Sudah Berjalan" : "Belum Berjalan"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Omzet Penjualan Tahunan</span>
                  <span className="block font-bold text-on-surface mt-0.5">
                    Rp {formData.omzetTahunan ? parseInt(formData.omzetTahunan).toLocaleString("id-ID") : "0"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Modal Kerja 3 Bulan</span>
                  <span className="block font-bold text-on-surface mt-0.5">
                    Rp {formData.modalKerja ? parseInt(formData.modalKerja).toLocaleString("id-ID") : "0"}
                  </span>
                </div>
                {formData.jenisProdukJasa && (
                  <>
                    <div>
                      <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Jenis Produk/Jasa</span>
                      <span className="block font-bold text-on-surface mt-0.5">{formData.jenisProdukJasa}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Cangkupan Produk</span>
                      <span className="block font-bold text-on-surface mt-0.5">{formData.cangkupanProduk || "-"}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Kapasitas Produksi</span>
                      <span className="block font-bold text-on-surface mt-0.5">
                        {formData.kapasitas ? parseInt(formData.kapasitas).toLocaleString("id-ID") : "0"} {formData.satuan || "Unit"} / tahun
                      </span>
                    </div>
                  </>
                )}
                {formData.sudahBerjalan === "sudah" && (
                  <>
                    <div>
                      <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Usaha Berjalan Sejak</span>
                      <span className="block font-bold text-on-surface mt-0.5">{formData.tanggalMulaiUsaha || "-"}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Perkiraan Mulai Operasional</span>
                      <span className="block font-bold text-on-surface mt-0.5">{formData.tanggalMulaiOperasional || "-"}</span>
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Deskripsi Aktivitas Usaha</span>
                  <p className="font-semibold text-on-surface-variant leading-relaxed mt-0.5 italic">
                    "{formData.ceritaUsaha}"
                  </p>
                </div>
              </div>
            </div>

            {/* Card 5: KBLI Terpilih */}
            <div className="bento-card">
              <div className="flex justify-between items-center border-b border-border-light pb-2 mb-3">
                <span className="text-xs font-extrabold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary-container text-sm">category</span>
                  KBLI TERPILIH
                </span>
                <button 
                  onClick={() => handleEditSection(3)} 
                  className="text-primary-container font-extrabold text-[10px] uppercase tracking-wider hover:underline flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-xs">edit</span> Ubah
                </button>
              </div>
              <div className="flex gap-3 items-center bg-[#F3F4F6] border border-border-light p-3 rounded text-xs">
                <div className="w-12 h-8 rounded bg-primary-container text-white font-mono font-bold flex items-center justify-center shrink-0">
                  {selectedKbli.code}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-on-surface truncate">{selectedKbli.title}</h4>
                    {selectedKbli.version && (
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border shrink-0 ${
                        selectedKbli.version === "2025"
                          ? "bg-primary-container/10 border-primary-container/30 text-primary-container"
                          : "bg-outline/10 border-outline/30 text-outline"
                      }`}>
                        KBLI {selectedKbli.version}
                      </span>
                    )}
                  </div>
                  <p className="text-[10.5px] text-on-surface-variant leading-relaxed mt-0.5">{selectedKbli.description}</p>
                </div>
              </div>
            </div>

            {/* Document Exports Card */}
            <div className="bento-card space-y-4">
              <div className="flex justify-between items-center border-b border-border-light pb-2">
                <span className="text-xs font-extrabold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary-container text-sm">download</span>
                  DOKUMEN ADMINISTRASI PENGESAHAN
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Anda dapat mengunduh dokumen penunjang administrasi (PDF) yang dihasilkan secara dinamis berdasarkan data formulir Anda.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  type="button" 
                  onClick={downloadNpsPdf} 
                  disabled={downloadingNps}
                  className="flex-1 px-4 py-2.5 rounded border border-primary-container text-primary-container text-xs font-bold uppercase tracking-wider hover:bg-primary-container/5 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">{downloadingNps ? "sync" : "picture_as_pdf"}</span>
                  {downloadingNps ? "Mengunduh..." : "Dokumen Adm PDF"}
                </button>
                <button 
                  type="button" 
                  onClick={downloadPhotoPdf} 
                  disabled={downloadingPhoto || !formData.fotoLokasi}
                  className="flex-1 px-4 py-2.5 rounded border border-primary-container text-primary-container text-xs font-bold uppercase tracking-wider hover:bg-primary-container/5 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">{downloadingPhoto ? "sync" : "photo_library"}</span>
                  {downloadingPhoto ? "Mengunduh..." : "Foto Lokasi PDF"}
                </button>
              </div>
            </div>

            {/* Consent Checklist (Blocking CTA) */}
            <div className="bento-card border border-primary-container/20 bg-primary-container/5 space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-primary-container flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">verified_user</span>
                Persetujuan Pengisian Otomatis
              </h3>
              
              <div className="flex flex-col gap-3">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={consent1} 
                    onChange={(e) => setConsent1(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-border-light text-primary-container focus:ring-primary-container cursor-pointer" 
                  />
                  <span className="text-xs font-bold text-on-surface leading-normal">
                    Saya menyatakan bahwa seluruh data draf di atas adalah benar dan sesuai dengan kondisi fisik usaha.
                  </span>
                </label>
                
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={consent2} 
                    onChange={(e) => setConsent2(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-border-light text-primary-container focus:ring-primary-container cursor-pointer" 
                  />
                  <span className="text-xs font-bold text-on-surface leading-normal">
                    Saya memberikan kuasa penuh kepada NIB Assistant untuk meregistrasikan & memasukkan data ini ke sistem OSS BKPM secara otomatis.
                  </span>
                </label>
              </div>
            </div>

          </div>

          {/* Desktop Footer Actions */}
          <div className="hidden md:flex justify-end pt-4 border-t border-border-light">
            <button
              onClick={handleProceedToAutomation}
              disabled={!isAllConsentGiven || isSubmitting}
              className={`px-6 py-3 rounded font-bold text-xs uppercase tracking-wider min-h-[44px] flex items-center justify-center gap-2 shadow-sm transition-all ${
                isAllConsentGiven && !isSubmitting
                  ? "bg-primary-container text-white hover:bg-primary cursor-pointer"
                  : "bg-surface-container-high text-outline opacity-50 cursor-not-allowed"
              }`}
            >
              {isSubmitting ? (
                <><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Menghubungkan...</>
              ) : (
                <>Mulai Pengisian Otomatis <span className="material-symbols-outlined text-sm">send</span></>
              )}
            </button>
          </div>

        </div>
      </main>

      {/* Mobile Sticky Footer */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 glass-bar border-t border-border-light px-5 py-4 shadow-sm z-40">
        <button
          onClick={handleProceedToAutomation}
          disabled={!isAllConsentGiven || isSubmitting}
          className={`w-full py-3.5 px-6 rounded font-bold flex items-center justify-center gap-2 text-xs uppercase tracking-wider min-h-[48px] transition-all ${
            isAllConsentGiven && !isSubmitting
              ? "bg-primary-container text-white shadow-sm hover:bg-primary"
              : "bg-surface-container-high text-outline opacity-50 cursor-not-allowed"
          }`}
        >
          {isSubmitting ? (
            <><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Memproses...</>
          ) : (
            <>Mulai Pengisian Otomatis <span className="material-symbols-outlined text-sm">send</span></>
          )}
        </button>
      </div>

      {/* ── STEP 2 VERIFICATION MODAL ── */}
      {showVerificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-[480px] bg-white border border-border-light rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-[#ECEEF0] border-b border-border-light px-5 py-4 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-extrabold text-primary-container uppercase tracking-wider">Verifikasi Akun OSS</span>
                <span className="text-[9px] font-bold text-on-surface-variant uppercase mt-0.5">{verifyingStatusText}</span>
              </div>
              {!registrationCompleted && !(isPromptingOtp || isPromptingPassword) && (
                <button
                  type="button"
                  onClick={() => {
                    setShowVerificationModal(false);
                    setIsMinimized(!verifyingErrorText);
                  }}
                  className="p-1.5 hover:bg-surface-container rounded-full text-on-surface-variant transition-all flex items-center justify-center"
                  title="Lanjutkan di latar belakang"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              )}
            </div>

            {/* Body */}
            <div className="p-6 flex-grow overflow-y-auto space-y-6">
              
              {/* Status and Progress Stepper */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  <span>Progress Registrasi</span>
                  {verifyingErrorText ? (
                    <span className="text-error font-extrabold flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-xs">error</span> Registrasi Terhenti
                    </span>
                  ) : registrationCompleted ? (
                    <span className="text-success font-extrabold flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-xs">check_circle</span> Selesai
                    </span>
                  ) : (
                    <span className="text-primary-container font-extrabold flex items-center gap-1">
                      <span className="w-2.5 h-2.5 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
                      Sedang Diproses
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 rounded-full ${
                      verifyingErrorText 
                        ? "bg-error" 
                        : registrationCompleted 
                          ? "bg-success" 
                          : "bg-primary-container animate-pulse"
                    }`}
                    style={{ width: `${(verifyingStep / 7) * 100}%` }}
                  />
                </div>
              </div>

              {/* Error Alert */}
              {verifyingErrorText && (
                <div className="p-4 bg-error/5 border border-error/20 rounded-xl space-y-3 animate-fadeIn">
                  <div className="flex gap-2.5 items-start">
                    <span className="material-symbols-outlined text-error text-lg mt-0.5">error</span>
                    <div className="space-y-1">
                      <h4 className="text-xs font-extrabold text-error uppercase">Gagal Registrasi</h4>
                      <p className="text-[11px] text-on-surface-variant leading-relaxed">
                        {verifyingErrorText}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (streamRef.current) streamRef.current.close();
                        if (verifyTimerRef.current) clearInterval(verifyTimerRef.current);
                        setIsVerifyingStep2(false);
                        setShowVerificationModal(false);
                        setIsMinimized(false);
                        setIsWaitingForRegistration(false);
                      }}
                      className="px-3.5 py-1.5 border border-border-light hover:bg-surface-container transition-all rounded text-[10px] font-bold uppercase tracking-wider text-on-surface-variant cursor-pointer"
                    >
                      Tutup
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const draftId = sessionStorage.getItem("draft_id");
                        if (draftId) startVerificationStream(draftId);
                      }}
                      className="px-4 py-1.5 bg-primary-container hover:bg-primary text-white transition-all rounded text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-xs">refresh</span> Coba Lagi
                    </button>
                  </div>
                </div>
              )}

              {/* OTP Form State */}
              {isPromptingOtp && !verifyingErrorText && (
                <div className="bento-card bg-primary-container/5 border border-primary-container/15 p-5 space-y-5 animate-fadeIn">
                  <div className="text-center space-y-1">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-on-surface flex items-center justify-center gap-1.5">
                      <span className="material-symbols-outlined text-base animate-bounce text-primary-container">mail</span>
                      Masukkan Kode OTP
                    </h3>
                    <p className="text-[11.5px] text-on-surface-variant leading-relaxed">
                      Kode OTP telah dikirimkan ke email Anda <strong>{formData.email}</strong>. Masukkan kode untuk memvalidasi identitas.
                    </p>
                  </div>

                  <form onSubmit={handleOtpSubmit} className="space-y-4 max-w-xs mx-auto">
                    <div className="flex flex-col gap-2.5 text-left">
                      <div className="flex justify-between items-center text-[9px] font-extrabold uppercase tracking-wider text-on-surface-variant">
                        <span>Kode OTP</span>
                        <span className={`flex items-center gap-1 font-mono font-bold ${verifyingTimeLeft < 25 ? "text-error animate-pulse" : "text-primary-container"}`}>
                          <span className="material-symbols-outlined text-[10px]">schedule</span>
                          {verifyingTimeLeft > 0 ? formatTime(verifyingTimeLeft) : "Waktu Habis"}
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
                            disabled={verifyingTimeLeft === 0}
                            autoFocus={idx === 0}
                            required
                          />
                        ))}
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmittingOtp || otp.length < 6 || verifyingTimeLeft === 0}
                      className="w-full bg-primary-container hover:bg-primary text-white font-bold py-2.5 px-6 rounded text-xs uppercase tracking-wider min-h-[40px] flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                    >
                      {isSubmittingOtp ? "Memverifikasi..." : "Verifikasi & Lanjutkan"}
                    </button>
                  </form>
                </div>
              )}

              {/* Password Form State */}
              {isPromptingPassword && !verifyingErrorText && (
                <div className="bento-card bg-primary-container/5 border border-primary-container/15 p-5 space-y-5 animate-fadeIn">
                  <div className="text-center space-y-1">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-on-surface flex items-center justify-center gap-1.5">
                      <span className="material-symbols-outlined text-base text-primary-container">lock</span>
                      Atur Kata Sandi Baru
                    </h3>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      Buatlah kata sandi untuk akun OSS BKPM Anda. Kata sandi ini akan disimpan untuk otomatisasi pengisian data berikutnya.
                    </p>
                  </div>

                  <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-xs mx-auto">
                    <div className="flex flex-col gap-3 text-left">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-on-surface-variant uppercase">Kata Sandi Baru</label>
                        <div className="relative w-full">
                          <input
                            type={showNewPassword ? "text" : "password"}
                            placeholder="Minimal 8 karakter"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full min-h-[40px] pl-3.5 pr-10 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface flex items-center justify-center focus:outline-none"
                          >
                            <span className="material-symbols-outlined text-lg select-none">
                              {showNewPassword ? "visibility_off" : "visibility"}
                            </span>
                          </button>
                        </div>
                      </div>

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
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface flex items-center justify-center focus:outline-none"
                          >
                            <span className="material-symbols-outlined text-lg select-none">
                              {showConfirmPassword ? "visibility_off" : "visibility"}
                            </span>
                          </button>
                        </div>
                      </div>

                      {passwordError && <p className="text-[10px] text-error font-semibold leading-normal">{passwordError}</p>}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingPassword || !newPassword || !confirmPassword}
                      className="w-full bg-primary-container hover:bg-primary text-white font-bold py-2.5 px-6 rounded text-xs uppercase tracking-wider min-h-[40px] flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                    >
                      {isSubmittingPassword ? "Menyimpan..." : "Simpan & Lanjutkan"}
                    </button>
                  </form>
                </div>
              )}

              {/* Console Logs Preview */}
              {!isPromptingOtp && !isPromptingPassword && !verifyingErrorText && (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <div className="relative w-12 h-12 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary-container text-4xl animate-spin">sync</span>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-on-surface">{verifyingStatusText}</p>
                    <p className="text-[10px] text-on-surface-variant mt-1">Ini dapat memakan waktu 1-2 menit...</p>
                  </div>
                </div>
              )}

              {/* Simple scrollable log view at bottom */}
              <div className="bg-[#1F2937] text-white p-3 rounded-lg font-mono text-[9px] h-24 overflow-y-auto space-y-1">
                {verifyingLogs.length === 0 ? (
                  <div className="text-gray-400">Inisialisasi log stream...</div>
                ) : (
                  verifyingLogs.map((log, idx) => (
                    <div key={idx} className={log.type === "error" ? "text-error" : log.type === "warn" ? "text-warning" : log.type === "success" ? "text-success" : "text-gray-300"}>
                      &gt; {log.text}
                    </div>
                  ))
                )}
              </div>

              {/* Modal Footer Controls */}
              {!registrationCompleted && !verifyingErrorText && (
                <div className="flex gap-2 justify-end border-t border-border-light pt-4 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Apakah Anda yakin ingin membatalkan registrasi akun OSS? Proses pendaftaran yang sedang berjalan akan dihentikan.")) {
                        const draftId = sessionStorage.getItem("draft_id");
                        if (draftId) {
                          fetch(`${API_URL}/automation/cancel/${draftId}`, { method: "POST" }).catch(err => console.error("Gagal membatalkan registrasi:", err));
                        }
                        if (streamRef.current) streamRef.current.close();
                        if (verifyTimerRef.current) clearInterval(verifyTimerRef.current);
                        setIsVerifyingStep2(false);
                        setShowVerificationModal(false);
                        setIsMinimized(false);
                        setIsWaitingForRegistration(false);
                      }
                    }}
                    className="px-3.5 py-2 border border-error/20 hover:bg-error/5 text-error rounded text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 transition-all"
                  >
                    <span className="material-symbols-outlined text-xs">cancel</span> Batalkan Registrasi
                  </button>
                  {!(isPromptingOtp || isPromptingPassword) && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowVerificationModal(false);
                        setIsMinimized(true);
                      }}
                      className="px-4 py-2 bg-surface-container hover:bg-border-light text-on-surface rounded text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 transition-all"
                    >
                      <span className="material-symbols-outlined text-xs">visibility_off</span> Latar Belakang
                    </button>
                  )}
                </div>
              )}

            </div>

          </div>
        </div>
      )}

      {/* Floating Background Notification Banner & FAB */}
      {isMinimized && (
        <div className={`fixed bottom-5 right-5 z-50 ${isPromptingOtp || isPromptingPassword ? "animate-bounce" : ""}`}>
          <button
            type="button"
            onClick={() => {
              setShowVerificationModal(true);
              setIsMinimized(false);
            }}
            className={`flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl transition-all text-xs font-bold uppercase tracking-wider hover:scale-105 border ${
              isPromptingOtp || isPromptingPassword
                ? "bg-amber-500 text-white border-amber-400"
                : "bg-primary-container text-white border-primary/20"
            }`}
          >
            {isPromptingOtp || isPromptingPassword ? (
              <>
                <span className="material-symbols-outlined text-lg animate-pulse">notifications_active</span>
                <span>{isPromptingOtp ? "OTP Diperlukan!" : "Kata Sandi Diperlukan!"}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg animate-spin">sync</span>
                <span>Registrasi Berjalan...</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Floating Success Toast */}
      {showSuccessToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-fadeIn">
          <div className="flex items-center gap-3 bg-emerald-600 text-white px-6 py-3.5 rounded-xl shadow-2xl border border-emerald-500 text-xs font-bold uppercase tracking-wider">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            <span>Registrasi OSS Berhasil! Akun siap digunakan.</span>
          </div>
        </div>
      )}

      {/* ── WAITING FOR REGISTRATION MODAL ── */}
      {isWaitingForRegistration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-[440px] bg-white border border-border-light rounded-2xl shadow-xl flex flex-col p-6 space-y-6 text-center">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-primary-container/20 border-t-primary-container animate-spin" />
              <span className="material-symbols-outlined text-primary text-2xl animate-pulse">sync</span>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-on-surface">Menunggu Registrasi Latar Belakang</h3>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Pendaftaran akun OSS Anda sedang diproses di latar belakang. Mohon tunggu sebentar, sistem akan otomatis melanjutkan ke proses pengisian setelah pendaftaran selesai.
              </p>
            </div>
            
            {/* simple status logs peek */}
            <div className="bg-surface-container rounded-xl p-3 text-[10px] font-mono text-on-surface-variant text-left h-20 overflow-y-auto space-y-1">
              <div className="font-bold text-primary-container uppercase text-[9px] tracking-wider mb-1 border-b border-border-light pb-0.5">Status Registrasi:</div>
              {verifyingLogs.length === 0 ? (
                <div className="text-outline">Menghubungkan...</div>
              ) : (
                verifyingLogs.slice(-2).map((log, idx) => (
                  <div key={idx} className={log.type === "error" ? "text-error" : log.type === "success" ? "text-success" : "text-on-surface-variant"}>
                    &gt; {log.text}
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={handleCancelWaiting}
                className="flex-1 py-2.5 border border-error/20 hover:bg-error/5 text-error rounded text-[10px] font-extrabold uppercase tracking-wider transition-all"
              >
                Batalkan Registrasi
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
