"use client";

import { useState, useEffect, useRef, Fragment } from "react";
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
  errorMessage?: string | null;
  kbliCode?: string | null;
  kbliTitle?: string | null;
  alamatUsaha?: string | null;
  modalUsaha?: string | null;
  jumlahPekerja?: string | null;
  tanggalLahir?: string | null;
  jenisKelamin?: string | null;
  alamatKtp?: string | null;
  provinsiKtp?: string | null;
  kotaKabupatenKtp?: string | null;
  kecamatanKtp?: string | null;
  kelurahanKtp?: string | null;
  kodePosKtp?: string | null;
  provinsi?: string | null;
  kotaKabupaten?: string | null;
  kecamatan?: string | null;
  kelurahan?: string | null;
  kodePos?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  luasTanah?: string | null;
  fotoLokasi?: string | null;
  ceritaUsaha?: string | null;
}

interface ActivityEvent {
  id: string;
  draftId: string;
  namaUsaha: string;
  namaPemilik: string;
  step: number;
  status: "info" | "success" | "warn" | "error";
  text: string;
  timestamp: string;
}

interface ToastNotification {
  id: string;
  draftId: string;
  namaUsaha: string;
  text: string;
  timestamp: string;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  
  // Data lists
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  
  // UI states
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("Semua");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(true);
  
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<EventSource | null>(null);

