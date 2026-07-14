import React from "react";

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  let colorClasses = "bg-tertiary/5 border-tertiary/20 text-tertiary";

  switch (status) {
    case "Sukses":
      colorClasses = "bg-success/5 border-success/20 text-success";
      break;
    case "Gagal":
      colorClasses = "bg-error/5 border-error/20 text-error";
      break;
    case "Butuh OTP":
      colorClasses = "bg-warning/5 border-warning/20 text-warning";
      break;
    case "Proses":
      colorClasses = "bg-primary/5 border-primary/20 text-primary";
      break;
  }

  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border shrink-0 ${colorClasses}`}
    >
      {status}
    </span>
  );
}
