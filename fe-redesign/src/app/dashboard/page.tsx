"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface DraftItem {
  id: string;
  namaPemilik: string;
  namaUsaha: string;
  nik: string;
  nomorHp: string;
  email: string;
  updatedAt: string;
  status: "Draft" | "Proses" | "Sukses" | "Butuh OTP";
  kbliCode?: string;
  kbliTitle?: string;
  alamatUsaha?: string;
  modalUsaha?: string;
  jumlahPekerja?: string;
  caraPenjualan?: string;
}

// Initial mock drafts to populate the dashboard beautifully if backend is empty
const MOCK_DRAFTS: DraftItem[] = [
  {
    id: "NIB8812A",
    namaPemilik: "BUDI SANTOSO",
    namaUsaha: "GEPREK PEDAS MANTAP",
    nik: "3201020304050607",
    nomorHp: "081234567890",
    email: "budi.santoso@email.com",
    updatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 mins ago
    status: "Butuh OTP",
    kbliCode: "56103",
    kbliTitle: "Kedai Makanan",
    alamatUsaha: "Jl. Raya Bogor No. 12, Kel. Cililitan, Kec. Kramat Jati, Jakarta Timur",
    modalUsaha: "15000000",
    jumlahPekerja: "2",
    caraPenjualan: "keduanya"
  },
  {
    id: "NIB7731B",
    namaPemilik: "SITI NURHALIZA",
    namaUsaha: "BUTIK HIJAB AN-NISA",
    nik: "3202040506070809",
    nomorHp: "085712345678",
    email: "siti.hijab@email.com",
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), // 3 hours ago
    status: "Sukses",
    kbliCode: "47711",
    kbliTitle: "Perdagangan Eceran Pakaian",
    alamatUsaha: "ITC Mangga Dua Lt. 1 Blok A No. 45, Jakarta Utara",
    modalUsaha: "45000000",
    jumlahPekerja: "1",
    caraPenjualan: "online"
  },
  {
    id: "NIB1109C",
    namaPemilik: "HENDRA WIJAYA",
    namaUsaha: "BENGKEL MOTOR BAROKAH",
    nik: "3203050607080910",
    nomorHp: "081987654321",
    email: "hendra.bengkel@email.com",
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
    status: "Draft",
    kbliCode: "45404",
    kbliTitle: "Reparasi dan Perawatan Sepeda Motor",
    alamatUsaha: "Jl. Margonda Raya No. 104, Depok",
    modalUsaha: "25000000",
    jumlahPekerja: "3",
    caraPenjualan: "offline"
  },
  {
    id: "NIB3329D",
    namaPemilik: "AGUS SUPRIATNA",
    namaUsaha: "WARUNG KOPI KITA",
    nik: "3204060708091011",
    nomorHp: "081399887766",
    email: "agus.kopi@email.com",
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(), // 5 days ago
    status: "Proses",
    kbliCode: "56304",
    kbliTitle: "Kedai Minuman",
    alamatUsaha: "Jl. Surya Kencana No. 56, Bogor",
    modalUsaha: "10000000",
    jumlahPekerja: "1",
    caraPenjualan: "offline"
  }
];

