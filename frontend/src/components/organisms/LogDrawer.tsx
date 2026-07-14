"use client";

import React, { useEffect, useRef } from "react";

export interface LogEntry {
  step: number;
  status: "info" | "success" | "warn" | "error";
  text: string;
  timestamp: string;
}

interface LogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isActive: boolean;
  draftName: string;
  draftOwner: string;
  draftId: string;
  logs: LogEntry[];
  onPlayVideo?: () => void;
}

export default function LogDrawer({
  isOpen,
  onClose,
  isActive,
  draftName,
  draftOwner,
  draftId,
  logs,
  onPlayVideo,
}: LogDrawerProps) {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll terminal to bottom when new logs arrive
  useEffect(() => {
    if (isOpen && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isOpen]);

  if (!isOpen) return null;

  const getLogStyle = (status: "info" | "success" | "warn" | "error") => {
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Translucent Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
      />

      {/* Drawer Console Content */}
      <div className="relative w-full max-w-lg md:max-w-2xl bg-[#17171C] shadow-2xl h-full flex flex-col border-l border-zinc-800 animate-fadeIn z-10">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-[#121216] text-white select-none">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {isActive ? (
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
                </span>
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-500"></span>
              )}
              <h3 className="font-extrabold text-sm md:text-base uppercase tracking-wider truncate text-[#ECEEF0]">
                {draftName}
              </h3>
            </div>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
              Pemilik: {draftOwner} | ID: {draftId}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!isActive && onPlayVideo && (
              <button
                onClick={onPlayVideo}
                className="flex items-center gap-1 bg-emerald-650 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-[10px] font-extrabold transition-all border border-emerald-500/20 uppercase tracking-wider cursor-pointer"
              >
                <span className="material-symbols-outlined text-xs font-bold">play_circle</span>
                Putar Rekaman
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
              title="Tutup Panel"
            >
              <span className="material-symbols-outlined font-bold text-lg">close</span>
            </button>
          </div>
        </div>

        {/* Terminal Body */}
        <div className="flex-grow overflow-y-auto px-6 py-5 font-mono text-[10px] md:text-xs leading-relaxed space-y-2 bg-[#17171C] text-zinc-300 scrollbar-thin">
          <div className="text-zinc-600 select-none pb-2 border-b border-zinc-900/60 mb-2 italic">
            --- AWAL LOG TRANSAKSI ({isActive ? "SESI RUNNING LIVE" : "SESI SELESAI"}) ---
          </div>

          {logs.length === 0 ? (
            <div className="text-zinc-500 italic py-10 text-center select-none">
              {isActive
                ? "Menghubungkan ke logs stream... Menunggu baris baru."
                : "Tidak ada data riwayat log yang tersimpan."}
            </div>
          ) : (
            logs.map((log, idx) => {
              const time = new Date(log.timestamp).toLocaleTimeString("id-ID");
              const style = getLogStyle(log.status);

              return (
                <div key={idx} className={`flex items-start gap-1.5 ${style} animate-fadeIn`}>
                  <span className="text-zinc-600 shrink-0 select-none">[{time}]</span>
                  <span className="font-extrabold shrink-0 select-none">
                    {log.status === "error"
                      ? "❌ [ERR]"
                      : log.status === "success"
                        ? "✅ [OK]"
                        : log.status === "warn"
                          ? "⚠️ [WRN]"
                          : "ℹ️ [MSG]"}
                  </span>
                  <span className="break-all">{log.text}</span>
                </div>
              );
            })
          )}

          <div ref={terminalEndRef} />
        </div>

        {/* Terminal Footer */}
        <div className="px-6 py-3 border-t border-zinc-850 bg-[#121216] flex items-center justify-between text-[10px] text-zinc-500 font-bold uppercase select-none">
          <span>NIB Assistant Console v1.0</span>
          {isActive && (
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold animate-pulse">
              <span className="material-symbols-outlined text-xs">radio_button_checked</span>
              STREAMING LIVE...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
