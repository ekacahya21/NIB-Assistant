"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReviewPage() {
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    namaPemilik: "",
    nik: "",
    tanggalLahir: "",
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
  });

  const [downloadingNps, setDownloadingNps] = useState(false);
  const [downloadingPhoto, setDownloadingPhoto] = useState(false);

  const downloadNpsPdf = async () => {
    setDownloadingNps(true);
    try {
      const res = await fetch("http://localhost:3001/documents/generate-nps", {
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
      const res = await fetch("http://localhost:3001/documents/convert-photo", {
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

  const handleProceedToAutomation = () => {
    if (isAllConsentGiven) {
      // Save current status to state/storage for automation screen
      sessionStorage.setItem("automation_step", "start");
      router.push("/automation");
    }
  };

  return (
    <div className="flex-1 flex flex-col md:items-center justify-start bg-background min-h-screen">
      <div className="w-full max-w-max-width-form flex-grow flex flex-col relative bg-background pb-32 md:shadow-lg md:my-6 md:rounded-2xl md:border md:border-border-light overflow-hidden">
        
        {/* Top AppBar */}
        <header className="sticky top-0 z-50 flex items-center justify-between px-4 h-16 w-full bg-background border-b border-border-light">
          <button
            onClick={() => router.push("/kbli")}
            className="text-primary hover:bg-primary-fixed-dim/20 transition-all p-2 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Kembali"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          
          <h1 className="font-sans text-lg font-bold text-primary absolute left-1/2 transform -translate-x-1/2">
            NIB Assistant
          </h1>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-primary hover:bg-primary-fixed-dim/20 transition-all p-2 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary ml-auto z-10"
            aria-label="Bantuan"
          >
            <span className="material-symbols-outlined">help</span>
          </button>
        </header>

        {/* Stepper Design matching mockup (5 steps horizontal squircles) */}
        <div className="px-4 pt-6 flex flex-col items-center">
          <div className="flex items-center justify-between w-full max-w-[280px] md:max-w-[320px] mb-3">
            {/* Step 1 */}
            <div className="w-9 h-9 flex items-center justify-center font-bold text-sm transition-all duration-300 rounded-[12px] bg-surface-container-high text-on-surface-variant/70">
              1
            </div>
            <div className="flex-grow h-[2px] bg-surface-container-highest mx-1" />

            {/* Step 2 */}
            <div className="w-9 h-9 flex items-center justify-center font-bold text-sm transition-all duration-300 rounded-[12px] bg-surface-container-high text-on-surface-variant/70">
              2
            </div>
            <div className="flex-grow h-[2px] bg-surface-container-highest mx-1" />

            {/* Step 3 */}
            <div className="w-9 h-9 flex items-center justify-center font-bold text-sm transition-all duration-300 rounded-[12px] bg-surface-container-high text-on-surface-variant/70">
              3
            </div>
            <div className="flex-grow h-[2px] bg-surface-container-highest mx-1" />

            {/* Step 4 */}
            <div className="w-9 h-9 flex items-center justify-center font-bold text-sm transition-all duration-300 rounded-[12px] bg-surface-container-high text-on-surface-variant/70">
              4
            </div>
            <div className="flex-grow h-[2px] bg-surface-container-highest mx-1" />

            {/* Step 5 */}
            <div className="w-9 h-9 flex items-center justify-center font-bold text-sm transition-all duration-300 rounded-[12px] bg-primary text-on-primary shadow-md shadow-primary/20 scale-105">
              5
            </div>
          </div>
          
          {/* Label Under Stepper */}
          <div className="text-center">
            <span className="text-[10px] tracking-wider uppercase font-bold text-outline">
              Langkah 5 dari 5:{" "}
              <span className="text-primary font-extrabold normal-case">
                Peninjauan Akhir
              </span>
            </span>
          </div>
        </div>

        {/* Main Content */}
        <main className="px-4 py-4 flex-grow space-y-6">
          
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-primary mb-1.5 leading-tight">
              Cek dulu sebelum diteruskan ke OSS
            </h2>
            <p className="text-on-surface-variant text-sm leading-relaxed">
              Data di bawah ini akan dipakai untuk membantu mengisi formulir pendaftaran di portal OSS secara otomatis.
            </p>
          </div>

          {/* Cards Summaries */}
          <div className="space-y-4">
            
            {/* Card 1: Data Pemilik & Identitas KTP */}
            <section className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-border-light group-hover:bg-primary transition-colors duration-300"></div>
              <div className="flex justify-between items-center mb-3 pl-2">
                <h3 className="font-bold text-base text-on-surface">Identitas Diri & KTP</h3>
                <button
                  onClick={() => router.push("/wizard")}
                  className="text-primary hover:underline font-bold text-xs flex items-center gap-1 focus:outline-none"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  Edit
                </button>
              </div>
              <div className="space-y-2.5 pl-2 text-xs md:text-sm">
                <div>
                  <p className="font-bold text-on-surface-variant mb-0.5">Nama Lengkap (Sesuai KTP)</p>
                  <p className="text-on-surface font-medium">{formData.namaPemilik}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-bold text-on-surface-variant mb-0.5">NIK (KTP)</p>
                    <p className="text-on-surface font-mono font-medium">{formData.nik}</p>
                  </div>
                  <div>
                    <p className="font-bold text-on-surface-variant mb-0.5">Tanggal Lahir</p>
                    <p className="text-on-surface font-medium">{formData.tanggalLahir}</p>
                  </div>
                </div>
                <div className="border-t border-border-light/40 pt-2.5 mt-1">
                  <p className="font-bold text-on-surface-variant mb-0.5">Alamat Tempat Tinggal (Sesuai KTP)</p>
                  <p className="text-on-surface font-medium leading-relaxed bg-surface-container-low p-2.5 rounded-xl border border-border-light/50">
                    {formData.alamatKtp || "-"}
                  </p>
                </div>
              </div>
            </section>

            {/* Card 2: Kontak Pemilik */}
            <section className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-border-light group-hover:bg-primary transition-colors duration-300"></div>
              <div className="flex justify-between items-center mb-3 pl-2">
                <h3 className="font-bold text-base text-on-surface">Kontak & Komunikasi</h3>
                <button
                  onClick={() => router.push("/wizard")}
                  className="text-primary hover:underline font-bold text-xs flex items-center gap-1 focus:outline-none"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  Edit
                </button>
              </div>
              <div className="space-y-2.5 pl-2 text-xs md:text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-bold text-on-surface-variant mb-0.5">Nomor WhatsApp</p>
                    <p className="text-on-surface font-medium">{formData.nomorHp}</p>
                  </div>
                  <div>
                    <p className="font-bold text-on-surface-variant mb-0.5">Email Aktif</p>
                    <p className="text-on-surface font-medium">{formData.email}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Card 3: Informasi Tempat Usaha */}
            <section className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-border-light group-hover:bg-primary transition-colors duration-300"></div>
              <div className="flex justify-between items-center mb-3 pl-2">
                <h3 className="font-bold text-base text-on-surface">Informasi & Lokasi Tempat Usaha</h3>
                <button
                  onClick={() => router.push("/wizard")}
                  className="text-primary hover:underline font-bold text-xs flex items-center gap-1 focus:outline-none"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  Edit
                </button>
              </div>

              <div className="space-y-3.5 pl-2 text-xs md:text-sm">
                <div>
                  <p className="font-bold text-on-surface-variant mb-0.5">Alamat Tempat/Fisik Usaha (Untuk OSS)</p>
                  <p className="text-on-surface font-medium leading-relaxed bg-surface-container-low p-2.5 rounded-xl border border-border-light/50">
                    {formData.alamatUsaha}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-bold text-on-surface-variant mb-0.5">Luas Lahan / Tanah</p>
                    <p className="text-on-surface font-semibold text-primary">{formData.luasTanah || "0"} m²</p>
                  </div>
                  <div>
                    <p className="font-bold text-on-surface-variant mb-0.5">Jumlah Tenaga Kerja</p>
                    <p className="text-on-surface font-medium">
                      L: {formData.jumlahPekerjaLakiLaki || "0"} | P: {formData.jumlahPekerjaPerempuan || "0"} (Total: {formData.jumlahPekerja || "0"} Orang)
                    </p>
                  </div>
                </div>

                <div>
                  <p className="font-bold text-on-surface-variant mb-0.5">Titik Koordinat Lokasi</p>
                  <p className="text-on-surface font-mono font-medium">{formData.latitude}, {formData.longitude}</p>
                </div>

                {/* Map Preview */}
                <div className="relative w-full h-[150px] rounded-xl overflow-hidden border border-outline-variant shadow-inner mt-1">
                  <iframe
                    title="Review Lokasi Usaha Map"
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    scrolling="no"
                    marginHeight={0}
                    marginWidth={0}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(formData.longitude || "106.8456") - 0.002}%2C${parseFloat(formData.latitude || "-6.2088") - 0.002}%2C${parseFloat(formData.longitude || "106.8456") + 0.002}%2C${parseFloat(formData.latitude || "-6.2088") + 0.002}&layer=mapnik&marker=${formData.latitude || "-6.2088"}%2C${formData.longitude || "106.8456"}`}
                  />
                </div>

                {/* Location Image Preview */}
                {formData.fotoLokasi ? (
                  <div className="flex flex-col gap-1.5 mt-2">
                    <p className="font-bold text-on-surface-variant mb-0.5">Foto Fisik Lokasi Usaha</p>
                    <div className="relative w-full h-[140px] rounded-lg overflow-hidden border border-border-light shadow-sm max-w-[240px]">
                      <img
                        src={formData.fotoLokasi}
                        alt="Foto Lokasi Terunggah"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-outline font-semibold italic">Belum ada foto lokasi usaha terpilih.</p>
                )}
              </div>
            </section>

            {/* Card 4: Dokumen Administrasi OSS */}
            <section className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-border-light group-hover:bg-primary transition-colors duration-300"></div>
              <div className="flex justify-between items-center mb-3 pl-2">
                <h3 className="font-bold text-base text-on-surface">Dokumen Ekspor untuk OSS</h3>
                <span className="text-[10px] bg-secondary-container text-on-secondary-container font-semibold px-2 py-0.5 rounded">
                  Format PDF Resmi
                </span>
              </div>
              <div className="space-y-3.5 pl-2 text-xs md:text-sm">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Unduh dokumen administrasi lokasi dan foto fisik usaha di bawah ini. Dokumen ini dapat diunggah ke portal OSS untuk melengkapi persyaratan.
                </p>
                {/* Backend PDF Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                  <button
                    type="button"
                    onClick={downloadNpsPdf}
                    disabled={downloadingNps}
                    className="flex-1 px-4 py-2.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary-container hover:text-on-primary-container transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {downloadingNps ? "sync" : "picture_as_pdf"}
                    </span>
                    {downloadingNps ? "Mengekspor..." : "Unduh Dokumen Adm (PDF)"}
                  </button>

                  <button
                    type="button"
                    onClick={downloadPhotoPdf}
                    disabled={downloadingPhoto || !formData.fotoLokasi}
                    className="flex-1 px-4 py-2.5 rounded-full border border-primary text-primary text-xs font-bold hover:bg-primary-container/20 transition-all active:scale-[0.98] disabled:opacity-40 disabled:border-outline-variant disabled:text-outline flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {downloadingPhoto ? "sync" : "photo_library"}
                    </span>
                    {downloadingPhoto ? "Mengekspor..." : "Unduh Foto Lokasi (PDF)"}
                  </button>
                </div>
              </div>
            </section>

            {/* Card 3: KBLI Terpilih */}
            <section className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-primary"></div>
              <div className="pl-2">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-base text-on-surface">KBLI Terpilih</h3>
                  <button
                    onClick={() => router.push("/kbli")}
                    className="text-primary hover:underline font-bold text-xs flex items-center gap-1 focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    Ubah
                  </button>
                </div>
                <div className="bg-surface-container-low rounded-xl p-3.5 border border-outline-variant flex gap-3 items-start">
                  <div className="bg-primary text-on-primary font-bold px-3 py-1.5 rounded-lg flex items-center justify-center shrink-0 font-mono text-sm border border-primary-container">
                    {selectedKbli.code}
                  </div>
                  <div className="text-xs md:text-sm">
                    <p className="font-bold text-on-surface mb-0.5">{selectedKbli.title}</p>
                    <p className="text-on-surface-variant line-clamp-2 leading-relaxed">
                      {selectedKbli.description}
                    </p>
                  </div>
                </div>
              </div>
            </section>

          </div>

          {/* Consent Checkboxes */}
          <section className="border-t border-border-light pt-6 space-y-4">
            <h3 className="font-bold text-base text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">gavel</span>
              Persetujuan & Kebijakan Otomatisasi
            </h3>

            <div className="bg-surface-container-low border border-border-light rounded-2xl p-4 text-xs space-y-4 leading-relaxed text-on-surface-variant">
              <div>
                <p className="font-bold text-primary mb-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm font-bold">check_circle</span>
                  Yang dilakukan NIB Assistant:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Membuka portal resmi OSS Indonesia menggunakan browser otomatis.</li>
                  <li>Mengisi isian form sesuai data yang Anda tinjau di atas.</li>
                  <li>Berhenti sementara dan meminta bantuan Anda ketika menemui OTP, CAPTCHA, atau konfirmasi submit akhir.</li>
                </ul>
              </div>
              
              <div>
                <p className="font-bold text-status-error mb-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm font-bold">cancel</span>
                  Yang TIDAK dilakukan NIB Assistant:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>TIDAK menyimpan password/kredensial login Anda secara permanen.</li>
                  <li>TIDAK membypass kode OTP dari WhatsApp/Email.</li>
                  <li>TIDAK melakukan klik "Kirim Permohonan Final" sebelum Anda menyetujuinya secara langsung.</li>
                </ul>
              </div>
            </div>

            {/* Checkbox Inputs */}
            <div className="space-y-3.5">
              {[
                { state: consent1, set: setConsent1, text: "Saya memahami risiko teknis penggunaan otomatisasi browser." },
                { state: consent2, set: setConsent2, text: "Saya mengizinkan NIB Assistant mengisi form OSS atas nama saya." },
                { state: consent3, set: setConsent3, text: "Saya menyetujui proses direkam demi keamanan dan transparansi audit." },
                { state: consent4, set: setConsent4, text: "Saya berjanji memeriksa ulang semua isian data di portal OSS sebelum submit final." }
              ].map((item, idx) => (
                <label key={idx} className="flex items-start gap-3 cursor-pointer group select-none">
                  <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={item.state}
                      onChange={(e) => item.set(e.target.checked)}
                      className="peer appearance-none w-5.5 h-5.5 border border-outline rounded bg-surface-card checked:bg-primary checked:border-primary transition-all focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                    />
                    <span className="material-symbols-outlined absolute text-on-primary opacity-0 peer-checked:opacity-100 pointer-events-none text-sm font-bold">
                      check
                    </span>
                  </div>
                  <span className="text-xs md:text-sm text-on-surface-variant group-hover:text-primary transition-colors font-medium leading-snug">
                    {item.text}
                  </span>
                </label>
              ))}
            </div>
          </section>

        </main>

        {/* Bottom CTA Block */}
        <div className="fixed bottom-0 left-0 right-0 md:absolute md:-bottom-2 bg-surface-card border-t border-border-light px-4 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-40 md:rounded-b-2xl">
          <div className="max-w-max-width-form mx-auto">
            <button
              onClick={handleProceedToAutomation}
              disabled={!isAllConsentGiven}
              className={`w-full py-4 px-6 rounded-full font-bold flex items-center justify-center gap-2 min-h-[54px] shadow-md transition-all active:scale-[0.98] ${
                isAllConsentGiven
                  ? "bg-primary text-on-primary hover:bg-primary-container cursor-pointer"
                  : "bg-surface-container-high text-outline opacity-60 cursor-not-allowed"
              }`}
            >
              Lanjut ke OSS
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
