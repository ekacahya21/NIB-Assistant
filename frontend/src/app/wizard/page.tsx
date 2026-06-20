"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface KBLIRecommendation {
  code: string;
  title: string;
  description: string;
  confidence: "sangat_cocok" | "alternatif";
  suitableFor: string[];
}

interface KBLIUIDetails {
  summary: string;
  suitable: string[];
  unsuitable: string[];
}

const KBLI_DETAILS_MAP: Record<string, KBLIUIDetails> = {
  "56103": {
    summary: "Usaha warung makan, kedai makanan menetap atau restoran kecil siap saji.",
    suitable: ["Warung makan / warteg", "Kedai bakso & mie ayam", "Outlet ayam geprek", "Rumah makan Padang kecil"],
    unsuitable: ["Katering borongan pesta besar", "Jasa jualan keliling gerobak", "Pabrik pengolahan makanan beku"]
  },
  "56210": {
    summary: "Penyediaan makanan dan catering berdasarkan kontrak/pesanan untuk acara.",
    suitable: ["Katering syukuran & pernikahan", "Nasi kotak kantoran", "Pesanan kue basah & snack box"],
    unsuitable: ["Warung makan menetap di ruko", "Pedagang asongan keliling", "Restoran cepat saji fisik"]
  },
  "56104": {
    summary: "Penyediaan makanan keliling memakai gerobak, pikulan, atau mobil food truck.",
    suitable: ["Gerobak bakso keliling warga", "Food truck minuman keliling", "Pedagang kaki lima bongkar pasang"],
    unsuitable: ["Restoran fisik permanen", "Katering pabrik industri besar"]
  },
  "47711": {
    summary: "Perdagangan eceran baju, hijab, pakaian jadi, dan aksesori sandang fisik/online.",
    suitable: ["Butik baju & toko busana", "Jualan hijab & gamis online", "Reseller pakaian anak jadi", "Toko daster"],
    unsuitable: ["Jasa jahit pakaian kustom", "Pabrik konveksi & tenun kain", "Grosir kontainer pakaian mentah"]
  },
  "47911": {
    summary: "Perdagangan eceran aneka jenis barang khusus via toko online/marketplace/medsos.",
    suitable: ["Online shop Instagram/TikTok", "Reseller e-commerce", "Dropshipper aksesoris & perabotan"],
    unsuitable: ["Toko kelontong fisik di pasar", "Pedagang grosir offline pergudangan"]
  },
  "96200": {
    summary: "Jasa pencucian, setrika, laundry pakaian jadi, selimut, karpet, helm, sepatu.",
    suitable: ["Laundry kiloan & satuan", "Jasa cuci sepatu & tas", "Dry cleaning jas", "Jasa setrika rumahan"],
    unsuitable: ["Laundry industri skala pabrik", "Jasa bersih-bersih rumah panggilan"]
  },
  "96999": {
    summary: "Aktivitas jasa perorangan lainnya yang belum tercakup di tempat lain.",
    suitable: ["Jasa potong rambut rumahan", "Jasa setrika keliling", "Jasa asisten rumah tangga harian"],
    unsuitable: ["Klinik kecantikan medis", "Pabrik kosmetik & salon besar"]
  }
};

const getKBLIDetails = (code: string, fallbackDesc: string, fallbackSuitable: string[]): KBLIUIDetails => {
  if (KBLI_DETAILS_MAP[code]) {
    return KBLI_DETAILS_MAP[code];
  }
  return {
    summary: fallbackDesc,
    suitable: fallbackSuitable.length > 0 ? fallbackSuitable : ["Aktivitas perdagangan eceran", "Jasa perorangan mikro"],
    unsuitable: ["Usaha skala industri menengah/besar", "Ekspor-impor skala besar (Kargo kontainer)"]
  };
};

