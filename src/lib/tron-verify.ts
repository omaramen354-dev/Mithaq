import crypto from "crypto";

/* ============================================================
   tron-verify.ts — التحقق التلقائي المجاني من تحويلات USDT (TRC20)
   عبر TronGrid API الرسمي (100,000 طلب/يوم مجاناً بلا وسيط ولا عمولة).
   - يتحقق من صحة صيغة TXID (64 خانة ست عشرية)
   - يفكّ ترميز عنوان محفظتك (Base58Check مع فحص checksum)
   - يتأكد أن التحويل حدث فعلاً على عقد USDT TRC20 الرسمي
     (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t) إلى محفظتك بالضبط،
     وبالمبلغ المطلوب أو أكثر، وخلال آخر 72 ساعة.
   ============================================================ */

/** عقد USDT الرسمي على شبكة TRON (Mainnet) */
export const OFFICIAL_USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const OFFICIAL_USDT_HEX20 = "a614f803b6fd780986a42c78ec9c7f77e6ded13c";

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Map<string, number>(
  [...BASE58_ALPHABET].map((ch, idx) => [ch, idx])
);

/** هل المعرّف بصيغة TXID صالحة على شبكة TRON (64 خانة Hex)؟ */
export function isValidTronTxid(raw: string): boolean {
  return /^[0-9a-f]{64}$/i.test(String(raw || "").trim());
}

/** تحويل عنوان TRON (Base58Check يبدأ بـ T) إلى 20 بايت Hex (40 خانة)
    مع التحقق من بصمة SHA-256 المزدوجة (Checksum) */
export function tronBase58ToHex20(address: string): string | null {
  const s = String(address || "").trim();
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s)) return null;

  let value = BigInt(0);
  for (const ch of s) {
    const digit = BASE58_MAP.get(ch);
    if (digit === undefined) return null;
    value = value * BigInt(58) + BigInt(digit);
  }

  let hex = value.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  const rawBytes = Buffer.from(hex, "hex");
  let leadingZeros = 0;
  for (const ch of s) {
    if (ch === "1") leadingZeros++;
    else break;
  }
  const bytes = Buffer.concat([Buffer.alloc(leadingZeros), rawBytes]);
  if (bytes.length !== 25 || bytes[0] !== 0x41) return null;

  const payload = bytes.subarray(0, 21);
  const checksum = bytes.subarray(21, 25);
  const h1 = crypto.createHash("sha256").update(payload).digest();
  const h2 = crypto.createHash("sha256").update(h1).digest();
  if (!checksum.equals(h2.subarray(0, 4))) return null;

  return payload.subarray(1, 21).toString("hex").toLowerCase();
}

/** تطبيع أي عنوان مستلم قادم من TronGrid (0x... أو 41... أو T...) إلى 40 خانة Hex */
export function normalizeTronAddrHex20(raw: unknown): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s.startsWith("T")) return tronBase58ToHex20(s);
  const clean = s.replace(/^0x/i, "").toLowerCase();
  if (/^41[0-9a-f]{40}$/.test(clean)) return clean.slice(2);
  if (/^[0-9a-f]{40}$/.test(clean)) return clean;
  return null;
}

export type TronVerifyResult =
  | {
      status: "verified";
      amountUsdt: number;
      fromHex: string;
      blockTimestamp: number;
    }
  | { status: "invalid"; reason: string }
  | { status: "unavailable"; reason: string };

type TronGridEvent = {
  contract_address?: string;
  event_name?: string;
  block_timestamp?: number;
  result?: {
    from?: string;
    to?: string;
    value?: string;
    "0"?: string;
    "1"?: string;
    "2"?: string;
  };
};

/**
 * فحص معاملة USDT TRC20 مباشرة من TronGrid API الرسمي.
 * يُرجع:
 * - verified:    التحويل مؤكد وصحيح المبلغ والوجهة والتوقيت
 * - invalid:     المعاملة موجودة لكنها لا تطابق محفظتك أو مبلغ الباقة أو أقدم من 72 ساعة
 * - unavailable: تعذر الاتصال بـ TronGrid أو لم تُؤكد المعاملة بعد (تتحول لمراجعة يدوية)
 */
