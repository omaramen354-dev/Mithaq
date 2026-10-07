/* ============================================================
   MithaqQR — مولّد رموز QR خفيف بدون أي اعتماديات (QR Code Model 2)
   وفق ISO/IEC 18004: الإصدارات 1-10، مستويات تصحيح L/M/Q/H،
   ترميز Byte (UTF-8)، اختيار تلقائي للإصدار وأفضل قناع.
   منقول من ملف الأرشيف assets/qr.js (مبني على خوارزمية
   qrcode-generator — MIT © Kazuhiko Arase) إلى TypeScript.
   يعمل في المتصفح وعلى الخادم.
   ============================================================ */

export type Ecc = "L" | "M" | "Q" | "H";

export type QrMatrix = {
  modules: (boolean | null)[][];
  moduleCount: number;
  type: number;
  ecc: Ecc;
};

export type QrOptions = {
  ecc?: Ecc;
  size?: number;
  ink?: string;
  quietZone?: number;
};

/* ---------- حقل جالوا GF(256) ---------- */
const EXP: number[] = new Array(256);
const LOG: number[] = new Array(256);
(() => {
  const seed = [1, 2, 4, 8, 16, 32, 64, 128];
  for (let i = 0; i < 8; i++) EXP[i] = seed[i];
  for (let i = 8; i < 256; i++) EXP[i] = EXP[i - 4] ^ EXP[i - 5] ^ EXP[i - 6] ^ EXP[i - 8];
  for (let i = 0; i < 255; i++) LOG[EXP[i]] = i;
})();

function gexp(n: number): number {
  while (n < 0) n += 255;
  while (n >= 256) n -= 255;
  return EXP[n];
}
function glog(n: number): number {
  if (n < 1) throw new Error("glog(" + n + ")");
  return LOG[n];
}

/* ---------- كثيرات الحدود على GF(256) (Reed-Solomon) ---------- */
class Polynomial {
  num: number[];
  length: number;

  constructor(num: number[], shift: number) {
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
    this.length = this.num.length;
  }

  get(i: number): number {
    return this.num[i];
  }

  multiply(e: Polynomial): Polynomial {
    const num = new Array(this.length + e.length - 1).fill(0);
    for (let i = 0; i < this.length; i++)
      for (let j = 0; j < e.length; j++)
        num[i + j] ^= gexp(glog(this.get(i)) + glog(e.get(j)));
    return new Polynomial(num, 0);
  }

  mod(e: Polynomial): Polynomial {
    if (this.length - e.length < 0) return this;
    const ratio = glog(this.get(0)) - glog(e.get(0));
    const num = this.num.slice();
    for (let i = 0; i < e.length; i++) num[i] ^= gexp(glog(e.get(i)) + ratio);
    return new Polynomial(num, 0).mod(e);
  }
}

function errorCorrectPolynomial(len: number): Polynomial {
  let poly = new Polynomial([1], 0);
  for (let i = 0; i < len; i++) poly = poly.multiply(new Polynomial([1, gexp(i)], 0));
  return poly;
}

/* ---------- جداول ثابتة ---------- */
const ECC_INDEX: Record<Ecc, number> = { L: 0, M: 1, Q: 2, H: 3 };
const ECC_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };

