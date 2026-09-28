/* ============================================================
   بيانات ومنطق حقول نموذج إنشاء العقد — منقولة كما هي عن
   النسخة القديمة frontend/index.html (mq_CURRENCIES، mq_COUNTRIES،
   mq_CITIES، mq_METHODS، mq_durPhrase، mq_cleanMoney ...)
   حتى يظهر نموذج المودال بنفس القوائم المنبثقة والصياغة.
   ============================================================ */

/* ===== العملات ===== */
export type Currency = { code: string; name: string; txt: string; sym: string };

export const CURRENCIES: Currency[] = [
  { code: "USD", name: "دولار أمريكي", txt: "دولار أمريكي", sym: "$" },
  { code: "EUR", name: "يورو", txt: "يورو", sym: "€" },
  { code: "SYP", name: "ليرة سورية", txt: "ليرة سورية", sym: "ل.س" },
  { code: "SAR", name: "ريال سعودي", txt: "ريال سعودي", sym: "ر.س" },
  { code: "AED", name: "درهم إماراتي", txt: "درهم إماراتي", sym: "د.إ" },
  { code: "USDT", name: "عملة رقمية — شبكة TRC20", txt: "USDT", sym: "₮" },
];

export function findCurrency(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
}

export function currencyTxt(cur: Currency): string {
  return cur.txt;
}

/* ===== الدول (نفس القائمة القديمة بالأعلام) ===== */
export type Country = { code: string; ar: string; flag: string };

export const COUNTRIES: Country[] = [
  { code: "SA", ar: "السعودية", flag: "🇸🇦" },
  { code: "SY", ar: "سوريا", flag: "🇸🇾" },
  { code: "AE", ar: "الإمارات", flag: "🇦🇪" },
  { code: "QA", ar: "قطر", flag: "🇶🇦" },
  { code: "KW", ar: "الكويت", flag: "🇰🇼" },
  { code: "BH", ar: "البحرين", flag: "🇧🇭" },
  { code: "OM", ar: "عُمان", flag: "🇴🇲" },
  { code: "JO", ar: "الأردن", flag: "🇯🇴" },
  { code: "LB", ar: "لبنان", flag: "🇱🇧" },
  { code: "PS", ar: "فلسطين", flag: "🇵🇸" },
  { code: "IQ", ar: "العراق", flag: "🇮🇶" },
  { code: "YE", ar: "اليمن", flag: "🇾🇪" },
  { code: "EG", ar: "مصر", flag: "🇪🇬" },
  { code: "SD", ar: "السودان", flag: "🇸🇩" },
  { code: "LY", ar: "ليبيا", flag: "🇱🇾" },
  { code: "TN", ar: "تونس", flag: "🇹🇳" },
  { code: "DZ", ar: "الجزائر", flag: "🇩🇿" },
  { code: "MA", ar: "المغرب", flag: "🇲🇦" },
  { code: "MR", ar: "موريتانيا", flag: "🇲🇷" },
  { code: "SO", ar: "الصومال", flag: "🇸🇴" },
  { code: "DJ", ar: "جيبوتي", flag: "🇩🇯" },
  { code: "KM", ar: "جزر القمر", flag: "🇰🇲" },
  { code: "TR", ar: "تركيا", flag: "🇹🇷" },
  { code: "IR", ar: "إيران", flag: "🇮🇷" },
  { code: "US", ar: "أمريكا", flag: "🇺🇸" },
  { code: "CA", ar: "كندا", flag: "🇨🇦" },
  { code: "GB", ar: "بريطانيا", flag: "🇬🇧" },
  { code: "FR", ar: "فرنسا", flag: "🇫🇷" },
  { code: "DE", ar: "ألمانيا", flag: "🇩🇪" },
  { code: "ES", ar: "إسبانيا", flag: "🇪🇸" },
  { code: "IT", ar: "إيطاليا", flag: "🇮🇹" },
  { code: "NL", ar: "هولندا", flag: "🇳🇱" },
  { code: "BE", ar: "بلجيكا", flag: "🇧🇪" },
  { code: "AT", ar: "النمسا", flag: "🇦🇹" },
  { code: "CH", ar: "سويسرا", flag: "🇨🇭" },
  { code: "SE", ar: "السويد", flag: "🇸🇪" },
  { code: "NO", ar: "النرويج", flag: "🇳🇴" },
  { code: "DK", ar: "الدنمارك", flag: "🇩🇰" },
  { code: "FI", ar: "فنلندا", flag: "🇫🇮" },
  { code: "PL", ar: "بولندا", flag: "🇵🇱" },
  { code: "GR", ar: "اليونان", flag: "🇬🇷" },
  { code: "PT", ar: "البرتغال", flag: "🇵🇹" },
  { code: "CZ", ar: "التشيك", flag: "🇨🇿" },
  { code: "RO", ar: "رومانيا", flag: "🇷🇴" },
  { code: "RU", ar: "روسيا", flag: "🇷🇺" },
  { code: "UA", ar: "أوكرانيا", flag: "🇺🇦" },
  { code: "CN", ar: "الصين", flag: "🇨🇳" },
  { code: "JP", ar: "اليابان", flag: "🇯🇵" },
  { code: "KR", ar: "كوريا الجنوبية", flag: "🇰🇷" },
  { code: "IN", ar: "الهند", flag: "🇮🇳" },
  { code: "PK", ar: "باكستان", flag: "🇵🇰" },
  { code: "BD", ar: "بنغلاديش", flag: "🇧🇩" },
  { code: "MY", ar: "ماليزيا", flag: "🇲🇾" },
  { code: "ID", ar: "إندونيسيا", flag: "🇮🇩" },
  { code: "PH", ar: "الفلبين", flag: "🇵🇭" },
  { code: "TH", ar: "تايلاند", flag: "🇹🇭" },
  { code: "VN", ar: "فيتنام", flag: "🇻🇳" },
  { code: "SG", ar: "سنغافورة", flag: "🇸🇬" },
  { code: "AU", ar: "أستراليا", flag: "🇦🇺" },
  { code: "CD", ar: "الكونغو الديمقراطية", flag: "🇨🇩" },
  { code: "NG", ar: "نيجيريا", flag: "🇳🇬" },
  { code: "ET", ar: "إثيوبيا", flag: "🇪🇹" },
  { code: "KE", ar: "كينيا", flag: "🇰🇪" },
  { code: "TZ", ar: "تنزانيا", flag: "🇹🇿" },
  { code: "GH", ar: "غانا", flag: "🇬🇭" },
  { code: "ZA", ar: "جنوب أفريقيا", flag: "🇿🇦" },
];

