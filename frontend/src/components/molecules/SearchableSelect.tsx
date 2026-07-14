"use client";

import { useState, useEffect, useRef } from "react";

interface SearchableSelectProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      opt.value.toLowerCase().includes(search.toLowerCase())
  );

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={dropdownRef} className="relative w-full select-none">
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full min-h-[48px] px-3.5 py-3 rounded border border-border-light bg-white text-xs font-bold text-on-surface flex items-center justify-between transition-all ${
          disabled
            ? "opacity-50 bg-surface-container cursor-not-allowed"
            : "cursor-pointer focus:border-primary-container focus:outline-none shadow-xs hover:border-border-medium"
        }`}
      >
        <span
          className={
            value
              ? "text-on-surface truncate pr-2"
              : "text-on-surface-variant/50 truncate pr-2 font-medium"
          }
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="material-symbols-outlined text-base text-on-surface-variant/70 shrink-0">
          {isOpen ? "arrow_drop_up" : "arrow_drop_down"}
        </span>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1.5 bg-white border border-border-light rounded shadow-lg max-h-60 flex flex-col overflow-hidden animate-fadeIn">
          <div className="p-2 border-b border-border-light bg-surface-container-low flex items-center gap-1.5 shrink-0">
            <span className="material-symbols-outlined text-base text-on-surface-variant/70">
              search
            </span>
            <input
              type="text"
              placeholder="Cari..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs font-bold focus:outline-none text-on-surface"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-48 divide-y divide-border-light/40">
            {filteredOptions.length === 0 ? (
              <div className="px-3.5 py-2.5 text-xs text-on-surface-variant/60 italic text-center">
                Tidak ada hasil ditemukan
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`px-3.5 py-2.5 text-xs font-semibold cursor-pointer transition-all hover:bg-primary/5 hover:text-primary ${
                    opt.value === value
                      ? "bg-primary/10 text-primary font-bold"
                      : "text-on-surface"
                  }`}
                >
                  {opt.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
