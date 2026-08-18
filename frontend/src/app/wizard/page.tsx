"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import SearchableSelect from "@/components/molecules/SearchableSelect";
import LeafletMap from "@/components/organisms/LeafletMap";

interface KBLIRecommendation {
  code: string;
  title: string;
  description: string;
  confidence: "sangat_cocok" | "alternatif";
  suitableFor: string[];
  version?: string;
}

interface KBLIUIDetails {
  summary: string;
  suitable: string[];
  unsuitable: string[];
}

const getKBLIDetails = (code: string, fallbackDesc: string, fallbackSuitable?: string[]): KBLIUIDetails => {
  return {
    summary: fallbackDesc,
    suitable: (fallbackSuitable && fallbackSuitable.length > 0) ? fallbackSuitable : ["Aktivitas perdagangan eceran", "Jasa perorangan mikro"],
    unsuitable: ["Usaha skala industri menengah/besar", "Ekspor-impor skala besar (Kargo kontainer)"]
  };
};

export default function WizardPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [saveStatus, setSaveStatus] = useState<"draft" | "saving" | "saved">("saved");

  // Leaflet Map states & references
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const hasResolvedInitialRegions = useRef(false);

  // Form State
  const [formData, setFormData] = useState({
    // Step 1: Pemilik & Kontak
    namaPemilik: "",
    nik: "",
    tanggalLahir: "",
    jenisKelamin: "Laki-laki",
    nomorHp: "",
    email: "",
    ossPassword: "",
    // Step 2: Lokasi Usaha
    alamatKtp: "",
    provinsiKtp: "",
    kotaKabupatenKtp: "",
    kecamatanKtp: "",
    kelurahanKtp: "",
    kodePosKtp: "",
    isAddressSame: false,
    alamatUsaha: "",
    provinsi: "",
    kotaKabupaten: "",
    kecamatan: "",
    kelurahan: "",
    kodePos: "",
    latitude: "-6.2088", // Default to Jakarta
    longitude: "106.8456",
    fotoLokasi: "", // base64 string
    // Step 3: Cerita Usaha (KBLI Prep)
    namaUsaha: "",
    ceritaUsaha: "",
    // Step 4: Skala Usaha & Tenaga Kerja
    modalUsaha: "",
    luasTanah: "",
    jumlahPekerjaLakiLaki: "0",
    jumlahPekerjaPerempuan: "0",
    jumlahPekerja: "0",
    sumberPembiayaan: "modal_sendiri",
    omzetTahunan: "0",
    modalKerja: "0",
    sudahBerjalan: "belum",
    tanggalMulaiUsaha: "",
    tanggalMulaiOperasional: "",
    jenisProdukJasa: "",
    cangkupanProduk: "",
    kapasitas: "0",
    satuan: ""
  });

  // Account Type & UI toggle states
  const [akunOss, setAkunOss] = useState<string>("belum");
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Geocoding Coordinates State
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");

  // Validation Errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Step 2 Verification States
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
  const [verifyingErrorText, setVerifyingErrorText] = useState("");
  const [verifyingStep, setVerifyingStep] = useState(1);
  const [verifyingTimeLeft, setVerifyingTimeLeft] = useState(120);

  const streamRef = useRef<EventSource | null>(null);
  const verifyTimerRef = useRef<any>(null);
  const otpRefs = useRef<HTMLInputElement[]>([]);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  const getSessionId = () => {
    if (typeof window !== "undefined") {
      let sid = sessionStorage.getItem("session_id");
      if (!sid) {
        sid = Math.random().toString(36).substring(2, 11).toUpperCase();
        sessionStorage.setItem("session_id", sid);
      }
      return sid;
    }
    return "SESSION_DEFAULT";
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const regDone = sessionStorage.getItem("registration_completed") === "true";
      setRegistrationCompleted(regDone);
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

                // Advance to Step 3 after a brief pause only if the user is still on Step 2
                setTimeout(() => {
                  setIsVerifyingStep2(false);
                  setShowVerificationModal(false);
                  setIsMinimized(false);
                  const activeWizardStep = typeof window !== "undefined" ? parseInt(sessionStorage.getItem("wizard_step") || "2", 10) : 2;
                  if (activeWizardStep === 2) {
                    setCurrentStep(3);
                    sessionStorage.setItem("wizard_step", "3");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
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

  const saveDraftStep2 = async () => {
    try {
      const payload = {
        namaPemilik: formData.namaPemilik,
        nik: formData.nik,
        tanggalLahir: formData.tanggalLahir,
        jenisKelamin: formData.jenisKelamin,
        nomorHp: formData.nomorHp,
        email: formData.email,
        alamatUsaha: formData.alamatUsaha,
        alamatKtp: formData.alamatKtp,
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
        luasTanah: formData.luasTanah || "150",
        fotoLokasi: formData.fotoLokasi || "default_base64",
        namaUsaha: formData.namaUsaha || "USAHA PEMILIK",
        ceritaUsaha: formData.ceritaUsaha || "Deskripsi cerita usaha pemilik",
        modalUsaha: formData.modalUsaha || "10000000",
        jumlahPekerja: formData.jumlahPekerja || "1",
        kbliCode: selectedKbliCode || "56103",
        kbliTitle: "Kedai Makanan",
        sessionId: getSessionId(),
      };

      const res = await fetch(`${API_URL}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Gagal menyimpan draf di server.");
      const savedDraft = await res.json();
      if (savedDraft && savedDraft.id) {
        sessionStorage.setItem("draft_id", savedDraft.id);
        startVerificationStream(savedDraft.id);
      } else {
        throw new Error("ID draf tidak valid.");
      }
    } catch (e: any) {
      console.error(e);
      setVerifyingErrorText(e.message || "Gagal sinkronisasi data draf.");
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

  // AI KBLI States
  const [recommendations, setRecommendations] = useState<KBLIRecommendation[]>([]);
  const [selectedKbliCode, setSelectedKbliCode] = useState<string>("");
  const [loadingKbli, setLoadingKbli] = useState<boolean>(false);
  const [expandedKbliCard, setExpandedKbliCard] = useState<string | null>(null);
  const [kbliError, setKbliError] = useState<string>("");
  const [isAiRecommended, setIsAiRecommended] = useState<boolean>(false);
  const [kbliFlow, setKbliFlow] = useState<"popular" | "ai">("popular");

  // Fetch initial preferences from onboarding page on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("draft_form_data");
      const savedStep = sessionStorage.getItem("wizard_step");
      const scale = sessionStorage.getItem("skala_usaha") || "";
      const modalDefault = scale === "mikro" ? "50000000" : "";
      const storedAkunOss = sessionStorage.getItem("akun_oss") || "belum";
      setAkunOss(storedAkunOss);
      const storedPassword = sessionStorage.getItem("oss_password") || "";

      const storedKbli = sessionStorage.getItem("selected_kbli");
      if (storedKbli) {
        try {
          const parsed = JSON.parse(storedKbli);
          setSelectedKbliCode(parsed.code);
          setRecommendations([parsed]);
          setExpandedKbliCard(parsed.code);
        } catch (e) {
          console.error("Gagal memuat KBLI terpilih dari session:", e);
        }
      }
      
      if (savedStep) {
        const parsedStep = parseInt(savedStep, 10);
        if (parsedStep >= 1 && parsedStep <= 4) {
          setCurrentStep(parsedStep);
        }
      }

      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setFormData((prev) => ({ 
            ...prev, 
            ...parsed,
            ossPassword: parsed.ossPassword || storedPassword || prev.ossPassword 
          }));
          if (parsed.ceritaUsaha && parsed.ceritaUsaha.trim().length >= 15) {
            setKbliFlow("ai");
          }
        } catch (e) {
          console.error("Gagal memuat draf dari session:", e);
        }
      } else {
        setFormData((prev) => ({
          ...prev,
          ossPassword: prev.ossPassword || storedPassword,
          modalUsaha: prev.modalUsaha || modalDefault
        }));
      }
    }
  }, []);



  // Location States (Kemendagri API)
  const [provincesList, setProvincesList] = useState<{ id: string; name: string }[]>([]);
  const [citiesList, setCitiesList] = useState<{ id: string; name: string }[]>([]);
  const [districtsList, setDistrictsList] = useState<{ id: string; name: string }[]>([]);
  const [villagesList, setVillagesList] = useState<{ id: string; name: string }[]>([]);

  const [selectedProvId, setSelectedProvId] = useState("");
  const [selectedCityId, setSelectedCityId] = useState("");
  const [selectedDistId, setSelectedDistId] = useState("");
  const [loadingRegions, setLoadingRegions] = useState<Record<string, boolean>>({});

  // KTP Location States (Kemendagri API)
  const [citiesKtpList, setCitiesKtpList] = useState<{ id: string; name: string }[]>([]);
  const [districtsKtpList, setDistrictsKtpList] = useState<{ id: string; name: string }[]>([]);
  const [villagesKtpList, setVillagesKtpList] = useState<{ id: string; name: string }[]>([]);

  const [selectedKtpProvId, setSelectedKtpProvId] = useState("");
  const [selectedKtpCityId, setSelectedKtpCityId] = useState("");
  const [selectedKtpDistId, setSelectedKtpDistId] = useState("");
  const [loadingKtpRegions, setLoadingKtpRegions] = useState<Record<string, boolean>>({});

  const handleKtpProvinceChange = async (provId: string) => {
    setSelectedKtpProvId(provId);
    setSelectedKtpCityId("");
    setSelectedKtpDistId("");
    setCitiesKtpList([]);
    setDistrictsKtpList([]);
    setVillagesKtpList([]);

    if (!provId) {
      handleInputChange("provinsiKtp", "");
      handleInputChange("kotaKabupatenKtp", "");
      handleInputChange("kecamatanKtp", "");
      handleInputChange("kelurahanKtp", "");
      return;
    }

    const provObj = provincesList.find((p) => p.id === provId);
    if (provObj) {
      handleInputChange("provinsiKtp", provObj.name.toUpperCase());
    }
    handleInputChange("kotaKabupatenKtp", "");
    handleInputChange("kecamatanKtp", "");
    handleInputChange("kelurahanKtp", "");

    try {
      setLoadingKtpRegions((prev) => ({ ...prev, kotaKabupaten: true }));
      const res = await fetch(`/api/regions?type=regencies&id=${provId}`);
      const data = await res.json();
      setCitiesKtpList(data);
    } catch (err) {
      console.error("Gagal mengambil data kota/kabupaten KTP:", err);
    } finally {
      setLoadingKtpRegions((prev) => ({ ...prev, kotaKabupaten: false }));
    }
  };

  const handleKtpCityChange = async (cityId: string) => {
    setSelectedKtpCityId(cityId);
    setSelectedKtpDistId("");
    setDistrictsKtpList([]);
    setVillagesKtpList([]);

    if (!cityId) {
      handleInputChange("kotaKabupatenKtp", "");
      handleInputChange("kecamatanKtp", "");
      handleInputChange("kelurahanKtp", "");
      return;
    }

    const cityObj = citiesKtpList.find((c) => c.id === cityId);
    if (cityObj) {
      handleInputChange("kotaKabupatenKtp", cityObj.name.toUpperCase());
    }
    handleInputChange("kecamatanKtp", "");
    handleInputChange("kelurahanKtp", "");

    try {
      setLoadingKtpRegions((prev) => ({ ...prev, kecamatan: true }));
      const res = await fetch(`/api/regions?type=districts&id=${cityId}`);
      const data = await res.json();
      setDistrictsKtpList(data);
    } catch (err) {
      console.error("Gagal mengambil data kecamatan KTP:", err);
    } finally {
      setLoadingKtpRegions((prev) => ({ ...prev, kecamatan: false }));
    }
  };

  const handleKtpDistrictChange = async (distId: string) => {
    setSelectedKtpDistId(distId);
    setVillagesKtpList([]);

    if (!distId) {
      handleInputChange("kecamatanKtp", "");
      handleInputChange("kelurahanKtp", "");
      return;
    }

    const distObj = districtsKtpList.find((d) => d.id === distId);
    if (distObj) {
      handleInputChange("kecamatanKtp", distObj.name.toUpperCase());
    }
    handleInputChange("kelurahanKtp", "");

    try {
      setLoadingKtpRegions((prev) => ({ ...prev, kelurahan: true }));
      const res = await fetch(`/api/regions?type=villages&id=${distId}`);
      const data = await res.json();
      setVillagesKtpList(data);
    } catch (err) {
      console.error("Gagal mengambil data kelurahan KTP:", err);
    } finally {
      setLoadingKtpRegions((prev) => ({ ...prev, kelurahan: false }));
    }
  };

  const handleKtpVillageChange = (villId: string) => {
    if (!villId) {
      handleInputChange("kelurahanKtp", "");
      return;
    }
    const villObj = villagesKtpList.find((v) => v.id === villId);
    if (villObj) {
      handleInputChange("kelurahanKtp", villObj.name.toUpperCase());
    }
  };

  // Synchronize KTP Address and Options to Business Address if checked
  useEffect(() => {
    if (formData.isAddressSame) {
      setFormData((prev) => {
        if (
          prev.alamatUsaha === prev.alamatKtp &&
          prev.provinsi === prev.provinsiKtp &&
          prev.kotaKabupaten === prev.kotaKabupatenKtp &&
          prev.kecamatan === prev.kecamatanKtp &&
          prev.kelurahan === prev.kelurahanKtp &&
          prev.kodePos === prev.kodePosKtp
        ) {
          return prev;
        }
        return {
          ...prev,
          alamatUsaha: prev.alamatKtp,
          provinsi: prev.provinsiKtp,
          kotaKabupaten: prev.kotaKabupatenKtp,
          kecamatan: prev.kecamatanKtp,
          kelurahan: prev.kelurahanKtp,
          kodePos: prev.kodePosKtp
        };
      });

      setSelectedProvId((prev) => (prev !== selectedKtpProvId ? selectedKtpProvId : prev));
      setSelectedCityId((prev) => (prev !== selectedKtpCityId ? selectedKtpCityId : prev));
      setSelectedDistId((prev) => (prev !== selectedKtpDistId ? selectedKtpDistId : prev));

      setCitiesList(citiesKtpList);
      setDistrictsList(districtsKtpList);
      setVillagesList(villagesKtpList);
    }
  }, [
    formData.isAddressSame,
    formData.alamatKtp,
    formData.provinsiKtp,
    formData.kotaKabupatenKtp,
    formData.kecamatanKtp,
    formData.kelurahanKtp,
    formData.kodePosKtp,
    selectedKtpProvId,
    selectedKtpCityId,
    selectedKtpDistId,
    citiesKtpList,
    districtsKtpList,
    villagesKtpList
  ]);

  // Fetch provinces on mount
  useEffect(() => {
    const fetchProvinces = async () => {
      try {
        setLoadingRegions((prev) => ({ ...prev, provinsi: true }));
        const res = await fetch("/api/regions?type=provinces");
        const data = await res.json();
        setProvincesList(data);
      } catch (err) {
        console.error("Gagal mengambil data provinsi:", err);
      } finally {
        setLoadingRegions((prev) => ({ ...prev, provinsi: false }));
      }
    };
    fetchProvinces();
  }, []);

  // Automatically resolve existing region names to IDs on mount / initial load
  useEffect(() => {
    if (provincesList.length === 0 || hasResolvedInitialRegions.current) return;

    const resolveRegions = async () => {
      hasResolvedInitialRegions.current = true;
      
      // 1. Resolve KTP address
      let ktpProvId = "";
      if (formData.provinsiKtp) {
        const matchedProv = provincesList.find(
          (p) => p.name.toUpperCase() === formData.provinsiKtp.toUpperCase()
        );
        if (matchedProv) {
          ktpProvId = matchedProv.id;
          setSelectedKtpProvId(matchedProv.id);
        }
      }

      let ktpCityId = "";
      if (ktpProvId && formData.kotaKabupatenKtp) {
        try {
          const res = await fetch(`/api/regions?type=regencies&id=${ktpProvId}`);
          const cities = await res.json();
          setCitiesKtpList(cities);
          const matchedCity = cities.find(
            (c: any) => c.name.toUpperCase() === formData.kotaKabupatenKtp.toUpperCase()
          );
          if (matchedCity) {
            ktpCityId = matchedCity.id;
            setSelectedKtpCityId(matchedCity.id);
          }
        } catch (e) {
          console.error("Gagal resolve kota KTP:", e);
        }
      }

      let ktpDistId = "";
      if (ktpCityId && formData.kecamatanKtp) {
        try {
          const res = await fetch(`/api/regions?type=districts&id=${ktpCityId}`);
          const districts = await res.json();
          setDistrictsKtpList(districts);
          const matchedDist = districts.find(
            (d: any) => d.name.toUpperCase() === formData.kecamatanKtp.toUpperCase()
          );
          if (matchedDist) {
            ktpDistId = matchedDist.id;
            setSelectedKtpDistId(matchedDist.id);
          }
        } catch (e) {
          console.error("Gagal resolve kecamatan KTP:", e);
        }
      }

      if (ktpDistId && formData.kelurahanKtp) {
        try {
          const res = await fetch(`/api/regions?type=villages&id=${ktpDistId}`);
          const villages = await res.json();
          setVillagesKtpList(villages);
        } catch (e) {
          console.error("Gagal resolve kelurahan KTP:", e);
        }
      }

      // 2. Resolve Business address (if not same as KTP address)
      if (formData.isAddressSame) {
        return;
      }

      let usahaProvId = "";
      if (formData.provinsi) {
        const matchedProv = provincesList.find(
          (p) => p.name.toUpperCase() === formData.provinsi.toUpperCase()
        );
        if (matchedProv) {
          usahaProvId = matchedProv.id;
          setSelectedProvId(matchedProv.id);
        }
      }

      let usahaCityId = "";
      if (usahaProvId && formData.kotaKabupaten) {
        try {
          const res = await fetch(`/api/regions?type=regencies&id=${usahaProvId}`);
          const cities = await res.json();
          setCitiesList(cities);
          const matchedCity = cities.find(
            (c: any) => c.name.toUpperCase() === formData.kotaKabupaten.toUpperCase()
          );
          if (matchedCity) {
            usahaCityId = matchedCity.id;
            setSelectedCityId(matchedCity.id);
          }
        } catch (e) {
          console.error("Gagal resolve kota usaha:", e);
        }
      }

      let usahaDistId = "";
      if (usahaCityId && formData.kecamatan) {
        try {
          const res = await fetch(`/api/regions?type=districts&id=${usahaCityId}`);
          const districts = await res.json();
          setDistrictsList(districts);
          const matchedDist = districts.find(
            (d: any) => d.name.toUpperCase() === formData.kecamatan.toUpperCase()
          );
          if (matchedDist) {
            usahaDistId = matchedDist.id;
            setSelectedDistId(matchedDist.id);
          }
        } catch (e) {
          console.error("Gagal resolve kecamatan usaha:", e);
        }
      }

      if (usahaDistId && formData.kelurahan) {
        try {
          const res = await fetch(`/api/regions?type=villages&id=${usahaDistId}`);
          const villages = await res.json();
          setVillagesList(villages);
        } catch (e) {
          console.error("Gagal resolve kelurahan usaha:", e);
        }
      }
    };

    resolveRegions();
  }, [provincesList, formData.provinsi, formData.provinsiKtp]);

  const handleProvinceChange = async (provId: string) => {
    setSelectedProvId(provId);
    setSelectedCityId("");
    setSelectedDistId("");
    setCitiesList([]);
    setDistrictsList([]);
    setVillagesList([]);

    if (!provId) {
      handleInputChange("provinsi", "");
      handleInputChange("kotaKabupaten", "");
      handleInputChange("kecamatan", "");
      handleInputChange("kelurahan", "");
      return;
    }

    const provObj = provincesList.find((p) => p.id === provId);
    if (provObj) {
      handleInputChange("provinsi", provObj.name.toUpperCase());
    }
    handleInputChange("kotaKabupaten", "");
    handleInputChange("kecamatan", "");
    handleInputChange("kelurahan", "");

    try {
      setLoadingRegions((prev) => ({ ...prev, kotaKabupaten: true }));
      const res = await fetch(`/api/regions?type=regencies&id=${provId}`);
      const data = await res.json();
      setCitiesList(data);
    } catch (err) {
      console.error("Gagal mengambil data kota/kabupaten:", err);
    } finally {
      setLoadingRegions((prev) => ({ ...prev, kotaKabupaten: false }));
    }
  };

  const handleCityChange = async (cityId: string) => {
    setSelectedCityId(cityId);
    setSelectedDistId("");
    setDistrictsList([]);
    setVillagesList([]);

    if (!cityId) {
      handleInputChange("kotaKabupaten", "");
      handleInputChange("kecamatan", "");
      handleInputChange("kelurahan", "");
      return;
    }

    const cityObj = citiesList.find((c) => c.id === cityId);
    if (cityObj) {
      handleInputChange("kotaKabupaten", cityObj.name.toUpperCase());
    }
    handleInputChange("kecamatan", "");
    handleInputChange("kelurahan", "");

    try {
      setLoadingRegions((prev) => ({ ...prev, kecamatan: true }));
      const res = await fetch(`/api/regions?type=districts&id=${cityId}`);
      const data = await res.json();
      setDistrictsList(data);
    } catch (err) {
      console.error("Gagal mengambil data kecamatan:", err);
    } finally {
      setLoadingRegions((prev) => ({ ...prev, kecamatan: false }));
    }
  };

  const handleDistrictChange = async (distId: string) => {
    setSelectedDistId(distId);
    setVillagesList([]);

    if (!distId) {
      handleInputChange("kecamatan", "");
      handleInputChange("kelurahan", "");
      return;
    }

    const distObj = districtsList.find((d) => d.id === distId);
    if (distObj) {
      handleInputChange("kecamatan", distObj.name.toUpperCase());
    }
    handleInputChange("kelurahan", "");

    try {
      setLoadingRegions((prev) => ({ ...prev, kelurahan: true }));
      const res = await fetch(`/api/regions?type=villages&id=${distId}`);
      const data = await res.json();
      setVillagesList(data);
    } catch (err) {
      console.error("Gagal mengambil data kelurahan:", err);
    } finally {
      setLoadingRegions((prev) => ({ ...prev, kelurahan: false }));
    }
  };

  const handleVillageChange = (villId: string) => {
    if (!villId) {
      handleInputChange("kelurahan", "");
      return;
    }
    const villObj = villagesList.find((v) => v.id === villId);
    if (villObj) {
      handleInputChange("kelurahan", villObj.name.toUpperCase());
    }
  };

  const searchCoordinates = async () => {
    if (!formData.alamatUsaha) {
      setGeocodeError("Silakan isi Alamat Usaha terlebih dahulu.");
      return;
    }

    setIsGeocoding(true);
    setGeocodeError("");

    try {
      const fullAddress = `${formData.alamatUsaha}, ${formData.kelurahan || ""}, ${formData.kecamatan || ""}, ${formData.kotaKabupaten || ""}, ${formData.provinsi || ""}, Indonesia`;
      const encodedAddress = encodeURIComponent(fullAddress);

      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`);
      const data = await res.json();

      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        setFormData((prev) => ({
          ...prev,
          latitude: parseFloat(lat).toFixed(6),
          longitude: parseFloat(lon).toFixed(6)
        }));
        triggerAutosave();
      } else {
        const fallbackRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(formData.alamatUsaha)}&limit=1`);
        const fallbackData = await fallbackRes.json();
        
        if (fallbackData && fallbackData.length > 0) {
          const { lat, lon } = fallbackData[0];
          setFormData((prev) => ({
            ...prev,
            latitude: parseFloat(lat).toFixed(6),
            longitude: parseFloat(lon).toFixed(6)
          }));
          triggerAutosave();
        } else {
          setGeocodeError("Lokasi tidak ditemukan di peta. Tentukan koordinat manual atau drag pin.");
        }
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      setGeocodeError("Gagal mencari koordinat secara otomatis. Silakan tentukan manual.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        alert("Ukuran foto maksimal adalah 8MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({
          ...prev,
          fotoLokasi: reader.result as string
        }));
        triggerAutosave();
      };
      reader.readAsDataURL(file);
    }
  };

  const handleWorkerChange = (field: "jumlahPekerjaLakiLaki" | "jumlahPekerjaPerempuan", val: string) => {
    const sanitizedVal = val.replace(/\D/g, "");
    
    setFormData((prev) => {
      const updated = { ...prev, [field]: sanitizedVal || "0" };
      const male = parseInt(updated.jumlahPekerjaLakiLaki || "0", 10);
      const female = parseInt(updated.jumlahPekerjaPerempuan || "0", 10);
      updated.jumlahPekerja = (male + female).toString();
      return updated;
    });

    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
    triggerAutosave();
  };

  const triggerAutosave = () => {
    setSaveStatus("saving");
    setTimeout(() => {
      setSaveStatus("saved");
    }, 1000);
  };

  const handleInputChange = (field: string, value: string) => {
    let processedValue = value;

    if (
      field !== "email" &&
      field !== "ossPassword" &&
      field !== "jenisKelamin" &&
      field !== "provinsi" &&
      field !== "kotaKabupaten" &&
      field !== "kecamatan" &&
      field !== "kelurahan" &&
      field !== "provinsiKtp" &&
      field !== "kotaKabupatenKtp" &&
      field !== "kecamatanKtp" &&
      field !== "kelurahanKtp" &&
      field !== "jumlahPekerja" &&
      field !== "sumberPembiayaan" &&
      field !== "sudahBerjalan" &&
      field !== "tanggalMulaiUsaha" &&
      field !== "tanggalMulaiOperasional"
    ) {
      processedValue = value.toUpperCase();
    }

    if (field === "nik") {
      const sanitized = processedValue.replace(/\D/g, "").slice(0, 16);
      setFormData((prev) => ({ ...prev, [field]: sanitized }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
      triggerAutosave();
      return;
    }

    if (field === "nomorHp") {
      const sanitized = processedValue.replace(/\D/g, "").slice(0, 13);
      setFormData((prev) => ({ ...prev, [field]: sanitized }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
      triggerAutosave();
      return;
    }

    if (field === "ossPassword" && typeof window !== "undefined") {
      sessionStorage.setItem("oss_password", processedValue);
    }

    setFormData((prev) => {
      const updated = { ...prev, [field]: processedValue };
      if (field === "alamatKtp" && updated.isAddressSame) {
        updated.alamatUsaha = processedValue;
      }
      return updated;
    });
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
    triggerAutosave();
  };

  const handleToggleAkunOss = (val: string) => {
    setAkunOss(val);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("akun_oss", val);
    }
    setErrors({});
  };

  // 4-Step Validation
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (akunOss === "sudah") {
        if (!formData.email.trim()) {
          newErrors.email = "Alamat email / username akun OSS harus diisi.";
        } else if (!formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
          newErrors.email = "Format email tidak valid.";
        }
        if (!formData.ossPassword || !formData.ossPassword.trim()) {
          newErrors.ossPassword = "Kata sandi akun OSS harus diisi.";
        }
      } else {
        if (!formData.namaPemilik.trim()) {
          newErrors.namaPemilik = "Nama pemilik harus diisi.";
        }
        if (formData.nik.length !== 16) {
          newErrors.nik = "NIK harus terdiri dari 16 digit angka.";
        }
        if (!formData.tanggalLahir) {
          newErrors.tanggalLahir = "Tanggal lahir harus diisi.";
        }
        if (formData.nomorHp.length < 10) {
          newErrors.nomorHp = "Nomor WhatsApp belum lengkap.";
        }
        if (!formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
          newErrors.email = "Format email tidak valid.";
        }
      }
    }

    if (step === 2) {
      if (akunOss !== "sudah") {
        if (!formData.alamatKtp.trim()) {
          newErrors.alamatKtp = "Alamat KTP harus diisi.";
        }
        if (!formData.provinsiKtp) {
          newErrors.provinsiKtp = "Pilih provinsi KTP.";
        }
        if (!formData.kotaKabupatenKtp) {
          newErrors.kotaKabupatenKtp = "Pilih kota/kabupaten KTP.";
        }
        if (!formData.kecamatanKtp) {
          newErrors.kecamatanKtp = "Pilih kecamatan KTP.";
        }
        if (!formData.kelurahanKtp) {
          newErrors.kelurahanKtp = "Pilih kelurahan KTP.";
        }
      }
      if (!formData.alamatUsaha.trim()) {
        newErrors.alamatUsaha = "Alamat lengkap usaha harus diisi.";
      }
      if (!formData.provinsi) {
        newErrors.provinsi = "Pilih provinsi lokasi usaha.";
      }
      if (!formData.kotaKabupaten) {
        newErrors.kotaKabupaten = "Pilih kota/kabupaten.";
      }
      if (!formData.kecamatan) {
        newErrors.kecamatan = "Pilih kecamatan.";
      }
      if (!formData.kelurahan) {
        newErrors.kelurahan = "Pilih kelurahan.";
      }
      if (!formData.latitude || !formData.longitude) {
        newErrors.coordinates = "Koordinat peta usaha wajib ditentukan.";
      }
      if (!formData.fotoLokasi) {
        newErrors.fotoLokasi = "Foto lokasi usaha wajib diunggah.";
      }
    }

    if (step === 3) {
      if (!formData.namaUsaha.trim()) {
        newErrors.namaUsaha = "Nama usaha/warung harus diisi.";
      }
      if (kbliFlow === "ai" && formData.ceritaUsaha.trim().length < 15) {
        newErrors.ceritaUsaha = "Ceritakan usaha Anda minimal 15 karakter.";
      }
      if (!selectedKbliCode) {
        newErrors.kbli = "Silakan pilih salah satu KBLI di bawah.";
      }
    }

    if (step === 4) {
      if (!formData.modalUsaha || parseInt(formData.modalUsaha) <= 0) {
        newErrors.modalUsaha = "Masukkan perkiraan modal usaha yang valid.";
      }
      if (!formData.luasTanah || parseInt(formData.luasTanah) <= 0) {
        newErrors.luasTanah = "Masukkan luas lahan usaha yang valid.";
      }
      if (!formData.omzetTahunan || parseInt(formData.omzetTahunan) < 0) {
        newErrors.omzetTahunan = "Masukkan estimasi hasil penjualan tahunan yang valid.";
      }
      if (!formData.modalKerja || parseInt(formData.modalKerja) < 0) {
        newErrors.modalKerja = "Masukkan modal kerja 3 bulan yang valid.";
      }
      if (formData.sudahBerjalan === "sudah") {
        if (!formData.tanggalMulaiUsaha) {
          newErrors.tanggalMulaiUsaha = "Pilih tanggal mulai usaha.";
        }
        if (!formData.tanggalMulaiOperasional) {
          newErrors.tanggalMulaiOperasional = "Pilih tanggal mulai operasional/komersial.";
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("draft_form_data", JSON.stringify(formData));
      }

      const redirectReview = typeof window !== "undefined" && sessionStorage.getItem("edit_redirect") === "review";
      if (redirectReview) {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("edit_redirect");
        }
        router.push("/review");
        return;
      }

      if (currentStep === 2) {
        const isBelum = typeof window !== "undefined" ? sessionStorage.getItem("akun_oss") || "belum" : "belum";
        const isRegCompleted = typeof window !== "undefined" && sessionStorage.getItem("registration_completed") === "true";
        if (isBelum === "belum" && !isRegCompleted && !registrationCompleted && !isVerifyingStep2) {
          setIsVerifyingStep2(true);
          setShowVerificationModal(true);
          setIsMinimized(false);
          saveDraftStep2();
          return;
        }
      }

      if (currentStep < 4) {
        const nextStep = currentStep + 1;
        setCurrentStep(nextStep);
        if (typeof window !== "undefined") {
          sessionStorage.setItem("wizard_step", nextStep.toString());
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("wizard_step", "4");
        }
        router.push("/review");
      }
    }
  };

  const fetchRecommendations = async (queryText: string) => {
    const q = (queryText || "").trim();
    setLoadingKbli(true);
    setKbliError("");
    setIsAiRecommended(!!q);
    if (q) {
      setKbliFlow("ai");
    }
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/kbli/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          let updatedData = [...data];
          
          // Load previous selection if any, otherwise default to first recommendation
          const stored = sessionStorage.getItem("selected_kbli");
          let loaded = false;
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              const found = data.find((r: any) => r.code === parsed.code);
              if (found) {
                setSelectedKbliCode(found.code);
                setExpandedKbliCard(found.code);
                loaded = true;
              } else {
                // Prepend/append the selected KBLI to the recommendations list so it remains visible
                updatedData = [parsed, ...updatedData];
                setSelectedKbliCode(parsed.code);
                setExpandedKbliCard(parsed.code);
                loaded = true;
              }
            } catch (e) {
              console.error(e);
            }
          }
          
          setRecommendations(updatedData);

          if (!loaded) {
            setSelectedKbliCode(updatedData[0].code);
            setExpandedKbliCard(updatedData[0].code);
            sessionStorage.setItem("selected_kbli", JSON.stringify(updatedData[0]));
          }
        } else {
          setKbliError("Tidak ditemukan rekomendasi KBLI yang cocok. Silakan sesuaikan deskripsi usaha Anda.");
        }
      } else {
        setKbliError("Gagal mengambil rekomendasi KBLI. Silakan coba lagi.");
      }
    } catch (e) {
      console.error("Error fetching KBLI recommendations:", e);
      setKbliError("Terjadi kesalahan koneksi saat mencari KBLI.");
    } finally {
      setLoadingKbli(false);
    }
  };

  // Automatically trigger KBLI recommendation if Step 3 is entered
  useEffect(() => {
    if (currentStep === 3 && recommendations.length <= 1) {
      if (formData.ceritaUsaha.trim().length >= 15) {
        fetchRecommendations(formData.ceritaUsaha);
      } else {
        fetchRecommendations("");
      }
    }
  }, [currentStep]);

  const handleBack = () => {
    if (currentStep > 1) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("draft_form_data", JSON.stringify(formData));
        sessionStorage.setItem("wizard_step", prevStep.toString());
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      router.push("/");
    }
  };

  const formatNIK = (nik: string) => {
    if (!nik) return "";
    const matches = nik.match(/.{1,4}/g);
    return matches ? matches.join(" ") : nik;
  };

  const stepsLabels = akunOss === "sudah" 
    ? ["Akun OSS", "Lokasi", "Cerita", "Skala"] 
    : ["Identitas", "Lokasi", "Cerita", "Skala"];

  return (
    <div className="flex-grow flex flex-col bg-background min-h-screen font-sans">
      
      {/* ── Top Flat AppBar ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 md:px-8 h-16 w-full bg-white border-b border-border-light">
        <div className="flex items-center gap-2">
          <button onClick={handleBack} className="p-2 hover:bg-surface-container transition-all rounded text-on-surface-variant flex items-center justify-center" aria-label="Kembali">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <div className="flex flex-col">
            <span className="text-sm font-extrabold text-primary-container leading-none uppercase">NIB Assistant</span>
            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mt-0.5">Wizard Pendaftaran</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-extrabold bg-[#F3F4F6] text-on-surface-variant px-3 py-1.5 rounded border border-border-light shrink-0">
            <span className={`w-2 h-2 rounded-full ${saveStatus === "saving" ? "bg-warning animate-pulse" : "bg-success"}`} />
            <span>{saveStatus === "saving" ? "Menyimpan..." : "✓ Tersimpan"}</span>
          </div>
          <button onClick={() => router.push("/")} className="p-2 hover:bg-surface-container transition-all rounded text-on-surface-variant flex items-center justify-center" aria-label="Bantuan">
            <span className="material-symbols-outlined text-lg">help</span>
          </button>
        </div>
      </header>

      {/* ── Main Container (max 640px) ── */}
      <main className="flex-grow flex justify-center w-full px-4 py-8 pb-32 md:pb-12">
        <div className="w-full max-w-[640px] flex flex-col gap-6">
          
          {/* ── Flat Stepper (Step X of 4 Indicator) ── */}
          <div className="w-full bg-white border border-border-light rounded-lg p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              <span>Langkah {currentStep} dari 4</span>
              <span className="text-primary-container font-extrabold">{stepsLabels[currentStep - 1]}</span>
            </div>
            
            {/* Linear Progress Bar (Thin, no clutter) */}
            <div className="w-full h-1 bg-[#ECEEF0] rounded-full overflow-hidden">
              <div 
                className="bg-primary-container h-full transition-all duration-300 ease-in-out" 
                style={{ width: `${(currentStep / 4) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex-grow">
            
            {/* ── STEP 1: IDENTITAS & KONTAK / KREDENSIAL OSS ── */}
            {currentStep === 1 && (
              <div className="animate-fadeIn space-y-6">

                {/* Mode Switcher Banner / Toggle */}
                <div className="flex items-center justify-between p-3 bg-surface-container-low rounded border border-border-light">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-container text-base">account_circle</span>
                    <span className="text-[11px] font-bold text-on-surface">
                      Status Akun OSS:
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleAkunOss("sudah")}
                      className={`px-3 py-1.5 rounded text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                        akunOss === "sudah"
                          ? "bg-primary-container text-white shadow-sm"
                          : "bg-white border border-border-light text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      Sudah Punya
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleAkunOss("belum")}
                      className={`px-3 py-1.5 rounded text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                        akunOss !== "sudah"
                          ? "bg-primary-container text-white shadow-sm"
                          : "bg-white border border-border-light text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      Belum Punya
                    </button>
                  </div>
                </div>

                {akunOss === "sudah" ? (
                  <>
                    {/* Section title for Existing Account */}
                    <div>
                      <h2 className="text-lg font-extrabold uppercase tracking-wide text-on-surface">
                        Kredensial Akun OSS
                      </h2>
                      <p className="text-xs text-on-surface-variant leading-relaxed mt-1">
                        Masukkan akun OSS resmi Anda untuk login dan pengajuan NIB otomatis. Data identitas pemilik tidak perlu diisi ulang karena telah tersimpan di akun OSS Anda.
                      </p>
                    </div>

                    <div className="bento-card space-y-5">
                      {/* Email */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-on-surface-variant" htmlFor="email">
                          ALAMAT EMAIL / USERNAME OSS
                        </label>
                        <input
                          type="email"
                          id="email"
                          placeholder="Contoh: pemilik@gmail.com"
                          value={formData.email}
                          onChange={(e) => handleInputChange("email", e.target.value)}
                          className={`w-full min-h-[48px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none ${
                            errors.email ? "border-error" : ""
                          }`}
                        />
                        {errors.email && (
                          <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {errors.email}
                          </p>
                        )}
                      </div>

                      {/* OSS Password */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-on-surface-variant" htmlFor="ossPassword">
                          KATA SANDI AKUN OSS
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            id="ossPassword"
                            placeholder="Masukkan kata sandi akun OSS Anda"
                            value={formData.ossPassword || ""}
                            onChange={(e) => handleInputChange("ossPassword", e.target.value)}
                            className={`w-full min-h-[48px] pl-3.5 pr-10 py-2.5 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none ${
                              errors.ossPassword ? "border-error" : ""
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-lg">
                              {showPassword ? "visibility_off" : "visibility"}
                            </span>
                          </button>
                        </div>
                        <p className="text-[10px] text-on-surface-variant leading-relaxed">
                          Kata sandi digunakan untuk login otomatis ke portal OSS BKPM saat pembuatan permohonan NIB.
                        </p>
                        {errors.ossPassword && (
                          <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {errors.ossPassword}
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Section title for New Registration */}
                    <div>
                      <h2 className="text-lg font-extrabold uppercase tracking-wide text-on-surface">
                        Identitas Pemilik & Kontak
                      </h2>
                      <p className="text-xs text-on-surface-variant leading-relaxed mt-1">
                        Masukkan data pemilik usaha sesuai KTP dan kontak aktif yang dapat menerima OTP.
                      </p>
                    </div>

                    <div className="bento-card space-y-5">
                      {/* Nama Pemilik */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-on-surface-variant" htmlFor="namaPemilik">
                          NAMA LENGKAP PEMILIK (SESUAI KTP)
                        </label>
                        <input
                          type="text"
                          id="namaPemilik"
                          placeholder="Contoh: BUDI SANTOSO"
                          value={formData.namaPemilik}
                          onChange={(e) => handleInputChange("namaPemilik", e.target.value)}
                          className={`w-full min-h-[48px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none ${
                            errors.namaPemilik ? "border-error" : ""
                          }`}
                        />
                        {errors.namaPemilik && (
                          <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {errors.namaPemilik}
                          </p>
                        )}
                      </div>

                      {/* Jenis Kelamin Buttons */}
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-on-surface-variant">
                          JENIS KELAMIN
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => handleInputChange("jenisKelamin", "Laki-laki")}
                            className={`flex items-center justify-center gap-2 p-3 rounded border text-xs font-bold transition-all ${
                              formData.jenisKelamin === "Laki-laki"
                                ? "border-primary-container bg-primary-container/5 text-primary-container"
                                : "border-border-light hover:bg-surface-container-low text-on-surface"
                            }`}
                          >
                            <span className="material-symbols-outlined text-base">male</span>
                            Laki-laki
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInputChange("jenisKelamin", "Perempuan")}
                            className={`flex items-center justify-center gap-2 p-3 rounded border text-xs font-bold transition-all ${
                              formData.jenisKelamin === "Perempuan"
                                ? "border-primary-container bg-primary-container/5 text-primary-container"
                                : "border-border-light hover:bg-surface-container-low text-on-surface"
                            }`}
                          >
                            <span className="material-symbols-outlined text-base">female</span>
                            Perempuan
                          </button>
                        </div>
                      </div>

                      {/* NIK */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-on-surface-variant" htmlFor="nik">
                          NIK (NOMOR INDUK KEPENDUDUKAN)
                        </label>
                        <input
                          type="text"
                          id="nik"
                          placeholder="Contoh: 327301XXXXXXXXXX"
                          value={formData.nik}
                          onChange={(e) => handleInputChange("nik", e.target.value)}
                          className={`w-full min-h-[48px] px-3.5 py-2.5 rounded border border-border-light bg-white font-mono text-xs tracking-wider focus:border-primary-container focus:outline-none ${
                            errors.nik ? "border-error" : ""
                          }`}
                        />
                        {formData.nik && (
                          <p className="text-[10px] text-primary-container font-mono font-bold">
                            Terformat: {formatNIK(formData.nik)}
                          </p>
                        )}
                        {errors.nik && (
                          <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {errors.nik}
                          </p>
                        )}
                      </div>

                      {/* Tanggal Lahir */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-on-surface-variant" htmlFor="tanggalLahir">
                          TANGGAL LAHIR
                        </label>
                        <input
                          type="date"
                          id="tanggalLahir"
                          value={formData.tanggalLahir}
                          onChange={(e) => handleInputChange("tanggalLahir", e.target.value)}
                          className={`w-full min-h-[48px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs focus:border-primary-container focus:outline-none ${
                            errors.tanggalLahir ? "border-error" : ""
                          }`}
                        />
                        {errors.tanggalLahir && (
                          <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {errors.tanggalLahir}
                          </p>
                        )}
                      </div>

                      {/* WhatsApp */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-on-surface-variant" htmlFor="nomorHp">
                          NOMOR WHATSAPP AKTIF
                        </label>
                        <input
                          type="text"
                          id="nomorHp"
                          placeholder="Contoh: 08123456789"
                          value={formData.nomorHp}
                          onChange={(e) => handleInputChange("nomorHp", e.target.value)}
                          className={`w-full min-h-[48px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none ${
                            errors.nomorHp ? "border-error" : ""
                          }`}
                        />
                        <p className="text-[9px] text-on-surface-variant leading-relaxed font-bold">
                          Digunakan untuk validasi pendaftaran dan pengiriman OTP resmi oleh BKPM RI.
                        </p>
                        {errors.nomorHp && (
                          <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {errors.nomorHp}
                          </p>
                        )}
                      </div>

                      {/* Email */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-on-surface-variant" htmlFor="email">
                          ALAMAT EMAIL AKTIF
                        </label>
                        <input
                          type="email"
                          id="email"
                          placeholder="Contoh: budi@gmail.com"
                          value={formData.email}
                          onChange={(e) => handleInputChange("email", e.target.value)}
                          className={`w-full min-h-[48px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs focus:border-primary-container focus:outline-none ${
                            errors.email ? "border-error" : ""
                          }`}
                        />
                        {errors.email && (
                          <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {errors.email}
                          </p>
                        )}
                      </div>

                    </div>
                  </>
                )}

              </div>
            )}

            {/* ── STEP 2: LOKASI USAHA (Leaflet Map Bottom Sheet UX) ── */}
            {currentStep === 2 && (
              <div className="animate-fadeIn space-y-6">
                
                <div>
                  <h2 className="text-lg font-extrabold uppercase tracking-wide text-on-surface">
                    Lokasi Usaha
                  </h2>
                  <p className="text-xs text-on-surface-variant leading-relaxed mt-1">
                    {akunOss === "sudah"
                      ? "Masukkan alamat operasional dan titik koordinat tempat usaha Anda untuk pendaftaran izin NIB."
                      : "Masukkan alamat lengkap domisili KTP dan alamat operasional tempat usaha Anda."}
                  </p>
                </div>

                {/* KTP Address (Only shown for new accounts) */}
                {akunOss !== "sudah" && (
                  <div className="bento-card space-y-5">
                    <h3 className="text-xs font-extrabold text-on-surface border-b border-border-light pb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-primary-container">badge</span>
                      ALAMAT DOMISILI SESUAI KTP
                    </h3>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="alamatKtp">
                        Alamat Jalan, RT/RW
                      </label>
                      <textarea
                        id="alamatKtp"
                        placeholder="Contoh: JL. DIPONEGORO NO. 42, RT 03/RW 04"
                        rows={2}
                        value={formData.alamatKtp}
                        onChange={(e) => handleInputChange("alamatKtp", e.target.value)}
                        className={`w-full p-3.5 rounded border border-border-light bg-white text-xs focus:border-primary-container focus:outline-none ${
                          errors.alamatKtp ? "border-error" : ""
                        }`}
                      />
                      {errors.alamatKtp && <p className="text-[10px] text-error font-semibold">{errors.alamatKtp}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Provinsi</label>
                        <SearchableSelect
                          options={provincesList.map((p) => ({ value: p.id, label: p.name.toUpperCase() }))}
                          value={selectedKtpProvId}
                          onChange={handleKtpProvinceChange}
                          placeholder={loadingKtpRegions.provinsi ? "Memuat..." : "-- Pilih --"}
                        />
                        {errors.provinsiKtp && <p className="text-[10px] text-error font-semibold">{errors.provinsiKtp}</p>}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Kota / Kabupaten</label>
                        <SearchableSelect
                          options={citiesKtpList.map((c) => ({ value: c.id, label: c.name.toUpperCase() }))}
                          value={selectedKtpCityId}
                          disabled={!selectedKtpProvId || loadingKtpRegions.kotaKabupaten}
                          onChange={handleKtpCityChange}
                          placeholder={loadingKtpRegions.kotaKabupaten ? "Memuat..." : "-- Pilih --"}
                        />
                        {errors.kotaKabupatenKtp && <p className="text-[10px] text-error font-semibold">{errors.kotaKabupatenKtp}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Kecamatan</label>
                        <SearchableSelect
                          options={districtsKtpList.map((d) => ({ value: d.id, label: d.name.toUpperCase() }))}
                          value={selectedKtpDistId}
                          disabled={!selectedKtpCityId || loadingKtpRegions.kecamatan}
                          onChange={handleKtpDistrictChange}
                          placeholder={loadingKtpRegions.kecamatan ? "Memuat..." : "-- Pilih --"}
                        />
                        {errors.kecamatanKtp && <p className="text-[10px] text-error font-semibold">{errors.kecamatanKtp}</p>}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Kelurahan / Desa</label>
                        <SearchableSelect
                          options={villagesKtpList.map((s) => ({ value: s.id, label: s.name.toUpperCase() }))}
                          value={villagesKtpList.find((v) => v.name.toUpperCase() === formData.kelurahanKtp)?.id || ""}
                          disabled={!selectedKtpDistId || loadingKtpRegions.kelurahan}
                          onChange={handleKtpVillageChange}
                          placeholder={loadingKtpRegions.kelurahan ? "Memuat..." : "-- Pilih --"}
                        />
                        {errors.kelurahanKtp && <p className="text-[10px] text-error font-semibold">{errors.kelurahanKtp}</p>}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-on-surface-variant">KODE POS (KTP)</label>
                      <input
                        type="text"
                        placeholder="Contoh: 16143"
                        value={formData.kodePosKtp}
                        onChange={(e) => handleInputChange("kodePosKtp", e.target.value.replace(/\D/g, "").slice(0, 5))}
                        className="w-full min-h-[48px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs focus:border-primary-container focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Business Address */}
                <div className="bento-card space-y-5">
                  <h3 className="text-xs font-extrabold text-on-surface border-b border-border-light pb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-primary-container">store</span>
                    ALAMAT LOKASI USAHA OPERASIONAL
                  </h3>

                  {akunOss !== "sudah" && (
                    <div className="flex items-center gap-2 py-1">
                      <input
                        type="checkbox"
                        id="isAddressSame"
                        checked={formData.isAddressSame}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFormData((prev) => ({
                            ...prev,
                            isAddressSame: checked,
                            alamatUsaha: checked ? prev.alamatKtp : "",
                            provinsi: checked ? prev.provinsiKtp : "",
                            kotaKabupaten: checked ? prev.kotaKabupatenKtp : "",
                            kecamatan: checked ? prev.kecamatanKtp : "",
                            kelurahan: checked ? prev.kelurahanKtp : "",
                            kodePos: checked ? prev.kodePosKtp : ""
                          }));
                          if (checked) {
                            setSelectedProvId(selectedKtpProvId);
                            setSelectedCityId(selectedKtpCityId);
                            setSelectedDistId(selectedKtpDistId);
                            setCitiesList(citiesKtpList);
                            setDistrictsList(districtsKtpList);
                            setVillagesList(villagesKtpList);
                          }
                          if (errors.alamatUsaha) setErrors((prev) => ({ ...prev, alamatUsaha: "" }));
                          triggerAutosave();
                        }}
                        className="w-4 h-4 rounded text-primary-container focus:ring-primary-container"
                      />
                      <label htmlFor="isAddressSame" className="text-xs font-bold text-on-surface-variant cursor-pointer select-none">
                        Alamat usaha sama dengan alamat KTP
                      </label>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="alamatUsaha">
                      Alamat Lengkap Usaha (Jalan, No, RT/RW)
                    </label>
                    <textarea
                      id="alamatUsaha"
                      placeholder="Contoh: JL. RAYA PAJAJARAN NO. 100, BOGOR"
                      rows={2}
                      value={formData.alamatUsaha}
                      disabled={formData.isAddressSame}
                      onChange={(e) => handleInputChange("alamatUsaha", e.target.value)}
                      className={`w-full p-3.5 rounded border border-border-light bg-white text-xs focus:border-primary-container focus:outline-none disabled:opacity-50 disabled:bg-surface-container ${
                        errors.alamatUsaha ? "border-error" : ""
                      }`}
                    />
                    {errors.alamatUsaha && <p className="text-[10px] text-error font-semibold">{errors.alamatUsaha}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Provinsi</label>
                      <SearchableSelect
                        options={provincesList.map((p) => ({ value: p.id, label: p.name.toUpperCase() }))}
                        value={selectedProvId}
                        disabled={formData.isAddressSame}
                        onChange={handleProvinceChange}
                        placeholder={loadingRegions.provinsi ? "Memuat..." : "-- Pilih --"}
                      />
                      {errors.provinsi && <p className="text-[10px] text-error font-semibold">{errors.provinsi}</p>}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Kota / Kabupaten</label>
                      <SearchableSelect
                        options={citiesList.map((c) => ({ value: c.id, label: c.name.toUpperCase() }))}
                        value={selectedCityId}
                        disabled={formData.isAddressSame || !selectedProvId || loadingRegions.kotaKabupaten}
                        onChange={handleCityChange}
                        placeholder={loadingRegions.kotaKabupaten ? "Memuat..." : "-- Pilih --"}
                      />
                      {errors.kotaKabupaten && <p className="text-[10px] text-error font-semibold">{errors.kotaKabupaten}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Kecamatan</label>
                      <SearchableSelect
                        options={districtsList.map((d) => ({ value: d.id, label: d.name.toUpperCase() }))}
                        value={selectedDistId}
                        disabled={formData.isAddressSame || !selectedCityId || loadingRegions.kecamatan}
                        onChange={handleDistrictChange}
                        placeholder={loadingRegions.kecamatan ? "Memuat..." : "-- Pilih --"}
                      />
                      {errors.kecamatan && <p className="text-[10px] text-error font-semibold">{errors.kecamatan}</p>}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Kelurahan / Desa</label>
                      <SearchableSelect
                        options={villagesList.map((s) => ({ value: s.id, label: s.name.toUpperCase() }))}
                        value={villagesList.find((v) => v.name.toUpperCase() === formData.kelurahan)?.id || ""}
                        disabled={formData.isAddressSame || !selectedDistId || loadingRegions.kelurahan}
                        onChange={handleVillageChange}
                        placeholder={loadingRegions.kelurahan ? "Memuat..." : "-- Pilih --"}
                      />
                      {errors.kelurahan && <p className="text-[10px] text-error font-semibold">{errors.kelurahan}</p>}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant">KODE POS</label>
                    <input
                      type="text"
                      placeholder="Contoh: 16143"
                      value={formData.kodePos}
                      disabled={formData.isAddressSame}
                      onChange={(e) => handleInputChange("kodePos", e.target.value.replace(/\D/g, "").slice(0, 5))}
                      className="w-full min-h-[48px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs focus:border-primary-container focus:outline-none disabled:opacity-50 disabled:bg-surface-container"
                    />
                  </div>
                </div>

                {/* Map Coordinates Section (Responsive Trigger Button & Sheet on mobile) */}
                <div className="bento-card space-y-4">
                  <div className="flex justify-between items-center border-b border-border-light pb-2">
                    <span className="text-xs font-extrabold text-on-surface uppercase tracking-wide flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary-container">explore</span>
                      PINPOINT KOORDINAT USAHA
                    </span>
                    <button
                      type="button"
                      onClick={searchCoordinates}
                      disabled={isGeocoding}
                      className="px-3 py-1.5 rounded bg-primary-container text-white text-[10px] font-bold uppercase tracking-wider hover:bg-primary transition-all disabled:opacity-50 flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-xs animate-spin-slow">
                        {isGeocoding ? "sync" : "travel_explore"}
                      </span>
                      {isGeocoding ? "Mencari..." : "Autofill Koordinat"}
                    </button>
                  </div>

                  {geocodeError && (
                    <div className="p-3 bg-error/5 border border-error/20 rounded text-xs text-error font-semibold flex items-start gap-1.5">
                      <span className="material-symbols-outlined text-sm flex-shrink-0">warning</span>
                      <span>{geocodeError}</span>
                    </div>
                  )}

                  {/* Latitude and Longitude Grid Inputs (both Desktop and Mobile) */}
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-on-surface-variant uppercase">Latitude</label>
                      <input
                        type="text"
                        value={formData.latitude}
                        onChange={(e) => handleInputChange("latitude", e.target.value)}
                        className="w-full min-h-[40px] px-3 py-1.5 rounded border border-border-light bg-white text-xs font-mono focus:border-primary-container focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-on-surface-variant uppercase">Longitude</label>
                      <input
                        type="text"
                        value={formData.longitude}
                        onChange={(e) => handleInputChange("longitude", e.target.value)}
                        className="w-full min-h-[40px] px-3 py-1.5 rounded border border-border-light bg-white text-xs font-mono focus:border-primary-container focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Mobile Trigger Button for Bottom Sheet Modal */}
                  <div className="md:hidden w-full">
                    <button
                      type="button"
                      onClick={() => setIsMapModalOpen(true)}
                      className="w-full py-3 px-4 border border-primary-container text-primary-container hover:bg-primary-container/5 rounded font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">map</span>
                      Pilih Lokasi di Peta
                    </button>
                  </div>

                  {/* Desktop Inline Map View */}
                  <div className="hidden md:flex flex-col gap-4 w-full">
                    <div className="relative w-full rounded overflow-hidden border border-border-light flex flex-col">
                      <div className="w-full" style={{ height: "200px", minHeight: "200px" }}>
                        <LeafletMap
                          latitude={formData.latitude}
                          longitude={formData.longitude}
                          onChange={(lat, lng) => {
                            setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }));
                            if (errors.coordinates) setErrors((prev) => ({ ...prev, coordinates: "" }));
                          }}
                        />
                      </div>
                      <div className="bg-[#F3F4F6] px-3 py-1.5 border-t border-border-light text-[9px] text-on-surface-variant font-bold text-center">
                        Geser pin / klik peta untuk menentukan titik koordinat presisi.
                      </div>
                    </div>
                  </div>

                  {errors.coordinates && (
                    <p className="text-xs text-error font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">error</span>
                      {errors.coordinates}
                    </p>
                  )}
                </div>

                {/* Upload Photo Card */}
                <div className="bento-card space-y-4">
                  <h3 className="text-xs font-extrabold text-on-surface border-b border-border-light pb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-primary-container">add_a_photo</span>
                    FOTO LOKASI TEMPAT USAHA
                  </h3>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Unggah foto tempat/operasional usaha Anda (maksimal 8MB) sebagai bukti fisik perizinan.
                  </p>

                  <div className="flex flex-col items-center justify-center border border-dashed border-outline-variant hover:border-primary-container rounded p-6 transition-all bg-transparent relative group">
                    {formData.fotoLokasi ? (
                      <div className="flex flex-col items-center gap-3 w-full">
                        <div className="relative w-full h-[180px] rounded overflow-hidden border border-border-light">
                          <img
                            src={formData.fotoLokasi}
                            alt="Pratinjau Foto Lokasi"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, fotoLokasi: "" }));
                            triggerAutosave();
                          }}
                          className="px-4 py-2 rounded border border-error text-error text-xs font-bold hover:bg-error/5 transition-all flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                          Hapus Foto
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center gap-2 text-center w-full">
                        <span className="material-symbols-outlined text-3xl text-outline group-hover:text-primary-container transition-colors">
                          photo_camera_back
                        </span>
                        <div>
                          <span className="text-xs font-bold text-primary-container hover:underline">
                            Pilih file gambar
                          </span>
                          <span className="text-xs text-outline font-semibold"> atau seret ke sini</span>
                        </div>
                        <p className="text-[9px] text-outline font-medium">
                          Mendukung PNG, JPG, JPEG (Maks. 8MB)
                        </p>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handlePhotoChange}
                        />
                      </label>
                    )}
                  </div>

                  {errors.fotoLokasi && (
                    <p className="text-xs text-error font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">error</span>
                      {errors.fotoLokasi}
                    </p>
                  )}
                </div>


              </div>
            )}

            {/* ── STEP 3: CERITA USAHA (KBLI Prep) ── */}
            {currentStep === 3 && (
              <div className="animate-fadeIn space-y-6">
                
                <div>
                  <h2 className="text-lg font-extrabold uppercase tracking-wide text-on-surface">
                    Cerita Usaha (KBLI Prep)
                  </h2>
                  <p className="text-xs text-on-surface-variant leading-relaxed mt-1">
                    Deskripsikan usaha Anda secara terperinci. Ini akan digunakan oleh AI untuk menyarankan kode KBLI yang cocok.
                  </p>
                </div>

                <div className="bento-card space-y-5">
                  {/* Flow Tab Selector */}
                  <div className="flex bg-[#F3F4F6] p-1 rounded-lg w-full">
                    <button
                      type="button"
                      onClick={() => {
                        setKbliFlow("popular");
                        setIsAiRecommended(false);
                        if (isAiRecommended) {
                          fetchRecommendations("");
                        }
                        if (errors.ceritaUsaha) {
                          setErrors((prev) => {
                            const copy = { ...prev };
                            delete copy.ceritaUsaha;
                            return copy;
                          });
                        }
                      }}
                      className={`flex-1 text-center py-2.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        kbliFlow === "popular"
                          ? "bg-primary-container text-white shadow-sm"
                          : "text-on-surface-variant hover:bg-white/50"
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">trending_up</span>
                      KBLI Populer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setKbliFlow("ai");
                        setIsAiRecommended(recommendations.length > 0 && isAiRecommended);
                      }}
                      className={`flex-1 text-center py-2.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        kbliFlow === "ai"
                          ? "bg-primary-container text-white shadow-sm"
                          : "text-on-surface-variant hover:bg-white/50"
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">psychology</span>
                      Analisis AI
                    </button>
                  </div>

                  {/* Nama Usaha */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="namaUsaha">
                      NAMA TOKO / WARUNG / NAMA USAHA
                    </label>
                    <input
                      type="text"
                      id="namaUsaha"
                      placeholder="Contoh: WARUNG BAKSO MAKNYUS, KATERING MELATI"
                      value={formData.namaUsaha}
                      onChange={(e) => handleInputChange("namaUsaha", e.target.value)}
                      className={`w-full min-h-[48px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none ${
                        errors.namaUsaha ? "border-error" : ""
                      }`}
                    />
                    {errors.namaUsaha && (
                      <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">error</span>
                        {errors.namaUsaha}
                      </p>
                    )}
                  </div>

                  {/* Deskripsi/Cerita Usaha (ONLY in AI flow) */}
                  {kbliFlow === "ai" && (
                    <div className="flex flex-col gap-1.5 animate-fadeIn">
                      <label className="text-xs font-bold text-on-surface-variant" htmlFor="ceritaUsaha">
                        DESKRIPSI USAHA LENGKAP
                      </label>
                      <textarea
                        id="ceritaUsaha"
                        placeholder="Contoh: Saya menjual ayam geprek pedas dan nasi kotak secara online lewat GoFood/GrabFood. Saya memasak sendiri di rumah dibantu satu orang tetangga untuk membungkus makanan."
                        rows={5}
                        value={formData.ceritaUsaha}
                        onChange={(e) => handleInputChange("ceritaUsaha", e.target.value)}
                        className={`w-full p-3.5 rounded border border-border-light bg-white text-xs focus:border-primary-container focus:outline-none leading-relaxed ${
                          errors.ceritaUsaha ? "border-error" : ""
                        }`}
                      />
                      <p className="text-[10px] text-on-surface-variant leading-relaxed font-bold">
                        <strong>💡 Tips:</strong> Ceritakan apa produknya, bagaimana penjualannya (online/offline), dan proses produksinya secara santai agar AI dapat memetakan KBLI secara akurat.
                      </p>
                      {errors.ceritaUsaha && (
                        <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">error</span>
                          {errors.ceritaUsaha}
                        </p>
                      )}

                      {/* AI Recommendation Trigger Button */}
                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          disabled={loadingKbli || formData.ceritaUsaha.trim().length < 15}
                          onClick={() => fetchRecommendations(formData.ceritaUsaha)}
                          className="bg-primary-container hover:bg-primary text-white text-[10px] font-bold uppercase tracking-wider py-2 px-3.5 rounded flex items-center gap-1.5 transition-all disabled:opacity-50 active:scale-[0.98] cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-xs animate-pulse">auto_awesome</span>
                          {loadingKbli ? "Menganalisis..." : "Cari Rekomendasi KBLI (AI)"}
                        </button>
                      </div>
                    </div>
                  )}

                  {errors.kbli && (
                    <div className="pt-2">
                      <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">error</span>
                        {errors.kbli}
                      </p>
                    </div>
                  )}
                </div>

                {/* KBLI Recommendations Card */}
                {(recommendations.length > 0 || loadingKbli || kbliError) && (
                  <div className="bento-card space-y-4 animate-fadeIn">
                    
                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-border-light pb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-primary-container text-sm">list_alt</span>
                        Hasil Rekomendasi KBLI {isAiRecommended ? "(AI)" : "(Populer)"}
                      </span>
                      {!loadingKbli && recommendations.length > 0 && (
                        <span className="text-[9px] text-outline font-bold bg-[#F3F4F6] border border-border-light px-2 py-0.5 rounded uppercase">
                          {recommendations.length} Rekomendasi
                        </span>
                      )}
                    </div>

                    {/* Shimmer loading */}
                    {loadingKbli ? (
                      <div className="space-y-4 animate-pulse pt-2">
                        {[1, 2].map((i) => (
                          <div key={i} className="border border-border-light rounded-lg p-4 space-y-3">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <div className="w-12 h-8 rounded bg-[#ECEEF0] animate-pulse" />
                                <div className="w-24 h-4 rounded bg-[#ECEEF0] animate-pulse" />
                              </div>
                              <div className="w-16 h-4 rounded bg-[#ECEEF0] animate-pulse" />
                            </div>
                            <div className="w-full h-4 rounded bg-[#ECEEF0] animate-pulse" />
                          </div>
                        ))}
                      </div>
                    ) : kbliError ? (
                      <div className="p-4 bg-error/5 border border-error/15 rounded text-center text-xs text-error font-semibold">
                        {kbliError}
                      </div>
                    ) : (
                      <div className="space-y-4 pt-2">
                        
                        {/* Segmented Risk Tag */}
                        <div className="flex rounded overflow-hidden border border-border-light w-fit">
                          <span className="bg-[#7C2D12] text-white font-extrabold text-[9px] px-2.5 py-1.5 uppercase tracking-wider">
                            KBLI 2020 / 2025
                          </span>
                          <span className="bg-[#1A4384] text-white font-extrabold text-[9px] px-2.5 py-1.5 uppercase tracking-wider border-l border-border-light">
                            Tingkat Risiko Rendah
                          </span>
                        </div>

                        {/* List */}
                        <div className="space-y-3">
                          {recommendations.map((kbli) => {
                            const isSelected = selectedKbliCode === kbli.code;
                            const isExpanded = expandedKbliCard === kbli.code;
                            const details = getKBLIDetails(kbli.code, kbli.description, kbli.suitableFor);

                            return (
                              <div 
                                key={kbli.code} 
                                className={`bg-white border rounded-lg transition-all ${
                                  isSelected ? "border-primary-container bg-primary-container/5" : "border-border-light"
                                }`}
                              >
                                
                                {/* Card Header (Collapsible trigger) */}
                                <div 
                                  onClick={() => setExpandedKbliCard(isExpanded ? null : kbli.code)}
                                  className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    {/* Index Badge */}
                                    <div className="w-12 h-9 rounded bg-[#F3F4F6] text-primary-container font-mono font-bold text-xs flex items-center justify-center shrink-0">
                                      {kbli.code}
                                    </div>

                                    {/* Title & Confidence */}
                                    <div className="min-w-0">
                                      <h3 className="font-bold text-xs md:text-sm text-on-surface truncate pr-2">
                                        {kbli.title}
                                      </h3>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className={`inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
                                          kbli.confidence === "sangat_cocok"
                                            ? "text-success"
                                            : "text-warning"
                                        }`}>
                                          <span className="material-symbols-outlined text-[10px] fill-current">
                                            {kbli.confidence === "sangat_cocok" ? "verified" : "info"}
                                          </span>
                                          {kbli.confidence === "sangat_cocok" ? "Sangat Cocok" : "Alternatif"}
                                        </span>
                                        {kbli.version && (
                                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border shrink-0 ${
                                            kbli.version === "2025"
                                              ? "bg-[#1A4384]/10 border-[#1A4384]/30 text-[#1A4384]"
                                              : "bg-[#7C2D12]/10 border-[#7C2D12]/30 text-[#7C2D12]"
                                          }`}>
                                            KBLI {kbli.version}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Chevron */}
                                  <span className="material-symbols-outlined text-outline text-lg transition-transform duration-200" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                                    expand_more
                                  </span>
                                </div>

                                {/* Collapsible Body */}
                                {isExpanded && (
                                  <div className="px-3.5 pb-3.5 border-t border-border-light pt-3.5 space-y-3.5 animate-slideDown">
                                    
                                    {/* Summary */}
                                    <div className="space-y-1">
                                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-outline">
                                        Ringkasan Awam
                                      </span>
                                      <p className="text-xs font-semibold text-on-surface leading-relaxed">
                                        {details.summary}
                                      </p>
                                    </div>

                                    {/* Suitable */}
                                    <div className="space-y-1.5">
                                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-outline block">
                                        Cocok Untuk Jenis Usaha:
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {details.suitable.map((tag) => (
                                          <span 
                                            key={tag}
                                            className="bg-success/5 text-success border border-success/20 font-bold text-[9px] px-2 py-0.5 rounded flex items-center gap-0.5"
                                          >
                                            <span className="material-symbols-outlined text-[10px]">check</span>
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Unsuitable */}
                                    <div className="space-y-1.5">
                                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-outline block">
                                        Tidak Cocok Untuk:
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {details.unsuitable.map((tag) => (
                                          <span 
                                            key={tag}
                                            className="bg-error/5 text-error border border-error/20 font-bold text-[9px] px-2 py-0.5 rounded flex items-center gap-0.5"
                                          >
                                            <span className="material-symbols-outlined text-[10px]">close</span>
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Select Button */}
                                    <div className="pt-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedKbliCode(kbli.code);
                                          sessionStorage.setItem("selected_kbli", JSON.stringify(kbli));
                                          if (errors.kbli) setErrors((prev) => ({ ...prev, kbli: "" }));
                                        }}
                                        className={`w-full py-2 rounded text-xs font-bold uppercase tracking-wider border flex items-center justify-center gap-2 transition-all ${
                                          isSelected
                                            ? "bg-primary-container text-white border-primary-container"
                                            : "border-primary-container text-primary-container hover:bg-primary-container/5"
                                        }`}
                                      >
                                        <span className="material-symbols-outlined text-sm">
                                          {isSelected ? "check_circle" : "check"}
                                        </span>
                                        {isSelected ? "KBLI Ini Terpilih" : "Pilih KBLI Ini"}
                                      </button>
                                    </div>

                                  </div>
                                )}

                              </div>
                            );
                          })}
                        </div>

                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* ── STEP 4: SKALA USAHA & TENAGA KERJA ── */}
            {currentStep === 4 && (
              <div className="animate-fadeIn space-y-6">
                
                <div>
                  <h2 className="text-lg font-extrabold uppercase tracking-wide text-on-surface">
                    Skala Usaha & Tenaga Kerja
                  </h2>
                  <p className="text-xs text-on-surface-variant leading-relaxed mt-1">
                    Lengkapi parameter operasional berikut untuk menentukan tingkat risiko perizinan di portal OSS.
                  </p>
                </div>

                <div className="bento-card space-y-5">
                  {/* Modal Usaha */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="modalUsaha">
                      MODAL USAHA (TIDAK TERMASUK TANAH & BANGUNAN)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="modalUsaha"
                        placeholder="Contoh: 15000000"
                        value={formData.modalUsaha}
                        onChange={(e) => handleInputChange("modalUsaha", e.target.value.replace(/\D/g, ""))}
                        className={`w-full min-h-[48px] pl-10 pr-4 py-2.5 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none ${
                          errors.modalUsaha ? "border-error" : ""
                        }`}
                      />
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-outline">
                        Rp
                      </span>
                    </div>
                    {formData.modalUsaha && (
                      <p className="text-[11px] text-primary-container font-bold">
                        Terbaca: Rp {parseInt(formData.modalUsaha).toLocaleString("id-ID")}
                      </p>
                    )}
                    {errors.modalUsaha && (
                      <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">error</span>
                        {errors.modalUsaha}
                      </p>
                    )}
                  </div>

                  {/* Luas Lahan */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="luasTanah">
                      LUAS LAHAN / TANAH USAHA
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="luasTanah"
                        placeholder="Contoh: 50"
                        value={formData.luasTanah}
                        onChange={(e) => handleInputChange("luasTanah", e.target.value.replace(/\D/g, ""))}
                        className={`w-full min-h-[48px] pr-10 pl-4 py-2.5 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none ${
                          errors.luasTanah ? "border-error" : ""
                        }`}
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-outline">
                        m²
                      </span>
                    </div>
                    {errors.luasTanah && (
                      <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">error</span>
                        {errors.luasTanah}
                      </p>
                    )}
                  </div>

                  {/* Tenaga Kerja */}
                  <div className="border-t border-border-light pt-3 flex flex-col gap-3">
                    <label className="text-xs font-bold text-on-surface-variant">
                      JUMLAH TENAGA KERJA (TERMASUK PEMILIK)
                    </label>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Laki-laki */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase">Laki-laki</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const val = Math.max(0, parseInt(formData.jumlahPekerjaLakiLaki || "0") - 1);
                              handleWorkerChange("jumlahPekerjaLakiLaki", val.toString());
                            }}
                            className="w-8 h-8 rounded-full border border-border-light hover:bg-[#F3F4F6] flex items-center justify-center font-bold text-xs"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            value={formData.jumlahPekerjaLakiLaki}
                            onChange={(e) => handleWorkerChange("jumlahPekerjaLakiLaki", e.target.value)}
                            className="w-12 min-h-[36px] text-center rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const val = parseInt(formData.jumlahPekerjaLakiLaki || "0") + 1;
                              handleWorkerChange("jumlahPekerjaLakiLaki", val.toString());
                            }}
                            className="w-8 h-8 rounded-full border border-border-light hover:bg-[#F3F4F6] flex items-center justify-center font-bold text-xs"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Perempuan */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase">Perempuan</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const val = Math.max(0, parseInt(formData.jumlahPekerjaPerempuan || "0") - 1);
                              handleWorkerChange("jumlahPekerjaPerempuan", val.toString());
                            }}
                            className="w-8 h-8 rounded-full border border-border-light hover:bg-[#F3F4F6] flex items-center justify-center font-bold text-xs"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            value={formData.jumlahPekerjaPerempuan}
                            onChange={(e) => handleWorkerChange("jumlahPekerjaPerempuan", e.target.value)}
                            className="w-12 min-h-[36px] text-center rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const val = parseInt(formData.jumlahPekerjaPerempuan || "0") + 1;
                              handleWorkerChange("jumlahPekerjaPerempuan", val.toString());
                            }}
                            className="w-8 h-8 rounded-full border border-border-light hover:bg-[#F3F4F6] flex items-center justify-center font-bold text-xs"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Total Workers Pill */}
                    <div className="mt-2 p-3 rounded bg-primary-container/5 border border-primary-container/10 text-primary-container text-xs font-bold flex justify-between items-center">
                      <span>Total Pekerja:</span>
                      <span className="text-sm font-extrabold">{formData.jumlahPekerja} Orang</span>
                    </div>
                  </div>

                  {/* Sumber Pembiayaan */}
                  <div className="flex flex-col gap-2 border-t border-border-light pt-4">
                    <label className="text-xs font-bold text-on-surface-variant">
                      SUMBER PEMBIAYAAN
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => handleInputChange("sumberPembiayaan", "modal_sendiri")}
                        className={`flex items-center gap-3 p-3.5 rounded border text-xs font-bold text-left transition-all ${
                          formData.sumberPembiayaan === "modal_sendiri"
                            ? "border-primary-container bg-primary-container/5 text-primary-container"
                            : "border-border-light bg-white text-on-surface hover:bg-[#F3F4F6]"
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">
                          {formData.sumberPembiayaan === "modal_sendiri" ? "radio_button_checked" : "radio_button_unchecked"}
                        </span>
                        Modal Sendiri
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInputChange("sumberPembiayaan", "pinjaman")}
                        className={`flex items-center gap-3 p-3.5 rounded border text-xs font-bold text-left transition-all ${
                          formData.sumberPembiayaan === "pinjaman"
                            ? "border-primary-container bg-primary-container/5 text-primary-container"
                            : "border-border-light bg-white text-on-surface hover:bg-[#F3F4F6]"
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">
                          {formData.sumberPembiayaan === "pinjaman" ? "radio_button_checked" : "radio_button_unchecked"}
                        </span>
                        Pinjaman
                      </button>
                    </div>
                  </div>

                  {/* Apakah kegiatan usaha ini sudah berjalan? */}
                  <div className="flex flex-col gap-1.5 border-t border-border-light pt-4">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="sudahBerjalan">
                      APAKAH KEGIATAN USAHA INI SUDAH BERJALAN?
                    </label>
                    <select
                      id="sudahBerjalan"
                      value={formData.sudahBerjalan}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleInputChange("sudahBerjalan", val);
                        if (val === "belum") {
                          handleInputChange("tanggalMulaiUsaha", "");
                          handleInputChange("tanggalMulaiOperasional", "");
                        }
                      }}
                      className="w-full min-h-[48px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none"
                    >
                      <option value="belum">Belum Berjalan</option>
                      <option value="sudah">Sudah Berjalan</option>
                    </select>
                  </div>

                  {/* Conditional datepicker fields for sudahBerjalan */}
                  {formData.sudahBerjalan === "sudah" && (
                    <div className="animate-fadeIn space-y-4 border-t border-border-light pt-4">
                      {/* Usaha Berjalan Sejak */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-on-surface-variant" htmlFor="tanggalMulaiUsaha">
                          USAHA BERJALAN SEJAK
                        </label>
                        <input
                          type="date"
                          id="tanggalMulaiUsaha"
                          value={formData.tanggalMulaiUsaha}
                          onChange={(e) => handleInputChange("tanggalMulaiUsaha", e.target.value)}
                          className={`w-full min-h-[48px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none ${
                            errors.tanggalMulaiUsaha ? "border-error" : ""
                          }`}
                        />
                        {errors.tanggalMulaiUsaha && (
                          <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {errors.tanggalMulaiUsaha}
                          </p>
                        )}
                      </div>

                      {/* Jangka Waktu Perkiraan Mulai Operasional */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-on-surface-variant" htmlFor="tanggalMulaiOperasional">
                          JANGKA WAKTU PERKIRAAN MULAI OPERASIONAL DAN/ATAU KOMERSIAL
                        </label>
                        <input
                          type="date"
                          id="tanggalMulaiOperasional"
                          value={formData.tanggalMulaiOperasional}
                          onChange={(e) => handleInputChange("tanggalMulaiOperasional", e.target.value)}
                          className={`w-full min-h-[48px] px-3.5 py-2.5 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none ${
                            errors.tanggalMulaiOperasional ? "border-error" : ""
                          }`}
                        />
                        {errors.tanggalMulaiOperasional && (
                          <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {errors.tanggalMulaiOperasional}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Hasil Penjualan Tahunan */}
                  <div className="flex flex-col gap-1.5 border-t border-border-light pt-4">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="omzetTahunan">
                      HASIL PENJUALAN TAHUNAN (ESTIMASI OMZET KOTOR TAHUNAN)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="omzetTahunan"
                        placeholder="Contoh: 120000000"
                        value={formData.omzetTahunan}
                        onChange={(e) => handleInputChange("omzetTahunan", e.target.value.replace(/\D/g, ""))}
                        className={`w-full min-h-[48px] pl-10 pr-4 py-2.5 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none ${
                          errors.omzetTahunan ? "border-error" : ""
                        }`}
                      />
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-outline">
                        Rp
                      </span>
                    </div>
                    {formData.omzetTahunan && (
                      <p className="text-[11px] text-primary-container font-bold">
                        Terbaca: Rp {parseInt(formData.omzetTahunan).toLocaleString("id-ID")}
                      </p>
                    )}
                    {errors.omzetTahunan && (
                      <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">error</span>
                        {errors.omzetTahunan}
                      </p>
                    )}
                  </div>

                  {/* Modal Kerja 3 Bulan */}
                  <div className="flex flex-col gap-1.5 border-t border-border-light pt-4">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="modalKerja">
                      MODAL KERJA 3 BULAN
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="modalKerja"
                        placeholder="Contoh: 30000000"
                        value={formData.modalKerja}
                        onChange={(e) => handleInputChange("modalKerja", e.target.value.replace(/\D/g, ""))}
                        className={`w-full min-h-[48px] pl-10 pr-4 py-2.5 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none ${
                          errors.modalKerja ? "border-error" : ""
                        }`}
                      />
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-outline">
                        Rp
                      </span>
                    </div>
                    {formData.modalKerja && (
                      <p className="text-[11px] text-primary-container font-bold">
                        Terbaca: Rp {parseInt(formData.modalKerja).toLocaleString("id-ID")}
                      </p>
                    )}
                    {errors.modalKerja && (
                      <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">error</span>
                        {errors.modalKerja}
                      </p>
                    )}
                  </div>



                </div>

              </div>
            )}

          </div>

          {/* Desktop Footer Actions */}
          <div className="hidden md:flex justify-end gap-4 border-t border-border-light pt-6 mt-4">
            <button 
              onClick={handleBack} 
              className="px-6 py-2.5 rounded border border-primary-container text-primary-container font-bold text-xs uppercase tracking-wider hover:bg-primary-container/5 transition-all min-h-[40px]"
            >
              Kembali
            </button>
            <button 
              onClick={handleNext} 
              className="px-6 py-2.5 rounded bg-primary-container text-white font-bold text-xs uppercase tracking-wider min-h-[40px] flex items-center justify-center gap-2 shadow-sm hover:bg-primary transition-all"
            >
              {currentStep === 4 ? "Simpan & Lanjut" : "Lanjutkan"}
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

        </div>
      </main>

      {/* Mobile Sticky Footer */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 glass-bar border-t border-border-light px-5 py-4 shadow-sm z-40">
        <div className="flex gap-3">
          <button 
            onClick={handleBack} 
            className="flex-1 min-h-[48px] border border-primary-container text-primary-container font-bold rounded text-xs uppercase tracking-wider hover:bg-primary-container/5 transition-all"
          >
            Kembali
          </button>
          <button 
            onClick={handleNext} 
            className="flex-1 min-h-[48px] bg-primary-container text-white font-bold rounded shadow-sm flex items-center justify-center gap-1.5 transition-all text-xs uppercase tracking-wider"
          >
            {currentStep === 4 ? "Simpan & Lanjut" : "Lanjutkan"}
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* MOBILE FULL SCREEN MAP BOTTOM SHEET MODAL */}
      {isMapModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-16 border-b border-border-light">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMapModalOpen(false)}
                className="p-2 hover:bg-surface-container rounded text-on-surface-variant flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">arrow_back</span>
              </button>
              <span className="text-sm font-extrabold text-primary-container uppercase">Pilih Lokasi Usaha</span>
            </div>
            <button
              type="button"
              onClick={() => setIsMapModalOpen(false)}
              className="px-4 py-2 bg-primary-container text-white text-xs font-bold rounded uppercase tracking-wider cursor-pointer"
            >
              Simpan Lokasi
            </button>
          </div>

          {/* Geocoding and Coord Panel */}
          <div className="bg-[#F3F4F6] p-3 border-b border-border-light flex flex-col gap-2">
            <div className="flex justify-between items-center gap-2">
              <div className="text-[10px] font-mono text-on-surface-variant font-bold">
                Lat: {formData.latitude} | Lng: {formData.longitude}
              </div>
              <button
                type="button"
                onClick={searchCoordinates}
                disabled={isGeocoding}
                className="px-2.5 py-1 bg-white border border-border-light rounded text-[9px] font-bold text-primary-container uppercase cursor-pointer"
              >
                {isGeocoding ? "..." : "Autofill dari Alamat"}
              </button>
            </div>
            {geocodeError && (
              <p className="text-[9px] text-error font-semibold leading-normal">{geocodeError}</p>
            )}
          </div>

          {/* Map Area */}
          <div className="flex-1 relative">
            <LeafletMap
              latitude={formData.latitude}
              longitude={formData.longitude}
              onChange={(lat, lng) => {
                setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }));
                if (errors.coordinates) setErrors((prev) => ({ ...prev, coordinates: "" }));
              }}
              isMobile={true}
            />
          </div>

          {/* Bottom Instructions */}
          <div className="p-4 bg-white border-t border-border-light text-center text-[10px] text-on-surface-variant leading-relaxed font-bold select-none">
            Geser peta dan ketuk lokasi presisi tempat usaha Anda untuk menjatuhkan pin merah.
          </div>
        </div>
      )}

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
    </div>
  );
}
