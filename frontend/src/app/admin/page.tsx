"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface LogEntry {
  step: number;
  status: "info" | "success" | "warn" | "error";
  text: string;
  timestamp: string;
}

interface DraftItem {
  id: string;
  namaPemilik: string;
  namaUsaha: string;
  nik: string;
  nomorHp: string;
  email: string;
  updatedAt: string;
  status: "Draft" | "Proses" | "Sukses" | "Butuh OTP" | "Gagal";
  errorMessage?: string | null;
  logs?: LogEntry[] | null;
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
  sumberPembiayaan?: string | null;
  omzetTahunan?: string | null;
  modalKerja?: string | null;
  sudahBerjalan?: string | null;
  tanggalMulaiUsaha?: string | null;
  tanggalMulaiOperasional?: string | null;
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
  
  // Auth state
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState<boolean>(false);
  
  // Data lists
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  
  // UI states
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  
  // Log Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerDraftId, setDrawerDraftId] = useState<string | null>(null);
  const [drawerDraftName, setDrawerDraftName] = useState<string>("");
  const [drawerDraftOwner, setDrawerDraftOwner] = useState<string>("");
  const [drawerIsActive, setDrawerIsActive] = useState<boolean>(false);
  
  const drawerTerminalEndRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const drawerDraftIdRef = useRef<string | null>(null);
  const loadedDraftIdsRef = useRef<Set<string>>(new Set());

