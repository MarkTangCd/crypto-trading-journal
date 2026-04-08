import type { CandlestickData } from "lightweight-charts";

/**
 * Linear Congruential Generator (LCG) for deterministic pseudo-random numbers
 * Uses a fixed seed to ensure the same sequence every time
 */
function createLCG(seed: number) {
  return function lcg(): number {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/**
 * Generate deterministic mock OHLC candlestick data
 * Uses LCG with fixed seed to produce identical output on every call
 *
 * @param count - Number of candles to generate (default: 80)
 * @param basePrice - Starting price (default: 42000 for BTC-like prices)
 * @param startDate - Starting date string (default: '2024-01-01')
 * @returns Array of CandlestickData with time in 'YYYY-MM-DD' format
 */
export function generateMockCandles(
  count: number = 80,
  basePrice: number = 42000,
  startDate: string = "2024-01-01"
): CandlestickData<string>[] {
  const lcg = createLCG(12345); // Fixed seed for determinism
  const candles: CandlestickData<string>[] = [];

  // Parse start date
  const start = new Date(startDate);

  let previousClose = basePrice;

  for (let i = 0; i < count; i++) {
    // Generate random walk for this candle
    const volatility = 0.015; // 1.5% daily volatility
    const trend = 0.0002; // Slight upward bias

    // Random walk for close price
    const randomChange = (lcg() - 0.5) * 2 * volatility + trend;
    const close = previousClose * (1 + randomChange);

    // Generate open, high, low based on close and previous close
    const open = previousClose;

    // High should be the maximum of open/close plus a random wick
    const wickUp = lcg() * volatility * close;
    const high = Math.max(open, close) + wickUp;

    // Low should be the minimum of open/close minus a random wick
    const wickDown = lcg() * volatility * close;
    const low = Math.min(open, close) - wickDown;

    // Ensure high >= max(open, close) and low <= min(open, close)
    const validatedHigh = Math.max(open, close, high);
    const validatedLow = Math.min(open, close, low);

    // Calculate current date
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    const time = currentDate.toISOString().split("T")[0]; // 'YYYY-MM-DD'

    candles.push({
      time,
      open: Math.round(open * 100) / 100, // Round to 2 decimal places
      high: Math.round(validatedHigh * 100) / 100,
      low: Math.round(validatedLow * 100) / 100,
      close: Math.round(close * 100) / 100,
    });

    previousClose = close;
  }

  return candles;
}

/**
 * Pre-generated mock candle data for immediate use
 * Contains 80 candles of BTC/USDT-like price data
 */
export const MOCK_CANDLE_DATA: CandlestickData<string>[] =
  generateMockCandles(80);
