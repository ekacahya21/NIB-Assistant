import React from "react";

interface StatusBadgeProps {
  status: string;
  stepDetails?: string;
}

const SUBSTEP_LABELS: Record<string, string> = {
  LOCATION: "Lokasi Usaha",
  KBLI: "KBLI",
  TATA_RUANG: "Tata Ruang",
  INVESTASI: "Investasi & Produk",
  PARAMETER: "Parameter Risiko",
  LINGKUNGAN: "Persetujuan Lingkungan",
  AMDALNET: "AMDALnet",
  NIB: "Penerbitan NIB",
};

export default function StatusBadge({ status, stepDetails }: StatusBadgeProps) {
  let colorClasses = "bg-tertiary/5 border-tertiary/20 text-tertiary";
  let displayText = status;

  if (status === "Sukses" || status === "COMPLETED") {
    colorClasses = "bg-success/5 border-success/20 text-success";
    displayText = "Sukses";
  } else if (status === "Proses" || status === "RUNNING") {
    colorClasses = "bg-primary/5 border-primary/20 text-primary";
    displayText = "Proses";
  } else if (status === "Butuh OTP") {
    colorClasses = "bg-warning/5 border-warning/20 text-warning";
    displayText = "Butuh OTP";
  } else if (status.startsWith("FAILED_SUBSTEP_")) {
    colorClasses = "bg-error/5 border-error/20 text-error";
    const subStepKey = status.replace("FAILED_SUBSTEP_", "");
    const label = SUBSTEP_LABELS[subStepKey] || subStepKey;
    displayText = `Gagal (${label})`;
  } else if (status.startsWith("FAILED") || status === "Gagal") {
    colorClasses = "bg-error/5 border-error/20 text-error";
    displayText = status === "Gagal" ? "Gagal" : status;
  }

  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border shrink-0 ${colorClasses}`}
    >
      {displayText}{stepDetails ? ` (${stepDetails})` : ""}
    </span>
  );
}
