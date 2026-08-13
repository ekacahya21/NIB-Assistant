import React from "react";

interface StatusBadgeProps {
  status: string;
  stepDetails?: string;
}

export default function StatusBadge({ status, stepDetails }: StatusBadgeProps) {
  let colorClasses = "bg-tertiary/5 border-tertiary/20 text-tertiary";

  if (status === "Sukses") {
    colorClasses = "bg-success/5 border-success/20 text-success";
  } else if (status === "Proses") {
    colorClasses = "bg-primary/5 border-primary/20 text-primary";
  } else if (status === "Butuh OTP") {
    colorClasses = "bg-warning/5 border-warning/20 text-warning";
  } else if (status === "Gagal" || status.startsWith("Gagal")) {
    colorClasses = "bg-error/5 border-error/20 text-error";
  }

  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border shrink-0 ${colorClasses}`}
    >
      {status}{stepDetails ? ` (${stepDetails})` : ""}
    </span>
  );
}