export default function WizardPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [saveStatus, setSaveStatus] = useState<"draft" | "saving" | "saved">("saved");

  // Leaflet Map states & references
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Form State
  const [formData, setFormData] = useState({
    // Step 1: Pemilik & Kontak
    namaPemilik: "",
    nik: "",
    tanggalLahir: "",
    jenisKelamin: "Laki-laki",
    nomorHp: "",
    email: "",
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
    caraPenjualan: "keduanya", // online | offline | keduanya
    // Step 4: Skala Usaha & Tenaga Kerja
    modalUsaha: "",
    luasTanah: "",
    jumlahPekerjaLakiLaki: "0",
    jumlahPekerjaPerempuan: "0",
    jumlahPekerja: "0"
  });

  // Geocoding Coordinates State
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");

  // Validation Errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // AI KBLI States
  const [recommendations, setRecommendations] = useState<KBLIRecommendation[]>([]);
  const [selectedKbliCode, setSelectedKbliCode] = useState<string>("");
  const [loadingKbli, setLoadingKbli] = useState<boolean>(false);
  const [expandedKbliCard, setExpandedKbliCard] = useState<string | null>(null);
  const [kbliError, setKbliError] = useState<string>("");

  // Fetch initial preferences from onboarding page on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("draft_form_data");
      const savedStep = sessionStorage.getItem("wizard_step");
      const scale = sessionStorage.getItem("skala_usaha") || "";
      const modalDefault = scale === "mikro" ? "50000000" : "";

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
          setFormData((prev) => ({ ...prev, ...parsed }));
        } catch (e) {
          console.error("Gagal memuat draf dari session:", e);
        }
      } else {
        setFormData((prev) => ({
          ...prev,
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

  // Load Leaflet resources dynamically on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ((window as any).L) {
      setLeafletLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => {
      setLeafletLoaded(true);
    };
    document.head.appendChild(script);
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!leafletLoaded || currentStep !== 2) return;
    
    // On mobile, only initialize if the modal sheet is actually open
    const isMobile = window.innerWidth < 768;
    if (isMobile && !isMapModalOpen) return;

    const L = (window as any).L;
    if (!L) return;

    const lat = parseFloat(formData.latitude) || -6.2088;
    const lng = parseFloat(formData.longitude) || 106.8456;

    const containerId = isMobile ? "leaflet-map-modal" : "leaflet-map-inline";
    const mapContainer = document.getElementById(containerId);
    if (!mapContainer) return;

    const customIcon = L.divIcon({
      className: "custom-leaflet-pin",
      html: `<span class="material-symbols-outlined text-primary text-3xl" style="transform: translate(-14px, -28px); filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.3)); position: absolute; font-weight: bold; pointer-events: none;">pin_drop</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28]
    });

    if (!mapRef.current) {
      const map = L.map(containerId, {
        zoomControl: true,
        scrollWheelZoom: !isMobile // Disable on mobile to prevent scrolling
      }).setView([lat, lng], 14);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      const marker = L.marker([lat, lng], { draggable: true, icon: customIcon }).addTo(map);
      markerRef.current = marker;

      marker.on("dragend", () => {
        const position = marker.getLatLng();
        setFormData((prev) => ({
          ...prev,
          latitude: position.lat.toFixed(6),
          longitude: position.lng.toFixed(6)
        }));
        if (errors.coordinates) setErrors((prev) => ({ ...prev, coordinates: "" }));
      });

      map.on("click", (e: any) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        marker.setLatLng([clickLat, clickLng]);
        setFormData((prev) => ({
          ...prev,
          latitude: clickLat.toFixed(6),
          longitude: clickLng.toFixed(6)
        }));
        if (errors.coordinates) setErrors((prev) => ({ ...prev, coordinates: "" }));
      });

      mapRef.current = map;
    } else {
      const map = mapRef.current;
      const marker = markerRef.current;
      if (map && marker) {
        const currentPos = marker.getLatLng();
        if (Math.abs(currentPos.lat - lat) > 0.0001 || Math.abs(currentPos.lng - lng) > 0.0001) {
          marker.setLatLng([lat, lng]);
          map.setView([lat, lng], map.getZoom());
        }
      }
    }

    // Trigger map invalidation to correct size issues inside modal / container
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 200);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [leafletLoaded, currentStep, isMapModalOpen, formData.latitude, formData.longitude]);

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
      field !== "jenisKelamin" &&
      field !== "provinsi" &&
      field !== "kotaKabupaten" &&
      field !== "kecamatan" &&
      field !== "kelurahan" &&
      field !== "provinsiKtp" &&
      field !== "kotaKabupatenKtp" &&
      field !== "kecamatanKtp" &&
      field !== "kelurahanKtp" &&
      field !== "caraPenjualan" &&
      field !== "jumlahPekerja"
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

  // 4-Step Validation
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
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

    if (step === 2) {
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
      if (formData.ceritaUsaha.trim().length < 15) {
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
    if (!q) return;
    setLoadingKbli(true);
    setKbliError("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/kbli/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setRecommendations(data);
          
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
              }
            } catch (e) {
              console.error(e);
            }
          }
          
          if (!loaded) {
            setSelectedKbliCode(data[0].code);
            setExpandedKbliCard(data[0].code);
            sessionStorage.setItem("selected_kbli", JSON.stringify(data[0]));
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

  // Automatically trigger KBLI recommendation if Step 3 is entered with enough text and no recommendations yet
  useEffect(() => {
    if (currentStep === 3 && formData.ceritaUsaha.trim().length >= 15 && recommendations.length <= 1) {
      fetchRecommendations(formData.ceritaUsaha);
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

  const stepsLabels = ["Identitas", "Lokasi", "Cerita", "Skala"];

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
            
            {/* ── STEP 1: IDENTITAS & KONTAK ── */}
            {currentStep === 1 && (
              <div className="animate-fadeIn space-y-6">
                
                {/* Section title */}
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
                    Masukkan alamat lengkap domisili KTP dan alamat operasional tempat usaha Anda.
                  </p>
                </div>

                {/* KTP Address */}
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
                      <select
                        value={selectedKtpProvId}
                        onChange={(e) => handleKtpProvinceChange(e.target.value)}
                        className="w-full min-h-[48px] px-3 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none"
                      >
                        <option value="">{loadingKtpRegions.provinsi ? "Memuat..." : "-- Pilih --"}</option>
                        {provincesList.map((p) => (
                          <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>
                        ))}
                      </select>
                      {errors.provinsiKtp && <p className="text-[10px] text-error font-semibold">{errors.provinsiKtp}</p>}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Kota / Kabupaten</label>
                      <select
                        value={selectedKtpCityId}
                        disabled={!selectedKtpProvId || loadingKtpRegions.kotaKabupaten}
                        onChange={(e) => handleKtpCityChange(e.target.value)}
                        className="w-full min-h-[48px] px-3 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none disabled:opacity-50"
                      >
                        <option value="">{loadingKtpRegions.kotaKabupaten ? "Memuat..." : "-- Pilih --"}</option>
                        {citiesKtpList.map((c) => (
                          <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>
                        ))}
                      </select>
                      {errors.kotaKabupatenKtp && <p className="text-[10px] text-error font-semibold">{errors.kotaKabupatenKtp}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Kecamatan</label>
                      <select
                        value={selectedKtpDistId}
                        disabled={!selectedKtpCityId || loadingKtpRegions.kecamatan}
                        onChange={(e) => handleKtpDistrictChange(e.target.value)}
                        className="w-full min-h-[48px] px-3 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none disabled:opacity-50"
                      >
                        <option value="">{loadingKtpRegions.kecamatan ? "Memuat..." : "-- Pilih --"}</option>
                        {districtsKtpList.map((d) => (
                          <option key={d.id} value={d.id}>{d.name.toUpperCase()}</option>
                        ))}
                      </select>
                      {errors.kecamatanKtp && <p className="text-[10px] text-error font-semibold">{errors.kecamatanKtp}</p>}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Kelurahan / Desa</label>
                      <select
                        value={villagesKtpList.find((v) => v.name.toUpperCase() === formData.kelurahanKtp)?.id || ""}
                        disabled={!selectedKtpDistId || loadingKtpRegions.kelurahan}
                        onChange={(e) => handleKtpVillageChange(e.target.value)}
                        className="w-full min-h-[48px] px-3 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none disabled:opacity-50"
                      >
                        <option value="">{loadingKtpRegions.kelurahan ? "Memuat..." : "-- Pilih --"}</option>
                        {villagesKtpList.map((s) => (
                          <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
                        ))}
                      </select>
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

                {/* Business Address */}
                <div className="bento-card space-y-5">
                  <h3 className="text-xs font-extrabold text-on-surface border-b border-border-light pb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-primary-container">store</span>
                    ALAMAT LOKASI USAHA OPERASIONAL
                  </h3>

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
                      <select
                        value={selectedProvId}
                        disabled={formData.isAddressSame}
                        onChange={(e) => handleProvinceChange(e.target.value)}
                        className="w-full min-h-[48px] px-3 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none disabled:opacity-50 disabled:bg-surface-container"
                      >
                        <option value="">{loadingRegions.provinsi ? "Memuat..." : "-- Pilih --"}</option>
                        {provincesList.map((p) => (
                          <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>
                        ))}
                      </select>
                      {errors.provinsi && <p className="text-[10px] text-error font-semibold">{errors.provinsi}</p>}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Kota / Kabupaten</label>
                      <select
                        value={selectedCityId}
                        disabled={formData.isAddressSame || !selectedProvId || loadingRegions.kotaKabupaten}
                        onChange={(e) => handleCityChange(e.target.value)}
                        className="w-full min-h-[48px] px-3 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none disabled:opacity-50 disabled:bg-surface-container"
                      >
                        <option value="">{loadingRegions.kotaKabupaten ? "Memuat..." : "-- Pilih --"}</option>
                        {citiesList.map((c) => (
                          <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>
                        ))}
                      </select>
                      {errors.kotaKabupaten && <p className="text-[10px] text-error font-semibold">{errors.kotaKabupaten}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Kecamatan</label>
                      <select
                        value={selectedDistId}
                        disabled={formData.isAddressSame || !selectedCityId || loadingRegions.kecamatan}
                        onChange={(e) => handleDistrictChange(e.target.value)}
                        className="w-full min-h-[48px] px-3 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none disabled:opacity-50 disabled:bg-surface-container"
                      >
                        <option value="">{loadingRegions.kecamatan ? "Memuat..." : "-- Pilih --"}</option>
                        {districtsList.map((d) => (
                          <option key={d.id} value={d.id}>{d.name.toUpperCase()}</option>
                        ))}
                      </select>
                      {errors.kecamatan && <p className="text-[10px] text-error font-semibold">{errors.kecamatan}</p>}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-extrabold text-on-surface-variant uppercase">Kelurahan / Desa</label>
                      <select
                        value={villagesList.find((v) => v.name.toUpperCase() === formData.kelurahan)?.id || ""}
                        disabled={formData.isAddressSame || !selectedDistId || loadingRegions.kelurahan}
                        onChange={(e) => handleVillageChange(e.target.value)}
                        className="w-full min-h-[48px] px-3 py-2 rounded border border-border-light bg-white text-xs font-bold focus:border-primary-container focus:outline-none disabled:opacity-50 disabled:bg-surface-container"
                      >
                        <option value="">{loadingRegions.kelurahan ? "Memuat..." : "-- Pilih --"}</option>
                        {villagesList.map((s) => (
                          <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
                        ))}
                      </select>
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

                  {/* Mobile Trigger Button for Bottom Sheet Modal */}
                  <div className="md:hidden">
                    <button
                      type="button"
                      onClick={() => setIsMapModalOpen(true)}
                      className="w-full py-3 px-4 border border-primary-container text-primary-container hover:bg-primary-container/5 rounded font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">map</span>
                      Pilih Lokasi di Peta
                    </button>
                    <div className="mt-2 text-center text-[10px] text-on-surface-variant font-mono">
                      Posisi: Lat: {formData.latitude}, Lng: {formData.longitude}
                    </div>
                  </div>

                  {/* Desktop Inline Map View */}
                  <div className="hidden md:flex flex-col gap-4 w-full">
                    <div className="grid grid-cols-2 gap-3">
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

                    <div className="relative w-full rounded overflow-hidden border border-border-light flex flex-col">
                      {!leafletLoaded && (
                        <div className="absolute inset-0 bg-[#ECEEF0] flex flex-col items-center justify-center gap-2 z-10 min-h-[200px]">
                          <span className="material-symbols-outlined text-outline animate-spin text-2xl">sync</span>
                          <p className="text-[10px] text-on-surface-variant font-bold">Memuat Peta...</p>
                        </div>
                      )}
                      <div id="leaflet-map-inline" className="w-full" style={{ height: "200px", minHeight: "200px" }} />
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

                {/* ── MOBILE FULL SCREEN MAP BOTTOM SHEET MODAL ── */}
                {isMapModalOpen && (
                  <div className="fixed inset-0 z-[9999] bg-white flex flex-col animate-fadeIn">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 h-16 border-b border-border-light">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsMapModalOpen(false)}
                          className="p-2 hover:bg-surface-container rounded text-on-surface-variant flex items-center justify-center"
                        >
                          <span className="material-symbols-outlined text-xl">arrow_back</span>
                        </button>
                        <span className="text-sm font-extrabold text-primary-container uppercase">Pilih Lokasi Usaha</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsMapModalOpen(false)}
                        className="px-4 py-2 bg-primary-container text-white text-xs font-bold rounded uppercase tracking-wider"
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
                          className="px-2.5 py-1 bg-white border border-border-light rounded text-[9px] font-bold text-primary-container uppercase"
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
                      {!leafletLoaded && (
                        <div className="absolute inset-0 bg-[#ECEEF0] flex flex-col items-center justify-center gap-2 z-10">
                          <span className="material-symbols-outlined text-outline animate-spin text-2xl">sync</span>
                          <p className="text-xs text-on-surface-variant font-bold">Memuat Peta...</p>
                        </div>
                      )}
                      <div id="leaflet-map-modal" className="w-full h-full" />
                    </div>

                    {/* Bottom Instructions */}
                    <div className="p-4 bg-white border-t border-border-light text-center text-[10px] text-on-surface-variant leading-relaxed font-bold">
                      Geser peta dan ketuk lokasi presisi tempat usaha Anda untuk menjatuhkan pin merah.
                    </div>
                  </div>
                )}

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

                  {/* Deskripsi/Cerita Usaha */}
                  <div className="flex flex-col gap-1.5">
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

                    {errors.kbli && (
                      <p className="text-[11px] text-error font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">error</span>
                        {errors.kbli}
                      </p>
                    )}
                  </div>

                </div>

                {/* KBLI Recommendations Card */}
                {(recommendations.length > 0 || loadingKbli || kbliError) && (
                  <div className="bento-card space-y-4 animate-fadeIn">
                    
                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-border-light pb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-primary-container text-sm">list_alt</span>
                        Hasil Rekomendasi KBLI (AI)
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
                            KBLI 2020
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
                                      <span className={`inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-wider mt-1 ${
                                        kbli.confidence === "sangat_cocok"
                                          ? "text-success"
                                          : "text-warning"
                                      }`}>
                                        <span className="material-symbols-outlined text-[10px] fill-current">
                                          {kbli.confidence === "sangat_cocok" ? "verified" : "info"}
                                        </span>
                                        {kbli.confidence === "sangat_cocok" ? "Sangat Cocok" : "Alternatif"}
                                      </span>
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

    </div>
  );
}