  // Auto scroll terminal to bottom when new logs arrive
  useEffect(() => {
    if (isTerminalOpen && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activities, isTerminalOpen]);

  // Load all drafts from the local backend
  const fetchDrafts = async () => {
    try {
      const response = await fetch(`${API_URL}/drafts`);
      if (response.ok) {
        const data = await response.json();
        const mapped: DraftItem[] = data.map((item: any) => {
          let status: "Draft" | "Proses" | "Sukses" | "Butuh OTP" = "Draft";
          const dbStatus = item.status ? item.status.toUpperCase() : null;
          
          if (dbStatus === "COMPLETED") {
            status = "Sukses";
          } else if (dbStatus === "RUNNING" || dbStatus === "QUEUED") {
            status = "Proses";
          } else if (dbStatus === "FAILED") {
            status = "Butuh OTP";
          } else {
            status = "Draft";
          }

          return {
            ...item,
            status,
            namaPemilik: item.namaPemilik ? item.namaPemilik.toUpperCase() : "TANPA NAMA",
            namaUsaha: item.namaUsaha ? item.namaUsaha.toUpperCase() : "DRAF USAHA BARU",
          };
        });
        
        mapped.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setDrafts(mapped);
      }
    } catch (err) {
      console.error("Gagal memuat semua draft untuk admin.", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrafts();

    // Establish SSE stream connection for global admin activities
    try {
      const eventSource = new EventSource(`${API_URL}/automation/admin-stream`);
      streamRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.draftId) {
            // Append log entry
            const newEvent: ActivityEvent = {
              id: Math.random().toString(36).substring(2, 9).toUpperCase(),
              draftId: payload.draftId,
              namaUsaha: payload.namaUsaha || "Unknown Business",
              namaPemilik: payload.namaPemilik || "Unknown Owner",
              step: payload.step,
              status: payload.status || "info",
              text: payload.text,
              timestamp: payload.timestamp || new Date().toISOString(),
            };
            
            setActivities((prev) => [...prev.slice(-99), newEvent]); // Keep last 100 entries

            // Update draft status dynamically in the UI list
            setDrafts((prevDrafts) => {
              return prevDrafts.map((d) => {
                if (d.id === payload.draftId) {
                  let updatedStatus: "Draft" | "Proses" | "Sukses" | "Butuh OTP" = d.status;
                  let dbErrorMessage = d.errorMessage;
                  
                  if (payload.status === "error") {
                    updatedStatus = "Butuh OTP";
                    dbErrorMessage = payload.text;
                  } else if (payload.step === 7) {
                    updatedStatus = "Sukses";
                    dbErrorMessage = null;
                  } else if (payload.status === "success" || payload.status === "info" || payload.status === "warn") {
                    updatedStatus = "Proses";
                  }

                  return {
                    ...d,
                    status: updatedStatus,
                    errorMessage: dbErrorMessage,
                    updatedAt: new Date().toISOString(),
                  };
                }
                return d;
              });
            });

            // Trigger visual error toast notification if status is error
            if (payload.status === "error") {
              const toastId = Math.random().toString(36).substring(2, 9).toUpperCase();
              const newToast: ToastNotification = {
                id: toastId,
                draftId: payload.draftId,
                namaUsaha: payload.namaUsaha || "Unknown Business",
                text: payload.text,
                timestamp: new Date().toLocaleTimeString("id-ID"),
              };
              
              setToasts((prev) => [...prev, newToast]);

              // Auto dismiss toast after 8 seconds
              setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== toastId));
              }, 8000);
            }
          }
        } catch (parseErr) {
          console.error("Gagal mengurai payload SSE admin:", parseErr);
        }
      };

      eventSource.onerror = (err) => {
        console.error("Kesalahan stream SSE admin:", err);
      };
    } catch (err) {
      console.error("Gagal menghubungkan ke SSE stream admin:", err);
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.close();
      }
    };
  }, []);

  // Delete draft handler
  const handleDeleteDraft = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Apakah Anda yakin ingin menghapus draft ID ${id} secara permanen? Tindakan ini tidak dapat dibatalkan.`)) {
      try {
        const response = await fetch(`${API_URL}/drafts/${id}`, {
          method: "DELETE",
        });
        if (response.ok) {
          setDrafts((prev) => prev.filter((d) => d.id !== id));
          if (selectedDraftId === id) setSelectedDraftId(null);
        } else {
          alert("Gagal menghapus draft dari backend.");
        }
      } catch (err) {
        console.error("Gagal menghapus draft:", err);
        alert("Kesalahan koneksi saat menghapus draft.");
      }
    }
  };

  // Helper formats
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) + " WIB";
    } catch {
      return dateStr;
    }
  };

  // Filter & Search drafts
  const filteredDrafts = drafts.filter((draft) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      draft.namaPemilik.toLowerCase().includes(q) ||
      draft.namaUsaha.toLowerCase().includes(q) ||
      draft.id.toLowerCase().includes(q) ||
      (draft.nik && draft.nik.includes(q));
    
    if (statusFilter === "Semua") return matchesSearch;
    return matchesSearch && draft.status === statusFilter;
  });

  // Calculate stats KPIs
  const totalCount = drafts.length;
  const successCount = drafts.filter((d) => d.status === "Sukses").length;
  const errorCount = drafts.filter((d) => d.status === "Butuh OTP").length;
  
  // Calculate active sessions: how many have "Proses" status
  const activeCount = drafts.filter((d) => d.status === "Proses").length;

  return (
    <div className="flex-grow flex flex-col bg-background min-h-screen font-sans text-on-background">
      
      {/* ── Header ── */}
      <header className="sticky top-0 bg-white border-b border-border-light h-16 px-4 md:px-8 flex items-center justify-between z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#E5E7EB] text-lg shadow-inner select-none shrink-0">
            👑
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-sm md:text-base tracking-wider text-primary uppercase leading-none">
              NIB Assistant
            </span>
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest leading-none mt-1">
              Admin Area Dashboard
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] md:text-xs font-bold bg-[#E5E7EB] px-2.5 py-1 rounded text-primary-container">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
            SSE CONNECTED
          </span>
          <button 
            onClick={() => router.push("/dashboard")}
            className="px-3.5 py-1.5 rounded text-xs font-bold bg-primary text-white hover:bg-primary-container transition-all uppercase tracking-wider cursor-pointer"
          >
            Dashboard Client
          </button>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 md:px-8 py-8 flex flex-col gap-6">

        {/* ── Bento Grid Stats Cards ── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Total */}
          <div className="bento-card border border-border-light relative overflow-hidden group hover:border-outline-variant transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-outline uppercase tracking-wider">Total Registrasi</p>
                <h3 className="text-2xl md:text-3xl font-extrabold text-on-surface mt-1">{totalCount}</h3>
              </div>
              <span className="material-symbols-outlined text-outline/40 text-3xl">folder_shared</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-outline/25"></div>
          </div>

          {/* Card 2: Active */}
          <div className="bento-card border border-border-light relative overflow-hidden group hover:border-primary-container/40 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-primary-container uppercase tracking-wider">Sesi Aktif</p>
                <h3 className="text-2xl md:text-3xl font-extrabold text-primary-container mt-1">{activeCount}</h3>
              </div>
              <span className="material-symbols-outlined text-primary-container/40 text-3xl animate-spin-slow">sync</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary-container"></div>
          </div>

          {/* Card 3: Success */}
          <div className="bento-card border border-border-light relative overflow-hidden group hover:border-success/40 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-success uppercase tracking-wider">Registrasi Sukses</p>
                <h3 className="text-2xl md:text-3xl font-extrabold text-success mt-1">{successCount}</h3>
              </div>
              <span className="material-symbols-outlined text-success/40 text-3xl">verified</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-success"></div>
          </div>

          {/* Card 4: FAILED */}
          <div className="bento-card border border-border-light relative overflow-hidden group hover:border-error/40 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-error uppercase tracking-wider">Gagal / Butuh OTP</p>
                <h3 className="text-2xl md:text-3xl font-extrabold text-error mt-1">{errorCount}</h3>
              </div>
              <span className="material-symbols-outlined text-error/40 text-3xl">report</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-error"></div>
          </div>

        </section>

        {/* ── Collapsible Live Activity Terminal Console ── */}
        <section className="bento-card p-0 overflow-hidden border border-border-light bg-[#1E1E24]">
          <button 
            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-[#17171C] text-white cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse"></span>
              <span className="text-xs font-bold tracking-widest uppercase text-outline-variant">
                Live Activity Log Stream (All Sessions)
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setActivities([]);
                }}
                className="px-2 py-0.5 rounded border border-outline/35 hover:bg-outline/10 text-[9px] font-extrabold uppercase tracking-wide text-[#A3A3AF] cursor-pointer"
              >
                Clear Log
              </button>
              <span className="material-symbols-outlined text-base">
                {isTerminalOpen ? "expand_less" : "expand_more"}
              </span>
            </div>
          </button>

          {isTerminalOpen && (
            <div className="h-64 overflow-y-auto px-5 py-4 font-mono text-[10px] md:text-xs leading-relaxed space-y-1.5 scrollbar-thin">
              {activities.length === 0 ? (
                <div className="text-zinc-500 italic py-4 text-center">
                  Menunggu log otomatisasi dari klien... Mulai sesi otomatisasi dari wizard untuk melihat aktivitas live.
                </div>
              ) : (
                activities.map((act) => {
                  let textClass = "text-zinc-300";
                  let prefix = "[INFO]";
                  
                  if (act.status === "success") {
                    textClass = "text-emerald-400 font-semibold";
                    prefix = "✅ [SUCCESS]";
                  } else if (act.status === "error") {
                    textClass = "text-rose-400 font-bold bg-rose-950/20 px-1 rounded border border-rose-900/30";
                    prefix = "❌ [CRITICAL]";
                  } else if (act.status === "warn") {
                    textClass = "text-amber-400 font-semibold";
                    prefix = "⚠️ [WARNING]";
                  } else if (act.status === "info") {
                    textClass = "text-cyan-400";
                    prefix = "ℹ️ [INFO]";
                  }

                  const timeStr = new Date(act.timestamp).toLocaleTimeString("id-ID");

                  return (
                    <div key={act.id} className={`flex items-start gap-1 ${textClass} animate-fadeIn`}>
                      <span className="text-zinc-500 shrink-0 select-none">[{timeStr}]</span>
                      <span className="font-extrabold text-blue-400 shrink-0 select-none">[{act.namaUsaha}]</span>
                      <span className="font-extrabold shrink-0 select-none">{prefix}</span>
                      <span className="break-all">{act.text}</span>
                    </div>
                  );
                })
              )}
              <div ref={terminalEndRef} />
            </div>
          )}
        </section>

        {/* ── Search & Filter Controls ── */}
        <section className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="Cari pemilik, nama usaha, NIK, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded border border-border-light bg-white text-xs font-semibold focus:border-primary focus:outline-none placeholder:text-outline shadow-sm"
            />
          </div>

          <div className="flex overflow-x-auto w-full md:w-auto pb-1 gap-1.5 scrollbar-thin">
            {["Semua", "Draft", "Proses", "Butuh OTP", "Sukses"].map((filterName) => (
              <button
                key={filterName}
                onClick={() => setStatusFilter(filterName)}
                className={`px-3.5 py-1.5 rounded text-[10px] font-extrabold uppercase tracking-wider border shrink-0 transition-all cursor-pointer ${
                  statusFilter === filterName
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-on-surface-variant border-border-light hover:bg-surface-container-low"
                }`}
              >
                {filterName}
              </button>
            ))}
          </div>
        </section>

        {/* ── Main Drafts List Table ── */}
        <section className="bento-card border border-border-light p-0 overflow-hidden shadow-md">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span>
              <span className="text-xs font-bold uppercase tracking-wider text-outline mt-3 animate-pulse">
                Memuat data registrasi...
              </span>
            </div>
          ) : filteredDrafts.length === 0 ? (
            <div className="text-center py-16 text-outline italic text-xs">
              Tidak ada draft pendaftaran yang cocok dengan kriteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-container-low border-b border-border-light font-bold text-on-surface uppercase tracking-wider">
                    <th className="px-5 py-3">ID Draft</th>
                    <th className="px-5 py-3">Nama Usaha / Pemilik</th>
                    <th className="px-5 py-3">NIK</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Terakhir Diperbarui</th>
                    <th className="px-5 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {filteredDrafts.map((draft) => {
                    const isExpanded = selectedDraftId === draft.id;
                    return (
                      <Fragment key={draft.id}>
                        {/* Table Row */}
                        <tr 
                          onClick={() => setSelectedDraftId(isExpanded ? null : draft.id)}
                          className={`hover:bg-surface-container-low transition-all cursor-pointer ${isExpanded ? "bg-surface-container-low/50" : ""}`}
                        >
                          <td className="px-5 py-4 font-bold text-primary font-mono">{draft.id}</td>
                          <td className="px-5 py-4">
                            <div className="font-extrabold text-on-surface">{draft.namaUsaha}</div>
                            <div className="text-[10px] text-outline font-bold mt-0.5">{draft.namaPemilik}</div>
                          </td>
                          <td className="px-5 py-4 font-mono font-semibold text-zinc-600">{draft.nik}</td>
                          <td className="px-5 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border shrink-0 ${
                              draft.status === "Sukses"
                                ? "bg-success/5 border-success/20 text-success"
                                : draft.status === "Butuh OTP"
                                  ? "bg-error/5 border-error/20 text-error"
                                  : draft.status === "Proses"
                                    ? "bg-primary/5 border-primary/20 text-primary"
                                    : "bg-tertiary/5 border-tertiary/20 text-tertiary"
                            }`}>
                              {draft.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-outline font-semibold">{formatDate(draft.updatedAt)}</td>
                          <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button 
                                onClick={(e) => handleDeleteDraft(draft.id, e)}
                                className="p-1.5 hover:bg-error/10 hover:text-error rounded text-outline transition-all cursor-pointer flex items-center justify-center"
                                title="Hapus Draft"
                              >
                                <span className="material-symbols-outlined text-sm font-semibold">delete</span>
                              </button>
                              <span className="material-symbols-outlined text-outline/70 select-none text-base">
                                {isExpanded ? "keyboard_arrow_up" : "keyboard_arrow_down"}
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Details Container */}
                        {isExpanded && (
                          <tr className="bg-surface-container-low/20">
                            <td colSpan={6} className="px-5 py-5 border-b border-border-light">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[11px] animate-slideDown">
                                
                                {/* Col 1: Kontak & Dokumen */}
                                <div className="space-y-2">
                                  <h4 className="font-extrabold uppercase tracking-wide text-primary-container text-[10px]">Informasi Kontak</h4>
                                  <div className="space-y-1">
                                    <div><span className="text-outline font-bold">Email:</span> <span className="font-semibold text-on-surface">{draft.email}</span></div>
                                    <div><span className="text-outline font-bold">Nomor HP:</span> <span className="font-semibold text-on-surface">{draft.nomorHp}</span></div>
                                    <div><span className="text-outline font-bold">Jenis Kelamin:</span> <span className="font-semibold text-on-surface">{draft.jenisKelamin || "-"}</span></div>
                                    <div><span className="text-outline font-bold">Tanggal Lahir:</span> <span className="font-semibold text-on-surface">{draft.tanggalLahir || "-"}</span></div>
                                  </div>
                                </div>

                                {/* Col 2: Bisnis & Lokasi */}
                                <div className="space-y-2">
                                  <h4 className="font-extrabold uppercase tracking-wide text-primary-container text-[10px]">Detail Usaha</h4>
                                  <div className="space-y-1">
                                    <div><span className="text-outline font-bold">KBLI Code:</span> <span className="font-extrabold text-on-surface">{draft.kbliCode || "-"}</span></div>
                                    <div className="line-clamp-2"><span className="text-outline font-bold">KBLI Title:</span> <span className="font-semibold text-on-surface">{draft.kbliTitle || "-"}</span></div>
                                    <div><span className="text-outline font-bold">Modal:</span> <span className="font-semibold text-on-surface">Rp {Number(draft.modalUsaha || 0).toLocaleString("id-ID")}</span></div>
                                    <div><span className="text-outline font-bold">Pekerja:</span> <span className="font-semibold text-on-surface">{draft.jumlahPekerja} orang</span></div>
                                    <div><span className="text-outline font-bold">Luas Tanah:</span> <span className="font-semibold text-on-surface">{draft.luasTanah || "-"} m²</span></div>
                                  </div>
                                </div>

                                {/* Col 3: Status error persistensi */}
                                <div className="space-y-2">
                                  <h4 className="font-extrabold uppercase tracking-wide text-primary-container text-[10px]">Detail Eksekusi</h4>
                                  <div className="space-y-1.5">
                                    <div>
                                      <span className="text-outline font-bold">Status:</span> 
                                      <span className="ml-1.5 font-extrabold text-on-surface">{draft.status}</span>
                                    </div>
                                    {draft.errorMessage ? (
                                      <div className="bg-error/5 border border-error/20 p-2.5 rounded text-error">
                                        <div className="font-extrabold uppercase text-[9px] tracking-wider mb-1 flex items-center gap-1">
                                          <span className="material-symbols-outlined text-xs">warning</span> Kesalahan Terakhir
                                        </div>
                                        <div className="font-semibold leading-normal break-words">{draft.errorMessage}</div>
                                      </div>
                                    ) : (
                                      <div className="text-zinc-500 italic">Tidak ada error yang tercatat. Sesi pendaftaran berjalan normal atau sukses.</div>
                                    )}
                                  </div>
                                </div>

                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>

      {/* ── Floating Error Notification Toasts (Top Right) ── */}
      <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div 
            key={toast.id}
            className="pointer-events-auto bg-white border-l-4 border-error shadow-lg rounded p-4 flex gap-3 animate-slideUp"
            role="alert"
          >
            <div className="text-error shrink-0">
              <span className="material-symbols-outlined text-2xl font-bold">report</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold text-[11px] uppercase tracking-wide text-on-surface truncate">
                  ERROR: {toast.namaUsaha}
                </span>
                <span className="text-[9px] text-outline font-bold shrink-0">{toast.timestamp}</span>
              </div>
              <p className="text-[11px] text-on-surface-variant leading-normal mt-1 break-words font-medium">
                {toast.text}
              </p>
            </div>
            <button 
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-outline hover:text-on-surface transition-all ml-auto self-start shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm font-bold">close</span>
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}
