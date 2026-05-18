"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";


export default function WizardPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [saveStatus, setSaveStatus] = useState<"draft" | "saving" | "saved">("saved");

  // Leaflet Map states & references
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Form State
  const [formData, setFormData] = useState({
    // Step 1: Pemilik
    namaPemilik: "",
    nik: "",
    tanggalLahir: "",
    jenisKelamin: "Laki-laki",
    // Step 2: Kontak & Lokasi
    nomorHp: "",
    email: "",
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
    latitude: "-6.2088", // Default to Jakarta central coordinates
    longitude: "106.8456",
    fotoLokasi: "", // base64 string
    // Step 3: Cerita Usaha & Skala
    namaUsaha: "",
    ceritaUsaha: "",
    modalUsaha: "",
    luasTanah: "",
    jumlahPekerjaLakiLaki: "0",
    jumlahPekerjaPerempuan: "0",
    jumlahPekerja: "0",
    caraPenjualan: "keduanya" // online | offline | keduanya
  });

  // Geocoding Coordinates State
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");

  // Validation Errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch initial preferences from onboarding page on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("draft_form_data");
      const scale = sessionStorage.getItem("skala_usaha") || "";
      const modalDefault = scale === "mikro" ? "50000000" : scale === "kecil" ? "200000000" : "";
      
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
        // Only update if there are actual changes to prevent render loops
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

      // Synchronize active ID indicators for dropdown selections
      setSelectedProvId((prev) => (prev !== selectedKtpProvId ? selectedKtpProvId : prev));
      setSelectedCityId((prev) => (prev !== selectedKtpCityId ? selectedKtpCityId : prev));
      setSelectedDistId((prev) => (prev !== selectedKtpDistId ? selectedKtpDistId : prev));

      // Synchronize list options
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

    // Load Leaflet css
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    // Load Leaflet script
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => {
      setLeafletLoaded(true);
    };
    document.head.appendChild(script);
  }, []);

  // Initialize and synchronize Leaflet Map when step 2 is visible
  useEffect(() => {
    if (!leafletLoaded || currentStep !== 2) return;
    const L = (window as any).L;
    if (!L) return;

    const lat = parseFloat(formData.latitude) || -6.2088;
    const lng = parseFloat(formData.longitude) || 106.8456;

    // Check if the container #leaflet-map is ready in DOM
    const mapContainer = document.getElementById("leaflet-map");
    if (!mapContainer) return;

    // Resolve Leaflet dynamic icon styling
    const customIcon = L.divIcon({
      className: "custom-leaflet-pin",
      html: `<span class="material-symbols-outlined text-primary text-3xl" style="transform: translate(-14px, -28px); filter: drop-shadow(0px 3px 6px rgba(0,0,0,0.35)); position: absolute; font-weight: bold; pointer-events: none;">pin_drop</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28]
    });

    if (!mapRef.current) {
      // Create map instance
      const map = L.map("leaflet-map", {
        zoomControl: true,
        scrollWheelZoom: false // Prevent accidental scrolling
      }).setView([lat, lng], 14);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      // Create interactive draggable marker
      const marker = L.marker([lat, lng], { draggable: true, icon: customIcon }).addTo(map);
      markerRef.current = marker;

      // Listen for marker drag movements
      marker.on("dragend", () => {
        const position = marker.getLatLng();
        setFormData((prev) => ({
          ...prev,
          latitude: position.lat.toFixed(6),
          longitude: position.lng.toFixed(6)
        }));
        if (errors.coordinates) setErrors((prev) => ({ ...prev, coordinates: "" }));
      });

      // Listen for map click actions to pin/move coordinates
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
        // Only update if marker position is significantly different to prevent loop
        const currentPos = marker.getLatLng();
        if (Math.abs(currentPos.lat - lat) > 0.0001 || Math.abs(currentPos.lng - lng) > 0.0001) {
          marker.setLatLng([lat, lng]);
          map.setView([lat, lng], map.getZoom());
        }
      }
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [leafletLoaded, currentStep, formData.latitude, formData.longitude]);

  // Fetch provinces on mount
  useEffect(() => {
    const fetchProvinces = async () => {
      try {
        setLoadingRegions((prev) => ({ ...prev, provinsi: true }));
        const res = await fetch("/api/regions?type=provinces");
        const data = await res.json();
        setProvincesList(data);
      } catch (err) {
        console.error("Gagal mengambil data provinsi Kemendagri:", err);
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

  // Search Coordinates automatically via OpenStreetMap Nominatim
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
        // Fallback to simpler search
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
          setGeocodeError("Lokasi tidak ditemukan di peta. Masukkan koordinat manual di bawah.");
        }
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      setGeocodeError("Gagal mencari koordinat secara otomatis. Silakan isi manual.");
    } finally {
      setIsGeocoding(false);
    }
  };

  // Convert uploaded Location photo to Base64
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

  // Handle Workers split changes and calculate the total sum
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

  // Simulate Autosave
  const triggerAutosave = () => {
    setSaveStatus("saving");
    setTimeout(() => {
      setSaveStatus("saved");
    }, 1000);
  };

  const handleInputChange = (field: string, value: string) => {
    let processedValue = value;

    // Transform all typed user inputs to uppercase except email and select dropdowns
    if (
      field !== "email" &&
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

    // Format NIK: limit to 16 digits
    if (field === "nik") {
      const sanitized = processedValue.replace(/\D/g, "").slice(0, 16);
      setFormData((prev) => ({ ...prev, [field]: sanitized }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
      triggerAutosave();
      return;
    }

    // Format Nomor HP: limit to digits
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

  // Step Validations
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
    }

    if (step === 2) {
      if (formData.nomorHp.length < 10) {
        newErrors.nomorHp = "Nomor WhatsApp belum lengkap.";
      }
      if (!formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        newErrors.email = "Format email tidak valid.";
      }
      if (!formData.alamatKtp.trim()) {
        newErrors.alamatKtp = "Alamat KTP harus diisi.";
      }
      if (!formData.provinsiKtp) {
        newErrors.provinsiKtp = "Pilih provinsi sesuai KTP.";
      }
      if (!formData.kotaKabupatenKtp) {
        newErrors.kotaKabupatenKtp = "Pilih kota/kabupaten sesuai KTP.";
      }
      if (!formData.kecamatanKtp) {
        newErrors.kecamatanKtp = "Pilih kecamatan sesuai KTP.";
      }
      if (!formData.kelurahanKtp) {
        newErrors.kelurahanKtp = "Pilih kelurahan sesuai KTP.";
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
        newErrors.ceritaUsaha = "Ceritakan usaha Anda lebih detail (minimal 15 karakter).";
      }
      if (!formData.modalUsaha || parseInt(formData.modalUsaha) <= 0) {
        newErrors.modalUsaha = "Masukkan perkiraan modal usaha yang valid.";
      }
      if (!formData.luasTanah || parseInt(formData.luasTanah) <= 0) {
        newErrors.luasTanah = "Masukkan luas lahan/tanah usaha yang valid (minimal 1 m²).";
      }
      if (parseInt(formData.jumlahPekerjaLakiLaki) < 0) {
        newErrors.jumlahPekerjaLakiLaki = "Jumlah tenaga kerja laki-laki tidak boleh negatif.";
      }
      if (parseInt(formData.jumlahPekerjaPerempuan) < 0) {
        newErrors.jumlahPekerjaPerempuan = "Jumlah tenaga kerja perempuan tidak boleh negatif.";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < 3) {
        setCurrentStep((prev) => prev + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        // Save to sessionStorage and proceed to KBLI suggestions
        sessionStorage.setItem("draft_form_data", JSON.stringify(formData));
        router.push("/kbli");
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      router.push("/");
    }
  };

  // Helper to format NIK as spaced sequence
  const formatNIK = (nik: string) => {
    if (!nik) return "";
    const matches = nik.match(/.{1,4}/g);
    return matches ? matches.join(" ") : nik;
  };

  return (
    <div className="flex-1 flex flex-col md:items-center justify-start bg-background min-h-screen">
      <div className="w-full max-w-max-width-form flex-grow flex flex-col relative bg-background pb-32 md:shadow-lg md:my-6 md:rounded-2xl md:border md:border-border-light overflow-hidden">
        
        {/* Top AppBar */}
        <header className="sticky top-0 z-50 flex items-center justify-between px-4 h-16 w-full bg-background border-b border-border-light">
          <button
            onClick={handleBack}
            className="text-primary hover:bg-primary-fixed-dim/20 transition-all p-2 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Kembali"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          
          <h1 className="font-sans text-lg font-bold text-primary absolute left-1/2 transform -translate-x-1/2">
            NIB Assistant
          </h1>

          <div className="flex items-center gap-1.5 ml-auto z-10">
            <div className="flex items-center gap-1 text-[10px] text-on-surface-variant font-semibold bg-surface-container-low px-2 py-1 rounded-full border border-border-light shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${
                saveStatus === "saving" ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
              }`} />
              <span className="hidden sm:inline">
                {saveStatus === "saving" ? "Menyimpan" : "Tersimpan"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-primary hover:bg-primary-fixed-dim/20 transition-all p-2 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Bantuan"
            >
              <span className="material-symbols-outlined">help</span>
            </button>
          </div>
        </header>

        {/* Stepper Design matching mockup (5 steps horizontal squircles) */}
        <div className="px-4 pt-6 flex flex-col items-center">
          <div className="flex items-center justify-between w-full max-w-[280px] md:max-w-[320px] mb-3">
            {/* Step 1 */}
            <div className={`w-9 h-9 flex items-center justify-center font-bold text-sm transition-all duration-300 rounded-[12px] ${
              currentStep === 1
                ? "bg-primary text-on-primary shadow-md shadow-primary/20 scale-105"
                : "bg-surface-container-high text-on-surface-variant/70"
            }`}>
              1
            </div>
            <div className="flex-grow h-[2px] bg-surface-container-highest mx-1" />

            {/* Step 2 */}
            <div className={`w-9 h-9 flex items-center justify-center font-bold text-sm transition-all duration-300 rounded-[12px] ${
              currentStep === 2
                ? "bg-primary text-on-primary shadow-md shadow-primary/20 scale-105"
                : "bg-surface-container-high text-on-surface-variant/70"
            }`}>
              2
            </div>
            <div className="flex-grow h-[2px] bg-surface-container-highest mx-1" />

            {/* Step 3 */}
            <div className={`w-9 h-9 flex items-center justify-center font-bold text-sm transition-all duration-300 rounded-[12px] ${
              currentStep === 3
                ? "bg-primary text-on-primary shadow-md shadow-primary/20 scale-105"
                : "bg-surface-container-high text-on-surface-variant/70"
            }`}>
              3
            </div>
            <div className="flex-grow h-[2px] bg-surface-container-highest mx-1" />

            {/* Step 4 */}
            <div className="w-9 h-9 flex items-center justify-center font-bold text-sm transition-all duration-300 rounded-[12px] bg-surface-container-high text-on-surface-variant/70">
              4
            </div>
            <div className="flex-grow h-[2px] bg-surface-container-highest mx-1" />

            {/* Step 5 */}
            <div className="w-9 h-9 flex items-center justify-center font-bold text-sm transition-all duration-300 rounded-[12px] bg-surface-container-high text-on-surface-variant/70">
              5
            </div>
          </div>
          
          {/* Label Under Stepper */}
          <div className="text-center">
            <span className="text-[10px] tracking-wider uppercase font-bold text-outline">
              Langkah {currentStep} dari 5:{" "}
              <span className="text-primary font-extrabold normal-case">
                {currentStep === 1 && "Data Pemilik"}
                {currentStep === 2 && "Kontak & Alamat"}
                {currentStep === 3 && "Cerita Usaha"}
              </span>
            </span>
          </div>
        </div>

        {/* Main Content Form Router */}
        <main className="px-4 py-6 flex-grow">
          {/* STEP 1: DATA PEMILIK */}
          {currentStep === 1 && (
            <div className="animate-fadeIn space-y-6">
              <div className="mb-2">
                <h2 className="text-2xl font-bold text-primary mb-1.5">
                  Lengkapi Data Pemilik Usaha
                </h2>
                <p className="text-on-surface-variant text-sm leading-relaxed">
                  Isi data di bawah ini sesuai KTP pemilik usaha yang didaftarkan.
                </p>
              </div>

              {/* Input: Nama Pemilik */}
              <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex flex-col gap-1.5">
                <label className="text-sm font-bold text-on-surface" htmlFor="namaPemilik">
                  Nama Pemilik Usaha (sesuai KTP)
                </label>
                <input
                  type="text"
                  id="namaPemilik"
                  placeholder="Contoh: Budi Santoso"
                  value={formData.namaPemilik}
                  onChange={(e) => handleInputChange("namaPemilik", e.target.value)}
                  className={`w-full min-h-[50px] px-3.5 py-2.5 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                    errors.namaPemilik ? "border-error focus:ring-error" : ""
                  }`}
                />
                {errors.namaPemilik && (
                  <p className="text-xs text-error font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {errors.namaPemilik}
                  </p>
                )}
              </div>

              {/* Input: Jenis Kelamin */}
              <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex flex-col gap-2">
                <label className="text-sm font-bold text-on-surface">
                  Jenis Kelamin Pemilik (sesuai KTP)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleInputChange("jenisKelamin", "Laki-laki")}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-bold transition-all ${
                      formData.jenisKelamin === "Laki-laki"
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-outline-variant hover:bg-surface-container-low text-on-surface"
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">male</span>
                    Laki-laki
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInputChange("jenisKelamin", "Perempuan")}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-bold transition-all ${
                      formData.jenisKelamin === "Perempuan"
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-outline-variant hover:bg-surface-container-low text-on-surface"
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">female</span>
                    Perempuan
                  </button>
                </div>
              </div>

              {/* Input: NIK */}
              <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex flex-col gap-1.5">
                <label className="text-sm font-bold text-on-surface" htmlFor="nik">
                  NIK (Nomor Induk Kependudukan)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="nik"
                    placeholder="Contoh: 327301XXXXXXXXXX"
                    value={formData.nik}
                    onChange={(e) => handleInputChange("nik", e.target.value)}
                    className={`w-full min-h-[50px] pl-10 pr-4 py-2.5 rounded-xl border border-outline-variant bg-transparent font-mono text-sm tracking-wider focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                      errors.nik ? "border-error focus:ring-error" : ""
                    }`}
                  />
                  <span className="material-symbols-outlined text-outline absolute left-3.5 top-1/2 -translate-y-1/2 text-lg">
                    badge
                  </span>
                </div>
                {formData.nik && (
                  <p className="text-xs text-primary font-mono font-semibold">
                    NIK terformat: {formatNIK(formData.nik)}
                  </p>
                )}
                {errors.nik && (
                  <p className="text-xs text-error font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {errors.nik}
                  </p>
                )}
              </div>

              {/* Input: Tanggal Lahir */}
              <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex flex-col gap-1.5">
                <label className="text-sm font-bold text-on-surface" htmlFor="tanggalLahir">
                  Tanggal Lahir (pemilik usaha)
                </label>
                <input
                  type="date"
                  id="tanggalLahir"
                  value={formData.tanggalLahir}
                  onChange={(e) => handleInputChange("tanggalLahir", e.target.value)}
                  className={`w-full min-h-[50px] px-3.5 py-2.5 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                    errors.tanggalLahir ? "border-error focus:ring-error" : ""
                  }`}
                />
                {errors.tanggalLahir && (
                  <p className="text-xs text-error font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {errors.tanggalLahir}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: KONTAK & LOKASI */}
          {currentStep === 2 && (
            <div className="animate-fadeIn space-y-6">
              <div className="mb-2">
                <h2 className="text-2xl font-bold text-primary mb-1.5">
                  Kontak & Alamat Usaha
                </h2>
                <p className="text-on-surface-variant text-sm leading-relaxed">
                  Masukkan nomor kontak aktif dan alamat detail lokasi fisik tempat usaha Anda.
                </p>
              </div>

              {/* Input: WhatsApp & Email */}
              <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-on-surface" htmlFor="nomorHp">
                    Nomor WhatsApp Aktif
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="nomorHp"
                      placeholder="Contoh: 08123456789"
                      value={formData.nomorHp}
                      onChange={(e) => handleInputChange("nomorHp", e.target.value)}
                      className={`w-full min-h-[50px] pl-10 pr-4 py-2.5 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                        errors.nomorHp ? "border-error focus:ring-error" : ""
                      }`}
                    />
                    <span className="material-symbols-outlined text-outline absolute left-3.5 top-1/2 -translate-y-1/2 text-lg">
                      call
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-normal">
                    WhatsApp dibutuhkan untuk menerima kode verifikasi OTP langsung dari portal OSS.
                  </p>
                  {errors.nomorHp && (
                    <p className="text-xs text-error font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">error</span>
                      {errors.nomorHp}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-on-surface" htmlFor="email">
                    Alamat Email
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      id="email"
                      placeholder="Contoh: budi@gmail.com"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      className={`w-full min-h-[50px] pl-10 pr-4 py-2.5 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                        errors.email ? "border-error focus:ring-error" : ""
                      }`}
                    />
                    <span className="material-symbols-outlined text-outline absolute left-3.5 top-1/2 -translate-y-1/2 text-lg">
                      mail
                    </span>
                  </div>
                  {errors.email && (
                    <p className="text-xs text-error font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">error</span>
                      {errors.email}
                    </p>
                  )}
                </div>
              </div>

              {/* Card A: Alamat Sesuai KTP */}
              <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex flex-col gap-4">
                <h3 className="text-sm font-bold text-on-surface border-b border-border-light pb-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-lg">badge</span>
                  Alamat Sesuai KTP
                </h3>

                {/* Input: Alamat KTP Detail */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-on-surface" htmlFor="alamatKtp">
                    Alamat Lengkap KTP
                  </label>
                  <textarea
                    id="alamatKtp"
                    placeholder="Contoh: JL. DIPONEGORO NO. 42, RT 03/RW 04, KEL. BARANANGSIANG"
                    rows={2}
                    value={formData.alamatKtp}
                    onChange={(e) => handleInputChange("alamatKtp", e.target.value)}
                    className={`w-full p-3.5 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                      errors.alamatKtp ? "border-error focus:ring-error" : ""
                    }`}
                  />
                  {errors.alamatKtp && (
                    <p className="text-xs text-error font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">error</span>
                      {errors.alamatKtp}
                    </p>
                  )}
                </div>

                {/* Province KTP Selector */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="provinsiKtp">
                      Provinsi (KTP)
                    </label>
                    <select
                      id="provinsiKtp"
                      value={selectedKtpProvId}
                      onChange={(e) => handleKtpProvinceChange(e.target.value)}
                      className="w-full min-h-[50px] px-3 py-2 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none"
                    >
                      <option value="">{loadingKtpRegions.provinsi ? "Memuat..." : "-- Pilih --"}</option>
                      {provincesList.map((p) => (
                        <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>
                      ))}
                    </select>
                    {errors.provinsiKtp && <p className="text-[10px] text-error font-semibold">{errors.provinsiKtp}</p>}
                  </div>

                  {/* City KTP Selector */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="kotaKabupatenKtp">
                      Kota / Kabupaten (KTP)
                    </label>
                    <select
                      id="kotaKabupatenKtp"
                      value={selectedKtpCityId}
                      disabled={!selectedKtpProvId || loadingKtpRegions.kotaKabupaten}
                      onChange={(e) => handleKtpCityChange(e.target.value)}
                      className="w-full min-h-[50px] px-3 py-2 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                    >
                      <option value="">{loadingKtpRegions.kotaKabupaten ? "Memuat..." : "-- Pilih --"}</option>
                      {citiesKtpList.map((c) => (
                        <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>
                      ))}
                    </select>
                    {errors.kotaKabupatenKtp && <p className="text-[10px] text-error font-semibold">{errors.kotaKabupatenKtp}</p>}
                  </div>
                </div>

                {/* District KTP Selector */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="kecamatanKtp">
                      Kecamatan (KTP)
                    </label>
                    <select
                      id="kecamatanKtp"
                      value={selectedKtpDistId}
                      disabled={!selectedKtpCityId || loadingKtpRegions.kecamatan}
                      onChange={(e) => handleKtpDistrictChange(e.target.value)}
                      className="w-full min-h-[50px] px-3 py-2 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                    >
                      <option value="">{loadingKtpRegions.kecamatan ? "Memuat..." : "-- Pilih --"}</option>
                      {districtsKtpList.map((d) => (
                        <option key={d.id} value={d.id}>{d.name.toUpperCase()}</option>
                      ))}
                    </select>
                    {errors.kecamatanKtp && <p className="text-[10px] text-error font-semibold">{errors.kecamatanKtp}</p>}
                  </div>

                  {/* Sub-District KTP Selector */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="kelurahanKtp">
                      Kelurahan / Desa (KTP)
                    </label>
                    <select
                      id="kelurahanKtp"
                      value={villagesKtpList.find((v) => v.name.toUpperCase() === formData.kelurahanKtp)?.id || ""}
                      disabled={!selectedKtpDistId || loadingKtpRegions.kelurahan}
                      onChange={(e) => handleKtpVillageChange(e.target.value)}
                      className="w-full min-h-[50px] px-3 py-2 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                    >
                      <option value="">{loadingKtpRegions.kelurahan ? "Memuat..." : "-- Pilih --"}</option>
                      {villagesKtpList.map((s) => (
                        <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
                      ))}
                    </select>
                    {errors.kelurahanKtp && <p className="text-[10px] text-error font-semibold">{errors.kelurahanKtp}</p>}
                  </div>
                </div>

                {/* KTP Postal Code */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-on-surface" htmlFor="kodePosKtp">
                    Kode Pos (KTP)
                  </label>
                  <input
                    type="text"
                    id="kodePosKtp"
                    placeholder="Contoh: 16143"
                    value={formData.kodePosKtp}
                    onChange={(e) => handleInputChange("kodePosKtp", e.target.value.replace(/\D/g, "").slice(0, 5))}
                    className="w-full min-h-[50px] px-3.5 py-2.5 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Card B: Lokasi Usaha */}
              <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex flex-col gap-4">
                <h3 className="text-sm font-bold text-on-surface border-b border-border-light pb-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-lg">store</span>
                  Lokasi Usaha
                </h3>

                {/* Checkbox Synchronize Address */}
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
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <label htmlFor="isAddressSame" className="text-xs font-bold text-on-surface-variant cursor-pointer select-none">
                    Alamat tempat usaha sama dengan alamat KTP
                  </label>
                </div>

                {/* Input: Alamat Usaha Detail */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-on-surface" htmlFor="alamatUsaha">
                    Alamat Lengkap Usaha
                  </label>
                  <textarea
                    id="alamatUsaha"
                    placeholder="Contoh: JL. RAYA PAJAJARAN NO. 100, KEL. BANTARJATI"
                    rows={2}
                    value={formData.alamatUsaha}
                    disabled={formData.isAddressSame}
                    onChange={(e) => handleInputChange("alamatUsaha", e.target.value)}
                    className={`w-full p-3.5 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:bg-surface-container-low ${
                      errors.alamatUsaha ? "border-error focus:ring-error" : ""
                    }`}
                  />
                  {errors.alamatUsaha && (
                    <p className="text-xs text-error font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">error</span>
                      {errors.alamatUsaha}
                    </p>
                  )}
                </div>

                {/* Province Selector */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="provinsi">
                      Provinsi
                    </label>
                    <select
                      id="provinsi"
                      value={selectedProvId}
                      disabled={formData.isAddressSame}
                      onChange={(e) => handleProvinceChange(e.target.value)}
                      className="w-full min-h-[50px] px-3 py-2 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none disabled:opacity-50 disabled:bg-surface-container-low"
                    >
                      <option value="">{loadingRegions.provinsi ? "Memuat..." : "-- Pilih --"}</option>
                      {provincesList.map((p) => (
                        <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>
                      ))}
                    </select>
                    {errors.provinsi && <p className="text-[10px] text-error font-semibold">{errors.provinsi}</p>}
                  </div>

                  {/* City Selector */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="kotaKabupaten">
                      Kota / Kabupaten
                    </label>
                    <select
                      id="kotaKabupaten"
                      value={selectedCityId}
                      disabled={formData.isAddressSame || !selectedProvId || loadingRegions.kotaKabupaten}
                      onChange={(e) => handleCityChange(e.target.value)}
                      className="w-full min-h-[50px] px-3 py-2 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none disabled:opacity-50 disabled:bg-surface-container-low"
                    >
                      <option value="">{loadingRegions.kotaKabupaten ? "Memuat..." : "-- Pilih --"}</option>
                      {citiesList.map((c) => (
                        <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>
                      ))}
                    </select>
                    {errors.kotaKabupaten && <p className="text-[10px] text-error font-semibold">{errors.kotaKabupaten}</p>}
                  </div>
                </div>

                {/* District Selector */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="kecamatan">
                      Kecamatan
                    </label>
                    <select
                      id="kecamatan"
                      value={selectedDistId}
                      disabled={formData.isAddressSame || !selectedCityId || loadingRegions.kecamatan}
                      onChange={(e) => handleDistrictChange(e.target.value)}
                      className="w-full min-h-[50px] px-3 py-2 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none disabled:opacity-50 disabled:bg-surface-container-low"
                    >
                      <option value="">{loadingRegions.kecamatan ? "Memuat..." : "-- Pilih --"}</option>
                      {districtsList.map((d) => (
                        <option key={d.id} value={d.id}>{d.name.toUpperCase()}</option>
                      ))}
                    </select>
                    {errors.kecamatan && <p className="text-[10px] text-error font-semibold">{errors.kecamatan}</p>}
                  </div>

                  {/* Sub-District Selector */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="kelurahan">
                      Kelurahan / Desa
                    </label>
                    <select
                      id="kelurahan"
                      value={villagesList.find((v) => v.name.toUpperCase() === formData.kelurahan)?.id || ""}
                      disabled={formData.isAddressSame || !selectedDistId || loadingRegions.kelurahan}
                      onChange={(e) => handleVillageChange(e.target.value)}
                      className="w-full min-h-[50px] px-3 py-2 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none disabled:opacity-50 disabled:bg-surface-container-low"
                    >
                      <option value="">{loadingRegions.kelurahan ? "Memuat..." : "-- Pilih --"}</option>
                      {villagesList.map((s) => (
                        <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
                      ))}
                    </select>
                    {errors.kelurahan && <p className="text-[10px] text-error font-semibold">{errors.kelurahan}</p>}
                  </div>
                </div>

                {/* Postal Code */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-on-surface" htmlFor="kodePos">
                    Kode Pos (Opsional)
                  </label>
                  <input
                    type="text"
                    id="kodePos"
                    placeholder="Contoh: 16143"
                    value={formData.kodePos}
                    disabled={formData.isAddressSame}
                    onChange={(e) => handleInputChange("kodePos", e.target.value.replace(/\D/g, "").slice(0, 5))}
                    className="w-full min-h-[50px] px-3.5 py-2.5 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none disabled:opacity-50 disabled:bg-surface-container-low"
                  />
                </div>
              </div>

              {/* Titik Koordinat Section */}
              <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary">explore</span>
                    Titik Koordinat Lokasi Usaha
                  </span>
                  <button
                    type="button"
                    onClick={searchCoordinates}
                    disabled={isGeocoding}
                    className="px-3.5 py-1.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary-container active:scale-[0.97] transition-all disabled:opacity-50 flex items-center gap-1 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-xs animate-spin-slow">
                      {isGeocoding ? "sync" : "travel_explore"}
                    </span>
                    {isGeocoding ? "Mencari..." : "Cari di Peta"}
                  </button>
                </div>

                <p className="text-xs text-on-surface-variant leading-relaxed">
                  NIB Assistant akan mencari koordinat secara otomatis berdasarkan Alamat Usaha Anda. Anda juga dapat menyesuaikan secara manual.
                </p>

                {geocodeError && (
                  <div className="p-2.5 rounded-xl bg-error-container text-on-error-container text-xs font-semibold flex items-start gap-1.5">
                    <span className="material-symbols-outlined text-sm flex-shrink-0">warning</span>
                    <span>{geocodeError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="latitude">
                      Latitude (Garis Lintang)
                    </label>
                    <input
                      type="text"
                      id="latitude"
                      placeholder="-6.2088"
                      value={formData.latitude}
                      onChange={(e) => handleInputChange("latitude", e.target.value)}
                      className="w-full min-h-[44px] px-3 py-1.5 rounded-xl border border-outline-variant bg-transparent text-sm font-mono focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="longitude">
                      Longitude (Garis Bujur)
                    </label>
                    <input
                      type="text"
                      id="longitude"
                      placeholder="106.8456"
                      value={formData.longitude}
                      onChange={(e) => handleInputChange("longitude", e.target.value)}
                      className="w-full min-h-[44px] px-3 py-1.5 rounded-xl border border-outline-variant bg-transparent text-sm font-mono focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                {errors.coordinates && (
                  <p className="text-xs text-error font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {errors.coordinates}
                  </p>
                )}

                {/* OSM Dynamic Interactive Map preview */}
                <div className="relative w-full rounded-xl overflow-hidden border border-outline-variant shadow-inner mt-1 flex flex-col">
                  {!leafletLoaded && (
                    <div className="absolute inset-0 bg-surface-container-low flex flex-col items-center justify-center gap-2 z-10 min-h-[220px]">
                      <span className="material-symbols-outlined text-outline animate-spin text-2xl">sync</span>
                      <p className="text-xs text-on-surface-variant font-medium">Memuat peta interaktif...</p>
                    </div>
                  )}
                  <div id="leaflet-map" className="w-full" style={{ height: "220px", minHeight: "220px" }} />
                  <div className="bg-surface-container-low px-3 py-1.5 border-t border-outline-light text-[10px] text-on-surface-variant font-bold flex items-center gap-1.5 justify-center text-center">
                    <span className="material-symbols-outlined text-xs text-primary">info</span>
                    <span>Anda dapat klik di mana saja pada peta atau geser penanda pin untuk menentukan koordinat lokasi usaha secara presisi.</span>
                  </div>
                </div>
              </div>

              {/* Foto Lokasi Usaha Section */}
              <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex flex-col gap-3">
                <span className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary">add_a_photo</span>
                  Foto Lokasi Fisik Tempat Usaha
                </span>

                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Ambil foto langsung atau unggah dari galeri. Foto ini digunakan untuk kelengkapan berkas administrasi izin usaha di portal OSS.
                </p>

                <div className="flex flex-col items-center justify-center border-2 border-dashed border-outline-variant hover:border-primary rounded-xl p-6 transition-all bg-transparent relative group">
                  {formData.fotoLokasi ? (
                    <div className="flex flex-col items-center gap-3 w-full">
                      {/* Preview base64 Image */}
                      <div className="relative w-full h-[180px] rounded-lg overflow-hidden border border-border-light shadow-sm">
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
                        className="px-4 py-2 rounded-full border border-error text-error text-xs font-bold hover:bg-error-container hover:text-on-error-container active:scale-[0.98] transition-all flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                        Hapus & Ganti Foto
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center gap-2 text-center w-full">
                      <span className="material-symbols-outlined text-4xl text-outline group-hover:text-primary transition-colors">
                        photo_camera_back
                      </span>
                      <div>
                        <span className="text-xs font-bold text-primary hover:underline">
                          Pilih file gambar
                        </span>
                        <span className="text-xs text-outline font-semibold"> atau seret ke sini</span>
                      </div>
                      <p className="text-[10px] text-outline font-medium">
                        Mendukung format PNG, JPG, JPEG (Maks. 8MB)
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
                    <span className="material-symbols-outlined text-sm">error</span>
                    {errors.fotoLokasi}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: CERITA USAHA */}
          {currentStep === 3 && (
            <div className="animate-fadeIn space-y-6">
              <div className="mb-2">
                <h2 className="text-2xl font-bold text-primary mb-1.5">
                  Ceritakan Usaha Anda
                </h2>
                <p className="text-on-surface-variant text-sm leading-relaxed">
                  Ceritakan usaha Anda dalam bahasa sehari-hari. Kami akan menganalisis untuk mencocokkan dengan kode klasifikasi KBLI resmi.
                </p>
              </div>

              {/* Input: Nama Usaha */}
              <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex flex-col gap-1.5">
                <label className="text-sm font-bold text-on-surface" htmlFor="namaUsaha">
                  Nama Usaha / Toko / Warung
                </label>
                <input
                  type="text"
                  id="namaUsaha"
                  placeholder="Contoh: Warung Bakso Maknyus, Katering Melati"
                  value={formData.namaUsaha}
                  onChange={(e) => handleInputChange("namaUsaha", e.target.value)}
                  className={`w-full min-h-[50px] px-3.5 py-2.5 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                    errors.namaUsaha ? "border-error focus:ring-error" : ""
                  }`}
                />
                {errors.namaUsaha && (
                  <p className="text-xs text-error font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {errors.namaUsaha}
                  </p>
                )}
              </div>

              {/* Input: Cerita Usaha Description */}
              <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-on-surface" htmlFor="ceritaUsaha">
                    Usaha ini menjual apa & apa kegiatan utamanya?
                  </label>
                  <span className="text-[10px] font-semibold text-outline">
                    {formData.ceritaUsaha.length} Karakter
                  </span>
                </div>
                <textarea
                  id="ceritaUsaha"
                  placeholder="Contoh: Saya menjual bakso sapi kuah secara keliling menggunakan gerobak di sore hari, terkadang juga menerima pesanan katering untuk hajatan tetangga."
                  rows={4}
                  value={formData.ceritaUsaha}
                  onChange={(e) => handleInputChange("ceritaUsaha", e.target.value)}
                  className={`w-full p-3.5 rounded-xl border border-outline-variant bg-transparent text-sm leading-relaxed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                    errors.ceritaUsaha ? "border-error focus:ring-error" : ""
                  }`}
                />
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  💡 <strong>Tips:</strong> Jelaskan secara jujur. NIB Assistant akan menganalisis kata seperti <em>"bakso"</em>, <em>"keliling"</em>, atau <em>"katering"</em> untuk mencari kode KBLI paling pas.
                </p>
                {errors.ceritaUsaha && (
                  <p className="text-xs text-error font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {errors.ceritaUsaha}
                  </p>
                )}
              </div>

              {/* Input: Cara Penjualan */}
              <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex flex-col gap-2">
                <label className="text-sm font-bold text-on-surface">
                  Cara Penjualan / Transaksi Usaha
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: "offline", label: "Toko Fisik" },
                    { val: "online", label: "Online" },
                    { val: "keduanya", label: "Keduanya" }
                  ].map((mode) => (
                    <label key={mode.val} className="cursor-pointer">
                      <input
                        type="radio"
                        name="cara_penjualan"
                        value={mode.val}
                        checked={formData.caraPenjualan === mode.val}
                        onChange={(e) => handleInputChange("caraPenjualan", e.target.value)}
                        className="peer sr-only"
                      />
                      <div className="px-2 py-3 rounded-xl border border-outline-variant peer-checked:border-primary peer-checked:bg-primary-container peer-checked:text-on-primary-container hover:bg-surface-container-low transition-all text-center font-semibold text-xs md:text-sm min-h-[48px] flex items-center justify-center">
                        {mode.label}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Parameter: Modal Usaha, Luas Lahan & Jumlah Pekerja */}
              <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-on-surface" htmlFor="modalUsaha">
                    Modal Usaha (tidak termasuk tanah & bangunan)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="modalUsaha"
                      placeholder="Contoh: 15000000"
                      value={formData.modalUsaha}
                      onChange={(e) => handleInputChange("modalUsaha", e.target.value.replace(/\D/g, ""))}
                      className={`w-full min-h-[50px] pl-12 pr-4 py-2.5 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                        errors.modalUsaha ? "border-error focus:ring-error" : ""
                      }`}
                    />
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-outline">
                      Rp
                    </span>
                  </div>
                  {formData.modalUsaha && (
                    <p className="text-xs text-primary font-semibold">
                      Terbaca: Rp {parseInt(formData.modalUsaha).toLocaleString("id-ID")}
                    </p>
                  )}
                  {errors.modalUsaha && (
                    <p className="text-xs text-error font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">error</span>
                      {errors.modalUsaha}
                    </p>
                  )}
                </div>

                {/* Luas Lahan */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-on-surface" htmlFor="luasTanah">
                    Luas Lahan / Tanah Usaha
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="luasTanah"
                      placeholder="Contoh: 120"
                      value={formData.luasTanah}
                      onChange={(e) => handleInputChange("luasTanah", e.target.value.replace(/\D/g, ""))}
                      className={`w-full min-h-[50px] pr-12 pl-4 py-2.5 rounded-xl border border-outline-variant bg-transparent text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                        errors.luasTanah ? "border-error focus:ring-error" : ""
                      }`}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-outline">
                      m²
                    </span>
                  </div>
                  {errors.luasTanah && (
                    <p className="text-xs text-error font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">error</span>
                      {errors.luasTanah}
                    </p>
                  )}
                </div>

                {/* Pembagian Tenaga Kerja */}
                <div className="border-t border-border-light pt-3 flex flex-col gap-3">
                  <span className="text-sm font-bold text-on-surface">
                    Jumlah Tenaga Kerja (termasuk pemilik)
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Laki-laki */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-on-surface-variant" htmlFor="jumlahPekerjaLakiLaki">
                        Laki-laki
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const val = Math.max(0, parseInt(formData.jumlahPekerjaLakiLaki || "0") - 1);
                            handleWorkerChange("jumlahPekerjaLakiLaki", val.toString());
                          }}
                          className="w-8 h-8 rounded-full border border-outline-variant hover:bg-surface-container-low flex items-center justify-center font-bold text-xs"
                        >
                          -
                        </button>
                        <input
                          type="text"
                          id="jumlahPekerjaLakiLaki"
                          value={formData.jumlahPekerjaLakiLaki}
                          onChange={(e) => handleWorkerChange("jumlahPekerjaLakiLaki", e.target.value)}
                          className="w-12 min-h-[36px] text-center rounded-xl border border-outline-variant bg-transparent text-xs font-bold focus:border-primary focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = parseInt(formData.jumlahPekerjaLakiLaki || "0") + 1;
                            handleWorkerChange("jumlahPekerjaLakiLaki", val.toString());
                          }}
                          className="w-8 h-8 rounded-full border border-outline-variant hover:bg-surface-container-low flex items-center justify-center font-bold text-xs"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Perempuan */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-on-surface-variant" htmlFor="jumlahPekerjaPerempuan">
                        Perempuan
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const val = Math.max(0, parseInt(formData.jumlahPekerjaPerempuan || "0") - 1);
                            handleWorkerChange("jumlahPekerjaPerempuan", val.toString());
                          }}
                          className="w-8 h-8 rounded-full border border-outline-variant hover:bg-surface-container-low flex items-center justify-center font-bold text-xs"
                        >
                          -
                        </button>
                        <input
                          type="text"
                          id="jumlahPekerjaPerempuan"
                          value={formData.jumlahPekerjaPerempuan}
                          onChange={(e) => handleWorkerChange("jumlahPekerjaPerempuan", e.target.value)}
                          className="w-12 min-h-[36px] text-center rounded-xl border border-outline-variant bg-transparent text-xs font-bold focus:border-primary focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = parseInt(formData.jumlahPekerjaPerempuan || "0") + 1;
                            handleWorkerChange("jumlahPekerjaPerempuan", val.toString());
                          }}
                          className="w-8 h-8 rounded-full border border-outline-variant hover:bg-surface-container-low flex items-center justify-center font-bold text-xs"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Total Worker Dynamically Displayed */}
                  <div className="mt-1 p-2.5 rounded-xl bg-primary-container text-on-primary-container text-xs font-bold flex justify-between items-center">
                    <span>Total Tenaga Kerja:</span>
                    <span className="text-sm font-extrabold">{formData.jumlahPekerja} Orang</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Dynamic Sticky Bottom Buttons */}
        <div className="fixed bottom-0 left-0 right-0 md:absolute md:-bottom-2 bg-surface-card border-t border-border-light px-4 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-40 md:rounded-b-2xl">
          <div className="flex gap-3">
            <button
              onClick={handleBack}
              className="flex-1 min-h-[50px] border border-primary text-primary font-bold rounded-full hover:bg-surface-container-low transition-colors active:scale-[0.98]"
            >
              Kembali
            </button>
            <button
              onClick={handleNext}
              className="flex-1 min-h-[50px] bg-primary text-on-primary font-bold rounded-full hover:bg-primary-container transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm"
            >
              {currentStep === 3 ? "Simpan" : "Lanjut"}
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
