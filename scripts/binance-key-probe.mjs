#!/usr/bin/env node
// Usage: node scripts/binance-key-probe.mjs [--testnet] [--write-probe] [--json]
// Needs BINANCE_API_KEY / BINANCE_API_SECRET in .local/binance.env or the environment.
// Read-only probe for a Binance USDⓈ-M futures API key (wayfinder task-48).
//
// Reads BINANCE_API_KEY / BINANCE_API_SECRET from .local/binance.env (or the
// environment), signs HMAC-SHA256 requests, and reports:
//   1. key permissions via GET /sapi/v1/account/apiRestrictions
//   2. whether futures reads work (GET /fapi/v3/balance)
//   3. whether income REALIZED_PNL / COMMISSION rows carry symbol + tradeId
//   4. which order types live openOrders vs openAlgoOrders return
//   5. position mode and the sign of positionAmt per positionSide
//   6. (opt-in, --write-probe) whether POST /fapi/v1/order/test is rejected.
//      Test Order only validates; it never places an order.
//
// Flags: --testnet (demo-fapi host; apiRestrictions is skipped there),
//        --write-probe, --json (machine-readable report on stdout).
// Never prints the secret. Exit code 1 if any required probe failed.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILE = resolve(process.cwd(), ".local", "binance.env");
const args = new Set(process.argv.slice(2));
const TESTNET = args.has("--testnet");
const WRITE_PROBE = args.has("--write-probe");
const JSON_OUT = args.has("--json");

loadEnvFile(ENV_FILE);
const apiKey = process.env.BINANCE_API_KEY ?? "";
const apiSecret = process.env.BINANCE_API_SECRET ?? "";
if (!apiKey || !apiSecret) {
  console.error(`missing BINANCE_API_KEY / BINANCE_API_SECRET (looked in ${ENV_FILE} and env)`);
  process.exit(2);
}

const FAPI = TESTNET ? "https://demo-fapi.binance.com" : "https://fapi.binance.com";
const SAPI = "https://api.binance.com";
const RECV_WINDOW = 5000;

const report = { host: FAPI, testnet: TESTNET, probes: [] };

function loadEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq);
    let value = line.slice(eq + 1);
    if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replaceAll("'\\''", "'");
    } else if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function signed(host, method, path, params = {}) {
  const qs = new URLSearchParams({
    ...params,
    recvWindow: String(RECV_WINDOW),
    timestamp: String(Date.now()),
  });
  const signature = createHmac("sha256", apiSecret).update(qs.toString()).digest("hex");
  qs.append("signature", signature);
  const url = `${host}${path}?${qs.toString()}`;
  let res;
  try {
    res = await fetch(url, { method, headers: { "X-MBX-APIKEY": apiKey } });
  } catch (error) {
    const cause = error?.cause?.code ?? error?.message ?? String(error);
    const hint = process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY ? " (HTTPS_PROXY is set but Node ignores it: run with NODE_USE_ENV_PROXY=1)" : "";
    return { status: 0, ok: false, body: { code: "NETWORK", msg: `${cause}${hint}` }, weight: null };
  }
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, ok: res.ok, body, weight: res.headers.get("x-mbx-used-weight-1m") };
}

function errText(r) {
  const { code, msg } = r.body ?? {};
  return code !== undefined ? `HTTP ${r.status} code ${code}: ${msg}` : `HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`;
}

function record(name, outcome, finding, detail) {
  report.probes.push({ name, outcome, finding, ...(detail !== undefined ? { detail } : {}) });
  if (!JSON_OUT) {
    const tag = { PASS: "✓", FAIL: "✗", INFO: "·", SKIP: "–" }[outcome];
    console.log(`${tag} ${name}: ${finding}`);
    if (detail !== undefined) console.log(`    ${JSON.stringify(detail)}`);
  }
}

// 1. apiRestrictions ------------------------------------------------------
const WRITE_FLAGS = [
  "enableWithdrawals",
  "enableInternalTransfer",
  "enableMargin",
  "enableSpotAndMarginTrading",
  "enableVanillaOptions",
  "enablePortfolioMarginTrading",
  "enableFixApiTrade",
  "permitsUniversalTransfer",
];
if (TESTNET) {
  record("apiRestrictions", "SKIP", "not available on the demo host");
} else {
  const r = await signed(SAPI, "GET", "/sapi/v1/account/apiRestrictions");
  if (!r.ok) {
    record("apiRestrictions", "FAIL", `spot host rejected the key: ${errText(r)}`);
  } else {
    const b = r.body;
    const writeOn = WRITE_FLAGS.filter(f => b[f] === true);
    const summary = {
      enableReading: b.enableReading,
      enableFutures: b.enableFutures,
      ipRestrict: b.ipRestrict,
      createTime: b.createTime,
      writeFlagsOn: writeOn,
    };
    if (b.enableReading !== true) record("apiRestrictions", "FAIL", "enableReading is false", summary);
    else if (writeOn.length) record("apiRestrictions", "FAIL", `write permissions ticked: ${writeOn.join(", ")}`, summary);
    else record("apiRestrictions", "PASS", `reading-only key, enableFutures=${b.enableFutures}, ipRestrict=${b.ipRestrict}`, summary);
  }
}

