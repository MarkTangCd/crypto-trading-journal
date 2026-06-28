import { trpc } from "@/lib/trpc";
import { TIME_FRAMES, type TimeFrame } from "@shared/const";
import { useEffect, useState } from "react";

const PAIR_DEBOUNCE_MS = 500;

const PAIR_RE = /^[A-Z0-9]{4,20}$/;

function isSupportedTimeFrame(value: string): value is TimeFrame {
  return (TIME_FRAMES as readonly string[]).includes(value);
}

interface Params {
  tradingPair: string;
  timeFrame: string;
}

// Debounces the trading-pair input so we don't fire a kline fetch on every
// keystroke. The timeframe is a select (single click) and is not debounced.
// The query is gated on both fields being present and the pair matching a
// permissive symbol shape, so chart rendering only happens once we know
// what to ask for.
export function useDebouncedKlines({ tradingPair, timeFrame }: Params) {
  const [debouncedPair, setDebouncedPair] = useState(tradingPair);

  useEffect(() => {
    if (debouncedPair === tradingPair) return;
    const timer = setTimeout(
      () => setDebouncedPair(tradingPair),
      PAIR_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [tradingPair, debouncedPair]);

  const pairValid = PAIR_RE.test(debouncedPair);
  const tfValid = isSupportedTimeFrame(timeFrame);
  const enabled = pairValid && tfValid;
  const debouncePending = enabled && debouncedPair !== tradingPair;

  const query = trpc.market.getCandles.useQuery(
    { tradingPair: debouncedPair, timeFrame: tfValid ? timeFrame : "1H" },
    {
      enabled,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    }
  );

  return {
    shouldShow: tradingPair.length > 0 && timeFrame.length > 0,
    isLoading: enabled && (query.isLoading || debouncePending),
    isError: enabled && query.isError,
    error: query.error,
    data: query.data ?? [],
  };
}
