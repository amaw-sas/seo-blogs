"use client";

import { useSiteContext } from "@/lib/site-context";
import { resolveSiteLabel } from "@/lib/ui/select-helpers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe } from "lucide-react";

export function SiteSelector() {
  const { siteId, setSiteId, sites, loading } = useSiteContext();

  if (loading) return null;

  return (
    <Select
      value={siteId || "all"}
      onValueChange={(v) => setSiteId(!v || v === "all" ? "" : v)}
    >
      <SelectTrigger className="w-[200px] h-8 text-sm">
        <Globe className="size-3.5 mr-1.5 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Todos los sitios">
          {resolveSiteLabel(sites, siteId, "Todos los sitios")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos los sitios</SelectItem>
        {sites.map((site) => (
          <SelectItem key={site.id} value={site.id}>
            {site.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
