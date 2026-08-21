"use client";

import React, { useState, useRef, ChangeEvent, DragEvent } from "react";

export interface KtpExtractionResult {
  nik?: string;
  namaPemilik?: string;
  tempatLahir?: string;
  tanggalLahir?: string;
  jenisKelamin?: "Laki-laki" | "Perempuan";
  alamatKtp?: string;
  rtRw?: string;
  kelurahanKtp?: string;
  kecamatanKtp?: string;
  kotaKabupatenKtp?: string;
  provinsiKtp?: string;
  agama?: string;
  statusPerkawinan?: string;
  pekerjaan?: string;
  confidence?: number;
}

interface KtpUploaderProps {
  apiUrl: string;
  onExtracted: (data: KtpExtractionResult) => void;
}

export default function KtpUploader({ apiUrl, onExtracted }: KtpUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processKtpFile(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processKtpFile(file);
    }
  };

  const processKtpFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Harap pilih file gambar (JPG, PNG, atau WEBP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Ukuran gambar maksimal 5MB.");
      return;
    }

    // Set preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setErrorMessage(null);
    setIsSuccess(false);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${apiUrl}/api/ktp/extract`, {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal mengekstrak data dari foto KTP.");
      }

      setIsSuccess(true);
      onExtracted(json.data);
    } catch (err: any) {
      setErrorMessage(
        err.message ||
          "Foto KTP tidak terbaca jelas. Pastikan foto terang, tidak blur, dan memuat seluruh bagian KTP."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setPreviewUrl(null);
    setErrorMessage(null);
    setIsSuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="bg-gradient-to-r from-primary-container/5 via-primary-container/10 to-primary-container/5 border border-primary-container/20 rounded-xl p-4 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary-container text-xl">
            badge
          </span>
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-on-surface">
              Isi Otomatis dengan Foto KTP (AI Vision)
            </h3>
            <p className="text-[11px] text-on-surface-variant">
              Unggah atau foto KTP untuk mengisi data identitas & alamat secara instan.
            </p>
          </div>
        </div>

        {isSuccess && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span className="material-symbols-outlined text-xs">check_circle</span>
            Data KTP Terisi
          </span>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg,image/png,image/webp,image/jpg"
        className="hidden"
      />

      {!previewUrl ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
            isDragging
              ? "border-primary-container bg-primary-container/10"
              : "border-border-light hover:border-primary-container bg-white/70 hover:bg-white"
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-primary-container/10 flex items-center justify-center text-primary-container">
            <span className="material-symbols-outlined text-2xl">add_photo_alternate</span>
          </div>
          <div>
            <p className="text-xs font-bold text-on-surface">
              Klik untuk unggah foto KTP atau seret gambar ke sini
            </p>
            <p className="text-[10px] text-on-surface-variant mt-0.5">
              Format JPG, PNG, atau WEBP (Maksimal 5MB)
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg p-3 border border-border-light flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-28 h-20 rounded overflow-hidden border border-border-light flex-shrink-0 bg-surface-container-low">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Preview KTP"
              className="w-full h-full object-cover"
            />
            {isLoading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="material-symbols-outlined text-white animate-spin text-xl">
                  progress_activity
                </span>
              </div>
            )}
          </div>

          <div className="flex-grow text-center sm:text-left">
            {isLoading ? (
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <span className="material-symbols-outlined text-primary-container animate-spin text-sm">
                  autorenew
                </span>
                <span className="text-xs font-bold text-primary-container">
                  Menganalisis dan mengekstrak data KTP dengan AI Vision...
                </span>
              </div>
            ) : isSuccess ? (
              <div>
                <p className="text-xs font-extrabold text-emerald-700 flex items-center justify-center sm:justify-start gap-1">
                  <span className="material-symbols-outlined text-sm">task_alt</span>
                  Data KTP berhasil diekstrak ke formulir!
                </p>
                <p className="text-[10px] text-on-surface-variant mt-0.5">
                  Silakan periksa kembali kecocokan data di bawah sebelum melanjutkan.
                </p>
              </div>
            ) : errorMessage ? (
              <div>
                <p className="text-xs font-bold text-error flex items-center justify-center sm:justify-start gap-1">
                  <span className="material-symbols-outlined text-sm">error</span>
                  Gagal Membaca KTP
                </p>
                <p className="text-[10px] text-error mt-0.5">{errorMessage}</p>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded text-[11px] font-bold border border-border-light bg-surface-container-low hover:bg-white text-on-surface transition-all cursor-pointer disabled:opacity-50"
            >
              Ganti Foto
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={handleReset}
              className="p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-error/10 transition-all cursor-pointer disabled:opacity-50"
              title="Hapus foto"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>
      )}

      {errorMessage && !previewUrl && (
        <div className="mt-2.5 p-2.5 rounded bg-error/10 border border-error/20 flex items-center gap-2 text-error text-[11px] font-semibold">
          <span className="material-symbols-outlined text-sm">error</span>
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
