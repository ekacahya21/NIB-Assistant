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

  // Warnings / helpers state
  const [showScaleHelper, setShowScaleHelper] = useState(false);

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
    <div className="flex-grow flex flex-col bg-background min-h-screen">
      
      {/* Centered Container Wrapper (Matches Step 1-5 Layout) */}
      <main className="flex-grow flex justify-center w-full px-4 md:px-10 py-8 md:py-10 pb-32 md:pb-10">
        <div className="w-full max-w-[800px] flex flex-col gap-8 md:gap-10">
          
          {/* ── Premium Gradient Header Card (Bento Style) ── */}
          <header className="relative overflow-hidden bg-gradient-to-br from-primary via-primary/95 to-secondary p-6 md:p-10 rounded-3xl text-white shadow-xl">
            {/* Decorative organic blurs */}
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-xl" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5 blur-lg" />
            <div className="absolute top-1/2 right-1/4 w-72 h-72 rounded-full bg-white/[0.04] blur-3xl pointer-events-none" />
            
            <div className="relative z-10 flex items-center gap-2.5 mb-6">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm shadow-inner">
                <span className="material-symbols-outlined text-white text-xl font-bold">
                  shield_person
                </span>
              </div>
              <span className="font-sans text-xs uppercase tracking-wider font-extrabold text-white/80 bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
                NIB Assistant
              </span>
            </div>

            <h1 className="relative z-10 text-3xl md:text-5xl font-extrabold text-white leading-tight mb-4 drop-shadow-sm">
              Mulai Perjalanan <br className="hidden sm:inline" />NIB Anda
            </h1>
            <p className="relative z-10 text-white/90 text-sm md:text-base leading-relaxed max-w-xl drop-shadow-sm font-medium">
              Cukup ceritakan usaha Anda — kami bantu siapkan draft NIB lengkap dengan rekomendasi KBLI yang tepat dengan bantuan teknologi AI.
            </p>
          </header>

          {/* ── Tab Selector Segment ── */}
          <div className="w-full">
            <div className="flex bg-surface-container-low rounded-2xl p-1.5 border border-border-light shadow-md">
              <button
                onClick={() => setActiveTab("eligibility")}
                className={`flex-1 py-3.5 px-4 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                  activeTab === "eligibility"
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                }`}
              >
                <span className="material-symbols-outlined text-lg">check_circle</span>
                Mulai Sekarang
              </button>
              <button
                onClick={() => setActiveTab("requirements")}
                className={`flex-1 py-3.5 px-4 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                  activeTab === "requirements"
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                }`}
              >
                <span className="material-symbols-outlined text-lg">assignment</span>
                Apa yang Perlu Disiapkan
              </button>
            </div>
          </div>

          {/* ── Dynamic View Content ── */}
          <div className="flex-grow">
            {activeTab === "eligibility" ? (
              <div className="animate-fadeIn">
                <form id="onboarding-form" onSubmit={handleStartDraft} className="space-y-8">
                  
                  {/* Two-Column Bento Grid for Eligibility Form inputs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Bento Card 1: Tipe Usaha */}
                    <div className="bento-card p-6 flex flex-col gap-5 justify-between">
                      <div>
                        <div className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-primary text-lg">
                              corporate_fare
                            </span>
                          </div>
                          Tipe Usaha Anda
                        </div>
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
                            <div className="px-3 py-4 rounded-xl border-2 border-outline-variant/60 peer-checked:border-primary peer-checked:bg-primary-fixed peer-checked:text-on-primary-container hover:bg-surface-container-low transition-all text-center font-bold text-xs min-h-[56px] flex flex-col items-center justify-center gap-1.5">
                              <span className="material-symbols-outlined text-lg">person</span>
                              Perorangan
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
                            <div className="px-3 py-4 rounded-xl border-2 border-outline-variant/60 peer-checked:border-primary peer-checked:bg-primary-fixed peer-checked:text-on-primary-container hover:bg-surface-container-low transition-all text-center font-bold text-xs min-h-[56px] flex flex-col items-center justify-center gap-1.5">
                              <span className="material-symbols-outlined text-lg">domain</span>
                              Badan Usaha
                            </div>
                          </label>
                        </div>
                      </div>

                      {tipeUsaha === "badan_usaha" && (
                        <div className="mt-4 p-3.5 bg-secondary-container border border-secondary/30 rounded-xl flex items-start gap-2.5 animate-slideDown">
                          <span className="material-symbols-outlined text-secondary text-lg shrink-0 mt-0.5">
                            info
                          </span>
                          <p className="text-[11px] text-on-secondary-container leading-relaxed">
                            <strong>Perhatian:</strong> Saat ini NIB Assistant baru mendukung pendaftaran untuk{" "}
                            <strong>Usaha Perorangan</strong>. Dukungan Badan Usaha akan segera hadir.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Bento Card 2: Status Akun OSS */}
                    <div className="bento-card p-6 flex flex-col justify-between">
                      <div>
                        <div className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-primary text-lg">
                              account_circle
                            </span>
                          </div>
                          Sudah punya akun OSS?
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "Sudah", val: "sudah", icon: "check_circle" },
                            { label: "Belum", val: "belum", icon: "add_circle" },
                            { label: "Ragu", val: "belum_yakin", icon: "help" },
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
                              <div className="px-1 py-4 rounded-xl border-2 border-outline-variant/60 peer-checked:border-primary peer-checked:bg-primary-fixed peer-checked:text-on-primary-container hover:bg-surface-container-low transition-all text-center font-bold text-[11px] min-h-[56px] flex flex-col items-center justify-center gap-1.5 disabled:opacity-50">
                                <span className="material-symbols-outlined text-base">{item.icon}</span>
                                {item.label}
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 pt-1 text-[11px] text-on-surface-variant font-medium">
                        Akun OSS digunakan untuk menerbitkan nomor izin resmi. Jika belum punya, kami bantu buatkan.
                      </div>
                    </div>

                  </div>

                  {/* Desktop Bottom Action inside Centered Container */}
                  <div className="hidden md:flex justify-end pt-6 border-t border-border-light">
                    <button
                      type="submit"
                      disabled={tipeUsaha === "badan_usaha"}
                      className="px-8 py-3.5 rounded-full bg-primary text-on-primary font-bold text-sm min-h-[48px] flex items-center gap-2 shadow-md hover:opacity-90 hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                    >
                      Mulai Buat Draft NIB
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </button>
                  </div>

                </form>
              </div>
            ) : (
              // Requirements Tab Bento View
              <div className="animate-fadeIn flex flex-col gap-6">
                
                <div className="mb-2">
                  <h2 className="text-xl font-extrabold text-on-surface mb-2 leading-tight">
                    Siapkan Data Berikut
                  </h2>
                  <p className="text-on-surface-variant text-sm leading-relaxed font-medium">
                    Agar proses berjalan lancar, pastikan Anda memiliki data-data ini sebelum memulai registrasi.
                  </p>
                </div>

                {/* 3-Card Bento Grid layout for Requirements */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  
                  {/* Card 1: Data Pribadi (col-span-6) */}
                  <div className="md:col-span-6 bento-card p-6 flex flex-col gap-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-full pointer-events-none" />
                    
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-xl">person</span>
                      </div>
                      <div>
                        <h3 className="font-extrabold text-base text-on-surface">Data Pribadi</h3>
                        <p className="text-[10px] text-on-surface-variant font-bold">Sesuai NIK KTP Indonesia</p>
                      </div>
                    </div>

                    <ul className="space-y-3.5 mt-2 flex-grow">
                      {[
                        "Nomor Induk Kependudukan (NIK KTP)",
                        "Tanggal Lahir (Valid sesuai KTP)",
                        "Nomor WhatsApp aktif untuk kode OTP",
                        "Alamat Email aktif & dapat diakses",
                      ].map((text, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="material-symbols-outlined text-primary text-base shrink-0 mt-0.5">
                            check_circle
                          </span>
                          <span className="text-xs text-on-surface-variant leading-relaxed font-semibold">
                            {text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Card 2: Data Usaha (col-span-6) */}
                  <div className="md:col-span-6 bento-card p-6 flex flex-col gap-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-tertiary/10 to-transparent rounded-bl-full pointer-events-none" />
                    
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-tertiary/10 text-tertiary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-xl">storefront</span>
                      </div>
                      <div>
                        <h3 className="font-extrabold text-base text-on-surface">Data Usaha</h3>
                        <p className="text-[10px] text-on-surface-variant font-bold">Informasi operasional & lokasi</p>
                      </div>
                    </div>

                    <ul className="space-y-3.5 mt-2 flex-grow">
                      {[
                        "Nama Usaha, warung, atau toko Anda",
                        "Alamat fisik tempat kegiatan usaha",
                        "Provinsi, Kota/Kabupaten, Kecamatan",
                        "Cerita deskriptif aktivitas usaha Anda",
                      ].map((text, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="material-symbols-outlined text-tertiary text-base shrink-0 mt-0.5">
                            check_circle
                          </span>
                          <span className="text-xs text-on-surface-variant leading-relaxed font-semibold">
                            {text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Card 3: Parameter Tambahan (col-span-12 full-width) */}
                  <div className="md:col-span-12 bento-card p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-secondary/10 to-transparent rounded-bl-full pointer-events-none" />
                    
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-xl">monitoring</span>
                      </div>
                      <div>
                        <h3 className="font-extrabold text-base text-on-surface">Parameter Tambahan & Skala</h3>
                        <p className="text-[10px] text-on-surface-variant font-bold">Untuk mengkalkulasi tingkat risiko usaha secara otomatis</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        { title: "Estimasi Modal Usaha", desc: "Besaran modal bersih (tidak termasuk nilai tanah dan bangunan usaha) untuk operasional." },
                        { title: "Tenaga Kerja Usaha", desc: "Jumlah karyawan laki-laki dan perempuan yang membantu operasional sehari-hari." },
                      ].map((item, idx) => (
                        <div key={idx} className="bg-surface-container-low rounded-xl p-3.5 border border-border-light">
                          <div className="flex gap-2 items-center mb-1.5">
                            <span className="material-symbols-outlined text-secondary text-base shrink-0">check_circle</span>
                            <h4 className="text-xs font-bold text-on-surface">{item.title}</h4>
                          </div>
                          <p className="text-[11px] text-on-surface-variant leading-relaxed font-semibold">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Desktop: Inline Pill back-navigation */}
                <div className="hidden md:flex justify-end pt-6 border-t border-border-light">
                  <button
                    onClick={() => setActiveTab("eligibility")}
                    className="px-8 py-3.5 rounded-full bg-primary text-on-primary font-bold text-sm min-h-[48px] flex items-center gap-2 shadow-md hover:opacity-90 hover:shadow-lg transition-all cursor-pointer"
                  >
                    Saya Siap, Mulai Sekarang
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                </div>

              </div>
            )}
          </div>

        </div>
      </main>

      {/* ── Mobile Sticky bottom bar CTAs at Root Level ── */}
      {activeTab === "eligibility" && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass-bar border-t border-border-light px-5 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] z-40">
          <button
            type="submit"
            form="onboarding-form"
            disabled={tipeUsaha === "badan_usaha"}
            className="w-full bg-primary text-on-primary font-bold py-3.5 px-6 rounded-full flex items-center justify-center gap-2.5 shadow-md min-h-[52px] disabled:opacity-50"
          >
            Mulai Buat Draft NIB
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      )}

      {activeTab === "requirements" && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass-bar border-t border-border-light px-5 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] z-40">
          <button
            onClick={() => setActiveTab("eligibility")}
            className="w-full bg-primary text-on-primary font-bold py-3.5 px-6 rounded-full flex items-center justify-center gap-2.5 shadow-md min-h-[52px]"
          >
            Saya Siap, Mulai Sekarang
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      )}

    </div>
  );
}
