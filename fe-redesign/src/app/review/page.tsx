"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
    caraPenjualan: "keduanya",
    namaUsaha: "",
    ceritaUsaha: "",
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
      a.download = `dokumen_administrasi_${new Date().toISOString().split('T')[0]}.pdf`;
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
      a.download = `foto_lokasi_${new Date().toISOString().split('T')[0]}.pdf`;
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

  const [selectedKbli, setSelectedKbli] = useState({
    code: "56103",
    title: "Kedai Makanan",
    description: "Usaha jasa pangan yang bertempat di sebagian atau seluruh bangunan tetap..."
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

      if (storedKbli) {
        try {
          setSelectedKbli(JSON.parse(storedKbli));
        } catch (e) {
          console.error("Error parsing KBLI data", e);
        }
      }
    }
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleProceedToAutomation = async () => {
    if (!isAllConsentGiven || isSubmitting) return;

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
        caraPenjualan: formData.caraPenjualan,
        kbliCode: selectedKbli.code,
        kbliTitle: selectedKbli.title,
        luasTanah: formData.luasTanah || "0",
        fotoLokasi: formData.fotoLokasi || "",
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
          <button onClick={() => router.push("/kbli")} className="p-2 hover:bg-surface-container transition-all rounded text-on-surface-variant flex items-center justify-center" aria-label="Kembali">
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
            
            {/* Card 1: Identitas Pemilik */}
            <div className="bento-card relative">
              <div className="flex justify-between items-center border-b border-border-light pb-2 mb-3">
                <span className="text-xs font-extrabold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary-container text-sm">person</span>
                  01. IDENTITAS PEMILIK
                </span>
                <button 
                  onClick={() => handleEditSection(1)} 
                  className="text-primary-container font-extrabold text-[10px] uppercase tracking-wider hover:underline flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-xs">edit</span> Ubah
                </button>
              </div>
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
              </div>
            </div>

            {/* Card 2: Alamat KTP */}
            <div className="bento-card">
              <div className="flex justify-between items-center border-b border-border-light pb-2 mb-3">
                <span className="text-xs font-extrabold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary-container text-sm">badge</span>
                  02. ALAMAT DOMISILI KTP
                </span>
                <button 
                  onClick={() => handleEditSection(2)} 
                  className="text-primary-container font-extrabold text-[10px] uppercase tracking-wider hover:underline flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-xs">edit</span> Ubah
                </button>
              </div>
              <div className="text-xs">
                <span className="block text-[10px] text-outline font-bold uppercase tracking-wide">Alamat Sesuai KTP</span>
                <p className="font-semibold text-on-surface leading-relaxed mt-0.5">{formData.alamatKtp}</p>
              </div>
            </div>

            {/* Card 3: Alamat Usaha & Peta Koordinat */}
            <div className="bento-card">
              <div className="flex justify-between items-center border-b border-border-light pb-2 mb-3">
                <span className="text-xs font-extrabold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary-container text-sm">store</span>
                  03. LOKASI USAHA & KOORDINAT
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
                  04. PROFIL USAHA & OPERASIONAL
                </span>
                <button 
                  onClick={() => handleEditSection(3)} 
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
                  05. KBLI TERPILIH
                </span>
                <button 
                  onClick={() => router.push("/kbli")} 
                  className="text-primary-container font-extrabold text-[10px] uppercase tracking-wider hover:underline flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-xs">edit</span> Ubah
                </button>
              </div>
              <div className="flex gap-3 items-start bg-[#F3F4F6] border border-border-light p-3 rounded text-xs">
                <div className="w-12 h-8 rounded bg-primary-container text-white font-mono font-bold flex items-center justify-center shrink-0">
                  {selectedKbli.code}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-on-surface truncate">{selectedKbli.title}</h4>
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

    </div>
  );
}