export function countryByCode(code: string): Country | null {
  return COUNTRIES.find((c) => c.code === code) || null;
}

/* ===== المدن حسب الدولة (نفس جداول القديم) ===== */
export const CITIES: Record<string, string[]> = {
  SA: ["الرياض","جدة","مكة المكرمة","المدينة المنورة","الدمام","الخبر","الظهران","تبوك","أبها","خميس مشيط","بريدة","عنيزة","حائل","نجران","جيزان","الطائف","الأحساء","ينبع","سكاكا","عرعر","القطيف","البدائع"],
  SY: ["دمشق","حلب","حمص","حماة","اللاذقية","طرطوس","إدلب","الرقة","دير الزور","الحسكة","درعا","السويداء","القنيطرة","أريحا","المحفرة","صيدنايا","بلودان","يعبرود","عنجر"],
  AE: ["دبي","أبوظبي","الشارقة","العين","عجمان","رأس الخيمة","الفجيرة","أم القيوين","خور فكان","دبا الحسنية","الذيد"],
  QA: ["الدوحة","الوكرة","الخور","الريان","أم صلال","الظعاين","الشمال","مسيعيد"],
  KW: ["مدينة الكويت","حولي","الفروانية","الجهراء","الأحمدي","الفنطاس","السالمية","الجلة"],
  BH: ["المنامة","المحرق","الرفاع","مدينة عيسى","مدينة حمد","سترة","البديع","جدحفص"],
  OM: ["مسقط","صلالة","صحار","نزوى","صور","بركاء","إبراء","بهلاء","المصنعة","عبري"],
  JO: ["عمّان","إربد","الزرقاء","العقبة","المفرق","جرش","مادبا","الكرك","معان","سلط"],
  LB: ["بيروت","طرابلس","صيدا","صور","جونية","زحلة","بعلبك","جبيل","نبطية","عالية","بترون"],
  PS: ["القدس","رام الله","غزة","نابلس","الخليل","بيت لحم","جنين","طولكرم","قلقيلية","سلفيت","أريحا","بيت جالا","الناصرة","حيفا","يافا","عكا","طبرية"],
  IQ: ["بغداد","البصرة","أربيل","الموصل","النجف","كربلاء","السليمانية","كركوك","دهوك","سامراء","تكريت","الحلة","الناصرية","عمارة","بعقوبة","رمادي"],
  YE: ["صنعاء","عدن","تعز","الحديدة","المكلا","إب","حجة","ذمار","سيئون","مأرب","الضالع","لحج"],
  EG: ["القاهرة","الإسكندرية","الجيزة","المنصورة","طنطا","الزقازيق","الفيوم","بنها","أسوان","الأقصر","أسيوط","سوهاج","بورسعيد","السويس","دمياط","العريش","مرسى مطروح","الوادي الجديد"],
  SD: ["الخرطوم","أم درمان","بورتسودان","بحري","كسلا","الابيض","فاشر","الجنينة","وادي مدني"],
  LY: ["طرابلس","بنغازي","مصراتة","البيضاء","سبها","درنة","طبرق","الزاوية","صبراتة"],
  TN: ["تونس","صفاقس","سوسة","قابس","بنزرت","أريانة","المنستير","قفصة","جندوبة","الكاف"],
  DZ: ["الجزائر العاصمة","وهران","قسنطينة","عنابة","سطيف","باتنة","بجاية","تلمسان","البليدة","ورقلة","غرداية","بشار"],
  MA: ["الدار البيضاء","الرباط","فاس","مراكش","طنجة","أكادير","مكناس","وجدة","تطوان","القنيطرة (المغرب)","سلا","تمارة"],
  MR: ["نواكشوط","نواديبو","كيفة","روصو","الزويرات"],
  SO: ["مقديشو","هرغيسا","بيدوا","بوصاصو","كيسمايو"],
  DJ: ["جيبوتي","علي صبيح","تاجورة","أوبوك"],
  KM: ["موروني","موتسامودو","فومبوني"],
  TR: ["إسطنبول","أنقرة","إزمير","بورصة","أضنة","طرابزون","غازي عنتاب","قونية","أنطاليا","كايسيري","إسكي شهير","ديار بكر","سينوب","أرضروم","مرسين"],
  IR: ["طهران","مشهد","أصفهان","شيراز","تبريز","قم","أهواز","كرمانشاه","أرومية","رشت"],
  US: ["نيويورك","لوس أنجلوس","واشنطن","شيكاغو","هيوستن","ديترويت","بوسطن","سياتل","سان فرانسيسكو","مايامي","ديربورن","باترسون"],
  CA: ["تورونتو","مونتريال","أوتاوا","فانكوفر","كالغاري","إدمونتون"],
  GB: ["لندن","مانشستر","برمنغهام","ليفربول","ليدز","غلاسكو","إدنبرة"],
  FR: ["باريس","مرسيليا","ليون","تولوز","نيس","نانت","ستراسبرغ"],
  DE: ["برلين","ميونخ","فرانكفورت","هامبورغ","كولونيا","شتوتغارت","دوسلدورف"],
  ES: ["مدريد","برشلونة","فالنسيا","إشبيلية","سرقسطة","مالقة"],
  IT: ["روما","ميلانو","نابولي","تورينو","فلورنسا","باليرمو"],
  NL: ["أمستردام","روتردام","لاهاي","أيندهوفن"],
  BE: ["بروكسل","أنتويرب","غنت","شارلروا"],
  AT: ["فيينا","غراز","لينز","سالزبورغ"],
  CH: ["زيورخ","جنيف","بازل","برن","لوزان"],
  SE: ["ستوكهولم","غوتنبرغ","مالمو"],
  NO: ["أوسلو","بيرغن","تروندهايم","ستافانغر"],
  DK: ["كوبنهاغن","آرهوس","أودنسه"],
  FI: ["هلسنكي","إسبو","تامبيري","توركو"],
  PL: ["وارسو","كراكوف","غدانسك","فروتسواف"],
  GR: ["أثينا","سالونيك","باتراس"],
  PT: ["لشبونة","بورتو","براغا"],
  CZ: ["براغ","برنو","أولوموتس"],
  RO: ["بوخارست","كلوج نابوكا","تيميشوارا","إاسي"],
  RU: ["موسكو","سانت بطرسبرغ","قازان","أوفا"],
  UA: ["كييف","خاركيف","أوديسا","دنيبرو"],
  CN: ["بكين","شنغهاي","قوانغجو","شنتشن","ووهان","تشنغدو"],
  JP: ["طوكيو","أوساكا","يوكوهاما","ناغويا","سابورو"],
  KR: ["سيول","بوسان","إنتشون","دايغو"],
  IN: ["نيودلهي","مومباي","بنغالور","حيدر أباد","تشيناي","كولكاتا"],
  PK: ["إسلام آباد","كراتشي","لاهور","فيصل آباد","راولبندي"],
  BD: ["دكا","شيتاغونغ","خولنا"],
  MY: ["كوالالمبور","جورج تاون","جوهر بهرو","إيبوه"],
  ID: ["جاكرتا","سورابايا","باندونغ","ميدان"],
  PH: ["مانيلا","كيزون سيتي","سيبو","دافاو"],
  TH: ["بانكوك","تشيانغ ماي","بوكيت"],
  VN: ["هانوي","هوشي منه","دا نانغ"],
  SG: ["سنغافورة"],
  AU: ["سيدني","ملبورن","بيرث","بريزبن","أديلايد"],
  CD: ["كينشاسا","لوبومباشي","بوكافو","كيسانغاني"],
  NG: ["لاغوس","أبوجا","كانو","إبادان"],
  ET: ["أديس أبابا","ديري داوا","مكلي","غوندر"],
  KE: ["نيروبي","مومباسا","كيسومو","ناكورو"],
  TZ: ["دار السلام","دودوما","أروشا","موانزا"],
  GH: ["أكرا","كوماسي","تامالي"],
  ZA: ["بريتوريا","كاب تاون","جوهانسبرغ","دربان","بورت إليزابيث"],
};

