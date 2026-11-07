import { useEffect, useState } from "react";
import type { AppDB } from "./db";
import { localDate } from "./model";
import { refreshSleep } from "./sleep-sync";
export function useAppRefresh(
  db: AppDB,
  updateServiceWorker: () => Promise<void>,
) {
  const [date, setDate] = useState(localDate());
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!active || document.visibilityState === "hidden") return;
      setDate(localDate());
      void refreshSleep(db);
      void updateServiceWorker().catch(() => {});
    };
    const imported = (e: Event) => {
      if ((e as CustomEvent).detail === db.name) refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("takin-sleep-imported", imported);
    const id = setInterval(() => {
      if (localDate() !== date) refresh();
    }, 60000);
    return () => {
      active = false;
      clearInterval(id);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("takin-sleep-imported", imported);
    };
  }, [db.name, date, updateServiceWorker]);
  return date;
}
