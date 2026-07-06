import type { PreTrade } from "../../drizzle/schema";
import type { ChatMessage } from "./providers/types";
import { type Candle, fetchCandles } from "../_core/coinank";

// Same soft cap as the review agent's kline block. Overflow strategy is
// different here: (1) drop volume column; (2) shrink furthest context tf;
// (3) drop context tf entries from the highest-tf end. Primary tf candles
// are never dropped.
const KLINE_SECTION_CHAR_CAP = 12_000;

interface BuildOptions {
  preTrade: PreTrade;
}

export interface TimeframeFetch {
  tf: string;
  candleCount: number;
  isPrimary: boolean;
  candles: Candle[];
  error?: string;
}

/**
 * Builds the first two messages of a pre-trade conversation: a decision-buddy
 * system prompt plus a user-shaped brief that carries the trader's idea and
 * multi-timeframe K-line context with the primary timeframe explicitly
 * flagged.
 */
export async function buildInitialMessages({
  preTrade,
}: BuildOptions): Promise<{ system: ChatMessage; user: ChatMessage }> {
  const anchorMs = preTrade.anchorMs ?? Date.now();
  const fetched = await fetchAllTimeframes(preTrade, anchorMs);

  return {
    system: { role: "system", content: SYSTEM_PROMPT },
    user: {
      role: "user",
      content: renderUserContext({ preTrade, anchorMs, fetched }),
    },
  };
}

async function fetchAllTimeframes(
  preTrade: PreTrade,
  anchorMs: number
): Promise<TimeframeFetch[]> {
  const jobs: Array<{ tf: string; candleCount: number; isPrimary: boolean }> = [
    {
      tf: preTrade.primaryTimeFrame,
      candleCount: preTrade.primaryCandleCount,
      isPrimary: true,
    },
    ...preTrade.contextTimeframes.map(entry => ({
      tf: entry.tf,
      candleCount: entry.candleCount,
      isPrimary: false,
    })),
  ];

  const results = await Promise.allSettled(
    jobs.map(job =>
      fetchCandles({
        tradingPair: preTrade.tradingPair,
        timeFrame: job.tf,
        anchor: anchorMs,
        side: "to",
        size: job.candleCount,
      })
    )
  );

  return jobs.map((job, index) => {
    const result = results[index];
    if (result.status === "fulfilled") {
      return { ...job, candles: result.value };
    }
    const reason =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
    console.warn(
      `[preTradeContextBuilder] kline fetch failed for ${job.tf}`,
      reason
    );
    return { ...job, candles: [], error: reason };
  });
}

const SYSTEM_PROMPT = `你是一名谨慎的加密货币交易前决策搭子。
用户还没下单，你的任务是在他扣扳机之前把这笔交易的想法拆开看清楚：
- 主交易时间框架（primary tf）与其它辅助时间框架是否互相印证；
- 入场、止损、止盈的位置在结构上是否有依据；
- 有没有被用户忽略的关键信号、资金费率、宏观事件；
- 仓位假设与账户实际风险承受是否匹配；
- 如果他现在就下单，最有可能被打脸的是哪一点。

回答规则：
1. 始终使用中文。
2. 明确以 primary 时间框架为主视角，其它 tf 作为对齐/背离参考。
3. 用具体数字、具体价位、具体时间点说话，不要空泛建议。
4. 给出 1 条最尖锐的反问（"如果 X 反转，你会怎么办？"）而不是堆结论。
5. 如果信息不足，直接说"我不知道，需要 X 才能判断"，不要瞎猜。`;

interface RenderInput {
  preTrade: PreTrade;
  anchorMs: number;
  fetched: TimeframeFetch[];
}

function renderUserContext({
  preTrade,
  anchorMs,
  fetched,
}: RenderInput): string {
  const decimals = pricePrecision(fetched);
  const header = renderHeader(preTrade, anchorMs, fetched);
  const idea = renderIdea(preTrade);
  const kline = renderKlineSectionsWithCap(fetched, decimals);
  const tail = [
    "",
    "请先站在 primary 时间框架视角给出 3-5 句结构化初评（结构是否成立 / 风险敞口是否合理 / 关键的反问），然后再展开细节。",
  ].join("\n");

  return [header, idea, kline, tail].join("\n");
}

function renderHeader(
  preTrade: PreTrade,
  anchorMs: number,
  fetched: TimeframeFetch[]
): string {
  const lines: string[] = [];
  lines.push(`# 交易前 brief · ${preTrade.tradingPair}`);
  lines.push("");
  lines.push("## 交易基本信息");
  lines.push(`- 交易对：${preTrade.tradingPair}`);
  lines.push(`- 声明方向：${preTrade.direction ?? "未指定（探索性讨论）"}`);
  lines.push(`- 锚点时间：${fmtTime(anchorMs)}（K 线窗口结束点）`);
  lines.push("");
  lines.push("## 时间框架（注意 primary 是主交易框架）");
  for (const fetch of fetched) {
    const tag = fetch.isPrimary ? "primary ← 主交易框架" : "context";
    const status = fetch.error
      ? `unavailable · ${fetch.error}`
      : `${fetch.candles.length} 根`;
    lines.push(
      `- ${fetch.tf}（${tag}）· 请求 ${fetch.candleCount} 根 · 实际 ${status}`
    );
  }
  return lines.join("\n");
}