/* البحث عن الدولة صاحبة المدينة (لاستعادة الاختيار من قيمة محفوظة) */
export function countryOfCity(city: string): string {
  if (!city) return "";
  for (const code of Object.keys(CITIES)) {
    if ((CITIES[code] || []).includes(city)) return code;
  }
  return "";
}

/* ===== طرق السداد (نفس قائمة القديم) ===== */
export type PaymentMethod = {
  v: string;
  d: string;
  icon: string;
  als: string[];
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  { v: "شام كاش", d: "Sham Cash — محفظة محلية", icon: "fas fa-wallet", als: ["شام"] },
  { v: "USDT", d: "عملة رقمية — شبكة TRC20", icon: "fab fa-bitcoin", als: ["تيثر"] },
  { v: "تحويل بنكي", d: "من حساب إلى حساب مصرفي", icon: "fas fa-landmark", als: ["حوالة"] },
  { v: "نقداً", d: "تسليم نقدي مباشر", icon: "fas fa-money-bill-wave", als: ["نقد", "كاش", "cash"] },
  { v: "دفع إلكتروني", d: "بطاقة / بوابة دفع إلكترونية", icon: "fas fa-credit-card", als: ["إلكتروني", "الكتروني", "بطاقة", "أونلاين", "اونلاين", "بوابة"] },
];

