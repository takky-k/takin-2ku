import { create } from "zustand";
export const useUI = create<{
  demo: boolean;
  toggleDemo: () => void;
  error: string;
  setError: (s: string) => void;
}>((set) => ({
  demo: false,
  toggleDemo: () => set((s) => ({ demo: !s.demo })),
  error: "",
  setError: (error) => set({ error }),
}));
