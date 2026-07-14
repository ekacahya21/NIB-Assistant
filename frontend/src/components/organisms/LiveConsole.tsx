"use client";

import React, { useState, useEffect, useRef } from "react";

export interface LogMessage {
  time: string;
  type: "info" | "success" | "warn" | "error";
  text: string;
}

interface LiveConsoleProps {
  logs: LogMessage[];
  title?: string;
  defaultOpen?: boolean;
}

export default function LiveConsole({
  logs,
  title = "[ Developer Mode ] Log Teknis Bot",
  defaultOpen = false,
}: LiveConsoleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of terminal when logs are updated
  useEffect(() => {
    if (isOpen && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isOpen]);

  return (
    <div className="border border-border-light rounded-lg overflow-hidden bg-white">
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container transition-all cursor-pointer"
      >
        <span>{title}</span>
        <span
          className="material-symbols-outlined text-lg transition-transform duration-200"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          expand_more
        </span>
      </button>

      {isOpen && (
        <div className="bg-[#1E1E1E] text-[#D4D4D4] font-mono text-[11px] p-4 h-48 overflow-y-auto border-t border-[#333] scrollbar-thin">
          {logs.length === 0 ? (
            <div className="text-outline italic">Mendengarkan output terminal...</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="flex gap-2 mb-1 min-w-0">
                <span className="text-[#569CD6] shrink-0">[{log.time}]</span>
                <span
                  className={`break-all ${
                    log.type === "success"
                      ? "text-[#4EC9B0]"
                      : log.type === "warn"
                        ? "text-[#DCDCAA]"
                        : log.type === "error"
                          ? "text-[#F48771]"
                          : ""
                  }`}
                >
                  {log.text}
                </span>
              </div>
            ))
          )}
          <div ref={consoleEndRef} />
        </div>
      )}
    </div>
  );
}