export async function verifyUsdtTrc20Transfer(
  txid: string,
  expectedUsd: number,
  walletAddress?: string
): Promise<TronVerifyResult> {
  const cleanTx = String(txid || "").trim().toLowerCase();
  if (!isValidTronTxid(cleanTx)) {
    return { status: "invalid", reason: "صيغة رقم عملية TRON (TXID) غير صالحة." };
  }

  const targetWallet = (
    walletAddress ??
    process.env.NEXT_PUBLIC_USDT_TRC20_ADDRESS ??
    process.env.USDT_TRC20_ADDRESS ??
    ""
  ).trim();
  const expectedToHex = tronBase58ToHex20(targetWallet);
  if (!expectedToHex) {
    return { status: "unavailable", reason: "wallet_not_configured" };
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = (process.env.TRONGRID_API_KEY || "").trim();
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

  try {
    const res = await fetch(
      `https://api.trongrid.io/v1/transactions/${cleanTx}/events`,
      {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      }
    );
    if (!res.ok) {
      return { status: "unavailable", reason: `trongrid_http_${res.status}` };
    }

    const payload = (await res.json()) as {
      success?: boolean;
      data?: TronGridEvent[];
    };
    const events = Array.isArray(payload?.data) ? payload.data : [];
    if (events.length === 0) {
      return { status: "unavailable", reason: "tx_not_indexed_yet" };
    }

    const nowMs = Date.now();
    const maxAgeMs = 72 * 3600 * 1000; // 72 ساعة

    let matchedUsdtEvent = false;
    let maxReceivedForWallet = 0;
    let matchedFrom = "";
    let matchedTs = 0;

    for (const ev of events) {
      if (ev.event_name !== "Transfer") continue;
      const contractHex = normalizeTronAddrHex20(ev.contract_address);
      if (contractHex !== OFFICIAL_USDT_HEX20) continue;

      matchedUsdtEvent = true;
      const toHex = normalizeTronAddrHex20(ev.result?.to ?? ev.result?.["1"]);
      if (toHex !== expectedToHex) continue;

      const rawVal = String(ev.result?.value ?? ev.result?.["2"] ?? "0");
      if (!/^\d+$/.test(rawVal)) continue;
      const usdtAmount = Number(BigInt(rawVal)) / 1_000_000;
      if (usdtAmount > maxReceivedForWallet) {
        maxReceivedForWallet = usdtAmount;
        matchedFrom = normalizeTronAddrHex20(ev.result?.from ?? ev.result?.["0"]) || "";
        matchedTs = Number(ev.block_timestamp || 0);
      }
    }

    if (!matchedUsdtEvent) {
      return {
        status: "invalid",
        reason: "هذه المعاملة ليست تحويل USDT (TRC20) رسمياً على شبكة TRON.",
      };
    }

    if (maxReceivedForWallet <= 0) {
      return {
        status: "invalid",
        reason: "عنوان المستلم في هذه المعاملة لا يطابق محفظة منصة ميثاق.",
      };
    }

    /* سماحية صغيرة 0.05 USDT لتفادي فروق التقريب مع منع الدفع الناقص */
    if (maxReceivedForWallet + 0.05 < expectedUsd) {
      return {
        status: "invalid",
        reason: `المبلغ المحوّل (${maxReceivedForWallet.toFixed(2)} USDT) أقل من سعر الباقة المطلوب (${expectedUsd} USDT).`,
      };
    }

    if (matchedTs > 0 && nowMs - matchedTs > maxAgeMs) {
      return {
        status: "invalid",
        reason: "هذه المعاملة قديمة (أكثر من 72 ساعة) — استخدم تحويلك الجديد أو تواصل مع الدعم.",
      };
    }

    return {
      status: "verified",
      amountUsdt: maxReceivedForWallet,
      fromHex: matchedFrom,
      blockTimestamp: matchedTs,
    };
  } catch {
    return { status: "unavailable", reason: "trongrid_network_error" };
  }
}
