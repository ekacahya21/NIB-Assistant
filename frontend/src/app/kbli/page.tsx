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
      const res = await fetch(`http://localhost:3001/kbli/search?q=${encodeURIComponent(q)}`);
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
      <div className="w-full max-w-max-width-form flex-grow flex flex-col relative bg-background pb-32 md:shadow-lg md:my-6 md:rounded-2xl md:border md:border-border-light overflow-hidden">
        
        {/* Top AppBar */}
        <header className="sticky top-0 z-50 flex items-center justify-between px-4 h-16 w-full bg-background border-b border-border-light">
          <button
            onClick={() => router.push("/wizard")}
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
            <div className="w-9 h-9 flex items-center justify-center font-bold text-sm transition-all duration-300 rounded-[12px] bg-primary text-on-primary shadow-md shadow-primary/20 scale-105">
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
              Langkah 4 dari 5:{" "}
              <span className="text-primary font-extrabold normal-case">
                Rekomendasi KBLI
              </span>
            </span>
          </div>
        </div>

        {/* Main Content */}
        <main className="px-4 py-4 flex-grow">
          <div className="mb-6">
            <p className="text-on-surface-variant text-sm leading-normal">
              Pilih satu kode KBLI yang paling menggambarkan kegiatan utama usaha Anda.
            </p>
          </div>

          {/* Interactive AI Search and Business Description card */}
          <div className="mb-6 p-4 bg-surface-container-low border border-border-light rounded-2xl flex flex-col gap-3">
            <div className="flex gap-2.5 items-start">
              <span className="material-symbols-outlined text-primary text-xl mt-0.5">psychology</span>
              <div className="text-xs flex-grow">
                <p className="font-bold text-on-surface mb-0.5">Deskripsi Aktivitas Usaha Anda:</p>
                <textarea
                  value={ceritaUsaha}
                  onChange={(e) => setCeritaUsaha(e.target.value)}
                  placeholder="Ceritakan aktivitas usaha Anda secara detil agar AI Agent bisa mencari kode KBLI paling tepat..."
                  className="w-full mt-1.5 p-2.5 text-xs text-on-surface bg-surface-card border border-border-light rounded-xl outline-none focus:border-primary resize-none h-20 leading-relaxed font-medium transition-all"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={loading || !ceritaUsaha.trim()}
                onClick={() => fetchRecommendations(ceritaUsaha)}
                className="bg-primary hover:bg-primary-container text-on-primary text-xs font-bold py-2.5 px-4.5 rounded-full flex items-center gap-1.5 transition-all disabled:opacity-50 active:scale-[0.98] shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                {loading ? "Menganalisis KBLI..." : "Analisis KBLI dengan AI Agent"}
              </button>
            </div>
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
                <div className="flex flex-col items-center justify-center p-8 bg-surface-container-low border border-border-light rounded-2xl text-center">
                  <span className="material-symbols-outlined text-outline text-5xl mb-3">search</span>
                  <h3 className="font-bold text-on-surface text-base mb-1">Belum Ada Rekomendasi KBLI</h3>
                  <p className="text-xs text-on-surface-variant max-w-xs leading-normal">
                    Silakan tulis deskripsi aktivitas usaha Anda di atas dan klik tombol analisis untuk mencari kode KBLI resmi Anda secara otomatis.
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
                      <div className={`rounded-2xl border p-4 transition-all duration-300 relative overflow-hidden ${
                        isSelected
                          ? "border-2 border-primary bg-surface-card shadow-md"
                          : "border-border-light bg-surface-card hover:border-outline shadow-sm"
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
                          <div className="bg-surface-container-low rounded-xl p-3 border border-border-light">
                            <p className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1.5">
                              Sangat Cocok Untuk:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {kbli.suitableFor.map((tag) => (
                                <span
                                  key={tag}
                                  className="bg-surface-card text-on-surface-variant font-medium text-[10px] px-2.5 py-1 rounded-lg border border-border-light/80"
                                >
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
        </main>

        {/* Sticky Bottom Summary/CTA */}
        <div className="fixed bottom-0 left-0 right-0 md:absolute md:-bottom-2 bg-surface-card border-t border-border-light px-4 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-40 md:rounded-b-2xl">
          <div className="max-w-max-width-form mx-auto flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-on-surface">
                {selectedKbli ? `KBLI ${selectedKbli} Terpilih` : "Belum Ada KBLI Terpilih"}
              </span>
              <span className="text-[10px] text-on-surface-variant">Klik lanjut untuk meninjau data</span>
            </div>
            <button
              onClick={handleNext}
              disabled={loading || !selectedKbli}
              className="bg-primary hover:bg-primary-container text-on-primary font-bold rounded-full py-3.5 px-6 min-h-[48px] flex items-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer shadow-sm text-sm disabled:opacity-50"
            >
              Lanjut
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

