"use client";

import { useEffect, useRef, useState } from "react";

interface LeafletMapProps {
  latitude: string;
  longitude: string;
  onChange: (latitude: string, longitude: string) => void;
  isMobile?: boolean;
}

export default function LeafletMap({
  latitude,
  longitude,
  onChange,
  isMobile = false,
}: LeafletMapProps) {
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Load Leaflet resources dynamically on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ((window as any).L) {
      setLeafletLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => {
      setLeafletLoaded(true);
    };
    document.head.appendChild(script);
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!leafletLoaded || !containerRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    const lat = parseFloat(latitude) || -6.2088;
    const lng = parseFloat(longitude) || 106.8456;

    const customIcon = L.divIcon({
      className: "custom-leaflet-pin",
      html: `<span class="material-symbols-outlined text-primary text-3xl" style="transform: translate(-14px, -28px); filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.3)); position: absolute; font-weight: bold; pointer-events: none;">pin_drop</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });

    if (!mapRef.current) {
      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: !isMobile, // Disable on mobile to prevent scrolling
      }).setView([lat, lng], 14);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      const marker = L.marker([lat, lng], { draggable: true, icon: customIcon }).addTo(map);
      markerRef.current = marker;

      marker.on("dragend", () => {
        const position = marker.getLatLng();
        onChange(position.lat.toFixed(6), position.lng.toFixed(6));
      });

      map.on("click", (e: any) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        marker.setLatLng([clickLat, clickLng]);
        onChange(clickLat.toFixed(6), clickLng.toFixed(6));
      });

      mapRef.current = map;
    } else {
      const map = mapRef.current;
      const marker = markerRef.current;
      if (map && marker) {
        const currentPos = marker.getLatLng();
        if (Math.abs(currentPos.lat - lat) > 0.0001 || Math.abs(currentPos.lng - lng) > 0.0001) {
          marker.setLatLng([lat, lng]);
          map.setView([lat, lng], map.getZoom());
        }
      }
    }

    // Trigger map invalidation to correct size issues inside modal / container
    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [leafletLoaded, latitude, longitude, isMobile, onChange]);

  return (
    <div className="relative w-full h-full min-h-[200px]">
      {!leafletLoaded && (
        <div className="absolute inset-0 bg-[#ECEEF0] flex flex-col items-center justify-center gap-2 z-10">
          <span className="material-symbols-outlined text-outline animate-spin text-2xl">sync</span>
          <p className="text-[10px] text-on-surface-variant font-bold">Memuat Peta...</p>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
