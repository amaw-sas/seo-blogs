"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

interface SiteInfo {
  id: string;
  name: string;
  domain: string;
}

interface SiteContextValue {
  siteId: string;
  setSiteId: (id: string) => void;
  sites: SiteInfo[];
  loading: boolean;
}

const SiteContext = createContext<SiteContextValue | null>(null);

const STORAGE_KEY = "selectedSiteId";

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [siteId, setSiteIdState] = useState("");
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setSiteIdState(stored);
  }, []);

  useEffect(() => {
    async function fetchSites() {
      try {
        const res = await fetch("/api/sites");
        if (res.ok) {
          const data = await res.json();
          setSites(data.map((s: SiteInfo) => ({ id: s.id, name: s.name, domain: s.domain })));
        }
      } finally {
        setLoading(false);
      }
    }
    fetchSites();
  }, []);

  const setSiteId = useCallback((id: string) => {
    setSiteIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return (
    <SiteContext.Provider value={{ siteId, setSiteId, sites, loading }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSiteContext() {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSiteContext must be used within SiteProvider");
  return ctx;
}