  // Check token on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = sessionStorage.getItem("admin_token");
      if (token) {
        setAdminToken(token);
      }
    }
  }, []);

  // Auto scroll drawer terminal to bottom when new logs arrive
  useEffect(() => {
    if (isDrawerOpen && drawerTerminalEndRef.current) {
      drawerTerminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activities, isDrawerOpen, drawerDraftId]);

  // Load all drafts from the local backend
  const fetchDrafts = async () => {
    if (!adminToken) return;
    try {
      const response = await fetch(`${API_URL}/drafts`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        
        // Track loaded draft IDs to dynamically add new incoming sessions
        const ids = new Set<string>();
        data.forEach((item: any) => {
          if (item.id) ids.add(item.id);
        });
        loadedDraftIdsRef.current = ids;

        const mapped: DraftItem[] = data.map((item: any) => {
          let status: "Draft" | "Proses" | "Sukses" | "Butuh OTP" | "Gagal" = "Draft";
          const dbStatus = item.status ? item.status.toUpperCase() : null;
          
          if (dbStatus === "COMPLETED") {
            status = "Sukses";
          } else if (dbStatus === "RUNNING" || dbStatus === "QUEUED") {
            status = "Proses";
          } else if (dbStatus === "FAILED_LATER") {
            status = "Gagal";
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
      } else if (response.status === 418 || response.status === 401) {
        // Token expired or invalid
        handleLogout();
      }
    } catch (err) {
      console.error("Gagal memuat semua draft untuk admin.", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!adminToken) return;
    
    fetchDrafts();

    // Establish SSE stream connection for global admin activities
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`${API_URL}/automation/admin-stream?token=${adminToken}`);
      streamRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.draftId) {
            // If it's a new draft session, add to set and trigger a refresh
            if (!loadedDraftIdsRef.current.has(payload.draftId)) {
              loadedDraftIdsRef.current.add(payload.draftId);
              fetchDrafts();
              return;
            }

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
            
            setActivities((prev) => [...prev.slice(-199), newEvent]); // Keep last 200 entries

            // Update draft status dynamically in the UI list
            setDrafts((prevDrafts) => {
              return prevDrafts.map((d) => {
                if (d.id === payload.draftId) {
                  let updatedStatus: "Draft" | "Proses" | "Sukses" | "Butuh OTP" | "Gagal" = d.status;
                  let dbErrorMessage = d.errorMessage;
                  
                  if (payload.status === "error") {
                    updatedStatus = payload.step > 2 ? "Gagal" : "Butuh OTP";
                    dbErrorMessage = payload.text;
                  } else if (payload.step === 7) {
                    updatedStatus = "Sukses";
                    dbErrorMessage = null;
                  } else if (payload.status === "success" || payload.status === "info" || payload.status === "warn") {
                    updatedStatus = "Proses";
                  }

                  // Build running logs in memory for active stream view
                  const currentLogs = d.logs || [];
                  const exists = currentLogs.some(
                    (log) => log.text === payload.text && log.step === payload.step
                  );
                  
                  const updatedLogs = exists 
                    ? currentLogs 
                    : [
                        ...currentLogs, 
                        {
                          step: payload.step,
                          status: payload.status || "info",
                          text: payload.text,
                          timestamp: payload.timestamp || new Date().toISOString()
                        }
                      ];

                  return {
                    ...d,
                    status: updatedStatus,
                    errorMessage: dbErrorMessage,
                    logs: updatedLogs,
                    updatedAt: new Date().toISOString(),
                  };
                }
                return d;
              });
            });

            // If terminal state (error or complete), deactivate drawer and auto-refresh table
            if (payload.status === "error" || payload.step === 7) {
              if (drawerDraftIdRef.current === payload.draftId) {
                setDrawerIsActive(false);
              }
              setTimeout(() => {
                fetchDrafts();
              }, 1500);
            }

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
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [adminToken]);

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthenticating(true);
    try {
      const response = await fetch(`${API_URL}/auth/admin/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          sessionStorage.setItem("admin_token", data.token);
          setAdminToken(data.token);
          setLoading(true);
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        setAuthError(errData.message || "Username atau password salah.");
      }
    } catch (err) {
      console.error("Gagal melakukan autentikasi admin:", err);
      setAuthError("Gagal terhubung ke server backend lokal.");
    } finally {
      setAuthenticating(false);
    }
  };

  // Logout handler
  const handleLogout = () => {
    sessionStorage.removeItem("admin_token");
    setAdminToken(null);
    setDrafts([]);
    setActivities([]);
    setToasts([]);
    setSelectedDraftId(null);
    setIsDrawerOpen(false);
    setDrawerDraftId(null);
    drawerDraftIdRef.current = null;
    loadedDraftIdsRef.current.clear();
    setUsername("");
    setPassword("");
  };

  // Delete draft handler
  const handleDeleteDraft = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!adminToken) return;
    if (confirm(`Apakah Anda yakin ingin menghapus draft ID ${id} secara permanen? Tindakan ini tidak dapat dibatalkan.`)) {
      try {
        const response = await fetch(`${API_URL}/drafts/${id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
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

  // Open Log Drawer
  const handleOpenDrawer = (draft: DraftItem, isActive: boolean) => {
    setDrawerDraftId(draft.id);
    drawerDraftIdRef.current = draft.id;
    setDrawerDraftName(draft.namaUsaha);
    setDrawerDraftOwner(draft.namaPemilik);
    setDrawerIsActive(isActive);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setDrawerDraftId(null);
    drawerDraftIdRef.current = null;
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

  const getLogStyle = (status: string) => {
    switch (status) {
      case "success":
        return "text-emerald-400 font-semibold";
      case "error":
        return "text-rose-400 font-bold bg-rose-950/20 px-1.5 py-0.5 rounded border border-rose-900/30";
      case "warn":
        return "text-amber-400 font-semibold";
      case "info":
      default:
        return "text-cyan-400";
    }
  };

  // Filter & Search drafts
  const searchedDrafts = drafts.filter((draft) => {
    const q = searchQuery.toLowerCase();
    return (
      draft.namaPemilik.toLowerCase().includes(q) ||
      draft.namaUsaha.toLowerCase().includes(q) ||
      draft.id.toLowerCase().includes(q) ||
      (draft.nik && draft.nik.includes(q))
    );
  });

  // Split drafts based on Active vs Previous tabs
  const activeSessions = searchedDrafts.filter((d) => d.status === "Proses");
  const historySessions = searchedDrafts.filter((d) => d.status !== "Proses");

  const currentTabDrafts = activeTab === "active" ? activeSessions : historySessions;

  // Calculate stats KPIs
  const totalCount = drafts.length;
  const successCount = drafts.filter((d) => d.status === "Sukses").length;
  const errorCount = drafts.filter((d) => d.status === "Butuh OTP" || d.status === "Gagal").length;
  const activeCount = drafts.filter((d) => d.status === "Proses").length;

  // Get log entries for the active drawer
  const getDrawerLogs = (): LogEntry[] => {
    if (!drawerDraftId) return [];
    
    // Find matching draft
    const matchedDraft = drafts.find((d) => d.id === drawerDraftId);
    
    if (drawerIsActive) {
      // For active sessions, show logs accumulated in state (or filter from live activities)
      const stateLogs = matchedDraft?.logs || [];
      const activityLogs = activities
        .filter((act) => act.draftId === drawerDraftId)
        .map((act) => ({
          step: act.step,
          status: act.status,
          text: act.text,
          timestamp: act.timestamp,
        }));
      
      // Combine and filter duplicates
      const allLogs = [...stateLogs];
      activityLogs.forEach((actLog) => {
        if (!allLogs.some((l) => l.text === actLog.text && l.step === actLog.step)) {
          allLogs.push(actLog);
        }
      });
      return allLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else {
      // For inactive history, load persisted logs array
      return matchedDraft?.logs || [];
    }
  };

  // ── Render Login Screen if not authenticated ──
  if (!adminToken) {
    return (
      <div className="flex-grow flex items-center justify-center bg-[#090D16] min-h-screen px-4 font-sans select-none relative overflow-hidden">
        {/* Background Decorative Gradients */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-secondary/10 blur-[120px] pointer-events-none" />

        <div className="w-full max-w-sm bg-white/5 border border-white/10 backdrop-blur-md p-8 rounded-xl shadow-2xl space-y-6 animate-fadeIn">
          
          {/* Logo & Heading */}
          <div className="text-center space-y-2">
            <span className="text-4xl block">🇮🇩</span>
            <h2 className="text-lg font-extrabold tracking-wider text-white uppercase mt-2">
              Admin Portal Login
            </h2>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
              NIB Assistant Management
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            
            {/* Username Input */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username admin"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-primary-container transition-all"
              />
            </div>

            {/* Password Input */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Kata Sandi
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-primary-container transition-all"
              />
            </div>

            {/* Error Message */}
            {authError && (
              <div className="bg-rose-950/20 border border-rose-900/30 p-2.5 rounded text-rose-400 text-[10px] font-bold leading-normal flex items-start gap-1.5">
                <span className="material-symbols-outlined text-sm shrink-0">warning</span>
                <span>{authError}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={authenticating}
              className="w-full py-2.5 rounded bg-primary-container text-white text-xs font-bold uppercase tracking-wider hover:bg-primary transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
            >
              {authenticating ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                  Memverifikasi...
                </>
              ) : (
                "Masuk Portal"
              )}
            </button>

          </form>

        </div>
      </div>
    );
  }

  // ── Render Authenticated Dashboard ──
  return (
    <div className="flex-grow flex flex-col bg-background min-h-screen font-sans text-on-background relative overflow-x-hidden">
      
      {/* ── Header ── */}
      <header className="sticky top-0 bg-white border-b border-border-light h-16 px-4 md:px-8 flex items-center justify-between z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#E5E7EB] text-lg shadow-inner select-none shrink-0" title="Admin Icon">
            👑
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-sm md:text-base tracking-wider text-primary uppercase leading-none">
              NIB Assistant
            </span>
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest leading-none mt-1">
              Admin Monitor Dashboard
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 text-[10px] md:text-xs font-bold bg-[#E2E8F0] px-2.5 py-1 rounded text-primary-container">
            <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse"></span>
            SSE ACTIVE
          </span>
          <button 
            onClick={() => router.push("/dashboard")}
            className="px-3.5 py-1.5 rounded text-xs font-bold border border-border-light bg-white text-on-surface hover:bg-surface-container-low transition-all uppercase tracking-wider cursor-pointer"
          >
            Dashboard Client
          </button>
          <button 
            onClick={handleLogout}
            className="px-3.5 py-1.5 rounded text-xs font-bold bg-primary text-white hover:bg-primary-container transition-all uppercase tracking-wider cursor-pointer"
          >
            Keluar
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
          <div className="bento-card border border-border-light relative overflow-hidden group hover:border-primary-container/40 transition-all bg-primary-container/5">
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
          <div className="bento-card border border-border-light relative overflow-hidden group hover:border-success/40 transition-all bg-success/5">
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
          <div className="bento-card border border-border-light relative overflow-hidden group hover:border-error/40 transition-all bg-error/5">
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

        {/* ── Search & Tab Controls ── */}
        <section className="flex flex-col md:flex-row gap-4 items-center justify-between mt-2">
          {/* Search Input */}
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

          {/* Tabs Selector */}
          <div className="flex overflow-x-auto w-full md:w-auto pb-1 gap-1.5 scrollbar-thin">
            <button
              onClick={() => setActiveTab("active")}
              className={`px-4 py-2 rounded text-[10px] font-extrabold uppercase tracking-wider border shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "active"
                  ? "bg-primary text-white border-primary shadow"
                  : "bg-white text-on-surface-variant border-border-light hover:bg-surface-container-low"
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]"></span>
              </span>
              Sesi Aktif ({activeSessions.length})
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 rounded text-[10px] font-extrabold uppercase tracking-wider border shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "history"
                  ? "bg-primary text-white border-primary shadow"
                  : "bg-white text-on-surface-variant border-border-light hover:bg-surface-container-low"
              }`}
            >
              <span className="material-symbols-outlined text-xs">history</span>
              Riwayat Selesai & Gagal ({historySessions.length})
            </button>
          </div>
        </section>

        {/* ── Tabbed Drafts List Table ── */}
        <section className="bento-card border border-border-light p-0 overflow-hidden shadow-md">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span>
              <span className="text-xs font-bold uppercase tracking-wider text-outline mt-3 animate-pulse">
                Memuat data registrasi...
              </span>
            </div>
          ) : currentTabDrafts.length === 0 ? (
            <div className="text-center py-20 text-outline italic text-xs bg-white space-y-2">
              <span className="material-symbols-outlined text-3xl block text-zinc-300">folder_open</span>
              <p>Tidak ada data {activeTab === "active" ? "sesi aktif yang sedang berjalan" : "riwayat pendaftaran"} ditemukan.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-container-low border-b border-border-light font-bold text-on-surface uppercase tracking-wider">
                    <th className="px-5 py-3.5">ID Draft</th>
                    <th className="px-5 py-3.5">Nama Usaha / Pemilik</th>
                    <th className="px-5 py-3.5">NIK</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Terakhir Diperbarui</th>
                    <th className="px-5 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {currentTabDrafts.map((draft) => {
                    const isExpanded = selectedDraftId === draft.id;
                    const isRunning = draft.status === "Proses";

                    return (
                      <Fragment key={draft.id}>
                        {/* Table Row */}
                        <tr 
                          onClick={() => setSelectedDraftId(isExpanded ? null : draft.id)}
                          className={`hover:bg-surface-container-low transition-all cursor-pointer ${isExpanded ? "bg-surface-container-low/50" : ""}`}
                        >
                          <td className="px-5 py-4 font-bold text-primary font-mono">{draft.id}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              {isRunning && (
                                <span className="relative flex h-2 w-2 shrink-0" title="Active indicator">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                                </span>
                              )}
                              <span className="font-extrabold text-on-surface truncate max-w-[200px]">{draft.namaUsaha}</span>
                            </div>
                            <div className="text-[10px] text-outline font-bold mt-0.5">{draft.namaPemilik}</div>
                          </td>
                          <td className="px-5 py-4 font-mono font-semibold text-zinc-600">{draft.nik}</td>
                          <td className="px-5 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border shrink-0 ${
                              draft.status === "Sukses"
                                ? "bg-success/5 border-success/20 text-success"
                                : draft.status === "Gagal"
                                  ? "bg-error/5 border-error/20 text-error"
                                  : draft.status === "Butuh OTP"
                                    ? "bg-warning/5 border-warning/20 text-warning"
                                    : draft.status === "Proses"
                                      ? "bg-primary/5 border-primary/20 text-primary"
                                      : "bg-tertiary/5 border-tertiary/20 text-tertiary"
                            }`}>
                              {draft.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-outline font-semibold">{formatDate(draft.updatedAt)}</td>
                          <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {/* CTA View Log Drawer */}
                              {isRunning ? (
                                <button
                                  onClick={() => handleOpenDrawer(draft, true)}
                                  className="px-2.5 py-1.5 rounded text-[10px] font-bold bg-[#17171C] text-emerald-400 hover:bg-[#202027] border border-emerald-500/25 transition-all uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-sm"
                                  title="Lihat Log Running"
                                >
                                  <span className="material-symbols-outlined text-xs animate-pulse text-emerald-400 font-semibold">terminal</span>
                                  Log Running
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleOpenDrawer(draft, false)}
                                  className="px-2.5 py-1.5 rounded text-[10px] font-bold bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-all border border-border-light uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs"
                                  title="Lihat Riwayat Log"
                                >
                                  <span className="material-symbols-outlined text-xs text-zinc-500 font-semibold">history</span>
                                  Log History
                                </button>
                              )}

                              <button 
                                onClick={(e) => handleDeleteDraft(draft.id, e)}
                                className="p-1.5 hover:bg-error/10 hover:text-error rounded text-outline transition-all cursor-pointer flex items-center justify-center"
                                title="Hapus Draft"
                              >
                                <span className="material-symbols-outlined text-sm font-semibold">delete</span>
                              </button>
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

      {/* ── Right Slide-out Terminal Log Drawer ── */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Translucent Backdrop */}
          <div 
            onClick={handleCloseDrawer}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
          />

          {/* Drawer Console Content */}
          <div className="relative w-full max-w-lg md:max-w-2xl bg-[#17171C] shadow-2xl h-full flex flex-col border-l border-zinc-800 animate-fadeIn z-10">
            
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-[#121216] text-white">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {drawerIsActive ? (
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
                    </span>
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-500"></span>
                  )}
                  <h3 className="font-extrabold text-sm md:text-base uppercase tracking-wider truncate text-[#ECEEF0]">
                    {drawerDraftName}
                  </h3>
                </div>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
                  Pemilik: {drawerDraftOwner} | ID: {drawerDraftId}
                </p>
              </div>
              <button 
                onClick={handleCloseDrawer}
                className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                title="Tutup Panel"
              >
                <span className="material-symbols-outlined font-bold text-lg">close</span>
              </button>
            </div>

            {/* Terminal Body */}
            <div className="flex-grow overflow-y-auto px-6 py-5 font-mono text-[10px] md:text-xs leading-relaxed space-y-2 bg-[#17171C] text-zinc-300 scrollbar-thin">
              <div className="text-zinc-600 select-none pb-2 border-b border-zinc-900/60 mb-2 italic">
                --- AWAL LOG TRANSAKSI ({drawerIsActive ? "SESI RUNNING LIVE" : "SESI SELESAI"}) ---
              </div>
              
              {getDrawerLogs().length === 0 ? (
                <div className="text-zinc-500 italic py-10 text-center select-none">
                  {drawerIsActive 
                    ? "Menghubungkan ke logs stream... Menunggu baris baru."
                    : "Tidak ada data riwayat log yang tersimpan."}
                </div>
              ) : (
                getDrawerLogs().map((log, idx) => {
                  const time = new Date(log.timestamp).toLocaleTimeString("id-ID");
                  const style = getLogStyle(log.status);

                  return (
                    <div key={idx} className={`flex items-start gap-1.5 ${style} animate-fadeIn`}>
                      <span className="text-zinc-600 shrink-0 select-none">[{time}]</span>
                      <span className="font-extrabold shrink-0 select-none">
                        {log.status === "error" ? "❌ [ERR]" : log.status === "success" ? "✅ [OK]" : log.status === "warn" ? "⚠️ [WRN]" : "ℹ️ [MSG]"}
                      </span>
                      <span className="break-all">{log.text}</span>
                    </div>
                  );
                })
              )}
              
              <div ref={drawerTerminalEndRef} />
            </div>

            {/* Terminal Footer */}
            <div className="px-6 py-3 border-t border-zinc-850 bg-[#121216] flex items-center justify-between text-[10px] text-zinc-500 font-bold uppercase select-none">
              <span>NIB Assistant Console v1.0</span>
              {drawerIsActive && (
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold animate-pulse">
                  <span className="material-symbols-outlined text-xs">radio_button_checked</span>
                  STREAMING LIVE...
                </span>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Floating Error Notification Toasts (Bottom Left) ── */}
      <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
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