function renderIdea(preTrade: PreTrade): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("## 交易者当前的想法（原文）");
  const trimmed = preTrade.idea.trim();
  if (trimmed) {
    for (const line of trimmed.split("\n")) {
      lines.push(`> ${line}`);
    }
  } else {
    lines.push("> （未填写）");
  }
  return lines.join("\n");
}

function renderKlineSectionsWithCap(
  fetched: TimeframeFetch[],
  decimals: number
): string {
  let includeVolume = true;
  let contextDropIndex = fetched.length;

  const rendered = () =>
    renderKlineBlocks(fetched, decimals, includeVolume, contextDropIndex);

  if (rendered().length <= KLINE_SECTION_CHAR_CAP) return rendered();

  includeVolume = false;
  if (rendered().length <= KLINE_SECTION_CHAR_CAP) return rendered();

  // Drop context tfs from the tail (highest index first, i.e. the ones the
  // user added last / are least central). Primary always stays.
  const primaryEndIndex = fetched.findIndex(f => !f.isPrimary);
  const firstContextIndex =
    primaryEndIndex === -1 ? fetched.length : primaryEndIndex;
  while (contextDropIndex > firstContextIndex) {
    contextDropIndex -= 1;
    const attempt = renderKlineBlocks(
      fetched,
      decimals,
      includeVolume,
      contextDropIndex
    );
    if (attempt.length <= KLINE_SECTION_CHAR_CAP) {
      console.warn(
        `[preTradeContextBuilder] dropped ${fetched.length - contextDropIndex} context tf(s) to fit ${KLINE_SECTION_CHAR_CAP}-char cap`
      );
      return attempt;
    }
  }

  console.warn(
    `[preTradeContextBuilder] payload still exceeds ${KLINE_SECTION_CHAR_CAP} after all degradation; shipping primary only`
  );
  return renderKlineBlocks(fetched, decimals, includeVolume, contextDropIndex);
}

function renderKlineBlocks(
  fetched: TimeframeFetch[],
  decimals: number,
  includeVolume: boolean,
  keepUntil: number
): string {
  const lines: string[] = [];
  fetched.forEach((fetch, index) => {
    if (!fetch.isPrimary && index >= keepUntil) {
      lines.push("");
      lines.push(
        `## 行情上下文 · K 线（${fetch.tf}）· context（已省略以节省上下文空间）`
      );
      return;
    }
    lines.push("");
    const roleLabel = fetch.isPrimary ? "primary ← 主交易框架" : "context";
    lines.push(`## 行情上下文 · K 线（${fetch.tf}）· ${roleLabel}`);
    if (fetch.error) {
      lines.push(`> 加载失败：${fetch.error}`);
      return;
    }
    if (fetch.candles.length === 0) {
      lines.push("> 该交易对在此时间段无可用 K 线数据。");
      return;
    }
    const cols = includeVolume ? "[t,o,h,l,c,v]" : "[t,o,h,l,c]";
    lines.push(`最新 ${fetch.candles.length} 根 · 列=${cols}`);
    lines.push("```");
    for (const candle of fetch.candles) {
      lines.push(formatCandle(candle, decimals, includeVolume));
    }
    lines.push("```");
  });
  return lines.join("\n");
}

function formatCandle(
  candle: Candle,
  decimals: number,
  includeVolume: boolean
): string {
  const t = formatCandleTime(candle.time);
  const cells: (string | number)[] = [
    JSON.stringify(t),
    fmtPrice(candle.open, decimals),
    fmtPrice(candle.high, decimals),
    fmtPrice(candle.low, decimals),
    fmtPrice(candle.close, decimals),
  ];
  if (includeVolume) {
    cells.push(candle.volume != null ? Number(candle.volume.toFixed(2)) : 0);
  }
  return `[${cells.join(",")}],`;
}

function formatCandleTime(timeSec: number): string {
  return (
    new Date(timeSec * 1000).toISOString().replace("T", " ").slice(0, 16) + "Z"
  );
}

function pricePrecision(fetched: TimeframeFetch[]): number {
  // Use primary tf's latest close to guess a sensible decimal count.
  const primary = fetched.find(f => f.isPrimary);
  const sample = primary?.candles.at(-1)?.close;
  if (sample == null) return 4;
  if (sample >= 1000) return 2;
  if (sample >= 10) return 3;
  if (sample >= 1) return 4;
  if (sample >= 0.01) return 6;
  return 8;
}

function fmtPrice(value: number, decimals: number): string {
  if (decimals === 0) return Math.round(value).toString();
  return value.toFixed(decimals);
}

function fmtTime(ms: number): string {
  const date = new Date(ms);
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export const __testing__ = {
  SYSTEM_PROMPT,
  KLINE_SECTION_CHAR_CAP,
  renderKlineSectionsWithCap,
  renderKlineBlocks,
};
