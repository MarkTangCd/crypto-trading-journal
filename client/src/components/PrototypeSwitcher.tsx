// PROTOTYPE — throwaway. Floating bottom bar that cycles ?variant= (and the
// prototype's secondary ?screen= / ?state= params) on the current route.
// Hidden in production builds so a stray merge can't ship it.
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";

type Props = {
  variants: { key: string; name: string }[];
  screens?: string[];
  states?: string[];
};

export function usePrototypeParams() {
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    next.set(key, value);
    setLocation(`${location}?${next.toString()}`, { replace: true });
  };
  return { params, set };
}

export function PrototypeSwitcher({ variants, screens, states }: Props) {
  const { params, set } = usePrototypeParams();
  const current = params.get("variant") ?? variants[0].key;
  const index = Math.max(
    0,
    variants.findIndex(v => v.key === current)
  );
  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length];
    set("variant", next.key);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  const pill = (active: boolean) =>
    cn(
      "px-2 py-0.5 text-xs lowercase",
      active ? "bg-white text-black" : "text-white/70 hover:text-white"
    );

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-black text-white px-3 py-2 text-sm shadow-lg font-mono">
      <button type="button" onClick={() => go(-1)} aria-label="previous">
        ←
      </button>
      <span className="font-medium">
        {variants[index].key} ({variants[index].name})
      </span>
      <button type="button" onClick={() => go(1)} aria-label="next">
        →
      </button>
      {screens && (
        <span className="flex items-center gap-1 border-l border-white/30 pl-3">
          {screens.map(s => (
            <button
              key={s}
              type="button"
              className={pill((params.get("screen") ?? screens[0]) === s)}
              onClick={() => set("screen", s)}
            >
              {s}
            </button>
          ))}
        </span>
      )}
      {states && (
        <span className="flex items-center gap-1 border-l border-white/30 pl-3">
          {states.map(s => (
            <button
              key={s}
              type="button"
              className={pill((params.get("state") ?? states[0]) === s)}
              onClick={() => set("state", s)}
            >
              {s}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
