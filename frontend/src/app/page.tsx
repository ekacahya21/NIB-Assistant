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
    <div className="flex-1 flex flex-col md:items-center justify-start bg-background min-h-screen">
      <div className="w-full max-w-max-width-form flex-grow flex flex-col relative bg-background pb-32 md:shadow-lg md:my-6 md:rounded-2xl md:border md:border-border-light overflow-hidden">
        {/* Header App Bar */}
        <header className="sticky top-0 z-50 flex items-center justify-between px-4 h-16 w-full bg-background border-b border-border-light">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-3xl font-bold select-none">
              shield_person
            </span>
            <h1 className="font-sans text-xl font-bold text-primary tracking-tight">
              NIB Assistant
            </h1>
          </div>
        </header>

        {/* Tab Selector Segment */}
        <div className="px-4 pt-6">
          <div className="flex bg-surface-container rounded-full p-1 border border-border-light">
            <button
              onClick={() => setActiveTab("eligibility")}
              className={`flex-1 py-3 px-4 rounded-full font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                activeTab === "eligibility"
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-lg">
                check_circle
              </span>
              Cek Kelayakan
            </button>
            <button
              onClick={() => setActiveTab("requirements")}
              className={`flex-1 py-3 px-4 rounded-full font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                activeTab === "requirements"
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-lg">
                assignment
              </span>
              Syarat Dokumen
            </button>
          </div>
        </div>

        {/* Dynamic View container */}
        <main className="px-4 py-6 flex-grow">
          {activeTab === "eligibility" ? (
            <div className="animate-fadeIn">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-primary mb-2 leading-tight">
                  Buat draft NIB tanpa bingung pilih KBLI
                </h2>
                <p className="text-on-surface-variant text-sm md:text-base leading-relaxed">
                  Jawab beberapa pertanyaan tentang usaha kamu. Kami bantu cari
                  kandidat KBLI dan siapkan data sebelum diteruskan ke OSS.
                </p>
              </div>

              <form onSubmit={handleStartDraft} className="space-y-6">
                {/* Form Group 1: Tipe Usaha */}
                <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm transition-all hover:shadow-md">
                  <fieldset>
                    <legend className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-lg">
                        corporate_fare
                      </span>
                      Tipe usaha
                    </legend>
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
                        <div className="px-4 py-4 rounded-xl border border-outline-variant peer-checked:border-primary peer-checked:bg-primary-container peer-checked:text-on-primary-container hover:bg-surface-container-low transition-all text-center font-semibold text-sm min-h-[52px] flex items-center justify-center">
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
                        <div className="px-4 py-4 rounded-xl border border-outline-variant peer-checked:border-primary peer-checked:bg-primary-container peer-checked:text-on-primary-container hover:bg-surface-container-low transition-all text-center font-semibold text-sm min-h-[52px] flex items-center justify-center">
                          Badan Usaha
                        </div>
                      </label>
                    </div>
                  </fieldset>

                  {tipeUsaha === "badan_usaha" && (
                    <div className="mt-3 p-3 bg-secondary-container/20 border border-secondary rounded-xl flex items-start gap-2.5 animate-slideDown">
                      <span className="material-symbols-outlined text-secondary text-xl shrink-0 mt-0.5">
                        warning
                      </span>
                      <p className="text-xs text-on-secondary-container leading-relaxed">
                        <strong>Catatan:</strong> Saat ini otomatisasi NIB
                        Assistant belum mendukung untuk{" "}
                        <strong>Badan Usaha</strong>.
                      </p>
                    </div>
                  )}
                </div>

                {/* Form Group 2: Akun OSS */}
                {tipeUsaha !== "badan_usaha" && (
                  <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm transition-all hover:shadow-md">
                    <fieldset>
                      <legend className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">
                          account_circle
                        </span>
                        Sudah punya akun OSS?
                      </legend>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "Sudah", val: "sudah" },
                          { label: "Belum", val: "belum" },
                          { label: "Ragu", val: "belum_yakin" },
                        ].map((item) => (
                          <label key={item.val} className="cursor-pointer">
                            <input
                              type="radio"
                              name="akun_oss"
                              value={item.val}
                              checked={akunOss === item.val}
                              onChange={(e) => setAkunOss(e.target.value)}
                              className="peer sr-only"
                            />
                            <div className="px-2 py-4 rounded-xl border border-outline-variant peer-checked:border-primary peer-checked:bg-primary-container peer-checked:text-on-primary-container hover:bg-surface-container-low transition-all text-center font-semibold text-xs md:text-sm min-h-[52px] flex items-center justify-center">
                              {item.label}
                            </div>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                )}

                <div className="fixed bottom-0 left-0 right-0 md:absolute md:-bottom-2 bg-surface-card border-t border-border-light px-4 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-40 md:rounded-b-2xl">
                  <button
                    type="submit"
                    disabled={tipeUsaha === "badan_usaha"}
                    className="w-full bg-primary text-on-primary font-bold py-4 px-6 rounded-full flex items-center justify-center gap-2 hover:bg-primary-container transition-all active:scale-[0.98] min-h-[54px] shadow-md cursor-pointer disabled:bg-outline-variant disabled:text-outline disabled:cursor-not-allowed disabled:pointer-events-none disabled:shadow-none"
                  >
                    Mulai buat draft NIB
                    <span className="material-symbols-outlined text-lg">
                      arrow_forward
                    </span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            // Requirements Tab View
            <div className="animate-fadeIn flex flex-col gap-6">
              <div className="mb-2">
                <h2 className="text-2xl font-bold text-primary mb-2 leading-tight">
                  Data yang Dibutuhkan
                </h2>
                <p className="text-on-surface-variant text-sm leading-relaxed">
                  Siapkan data berikut agar proses pembuatan draft NIB berjalan
                  lancar.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                {/* 1. Data Pribadi */}
                <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm relative overflow-hidden transition-all hover:shadow-md">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary-fixed opacity-15 rounded-bl-full -z-10"></div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
                      <span
                        className="material-symbols-outlined text-lg"
                        data-fill="true"
                      >
                        person
                      </span>
                    </div>
                    <h3 className="font-bold text-base text-on-surface">
                      1. Data Pribadi
                    </h3>
                  </div>
                  <ul className="space-y-2.5 pl-2">
                    {[
                      "KTP (Nomor Induk Kependudukan / NIK)",
                      "Tanggal Lahir (sesuai KTP)",
                      "Nomor WhatsApp Aktif (untuk terima OTP)",
                      "Alamat Email Aktif",
                    ].map((text, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="material-symbols-outlined text-primary text-lg mt-0.5 shrink-0">
                          check_circle
                        </span>
                        <span className="text-sm text-on-surface-variant leading-relaxed">
                          {text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 2. Data Usaha */}
                <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm relative overflow-hidden transition-all hover:shadow-md">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-tertiary-fixed opacity-15 rounded-bl-full -z-10"></div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center shrink-0">
                      <span
                        className="material-symbols-outlined text-lg"
                        data-fill="true"
                      >
                        storefront
                      </span>
                    </div>
                    <h3 className="font-bold text-base text-on-surface">
                      2. Data Usaha
                    </h3>
                  </div>
                  <ul className="space-y-2.5 pl-2">
                    {[
                      "Nama Usaha / Toko Anda",
                      "Alamat Lengkap Tempat Usaha (sampai RT/RW & Kelurahan)",
                      "Cerita singkat tentang apa yang dijual & kegiatan usahanya",
                    ].map((text, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="material-symbols-outlined text-tertiary text-lg mt-0.5 shrink-0">
                          check_circle
                        </span>
                        <span className="text-sm text-on-surface-variant leading-relaxed">
                          {text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 3. Skala Usaha */}
                <div className="bg-surface-card rounded-2xl p-4 border border-border-light shadow-sm relative overflow-hidden transition-all hover:shadow-md">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-secondary-fixed opacity-20 rounded-bl-full -z-10"></div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
                      <span
                        className="material-symbols-outlined text-lg"
                        data-fill="true"
                      >
                        monitoring
                      </span>
                    </div>
                    <h3 className="font-bold text-base text-on-surface">
                      3. Parameter Tambahan
                    </h3>
                  </div>
                  <ul className="space-y-2.5 pl-2">
                    {[
                      "Perkiraan Modal Usaha (tidak termasuk tanah & bangunan)",
                      "Jumlah tenaga kerja / karyawan (jika ada)",
                    ].map((text, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="material-symbols-outlined text-secondary text-lg mt-0.5 shrink-0">
                          check_circle
                        </span>
                        <span className="text-sm text-on-surface-variant leading-relaxed">
                          {text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Sticky bottom navigation to go back to checker */}
              <div className="fixed bottom-0 left-0 right-0 md:absolute md:-bottom-2 bg-surface-card border-t border-border-light px-4 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-40 md:rounded-b-2xl">
                <button
                  onClick={() => setActiveTab("eligibility")}
                  className="w-full bg-primary-container text-on-primary-container font-bold py-4 px-6 rounded-full flex items-center justify-center gap-2 hover:bg-primary hover:text-on-primary transition-all active:scale-[0.98] min-h-[54px] shadow-sm cursor-pointer"
                >
                  Saya Siap, Mulai Form Kelayakan
                  <span className="material-symbols-outlined text-lg">
                    arrow_forward
                  </span>
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