// 2. futures balance ------------------------------------------------------
{
  const r = await signed(FAPI, "GET", "/fapi/v3/balance");
  if (!r.ok) record("futures balance", "FAIL", `futures read rejected: ${errText(r)}`);
  else {
    const usdt = (r.body ?? []).find(x => x.asset === "USDT") ?? null;
    record("futures balance", "PASS", `futures reads work (${r.body.length} assets)`, usdt && {
      balance: usdt.balance,
      crossUnPnl: usdt.crossUnPnl,
      availableBalance: usdt.availableBalance,
      updateTime: usdt.updateTime,
    });
  }
}

// 3. income rows: symbol + tradeId presence --------------------------------
for (const incomeType of ["REALIZED_PNL", "COMMISSION", "FUNDING_FEE"]) {
  const r = await signed(FAPI, "GET", "/fapi/v1/income", {
    incomeType,
    startTime: String(Date.now() - 30 * 86400_000),
    limit: "20",
  });
  if (!r.ok) {
    record(`income ${incomeType}`, "FAIL", errText(r));
    continue;
  }
  const rows = r.body ?? [];
  if (!rows.length) {
    record(`income ${incomeType}`, "INFO", "no rows in the last 30 days; cannot judge symbol/tradeId");
    continue;
  }
  const withSymbol = rows.filter(x => x.symbol).length;
  const withTradeId = rows.filter(x => x.tradeId && String(x.tradeId) !== "0" && x.tradeId !== "").length;
  record(
    `income ${incomeType}`,
    "INFO",
    `${rows.length} rows: ${withSymbol} carry symbol, ${withTradeId} carry a non-zero tradeId`,
    { sample: rows.slice(0, 2).map(x => ({ symbol: x.symbol, tradeId: x.tradeId, asset: x.asset, time: x.time })) }
  );
}

// 4. open orders vs algo orders -------------------------------------------
{
  const r = await signed(FAPI, "GET", "/fapi/v1/openOrders");
  if (!r.ok) record("openOrders", "FAIL", errText(r));
  else {
    const types = [...new Set((r.body ?? []).map(x => x.type))];
    record("openOrders", "INFO", `${r.body.length} open orders; types: ${types.join(", ") || "(none)"}`);
  }
  const a = await signed(FAPI, "GET", "/fapi/v1/openAlgoOrders");
  if (!a.ok) record("openAlgoOrders", "FAIL", errText(a));
  else {
    const list = Array.isArray(a.body) ? a.body : a.body?.orders ?? [];
    const types = [...new Set(list.map(x => x.orderType ?? x.type))];
    record("openAlgoOrders", "INFO", `${list.length} open algo orders; types: ${types.join(", ") || "(none)"}`, list.slice(0, 2).map(x => ({
      symbol: x.symbol,
      orderType: x.orderType ?? x.type,
      positionSide: x.positionSide,
      triggerPrice: x.triggerPrice ?? x.stopPrice,
      closePosition: x.closePosition,
      algoStatus: x.algoStatus,
    })));
  }
}

// 5. position mode + positionAmt sign ------------------------------------
{
  const m = await signed(FAPI, "GET", "/fapi/v1/positionSide/dual");
  const hedge = m.ok ? m.body?.dualSidePosition : undefined;
  if (!m.ok) record("positionSide/dual", "FAIL", errText(m));
  else record("positionSide/dual", "INFO", hedge ? "hedge mode (dualSidePosition=true)" : "one-way mode");
  const p = await signed(FAPI, "GET", "/fapi/v3/positionRisk");
  if (!p.ok) record("positionRisk", "FAIL", errText(p));
  else {
    const open = (p.body ?? []).filter(x => Number(x.positionAmt) !== 0);
    record("positionRisk", "INFO", `${open.length} open positions`, open.slice(0, 4).map(x => ({
      symbol: x.symbol,
      positionSide: x.positionSide,
      positionAmt: x.positionAmt,
      entryPrice: x.entryPrice,
      notional: x.notional,
      updateTime: x.updateTime,
    })));
  }
}

// 6. opt-in write probe ----------------------------------------------------
if (!WRITE_PROBE) {
  record("order/test write probe", "SKIP", "pass --write-probe to run (validates only, never places an order)");
} else {
  const r = await signed(FAPI, "POST", "/fapi/v1/order/test", {
    symbol: "BTCUSDT",
    side: "BUY",
    type: "LIMIT",
    timeInForce: "GTC",
    quantity: "0.001",
    price: "1000",
  });
  if (r.ok) record("order/test write probe", "FAIL", "test order ACCEPTED: this key can trade futures");
  else record("order/test write probe", "PASS", `rejected as expected: ${errText(r)}`);
}

if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
const failed = report.probes.some(p => p.outcome === "FAIL");
process.exit(failed ? 1 : 0);
