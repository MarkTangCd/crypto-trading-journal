import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  LineStyle,
  createSeriesMarkers,
  type CandlestickData,
  type ISeriesApi,
  type IChartApi,
  type MouseEventParams,
  type Time,
  type SeriesMarker,
} from "lightweight-charts";

interface CandlestickChartProps {
  data: CandlestickData<string>[];
  onCandleSelect?: (time: string) => void;
  className?: string;
}

const PLEX_MONO =
  "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// lightweight-charts' parser doesn't accept oklch(). Bounce each CSS variable
// through a 1x1 canvas so the browser resolves it to rgba() before the chart
// consumes it.
function readPalette(): {
  paper: string;
  ink: string;
  mist: string;
  muted: string;
  win: string;
  loss: string;
} {
  const root = getComputedStyle(document.documentElement);
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");

  const resolve = (cssVar: string, fallback: string): string => {
    const raw = root.getPropertyValue(cssVar).trim();
    if (!ctx || !raw) return fallback;
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = fallback;
      ctx.fillStyle = raw;
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      const r = data[0];
      const g = data[1];
      const b = data[2];
      const a = data[3];
      return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
    } catch {
      return fallback;
    }
  };

  return {
    paper: resolve("--paper", "#fcfcfc"),
    ink: resolve("--ink", "#2b2b2b"),
    mist: resolve("--mist", "#e8e8e8"),
    muted: resolve("--muted-foreground", "#5f5f5f"),
    win: resolve("--win", "#3e8a5b"),
    loss: resolve("--loss", "#bc4a2c"),
  };
}

export default function CandlestickChart({
  data,
  onCandleSelect,
  className,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const palette = readPalette();

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: palette.paper },
        textColor: palette.muted,
        fontFamily: PLEX_MONO,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: palette.mist },
        horzLines: { color: palette.mist },
      },
      rightPriceScale: {
        borderColor: palette.mist,
      },
      timeScale: {
        borderColor: palette.mist,
      },
      crosshair: {
        vertLine: {
          color: palette.ink,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: palette.ink,
        },
        horzLine: {
          color: palette.ink,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: palette.ink,
        },
      },
      width: containerRef.current.clientWidth,
      height: 400,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: palette.win,
      downColor: palette.loss,
      borderVisible: true,
      borderUpColor: palette.ink,
      borderDownColor: palette.ink,
      wickUpColor: palette.ink,
      wickDownColor: palette.ink,
    });

    series.setData(data);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    seriesRef.current = series;

    const handleClick = (param: MouseEventParams<Time>) => {
      if (!param.time || !seriesRef.current) return;

      const timeStr = param.time.toString();
      setSelectedTime(timeStr);
      onCandleSelect?.(timeStr);

      const marker: SeriesMarker<Time> = {
        time: param.time,
        position: "belowBar",
        shape: "arrowUp",
        color: palette.ink,
        text: "entry",
      };

      createSeriesMarkers(seriesRef.current, [marker]);
    };

    chart.subscribeClick(handleClick);

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (chartRef.current) {
          chartRef.current.applyOptions({
            width: entry.contentRect.width,
          });
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data, onCandleSelect]);

  return (
    <div
      ref={containerRef}
      data-testid="candlestick-chart-container"
      data-selected-time={selectedTime || ""}
      className={className}
      style={{ width: "100%", height: "400px" }}
    />
  );
}
