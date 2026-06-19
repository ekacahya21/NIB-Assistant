"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const getTimestampSeconds = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
};

// Simple fallback for Suspense boundary
function ResultLoading() {
  return (
    <div className="flex-grow flex flex-col justify-center items-center bg-background min-h-screen font-sans p-4">
      <div className="w-10 h-10 rounded bg-primary-container/10 text-primary-container flex items-center justify-center animate-spin">
        <span className="material-symbols-outlined text-xl">sync</span>
      </div>
      <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mt-3 animate-pulse">
        Memuat Status Hasil...
      </span>
    </div>
  );
}

// Copy Button component with micro-interaction feedback
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`p-1.5 hover:bg-surface-container rounded transition-all flex items-center justify-center shrink-0 border border-border-light cursor-pointer ${
        copied ? "bg-success/5 border-success/30 text-success" : "text-on-surface-variant"
      }`}
      title={copied ? "Tersalin!" : "Salin ke Papan Klip"}
    >
      <span className="material-symbols-outlined text-sm font-semibold">
        {copied ? "check" : "content_copy"}
      </span>
    </button>
  );
}

function ResultPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stateParam = searchParams.get("state") || "success"; // success, warning, failed
  
  // Data states
  const [draftId, setDraftId] = useState<string>("");
  const [formData, setFormData] = useState<any>(null);
  const [selectedKbli, setSelectedKbli] = useState<any>(null);
  const [downloadingNps, setDownloadingNps] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  // Generate a mock NIB for demonstration
  const [mockNib] = useState(() => {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    return `24061500${randomSuffix}`;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedId = sessionStorage.getItem("draft_id") || "DEMO123";
      const storedData = sessionStorage.getItem("draft_form_data");
      const storedKbli = sessionStorage.getItem("selected_kbli");

      setDraftId(storedId);

      if (storedData) {
        try {
          setFormData(JSON.parse(storedData));
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

  // PDF Download Trigger
  const downloadNpsPdf = async () => {
    if (!formData) {
      alert("Data form tidak ditemukan untuk mengunduh PDF.");
      return;
    }
    setDownloadingNps(true);
    try {
      const res = await fetch(`${API_URL}/documents/generate-nps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          alamatUsaha: formData.alamatUsaha || formData.alamatUsahaRaw || "Alamat Usaha",
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
      a.download = `dokumen_administrasi_nib_${draftId || "draft"}_${getTimestampSeconds()}.pdf`;
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

  // Copy all data as text for manual registration
  const handleCopyAll = () => {
    if (!formData) return;
    const kbliText = selectedKbli 
      ? `KBLI: ${selectedKbli.code} - ${selectedKbli.title}` 
      : "KBLI: -";
    const allText = `=== DATA PENDAFTARAN NIB ===
Nama Usaha: ${formData.namaUsaha || "-"}
Nama Pemilik: ${formData.namaPemilik || "-"}
NIK: ${formData.nik || "-"}
Tanggal Lahir: ${formData.tanggalLahir || "-"}
Jenis Kelamin: ${formData.jenisKelamin === "L" ? "Laki-laki" : "Perempuan"}
Nomor HP: ${formData.nomorHp || "-"}
Email: ${formData.email || "-"}
Alamat Usaha: ${formData.alamatUsaha || "-"}
Modal Usaha: Rp ${formData.modalUsaha || "0"}
Jumlah Pekerja: ${formData.jumlahPekerja || "0"} orang
Cara Penjualan: ${formData.caraPenjualan || "Lainnya"}
${kbliText}
============================`;
    
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(allText);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const getKbliDisplay = () => {
    if (selectedKbli) {
      return `${selectedKbli.code} — ${selectedKbli.title}`;
    }
    return formData?.kbliCode ? `${formData.kbliCode} — ${formData.kbliTitle || "KBLI Terpilih"}` : "56103 — Kedai Makanan";
  };

  return (
    <div className="flex-grow flex flex-col bg-background min-h-screen font-sans">
      
      {/* ── Header AppBar ── */}
      <header className="sticky top-0 bg-white border-b border-border-light h-16 px-4 md:px-8 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded bg-[#E5E7EB] text-[#7C2D12] font-extrabold text-sm shadow-inner shrink-0" title="Lambang Garuda">
            🇮🇩
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-sm tracking-wider text-primary-container uppercase leading-none">
              NIB Assistant
            </span>
            <span className="text-[9px] font-bold text-tertiary uppercase tracking-widest leading-none mt-1">
              Hasil Otomatisasi
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => router.push("/dashboard")}
            className="px-3.5 py-1.5 rounded text-[11px] font-bold text-on-surface-variant hover:bg-surface-container transition-all uppercase tracking-wider"
          >
            Dashboard
          </button>
          <button 
            onClick={() => router.push("/")}
            className="px-3.5 py-1.5 rounded text-[11px] font-bold bg-primary-container text-white hover:bg-primary transition-all uppercase tracking-wider"
          >
            Mulai Baru
          </button>
        </div>
      </header>

      {/* ── Main Container (max 640px) ── */}
      <main className="flex-grow flex justify-center w-full px-4 py-8 pb-24">
        <div className="w-full max-w-[640px] flex flex-col gap-6">

          {/* ────────────────── STATE 1: SUCCESS STATE ────────────────── */}
          {stateParam === "success" && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Green Celebration Bento Card */}
              <div className="bento-card bg-white border border-success/30 flex flex-col items-center text-center p-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-success/10 border border-success/20 flex items-center justify-center text-success relative">
                  <div className="absolute inset-0 rounded-full bg-success/5 animate-ping opacity-75" />
                  <span className="material-symbols-outlined text-3xl font-extrabold">check_circle</span>
                </div>
                
                <div>
                  <h1 className="text-lg md:text-xl font-extrabold uppercase tracking-wide text-success">
                    Pendaftaran NIB Berhasil!
                  </h1>
                  <p className="text-xs text-on-surface-variant mt-2 max-w-sm mx-auto leading-relaxed">
                    Selamat! Draft NIB Anda berhasil diisi dan diterbitkan ke portal OSS BKPM RI secara otomatis.
                  </p>
                </div>
              </div>

              {/* NIB Data Card */}
              <div className="bento-card space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant border-b border-border-light pb-2">
                  Detail Nomor Induk Berusaha (NIB)
                </h3>

                <div className="bg-surface-container-low border border-border-light rounded p-4 flex flex-col sm:flex-row justify-between items-center gap-3">
                  <div className="text-center sm:text-left">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                      Nomor NIB Resmi
                    </span>
                    <span className="text-lg font-mono font-extrabold text-primary-container tracking-wider block mt-1">
                      {mockNib}
                    </span>
                  </div>
                  <CopyButton text={mockNib} />
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-start py-2 border-b border-border-light text-xs">
                    <span className="font-bold text-on-surface-variant uppercase tracking-wide shrink-0 w-32">Nama Usaha</span>
                    <span className="font-extrabold text-on-surface text-right">{formData?.namaUsaha || "Geprek Pedas Mantap"}</span>
                  </div>
                  <div className="flex justify-between items-start py-2 border-b border-border-light text-xs">
                    <span className="font-bold text-on-surface-variant uppercase tracking-wide shrink-0 w-32">Nama Pemilik</span>
                    <span className="font-extrabold text-on-surface text-right">{formData?.namaPemilik || "Budi Santoso"}</span>
                  </div>
                  <div className="flex justify-between items-start py-2 border-b border-border-light text-xs">
                    <span className="font-bold text-on-surface-variant uppercase tracking-wide shrink-0 w-32">KBLI Terpilih</span>
                    <span className="font-extrabold text-on-surface text-right">{getKdisplayString(selectedKbli, formData)}</span>
                  </div>
                  <div className="flex justify-between items-start py-2 text-xs">
                    <span className="font-bold text-on-surface-variant uppercase tracking-wide shrink-0 w-32">Status Registrasi</span>
                    <span className="font-bold px-2 py-0.5 rounded text-[10px] uppercase bg-success/10 text-success border border-success/25">
                      Aktif / Sukses
                    </span>
                  </div>
                </div>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={downloadNpsPdf}
                  disabled={downloadingNps}
                  className="flex-1 bg-primary-container hover:bg-primary text-white font-bold py-3 px-6 rounded text-xs uppercase tracking-wider min-h-[48px] flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">{downloadingNps ? "sync" : "picture_as_pdf"}</span>
                  {downloadingNps ? "Mengunduh..." : "Unduh Ringkasan PDF"}
                </button>
                <a
                  href="https://oss.go.id"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 border border-primary-container text-primary-container hover:bg-primary-container/5 font-bold py-3 px-6 rounded text-xs uppercase tracking-wider min-h-[48px] flex items-center justify-center gap-2 transition-all"
                >
                  <span>Buka Portal OSS</span>
                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                </a>
              </div>

            </div>
          )}

          {/* ────────────────── STATE 2: ACTION REQUIRED STATE ────────────────── */}
          {stateParam === "warning" && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Amber Warning Bento Card */}
              <div className="bento-card bg-white border border-warning/30 flex flex-col items-center text-center p-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-warning/10 border border-warning/20 flex items-center justify-center text-warning">
                  <span className="material-symbols-outlined text-3xl font-bold">warning</span>
                </div>
                
                <div>
                  <h1 className="text-lg md:text-xl font-extrabold uppercase tracking-wide text-warning">
                    Persetujuan Akhir Diperlukan
                  </h1>
                  <p className="text-xs text-on-surface-variant mt-2 max-w-sm mx-auto leading-relaxed">
                    Data berhasil diisi oleh bot ke portal OSS. Anda perlu melakukan tanda tangan elektronik atau konfirmasi persetujuan akhir secara manual.
                  </p>
                </div>
              </div>

              {/* Step instructions */}
              <div className="bento-card space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant border-b border-border-light pb-2">
                  Langkah Menyelesaikan NIB Anda
                </h3>

                <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-4 before:-translate-x-px before:w-0.5 before:bg-border-light pt-2">
                  {[
                    {
                      num: "01",
                      title: "Buka Portal OSS",
                      desc: "Teks tombol di bawah akan mengarahkan Anda ke situs resmi oss.go.id."
                    },
                    {
                      num: "02",
                      title: "Masuk ke Akun Anda",
                      desc: "Gunakan kredensial akun yang baru saja didaftarkan/dibuat di WhatsApp/Email Anda."
                    },
                    {
                      num: "03",
                      title: "Tanda Tangan Elektronik / Persetujuan",
                      desc: "Masuk ke halaman draf NIB, klik draft pendaftaran Anda, centang kotak persetujuan akhir, lalu klik 'Terbitkan NIB'."
                    }
                  ].map((step) => (
                    <div key={step.num} className="relative flex items-start gap-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded bg-[#ECEEF0] text-primary-container font-extrabold text-xs border border-border-light shrink-0 z-10">
                        {step.num}
                      </div>
                      <div className="pt-1.5">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-on-surface">
                          {step.title}
                        </h4>
                        <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <a
                  href="https://oss.go.id"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-grow bg-primary-container hover:bg-primary text-white font-bold py-3 px-6 rounded text-xs uppercase tracking-wider min-h-[48px] flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <span>Buka Halaman Persetujuan OSS</span>
                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                </a>
                <button
                  onClick={downloadNpsPdf}
                  disabled={downloadingNps}
                  className="border border-border-light hover:bg-surface-container-low text-on-surface font-bold py-3 px-5 rounded text-xs uppercase tracking-wider min-h-[48px] flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">{downloadingNps ? "sync" : "picture_as_pdf"}</span>
                  Unduh Berkas Adm
                </button>
              </div>

            </div>
          )}

          {/* ────────────────── STATE 3: FAILED STATE ────────────────── */}
          {stateParam === "failed" && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Red Warning Bento Card */}
              <div className="bento-card bg-white border border-error/30 flex flex-col items-center text-center p-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-error/10 border border-error/20 flex items-center justify-center text-error">
                  <span className="material-symbols-outlined text-3xl font-bold">gavel</span>
                </div>
                
                <div>
                  <h1 className="text-lg md:text-xl font-extrabold uppercase tracking-wide text-error">
                    Otomatisasi Pengisian Terhenti
                  </h1>
                  <p className="text-xs text-on-surface-variant mt-2 max-w-sm mx-auto leading-relaxed">
                    Sistem otomatisasi terhenti karena perubahan struktur portal OSS. <strong>Jangan khawatir, data draf Anda tetap aman dan dapat disalin dengan mudah.</strong>
                  </p>
                </div>
              </div>

              {/* Instructions manual */}
              <div className="bento-card space-y-4">
                <div className="flex justify-between items-center border-b border-border-light pb-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant">
                    Lanjutkan Secara Manual
                  </h3>
                  <button
                    onClick={handleCopyAll}
                    className="text-[10px] font-extrabold uppercase tracking-wider text-primary-container flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-xs">
                      {copiedAll ? "check" : "content_copy"}
                    </span>
                    {copiedAll ? "Tersalin!" : "Salin Semua"}
                  </button>
                </div>

                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Gunakan data di bawah ini untuk mengisi formulir di portal resmi OSS secara mandiri. Cukup klik tombol salin di samping setiap baris data.
                </p>

                {/* Copyable Data Fields */}
                <div className="space-y-3 pt-2">
                  {[
                    { label: "Nama Pemilik", val: formData?.namaPemilik || "Budi Santoso" },
                    { label: "NIK KTP", val: formData?.nik || "3201020304050607" },
                    { label: "Tanggal Lahir", val: formData?.tanggalLahir || "1990-01-01" },
                    { label: "Email Pemilik", val: formData?.email || "budi.santoso@email.com" },
                    { label: "Nomor HP / WA", val: formData?.nomorHp || "08123456789" },
                    { label: "Nama Usaha / Toko", val: formData?.namaUsaha || "Geprek Pedas Mantap" },
                    { label: "Alamat Usaha", val: formData?.alamatUsaha || formData?.alamatUsahaRaw || "Jl. Raya Bogor No. 12" },
                    { label: "Modal Usaha", val: formData?.modalUsaha ? `Rp ${formData.modalUsaha}` : "Rp 15.000.000" },
                    { label: "Tenaga Kerja", val: formData?.jumlahPekerja ? `${formData.jumlahPekerja} orang` : "2 orang" },
                    { label: "KBLI Usaha", val: getKbliDisplay() }
                  ].map((field, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2.5 border-b border-border-light text-xs gap-3">
                      <span className="font-bold text-on-surface-variant uppercase tracking-wide shrink-0 w-32">
                        {field.label}
                      </span>
                      <div className="flex items-center gap-2 flex-grow justify-end min-w-0">
                        <span className="font-extrabold text-on-surface truncate max-w-[200px] sm:max-w-[280px]">
                          {field.val}
                        </span>
                        <CopyButton text={field.val} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <a
                  href="https://oss.go.id"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-grow bg-primary-container hover:bg-primary text-white font-bold py-3 px-6 rounded text-xs uppercase tracking-wider min-h-[48px] flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <span>Buka Portal OSS & Isi Data</span>
                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                </a>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="border border-border-light hover:bg-surface-container-low text-on-surface font-bold py-3 px-5 rounded text-xs uppercase tracking-wider min-h-[48px]"
                >
                  Ke Dashboard Draft
                </button>
              </div>

            </div>
          )}

        </div>
      </main>

    </div>
  );
}

function getKdisplayString(selectedKbli: any, formData: any) {
  if (selectedKbli) {
    return `${selectedKbli.code} — ${selectedKbli.title}`;
  }
  return formData?.kbliCode ? `${formData.kbliCode} — ${formData.kbliTitle || "KBLI Terpilih"}` : "56103 — Kedai Makanan";
}

export default function ResultPage() {
  return (
    <Suspense fallback={<ResultLoading />}>
      <ResultPageContent />
    </Suspense>
  );
}
