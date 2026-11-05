import { SYNC_ERROR_CODES, type SyncErrorCode } from "@shared/const";

// One-sentence reason per sync error code (spec doc-4, Error taxonomy).
// Raw exchange text is never shown; the server only ever sends the code.
export const SYNC_ERROR_REASONS: Record<SyncErrorCode, string> = {
  invalid_key: "API key 无效或已被撤销，请在 Binance 重新创建后替换。",
  permissions_changed:
    "这个 key 开启了交易、提现或划转权限，或关闭了读取权限；日志只接受只读 key。",
  futures_unreadable:
    "这个 key 读不到 U 本位合约账户，请在 Binance 开通合约后重试。",
  clock_skew: "本机时间与 Binance 服务器相差过大，请校准系统时间后重试。",
  rate_limited: "Binance 请求过于频繁，已被限流，稍后会自动重试。",
  exchange_unavailable: "Binance 暂时不可用或正在维护，稍后会自动重试。",
  network: "连接 Binance 失败，请检查网络或代理后重试。",
  unknown: "同步时出现未知错误，详情已记录在服务器日志中。",
};

export function isSyncErrorCode(value: string): value is SyncErrorCode {
  return SYNC_ERROR_CODES.some(code => code === value);
}

/** Reason sentence for a code (e.g. a TRPCError message), or undefined. */
export function syncErrorReason(
  code: string | null | undefined
): string | undefined {
  return code && isSyncErrorCode(code) ? SYNC_ERROR_REASONS[code] : undefined;
}
