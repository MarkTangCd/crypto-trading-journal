import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
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

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: { color: "#1e222d" },
        horzLines: { color: "#1e222d" },
      },
      width: containerRef.current.clientWidth,
      height: 400,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
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
        color: "#2962FF",
        text: "Entry",
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
