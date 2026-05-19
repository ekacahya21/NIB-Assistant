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
      a.download = "dokumen_administrasi.pdf";
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
      a.download = "foto_lokasi.pdf";
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
    description: "Usaha jasa pangan yang bertempat di sebagian atau seluruh bangunan tetap yang menyajikan makanan dan minuman..."
  });

  // Consent Checklist state
  const [consent1, setConsent1] = useState(false);
  const [consent2, setConsent2] = useState(false);
  const [consent3, setConsent3] = useState(false);
  const [consent4, setConsent4] = useState(false);

  const isAllConsentGiven = consent1 && consent2 && consent3 && consent4;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedData = sessionStorage.getItem("draft_form_data");
      const storedKbli = sessionStorage.getItem("selected_kbli");

      if (storedData) {
        try {
          const parsedData = JSON.parse(storedData);
          // Format complete address
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
        provinsi: formData.provinsi,
        kotaKabupaten: formData.kotaKabupaten,
        kecamatan: formData.kecamatan,
        kelurahan: formData.kelurahan,
        kodePos: formData.kodePos,
        namaUsaha: formData.namaUsaha,
        ceritaUsaha: formData.ceritaUsaha,
        modalUsaha: formData.modalUsaha,
        jumlahPekerja: formData.jumlahPekerja,
        caraPenjualan: formData.caraPenjualan,
        kbliCode: selectedKbli.code,
        kbliTitle: selectedKbli.title,
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

  const stepLabelsReview = ["Pemilik", "Usaha", "Lokasi", "KBLI", "Review"];

  return (
    <div className="flex-1 flex flex-col md:items-center justify-start bg-background min-h-screen">
      <div className="w-full max-w-max-width-form flex-grow flex flex-col relative bg-surface-card md:my-8 md:rounded-lg overflow-hidden desktop-container">
        
        {/* Top AppBar */}
        <header className="sticky top-0 z-50 flex items-center justify-between px-4 h-14 w-full bg-background border-b border-border-light shadow-sm">
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/kbli")} className="p-2 hover:opacity-80 transition-opacity text-on-surface-variant" aria-label="Kembali">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <span className="text-xl font-bold text-primary">NIB Assistant</span>
          </div>
          <button onClick={() => router.push("/")} className="p-2 hover:opacity-80 transition-opacity text-on-surface-variant" aria-label="Bantuan">
            <span className="material-symbols-outlined">help</span>
          </button>
        </header>

        {/* Main Content */}
        <main className="flex-grow flex justify-center w-full px-4 md:px-10 py-8 md:py-10">
          <div className="w-full max-w-[800px] flex flex-col gap-10">
            
            {/* Horizontal Stepper */}
            <div className="w-full flex items-center justify-between px-4">
              <div className="flex flex-col items-center gap-2 relative z-10 w-full">
                <div className="flex items-center w-full">
                  {stepLabelsReview.map((label, idx) => (
                    <div key={label} className="flex items-center flex-1 last:flex-none">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        idx < 4
                          ? "bg-primary text-on-primary"
                          : "bg-primary ring-4 ring-primary-container text-on-primary"
                      }`}>
                        {idx < 4 ? (
                          <span className="material-symbols-outlined text-sm">check</span>
                        ) : "5"}
                      </div>
                      {idx < 4 && <div className="flex-grow h-1 bg-primary mx-2" />}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between w-full text-xs text-outline mt-2 px-1">
                  {stepLabelsReview.map((label, idx) => (
                    <span key={label} className={idx === 4 ? "font-bold text-primary" : ""}>{label}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Page Title */}
            <div className="text-center mb-[-16px]">
              <h1 className="text-[32px] leading-[40px] font-bold tracking-tight text-on-surface mb-2">Review & Persetujuan</h1>
              <p className="text-lg text-on-surface-variant">Pastikan semua data sudah benar sebelum sistem kami memproses NIB Anda secara otomatis di sistem OSS.</p>
            </div>

            {/* Bento Grid Review Sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Data Pemilik Card */}
              <div className="bento-card flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-border-light pb-3">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined filled-icon">person</span>
                    <h2 className="text-xl font-semibold">Data Pemilik</h2>
                  </div>
                  <button onClick={() => router.push("/wizard")} className="text-secondary font-semibold text-sm hover:underline flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">edit</span> Edit
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <span className="block text-xs text-outline">Nama Lengkap</span>
                    <span className="block text-base text-on-surface font-semibold">{formData.namaPemilik}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-outline">NIK</span>
                    <span className="block text-base text-on-surface font-mono">{formData.nik}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-outline">Tanggal Lahir</span>
                    <span className="block text-base text-on-surface">{formData.tanggalLahir}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-outline">Jenis Kelamin</span>
                    <span className="block text-base text-on-surface">{formData.jenisKelamin}</span>
                  </div>
                </div>
              </div>

              {/* Kontak & Komunikasi Card */}
              <div className="bento-card flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-border-light pb-3">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined filled-icon">call</span>
                    <h2 className="text-xl font-semibold">Kontak & Usaha</h2>
                  </div>
                  <button onClick={() => router.push("/wizard")} className="text-secondary font-semibold text-sm hover:underline flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">edit</span> Edit
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <span className="block text-xs text-outline">Nomor WhatsApp</span>
                    <span className="block text-base text-on-surface">{formData.nomorHp}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-outline">Email Aktif</span>
                    <span className="block text-base text-on-surface">{formData.email}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-outline">Modal Usaha</span>
                    <span className="block text-base text-on-surface">{formData.modalUsaha || "-"}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-outline">Jumlah Karyawan</span>
                    <span className="block text-base text-on-surface">{formData.jumlahPekerja || "0"} Orang</span>
                  </div>
                </div>
              </div>

              {/* Lokasi Usaha Card (Full Width) */}
              <div className="bento-card flex flex-col gap-4 md:col-span-2">
                <div className="flex items-center justify-between border-b border-border-light pb-3">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined filled-icon">location_on</span>
                    <h2 className="text-xl font-semibold">Lokasi Usaha</h2>
                  </div>
                  <button onClick={() => router.push("/wizard")} className="text-secondary font-semibold text-sm hover:underline flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">edit</span> Edit
                  </button>
                </div>
                <div className="flex flex-col md:flex-row gap-6 items-start">
                  <div className="flex-1 flex flex-col gap-3">
                    <div>
                      <span className="block text-xs text-outline">Alamat Lengkap</span>
                      <span className="block text-base text-on-surface">{formData.alamatUsaha}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="block text-xs text-outline">Luas Tanah</span>
                        <span className="block text-base text-on-surface">{formData.luasTanah || "0"} m²</span>
                      </div>
                      <div>
                        <span className="block text-xs text-outline">Koordinat</span>
                        <span className="block text-base text-on-surface font-mono text-sm">{formData.latitude}, {formData.longitude}</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-full md:w-1/3 h-32 bg-surface-container rounded-lg overflow-hidden border border-border-light relative shrink-0">
                    <iframe title="Map" width="100%" height="100%" frameBorder="0" scrolling="no" marginHeight={0} marginWidth={0}
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(formData.longitude || "106.8456") - 0.002}%2C${parseFloat(formData.latitude || "-6.2088") - 0.002}%2C${parseFloat(formData.longitude || "106.8456") + 0.002}%2C${parseFloat(formData.latitude || "-6.2088") + 0.002}&layer=mapnik&marker=${formData.latitude || "-6.2088"}%2C${formData.longitude || "106.8456"}`} />
                  </div>
                </div>
              </div>

              {/* KBLI Card (Full Width) */}
              <div className="bento-card flex flex-col gap-4 md:col-span-2">
                <div className="flex items-center justify-between border-b border-border-light pb-3">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined filled-icon">category</span>
                    <h2 className="text-xl font-semibold">KBLI (Bidang Usaha)</h2>
                  </div>
                  <button onClick={() => router.push("/kbli")} className="text-secondary font-semibold text-sm hover:underline flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">edit</span> Ubah
                  </button>
                </div>
                <div className="bg-surface-container-low border border-border-light rounded-lg p-4 flex gap-4 items-start">
                  <div className="bg-primary text-on-primary px-3 py-1 rounded font-semibold text-sm mt-1 shrink-0">{selectedKbli.code}</div>
                  <div>
                    <h3 className="text-xl font-semibold text-on-surface">{selectedKbli.title}</h3>
                    <p className="text-base text-on-surface-variant mt-1">{selectedKbli.description}</p>
                  </div>
                </div>
              </div>

              {/* Dokumen Administrasi (Full Width) */}
              <div className="bento-card flex flex-col gap-4 md:col-span-2">
                <div className="flex items-center justify-between border-b border-border-light pb-3">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined filled-icon">description</span>
                    <h2 className="text-xl font-semibold">Dokumen Administrasi</h2>
                  </div>
                  <span className="text-xs bg-secondary-container text-on-secondary-container font-bold px-2.5 py-1 rounded-full">PDF</span>
                </div>
                <p className="text-base text-on-surface-variant">Unduh dokumen administrasi dan foto lokasi usaha untuk melengkapi persyaratan OSS.</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button type="button" onClick={downloadNpsPdf} disabled={downloadingNps}
                    className="flex-1 px-4 py-3 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md">
                    <span className="material-symbols-outlined text-sm">{downloadingNps ? "sync" : "picture_as_pdf"}</span>
                    {downloadingNps ? "Mengekspor..." : "Unduh Dokumen Adm"}
                  </button>
                  <button type="button" onClick={downloadPhotoPdf} disabled={downloadingPhoto || !formData.fotoLokasi}
                    className="flex-1 px-4 py-3 rounded-lg border-2 border-primary text-primary text-sm font-semibold hover:bg-primary/5 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">{downloadingPhoto ? "sync" : "photo_library"}</span>
                    {downloadingPhoto ? "Mengekspor..." : "Unduh Foto Lokasi"}
                  </button>
                </div>
              </div>
            </div>

            {/* Automation Disclosure (border-l-4 accent) */}
            <div className="bg-surface-container-low border-l-4 border-status-info p-6 rounded-r-lg">
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-status-info filled-icon text-3xl">info</span>
                <div>
                  <h3 className="text-xl font-semibold text-on-surface mb-2">Pemberitahuan Otomatisasi NIB Assistant</h3>
                  <p className="text-base text-on-surface-variant mb-4">Dengan menyetujui, Anda memberikan kuasa kepada NIB Assistant untuk:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-semibold text-tertiary-container flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-lg">check_circle</span> Akan Melakukan
                      </h4>
                      <ul className="list-disc list-inside text-base text-on-surface-variant space-y-1">
                        <li>Memasukkan data Anda ke portal OSS.</li>
                        <li>Mendaftarkan hak akses (jika belum ada).</li>
                        <li>Meneruskan proses hingga NIB terbit.</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-status-error flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-lg">cancel</span> Tidak Akan Melakukan
                      </h4>
                      <ul className="list-disc list-inside text-base text-on-surface-variant space-y-1">
                        <li>Menyimpan password OSS Anda.</li>
                        <li>Mengubah data selain yang disetujui.</li>
                        <li>Menggunakan data untuk tujuan komersial lain.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Consent Checklist (bento-card) */}
            <div className="bento-card border-2 border-primary-container/20">
              <h3 className="text-xl font-semibold text-on-surface mb-4">Persetujuan Final</h3>
              <div className="flex flex-col gap-4">
                {[
                  { state: consent1, set: setConsent1, text: "Saya menyatakan bahwa seluruh data yang telah diisi adalah benar dan dapat dipertanggungjawabkan." },
                  { state: consent2, set: setConsent2, text: "Saya mengizinkan NIB Assistant mengisi form OSS atas nama saya." },
                  { state: consent3, set: setConsent3, text: "Saya menyetujui proses direkam demi keamanan dan transparansi audit." },
                  { state: consent4, set: setConsent4, text: "Saya berjanji memeriksa ulang semua isian di portal OSS sebelum submit final." }
                ].map((item, idx) => (
                  <label key={idx} className="flex items-start gap-3 cursor-pointer group">
                    <input type="checkbox" checked={item.state} onChange={(e) => item.set(e.target.checked)}
                      className="mt-1 w-5 h-5 rounded border-outline text-primary focus:ring-primary transition-colors cursor-pointer" />
                    <span className="text-base text-on-surface group-hover:text-primary transition-colors">{item.text}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Desktop: Inline Pill CTA */}
            <div className="hidden md:flex flex-row justify-end gap-4 pb-10 border-t border-border-light pt-6">
              <button className="px-6 py-3 rounded-full border-2 border-primary text-primary font-semibold text-sm hover:bg-surface-container transition-colors min-h-[48px] flex items-center justify-center">
                Simpan sebagai Draft
              </button>
              <button
                onClick={handleProceedToAutomation}
                disabled={!isAllConsentGiven || isSubmitting}
                className={`px-8 py-3 rounded-full font-semibold text-sm min-h-[48px] flex items-center justify-center gap-2 shadow-md transition-all ${
                  isAllConsentGiven && !isSubmitting
                    ? "bg-primary text-on-primary hover:opacity-90"
                    : "bg-surface-container-high text-outline opacity-60 cursor-not-allowed"
                }`}
              >
                {isSubmitting ? (
                  <><span className="w-5 h-5 rounded-full border-2 border-outline border-t-primary animate-spin" /> Menyimpan Draf...</>
                ) : (
                  <>Proses Sekarang <span className="material-symbols-outlined text-[18px]">send</span></>
                )}
              </button>
            </div>

          </div>
        </main>

        {/* Mobile: Sticky Bottom CTA */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass-bar border-t border-border-light px-5 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] z-40">
          <button
            onClick={handleProceedToAutomation}
            disabled={!isAllConsentGiven || isSubmitting}
            className={`w-full py-4 px-6 rounded-full font-bold flex items-center justify-center gap-2.5 min-h-[56px] transition-all ${
              isAllConsentGiven && !isSubmitting
                ? "bg-primary text-on-primary shadow-md"
                : "bg-surface-container-high text-outline opacity-60 cursor-not-allowed"
            }`}
          >
            {isSubmitting ? (
              <><span className="w-5 h-5 rounded-full border-2 border-outline border-t-primary animate-spin" /> Menyimpan...</>
            ) : (
              <>Kirim ke Portal OSS <span className="material-symbols-outlined text-lg">arrow_forward</span></>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

