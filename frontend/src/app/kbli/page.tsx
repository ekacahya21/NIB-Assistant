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

// Extended content mapping for official KBLI 2020 interactive UX
interface KBLIUIDetails {
  summary: string;
  suitable: string[];
  unsuitable: string[];
}

const KBLI_DETAILS_MAP: Record<string, KBLIUIDetails> = {
  "56103": {
    summary: "Usaha warung makan, kedai makanan menetap atau restoran kecil siap saji.",
    suitable: ["Warung makan / warteg", "Kedai bakso & mie ayam", "Outlet ayam geprek", "Rumah makan Padang kecil"],
    unsuitable: ["Katering borongan pesta besar", "Jasa jualan keliling gerobak", "Pabrik pengolahan makanan beku"]
  },
  "56210": {
    summary: "Penyediaan makanan dan catering berdasarkan kontrak/pesanan untuk acara.",
    suitable: ["Katering syukuran & pernikahan", "Nasi kotak kantoran", "Pesanan kue basah & snack box"],
    unsuitable: ["Warung makan menetap di ruko", "Pedagang asongan keliling", "Restoran cepat saji fisik"]
  },
  "56104": {
    summary: "Penyediaan makanan keliling memakai gerobak, pikulan, atau mobil food truck.",
    suitable: ["Gerobak bakso keliling warga", "Food truck minuman keliling", "Pedagang kaki lima bongkar pasang"],
    unsuitable: ["Restoran fisik permanen", "Katering pabrik industri besar"]
  },
  "47711": {
    summary: "Perdagangan eceran baju, hijab, pakaian jadi, dan aksesori sandang fisik/online.",
    suitable: ["Butik baju & toko busana", "Jualan hijab & gamis online", "Reseller pakaian anak jadi", "Toko daster"],
    unsuitable: ["Jasa jahit pakaian kustom", "Pabrik konveksi & tenun kain", "Grosir kontainer pakaian mentah"]
  },
  "47911": {
    summary: "Perdagangan eceran aneka jenis barang khusus via toko online/marketplace/medsos.",
    suitable: ["Online shop Instagram/TikTok", "Reseller e-commerce", "Dropshipper aksesoris & perabotan"],
    unsuitable: ["Toko kelontong fisik di pasar", "Pedagang grosir offline pergudangan"]
  },
  "96200": {
    summary: "Jasa pencucian, setrika, laundry pakaian jadi, selimut, karpet, helm, sepatu.",
    suitable: ["Laundry kiloan & satuan", "Jasa cuci sepatu & tas", "Dry cleaning jas", "Jasa setrika rumahan"],
    unsuitable: ["Laundry industri skala pabrik", "Jasa bersih-bersih rumah panggilan"]
  },
  "96999": {
    summary: "Aktivitas jasa perorangan lainnya yang belum tercakup di tempat lain.",
    suitable: ["Jasa potong rambut rumahan", "Jasa setrika keliling", "Jasa asisten rumah tangga harian"],
    unsuitable: ["Klinik kecantikan medis", "Pabrik kosmetik & salon besar"]
  }
};