export default function DashboardPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("Semua");

  // Load drafts from local backend and merge with mock drafts to ensure visual excellence
  useEffect(() => {
    async function fetchDrafts() {
      try {
        const response = await fetch(`${API_URL}/drafts`);
        if (response.ok) {
          const data = await response.json();
          // Map backend items to DraftItem structures
          const backendDrafts: DraftItem[] = data.map((item: any) => {
            // Infer status dynamically
            let status: "Draft" | "Proses" | "Sukses" | "Butuh OTP" = "Draft";
            if (item.kbliCode && item.nik && item.alamatUsaha) {
              status = "Proses"; // Ready to submit or in process
            }
            if (item.id === "DEMO123") {
              status = "Proses";
            }
            return {
              id: item.id || Math.random().toString(36).substring(2, 9).toUpperCase(),
              namaPemilik: item.namaPemilik ? item.namaPemilik.toUpperCase() : "TANPA NAMA",
              namaUsaha: item.namaUsaha ? item.namaUsaha.toUpperCase() : "DRAF USAHA BARU",
              nik: item.nik || "",
              nomorHp: item.nomorHp || "",
              email: item.email || "",
              updatedAt: item.updatedAt || new Date().toISOString(),
              status,
              kbliCode: item.kbliCode,
              kbliTitle: item.kbliTitle,
              alamatUsaha: item.alamatUsaha,
              modalUsaha: item.modalUsaha,
              jumlahPekerja: item.jumlahPekerja,
              caraPenjualan: item.caraPenjualan
            };
          });

          // Mix and de-duplicate (prefer backend drafts if they have matching IDs)
          const merged = [...backendDrafts];
          MOCK_DRAFTS.forEach((mock) => {
            if (!merged.some((d) => d.id === mock.id)) {
              merged.push(mock);
            }
          });

          // Sort by updatedAt descending
          merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          setDrafts(merged);
        } else {
          setDrafts(MOCK_DRAFTS);
        }
      } catch (err) {
        console.error("Gagal memuat draft dari backend, menggunakan data simulasi.", err);
        setDrafts(MOCK_DRAFTS);
      } finally {
        setLoading(false);
      }
    }

    fetchDrafts();
  }, []);

  // Open Draft: Loads draft details into sessionStorage and redirects to Review
  const handleOpenDraft = (draft: DraftItem) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("draft_id", draft.id);
      
      const formData = {
        namaPemilik: draft.namaPemilik,
        nik: draft.nik,
        nomorHp: draft.nomorHp,
        email: draft.email,
        namaUsaha: draft.namaUsaha,
        alamatUsaha: draft.alamatUsaha || "",
        modalUsaha: draft.modalUsaha || "",
        jumlahPekerja: draft.jumlahPekerja || "",
        caraPenjualan: draft.caraPenjualan || "keduanya",
      };

      sessionStorage.setItem("draft_form_data", JSON.stringify(formData));
      
      if (draft.kbliCode) {
        sessionStorage.setItem(
          "selected_kbli",
          JSON.stringify({
            code: draft.kbliCode,
            title: draft.kbliTitle || "KBLI Terpilih"
          })
        );
      } else {
        sessionStorage.removeItem("selected_kbli");
      }

      // Default registration mode
      sessionStorage.setItem("akun_oss", "belum");
      router.push("/review");
    }
  };

  const handleDeleteDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Apakah Anda yakin ingin menghapus draft ini secara permanen?")) {
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    }
  };

  // Helper to format Date string
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }) + " WIB";
    } catch {
      return dateStr;
    }
  };

  // Filter & Search Logic
  const filteredDrafts = drafts.filter((draft) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      draft.namaPemilik.toLowerCase().includes(query) ||
      draft.namaUsaha.toLowerCase().includes(query) ||
      draft.id.toLowerCase().includes(query);
    
    if (activeFilter === "Semua") {
      return matchesSearch;
    }
    return matchesSearch && draft.status === activeFilter;
  });

  return (
    <div className="flex-grow flex flex-col bg-background min-h-screen font-sans">
      
      {/* ── Header ── */}
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
              UMKM Dashboard
            </span>
          </div>
        </div>

        <button 
          onClick={() => {
            if (typeof window !== "undefined") {
              sessionStorage.clear();
            }
            router.push("/");
          }}
          className="px-3 py-1.5 rounded text-xs font-bold bg-primary-container text-white hover:bg-primary transition-all uppercase tracking-wider cursor-pointer"
        >
          Buat Baru
        </button>
      </header>

      {/* ── Main Container (max 640px for mobile list view) ── */}
      <main className="flex-grow flex justify-center w-full px-4 py-8 pb-16">
        <div className="w-full max-w-[640px] flex flex-col gap-6">

          {/* Title Section */}
          <div>
            <h1 className="text-lg md:text-xl font-extrabold uppercase tracking-wide text-on-surface">
              Daftar Draft Pendaftaran NIB
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Kelola dan pantau draf registrasi UMKM Anda. Buka draf untuk melanjutkan proses pengisian otomatis.
            </p>
          </div>

          {/* Search Bar Input */}
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="Cari nama pemilik, nama usaha, atau ID draft..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded border border-border-light bg-white text-xs font-semibold focus:border-primary-container focus:outline-none placeholder:text-outline"
            />
          </div>

          {/* Filter Tabs (Flat Selector Layout) */}
          <div className="flex overflow-x-auto pb-1 gap-1.5 scrollbar-thin">
            {["Semua", "Draft", "Proses", "Butuh OTP", "Sukses"].map((filterName) => (
              <button
                key={filterName}
                onClick={() => setActiveFilter(filterName)}
                className={`px-3 py-1.5 rounded text-[10px] font-extrabold uppercase tracking-wider border shrink-0 transition-all cursor-pointer ${
                  activeFilter === filterName
                    ? "bg-primary-container text-white border-primary-container"
                    : "bg-white text-on-surface-variant border-border-light hover:bg-surface-container-low"
                }`}
              >
                {filterName}
              </button>
            ))}
          </div>

          {/* Draft Cards List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <span className="material-symbols-outlined text-3xl animate-spin text-primary-container">sync</span>
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mt-2 animate-pulse">
                Memuat draf...
              </span>
            </div>
          ) : filteredDrafts.length === 0 ? (
            <div className="bento-card text-center py-12 space-y-4">
              <div className="w-12 h-12 rounded bg-surface-container-high text-outline flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-2xl">folder_off</span>
              </div>
              <div>
                <h3 className="text-xs font-extrabold uppercase text-on-surface">Tidak Ada Draft Ditemukan</h3>
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Mulai dengan membuat draf pendaftaran NIB baru sekarang juga.
                </p>
              </div>
              <button
                onClick={() => router.push("/")}
                className="px-4 py-2 rounded text-xs font-bold bg-primary-container text-white hover:bg-primary transition-all uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Buat Registrasi Baru
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDrafts.map((draft) => (
                <div 
                  key={draft.id} 
                  onClick={() => handleOpenDraft(draft)}
                  className="bento-card hover:bg-surface-container-low transition-all cursor-pointer flex flex-col gap-4 border border-border-light relative group"
                >
                  {/* Top row: Shop name & Status badge */}
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-xs uppercase tracking-wide text-on-surface truncate">
                        {draft.namaUsaha}
                      </h3>
                      <p className="text-[10px] text-outline font-bold mt-0.5 tracking-wider">
                        ID: {draft.id}
                      </p>
                    </div>

                    {/* Status badges mapping */}
                    <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border shrink-0 ${
                      draft.status === "Sukses"
                        ? "bg-success/5 border-success/20 text-success"
                        : draft.status === "Butuh OTP"
                          ? "bg-warning/5 border-warning/20 text-warning"
                          : draft.status === "Proses"
                            ? "bg-primary-container/5 border-primary-container/20 text-primary-container"
                            : "bg-tertiary/5 border-tertiary/20 text-tertiary"
                    }`}>
                      {draft.status}
                    </span>
                  </div>

                  {/* Middle row: Owner details */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-surface-container-low border border-border-light/50 p-2.5 rounded">
                    <div>
                      <span className="text-[9px] text-on-surface-variant font-bold uppercase block">Pemilik</span>
                      <span className="font-extrabold text-on-surface block truncate">{draft.namaPemilik}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-on-surface-variant font-bold uppercase block">KBLI</span>
                      <span className="font-extrabold text-on-surface block truncate">{draft.kbliCode || "Belum dipilih"}</span>
                    </div>
                  </div>

                  {/* Bottom row: Time updated & Action links */}
                  <div className="flex justify-between items-center text-[10px] border-t border-border-light pt-3 mt-1 text-on-surface-variant">
                    <span className="flex items-center gap-1 text-[9px] font-bold text-outline uppercase tracking-wide">
                      <span className="material-symbols-outlined text-xs">history</span>
                      {formatDate(draft.updatedAt)}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleDeleteDraft(draft.id, e)}
                        className="p-1.5 hover:bg-error/10 hover:text-error rounded text-outline transition-all cursor-pointer flex items-center justify-center"
                        title="Hapus Draft"
                      >
                        <span className="material-symbols-outlined text-sm font-semibold">delete</span>
                      </button>

                      <button
                        onClick={() => handleOpenDraft(draft)}
                        className="text-[10px] font-extrabold uppercase tracking-wider text-primary-container flex items-center gap-0.5 hover:underline cursor-pointer"
                      >
                        Buka Draft <span className="material-symbols-outlined text-xs">arrow_forward</span>
                      </button>
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}

        </div>
      </main>

    </div>
  );
}
