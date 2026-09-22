'use strict';
/* ======================================================================
   MithaqQR — مولّد رموز QR خفيف بدون أي اعتماديات (QR Code Model 2)
   وفق ISO/IEC 18004: الإصدارات 1-10، مستويات تصحيح L/M/Q/H،
   ترميز Byte (UTF-8)، اختيار تلقائي للإصدار وأفضل قناع.
   ملف واحد UMD: يُحمّل في الخادم (require) وفي المتصفح (window.MithaqQR).
   مبني على خوارزمية qrcode-generator (MIT © Kazuhiko Arase) بصيغة مكثفة.
====================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MithaqQR = api;
})(typeof self !== 'undefined' ? self : this, function () {

  /* ---------- حقل جالوا GF(256) ---------- */
  var EXP = new Array(256), LOG = new Array(256);
  (function () {
    var seed = [1, 2, 4, 8, 16, 32, 64, 128];
    for (var i = 0; i < 8; i++) EXP[i] = seed[i];
    for (var i = 8; i < 256; i++) EXP[i] = EXP[i - 4] ^ EXP[i - 5] ^ EXP[i - 6] ^ EXP[i - 8];
    for (var i = 0; i < 255; i++) LOG[EXP[i]] = i;
  })();
  function gexp(n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP[n]; }
  function glog(n) { if (n < 1) throw new Error('glog(' + n + ')'); return LOG[n]; }

  /* ---------- كثيرات الحدود على GF(256) (Reed-Solomon) ---------- */
  function Polynomial(num, shift) {
    var offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (var i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
    this.length = this.num.length;
  }
  Polynomial.prototype.get = function (i) { return this.num[i]; };
  Polynomial.prototype.multiply = function (e) {
    var num = new Array(this.length + e.length - 1);
    for (var i = 0; i < num.length; i++) num[i] = 0;
    for (var i = 0; i < this.length; i++) {
      for (var j = 0; j < e.length; j++) num[i + j] ^= gexp(glog(this.get(i)) + glog(e.get(j)));
    }
    return new Polynomial(num, 0);
  };
  Polynomial.prototype.mod = function (e) {
    if (this.length - e.length < 0) return this;
    var ratio = glog(this.get(0)) - glog(e.get(0));
    var num = this.num.slice();
    for (var i = 0; i < e.length; i++) num[i] ^= gexp(glog(e.get(i)) + ratio);
    return new Polynomial(num, 0).mod(e);
  };
  function errorCorrectPolynomial(len) {
    var poly = new Polynomial([1], 0);
    for (var i = 0; i < len; i++) poly = poly.multiply(new Polynomial([1, gexp(i)], 0));
    return poly;
  }

  /* ---------- جداول ثابتة ---------- */
  var ECC_INDEX = { L: 0, M: 1, Q: 2, H: 3 };
  var ECC_BITS = { L: 1, M: 0, Q: 3, H: 2 };
  /* جدول كتل Reed-Solomon: لكل (إصدار × مستوى L,M,Q,H) أزواج [عدد الكتل, إجمالي الكودووردز, كودووردز البيانات] */
  var RS_BLOCK_TABLE = [
    /* v1 */  [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
    /* v2 */  [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
    /* v3 */  [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
    /* v4 */  [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
    /* v5 */  [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
    /* v6 */  [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
    /* v7 */  [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
    /* v8 */  [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
    /* v9 */  [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
    /* v10 */ [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16]
  ];
  /* مواضع أنماط المحاذاة لكل إصدار */
  var PATTERN_POSITION_TABLE = [
    [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
  ];
  var G15 = 0b10100110111, G15_MASK = 0b101010000010010, G18 = 0b1111100100101;

  function rsBlocksFor(type, ecc) {
    var row = RS_BLOCK_TABLE[(type - 1) * 4 + ECC_INDEX[ecc]];
    var blocks = [];
    for (var i = 0; i < row.length; i += 3) {
      for (var j = 0; j < row[i]; j++) blocks.push({ totalCount: row[i + 1], dataCount: row[i + 2] });
    }
    return blocks;
  }

  /* ---------- BCH لبيانات الصيغة والإصدار ---------- */
  function bchDigit(d) { var digit = 0; while (d !== 0) { digit++; d >>>= 1; } return digit; }
  function bchTypeInfo(data) {
    var d = data << 10;
    while (bchDigit(d) - bchDigit(G15) >= 0) d ^= (G15 << (bchDigit(d) - bchDigit(G15)));
    return ((data << 10) | d) ^ G15_MASK;
  }
  function bchTypeNumber(data) {
    var d = data << 12;
    while (bchDigit(d) - bchDigit(G18) >= 0) d ^= (G18 << (bchDigit(d) - bchDigit(G18)));
    return (data << 12) | d;
  }

  /* ---------- مخزن البتات ---------- */
  function BitBuffer() { this.buffer = []; this.length = 0; }
  BitBuffer.prototype.put = function (num, length) {
    for (var i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1);
  };
  BitBuffer.prototype.putBit = function (bit) {
    var bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
    this.length++;
  };

  function toUtf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return Array.prototype.slice.call(new TextEncoder().encode(str));
    }
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.codePointAt(i), seq;
      if (c < 0x80) seq = [c];
      else if (c < 0x800) seq = [0xC0 | (c >> 6), 0x80 | (c & 63)];
      else if (c < 0x10000) seq = [0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)];
      else { seq = [0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)]; i++; }
      out = out.concat(seq);
    }
    return out;
  }

  /* ---------- اختيار الإصدار الأصغر الذي يستوعب البيانات ---------- */
  function pickType(byteLen, ecc) {
    for (var t = 1; t <= 10; t++) {
      var blocks = rsBlocksFor(t, ecc), totalData = 0;
      for (var i = 0; i < blocks.length; i++) totalData += blocks[i].dataCount;
      var ccBits = t < 10 ? 8 : 16; /* عدّاد الأحرف: 8 بت للإصدارات 1-9 و16 بت لما بعدها */
      if (4 + ccBits + byteLen * 8 + 4 <= totalData * 8) return t;
    }
    throw new Error('QR: النص أطول من سعة الإصدار 10 (' + ecc + ')');
  }

  /* ---------- ترميز البيانات + كودووردز تصحيح الأخطاء ---------- */
  function encode(text, ecc) {
    var bytes = toUtf8Bytes(String(text == null ? '' : text));
    var type = pickType(bytes.length, ecc);
    var blocks = rsBlocksFor(type, ecc);
    var totalData = 0;
    for (var i = 0; i < blocks.length; i++) totalData += blocks[i].dataCount;
    var buffer = new BitBuffer();
    buffer.put(4, 4); /* مؤشر وضع Byte = 0100 */
    buffer.put(bytes.length, type < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) buffer.put(bytes[i] & 0xff, 8);
    if (buffer.length + 4 <= totalData * 8) buffer.put(0, 4); /* مُنهي */
    while (buffer.length % 8 !== 0) buffer.putBit(false);
    var padBytes = [0xEC, 0x11], p = 0;
    while (buffer.length < totalData * 8) { buffer.put(padBytes[p++ % 2], 8); }
    var offset = 0, maxDc = 0, maxEc = 0, dc = [], ec = [];
    for (var r = 0; r < blocks.length; r++) {
      var dCount = blocks[r].dataCount, eCount = blocks[r].totalCount - dCount;
      maxDc = Math.max(maxDc, dCount); maxEc = Math.max(maxEc, eCount);
      var d = new Array(dCount);
      for (var i = 0; i < dCount; i++) d[i] = buffer.buffer[i + offset] & 0xff;
      offset += dCount;
      dc.push(d);
      var rsPoly = errorCorrectPolynomial(eCount);
      var modPoly = new Polynomial(d, rsPoly.length - 1).mod(rsPoly);
      var eArr = new Array(rsPoly.length - 1);
      for (var i = 0; i < eArr.length; i++) {
        var modIndex = i + modPoly.length - eArr.length;
        eArr[i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
      }
      ec.push(eArr);
    }
    var data = [], index = 0;
    for (var i = 0; i < maxDc; i++) for (var r = 0; r < blocks.length; r++) if (i < dc[r].length) data[index++] = dc[r][i];
    for (var i = 0; i < maxEc; i++) for (var r = 0; r < blocks.length; r++) if (i < ec[r].length) data[index++] = ec[r][i];
    return { type: type, ecc: ecc, data: data, moduleCount: type * 4 + 17 };
  }

  /* ---------- دوال الأقنعة الثمانية ---------- */
  function maskFn(row, col, pattern) {
    switch (pattern) {
      case 0: return (row + col) % 2 === 0;
      case 1: return row % 2 === 0;
      case 2: return col % 3 === 0;
      case 3: return (row + col) % 3 === 0;
      case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
      case 5: return (row * col) % 2 + (row * col) % 3 === 0;
      case 6: return ((row * col) % 2 + (row * col) % 3) % 2 === 0;
      case 7: return ((row * col) % 3 + (row + col) % 2) % 2 === 0;
    }
    return false;
  }

  /* ---------- بناء مصفوفة الوحدات ---------- */
  function buildMatrix(payload, maskPattern, test) {
    var e = encode(payload.text, payload.ecc);
    var n = e.moduleCount;
    var modules = [];
    for (var row = 0; row < n; row++) {
      modules.push(new Array(n));
      for (var col = 0; col < n; col++) modules[row][col] = null;
    }
    /* أنماط تحديد المواقع (المربعات الثلاثة) مع الفواصل */
    function probe(row, col) {
      for (var r = -1; r <= 7; r++) {
        if (row + r <= -1 || n <= row + r) continue;
        for (var c = -1; c <= 7; c++) {
          if (col + c <= -1 || n <= col + c) continue;
          modules[row + r][col + c] = (0 <= r && r <= 7 && (c === 0 || c === 6)) ||
            (0 <= c && c <= 7 && (r === 0 || r === 6)) ||
            (2 <= r && r <= 4 && 2 <= c && c <= 4);
        }
      }
    }
    probe(0, 0); probe(n - 7, 0); probe(0, n - 7);
    /* أنماط المحاذاة */
    var pos = PATTERN_POSITION_TABLE[e.type - 1];
    for (var i = 0; i < pos.length; i++) {
      for (var j = 0; j < pos.length; j++) {
        var row = pos[i], col = pos[j];
        if (modules[row][col] != null) continue;
        for (var r = -2; r <= 2; r++) for (var c = -2; c <= 2; c++) {
          modules[row + r][col + c] = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
        }
      }
    }
    /* أنماط التوقيت */
    for (var r = 8; r < n - 8; r++) { if (modules[r][6] == null) modules[r][6] = (r % 2 === 0); }
    for (var c = 8; c < n - 8; c++) { if (modules[6][c] == null) modules[6][c] = (c % 2 === 0); }
    /* معلومات الصيغة + الوحدة الداكنة الثابتة */
    var bits = bchTypeInfo((ECC_BITS[e.ecc] << 3) | maskPattern);
    for (var i = 0; i < 15; i++) {
      var mod = !test && ((bits >> i) & 1) === 1;
      if (i < 6) modules[i][8] = mod;
      else if (i < 8) modules[i + 1][8] = mod;
      else modules[n - 15 + i][8] = mod;
    }
    for (var i = 0; i < 15; i++) {
      var mod = !test && ((bits >> i) & 1) === 1;
      if (i < 8) modules[8][n - i - 1] = mod;
      else if (i < 9) modules[8][15 - i - 1 + 1] = mod;
      else modules[8][15 - i - 1] = mod;
    }
    modules[n - 8][8] = !test;
    /* معلومات الإصدار (الإصدار 7+) */
    if (e.type >= 7) {
      var vbits = bchTypeNumber(e.type);
      for (var i = 0; i < 18; i++) {
        var mod = !test && ((vbits >> i) & 1) === 1;
        modules[Math.floor(i / 3)][i % 3 + n - 8 - 3] = mod;
      }
      for (var i = 0; i < 18; i++) {
        var mod = !test && ((vbits >> i) & 1) === 1;
        modules[i % 3 + n - 8 - 3][Math.floor(i / 3)] = mod;
      }
    }
    /* توزيع البيانات بالمسار المتعرج من أسفل اليمين */
    var inc = -1, row = n - 1, bitIndex = 7, byteIndex = 0;
    for (var col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (var c = 0; c < 2; c++) {
          if (modules[row][col - c] == null) {
            var dark = false;
            if (byteIndex < e.data.length) dark = ((e.data[byteIndex] >>> bitIndex) & 1) === 1;
            if (maskFn(row, col - c, maskPattern)) dark = !dark;
            modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || n <= row) { row -= inc; inc = -inc; break; }
      }
    }
    return { modules: modules, moduleCount: n, type: e.type, ecc: e.ecc };
  }

  /* ---------- تقييم تشوّه القناع (قواعد العقوبة) ---------- */
  function lostPoint(modules, n) {
    var lost = 0;
    /* قاعدة 1: تكرارات أفقية/رأسية بطول 5+ */
    for (var axis = 0; axis < 2; axis++) {
      for (var a = 0; a < n; a++) {
        var run = 1;
        for (var b = 1; b <= n; b++) {
          var cur = b < n ? (axis === 0 ? modules[a][b] : modules[b][a]) : null;
          var prev = axis === 0 ? modules[a][b - 1] : modules[b - 1][a];
          if (cur !== null && cur === prev) run++;
          else { if (run >= 5) lost += 3 + (run - 5); run = 1; }
        }
      }
    }
    /* قاعدة 2: كتل 2×2 بلون واحد */
    for (var row = 0; row < n - 1; row++) {
      for (var col = 0; col < n - 1; col++) {
        var v = modules[row][col];
        if (v === modules[row][col + 1] && v === modules[row + 1][col] && v === modules[row + 1][col + 1]) lost += 3;
      }
    }
    /* قاعدة 3: النمط 1011101 محاطاً بأربع وحدات فاتحة من جهة واحدة */
    var pat1 = [true, false, true, true, true, false, true, true, true, false, false];
    var pat2 = [false, false, false, false, true, false, true, true, true, false, true];
    function scan(get) {
      for (var a = 0; a < n; a++) {
        for (var b = 0; b <= n - 11; b++) {
          var m1 = true, m2 = true;
          for (var k = 0; k < 11; k++) {
            var v = get(a, b + k);
            if (v !== pat1[k]) m1 = false;
            if (v !== pat2[k]) m2 = false;
          }
          if (m1 || m2) lost += 40;
        }
      }
    }
    scan(function (a, b) { return modules[a][b]; });
    scan(function (a, b) { return modules[b][a]; });
    /* قاعدة 4: انحراف نسبة الوحدات الداكنة عن 50% */
    var dark = 0;
    for (var row = 0; row < n; row++) for (var col = 0; col < n; col++) if (modules[row][col]) dark++;
    lost += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
    return lost;
  }

  /* ---------- الواجهة العامة ---------- */
  /* matrix(text, {ecc}) → { modules, moduleCount, type, ecc } */
  function matrix(text, opts) {
    opts = opts || {};
    var requested = ECC_BITS[opts.ecc] !== undefined ? opts.ecc : 'M';
    var candidates = [requested];
    if (requested !== 'L') candidates.push('L'); /* مستوى L يملك أكبر سعة كاحتياط */
    var lastErr = null;
    for (var i = 0; i < candidates.length; i++) {
      try {
        var payload = { text: text, ecc: candidates[i] };
        var best = 0, bestLost = -1;
        for (var m = 0; m < 8; m++) {
          var trial = buildMatrix(payload, m, true);
          var lost = lostPoint(trial.modules, trial.moduleCount);
          if (bestLost < 0 || lost < bestLost) { best = m; bestLost = lost; }
        }
        return buildMatrix(payload, best, false);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('QR encode failed');
  }

  /* svg(text, {size, ecc, ink}) → وسم SVG جاهز للطباعة والعرض */
  function svg(text, opts) {
    opts = opts || {};
    var m = matrix(text, opts);
    var quiet = opts.quietZone !== undefined ? opts.quietZone : 4;
    var total = m.moduleCount + quiet * 2;
    var ink = opts.ink || '#000000';
    var size = opts.size || 96;
    var d = '';
    for (var row = 0; row < m.moduleCount; row++) {
      for (var col = 0; col < m.moduleCount; col++) {
        if (m.modules[row][col]) d += 'M' + (col + quiet) + ' ' + (row + quiet) + 'h1v1h-1z';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges" role="img" aria-label="رمز QR">' +
      '<rect width="' + total + '" height="' + total + '" fill="#FFFFFF"/>' +
      '<path d="' + d + '" fill="' + ink + '"/></svg>';
  }

  return { matrix: matrix, svg: svg, encode: encode };
});