export default function KbliPage() {
  const router = useRouter();
  const [recommendations, setRecommendations] = useState<KBLIRecommendation[]>([]);
  const [selectedKbli, setSelectedKbli] = useState<string>("");
  const [ceritaUsaha, setCeritaUsaha] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // Tracks which card is currently expanded
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

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
          // Expand the first recommendation by default
          setExpandedCard(data[0].code);
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
    const selected = recommendations.find((r) => r.code === selectedKbli);
    if (selected) {
      sessionStorage.setItem("selected_kbli", JSON.stringify(selected));
    }
    router.push("/review");
  };

  // Helper to extract UI details with fallback
  const getKBLIDetails = (code: string, fallbackDesc: string, fallbackSuitable: string[]): KBLIUIDetails => {
    if (KBLI_DETAILS_MAP[code]) {
      return KBLI_DETAILS_MAP[code];
    }
    return {
      summary: fallbackDesc,
      suitable: fallbackSuitable.length > 0 ? fallbackSuitable : ["Aktivitas perdagangan eceran", "Jasa perorangan mikro"],
      unsuitable: ["Usaha skala industri menengah/besar", "Ekspor-impor skala besar (Kargo kontainer)"]
    };
  };

  return (
    <div className="flex-grow flex flex-col bg-background min-h-screen font-sans">
      
      {/* ── Top AppBar ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 md:px-8 h-16 w-full bg-white border-b border-border-light">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/wizard")} className="p-2 hover:bg-surface-container transition-all rounded text-on-surface-variant flex items-center justify-center" aria-label="Kembali">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <div className="flex flex-col">
            <span className="text-sm font-extrabold text-primary-container leading-none uppercase">NIB Assistant</span>
            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mt-0.5">Pemilihan KBLI</span>
          </div>
        </div>
        <button onClick={() => router.push("/")} className="p-2 hover:bg-surface-container transition-all rounded text-on-surface-variant flex items-center justify-center" aria-label="Bantuan">
          <span className="material-symbols-outlined text-lg">help</span>
        </button>
      </header>

      {/* ── Main Container (max 640px) ── */}
      <main className="flex-grow flex justify-center w-full px-4 py-8 pb-32 md:pb-12">
        <div className="w-full max-w-[640px] flex flex-col gap-6">
          
          {/* Page Info */}
          <div>
            <h1 className="text-lg font-extrabold uppercase tracking-wide text-on-surface">
              Rekomendasi Kode KBLI Usaha
            </h1>
            <p className="text-xs text-on-surface-variant leading-relaxed mt-1">
              Portal OSS membutuhkan klasifikasi kode KBLI 2020 5-digit. Pilih kode yang paling sesuai dengan aktivitas utama usaha Anda.
            </p>
          </div>

          {/* ── Segmented Category Selector (Joined Segments) ── */}
          <div className="flex rounded-md overflow-hidden border border-border-light w-fit">
            <span className="bg-secondary text-white font-extrabold text-[10px] px-3.5 py-2 uppercase tracking-wider">
              KBLI 2020
            </span>
            <span className="bg-tertiary text-white font-extrabold text-[10px] px-3.5 py-2 uppercase tracking-wider border-l border-border-light">
              Tingkat Risiko Rendah
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6">
            
            {/* AI Analyzer Story Box */}
            <div className="bento-card space-y-4">
              <div className="flex gap-2.5 items-center border-b border-border-light pb-3">
                <div className="w-8 h-8 rounded bg-primary-container/10 flex items-center justify-center shrink-0">
                  <span className={`material-symbols-outlined text-primary-container text-lg ${loading ? 'animate-spin' : ''}`}>
                    {loading ? 'sync' : 'psychology'}
                  </span>
                </div>
                <div>
                  <h3 className="font-extrabold text-xs uppercase tracking-wide text-on-surface">Analisis Cerita Usaha</h3>
                  <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider">Metode Pemetaan AI</p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase" htmlFor="ceritaUsahaField">
                  Deskripsi Aktivitas Usaha Anda
                </label>
                <textarea
                  id="ceritaUsahaField"
                  value={ceritaUsaha}
                  onChange={(e) => setCeritaUsaha(e.target.value)}
                  placeholder="Ceritakan aktivitas usaha Anda agar AI Agent bisa mencari kode KBLI paling tepat..."
                  className="w-full p-3 text-xs text-on-surface bg-white border border-border-light rounded outline-none focus:border-primary-container resize-none h-24 leading-relaxed font-semibold transition-all"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={loading || !ceritaUsaha.trim()}
                  onClick={() => fetchRecommendations(ceritaUsaha)}
                  className="bg-primary-container hover:bg-primary text-white text-[10px] font-bold uppercase tracking-wider py-2.5 px-4 rounded flex items-center gap-1.5 transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-xs">auto_awesome</span>
                  {loading ? "Menganalisis..." : "Cari Ulang Rekomendasi"}
                </button>
              </div>
            </div>

            {/* Recommendations List Container */}
            <div className="space-y-4">
              
              <div className="flex justify-between items-center border-b border-border-light pb-2 px-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-primary-container text-sm">list_alt</span>
                  Hasil Rekomendasi Kode
                </span>
                {!loading && recommendations.length > 0 && (
                  <span className="text-[9px] text-outline font-bold bg-[#F3F4F6] border border-border-light px-2 py-0.5 rounded uppercase">
                    {recommendations.length} Rekomendasi
                  </span>
                )}
              </div>

              {/* Shimmer loading */}
              {loading ? (
                <div className="space-y-4 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bento-card space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-8 rounded bg-surface-container" />
                          <div className="w-24 h-4 rounded bg-surface-container" />
                        </div>
                        <div className="w-16 h-4 rounded bg-surface-container" />
                      </div>
                      <div className="w-full h-4 rounded bg-surface-container" />
                      <div className="w-2/3 h-4 rounded bg-surface-container" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {recommendations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 bg-white border border-border-light rounded-lg text-center">
                      <span className="material-symbols-outlined text-outline text-4xl mb-2">search</span>
                      <h3 className="font-extrabold text-on-surface text-xs uppercase tracking-wide">Belum Ada Rekomendasi</h3>
                      <p className="text-[11px] text-on-surface-variant max-w-xs leading-normal mt-1">
                        Silakan lengkapi cerita usaha Anda di kotak atas lalu ketuk tombol cari ulang.
                      </p>
                    </div>
                  ) : (
                    recommendations.map((kbli) => {
                      const isSelected = selectedKbli === kbli.code;
                      const isExpanded = expandedCard === kbli.code;
                      const details = getKBLIDetails(kbli.code, kbli.description, kbli.suitableFor);

                      return (
                        <div 
                          key={kbli.code} 
                          className={`bg-white border rounded-lg transition-all ${
                            isSelected ? "border-primary-container" : "border-border-light"
                          }`}
                        >
                          
                          {/* Card Header (Collapsible trigger) */}
                          <div 
                            onClick={() => setExpandedCard(isExpanded ? null : kbli.code)}
                            className="p-4 flex items-center justify-between gap-3 cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Index Badge (Left) */}
                              <div className="w-12 h-9 rounded bg-index-bg text-primary font-mono font-bold text-xs flex items-center justify-center shrink-0">
                                {kbli.code}
                              </div>

                              {/* Title & Confidence */}
                              <div className="min-w-0">
                                <h3 className="font-bold text-xs md:text-sm text-on-surface truncate pr-2">
                                  {kbli.title}
                                </h3>
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-wider mt-1 ${
                                  kbli.confidence === "sangat_cocok"
                                    ? "text-success"
                                    : "text-warning"
                                }`}>
                                  <span className="material-symbols-outlined text-[10px] fill-current">
                                    {kbli.confidence === "sangat_cocok" ? "verified" : "info"}
                                  </span>
                                  {kbli.confidence === "sangat_cocok" ? "Sangat Cocok" : "Alternatif"}
                                </span>
                              </div>
                            </div>

                            {/* Chevron Toggle */}
                            <span className="material-symbols-outlined text-outline text-lg transition-transform duration-200" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                              expand_more
                            </span>
                          </div>

                          {/* Card Body (Collapsible Section) */}
                          {isExpanded && (
                            <div className="px-4 pb-4 border-t border-border-light pt-4 space-y-4 animate-slideDown">
                              
                              {/* Ringkasan Awam */}
                              <div className="space-y-1">
                                <span className="text-[9px] font-extrabold uppercase tracking-wider text-outline">
                                  Ringkasan Awam
                                </span>
                                <p className="text-xs font-semibold text-on-surface leading-relaxed">
                                  {details.summary}
                                </p>
                              </div>

                              {/* Cocok Untuk */}
                              <div className="space-y-1.5">
                                <span className="text-[9px] font-extrabold uppercase tracking-wider text-outline block">
                                  Cocok Untuk Jenis Usaha:
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {details.suitable.map((tag) => (
                                    <span 
                                      key={tag}
                                      className="bg-success/5 text-success border border-success/20 font-bold text-[10px] px-2 py-0.5 rounded flex items-center gap-0.5"
                                    >
                                      <span className="material-symbols-outlined text-[10px]">check</span>
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* Tidak Cocok Untuk */}
                              <div className="space-y-1.5">
                                <span className="text-[9px] font-extrabold uppercase tracking-wider text-outline block">
                                  Tidak Cocok Untuk:
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {details.unsuitable.map((tag) => (
                                    <span 
                                      key={tag}
                                      className="bg-error/5 text-error border border-error/20 font-bold text-[10px] px-2 py-0.5 rounded flex items-center gap-0.5"
                                    >
                                      <span className="material-symbols-outlined text-[10px]">close</span>
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* Select Button inside Card */}
                              <div className="pt-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedKbli(kbli.code);
                                  }}
                                  className={`w-full py-2.5 rounded text-xs font-bold uppercase tracking-wider border flex items-center justify-center gap-2 transition-all ${
                                    isSelected
                                      ? "bg-primary-container text-white border-primary-container"
                                      : "border-primary-container text-primary-container hover:bg-primary-container/5"
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    {isSelected ? "check_circle" : "check"}
                                  </span>
                                  {isSelected ? "KBLI Ini Terpilih" : "Pilih KBLI Ini"}
                                </button>
                              </div>

                            </div>
                          )}

                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Desktop Footer Actions */}
          <div className="hidden md:flex justify-between items-center border-t border-border-light pt-6 mt-4">
            <span className="text-xs font-bold text-on-surface font-mono">
              {selectedKbli ? `KBLI TERPILIH: ${selectedKbli}` : "BELUM ADA KODE TERPILIH"}
            </span>
            <button 
              onClick={handleNext} 
              disabled={loading || !selectedKbli}
              className="px-6 py-2.5 rounded bg-primary-container text-white font-bold text-xs uppercase tracking-wider min-h-[40px] flex items-center justify-center gap-2 shadow-sm hover:bg-primary transition-all disabled:opacity-50"
            >
              Lanjutkan Ke Review
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

        </div>
      </main>

      {/* Mobile Sticky Footer */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 glass-bar border-t border-border-light px-5 py-4 shadow-sm z-40">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase">KBLI Terpilih</span>
            <span className="text-xs font-extrabold text-on-surface truncate">{selectedKbli ? `KODE: ${selectedKbli}` : "Belum dipilih"}</span>
          </div>
          <button 
            onClick={handleNext} 
            disabled={loading || !selectedKbli}
            className="bg-primary-container text-white font-bold rounded py-3 px-5 min-h-[44px] flex items-center gap-1.5 shadow-sm text-xs uppercase tracking-wider disabled:opacity-50 shrink-0"
          >
            Lanjut
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      </div>

    </div>
  );
}
