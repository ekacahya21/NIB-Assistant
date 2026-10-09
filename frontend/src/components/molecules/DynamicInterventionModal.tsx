"use client";

import { useState, useEffect } from "react";

export interface DynamicPromptConfig {
  promptId: string;
  promptType: "confirm" | "text" | "select" | "number";
  title: string;
  message: string;
  options?: string[];
  defaultValue?: string;
  fieldKey?: string;
}

interface DynamicInterventionModalProps {
  isOpen: boolean;
  config: DynamicPromptConfig | null;
  isSubmitting: boolean;
  onSubmit: (value: any) => void;
  onCancel?: () => void;
}

export default function DynamicInterventionModal({
  isOpen,
  config,
  isSubmitting,
  onSubmit,
  onCancel,
}: DynamicInterventionModalProps) {
  const [inputValue, setInputValue] = useState<string>("");
  const [selectedOption, setSelectedOption] = useState<string>("");

  useEffect(() => {
    if (config) {
      setInputValue(config.defaultValue || "");
      setSelectedOption(config.defaultValue || config.options?.[0] || "");
    }
  }, [config]);

  if (!isOpen || !config) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (config.promptType === "confirm") {
      onSubmit("Ya, Lanjutkan");
    } else if (config.promptType === "select") {
      onSubmit(selectedOption);
    } else {
      onSubmit(inputValue);
    }
  };

  const handleRejectConfirm = () => {
    if (onCancel) {
      onCancel();
    } else {
      onSubmit("Batal");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden transform transition-all">
        {/* Header with AI Vision / Warning Badge */}
        <div className="px-6 pt-6 pb-4 bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-transparent border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center font-bold text-lg shadow-sm">
              🤖
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-100 rounded-md">
                  Intervensi Diperlukan
                </span>
                <span className="text-xs text-slate-400 font-mono">Self-Healing AI</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                {config.title || "Perlu Konfirmasi Anda"}
              </h3>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200/60">
            {config.message}
          </p>

          {/* Form Controls based on promptType */}
          {config.promptType === "confirm" && (
            <div className="pt-2 text-xs text-slate-500 italic">
              Portal OSS membutuhkan persetujuan tindakan hukum/administrasi di atas sebelum bot dapat melanjutkan pendaftaran.
            </div>
          )}

          {config.promptType === "select" && config.options && config.options.length > 0 && (
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Pilih Opsi yang Tepat:
              </label>
              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                {config.options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedOption(opt)}
                    className={`text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                      selectedOption === opt
                        ? "border-emerald-500 bg-emerald-50/70 text-emerald-900 shadow-sm ring-1 ring-emerald-500"
                        : "border-slate-200 hover:border-slate-300 text-slate-700 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{opt}</span>
                      {selectedOption === opt && (
                        <span className="text-emerald-600 font-bold">✓</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(config.promptType === "text" || config.promptType === "number") && (
            <form onSubmit={handleSubmit} className="space-y-2 pt-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Masukkan Data:
              </label>
              <input
                type={config.promptType === "number" ? "number" : "text"}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoFocus
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-800 text-sm shadow-sm"
                placeholder="Ketik di sini..."
              />
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          {config.promptType === "confirm" ? (
            <>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleRejectConfirm}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Tolak / Batal
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSubmit()}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Memproses...</span>
                  </>
                ) : (
                  <span>Ya, Lanjutkan</span>
                )}
              </button>
            </>
          ) : (
            <>
              {onCancel && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={onCancel}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
              )}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSubmit()}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Mengirim...</span>
                  </>
                ) : (
                  <span>Kirim Jawaban</span>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