/* جدول كتل Reed-Solomon: لكل (إصدار × مستوى L,M,Q,H) أزواج [عدد الكتل, إجمالي, بيانات] */
const RS_BLOCK_TABLE: number[][] = [
  /* v1 */ [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
  /* v2 */ [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
  /* v3 */ [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
  /* v4 */ [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
  /* v5 */ [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
  /* v6 */ [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
  /* v7 */ [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
  /* v8 */ [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
  /* v9 */ [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
  /* v10 */ [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16],
];

/* مواضع أنماط المحاذاة لكل إصدار */
const PATTERN_POSITION_TABLE: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

const G15 = 0b10100110111;
const G15_MASK = 0b101010000010010;
const G18 = 0b1111100100101;

type RsBlock = { totalCount: number; dataCount: number };

function rsBlocksFor(type: number, ecc: Ecc): RsBlock[] {
  const row = RS_BLOCK_TABLE[(type - 1) * 4 + ECC_INDEX[ecc]];
  if (!row) throw new Error("QR: إصدار غير مدعوم");
  const blocks: RsBlock[] = [];
  for (let i = 0; i < row.length; i += 3) {
    for (let j = 0; j < row[i]; j++) blocks.push({ totalCount: row[i + 1], dataCount: row[i + 2] });
  }
  return blocks;
}

/* ---------- BCH لبيانات الصيغة والإصدار ---------- */
function bchDigit(d: number): number {
  let digit = 0;
  while (d !== 0) {
    digit++;
    d >>>= 1;
  }
  return digit;
}
function bchTypeInfo(data: number): number {
  let d = data << 10;
  while (bchDigit(d) - bchDigit(G15) >= 0) d ^= G15 << (bchDigit(d) - bchDigit(G15));
  return ((data << 10) | d) ^ G15_MASK;
}
function bchTypeNumber(data: number): number {
  let d = data << 12;
  while (bchDigit(d) - bchDigit(G18) >= 0) d ^= G18 << (bchDigit(d) - bchDigit(G18));
  return (data << 12) | d;
}

/* ---------- مخزن البتات ---------- */
class BitBuffer {
  buffer: number[] = [];
  length = 0;

  put(num: number, length: number): void {
    for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1);
  }

  putBit(bit: boolean): void {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
    this.length++;
  }
}

function toUtf8Bytes(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

/* ---------- اختيار الإصدار الأصغر الذي يستوعب البيانات ---------- */
function pickType(byteLen: number, ecc: Ecc): number {
  for (let t = 1; t <= 10; t++) {
    const blocks = rsBlocksFor(t, ecc);
    let totalData = 0;
    for (let i = 0; i < blocks.length; i++) totalData += blocks[i].dataCount;
    const ccBits = t < 10 ? 8 : 16;
    if (4 + ccBits + byteLen * 8 + 4 <= totalData * 8) return t;
  }
  throw new Error("QR: النص أطول من سعة الإصدار 10 (" + ecc + ")");
}

/* ---------- ترميز البيانات + كودووردز تصحيح الأخطاء ---------- */
type Encoded = { type: number; ecc: Ecc; data: number[]; moduleCount: number };

function encode(text: string, ecc: Ecc): Encoded {
  const bytes = toUtf8Bytes(String(text == null ? "" : text));
  const type = pickType(bytes.length, ecc);
  const blocks = rsBlocksFor(type, ecc);
  let totalData = 0;
  for (let i = 0; i < blocks.length; i++) totalData += blocks[i].dataCount;

  const buffer = new BitBuffer();
  buffer.put(4, 4); /* مؤشر وضع Byte = 0100 */
  buffer.put(bytes.length, type < 10 ? 8 : 16);
  for (let i = 0; i < bytes.length; i++) buffer.put(bytes[i] & 0xff, 8);
  if (buffer.length + 4 <= totalData * 8) buffer.put(0, 4); /* مُنهي */
  while (buffer.length % 8 !== 0) buffer.putBit(false);
  const padBytes = [0xec, 0x11];
  let p = 0;
  while (buffer.length < totalData * 8) buffer.put(padBytes[p++ % 2], 8);

  let offset = 0;
  let maxDc = 0;
  let maxEc = 0;
  const dc: number[][] = [];
  const ec: number[][] = [];
  for (let r = 0; r < blocks.length; r++) {
    const dCount = blocks[r].dataCount;
    const eCount = blocks[r].totalCount - dCount;
    maxDc = Math.max(maxDc, dCount);
    maxEc = Math.max(maxEc, eCount);
    const d = new Array<number>(dCount);
    for (let i = 0; i < dCount; i++) d[i] = buffer.buffer[i + offset] & 0xff;
    offset += dCount;
    dc.push(d);
    const rsPoly = errorCorrectPolynomial(eCount);
    const modPoly = new Polynomial(d, rsPoly.length - 1).mod(rsPoly);
    const eArr = new Array<number>(rsPoly.length - 1).fill(0);
    for (let i = 0; i < eArr.length; i++) {
      const modIndex = i + modPoly.length - eArr.length;
      eArr[i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
    }
    ec.push(eArr);
  }

  const data: number[] = [];
  let index = 0;
  for (let i = 0; i < maxDc; i++)
    for (let r = 0; r < blocks.length; r++) if (i < dc[r].length) data[index++] = dc[r][i];
  for (let i = 0; i < maxEc; i++)
    for (let r = 0; r < blocks.length; r++) if (i < ec[r].length) data[index++] = ec[r][i];

  return { type, ecc, data, moduleCount: type * 4 + 17 };
}

/* ---------- دوال الأقنعة الثمانية ---------- */
function maskFn(row: number, col: number, pattern: number): boolean {
  switch (pattern) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7: return ((((row * col) % 3) + ((row + col) % 2)) % 2) === 0;
    default: return false;
  }
}

/* ---------- بناء مصفوفة الوحدات ---------- */
function buildMatrix(payload: { text: string; ecc: Ecc }, maskPattern: number, test: boolean): QrMatrix {
  const e = encode(payload.text, payload.ecc);
  const n = e.moduleCount;
  const modules: (boolean | null)[][] = [];
  for (let row = 0; row < n; row++) modules.push(new Array<boolean | null>(n).fill(null));

  /* أنماط تحديد المواقع (المربعات الثلاثة) مع الفواصل */
  function probe(row: number, col: number): void {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || n <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || n <= col + c) continue;
        modules[row + r][col + c] =
          (0 <= r && r <= 7 && (c === 0 || c === 6)) ||
          (0 <= c && c <= 7 && (r === 0 || r === 6)) ||
          (2 <= r && r <= 4 && 2 <= c && c <= 4);
      }
    }
  }
  probe(0, 0);
  probe(n - 7, 0);
  probe(0, n - 7);

  /* أنماط المحاذاة */
  const pos = PATTERN_POSITION_TABLE[e.type - 1];
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      const row = pos[i];
      const col = pos[j];
      if (modules[row][col] != null) continue;
      for (let r = -2; r <= 2; r++)
        for (let c = -2; c <= 2; c++)
          modules[row + r][col + c] = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
    }
  }

  /* أنماط التوقيت */
  for (let r = 8; r < n - 8; r++) if (modules[r][6] == null) modules[r][6] = r % 2 === 0;
  for (let c = 8; c < n - 8; c++) if (modules[6][c] == null) modules[6][c] = c % 2 === 0;

  /* معلومات الصيغة + الوحدة الداكنة الثابتة */
  const bits = bchTypeInfo((ECC_BITS[e.ecc] << 3) | maskPattern);
  for (let i = 0; i < 15; i++) {
    const mod = !test && ((bits >> i) & 1) === 1;
    if (i < 6) modules[i][8] = mod;
    else if (i < 8) modules[i + 1][8] = mod;
    else modules[n - 15 + i][8] = mod;
  }
  for (let i = 0; i < 15; i++) {
    const mod = !test && ((bits >> i) & 1) === 1;
    if (i < 8) modules[8][n - i - 1] = mod;
    else if (i < 9) modules[8][15 - i - 1 + 1] = mod;
    else modules[8][15 - i - 1] = mod;
  }
  modules[n - 8][8] = !test;

  /* معلومات الإصدار (الإصدار 7+) */
  if (e.type >= 7) {
    const vbits = bchTypeNumber(e.type);
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((vbits >> i) & 1) === 1;
      modules[Math.floor(i / 3)][(i % 3) + n - 8 - 3] = mod;
    }
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((vbits >> i) & 1) === 1;
      modules[(i % 3) + n - 8 - 3][Math.floor(i / 3)] = mod;
    }
  }

  /* توزيع البيانات بالمسار المتعرج من أسفل اليمين */
  let inc = -1;
  let row = n - 1;
  let bitIndex = 7;
  let byteIndex = 0;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (;;) {
      for (let c = 0; c < 2; c++) {
        if (modules[row][col - c] == null) {
          let dark = false;
          if (byteIndex < e.data.length) dark = ((e.data[byteIndex] >>> bitIndex) & 1) === 1;
          if (maskFn(row, col - c, maskPattern)) dark = !dark;
          modules[row][col - c] = dark;
          bitIndex--;
          if (bitIndex === -1) {
            byteIndex++;
            bitIndex = 7;
          }
        }
      }
      row += inc;
      if (row < 0 || n <= row) {
        row -= inc;
        inc = -inc;
        break;
      }
    }
  }

  return { modules, moduleCount: n, type: e.type, ecc: e.ecc };
}

/* ---------- تقييم تشوّه القناع (قواعد العقوبة) ---------- */
function lostPoint(modules: (boolean | null)[][], n: number): number {
  let lost = 0;

  /* قاعدة 1: تكرارات أفقية/رأسية بطول 5+ */
  for (let axis = 0; axis < 2; axis++) {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b <= n; b++) {
        const cur = b < n ? (axis === 0 ? modules[a][b] : modules[b][a]) : null;
        const prev = axis === 0 ? modules[a][b - 1] : modules[b - 1][a];
        if (cur !== null && cur === prev) run++;
        else {
          if (run >= 5) lost += 3 + (run - 5);
          run = 1;
        }
      }
    }
  }

  /* قاعدة 2: كتل 2×2 بلون واحد */
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) lost += 3;
    }
  }

  /* قاعدة 3: النمط 1011101 محاطاً بأربع وحدات فاتحة */
  const pat1 = [true, false, true, true, true, false, true, true, true, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  function scan(get: (a: number, b: number) => boolean | null): void {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b <= n - 11; b++) {
        let m1 = true;
        let m2 = true;
        for (let k = 0; k < 11; k++) {
          const v = get(a, b + k);
          if (v !== pat1[k]) m1 = false;
          if (v !== pat2[k]) m2 = false;
        }
        if (m1 || m2) lost += 40;
      }
    }
  }
  scan((a, b) => modules[a][b]);
  scan((a, b) => modules[b][a]);

  /* قاعدة 4: انحراف نسبة الوحدات الداكنة عن 50% */
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (modules[r][c]) dark++;
  lost += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return lost;
}

