"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarPost {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  published: "bg-green-500",
  review: "bg-blue-500",
  error: "bg-red-500",
  draft: "bg-gray-400",
  archived: "bg-gray-400",
};

const STATUS_BADGE_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive"
> = {
  published: "default",
  review: "secondary",
  error: "destructive",
  draft: "secondary",
  archived: "secondary",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  review: "Programado",
  published: "Publicado",
  error: "Error",
  archived: "Archivado",
};

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface HolidayInfo {
  date: string;
  name: string;
}

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [holidays, setHolidays] = useState<HolidayInfo[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const dateFrom = new Date(year, month, 1).toISOString();
    const dateTo = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    try {
      const res = await fetch(
        `/api/posts?dateFrom=${dateFrom}&dateTo=${dateTo}&limit=100`,
      );
      if (res.ok) {
        const json = await res.json();
        setPosts(json.data ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const fetchHolidays = useCallback(async () => {
    try {
      const dateFrom = new Date(year, month, 1).toISOString().split("T")[0];
      const dateTo = new Date(year, month + 1, 0).toISOString().split("T")[0];
      const res = await fetch(
        `/api/holidays?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      );
      if (res.ok) {
        const json = await res.json();
        setHolidays(
          (json.data ?? json ?? []).map(
            (h: { date: string; name: string }) => ({
              date: h.date.split("T")[0],
              name: h.name,
            }),
          ),
        );
      }
    } catch {
      setHolidays([]);
    }
  }, [year, month]);

  useEffect(() => {
    fetchPosts();
    fetchHolidays();
  }, [fetchPosts, fetchHolidays]);

  // Build date → posts map
  const postsByDay = useMemo(() => {
    const map: Record<string, CalendarPost[]> = {};
    for (const p of posts) {
      const raw = p.scheduledAt ?? p.publishedAt ?? p.createdAt;
      const d = new Date(raw);
      const key = dateKey(d);
      (map[key] ??= []).push(p);
    }
    return map;
  }, [posts]);

  const holidaysByDay = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const h of holidays) {
      (map[h.date] ??= []).push(h.name);
    }
    return map;
  }, [holidays]);

  // Calendar grid computation
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const startDow = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const totalDays = lastOfMonth.getDate();
  const totalCells = Math.ceil((startDow + totalDays) / 7) * 7;

  const cells: { day: number | null; key: string; isToday: boolean }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startDow + 1;
    if (dayNum < 1 || dayNum > totalDays) {
      cells.push({ day: null, key: `empty-${i}`, isToday: false });
    } else {
      const d = new Date(year, month, dayNum);
      const key = dateKey(d);
      const isToday = key === dateKey(today);
      cells.push({ day: dayNum, key, isToday });
    }
  }

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
    setSelectedDay(null);
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
    setSelectedDay(null);
  }

  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDay(null);
  }

  const selectedPosts = selectedDay ? postsByDay[selectedDay] ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">
          Calendario de contenido
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[160px] text-center text-sm font-medium">
            {MONTHS[month]} {year}
          </span>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Hoy
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-2 sm:p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground mb-1">
            {DAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px rounded-lg bg-border overflow-hidden">
            {cells.map((cell) => {
              const dayPosts = cell.day ? postsByDay[cell.key] ?? [] : [];
              const dayHolidays = cell.day
                ? holidaysByDay[cell.key] ?? []
                : [];
              const isSelected = selectedDay === cell.key;

              return (
                <button
                  key={cell.key}
                  disabled={!cell.day}
                  onClick={() =>
                    cell.day && setSelectedDay(isSelected ? null : cell.key)
                  }
                  className={`
                    relative min-h-[72px] sm:min-h-[90px] bg-card p-1 sm:p-2 text-left transition-colors
                    ${cell.day ? "hover:bg-accent/50 cursor-pointer" : "bg-muted/30 cursor-default"}
                    ${isSelected ? "ring-2 ring-primary ring-inset" : ""}
                    ${cell.isToday ? "bg-primary/5" : ""}
                  `}
                >
                  {cell.day && (
                    <>
                      <span
                        className={`text-xs font-medium ${
                          cell.isToday
                            ? "flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {cell.day}
                      </span>
                      {dayHolidays.length > 0 && (
                        <div
                          className="mt-0.5 truncate text-[10px] text-amber-600 dark:text-amber-400"
                          title={dayHolidays.join(", ")}
                        >
                          🎉 {dayHolidays[0]}
                        </div>
                      )}
                      {dayPosts.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {dayPosts.slice(0, 4).map((p) => (
                            <span
                              key={p.id}
                              className={`inline-block size-2.5 rounded-full ${STATUS_COLOR[p.status] ?? "bg-gray-400"}`}
                              title={`${p.title} (${STATUS_LABEL[p.status] ?? p.status})`}
                            />
                          ))}
                          {dayPosts.length > 4 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{dayPosts.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full bg-green-500" />{" "}
              Publicado
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full bg-blue-500" />{" "}
              Programado
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full bg-red-500" />{" "}
              Error
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full bg-gray-400" />{" "}
              Borrador
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Selected day detail */}
      {selectedDay && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Posts del{" "}
              {new Date(selectedDay + "T12:00:00").toLocaleDateString("es-ES", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : selectedPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay posts para este día.
              </p>
            ) : (
              <ul className="space-y-2">
                {selectedPosts.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-md border p-2"
                  >
                    <a
                      href={`/posts/${p.id}/edit`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {p.title}
                    </a>
                    <Badge variant={STATUS_BADGE_VARIANT[p.status] ?? "secondary"}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
