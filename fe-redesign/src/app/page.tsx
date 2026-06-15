"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  
  // Navigation tab state: 'eligibility' | 'requirements'
  const [activeTab, setActiveTab] = useState<"eligibility" | "requirements">("eligibility");

  // Form selections state
  const [tipeUsaha, setTipeUsaha] = useState<string>("perorangan");
  const [skalaUsaha, setSkalaUsaha] = useState<string>("mikro");
  const [akunOss, setAkunOss] = useState<string>("belum");

  const handleStartDraft = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Save choices to sessionStorage so the wizard can load them as defaults
    sessionStorage.setItem("tipe_usaha", tipeUsaha);
    sessionStorage.setItem("skala_usaha", skalaUsaha);
    sessionStorage.setItem("akun_oss", akunOss);

    // Route to the wizard step 1
    router.push("/wizard");
  };

  return (
    <div className="flex-grow flex flex-col bg-background min-h-screen font-sans">
      
      {/* ── Header Navigation (Flat White, Dual Logo) ── */}
      <header className="sticky top-0 bg-white border-b border-border-light h-16 px-4 md:px-8 flex items-center justify-between z-50">
        {/* Left Section: Logo & National Crest Icon */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded bg-[#E5E7EB] text-[#7C2D12] font-extrabold text-sm shadow-inner shrink-0" title="Lambang Garuda">
            🇮🇩
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-sm tracking-wider text-primary-container uppercase leading-none">
              NIB Assistant
            </span>
            <span className="text-[9px] font-bold text-tertiary uppercase tracking-widest leading-none mt-1">
              UMKM Partner
            </span>
          </div>
        </div>

        {/* Center Section: Navigation (Underline Indicator) */}
        <nav className="hidden md:flex items-center gap-6 h-full">
          <button
            onClick={() => setActiveTab("eligibility")}
            className={`font-extrabold text-xs uppercase tracking-wider h-full flex items-center border-b-4 transition-all ${
              activeTab === "eligibility"
                ? "border-primary-container text-primary-container"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Mulai Registrasi
          </button>
          <button
            onClick={() => setActiveTab("requirements")}
            className={`font-extrabold text-xs uppercase tracking-wider h-full flex items-center border-b-4 transition-all ${
              activeTab === "requirements"
                ? "border-primary-container text-primary-container"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Persyaratan NIB
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="font-extrabold text-xs uppercase tracking-wider h-full flex items-center border-b-4 border-transparent text-on-surface-variant hover:text-on-surface"
          >
            Dashboard
          </button>
        </nav>

        {/* Right Section: Action Buttons */}
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded text-xs font-bold border border-primary-container text-primary-container hover:bg-surface-container transition-all">
            Daftar
          </button>
          <button 
            onClick={() => router.push("/dashboard")}
            className="px-3 py-1.5 rounded text-xs font-bold bg-primary-container text-white hover:bg-primary transition-all"
          >
            Masuk
          </button>
        </div>
      </header>

      {/* ── Main Container (Centered wizard grid, max 640px) ── */}
      <main className="flex-grow flex justify-center w-full px-4 py-8 pb-32 md:pb-12">
        <div className="w-full max-w-[640px] flex flex-col gap-6">
          
          {/* Page Title & Tagline */}
          <div className="text-center md:text-left">
            <h1 className="text-xl md:text-2xl font-extrabold uppercase tracking-wide text-on-surface">
              Mulai Perjalanan NIB Anda
            </h1>
            <p className="text-xs md:text-sm text-on-surface-variant mt-2 leading-relaxed">
              Cukup deskripsikan usaha Anda secara kasual. Kami bantu menyiapkan draft pendaftaran NIB lengkap dengan rekomendasi kode KBLI 2020 otomatis via kecerdasan buatan.
            </p>
          </div>

          {/* ── Segmented Category Selector (Joined Segments) ── */}
          <div className="flex w-full rounded-lg overflow-hidden border border-border-light">
            <button
              onClick={() => setActiveTab("eligibility")}
              className={`flex-1 py-3 px-4 font-bold text-xs uppercase tracking-wider text-center transition-all ${
                activeTab === "eligibility"
                  ? "bg-secondary text-white"
                  : "bg-tertiary text-white hover:bg-opacity-90"
              }`}
              style={{ borderRadius: "0px" }}
            >
              Mulai Draft NIB
            </button>
            <button
              onClick={() => setActiveTab("requirements")}
              className={`flex-1 py-3 px-4 font-bold text-xs uppercase tracking-wider text-center transition-all ${
                activeTab === "requirements"
                  ? "bg-secondary text-white"
                  : "bg-tertiary text-white hover:bg-opacity-90"
              }`}
              style={{ borderRadius: "0px" }}
            >
              Dokumen Persyaratan
            </button>
          </div>

          {/* ── Dynamic Tab View Content ── */}
          <div className="flex-grow">
            {activeTab === "eligibility" ? (
              <div className="animate-fadeIn">
                <form id="onboarding-form" onSubmit={handleStartDraft} className="space-y-6">
                  
                  {/* Flat Bento Panel for Eligibility */}
                  <div className="bento-card space-y-6">
                    
                    {/* Tipe Usaha Selector */}
                    <div className="space-y-3">
                      <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
                        <span className="material-symbols-outlined text-base text-primary-container">
                          corporate_fare
                        </span>
                        Tipe Usaha Anda
                      </label>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <label className="cursor-pointer">
                          <input
                            type="radio"
                            name="tipe_usaha"
                            value="perorangan"
                            checked={tipeUsaha === "perorangan"}
                            onChange={(e) => setTipeUsaha(e.target.value)}
                            className="peer sr-only"
                          />
                          <div className="px-3 py-4 rounded border border-border-light peer-checked:border-primary-container peer-checked:bg-primary-container/5 peer-checked:text-primary-container hover:bg-surface-container-low transition-all text-center font-bold text-xs min-h-[56px] flex flex-col items-center justify-center gap-1.5">
                            <span className="material-symbols-outlined text-lg">person</span>
                            Perorangan (UMKM)
                          </div>
                        </label>
                        <label className="cursor-pointer">
                          <input
                            type="radio"
                            name="tipe_usaha"
                            value="badan_usaha"
                            checked={tipeUsaha === "badan_usaha"}
                            onChange={(e) => setTipeUsaha(e.target.value)}
                            className="peer sr-only"
                          />
                          <div className="px-3 py-4 rounded border border-border-light peer-checked:border-primary-container peer-checked:bg-primary-container/5 peer-checked:text-primary-container hover:bg-surface-container-low transition-all text-center font-bold text-xs min-h-[56px] flex flex-col items-center justify-center gap-1.5">
                            <span className="material-symbols-outlined text-lg">domain</span>
                            Badan Usaha
                          </div>
                        </label>
                      </div>

                      {tipeUsaha === "badan_usaha" && (
                        <div className="p-3 bg-error/5 border border-error/20 rounded flex items-start gap-2.5 animate-slideDown">
                          <span className="material-symbols-outlined text-error text-base shrink-0 mt-0.5">
                            error
                          </span>
                          <p className="text-[11px] text-error font-medium leading-relaxed">
                            <strong>Perhatian:</strong> Saat ini otomatisasi NIB Assistant baru mendukung pendaftaran untuk <strong>Usaha Perorangan</strong>. Layanan Badan Usaha (PT/CV) akan segera hadir.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Skala Usaha Selector */}
                    <div className="space-y-3">
                      <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
                        <span className="material-symbols-outlined text-base text-primary-container">
                          bar_chart
                        </span>
                        Skala Modal Usaha
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="cursor-pointer">
                          <input
                            type="radio"
                            name="skala_usaha"
                            value="mikro"
                            checked={skalaUsaha === "mikro"}
                            onChange={(e) => setSkalaUsaha(e.target.value)}
                            className="peer sr-only"
                          />
                          <div className="px-3 py-4 rounded border border-border-light peer-checked:border-primary-container peer-checked:bg-primary-container/5 peer-checked:text-primary-container hover:bg-surface-container-low transition-all text-center font-bold text-xs min-h-[56px] flex flex-col items-center justify-center gap-1.5">
                            Mikro / Kecil (&lt; Rp 5 Miliar)
                          </div>
                        </label>
                        <label className="cursor-pointer">
                          <input
                            type="radio"
                            name="skala_usaha"
                            value="menengah"
                            checked={skalaUsaha === "menengah"}
                            onChange={(e) => setSkalaUsaha(e.target.value)}
                            className="peer sr-only"
                          />
                          <div className="px-3 py-4 rounded border border-border-light peer-checked:border-primary-container peer-checked:bg-primary-container/5 peer-checked:text-primary-container hover:bg-surface-container-low transition-all text-center font-bold text-xs min-h-[56px] flex flex-col items-center justify-center gap-1.5">
                            Menengah / Besar (&gt; Rp 5 Miliar)
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Akun OSS Selector */}
                    <div className="space-y-3">
                      <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
                        <span className="material-symbols-outlined text-base text-primary-container">
                          account_circle
                        </span>
                        Kepemilikan Akun OSS
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "Sudah Punya", val: "sudah", icon: "check_circle" },
                          { label: "Belum Punya", val: "belum", icon: "add_circle" },
                          { label: "Ragu-Ragu", val: "belum_yakin", icon: "help" },
                        ].map((item) => (
                          <label key={item.val} className="cursor-pointer">
                            <input
                              type="radio"
                              name="akun_oss"
                              value={item.val}
                              checked={akunOss === item.val}
                              onChange={(e) => setAkunOss(e.target.value)}
                              disabled={tipeUsaha === "badan_usaha"}
                              className="peer sr-only"
                            />
                            <div className="px-1 py-4 rounded border border-border-light peer-checked:border-primary-container peer-checked:bg-primary-container/5 peer-checked:text-primary-container hover:bg-surface-container-low transition-all text-center font-bold text-[11px] min-h-[56px] flex flex-col items-center justify-center gap-1.5 disabled:opacity-50">
                              <span className="material-symbols-outlined text-sm">{item.icon}</span>
                              {item.label}
                            </div>
                          </label>
                        ))}
                      </div>
                      <p className="text-[10px] text-on-surface-variant leading-relaxed">
                        Akun OSS resmi diterbitkan oleh BKPM RI. Jika Anda memilih "Belum Punya", kami akan memandu Anda membuat akun baru secara otomatis melalui WhatsApp/SMS OTP.
                      </p>
                    </div>

                  </div>

                  {/* Actions (Desktop) */}
                  <div className="hidden md:flex justify-end pt-4 border-t border-border-light">
                    <button
                      type="submit"
                      disabled={tipeUsaha === "badan_usaha"}
                      className="px-6 py-3 rounded bg-primary-container text-white font-bold text-xs uppercase tracking-wider min-h-[44px] flex items-center gap-2 shadow-sm hover:bg-primary transition-all disabled:opacity-50 cursor-pointer"
                    >
                      Mulai Buat Draft NIB
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                  </div>

                </form>
              </div>
            ) : (
              // Requirements Tab Bento View
              <div className="animate-fadeIn flex flex-col gap-6">
                
                <div className="bento-card space-y-6">
                  <div>
                    <h3 className="font-extrabold text-sm uppercase tracking-wider text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg text-[#7C2D12]">assignment</span>
                      Data Yang Perlu Disiapkan
                    </h3>
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      Siapkan dokumen dan informasi berikut sebelum mulai agar pengisian berjalan tanpa hambatan.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* Identitas */}
                    <div className="flex gap-3 items-start pb-4 border-b border-border-light">
                      <div className="w-8 h-8 rounded bg-border-light text-primary-container flex items-center justify-center shrink-0 font-bold text-xs">
                        01
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-on-surface uppercase tracking-wide">Data Pemilik (KTP)</h4>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed mt-1">
                          Nomor Induk Kependudukan (NIK) 16-digit, Nama Lengkap sesuai KTP, dan Tanggal Lahir Anda.
                        </p>
                      </div>
                    </div>

                    {/* Kontak */}
                    <div className="flex gap-3 items-start pb-4 border-b border-border-light">
                      <div className="w-8 h-8 rounded bg-border-light text-primary-container flex items-center justify-center shrink-0 font-bold text-xs">
                        02
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-on-surface uppercase tracking-wide">Kontak Aktif</h4>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed mt-1">
                          Nomor WhatsApp aktif untuk menerima kode OTP verifikasi resmi dari sistem OSS BKPM, serta Email aktif.
                        </p>
                      </div>
                    </div>

                    {/* Usaha */}
                    <div className="flex gap-3 items-start">
                      <div className="w-8 h-8 rounded bg-border-light text-primary-container flex items-center justify-center shrink-0 font-bold text-xs">
                        03
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-on-surface uppercase tracking-wide">Detail Operasional & Lokasi</h4>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed mt-1">
                          Alamat lengkap lokasi usaha, perkiraan jumlah karyawan, modal awal usaha, dan penjelasan aktivitas usaha Anda.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions (Desktop) */}
                <div className="hidden md:flex justify-end pt-4 border-t border-border-light">
                  <button
                    onClick={() => setActiveTab("eligibility")}
                    className="px-6 py-3 rounded bg-primary-container text-white font-bold text-xs uppercase tracking-wider min-h-[44px] flex items-center gap-2 shadow-sm hover:bg-primary transition-all cursor-pointer"
                  >
                    Saya Siap, Mulai Sekarang
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>

              </div>
            )}
          </div>

        </div>
      </main>

      {/* ── Mobile Sticky bottom bar CTAs ── */}
      {activeTab === "eligibility" && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass-bar border-t border-border-light px-5 py-4 shadow-sm z-40">
          <button
            type="submit"
            form="onboarding-form"
            disabled={tipeUsaha === "badan_usaha"}
            className="w-full bg-primary-container text-white font-bold py-3 px-6 rounded flex items-center justify-center gap-2 shadow-sm text-xs uppercase tracking-wider min-h-[48px] disabled:opacity-50"
          >
            Mulai Buat Draft NIB
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      )}

      {activeTab === "requirements" && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass-bar border-t border-border-light px-5 py-4 shadow-sm z-40">
          <button
            onClick={() => setActiveTab("eligibility")}
            className="w-full bg-primary-container text-white font-bold py-3 px-6 rounded flex items-center justify-center gap-2 shadow-sm text-xs uppercase tracking-wider min-h-[48px]"
          >
            Saya Siap, Mulai Sekarang
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      )}

    </div>
  );
}