/* ---------- الواجهة العامة ---------- */

/* matrix(text, {ecc}) → { modules, moduleCount, type, ecc } */
export function qrMatrix(text: string, opts: QrOptions = {}): QrMatrix {
  const requested: Ecc = ECC_BITS[opts.ecc ?? "M"] !== undefined ? (opts.ecc ?? "M") : "M";
  const candidates: Ecc[] = [requested];
  if (requested !== "L") candidates.push("L"); /* مستوى L يملك أكبر سعة كاحتياط */
  let lastErr: unknown = null;
  for (let i = 0; i < candidates.length; i++) {
    try {
      const payload = { text, ecc: candidates[i] };
      let best = 0;
      let bestLost = -1;
      for (let m = 0; m < 8; m++) {
        const trial = buildMatrix(payload, m, true);
        const lost = lostPoint(trial.modules, trial.moduleCount);
        if (bestLost < 0 || lost < bestLost) {
          best = m;
          bestLost = lost;
        }
      }
      return buildMatrix(payload, best, false);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("QR encode failed");
}

/* svg(text, {size, ecc, ink}) → وسم SVG جاهز للطباعة والعرض */
export function qrSvg(text: string, opts: QrOptions = {}): string {
  const m = qrMatrix(text, opts);
  const quiet = opts.quietZone ?? 4;
  const total = m.moduleCount + quiet * 2;
  const ink = opts.ink || "#000000";
  const size = opts.size || 96;
  let d = "";
  for (let row = 0; row < m.moduleCount; row++) {
    for (let col = 0; col < m.moduleCount; col++) {
      if (m.modules[row][col]) d += "M" + (col + quiet) + " " + (row + quiet) + "h1v1h-1z";
    }
  }
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
    '" viewBox="0 0 ' + total + " " + total +
    '" shape-rendering="crispEdges" role="img" aria-label="رمز QR للتحقق من العقد">' +
    '<rect width="' + total + '" height="' + total + '" fill="#FFFFFF"/>' +
    '<path d="' + d + '" fill="' + ink + '"/></svg>'
  );
}
