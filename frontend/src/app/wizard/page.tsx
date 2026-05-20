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
      const savedStep = sessionStorage.getItem("wizard_step");
      const scale = sessionStorage.getItem("skala_usaha") || "";
      const modalDefault = scale === "mikro" ? "50000000" : scale === "kecil" ? "200000000" : "";
      
      if (savedStep) {
        const parsedStep = parseInt(savedStep, 10);
        if (parsedStep >= 1 && parsedStep <= 3) {
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

    // Transform all typed user inputs to uppercase except email, gender and select dropdowns
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
        const nextStep = currentStep + 1;
        setCurrentStep(nextStep);
        if (typeof window !== "undefined") {
          sessionStorage.setItem("draft_form_data", JSON.stringify(formData));
          sessionStorage.setItem("wizard_step", nextStep.toString());
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        // Save to sessionStorage and proceed to KBLI suggestions
        if (typeof window !== "undefined") {
          sessionStorage.setItem("draft_form_data", JSON.stringify(formData));
          sessionStorage.setItem("wizard_step", "3");
        }
        router.push("/kbli");
      }
    }
  };

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

  // Helper to format NIK as spaced sequence
  const formatNIK = (nik: string) => {
    if (!nik) return "";
    const matches = nik.match(/.{1,4}/g);
    return matches ? matches.join(" ") : nik;
  };

  return (
    <div className="flex-1 flex flex-col md:items-center justify-start bg-background min-h-screen">
      <div className="w-full max-w-max-width-form flex-grow flex flex-col relative bg-surface-card pb-32 md:my-8 md:rounded-lg overflow-hidden desktop-container">
        
        {/* Top AppBar */}
        <header className="sticky top-0 z-50 flex items-center justify-between px-4 h-14 w-full bg-background border-b border-border-light shadow-sm">
          <div className="flex items-center gap-2">
            <button onClick={handleBack} className="p-2 hover:opacity-80 transition-opacity text-on-surface-variant" aria-label="Kembali">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <span className="text-xl font-bold text-primary">NIB Assistant</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-semibold bg-surface-card px-2.5 py-1.5 rounded-lg border border-border-light shadow-sm shrink-0">
              <span className={`w-2 h-2 rounded-full ${saveStatus === "saving" ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
              <span className="hidden sm:inline">{saveStatus === "saving" ? "Menyimpan..." : "Tersimpan"}</span>
            </div>
            <button onClick={() => router.push("/")} className="p-2 hover:opacity-80 transition-opacity text-on-surface-variant" aria-label="Bantuan">
              <span className="material-symbols-outlined">help</span>
            </button>
          </div>
        </header>

        {/* Main Content Centered Wrapper */}
        <main className="flex-grow flex justify-center w-full px-4 md:px-10 py-8 md:py-10">
          <div className="w-full max-w-[800px] flex flex-col gap-8 md:gap-10">
            
            {/* Labeled Stepper (Stitch Design) */}
            <div className="w-full flex items-center justify-between px-4">
              <div className="flex flex-col items-center gap-2 relative z-10 w-full">
                <div className="flex items-center w-full">
                  {["Pemilik", "Usaha", "Lokasi", "KBLI", "Review"].map((label, idx) => {
                    const stepNum = idx + 1;
                    return (
                      <div key={label} className="flex items-center flex-1 last:flex-none">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
                          currentStep === stepNum ? "bg-primary ring-4 ring-primary-container text-on-primary" : currentStep > stepNum ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"
                        }`}>
                          {currentStep > stepNum ? <span className="material-symbols-outlined text-sm">check</span> : stepNum}
                        </div>
                        {idx < 4 && <div className={`flex-grow h-1 mx-2 transition-colors ${ currentStep > stepNum ? "bg-primary" : "bg-surface-container-highest"}`} />}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between w-full text-xs text-outline mt-2 px-1">
                  {["Pemilik", "Usaha", "Lokasi", "KBLI", "Review"].map((label, idx) => (
                    <span key={label} className={currentStep === idx + 1 ? "font-bold text-primary" : ""}>{label}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-grow">
          {/* STEP 1: DATA PEMILIK */}
          {currentStep === 1 && (
            <div className="animate-fadeIn space-y-6">
              <div className="mb-2">
                <h2 className="text-2xl font-extrabold text-on-surface mb-1.5">
                  Data Identitas Pemilik
                </h2>
                <p className="text-on-surface-variant text-sm leading-relaxed">
                  Pastikan data berikut sesuai dengan KTP pemilik usaha.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Bento Card: Profil Utama */}
                <div className="bento-card flex flex-col gap-5">
                  <h3 className="text-sm font-bold text-on-surface border-b border-border-light pb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">person</span>
                    Profil Utama
                  </h3>
                  
                  {/* Input: Nama Pemilik */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="namaPemilik">
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
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-on-surface-variant">
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
                </div>

                {/* Right Bento Card: Dokumen Kependudukan */}
                <div className="bento-card flex flex-col gap-5">
                  <h3 className="text-sm font-bold text-on-surface border-b border-border-light pb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">badge</span>
                    Dokumen Kependudukan
                  </h3>

                  {/* Input: NIK */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="nik">
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
                      <p className="text-[11px] text-primary font-mono font-semibold">
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
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-on-surface-variant" htmlFor="tanggalLahir">
                      Tanggal Lahir
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
              </div>
            </div>
          )}
          {/* STEP 2: KONTAK & LOKASI */}
          {currentStep === 2 && (
            <div className="animate-fadeIn space-y-6">
              <div className="mb-2">
                <h2 className="text-2xl font-extrabold text-on-surface mb-1.5">
                  Kontak & Lokasi Usaha
                </h2>
                <p className="text-on-surface-variant text-sm leading-relaxed">
                  Masukkan kontak aktif dan alamat lengkap lokasi usaha Anda.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left Column Container */}
                <div className="flex flex-col gap-6">
                  {/* Card A: Kontak Usaha */}
                  <div className="bento-card flex flex-col gap-4">
                    <h3 className="text-sm font-bold text-on-surface border-b border-border-light pb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-lg">call</span>
                      Kontak Komunikasi
                    </h3>

                    {/* WhatsApp */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-on-surface-variant" htmlFor="nomorHp">
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
                      <p className="text-[10px] text-on-surface-variant leading-normal font-medium">
                        Dibutuhkan untuk menerima kode verifikasi OTP langsung dari portal OSS.
                      </p>
                      {errors.nomorHp && (
                        <p className="text-xs text-error font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">error</span>
                          {errors.nomorHp}
                        </p>
                      )}
                    </div>

                    {/* Email */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-on-surface-variant" htmlFor="email">
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

                  {/* Card C: Alamat Sesuai KTP */}
                  <div className="bento-card flex flex-col gap-4">
                    <h3 className="text-sm font-bold text-on-surface border-b border-border-light pb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-lg">badge</span>
                      Alamat Sesuai KTP
                    </h3>

                    {/* Input: Alamat KTP Detail */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-on-surface-variant" htmlFor="alamatKtp">
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
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="provinsiKtp">
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
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="kotaKabupatenKtp">
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
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="kecamatanKtp">
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
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="kelurahanKtp">
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
                      <label className="text-xs font-bold text-on-surface-variant" htmlFor="kodePosKtp">
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
                </div>

                {/* Right Column Container */}
                <div className="flex flex-col gap-6">
                  {/* Card B: Alamat Tempat Usaha */}
                  <div className="bento-card flex flex-col gap-4">
                    <h3 className="text-sm font-bold text-on-surface border-b border-border-light pb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-lg">store</span>
                      Alamat Tempat Usaha
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
                      <label className="text-xs font-bold text-on-surface-variant" htmlFor="alamatUsaha">
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
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="provinsi">
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
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="kotaKabupaten">
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
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="kecamatan">
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
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="kelurahan">
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
                      <label className="text-xs font-bold text-on-surface-variant" htmlFor="kodePos">
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

                  {/* Card D: Titik Koordinat & Peta */}
                  <div className="bento-card flex flex-col gap-4">
                    <div className="flex justify-between items-center border-b border-border-light pb-2">
                      <span className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-primary">explore</span>
                        Koordinat & Peta
                      </span>
                      <button
                        type="button"
                        onClick={searchCoordinates}
                        disabled={isGeocoding}
                        className="px-3 py-1 rounded-full bg-primary text-on-primary text-[10px] font-bold hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50 flex items-center gap-1 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-xs animate-spin-slow">
                          {isGeocoding ? "sync" : "travel_explore"}
                        </span>
                        {isGeocoding ? "Mencari..." : "Cari di Peta"}
                      </button>
                    </div>

                    {geocodeError && (
                      <div className="p-2.5 rounded-xl bg-error-container text-on-error-container text-xs font-semibold flex items-start gap-1.5">
                        <span className="material-symbols-outlined text-sm flex-shrink-0">warning</span>
                        <span>{geocodeError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="latitude">
                          Latitude
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
                          Longitude
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
                        <div className="absolute inset-0 bg-surface-container-low flex flex-col items-center justify-center gap-2 z-10 min-h-[200px]">
                          <span className="material-symbols-outlined text-outline animate-spin text-2xl">sync</span>
                          <p className="text-xs text-on-surface-variant font-medium">Memuat peta interaktif...</p>
                        </div>
                      )}
                      <div id="leaflet-map" className="w-full" style={{ height: "200px", minHeight: "200px" }} />
                      <div className="bg-surface-container-low px-3 py-1.5 border-t border-outline-light text-[9px] text-on-surface-variant font-bold flex items-center gap-1 justify-center text-center">
                        <span className="material-symbols-outlined text-[10px] text-primary">info</span>
                        <span>Klik peta / geser pin untuk menentukan koordinat presisi.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Full Width Card: Foto Lokasi Fisik */}
                <div className="bento-card flex flex-col gap-3 md:col-span-2">
                  <span className="text-sm font-bold text-on-surface flex items-center gap-1.5 border-b border-border-light pb-2">
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
            </div>
          )}

          {/* STEP 3: CERITA USAHA */}
          {currentStep === 3 && (
            <div className="animate-fadeIn space-y-6">
              <div className="mb-2">
                <h2 className="text-2xl font-extrabold text-on-surface mb-1.5">
                  Profil Usaha Anda
                </h2>
                <p className="text-on-surface-variant text-sm leading-relaxed">
                  Ceritakan usaha Anda dalam bahasa sehari-hari — kami akan menganalisisnya untuk menemukan kode KBLI yang paling tepat.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left Column Container: Cerita & Identitas Usaha */}
                <div className="flex flex-col gap-6">
                  {/* Card A: Identitas & Deskripsi Usaha */}
                  <div className="bento-card flex flex-col gap-4">
                    <h3 className="text-sm font-bold text-on-surface border-b border-border-light pb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-lg">storefront</span>
                      Deskripsi Usaha
                    </h3>

                    {/* Input: Nama Usaha */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-on-surface-variant" htmlFor="namaUsaha">
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

                    {/* Cara Penjualan */}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-on-surface-variant">
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

                    {/* Input: Cerita Usaha Description */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-on-surface-variant" htmlFor="ceritaUsaha">
                          Kegiatan Utama & Produk yang Dijual
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
                      <p className="text-[10px] text-on-surface-variant leading-relaxed font-medium">
                        💡 <strong>Tips:</strong> Jelaskan secara jujur. NIB Assistant akan menganalisis kata seperti <em>"bakso"</em>, <em>"keliling"</em>, atau <em>"katering"</em> untuk mencari kode KBLI paling pas.
                      </p>
                      {errors.ceritaUsaha && (
                        <p className="text-xs text-error font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">error</span>
                          {errors.ceritaUsaha}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column Container: Operasional & Modal */}
                <div className="flex flex-col gap-6">
                  {/* Card B: Finansial & Operasional */}
                  <div className="bento-card flex flex-col gap-4">
                    <h3 className="text-sm font-bold text-on-surface border-b border-border-light pb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-lg">analytics</span>
                      Operasional & Finansial
                    </h3>

                    {/* Modal Usaha */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-on-surface-variant" htmlFor="modalUsaha">
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
                        <p className="text-xs text-primary font-bold">
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
                      <label className="text-xs font-bold text-on-surface-variant" htmlFor="luasTanah">
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
                      <span className="text-xs font-bold text-on-surface-variant">
                        Jumlah Tenaga Kerja (termasuk pemilik)
                      </span>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Laki-laki */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="jumlahPekerjaLakiLaki">
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
                          <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="jumlahPekerjaPerempuan">
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
              </div>
            </div>
          )}
            </div>

            {/* Desktop: Inline Pill CTA */}
            <div className="hidden md:flex justify-end gap-4 border-t border-border-light pt-6 mt-4">
              <button onClick={handleBack} className="px-6 py-3 rounded-full border-2 border-primary text-primary font-semibold text-sm hover:bg-surface-container transition-colors min-h-[48px]">
                Kembali
              </button>
              <button onClick={handleNext} className="px-8 py-3 rounded-full bg-primary text-on-primary font-semibold text-sm min-h-[48px] flex items-center justify-center gap-2 shadow-md hover:opacity-90 transition-all">
                {currentStep === 3 ? "Simpan & Lanjut" : "Lanjut"}
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>

          </div>
        </main>
        {/* Mobile: Sticky Bottom CTA */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass-bar border-t border-border-light px-5 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] z-40">
          <div className="flex gap-3">
            <button onClick={handleBack} className="flex-1 min-h-[52px] border-2 border-primary text-primary font-bold rounded-full hover:bg-primary/5 transition-all">Kembali</button>
            <button onClick={handleNext} className="flex-1 min-h-[52px] bg-primary text-on-primary font-bold rounded-full shadow-md flex items-center justify-center gap-1.5 transition-all">
              {currentStep === 3 ? "Simpan & Lanjut" : "Lanjut"}
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