export function normAr(s: string): string {
  return String(s || "")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* مطابقة طريقة سداد محفوظة (نص أو مرادف) */
export function paymentFind(raw: string): PaymentMethod | null {
  const n = normAr(raw);
  if (!n) return null;
  for (const m of PAYMENT_METHODS) if (normAr(m.v) === n) return m;
  for (const m of PAYMENT_METHODS) {
    for (const a of m.als) if (a && n.includes(normAr(a))) return m;
  }
  return null;
}

/* ===== صياغة المدة (رقم + وحدة → عبارة عربية) ===== */
export type DurUnit = "day" | "month" | "year";

export function durUnitLabel(u: DurUnit): string {
  return u === "day" ? "يوم" : u === "year" ? "سنة" : "شهر";
}

export function durPhrase(n: number, u: DurUnit): string {
  if (u === "day") {
    if (n === 1) return "يوم واحد";
    if (n === 2) return "يومان";
    return n <= 10 ? `${n} أيام` : `${n} يوماً`;
  }
  if (u === "month") {
    if (n === 1) return "شهر واحد";
    if (n === 2) return "شهران";
    return n <= 10 ? `${n} أشهر` : `${n} شهراً`;
  }
  if (u === "year") {
    if (n === 1) return "سنة واحدة";
    if (n === 2) return "سنتان";
    return n <= 10 ? `${n} سنوات` : `${n} سنة`;
  }
  return String(n);
}

function durUnitFromWord(w: string): DurUnit | null {
  const s = " " + w + " ";
  if (/(^|\s)(يوم|يومان|أيام|يوما|يوماً)(\s|$)/.test(s)) return "day";
  if (/(^|\s)(شهر|شهران|أشهر|شهرا|شهراً)(\s|$)/.test(s)) return "month";
  if (/(^|\s)(سنة|سنتان|سنتين|سنوات|سنه|عام|أعوام)(\s|$)/.test(s)) return "year";
  return null;
}

function durStripUnit(w: string, u: DurUnit): string {
  const rx =
    u === "day"
      ? /(^|\s)(يوم|يومان|أيام|يوما|يوماً)(\s|$)/g
      : u === "month"
        ? /(^|\s)(شهر|شهران|أشهر|شهرا|شهراً)(\s|$)/g
        : /(^|\s)(سنة|سنتان|سنتين|سنوات|سنه|عام|أعوام)(\s|$)/g;
  return w.replace(rx, " ").trim();
}

export type DurParse =
  | { kind: "ok"; n: number; u: DurUnit }
  | { kind: "custom" };

/* تحليل قيمة مدة محفوظة ("6 أشهر"، "سنة واحدة"، "شهران" ...) */
export function parseDur(s: string): DurParse {
  const str = String(s || "").trim();
  const m = /^(\d+)\s*(.*)$/.exec(str);
  if (m) {
    const n = Number(m[1]);
    if (!(n >= 1 && n <= 9999)) return { kind: "custom" };
    const rest = m[2].trim();
    const u = rest ? durUnitFromWord(rest) : null;
    if (u && durStripUnit(rest, u) === "") return { kind: "ok", n, u };
    return { kind: "custom" };
  }
  const w = str;
  if (/^(يوم|شهر|سنة)\s+واحد(ة)?$/.test(w)) {
    const first = w.split(/\s+/)[0] as "يوم" | "شهر" | "سنة";
    const map: Record<string, DurUnit> = { يوم: "day", شهر: "month", سنة: "year" };
    return { kind: "ok", n: 1, u: map[first] };
  }
  if (w === "يومان") return { kind: "ok", n: 2, u: "day" };
  if (w === "شهران" || w === "شهرين") return { kind: "ok", n: 2, u: "month" };
  if (w === "سنتان" || w === "سنتين") return { kind: "ok", n: 2, u: "year" };
  return { kind: "custom" };
}

/* ===== المبلغ: تنظيف + تركيب "500000 ليرة سورية" ===== */
export function cleanMoney(raw: string): string {
  let s = String(raw || "")
    .replace(/٫/g, ".")
    .replace(/،/g, ".")
    .replace(/٬/g, "")
    .replace(/,/g, "")
    .replace(/[\s\u00A0]/g, "")
    .replace(/[^\d.]/g, "");
  const i = s.indexOf(".");
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
  const dec = i >= 0 ? s.slice(i + 1) : "";
  if (dec.length > 2) s = s.slice(0, i + 1) + dec.slice(0, 2);
  if (s === ".") s = "0.";
  return s;
}

export function numCanon(clean: string): string {
  let s = String(clean);
  if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s || "0";
}

export type MoneyParse =
  | { kind: "empty" }
  | { kind: "ok"; n: number; code: string }
  | { kind: "custom" };

/* تحليل مبلغ محفوظ ("500000 ليرة سورية" → 500000 + SYP) */
export function parseMoney(s: string): MoneyParse {
  const str = String(s == null ? "" : s).trim();
  if (!str) return { kind: "empty" };
  let numRaw = "";
  let rest = str;
  const m = /^([0-9][0-9\s.,]*)/.exec(str);
  if (m) {
    numRaw = m[1];
    rest = str.slice(numRaw.length).trim();
  }
  const numStr = cleanMoney(numRaw);
  const n = Number(numStr);
  if (!numRaw || !/^[0-9.]+$/.test(numStr) || !isFinite(n) || n <= 0)
    return { kind: "custom" };
  const low = " " + rest + " ";
  let code: string | null = null;
  if (/\busdt\b/i.test(rest) || low.includes("تيثر") || low.includes("عملة رقمية")) code = "USDT";
  else if (low.includes("دولار") || /\busd\b/i.test(rest)) code = "USD";
  else if (low.includes("يورو") || /\beur\b/i.test(rest)) code = "EUR";
  else if (low.includes("ليرة") || low.includes("سوري") || /\bsyp\b/i.test(rest)) code = "SYP";
  else if (low.includes("ريال سعودي") || low.includes("ريال") || /\bsar\b/i.test(rest)) code = "SAR";
  else if (low.includes("درهم") || /\baed\b/i.test(rest)) code = "AED";
  if (!code) return { kind: "custom" };
  return { kind: "ok", n, code };
}

/* ===== أدوات التاريخ (نفس أسماء القديم) ===== */
export function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}
export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function todayISO(): string {
  return isoOf(new Date());
}

export const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
export const WEEK_AR = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
export const WEEK_SHORT = ["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"];
