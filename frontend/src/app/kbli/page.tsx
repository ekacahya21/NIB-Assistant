"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface KBLIRecommendation {
  code: string;
  title: string;
  description: string;
  confidence: "sangat_cocok" | "alternatif";
  suitableFor: string[];
}

export default function KbliPage() {
  const router = useRouter();
  const [recommendations, setRecommendations] = useState<KBLIRecommendation[]>([]);
  const [selectedKbli, setSelectedKbli] = useState<string>("");
  const [ceritaUsaha, setCeritaUsaha] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const fetchRecommendations = async (queryText: string) => {
    const q = (queryText || "").trim();
    if (!q) return;
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/kbli/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setRecommendations(data);
          setSelectedKbli(data[0].code);
        }
      }
    } catch (e) {
      console.error("Error fetching KBLI recommendations:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("draft_form_data");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const desc = parsed.ceritaUsaha || "";
          setCeritaUsaha(desc);
          if (desc.trim()) {
            fetchRecommendations(desc);
          }
        } catch (e) {
          console.error("Failed to parse form data", e);
        }
      }
    }
  }, []);

  const handleNext = () => {
    // Save selected KBLI to storage
    const selected = recommendations.find((r) => r.code === selectedKbli);
    if (selected) {
      sessionStorage.setItem("selected_kbli", JSON.stringify(selected));
    }
    router.push("/review");
  };

  return (
    <div className="flex-1 flex flex-col md:items-center justify-start bg-background min-h-screen">
      <div className="w-full max-w-max-width-form flex-grow flex flex-col relative bg-surface-card pb-32 md:my-8 md:rounded-lg overflow-hidden desktop-container">
        
        {/* Top AppBar */}
        <header className="sticky top-0 z-50 flex items-center justify-between px-4 h-14 w-full bg-background border-b border-border-light shadow-sm">
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/wizard")} className="p-2 hover:opacity-80 transition-opacity text-on-surface-variant" aria-label="Kembali">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <span className="text-xl font-bold text-primary">NIB Assistant</span>
          </div>
          <button onClick={() => router.push("/")} className="p-2 hover:opacity-80 transition-opacity text-on-surface-variant" aria-label="Bantuan">
            <span className="material-symbols-outlined">help</span>
          </button>
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
                          stepNum === 4 ? "bg-primary ring-4 ring-primary-container text-on-primary" : stepNum < 4 ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"
                        }`}>
                          {stepNum < 4 ? <span className="material-symbols-outlined text-sm">check</span> : stepNum}
                        </div>
                        {idx < 4 && <div className={`flex-grow h-1 mx-2 transition-colors ${stepNum < 4 ? "bg-primary" : "bg-surface-container-highest"}`} />}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between w-full text-xs text-outline mt-2 px-1">
                  {["Pemilik", "Usaha", "Lokasi", "KBLI", "Review"].map((label, idx) => (
                    <span key={label} className={idx === 3 ? "font-bold text-primary" : ""}>{label}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-grow">
              <div className="mb-4">
            <p className="text-on-surface-variant text-sm leading-relaxed">
              Pilih kode KBLI yang paling menggambarkan kegiatan utama usaha Anda. Anda dapat mengubah cerita usaha Anda untuk menyesuaikan hasil rekomendasi.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Panel: col-span-5 AI Prompt */}
            <div className="lg:col-span-5 bento-card flex flex-col gap-4">
              <div className="flex gap-2.5 items-center border-b border-border-light pb-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className={`material-symbols-outlined text-primary text-lg ${loading ? 'animate-spin' : ''}`}>{loading ? 'sync' : 'psychology'}</span>
                </div>
                <div>
                  <h3 className="font-bold text-on-surface text-sm">Analisis KBLI AI</h3>
                  <p className="text-[10px] text-on-surface-variant font-medium">Berdasarkan cerita aktivitas usaha Anda</p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-on-surface-variant" htmlFor="ceritaUsahaField">
                  Deskripsi Aktivitas Usaha
                </label>
                <textarea
                  id="ceritaUsahaField"
                  value={ceritaUsaha}
                  onChange={(e) => setCeritaUsaha(e.target.value)}
                  placeholder="Ceritakan aktivitas usaha Anda agar AI Agent bisa mencari kode KBLI paling tepat..."
                  className="w-full mt-1 p-3 text-sm text-on-surface bg-surface-card border border-border-light rounded-xl outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none h-32 leading-relaxed font-medium transition-all"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={loading || !ceritaUsaha.trim()}
                  onClick={() => fetchRecommendations(ceritaUsaha)}
                  className="bg-primary hover:shadow-lg hover:shadow-primary/20 text-on-primary text-xs font-bold py-3 px-5 rounded-xl flex items-center gap-2 transition-all disabled:opacity-50 active:scale-[0.98] shadow-md cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">auto_awesome</span>
                  {loading ? "Menganalisis..." : "Analisis dengan AI"}
                </button>
              </div>
            </div>

            {/* Right Panel: col-span-7 KBLI Recommendations List */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              
              {/* Recommendations Title */}
              <div className="flex justify-between items-center border-b border-border-light pb-2 mb-1 px-1">
                <span className="text-xs font-bold text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-primary text-base">list_alt</span>
                  Rekomendasi Hasil Analisis
                </span>
                {!loading && recommendations.length > 0 && (
                  <span className="text-[10px] text-outline font-semibold">
                    {recommendations.length} Rekomendasi Ditemukan
                  </span>
                )}
              </div>

              {/* Recommendations Render / Shimmer Skeleton */}
              {loading ? (
                <div className="flex flex-col gap-4 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-2xl border border-border-light/60 bg-surface-card p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-surface-container-highest" />
                          <div className="w-16 h-6 rounded-lg bg-surface-container-highest" />
                        </div>
                        <div className="w-24 h-5 rounded-full bg-surface-container-highest" />
                      </div>
                      <div className="w-2/3 h-5 rounded bg-surface-container-highest" />
                      <div className="w-full h-12 rounded bg-surface-container-highest/60" />
                      <div className="w-full h-14 rounded-xl bg-surface-container-highest/40" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {recommendations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 bg-surface-container-low border border-border-light rounded-2xl text-center shadow-inner">
                      <span className="material-symbols-outlined text-outline text-5xl mb-3">search</span>
                      <h3 className="font-bold text-on-surface text-base mb-1">Belum Ada Rekomendasi KBLI</h3>
                      <p className="text-xs text-on-surface-variant max-w-xs leading-normal">
                        Silakan tulis deskripsi aktivitas usaha Anda di panel kiri dan klik tombol analisis untuk mencari kode KBLI resmi Anda secara otomatis.
                      </p>
                    </div>
                  ) : (
                    recommendations.map((kbli) => {
                      const isSelected = selectedKbli === kbli.code;
                      return (
                        <label key={kbli.code} className="block relative cursor-pointer group">
                          <input
                            type="radio"
                            name="kbli_selection"
                            value={kbli.code}
                            checked={isSelected}
                            onChange={() => setSelectedKbli(kbli.code)}
                            className="peer sr-only"
                          />
                          <div className={`rounded-2xl border-2 p-5 transition-all duration-300 relative overflow-hidden ${
                            isSelected
                              ? "border-primary bg-surface-card shadow-lg shadow-primary/10"
                              : "border-border-light/60 bg-surface-card hover:border-outline-variant shadow-sm card-hover"
                          }`}>
                            
                            {/* Selected Highlight Overlay */}
                            {isSelected && (
                              <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
                            )}

                            <div className="relative z-10">
                              {/* Header elements of Card */}
                              <div className="flex justify-between items-center gap-2 mb-3">
                                <div className="flex items-center gap-2.5">
                                  {/* Checkbox Visual Circle */}
                                  <div className={`w-5.5 h-5.5 rounded-full border-2 flex items-center justify-center transition-all ${
                                    isSelected
                                      ? "border-primary bg-primary text-on-primary"
                                      : "border-outline group-hover:border-primary"
                                  }`}>
                                    {isSelected && (
                                      <span className="material-symbols-outlined text-xs font-bold">check</span>
                                    )}
                                  </div>
                                  
                                  <span className="font-bold text-sm text-primary bg-primary-fixed/30 px-2.5 py-1 rounded-lg border border-primary-fixed-dim/40 font-mono">
                                    {kbli.code}
                                  </span>
                                </div>

                                {/* Confidence Badge */}
                                <span className={`font-semibold text-[10px] px-2.5 py-1 rounded-full inline-flex items-center gap-1 border shrink-0 ${
                                  kbli.confidence === "sangat_cocok"
                                    ? "bg-primary-container text-on-primary-container border-primary-fixed-dim"
                                    : "bg-surface-container text-on-surface-variant border-border-light"
                                }`}>
                                  <span className="material-symbols-outlined text-xs">
                                    {kbli.confidence === "sangat_cocok" ? "verified" : "info"}
                                  </span>
                                  {kbli.confidence === "sangat_cocok" ? "Sangat Cocok" : "Alternatif"}
                                </span>
                              </div>

                              {/* Title & Body */}
                              <h3 className="font-bold text-base text-on-surface mb-1.5">
                                {kbli.title}
                              </h3>
                              <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
                                {kbli.description}
                              </p>

                              {/* Suitable tags list */}
                              <div className="bg-surface-container-low rounded-xl p-3.5 border border-border-light">
                                <p className="text-[10px] font-bold text-outline uppercase tracking-wider mb-2">
                                  Sangat Cocok Untuk:
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {kbli.suitableFor.map((tag) => (
                                    <span
                                      key={tag}
                                      className="bg-surface-card text-on-surface-variant font-semibold text-[10px] px-2.5 py-1 rounded-lg border border-border-light/80 inline-flex items-center gap-1"
                                    >
                                      <span className="material-symbols-outlined text-[10px] text-primary">label</span>
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>

                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
            </div>
          </div>
        </main>

        {/* Sticky Bottom Summary/CTA */}
        {/* Desktop: Inline Pill CTA inside the 800px max-width wrapper */}
        <div className="hidden md:flex justify-end items-center gap-4 px-10 pb-8 border-t border-border-light pt-6 mt-4 max-w-[800px] mx-auto w-full">
          <span className="text-sm font-semibold text-on-surface mr-auto">
            {selectedKbli ? `KBLI ${selectedKbli} Terpilih` : "Belum Ada KBLI Terpilih"}
          </span>
          <button onClick={handleNext} disabled={loading || !selectedKbli}
            className="px-8 py-3 rounded-full bg-primary text-on-primary font-semibold text-sm min-h-[48px] flex items-center gap-2 shadow-md hover:opacity-90 transition-all disabled:opacity-50">
            Lanjut <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>
        {/* Mobile: Sticky Bottom CTA */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass-bar border-t border-border-light px-5 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] z-40">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-on-surface truncate">{selectedKbli ? `KBLI ${selectedKbli} Terpilih` : "Belum Ada KBLI Terpilih"}</span>
              <span className="text-[11px] text-on-surface-variant">Klik lanjut untuk meninjau data</span>
            </div>
            <button onClick={handleNext} disabled={loading || !selectedKbli}
              className="bg-primary text-on-primary font-bold rounded-full py-3.5 px-6 min-h-[52px] flex items-center gap-2 shadow-md text-sm disabled:opacity-50 shrink-0">
              Lanjut <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

