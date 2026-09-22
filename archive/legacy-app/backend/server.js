'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');
const qrCodeSvg = require('../frontend/assets/qr.js');

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_FILE = path.join(ROOT_DIR, 'frontend', 'index.html');
const MARKETING_FILE = path.join(ROOT_DIR, 'frontend', 'marketing-carousel.html');
const BRAND_FILE = path.join(ROOT_DIR, 'frontend', 'brand-identity.html');
const AGENTS_FILE = path.join(ROOT_DIR, 'frontend', 'agents-council.html');
const DESIGN_STUDIO_FILE = path.join(ROOT_DIR, 'frontend', 'design-studio.html');
const UI_COMPONENTS_FILE = path.join(ROOT_DIR, 'frontend', 'ui-components.html');
const ASSETS_DIR = path.join(ROOT_DIR, 'frontend', 'assets');
/* مجلد البيانات قابل للتخصيص عبر متغير البيئة DATA_DIR —
   ضروري للاستضافة مع قرص ثابت (مثل Render Disks) لضمان بقاء العقود بعد كل نشر */
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const CONTRACTS_FILE = path.join(DATA_DIR, 'contracts.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'review-requests.json');
const PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');
/* لوحة تحكم المشرف: عبر متغير بيئة (قائمة إيميلات مفصولة بفواصل) أو جلسة محلية */
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '').split(',').map(e => normalize(e.toLowerCase())).filter(Boolean);

const CONTRACT_TYPES = {
  lease: 'عقد إيجار',
  sale: 'بيع وشراء',
  services: 'عقد خدمات',
  freelance: 'عمل حر',
  pledge: 'تعهد وإقرار',
  supply: 'عقد توريد',
  partnership: 'اتفاق شراكة',
  nda: 'اتفاقية سرية',
  lease_commercial: 'عقد إيجار تجاري',
  design: 'عقد تصميم وبرمجة',
  rent_furnished: 'عقد إيجار مفروش'
};

const DEFAULT_CLAUSES = {
  lease: [
    'يقر الطرفان، وهما بكامل أهليتهما المعتبرة شرعاً ونظاماً، بأن الطرف الأول [اسم المؤجر] قد أجّر للطرف الثاني [اسم المستأجر] العين المؤجرة الكائنة في [عنوان العقار] لمدة قدرها [المدة الزمنية] تبدأ من تاريخ [تاريخ البداية] وتنتهي في تاريخ [تاريخ النهاية].',
    'يلتزم الطرف الثاني بسداد الأجرة المتفق عليها وقدرها [القيمة المادية] وفق آلية السداد [شهرية/سنوية/دفعة واحدة]، وفي المواعيد المحددة دون تأخير، ويعد التأخر عن السداد لمدة [عدد الأيام] إخلالاً جوهرياً بالعقد.',
    'يلتزم الطرف الأول بتمكين الطرف الثاني من الانتفاع بالعين المؤجرة انتفاعاً هادئاً ومشروعاً، كما يلتزم بإجراء الإصلاحات الجوهرية غير الناشئة عن سوء استعمال الطرف الثاني، ما لم يتفق الطرفان كتابةً على خلاف ذلك.',
    'يلتزم الطرف الثاني بالمحافظة على العين المؤجرة واستخدامها للغرض المتفق عليه وهو [الغرض من الإيجار]، ولا يجوز له التنازل عن العقد أو التأجير من الباطن أو تغيير النشاط إلا بموافقة خطية مسبقة من الطرف الأول.',
    'في حال وقوع قوة قاهرة أو ظرف طارئ خارج عن إرادة الطرفين يمنع الانتفاع أو التنفيذ، يلتزم الطرفان بالتشاور بحسن نية لتعديل الالتزامات أو تعليقها مؤقتاً بما يحقق العدالة ويحفظ حقوق الطرفين.',
    'تُحل النزاعات الناشئة عن هذا العقد ودياً خلال مدة [مدة التسوية الودية] من تاريخ الإخطار الخطي، فإن تعذر ذلك تُحال إلى الجهة القضائية أو التحكيمية المختصة في [المدينة/الدولة] ما لم يتفق الطرفان على خلاف ذلك.'
  ],
  sale: [
    'يقر الطرفان بأهليتهما القانونية للتعاقد، ويتفقان على أن الطرف الأول [اسم البائع] قد باع للطرف الثاني [اسم المشتري] الشيء/الأصل محل البيع وهو [وصف المبيع وصفاً نافياً للجهالة]، وذلك وفق الشروط الواردة في هذا العقد.',
    'يلتزم الطرف الثاني بسداد ثمن المبيع وقدره [القيمة المادية] بالطريقة التالية [طريقة السداد]، ويعد عدم السداد في الموعد المحدد إخلالاً يجيز للطرف الأول المطالبة بالتنفيذ أو الفسخ والتعويض عند الاقتضاء.',
    'يلتزم الطرف الأول بتسليم المبيع للطرف الثاني في تاريخ [تاريخ التسليم] وبالحالة والمواصفات المتفق عليها، خالياً من الحقوق أو المطالبات أو العيوب الجوهرية غير المعلنة، ما لم يتم الإفصاح عنها كتابةً في هذا العقد.',
    'يقر الطرف الثاني بأنه عاين المبيع المعاينة النافية للجهالة، أو أتيحت له فرصة المعاينة، وأن قبوله النهائي يكون عند الاستلام ما لم تظهر عيوب خفية لم يكن بالإمكان اكتشافها بالفحص المعتاد.',
    'تنتقل مخاطر الهلاك أو التلف إلى الطرف الثاني من تاريخ الاستلام الفعلي، ما لم يكن الهلاك أو التلف ناشئاً عن فعل أو تقصير من الطرف الأول قبل التسليم.',
    'أي نزاع ينشأ عن تنفيذ أو تفسير هذا العقد تتم تسويته ودياً أولاً، وفي حال تعذر التسوية خلال [عدد الأيام] يوماً، ينعقد الاختصاص للجهة المختصة في [المدينة/الدولة].'
  ],
  services: [
    'يقر الطرفان بأهليتهما القانونية، ويتفقان على أن الطرف الثاني [اسم مقدم الخدمة] يلتزم بتقديم الخدمات المبينة في [وصف الخدمة] لصالح الطرف الأول [اسم طالب الخدمة] وفق نطاق العمل والمخرجات والجداول الزمنية المتفق عليها.',
    'يلتزم الطرف الأول بتزويد الطرف الثاني بجميع البيانات والموافقات والمواد اللازمة لتنفيذ الخدمة في الوقت المناسب، كما يلتزم بسداد المقابل المالي وقدره [القيمة المادية] وفق مواعيد السداد [آلية السداد].',
    'يلتزم الطرف الثاني ببذل العناية المهنية المعتادة وتنفيذ الخدمة وفق الأصول الفنية والمهنية، وتسليم المخرجات في موعد أقصاه [تاريخ/مدة التسليم]، ما لم يحدث تأخير بسبب الطرف الأول أو قوة قاهرة.',
    'يحق للطرف الأول طلب تعديلات معقولة ضمن نطاق الخدمة المتفق عليه، أما الأعمال أو التعديلات الخارجة عن النطاق فتعد أعمالاً إضافية لا تنفذ إلا بعد اتفاق خطي على مدتها وتكلفتها.',
    'تظل المعلومات والبيانات المتبادلة بين الطرفين سرية، ولا يجوز لأي طرف إفشاؤها أو استخدامها لغير أغراض تنفيذ هذا العقد، إلا بموافقة خطية أو بموجب التزام قانوني.',
    'في حال الإخلال الجوهري، يوجه الطرف المتضرر إخطاراً خطياً للطرف الآخر يمنحه مهلة [عدد الأيام] لتصحيح الإخلال، فإن لم يتم التصحيح جاز للطرف المتضرر إنهاء العقد والمطالبة بحقوقه النظامية.'
  ],
  freelance: [
    'يقر الطرفان بأهليتهما للتعاقد، ويتفقان على أن الطرف الثاني [اسم المستقل] يلتزم بتنفيذ العمل الحر الموضح في [وصف المشروع/الخدمة] لصالح الطرف الأول [اسم العميل] وفق نطاق العمل والمخرجات المتفق عليها.',
    'يلتزم الطرف الأول بسداد أتعاب الطرف الثاني وقدرها [القيمة المادية] وفق الدفعات التالية [تفاصيل الدفعات]، ولا يجوز تأخير السداد بعد تسليم المرحلة أو العمل المتفق عليه دون سبب مشروع ومكتوب.',
    'يلتزم الطرف الثاني بتسليم العمل في موعد أقصاه [تاريخ التسليم] وبجودة مهنية مناسبة، كما يلتزم بإبلاغ الطرف الأول فوراً بأي عائق جوهري قد يؤثر في الموعد أو جودة التسليم.',
    'يحق للطرف الأول طلب عدد [عدد التعديلات] من التعديلات ضمن نطاق العمل الأصلي، أما التعديلات الجوهرية أو تغيير المتطلبات بعد اعتمادها فتعد عملاً إضافياً يستوجب اتفاقاً مستقلاً على التكلفة والمدة.',
    'لا تنتقل حقوق الملكية الفكرية للمخرجات النهائية إلى الطرف الأول إلا بعد سداد كامل المستحقات المتفق عليها، ما لم ينص اتفاق مكتوب على خلاف ذلك، ويحتفظ الطرف الثاني بحق عرض العمل ضمن معرض أعماله ما لم يطلب الطرف الأول السرية كتابةً.',
    'في حال إلغاء المشروع من الطرف الأول بعد بدء التنفيذ، يستحق الطرف الثاني مقابلاً عادلاً عن الأعمال المنجزة حتى تاريخ الإلغاء، ويحدد ذلك وفق نسبة الإنجاز أو المراحل المسلمة أو ما يتفق عليه الطرفان.',
    'تتم تسوية أي نزاع ودياً خلال [عدد الأيام] يوماً، وفي حال تعذر التسوية ينعقد الاختصاص للجهة المختصة في [المدينة/الدولة]، مع بقاء حق الطرف الثاني في المطالبة بالمستحقات الثابتة عن الأعمال المنجزة.'
  ],
  pledge: [
    'يقر الطرف الأول [اسم المقر/المتعهد] بكامل أهليته وإرادته الحرة، ودون إكراه أو تدليس، بأنه يتعهد أمام الطرف الثاني [اسم المستفيد] بتنفيذ الالتزام التالي: [وصف التعهد أو الإقرار] خلال مدة [المدة الزمنية].',
    'يقر الطرف الأول بصحة البيانات والمعلومات الواردة في هذا التعهد، ويتحمل المسؤولية الكاملة عن أي ضرر ينشأ عن عدم صحتها أو عن إخلاله بما تعهد به.',
    'يلتزم الطرف الأول بعدم القيام بأي تصرف من شأنه تعطيل أو إعاقة تنفيذ هذا التعهد، كما يلتزم بإخطار الطرف الثاني فوراً بأي ظرف قد يؤثر في التنفيذ.',
    'إذا ترتب على إخلال الطرف الأول ضرر مادي أو معنوي للطرف الثاني، جاز للطرف الثاني المطالبة بالتعويض المناسب وفق القواعد القانونية المعمول بها، دون الإخلال بأي حقوق أخرى.',
    'لا يعفى الطرف الأول من تنفيذ التزامه إلا في حال القوة القاهرة أو السبب الأجنبي الذي لا يد له فيه، وبشرط إثبات ذلك وإخطار الطرف الثاني خلال مدة معقولة.',
    'يعد هذا التعهد محرراً إلكترونياً قابلاً للإثبات بالوسائل النظامية، ويخضع في تفسيره وتنفيذه للأنظمة المعمول بها في [المدينة/الدولة].'
  ],
  supply: [
    'يقر الطرفان بأهليتهما القانونية، ويتفقان على أن الطرف الأول [اسم المورد] يلتزم بتوريد [وصف البضائع/المواد] للطرف الثاني [اسم المشتري] بالكميات والمواصفات والأسعار المحددة في [عرض السعر/الملحق/جدول المواصفات].',
    'يلتزم الطرف الأول بتسليم المواد في المكان [مكان التسليم] وفي الموعد [تاريخ/جدول التسليم]، وبحالة صالحة ومطابقة للمواصفات المتفق عليها وخالية من العيوب الظاهرة التي تمنع الانتفاع بها.',
    'يلتزم الطرف الثاني بسداد قيمة التوريد وقدرها [القيمة المادية] وفق شروط السداد [دفعة مقدمة/عند التسليم/أقساط]، ولا يعد التأخير في السداد مبرراً لرفض الاستلام إذا كان التوريد مطابقاً، ما لم يتفق على خلاف ذلك.',
    'يحق للطرف الثاني فحص المواد خلال مدة [مدة الفحص] من تاريخ الاستلام، وعليه إخطار الطرف الأول كتابةً بأي عيب أو نقص أو مخالفة للمواصفات، وإلا اعتبر الاستلام قبولاً مبدئياً ما لم تظهر عيوب خفية.',
    'يلتزم الطرف الأول باستبدال أو إصلاح أو تعويض المواد غير المطابقة خلال مدة [مدة المعالجة] متى ثبت أن عدم المطابقة راجع إليه، دون تحميل الطرف الثاني تكاليف إضافية غير متفق عليها.',
    'لا يكون أي طرف مسؤولاً عن التأخير أو عدم التنفيذ إذا كان ناتجاً عن قوة قاهرة أو ظرف خارج عن الإرادة، على أن يخطر الطرف المتأثر الطرف الآخر فوراً ويعمل على تقليل آثار التأخير.',
    'تتم تسوية النزاعات ودياً، فإن تعذر ذلك خلال [عدد الأيام] يوماً، ينعقد الاختصاص للجهة المختصة في [المدينة/الدولة].'
  ],
  partnership: [
    'يقر الشركاء الموقعون على هذا الاتفاق، وهم [أسماء الشركاء]، بأهليتهم القانونية، ويتفقون على تأسيس علاقة شراكة لغرض [غرض الشراكة/النشاط] وفق الحصص والالتزامات المبينة في هذا الاتفاق.',
    'تحدد حصة كل شريك على النحو الآتي: [اسم الشريك ونسبة الحصة]، وتحدد المساهمات المالية أو العينية أو الفنية لكل شريك في [تفاصيل المساهمات].',
    'يلتزم كل شريك بأداء ما عليه من التزامات بحسن نية، وبذل العناية اللازمة لإنجاح الشراكة، والامتناع عن أي تصرف يضر بمصلحة الشراكة أو يستغل أصولها أو معلوماتها لمصلحة شخصية دون موافقة الشركاء.',
    'توزع الأرباح والخسائر وفق نسب الحصص المتفق عليها، ما لم يتفق الشركاء كتابةً على آلية أخرى، ولا يتم توزيع الأرباح إلا بعد خصم المصروفات والالتزامات والاحتياطيات اللازمة.',
    'تتخذ القرارات الجوهرية، مثل إدخال شريك جديد أو الاقتراض أو بيع أصول رئيسية أو تغيير النشاط، بموافقة [نسبة الموافقة المطلوبة] من الشركاء، وتوثق القرارات كتابةً.',
    'يلتزم الشركاء بسرية المعلومات المالية والتجارية والفنية المتعلقة بالشراكة، ويستمر هذا الالتزام حتى بعد انتهاء الشراكة أو خروج أحد الشركاء.',
    'في حال رغبة أحد الشركاء في الانسحاب أو بيع حصته، يلتزم بإخطار باقي الشركاء قبل مدة [مدة الإخطار]، ويكون لباقي الشركاء حق الأولوية في شراء الحصة وفق آلية تقييم عادلة يتفق عليها.',
    'تتم تسوية أي نزاع بين الشركاء ودياً، فإن تعذر ذلك خلال [عدد الأيام] يوماً، يحال النزاع إلى [التحكيم/المحكمة المختصة] في [المدينة/الدولة].'
  ],
  nda: [
    'يقر الطرفان بأهليتهما القانونية، ويتفقان على أن المعلومات التي يفصح عنها أي طرف للطرف الآخر والمتعلقة بـ [موضوع العلاقة/المشروع] تعد معلومات سرية متى كانت بطبيعتها سرية أو وسمت بأنها سرية أو يفترض عقلاً سريتها.',
    'يلتزم الطرف المستلم للمعلومات السرية بعدم إفشائها أو نشرها أو إتاحتها لأي طرف ثالث، وعدم استخدامها إلا لغرض [الغرض المحدد من الإفصاح] وبالقدر اللازم لتحقيق هذا الغرض فقط.',
    'تشمل المعلومات السرية، دون حصر، البيانات الفنية والتجارية والمالية وقوائم العملاء والأسعار والخطط والمستندات والعروض والبرمجيات وأي مواد أو معلومات يتم تبادلها شفهياً أو كتابياً أو إلكترونياً.',
    'لا تعد المعلومات سرية إذا ثبت أنها كانت معلومة للعامة دون إخلال من الطرف المستلم، أو كانت بحوزته قبل الإفصاح، أو حصل عليها من طرف ثالث يملك حق الإفصاح، أو طلب الإفصاح عنها بموجب أمر قضائي أو نظامي.',
    'يلتزم الطرف المستلم باتخاذ إجراءات حماية معقولة لا تقل عن درجة العناية التي يتخذها لحماية معلوماته السرية، وبإخطار الطرف المفصح فوراً عند علمه بأي إفشاء أو استخدام غير مصرح به.',
    'تستمر التزامات السرية لمدة [مدة الالتزام] من تاريخ توقيع هذا الاتفاق أو من تاريخ آخر إفصاح عن المعلومات السرية، أيهما أحدث، ما لم يتفق الطرفان على مدة أطول.',
    'عند انتهاء العلاقة أو بناءً على طلب الطرف المفصح، يلتزم الطرف المستلم بإعادة أو إتلاف المعلومات السرية وجميع نسخها، ما لم يكن الاحتفاظ بها مطلوباً بموجب القانون أو لأغراض الإثبات.',
    'أي إخلال بهذا الاتفاق يجيز للطرف المتضرر المطالبة بوقف الإفشاء أو الاستخدام غير المشروع والتعويض عن الأضرار، وتختص الجهة المختصة في [المدينة/الدولة] بنظر أي نزاع ينشأ عنه.'
  ],
  lease_commercial: [
    'يقر الطرفان بأهليتهما القانونية، ويتفقان على أن الطرف الأول [اسم المؤجر] قد أجّر للطرف الثاني [اسم المستأجر] العقار التجاري الكائن في [عنوان العقار] المخصص لنشاط [النشاط التجاري] لمدة [المدة الزمنية].',
    'تُحدد الأجرة الشهرية وقدرها [المبلغ بالليرة السورية/الدولار/USDT] تُسدّد في أول كل شهر ميلادي، ويُعتبر التأخر أكثر من [عدد الأيام] يوماً إخلالاً جوهرياً بالعقد.',
    'يلتزم المستأجر ب conducting النشاط التجاري المحدد فقط، ولا يجوز له تغيير النشاط أو التنازل عن العقد أو التأجير من الباطن إلا بموافقة خطية مسبقة من المؤجر.',
    'يلتزم المؤجر بتسليم العقار بحالة صالحة للاستخدام التجاري، وأي إصلاحات جوهرية تقع على عاتق المؤجر، أما الصيانة اليومية فعلى المستأجر.',
    'يلتزم المستأجر بدفع جميع الرسوم والضرائب وال המשתמש المحلية المفروضة على النشاط التجاري داخل العقار.',
    'يحتفظ المؤجر بحق فسخ العقد في حال الإخلال الجوهري، بعد إخطار كتابي بمهلة [عدد الأيام] يوماً لتصحيح الإخلال.'
  ],
  design: [
    'يقر الطرفان بأهليتهما للتعاقد، ويتفقان على أن الطرف الثاني [اسم المصمم/المبرمج] يلتزم بتنفيذ خدمات التصميم و/أو البرمجة المحددة في [وصف المشروع] لصالح الطرف الأول [اسم العميل].',
    'يُحدد نطاق العمل كما يلي: [قائمة المهام والمتطلبات الفنية]، ويُلزم الطرف الثاني بتسليم الملفات والمصادر القابلة للتعديل بالتنسيق المتفق عليه [PDF/PSD/SVG/كود مصدري].',
    'يتم السداد على مراحل حسب الجدول التالي: [الدفعة المقدمة — نسبة الإنجاز — التسليم النهائي]، ولا يجوز تأخير السداد أكثر من [عدد الأيام] يوماً بعد تسلام المرحلة.',
    'تنتقل ملكية حقوق التصميم و/أو الكود المصدري إلى الطرف الأول بعد سداد كامل المستحقات، ويتخلي الطرف الثاني عن أي مطالبة بملكية الفكرية بعد التسليم.',
    'يحق للطرف الأول طلب تعديلات معقولة لا تتجاوز [عدد التعديلات] جولة تعديل، وأي تعديلات إضافية تُحسب كعمل مستقل بسعر يتفق عليه الطرفان.',
    'يلتزم الطرف الثاني بال保密 على جميع مواد المشروع وبيانات العميل، وعدم استخدامها لأي غرض آخر غير تنفيذ هذا العقد.'
  ],
  rent_furnished: [
    'يقر الطرفان بأهليتهما، ويتفقان على إيجار العقار المفروش الكائن في [عنوان العقار] مع جميع الأثاث والأجهزة المبينة في جرد المرفقات هذا.',
    'تُحدد الأجرة الشهرية وقدرها [المبلغ] شاملة استخدام الأثاث والأجهزة، ويشمل ذلك [شرح ما يشمله الإيجار: كهرباء/ماء/إنترنت].',
    'يلتزم المستأجر بالمحافظة على جميع مقتنيات العقار المفروش واستخدامها بعناية، ويتحمل تكاليف الإصلاح في حال الأضرار الناشئة عن سوء الاستعمال.',
    'يُرفق بعقد هذا جرد تفصيلي لجميع الأثاث والأجهزة مع صور حالها عند التسليم، ويُعاد الجرد عند انتهاء العقد.',
    'لا يجوز للمستأجر نقل أي قطعة من الأثاث خارج العقار أو إضافة أثاث جديد دون موافقة خطية من المؤجر.',
    'عند انتهاء العقد، يُعيد المستأجر العقار بحالة جيدة مع الأثاث الأصلي، ويُخصم من التأمين أي تكاليف إصلاح للأضرار الناشئة عن سوء الاستعمال.'
  ]
};

const CONTRACTS_STORAGE_VERSION = 2;
const JSON_INDENT = 2;
let warnedAboutDevEncryptionKey = false;

function getAllowedCorsOrigin() {
  const configured = process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS || '*';
  return configured.split(',')[0].trim() || '*';
}

function getEncryptionSecret() {
  const secret = process.env.ENCRYPTION_KEY;
  if (secret && secret.length >= 24) return secret;
  if (!warnedAboutDevEncryptionKey) {
    warnedAboutDevEncryptionKey = true;
    console.warn('WARNING: ENCRYPTION_KEY is not set or too short. Using an insecure development fallback. Set ENCRYPTION_KEY in production.');
  }
  return 'mithaq-development-only-change-this-encryption-key';
}

function getEncryptionKey() {
  return crypto.createHash('sha256').update(getEncryptionSecret()).digest();
}

function encryptText(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: true,
    version: CONTRACTS_STORAGE_VERSION,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64')
  };
}

function decryptText(payload) {
  if (!payload || payload.encrypted !== true) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8');
}

function atomicWriteFileSync(file, content) {
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, content, 'utf8');
  fs.renameSync(tempFile, file);
}

function ensureJsonArrayFile(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    atomicWriteFileSync(file, '[]');
    return;
  }
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) atomicWriteFileSync(file, '[]');
    else JSON.parse(raw);
  } catch (_) {
    atomicWriteFileSync(file, '[]');
  }
}

function ensureEncryptedContractsFile() {
  if (!fs.existsSync(CONTRACTS_FILE) || fs.statSync(CONTRACTS_FILE).size === 0) {
    writeEncryptedContracts([]);
    return;
  }
  try {
    const raw = fs.readFileSync(CONTRACTS_FILE, 'utf8').trim();
    if (!raw) return writeEncryptedContracts([]);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Migrate old plaintext JSON contracts to encrypted-at-rest format.
      writeEncryptedContracts(parsed);
      return;
    }
    if (parsed && parsed.encrypted === true) {
      JSON.parse(decryptText(parsed));
      return;
    }
    writeEncryptedContracts([]);
  } catch (error) {
    console.error('Contracts storage could not be read/decrypted. Reinitializing to an empty encrypted store.', error.message);
    writeEncryptedContracts([]);
  }
}

function readEncryptedContracts() {
  ensureEncryptedContractsFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(CONTRACTS_FILE, 'utf8') || '{}');
    if (Array.isArray(parsed)) return parsed;
    if (parsed && parsed.encrypted === true) {
      const contracts = JSON.parse(decryptText(parsed) || '[]');
      return Array.isArray(contracts) ? contracts : [];
    }
  } catch (error) {
    console.error('Failed to read encrypted contracts:', error.message);
  }
  return [];
}

function writeEncryptedContracts(contracts) {
  writeEncryptedList(CONTRACTS_FILE, contracts);
}

function getRequestMetadata(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || req.socket?.remoteAddress || '').split(',')[0].trim();
  return {
    ipAddress: ip || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
    timestamp: new Date().toISOString()
  };
}

function ensureStores() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  ensureEncryptedContractsFile();
  ensureJsonArrayFile(REVIEWS_FILE);
  ensureJsonArrayFile(PAYMENTS_FILE);
  if (!fs.existsSync(INTENTS_FILE)) atomicWriteFileSync(INTENTS_FILE, '[]');
  ensureEncryptedListFile(USERS_FILE);
}

function readJson(file, fallback) {
  ensureStores();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8') || 'null');
    return parsed == null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureStores();
  atomicWriteFileSync(file, JSON.stringify(value, null, JSON_INDENT));
}

function readContracts() { return readEncryptedContracts(); }
function writeContracts(contracts) { writeEncryptedContracts(contracts); }

/* ===== QR Data URL (base64) بدون أي اعتماديات خارجية =====
   MithaqQR يُخرج SVG نظيفاً معيارياً؛ تضمينه كـ data:image/svg+xml;base64
   يعمل في <img> وفي الطباعة (Chrome/Edge/Firefox) وبحجم أصغر من PNG.
   الترميز UTF-8 داخل Base64 يحفظ أي محارف عربية إن وُجدت */
function svgToDataUrl(svg) {
  return 'data:image/svg+xml;base64,' + Buffer.from(String(svg), 'utf8').toString('base64');
}
function readReviews() { return Array.isArray(readJson(REVIEWS_FILE, [])) ? readJson(REVIEWS_FILE, []) : []; }
function writeReviews(reviews) { writeJson(REVIEWS_FILE, reviews); }
function readPayments() { return Array.isArray(readJson(PAYMENTS_FILE, [])) ? readJson(PAYMENTS_FILE, []) : []; }
function writePayments(payments) { writeJson(PAYMENTS_FILE, payments); }

/* ===== المستخدمون (حسابات ميثاق) ===== */
function readUsers() { return readEncryptedList(USERS_FILE); }
function writeUsers(users) { writeEncryptedList(USERS_FILE, users); }
/* سجل التدقيق — يسجل كل عملية حساسة (موافقات الدفع، حذف المستخدمين، تغيير الإعدادات) */
function readAudit() { return readJson(AUDIT_FILE, []); }
function writeAudit(list) { writeJson(AUDIT_FILE, list); }
function logAudit(action, details, actor) {
  try {
    const list = readAudit();
    list.unshift({ id: 'aud_' + newId(), action, details: details || {}, actor: actor || 'system', at: new Date().toISOString() });
    writeAudit(list.slice(0, 1000));
  } catch (error) { console.error('audit log failed:', error.message); }
}
/* حساب المستخدم الحالي: يجلب أو ينشئ سجل مستخدم مربوط بجلسة Google */
function getUserForSession(session) {
  if (!session || !session.userId) return null;
  const users = readUsers();
  let user = users.find(u => String(u.userId) === String(session.userId));
  if (!user) {
    user = {
      userId: String(session.userId),
      name: session.name || 'مستخدم ميثاق',
      email: session.email || '',
      picture: session.picture || '',
      phone: '',
      address: '',
      plan: 'free',
      planExpiresAt: null,
      preferences: { darkMode: false, emailNotifications: true, contractReminders: true, language: 'ar' },
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    };
    users.unshift(user);
    writeUsers(users);
  }
  return user;
}
function updateUserRecord(userId, patch) {
  const users = readUsers();
  const idx = users.findIndex(u => String(u.userId) === String(userId));
  if (idx < 0) return null;
  users[idx] = Object.assign({}, users[idx], patch, { updatedAt: new Date().toISOString() });
  writeUsers(users);
  return users[idx];
}
function isAdminSession(session) {
  if (!session) return false;
  const email = normalize(String(session.email || '')).toLowerCase();
  if (!email) return false;
  if (ADMIN_EMAILS.length) return ADMIN_EMAILS.includes(email);
  /* بيئة تطوير: أول مستخدم يدخل دون ADMIN_EMAILS يُعتبر مشرفاً لتجربة اللوحة */
  return process.env.NODE_ENV !== 'production';
}

function commonHeaders(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': getAllowedCorsOrigin(),
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }, extra || {});
}

function sendJson(res, statusCode, payload, extra) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, commonHeaders(Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }, extra || {})));
  res.end(body);
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, commonHeaders({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) }));
  res.end(html);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, commonHeaders({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(text) }));
  res.end(text);
}

function handleOptions(res) {
  res.writeHead(204, commonHeaders({ 'Access-Control-Max-Age': '86400' }));
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString('utf8');
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parseBody(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function normalize(value) {
  let s = String(value == null ? '' : value).trim();
  // حماية من أحرف اللغة العربية التالفة (U+FFFD) ومحارف التحكم غير المرئية —
  // تُستبدل أو تُحذف فلا تُخزَّن أبداً رسومات مربعات بدل الكلمات العربية
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  s = s.replace(/\uFFFD/g, ' ').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E]/g, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}
function html(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function newId() { return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'); }
function validDate(value) { const d = new Date(value); return value && !Number.isNaN(d.getTime()); }
function arDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' }); }
function formatDateForDocument(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ar-SY', { year: 'numeric', month: '2-digit', day: '2-digit' }); }

// ===== AUTH SESSIONS (جلسات الدخول عبر Google) =====
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const INTENTS_FILE = path.join(DATA_DIR, 'share-intents.json');
const SESSION_COOKIE = 'mithaq_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; /* 30 يوماً */
const INTENT_TTL_MS = 15 * 60 * 1000; /* نافذة تهدئة إشعارات فتح الروابط */

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input == null ? '' : input), 'utf8').digest('hex');
}

/* بصمة رقمية حتمية (SHA-256) لكل عقد — أي تغيير حرف واحد يغيّرها بالكامل */
function contractFingerprint(contract) {
  return sha256Hex([
    contract.id || '', contract.type || '', contract.party1 || '', contract.party2 || '',
    contract.amount || '', contract.date || '', contract.duration || '', contract.paymentMethod || '',
    contract.city || '', contract.subject || '', contract.notes || '',
    (contract.clauses || []).join('\n'), contract.content || ''
  ].join('|'));
}

function contractVerifyPath(contract) { return '/verify/' + encodeURIComponent(contract.id); }

function getBaseUrl() {
  return (process.env.BASE_URL || process.env.PUBLIC_URL || ('http://localhost:' + PORT)).replace(/\/+$/, '');
}

/* ===== نظام التحقق بـ QR (QR Code Verification) ===== */
/* حمولة QR: معرّف العقد + بصمة SHA-256 + وقت الإنشاء + حالة التوقيع */
function buildQrPayload(contract) {
  return {
    v: 1, /* إصدار الصيغة لتوافق مستقبلي */
    id: String(contract.id || ''),
    hash: contractFingerprint(contract),
    createdAt: contract.createdAt || '',
    status: contract.status || 'draft'
  };
}
/* التحقق من بصمة العقد: يُعاد ختم العقود القديمة (قبل نظام البصمة) تلقائياً */
function verifyContractIntegrity(contract) {
  if (!contract.contentHash) {
    contract.contentHash = contractFingerprint(contract);
    return { matched: true, resealed: true };
  }
  return { matched: contractFingerprint(contract) === normalize(contract.contentHash || ''), resealed: false };
}
/* QR مخزَّن داخل بيانات العقد كـ Data URL (base64 PNG) — يُعاد توليده عند تغيّر الحالة */
function sealQrDataUrl(contract) {
  try {
    const verifyUrl = getBaseUrl() + contractVerifyPath(contract);
    const svg = qrCodeSvg.svg(verifyUrl, { size: 160, ecc: 'M', ink: '#111827' });
    contract.qrDataUrl = svgToDataUrl(svg);
  } catch (error) {
    /* فشل توليد QR لا يجب أن يُفشل حفظ العقد أبداً */
    console.error('QR seal failed:', error.message);
  }
  return contract;
}
/* تُستخدم عند إنشاء/تعديل/توقيع العقد: يعاد ختم QR فقط إذا تغيّرت الحالة أو البصمة */
function refreshContractQr(contract) {
  const payload = buildQrPayload(contract);
  const stamp = payload.hash + '|' + payload.status;
  if (contract.qrSealedFor === stamp && contract.qrDataUrl) return contract;
  contract.qrSealedFor = stamp;
  return sealQrDataUrl(contract);
}

/* تخزين عام مشفّر بـ AES-256-GCM (يُستخدم لجلسات المستخدمين) */
function writeEncryptedList(file, list) {
  const payload = encryptText(JSON.stringify(Array.isArray(list) ? list : []));
  atomicWriteFileSync(file, JSON.stringify(payload, null, JSON_INDENT));
}
/* يضمن وجود ملف قائمة مشفّر صالح عند إقلاع الخادم */
function ensureEncryptedListFile(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) { writeEncryptedList(file, []); return; }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) writeEncryptedList(file, parsed); /* ترقية نصية → مشفّرة */
    else if (parsed && parsed.encrypted === true) JSON.parse(decryptText(parsed));
    else writeEncryptedList(file, []);
  } catch (_) { writeEncryptedList(file, []); }
}
function readEncryptedList(file) {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) return [];
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    if (parsed && parsed.encrypted === true) {
      const list = JSON.parse(decryptText(parsed) || '[]');
      return Array.isArray(list) ? list : [];
    }
  } catch (error) {
    console.error('Failed to read encrypted list:', file, error.message);
  }
  return [];
}

function sanitizeSession(session) {
  return {
    userId: session.userId,
    name: session.name,
    email: session.email,
    picture: session.picture || '',
    provider: session.provider || 'google',
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt
  };
}

function createSession(userId, profile) {
  const now = Date.now();
  const session = {
    sessionId: newId(),
    userId,
    name: profile.name || 'مستخدم ميثاق',
    email: profile.email || '',
    picture: profile.picture || '',
    provider: 'google',
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };
  /* إسقاط الجلسات المنتهية وجلسات المستخدم القديمة قبل إضافة الجلسة الحالية */
  const sessions = readEncryptedList(SESSIONS_FILE)
    .filter(s => s.userId !== userId && new Date(s.expiresAt || 0).getTime() > now);
  sessions.unshift(session);
  writeEncryptedList(SESSIONS_FILE, sessions);
  return session;
}

function readSession(sessionId) {
  if (!sessionId) return null;
  const sessions = readEncryptedList(SESSIONS_FILE);
  const session = sessions.find(s => s.sessionId === sessionId);
  if (!session) return null;
  if (new Date(session.expiresAt || 0).getTime() <= Date.now()) {
    writeEncryptedList(SESSIONS_FILE, sessions.filter(s => s.sessionId !== sessionId));
    return null;
  }
  return session;
}

function deleteSession(sessionId) {
  if (!sessionId) return;
  const sessions = readEncryptedList(SESSIONS_FILE);
  writeEncryptedList(SESSIONS_FILE, sessions.filter(s => s.sessionId !== sessionId));
}

function parseSessionFromRequest(req) {
  const auth = req.headers['authorization'] || '';
  let token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    const cookieMatch = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + SESSION_COOKIE + '=([^;]+)'));
    if (cookieMatch) token = decodeURIComponent(cookieMatch[1].trim());
  }
  return readSession(token);
}

function sessionCookie(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

/* سجل نوايا المشاركة — يمنع تكرار إشعارات تيليجرام عند فتح نفس الرابط بشكل متكرر */
function readIntents() {
  try {
    const parsed = JSON.parse(fs.readFileSync(INTENTS_FILE, 'utf8') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}
function writeIntents(list) { atomicWriteFileSync(INTENTS_FILE, JSON.stringify(list, null, JSON_INDENT)); }
function hasRecentIntent(contractId, kind) {
  const intents = readIntents().filter(i => Date.now() - new Date(i.at || 0).getTime() < INTENT_TTL_MS);
  writeIntents(intents);
  return intents.some(i => i.contractId === String(contractId) && i.kind === kind);
}
function recordIntent(contractId, kind) {
  const intents = readIntents().filter(i => Date.now() - new Date(i.at || 0).getTime() < INTENT_TTL_MS);
  intents.push({ contractId: String(contractId), kind, at: new Date().toISOString() });
  writeIntents(intents.slice(-500));
}

/* رسالة المشاركة الرسمية عبر واتساب — تحتوي اسم العقد ورابط التوقيع/التحقق */
function whatsappLink(text) { return 'https://wa.me/?text=' + encodeURIComponent(text); }

function buildOfficialShareMessage(contract, link) {
  const typeName = CONTRACT_TYPES[contract.type] || 'عقد';
  const status = contract.status === 'signed' ? 'مُعتمد ومُوقّع رقمياً ✅' : 'بانتظار التوقيع ⏳';
  const { ref } = contractVerification(contract);
  return [
    '📝 *عقد ' + typeName + '* — منصة ميثاق',
    '',
    'الطرف الأول: ' + (contract.party1 || '—'),
    'الطرف الثاني: ' + (contract.party2 || '—'),
    'الحالة: ' + status,
    '',
    '🔗 رابط العقد: ' + link,
    '',
    '🛡️ مرجع التوثيق: ' + ref
  ].join('\n');
}

function notifyTelegram(text) {
  return sendTelegramMessage(text).catch(error => ({ ok: false, message: (error && error.message) || 'telegram error' }));
}

/* ===== تدقيق Google ID Token =====
   فكّ التشفير (JWT payload) محلياً + تدقيق كامل عبر نقطة tokeninfo الرسمية من Google
   (تتحقق من التوقيع رقمياً وتعيد الادعاءات بعد التحقق). لا اعتماديات خارجية. */
function decodeJwtPayload(token) {
  try {
    const payload = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch (_) { return null; }
}

function fetchGoogleTokenInfo(idToken) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/tokeninfo?id_token=' + encodeURIComponent(idToken),
      method: 'GET',
      timeout: 8000
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode || 0, body: null }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: null }); });
    req.on('error', () => resolve({ status: 0, body: null }));
    req.end();
  });
}

async function verifyGoogleCredential(credential) {
  const localPayload = decodeJwtPayload(credential);
  if (!localPayload || !localPayload.sub) return { ok: false, message: 'توكن Google غير صالح.' };
  const info = await fetchGoogleTokenInfo(credential);
  if (!info.body || info.status !== 200) {
    return { ok: false, message: 'تعذر التحقق من توكن Google (توكن منتهٍ أو غير موقّع من Google).' };
  }
  const claims = info.body;
  if (GOOGLE_CLIENT_ID && claims.aud !== GOOGLE_CLIENT_ID) {
    return { ok: false, message: 'توكن Google صادر لعميل آخر (aud mismatch).' };
  }
  if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') {
    return { ok: false, message: 'مُصدر التوكن غير موثوق.' };
  }
  if (Number(claims.exp) * 1000 < Date.now() - 60 * 1000) {
    return { ok: false, message: 'انتهت صلاحية توكن Google.' };
  }
  if (claims.email && claims.email_verified === false) {
    return { ok: false, message: 'بريد Google غير مُوثّق.' };
  }
  return {
    ok: true,
    profile: {
      sub: String(claims.sub),
      name: normalize(claims.name) || 'مستخدم ميثاق',
      email: normalize(claims.email),
      picture: String(claims.picture || '')
    }
  };
}

/* ===== تنبيهات تيليجرام لأحداث العقد =====
   إشعار فوري لصاحب العقد: فتح العميل رابط العقد، أو إتمام التوقيع. */
async function notifyContractEvent(contract, kind, extra) {
  const info = extra || {};
  const typeName = CONTRACT_TYPES[contract.type] || 'عقد';
  const shareUrl = getBaseUrl() + '/share/' + encodeURIComponent(contract.id || '');
  const { ref } = contractVerification(contract);
  let text;
  if (kind === 'opened') {
    text = [
      '🔔 *العميل فتح العقد الآن*',
      '',
      '📄 عقد: ' + typeName + ' — Ref: ' + ref,
      '👤 الطرف الأول: ' + (contract.party1 || '—'),
      '👥 الطرف الثاني: ' + (info.actorName || contract.party2 || '—'),
      '🕒 ' + new Date().toLocaleString('ar-SY'),
      '',
      '🔗 ' + shareUrl
    ].join('\n');
  } else if (kind === 'signed') {
    text = [
      '✅ *تم اكتمال توقيع العقد بنجاح*',
      '',
      '📄 عقد: ' + typeName + ' — Ref: ' + ref,
      '✍️ وقّع الآن: ' + (info.actorName || 'الطرفين') + ' (' + (info.actorParty || '—') + ')',
      '🛡️ البصمة: ' + contractFingerprint(contract).slice(0, 16).toUpperCase(),
      '🕒 ' + new Date().toLocaleString('ar-SY'),
      '',
      '🔗 ' + getBaseUrl() + contractVerifyPath(contract)
    ].join('\n');
  } else {
    text = [
      '✍️ *توقيع جزئي على العقد*',
      '',
      '📄 عقد: ' + typeName + ' — Ref: ' + ref,
      '✍️ وقّع: ' + (info.actorName || '—') + ' (' + (info.actorParty || '—') + ')',
      '⏳ بانتظار توقيع الطرف الآخر',
      '🕒 ' + new Date().toLocaleString('ar-SY')
    ].join('\n');
  }
  try {
    const result = await sendTelegramMessage(text);
    if (!result.ok) console.warn('Telegram notify failed:', result.message || result.description || 'not configured');
    return result;
  } catch (error) {
    console.warn('Telegram notify error:', error.message);
    return { ok: false };
  }
}

// ===== CONTRACT REFERENCE & VERIFICATION HASH (المرجع ورمز التحقق) =====
// مُشتقّان حتمياً (Deterministic) من معرّف العقد وبياناته حتى يبقى المرجع ثابتاً
// في كل طباعة/مشاركة، ويمكن التحقق منه في أي وقت.
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function contractVerification(contract) {
  const refSeed = hashString(String(contract.id || ''));
  const verifySeed = hashString(String(contract.id || '') + '|' + (contract.updatedAt || contract.createdAt || '') + '|' + (contract.status || ''));
  return {
    ref: 'MEQ-' + String(refSeed % 100000).padStart(5, '0'),
    verify: (verifySeed >>> 0).toString(16).toUpperCase().padStart(8, '0')
  };
}
function securityBadgeHtml(contract) {
  const signed = contract.status === 'signed';
  return signed
    ? '<div class="sec-badge signed"><span class="chk">✓</span>مُعتمد ومُوقّع رقمياً</div>'
    : '<div class="sec-badge"><span class="chk">✎</span>قيد التوقيع</div>';
}

// ===== BIND PLACEHOLDER VARIABLES (تعبئة الحقول الديناميكية) =====
// كل نص بين [قوسين] في البنود يستبدل ديناميكياً من بيانات العقد
// بحيث لا يبقى أي placeholder في العقد النهائي.
function buildPlaceholderMap(contract) {
  const amount = contract.amount || contract.contract_amount || '';
  const scope = contract.subject || contract.contract_scope || '';
  const delivery = contract.duration || contract.delivery_date || '';
  const dateStr = arDate(contract.date);
  return {
    // أسماء الأطراف (كل الصيغ الشائعة)
    'اسم مقدم الخدمة': contract.party2,
    'اسم طالب الخدمة': contract.party1,
    'اسم المستقل': contract.party2,
    'اسم العميل': contract.party1,
    'اسم البائع': contract.party1,
    'اسم المشتري': contract.party2,
    'اسم المؤجر': contract.party1,
    'اسم المستأجر': contract.party2,
    'الطرف الأول': contract.party1,
    'الطرف الثاني': contract.party2,
    'اسم المقر/المتعهد': contract.party1,
    'اسم المستفيد': contract.party2,
    'اسم المورد': contract.party1,
    'أسماء الشركاء': [contract.party1, contract.party2].filter(Boolean).join(' و'),
    // بيانات العقد
    'وصف الخدمة': scope,
    'وصف الخدمة/المشروع': scope,
    'وصف المشروع/الخدمة': scope,
    'وصف المشروع': scope,
    'وصف المبيع وصفاً نافياً للجهالة': scope,
    'وصف التعهد أو الإقرار': scope,
    'وصف البضائع/المواد': scope,
    'نطاق العمل': scope,
    'المقابل المالي/القيمة': amount,
    'المقابل المالي': amount,
    'القيمة المادية': amount,
    'القيمة/المبلغ': amount,
    'المبلغ': amount,
    'مدة التنفيذ/التسليم': delivery,
    'مدة التنفيذ': delivery,
    'تاريخ/مدة التسليم': delivery,
    'تاريخ التسليم': delivery,
    'مدة العقد': delivery,
    'المدة الزمنية': delivery,
    'عدد الأيام': '15',
    'عدد التعديلات': 'جلستين تعديل',
    'طريقة السداد': contract.paymentMethod || 'دفعة واحدة',
    'آلية السداد': contract.paymentMethod || 'دفعة واحدة',
    'المدينة/الدولة': contract.city || '',
    'تاريخ البداية': dateStr,
    'تاريخ النهاية': dateStr,
    'عنوان العقار': scope,
    'الغرض من الإيجار': scope
  };
}

function applyPlaceholders(text, map) {
  let out = String(text || '');
  // استبدال القيم المعروفة أولاً
  for (const [key, value] of Object.entries(map)) {
    if (value == null || value === '') continue;
    out = out.split('[' + key + ']').join(String(value));
  }
  // أي قوس متبقٍ يستبدل بقيمة العقد المناسبة أو بحرف شرطة
  return out.replace(/\[([^\]]{1,80})\]/g, (m, inner) => {
    const t = inner.trim();
    for (const [key, value] of Object.entries(map)) {
      if (value && t.includes(key)) return String(value);
    }
    return '—';
  });
}

function resolveClauses(contract) {
  const map = buildPlaceholderMap(contract);
  return (contract.clauses || []).map(c => applyPlaceholders(c, map));
}

function normalizeClauses(input, type) {
  if (Array.isArray(input)) return input.map(normalize).filter(Boolean);
  if (typeof input === 'string') return input.split('\n').map(normalize).filter(Boolean);
  return DEFAULT_CLAUSES[type] || DEFAULT_CLAUSES.services;
}

function validatePayload(payload, partial) {
  const data = {
    type: normalize(payload.type),
    country: normalize(payload.country),
    party1: normalize(payload.party1),
    party2: normalize(payload.party2),
    amount: normalize(payload.amount),
    date: normalize(payload.date),
    city: normalize(payload.city),
    subject: normalize(payload.subject),
    duration: normalize(payload.duration),
    paymentMethod: normalize(payload.paymentMethod),
    signingMode: normalize(payload.signingMode) === 'quick' ? 'quick' : 'send',
    notes: normalize(payload.notes),
    clauses: normalizeClauses(payload.clauses || payload.customClauses, normalize(payload.type))
  };
  if (!partial || data.type) {
    if (!CONTRACT_TYPES[data.type]) return { ok: false, message: 'نوع العقد غير صحيح.' };
  }
  if (!partial || data.party1) { if (!data.party1) return { ok: false, message: 'الطرف الأول مطلوب.' }; }
  if (!partial || data.party2) { if (!data.party2) return { ok: false, message: 'الطرف الثاني مطلوب.' }; }
  if (!partial || data.date) { if (!validDate(data.date)) return { ok: false, message: 'التاريخ غير صحيح.' }; }
  return { ok: true, data };
}

function buildContractContent(contract) {
  const typeName = CONTRACT_TYPES[contract.type] || 'عقد';
  const lines = [];
  lines.push('بسم الله الرحمن الرحيم', '', typeName, '');
  lines.push(`حرر هذا العقد في ${contract.city ? contract.city + '، ' : ''}بتاريخ ${arDate(contract.date)} بين:`);
  lines.push(`الطرف الأول: ${contract.party1}`);
  lines.push(`الطرف الثاني: ${contract.party2}`);
  if (contract.subject) lines.push(`موضوع العقد: ${contract.subject}`);
  if (contract.amount) lines.push(`القيمة/المبلغ: ${contract.amount}`);
  if (contract.duration) lines.push(`مدة العقد: ${contract.duration}`);
  if (contract.paymentMethod) lines.push(`طريقة السداد: ${contract.paymentMethod}`);
  lines.push('', 'البنود:');
  resolveClauses(contract).forEach((clause, i) => lines.push(`${i + 1}. ${clause}`));
  lines.push('');
  if (contract.notes) lines.push(`ملاحظات إضافية: ${contract.notes}`, '');
  lines.push('يقر الطرفان بأنهما اطلعا على بنود هذا العقد وفهما مضمونه وقبلا الالتزام به.', '');
  lines.push(`توقيع الطرف الأول: ${contract.signatures?.party1?.name || '____________________'}`);
  lines.push(`توقيع الطرف الثاني: ${contract.signatures?.party2?.name || '____________________'}`);
  return lines.join('\n');
}

function makeContract(data) {
  const now = new Date().toISOString();
  const contract = {
    id: newId(),
    type: data.type,
    typeName: CONTRACT_TYPES[data.type],
    country: data.country || '',
    party1: data.party1,
    party2: data.party2,
    amount: data.amount,
    date: data.date,
    city: data.city,
    subject: data.subject,
    duration: data.duration,
    paymentMethod: data.paymentMethod,
    signingMode: data.signingMode || 'send',
    notes: data.notes,
    clauses: data.clauses,
    favorite: false,
    status: 'draft',
    signatures: {},
    reviewStatus: 'none',
    createdAt: now,
    updatedAt: now
  };
  contract.content = buildContractContent(contract);
  /* البصمة المرجعية: تُثبّت عند الإنشاء وتُقارن في /verify لكشف أي تلاعب لاحق */
  contract.contentHash = contractFingerprint(contract);
  return contract;
}
/* لوحة التوقيع عبر الرابط (تظهر في صفحة /share فقط — لا تُطبع ولا تُضمَّن في /print) */
function buildRemoteSignMarkup(contract) {
  const p1 = contract.party1 || 'الطرف الأول';
  const p2 = contract.party2 || 'الطرف الثاني';
  if (contract.status === 'signed') {
    return `<section class="sign-flow no-print" id="signFlow">
  <div class="sf-top"><span class="sf-ico">✅</span><div><b>العقد موقّع رقمياً من الطرفين</b><p>التوقيعان أدناه مسجّلان مع الوقت وبيانات الجهاز ورقم IP لأغراض الإثبات. شارك الرابط للتحقق، أو استخدم نسخة الطباعة لحفظ PDF.</p></div></div>
  <div class="sf-ready"><span>🛡️</span><div>اعتمد التوقيع من: <b>${html(p1)}</b> و <b>${html(p2)}</b></div></div>
</section>`;
  }
  return `<section class="sign-flow no-print" id="signFlow">
  <div class="sf-top"><span class="sf-ico">✍️</span><div><b>التوقيع الرقمي عبر الرابط</b><p id="sfSubHint">ارسم توقيعك بيدك (بالمؤشر أو بإصبعك على الهاتف)؛ يظهر فوراً في الوثيقة مع سجلّ الوقت والجهاز.</p></div></div>
  <div class="sf-ready" id="sfReady" hidden></div>
  <div class="sf-pick" id="sfPick" hidden>
    <button type="button" class="sf-party" data-party="party1"><b id="sfPk1"></b><span>التوقيع بصفة الطرف الأول</span></button>
    <button type="button" class="sf-party" data-party="party2"><b id="sfPk2"></b><span>التوقيع بصفة الطرف الثاني</span></button>
  </div>
  <div class="sf-pad-wrap" id="sfPad" hidden>
    <div class="sf-padlabel"><b id="sfPadTitle"></b><span id="sfPadMeta"></span></div>
    <div class="sf-canvasbox"><canvas id="signCanvas"></canvas></div>
    <div class="sf-name"><label for="signName">الاسم الكامل كما يُدوَّن مع التوقيع</label><input id="signName" type="text" maxlength="80" autocomplete="name"></div>
    <div class="sf-actions">
      <button type="button" class="sf-btn" id="sfUndo" disabled>↶ تراجع عن آخر خطوة</button>
      <button type="button" class="sf-btn" id="sfClear">✕ مسح التوقيع</button>
      <button type="button" class="sf-btn sf-primary" id="sfSubmit" disabled>توقيع وإرسال</button>
    </div>
    <p class="sf-consent">بالتوقيع أعلاه أقرّ باطلاعي على كامل بنود العقد المعروض وموافقتي عليها، وأفهم أن التوقيع يُسجَّل مع الوقت وبيانات الجهاز ورقم IP لأغراض الإثبات.</p>
  </div>
  <div class="sf-done" id="sfDone" hidden></div>
</section>`;
}

/* سكربت التوقيع المستقل (لا يستخدم backticks حتى لا يتعارض مع القالب الخارجي) */
function buildRemoteSignScript(contract) {
  const data = JSON.stringify({
    id: contract.id || '',
    party1: contract.party1 || '',
    party2: contract.party2 || '',
    signed1: Boolean(contract.signatures && contract.signatures.party1 && contract.signatures.party1.dataUrl),
    signed2: Boolean(contract.signatures && contract.signatures.party2 && contract.signatures.party2.dataUrl),
    status: contract.status || 'draft'
  });
  return `
(function () {
  var D = ${data};
  var flow = document.getElementById('signFlow');
  if (!flow) return;
  function q(id) { return document.getElementById(id); }
  var pickEl = q('sfPick'), padEl = q('sfPad'), doneEl = q('sfDone');
  var readyEl = q('sfReady'), titleEl = q('sfPadTitle'), metaEl = q('sfPadMeta');
  var nameEl = q('signName'), submitBtn = q('sfSubmit'), undoBtn = q('sfUndo'), clearBtn = q('sfClear');
  var canvas = q('signCanvas');
  var current = null;
  var strokes = [];
  var drawing = false;
  var submitted = false;
  var padInited = false;

  function toast(text, type) {
    var el = q('toast');
    if (!el) return;
    el.textContent = text;
    el.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.className = 'toast'; }, 4200);
  }
  function partyName(p) { return p === 'party1' ? D.party1 : D.party2; }
  function anyStroke() {
    for (var i = 0; i < strokes.length; i++) if (strokes[i].length >= 2) return true;
    return false;
  }
  function updateUi() {
    submitBtn.disabled = submitted || !anyStroke() || !nameEl.value.trim();
    undoBtn.disabled = strokes.length === 0;
  }
  function canvasRect() {
    var r = canvas.getBoundingClientRect();
    return { w: r.width || 1, h: r.height || 1 };
  }
  function padInk() {
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.6; ctx.strokeStyle = '#18251F';
    var s = strokes[strokes.length - 1];
    if (!s || s.length < 2) return;
    ctx.beginPath(); ctx.moveTo(s[s.length - 2].x, s[s.length - 2].y); ctx.lineTo(s[s.length - 1].x, s[s.length - 1].y); ctx.stroke();
  }
  function redrawCanvas() {
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var dims = canvasRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, dims.w, dims.h);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.6; ctx.strokeStyle = '#18251F';
    for (var i = 0; i < strokes.length; i++) {
      var s = strokes[i];
      ctx.beginPath();
      for (var j = 0; j < s.length; j++) { if (j === 0) ctx.moveTo(s[j].x, s[j].y); else ctx.lineTo(s[j].x, s[j].y); }
      ctx.stroke();
    }
    updateUi();
  }
  function chooseParty(p) {
    current = p;
    pickEl.hidden = true;
    padEl.hidden = false;
    titleEl.textContent = p === 'party1' ? 'توقيع الطرف الأول' : 'توقيع الطرف الثاني';
    metaEl.textContent = 'الموقع المطلوب: ' + (partyName(p) || '');
    nameEl.value = partyName(p) || '';
    if (!padInited) { padInited = true; wirePad(); }
    updateUi();
  }
  function wirePad() {
    function clientX(e) { return e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX; }
    function clientY(e) { return e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY; }
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return { x: clientX(e) - r.left, y: clientY(e) - r.top };
    }
    function fit() {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var dpr = window.devicePixelRatio || 1;
      var w = Math.max(1, Math.round(r.width * dpr));
      var h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      redrawCanvas();
    }
    function start(e) {
      if (submitted) return;
      e.preventDefault();
      drawing = true;
      strokes.push([pos(e)]);
    }
    function move(e) {
      if (!drawing || submitted) return;
      e.preventDefault();
      strokes[strokes.length - 1].push(pos(e));
      padInk();
    }
    function end() {
      if (!drawing) return;
      drawing = false;
      updateUi();
    }
    var rtimer = null;
    window.addEventListener('resize', function () { clearTimeout(rtimer); rtimer = setTimeout(fit, 160); });
    setTimeout(fit, 80);
    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', start);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
    } else {
      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', move);
      canvas.addEventListener('mouseup', end);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', move, { passive: false });
      canvas.addEventListener('touchend', end);
    }
  }
  function startFlow() {
    if (D.status === 'signed') return;
    var auto = null;
    if (D.signed1 && !D.signed2) auto = 'party2';
    else if (D.signed2 && !D.signed1) auto = 'party1';
    if (auto) {
      if (auto === 'party2') readyEl.innerHTML = '<span>✓</span><div>وقّع الطرف الأول <b>' + partyName('party1') + '</b> مسبقاً — بانتظار توقيعك أنت بصفة <b>الطرف الثاني</b>.</div>';
      else readyEl.innerHTML = '<span>✓</span><div>وقّع الطرف الثاني <b>' + partyName('party2') + '</b> مسبقاً — بانتظار توقيعك أنت بصفة <b>الطرف الأول</b>.</div>';
      readyEl.hidden = false;
      chooseParty(auto);
    } else {
      q('sfPk1').textContent = partyName('party1');
      q('sfPk2').textContent = partyName('party2');
      pickEl.hidden = false;
    }
  }
  function showDone(ok, text) {
    doneEl.innerHTML = '<span>' + (ok ? '✅' : '⚠️') + '</span><div>' + text + '</div>';
    doneEl.className = 'sf-done' + (ok ? '' : ' err');
    doneEl.hidden = false;
  }
  function submit() {
    if (submitted) return;
    var name = nameEl.value.trim();
    if (!current || !anyStroke() || !name) { toast('ارسم توقيعك واكتب اسمك أولاً.', 'error'); return; }
    submitted = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الإرسال…';
    var dataUrl = '';
    try { dataUrl = canvas.toDataURL('image/png'); } catch (e) { dataUrl = ''; }
    fetch('/api/contracts/' + encodeURIComponent(D.id) + '/signatures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ party: current, name: name, signatureData: dataUrl })
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body.message || 'تعذر حفظ التوقيع');
        return body;
      });
    }).then(function () {
      showDone(true, 'تم تسجيل توقيعك بنجاح. سيتم تحديث الوثيقة الآن لعرض التوقيع والحالة الجديدة…');
      toast('تم تسجيل التوقيع ✓');
      setTimeout(function () { location.reload(); }, 2000);
    }).catch(function (err) {
      submitted = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'توقيع وإرسال';
      showDone(false, err.message || 'تعذر إرسال التوقيع. تحقق من اتصالك ثم أعد المحاولة.');
    });
  }
  if (pickEl) {
    pickEl.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.sf-party') : null;
      if (b) chooseParty(b.getAttribute('data-party'));
    });
  }
  if (undoBtn) undoBtn.addEventListener('click', function () { if (strokes.length) { strokes.pop(); redrawCanvas(); } });
  if (clearBtn) clearBtn.addEventListener('click', function () { strokes = []; redrawCanvas(); });
  if (nameEl) nameEl.addEventListener('input', updateUi);
  if (submitBtn) submitBtn.addEventListener('click', submit);
  startFlow();
})();`;
}


function publicContractHtml(contract, printable) {
  const typeName = CONTRACT_TYPES[contract.type] || 'عقد';
  const title = `${typeName} - ميثاق`;
  const clauses = resolveClauses(contract).map((c) => `<li>${html(c)}</li>`).join('');
  const sig1 = contract.signatures?.party1?.dataUrl ? `<img src="${contract.signatures.party1.dataUrl}" alt="توقيع الطرف الأول">` : '<span>لم يوقع بعد</span>';
  const sig2 = contract.signatures?.party2?.dataUrl ? `<img src="${contract.signatures.party2.dataUrl}" alt="توقيع الطرف الثاني">` : '<span>لم يوقع بعد</span>';
  const logo = '/assets/mithaq-logo.svg';
  const printButton = printable ? '<button class="btn" onclick="window.print()">طباعة / حفظ PDF</button>' : '';
  const secBadge = securityBadgeHtml(contract);
  const { ref, verify } = contractVerification(contract);
  /* بصمة SHA-256 حتمية لمحتوى العقد — تُطبع في التذييل وتُقارن في صفحة التحقق */
  const fingerprint = contractFingerprint(contract);
  const verifyPath = contractVerifyPath(contract);
  const verifyUrl = getBaseUrl() + verifyPath;
  const shareUrl = getBaseUrl() + '/share/' + encodeURIComponent(contract.id || '');
  /* رمز QR حقيقي (QR Code Model 2) يشير إلى صفحة التحقق العامة — يُولَّد في الخادم */
  const qrSvg = qrCodeSvg.svg(verifyUrl, { size: 96, ecc: 'M', ink: '#111827' });
  /* QR مخزَّن كـ Data URL (يُختم عند الحفظ) مع توليد احتياطي للعقود القديمة */
  const qrDataUrl = contract.qrDataUrl || svgToDataUrl(qrCodeSvg.svg(verifyUrl, { size: 160, ecc: 'M', ink: '#111827' }));
  const waHref = whatsappLink(buildOfficialShareMessage(contract, shareUrl));
  const shareButton = `<a class="btn btn-wa" href="${html(waHref)}" target="_blank" rel="noopener"><span aria-hidden="true">💬</span> مشاركة عبر واتساب</a>`;
  const signMarkup = printable ? '' : buildRemoteSignMarkup(contract);
  const signScript = printable ? '' : buildRemoteSignScript(contract);
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${html(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root{--kufic-ink:#111827;--kufic-gold:#D97706;--ink:#18251F;--muted:#6B7280;--line:#E5E7EB}
    *{box-sizing:border-box}
    body{margin:0;background:#F5F6F8;color:var(--ink);font-family:Cairo,Arial,sans-serif;font-size:12px;line-height:1.45}
    .shell{margin:0;padding:0}
    .actions{display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap}.btn{border:0;border-radius:10px;background:var(--kufic-ink);color:#fff;padding:10px 15px;font:800 14px Cairo;cursor:pointer;text-decoration:none}
    .btn-wa{background:#25D366!important;color:#fff!important}
    /* ===== TOAST ===== */
    .toast{position:fixed;left:22px;bottom:22px;z-index:999;display:none;gap:10px;max-width:min(420px,calc(100vw - 44px));padding:13px 16px;border-radius:14px;background:var(--ink);color:#fff;font-weight:800;font-size:13px;box-shadow:0 18px 40px rgba(0,0,0,.24)}
    .toast.show{display:flex}.toast.error{background:#7a1a1a}
    /* ===== STRICT A4 PORTRAIT CONTAINER ===== */
    .page{max-width:210mm;min-height:297mm;margin:20px auto;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.08);padding:15mm 18mm 24mm;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;position:relative}
    /* ===== تذييل PDF ثابت في أسفل كل صفحة: QR 80×80 + نص التحقق ===== */
    .pdf-footer{position:absolute;left:18mm;right:18mm;bottom:8mm;display:flex;align-items:center;gap:10px;border-top:1px solid var(--line);padding-top:5px}
    .pdf-footer .pdf-qr{width:80px;height:80px;flex:0 0 80px;display:block}
    .pdf-footer .pdf-verify{font-size:9px;color:var(--muted);font-weight:600;line-height:1.7}
    .pdf-footer .pdf-verify b{color:var(--kufic-ink);font-size:9.5px}
    .pdf-footer .pdf-ref{margin-inline-start:auto;text-align:left;font-size:8px;color:var(--muted);unicode-bidi:embed;direction:ltr}
    @media print{
      .pdf-footer{left:15mm;right:15mm;bottom:6mm}
      .pdf-footer,.pdf-footer *{page-break-inside:avoid}
    }
    /* ===== SECURITY BADGE (شارة الأمان) ===== */
    .sec-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:8.5px;font-weight:800;background:#FDF6E7;border:1px solid #F1E2C0;color:#8A6414;white-space:nowrap;flex:0 0 auto}
    .sec-badge .chk{display:inline-grid;place-items:center;width:13px;height:13px;border-radius:50%;background:#D97706;color:#fff;font-size:8px;line-height:1}
    .sec-badge.signed{background:#E9F6EE;border-color:#BFE3CD;color:#157347}
    .sec-badge.signed .chk{background:#1D9E57}
    /* ===== COMPACT HEADER (<=55px) ===== */
    .doc-head{display:flex;align-items:center;gap:10px;height:48px;padding:0 0 8px;border-bottom:1px solid var(--line)}
    .brand{display:flex;align-items:center;gap:9px;min-width:0}
    .brand img{width:34px;height:34px;flex:0 0 auto}
    .brand .t{display:flex;flex-direction:column;line-height:1.05}
    .brand .t b{font-size:15px;font-weight:900;color:var(--kufic-ink);letter-spacing:.5px}
    .brand .t small{font-size:8.5px;font-weight:600;color:var(--muted);letter-spacing:.2px;white-space:nowrap}
    .seal{margin-inline-start:auto;text-align:right;font-size:9px;color:var(--muted);font-weight:700;line-height:1.25}
    .seal b{display:block;color:var(--kufic-gold);font-size:10px}
    .doc-title{text-align:center;margin:10px 0 12px}.doc-title h2{margin:0;font-size:15px;font-weight:900;color:var(--kufic-ink)}.doc-title p{margin:2px 0 0;font-size:10px;color:var(--muted);font-weight:600}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.box{background:#FAFAFA;border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:11.5px}.box b{display:block;color:var(--kufic-ink);margin-bottom:1px;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
    h3{font-size:14px;font-weight:900;color:var(--kufic-ink);margin:12px 0 6px;border-bottom:1px solid var(--line);padding-bottom:4px}
    ol{margin:0;padding:0 20px 0 0}.clauses li{margin:0 0 5px;padding-right:2px;text-align:justify}
    /* ===== SIGNATURES + QR side-by-side, kept on one page ===== */
    .bottom-row{display:flex;gap:12px;align-items:stretch;margin-top:14px;page-break-inside:avoid;break-inside:avoid}
    .sig-card{flex:1 1 0;border:1px solid var(--line);border-radius:8px;padding:8px 10px;page-break-inside:avoid;break-inside:avoid}
    .sig-card b{display:block;font-size:10.5px;color:var(--kufic-ink);margin-bottom:5px}
    .sig{height:64px;border:1px dashed #C7CDD4;border-radius:6px;display:grid;place-items:center;color:var(--muted);font-size:10px;background:#FCFCFD}.sig img{max-width:90%;max-height:56px}
    .qr-card{flex:0 0 150px;border:1px solid var(--line);border-radius:8px;padding:8px;text-align:center;page-break-inside:avoid;break-inside:avoid}
    .qr-card b{display:block;font-size:10.5px;color:var(--kufic-ink);margin-bottom:5px}
    .qr-card img{width:85px;height:85px;border:1px solid var(--line);border-radius:6px;display:block;background:#fff}
    .qr-card small{display:block;margin-top:4px;font-size:8.5px;color:var(--muted)}
    .disclaimer{margin-top:10px;padding:8px 10px;border-radius:8px;background:#FDF6E7;border:1px solid #F1E2C0;color:#7A5B16;font-size:9.5px;font-weight:600}
    .foot{display:flex;justify-content:space-between;gap:10px;margin-top:10px;color:var(--muted);font-size:9px;border-top:1px solid var(--line);padding-top:6px;flex-wrap:wrap}
    .foot .ref{color:#8A6414;font-weight:700;unicode-bidi:embed;direction:ltr}
    .foot .fp{color:#8A6414;font-weight:700;unicode-bidi:embed;direction:ltr;letter-spacing:.4px}
    /* ===== REMOTE SIGN FLOW (التوقيع عبر الرابط) ===== */
    .sign-flow{max-width:210mm;margin:18px auto 46px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px;box-shadow:0 6px 22px rgba(0,0,0,.07)}
    .sf-top{display:flex;align-items:flex-start;gap:11px;margin-bottom:12px}
    .sf-ico{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:#FDF6E7;border:1px solid #F1E2C0;font-size:18px;flex:0 0 auto}
    .sf-top b{display:block;font-size:14px;font-weight:900;color:var(--kufic-ink)}
    .sf-top p{margin:2px 0 0;font-size:11px;color:var(--muted);font-weight:600;line-height:1.7}
    .sf-ready{display:flex;gap:9px;align-items:flex-start;padding:12px 14px;border-radius:10px;background:#E9F6EE;border:1px solid #BFE3CD;color:#157347;font-size:12px;font-weight:700;line-height:1.8}
    .sf-ready span{flex:0 0 auto}
    .sf-pick{display:flex;gap:10px;flex-wrap:wrap}
    .sf-party{flex:1 1 220px;text-align:start;display:flex;flex-direction:column;gap:2px;padding:13px 15px;border:1.5px solid var(--line);border-radius:11px;background:#fff;cursor:pointer;font-family:Cairo;color:var(--ink);transition:border-color .15s ease,background .15s ease}
    .sf-party:hover{border-color:#D97706;background:#FFFBF0}
    .sf-party b{font-size:13.5px;font-weight:900;color:var(--kufic-ink)}
    .sf-party span{font-size:11px;color:var(--muted);font-weight:600}
    .sf-pad-wrap{margin-top:14px;border-top:1px dashed #D1D5DB;padding-top:14px}
    .sf-padlabel{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:8px}
    .sf-padlabel b{font-size:13px;font-weight:900;color:var(--kufic-ink)}
    .sf-padlabel span{font-size:10.5px;color:var(--muted);font-weight:600}
    .sf-canvasbox{position:relative;border:1.5px dashed #C7CDD4;border-radius:10px;background:#fff;overflow:hidden;touch-action:none}
    #signCanvas{display:block;width:100%;height:150px;cursor:crosshair;touch-action:none}
    .sf-name{margin-top:10px}
    .sf-name label{display:block;font-size:11px;font-weight:800;color:var(--muted);margin-bottom:4px}
    .sf-name input{width:100%;padding:9px 12px;border:1.5px solid var(--line);border-radius:9px;font:700 13px Cairo;color:var(--ink);outline:none;box-sizing:border-box}
    .sf-name input:focus{border-color:#D97706}
    .sf-actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
    .sf-btn{border:1px solid var(--line);background:#fff;color:var(--ink);padding:9px 14px;border-radius:9px;font:800 12px Cairo;cursor:pointer;transition:.15s}
    .sf-btn:hover{border-color:#D97706;color:#92400E}
    .sf-btn:disabled{opacity:.45;cursor:not-allowed}
    .sf-primary{background:var(--kufic-ink);border-color:var(--kufic-ink);color:#fff;margin-inline-start:auto}
    .sf-primary:hover{background:#1f2937;color:#fff;border-color:#1f2937}
    .sf-consent{margin:12px 0 0;font-size:10px;line-height:1.8;color:var(--muted);font-weight:600;background:#F9FAFB;border:1px solid var(--line);border-radius:8px;padding:8px 10px}
    .sf-done{display:flex;gap:10px;align-items:flex-start;padding:13px 15px;border-radius:11px;background:#E9F6EE;border:1px solid #BFE3CD;color:#157347;font-weight:800;font-size:13px;line-height:1.8}
    .sf-done.err{background:#FDECEC;border-color:#F5C2C2;color:#7a1a1a}
    .sf-done span{font-size:17px;flex:0 0 auto}
    @media print{
      body{background:#fff}
      html,body{margin:0!important;padding:0!important}
      .shell{max-width:none;margin:0;padding:0}.actions{display:none}
      .no-print{display:none!important}
      /* ورقة A4 بمقاس صريح: هوامش الصفحة صفر والحشوة داخل الورقة نفسها
         حتى لا يتغيّر مقاس الـ PDF حسب ورق الطابعة (Letter/A4) أو إعدادات المتصفح
         هوامش الورقة نفسها تُصفّر في الطباعة و min-height يُلغى — وإلا امتلأ
         ارتفاع 297mm بالضبط + هوامش 20px فانزلق آخر شريحة إلى صفحة بيضاء */
      .page{border:0;box-shadow:none;border-radius:0;width:210mm;margin:0!important;min-height:0;padding:14mm 15mm 26mm;box-sizing:border-box}
      @page{size:210mm 297mm;margin:0}
      .clauses li{page-break-inside:avoid;orphans:2;widows:2}
      .grid{page-break-inside:avoid}
      .bottom-row,.sig-card,.qr-card{page-break-inside:avoid;break-inside:avoid}
      .disclaimer,.foot{page-break-inside:avoid}
    }
    @media(max-width:650px){.bottom-row{flex-direction:column}.qr-card{flex:1 1 auto}}
  </style>
</head>
<body>
  <main class="shell">
    <div class="actions">${printButton}${shareButton}</div>
    <div id="toast" class="toast">تم نسخ رابط التوقيع.</div>
    <article class="page">
      <header class="doc-head">
        <div class="brand">
          <img src="${logo}" alt="ميثاق — ختم كوفي مربع">
          <div class="t"><b>مِــيــثَــاق</b><small>منظومة العقود والتوثيق الإلكتروني</small></div>
        </div>
        <div class="seal"><b>وثيقة إلكترونية</b>${html(formatDateForDocument(contract.createdAt || contract.date))}</div>
        ${secBadge}
      </header>
      <section class="doc-title"><h2>${html(typeName)}</h2><p>تم إنشاء هذه المسودة عبر منصة ميثاق بتاريخ ${html(arDate(contract.date))}</p></section>
      <section class="grid">
        <div class="box"><b>الطرف الأول</b>${html(contract.party1 || 'غير محدد')}</div>
        <div class="box"><b>الطرف الثاني</b>${html(contract.party2 || 'غير محدد')}</div>
        ${contract.amount ? `<div class="box"><b>القيمة/المبلغ</b>${html(contract.amount)}</div>` : ''}
        ${contract.city ? `<div class="box"><b>المدينة</b>${html(contract.city)}</div>` : ''}
        ${contract.subject ? `<div class="box"><b>موضوع العقد</b>${html(contract.subject)}</div>` : ''}
        ${contract.duration ? `<div class="box"><b>مدة العقد</b>${html(contract.duration)}</div>` : ''}
        ${contract.paymentMethod ? `<div class="box"><b>طريقة السداد</b>${html(contract.paymentMethod)}</div>` : ''}
      </section>
      <h3>بنود العقد</h3>
      <ol class="clauses">${clauses}</ol>
      ${contract.notes ? `<h3>ملاحظات إضافية</h3><p>${html(contract.notes)}</p>` : ''}
      <div class="bottom-row">
        <div class="sig-card"><b>توقيع الطرف الأول</b><div class="sig">${sig1}</div></div>
        <div class="sig-card"><b>توقيع الطرف الثاني</b><div class="sig">${sig2}</div></div>
        <div class="qr-card"><b>رمز التحقق</b>${qrSvg}<small>امسح للتحقق من بصمة العقد</small></div>
      </div>
      <div class="disclaimer">تنبيه: هذه الوثيقة مسودة تنظيمية قابلة للمراجعة القانونية، ولا تُعد بديلاً عن استشارة محامٍ مختص في الحالات المعقدة أو عالية القيمة.</div>
      <footer class="foot"><span>معرّف العقد: ${html(contract.id || '')}</span><span class="ref">Ref: ${html(ref)} | AES: ${html(verify)}</span><span class="fp" title="بصمة SHA-256 لمحتوى العقد">FP: ${html(fingerprint.slice(0, 24).toUpperCase())}…</span><span style="color:#1D4A3E;font-weight:700">🇸🇾 ميثاق — منصة العقود الذكية العربية</span></footer>
      <footer class="pdf-footer" style="border-top-color:var(--line)">
        <img class="pdf-qr" src="${qrDataUrl}" alt="رمز التحقق من العقد" width="80" height="80">
        <div class="pdf-verify"><b>تحقق من صحة العقد: <span style="direction:ltr;unicode-bidi:embed">mithaq.app/verify</span></b><br>امسح الرمز أو أدخل معرّف العقد في صفحة التحقق — بصمة SHA-256 تكشف أي تعديل</div>
        <div class="pdf-ref">ID: ${html(String(contract.id || '').slice(0, 8))}…<br>FP: ${html(fingerprint.slice(0, 10).toUpperCase())}</div>
      </footer>
    </article>
    ${signMarkup}
  </main>
  <script>
    var CONTRACT_ID = ${JSON.stringify(contract.id || '')};
    var VERIFY_URL = ${JSON.stringify(verifyUrl)};
    ${printable ? "setTimeout(()=>window.print(),550)" : ""}
    // QR يُولَّد في الخادم (frontend/assets/qr.js) ويُحقن كـ SVG — لا رسم في المتصفح.
    ${signScript}
  </script>
</body>
</html>`;
}

/* ===== صفحة التحقق العامة (/verify/:id) =====
   صفحة خفيفة وسريعة: تقرأ بيانات العقد دون كشف أي تفاصيل مالية حساسة،
   تعرض شارة التوثيق وجدول الطرفين وبصمة SHA-256، وتحذّر بالأحمر عند أي تلاعب. */
function verifyContractHtml(contract, matched) {
  const typeName = CONTRACT_TYPES[contract.type] || 'عقد';
  const fingerprint = contractFingerprint(contract);
  const fp16 = fingerprint.slice(0, 16).toUpperCase();
  const verifyUrl = getBaseUrl() + contractVerifyPath(contract);
  const qrSvg = qrCodeSvg.svg(verifyUrl, { size: 110, ecc: 'M', ink: matched ? '#157347' : '#B91C1C' });
  const p1 = contract.signatures?.party1?.name || contract.party1 || '—';
  const p2 = contract.signatures?.party2?.name || contract.party2 || '—';
  const signedAt1 = contract.signatures?.party1?.signedAt || '';
  const signedAt2 = contract.signatures?.party2?.signedAt || '';
  const signDates = [signedAt1, signedAt2].filter(Boolean).map(arDate);
  const lastSignDate = signDates.length ? signDates[signDates.length - 1] : arDate(contract.date || contract.createdAt);
  const badge = matched
    ? '<div class="v-badge ok"><span class="ic">✓</span><div><b>عقد موثق وسليم 100%</b><small>البصمة الرقمية مطابقة للأصل المخزّن</small></div></div>'
    : '<div class="v-badge bad"><span class="ic">✕</span><div><b>هذا العقد غير مطابق للبصمة الأصلية</b><small>رُصد تلاعب أو تعديل غير معتمد على المحتوى</small></div></div>';
  const badgeColor = matched ? '#157347' : '#B91C1C';
  const rows = [
    ['نوع العقد', typeName],
    ['الطرف الأول', p1],
    ['الطرف الثاني', p2],
    ['تاريخ التحرير', arDate(contract.date || contract.createdAt)],
    ['تاريخ التوقيع', lastSignDate],
    ['حالة التوقيع', contract.status === 'signed' ? 'موقّع من الطرفين' : (contract.status === 'partially_signed' ? 'توقيع جزئي' : 'قيد التوقيع')]
  ].map(r => `<tr><th>${html(r[0])}</th><td>${html(r[1])}</td></tr>`).join('');
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>التحقق من العقد — ميثاق</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--ink:#18251F;--muted:#6B7280;--line:#E5E7EB}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#F5F6F8;color:var(--ink);font-family:Cairo,Arial,sans-serif}
.card{width:100%;max-width:560px;background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.08);overflow:hidden}
.head{display:flex;align-items:center;gap:10px;padding:16px 22px;border-bottom:1px solid var(--line)}
.head img{width:34px;height:34px}
.head b{font-size:16px;font-weight:900;letter-spacing:.5px}
.head small{display:block;font-size:9.5px;color:var(--muted);font-weight:600}
.head .id{margin-inline-start:auto;font-size:10px;color:var(--muted);direction:ltr;unicode-bidi:embed}
.body{padding:22px}
.v-badge{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:14px;border:1.5px solid;font-weight:800}
.v-badge.ok{background:#E9F6EE;border-color:#BFE3CD;color:#157347}
.v-badge.bad{background:#FDECEC;border-color:#F5C2C2;color:#B91C1C}
.v-badge .ic{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:currentColor;color:#fff;font-size:18px;flex:0 0 auto}
.v-badge b{display:block;font-size:15px}
.v-badge small{display:block;font-size:11px;font-weight:600;opacity:.85}
.qr-wrap{display:flex;gap:16px;align-items:center;margin:18px 0;padding:14px;border:1px solid var(--line);border-radius:14px;background:#FAFAFA}
.qr-wrap img{width:110px;height:110px;border-radius:10px;background:#fff;flex:0 0 auto}
.qr-wrap p{margin:0;font-size:11.5px;color:var(--muted);font-weight:600;line-height:1.9}
.qr-wrap b{color:var(--ink);font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
tr{border-bottom:1px solid var(--line)}
tr:last-child{border-bottom:0}
th{text-align:right;padding:9px 4px;color:var(--muted);font-size:11px;font-weight:700;width:38%;white-space:nowrap}
td{text-align:right;padding:9px 4px;font-weight:700}
.fp-box{margin-top:16px;padding:12px 14px;border-radius:12px;border:1.5px dashed ${badgeColor};background:${matched ? '#F2FBF5' : '#FDF2F2'}}
.fp-box small{display:block;font-size:10px;color:var(--muted);font-weight:700;margin-bottom:4px}
.fp-box code{display:block;direction:ltr;unicode-bidi:embed;font-size:12px;font-weight:800;letter-spacing:.6px;word-break:break-all;color:${badgeColor}}
.actions{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:7px;border:0;border-radius:10px;background:#18251F;color:#fff;padding:10px 16px;font:800 12.5px Cairo;cursor:pointer;text-decoration:none}
.btn-wa{background:#25D366}
.foot{padding:12px 22px;border-top:1px solid var(--line);text-align:center;font-size:10px;color:var(--muted);font-weight:600}
</style>
</head>
<body>
<div class="card">
  <div class="head">
    <img src="/assets/mithaq-logo.svg" alt="ميثاق">
    <div><b>مِــيــثَــاق</b><small>خدمة التحقق من العقود الرقمية</small></div>
    <span class="id">ID: ${html(contract.id || '')}</span>
  </div>
  <div class="body">
    ${badge}
    <div class="qr-wrap">
      ${qrSvg}
      <p><b>رمز التحقق الرسمي</b><br>يشير إلى صفحة هذه البصمة:<br><span style="direction:ltr;unicode-bidi:embed">${html(verifyUrl)}</span></p>
    </div>
    <table>${rows}</table>
    <div class="fp-box">
      <small>بصمة المحتوى الرقمية (SHA-256) — أول 16 خانة من ${fingerprint.length}</small>
      <code>${html(fp16)}…</code>
    </div>
    <div class="actions">
      <a class="btn" href="/share/${html(contract.id || '')}">عرض العقد كاملاً</a>
      <a class="btn" style="background:#6B7280" href="/verify">التحقق من عقد آخر</a>
      <a class="btn btn-wa" target="_blank" rel="noopener" href="${html(whatsappLink(buildOfficialShareMessage(contract, getBaseUrl() + '/share/' + encodeURIComponent(contract.id || ''))))}">💬 مشاركة عبر واتساب</a>
    </div>
  </div>
  <div class="foot">🛡️ يتحقق هذا الرابط من مطابقة محتوى العقد للبصمة المخزّنة عند التوقيع — منصة ميثاق للعقود الذكية</div>
</div>
</body>
</html>`;
}

/* ===== صفحة التحقق العامة (/verify) — إدخال يدوي لمعرّف العقد أو فتح مباشر من QR ===== */
function verifyLandingHtml(prefillId) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>التحقق من صحة العقد — ميثاق</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--ink:#18251F;--muted:#6B7280;--line:#E5E7EB;--green:#157347}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#F5F6F8;color:var(--ink);font-family:Cairo,Arial,sans-serif}
.card{width:100%;max-width:560px;background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.08);overflow:hidden}
.head{display:flex;align-items:center;gap:10px;padding:16px 22px;border-bottom:1px solid var(--line)}
.head img{width:34px;height:34px}
.head b{font-size:16px;font-weight:900;letter-spacing:.5px}
.head small{display:block;font-size:9.5px;color:var(--muted);font-weight:600}
.body{padding:22px}
.hint{font-size:12px;color:var(--muted);font-weight:600;line-height:1.9;margin:0 0 16px}
label{display:block;font-size:12px;font-weight:800;margin-bottom:6px;color:var(--ink)}
.row{display:flex;gap:8px}
input{flex:1;min-width:0;border:1.5px solid var(--line);border-radius:10px;padding:11px 13px;font:700 13px Cairo;direction:ltr;text-align:left;outline:none}
input:focus{border-color:var(--green)}
button{border:0;border-radius:10px;background:var(--green);color:#fff;padding:11px 18px;font:800 13px Cairo;cursor:pointer;white-space:nowrap}
.err{display:none;margin-top:12px;padding:11px 14px;border-radius:11px;background:#FDECEC;border:1px solid #F5C2C2;color:#B91C1C;font-weight:700;font-size:12.5px;line-height:1.8}
.err.show{display:block}
.steps{margin:18px 0 0;padding:14px;border:1px solid var(--line);border-radius:12px;background:#FAFAFA;font-size:11px;color:var(--muted);font-weight:600;line-height:2}
.steps b{color:var(--ink)}
.foot{padding:12px 22px;border-top:1px solid var(--line);text-align:center;font-size:10px;color:var(--muted);font-weight:600}
</style>
</head>
<body>
<div class="card">
  <div class="head">
    <img src="/assets/mithaq-logo.svg" alt="ميثاق">
    <div><b>مِــيــثَــاق</b><small>خدمة التحقق من العقود الرقمية</small></div>
  </div>
  <div class="body">
    <p class="hint">امسح رمز QR المطبع في تذييل العقد للتحقق الفوري، أو أدخل معرّف العقد يدوياً للتحقق من صحة البصمة الرقمية (SHA-256).</p>
    <form id="vform">
      <label for="cid">معرّف العقد (Contract ID)</label>
      <div class="row">
        <input id="cid" name="cid" autocomplete="off" spellcheck="false" placeholder="مثال: 5bdeeb18-a33d-4b49…" value="${html(prefillId || '')}">
        <button type="submit">تحقق الآن</button>
      </div>
    </form>
    <div class="err" id="verr"></div>
    <div class="steps">
      <b>ماذا يتحقق النظام؟</b><br>
      ✅ مطابقة بصمة SHA-256 لمحتوى العقد الحالي مع البصمة المخزّنة عند الإنشاء/التوقيع<br>
      ✅ حالة التوقيع وتاريخ الإنشاء وأسماء الطرفين (دون تفاصيل مالية حساسة)<br>
      ❌ أي تعديل ولو بحرف واحد يجعل البصمة غير مطابقة وسيظهر تحذير أحمر
    </div>
  </div>
  <div class="foot">🛡️ صفحة تحقق عامة لا تعرض بيانات حساسة — منصة ميثاق للعقود الذكية</div>
</div>
<script>
  var f = document.getElementById('vform');
  var errBox = document.getElementById('verr');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = document.getElementById('cid').value.trim();
    errBox.classList.remove('show');
    if (!id) { errBox.textContent = 'أدخل معرّف العقد أولاً.'; errBox.classList.add('show'); return; }
    fetch('/api/verify/' + encodeURIComponent(id)).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (res) {
      if (res.ok && res.d && res.d.found) { window.location.href = '/verify/' + encodeURIComponent(id); }
      else { errBox.textContent = (res.d && res.d.message) || 'تعذر التحقق من هذا المعرّف.'; errBox.classList.add('show'); }
    }).catch(function () { errBox.textContent = 'تعذر الاتصال بالخادم.'; errBox.classList.add('show'); });
  });
</script>
</body>
</html>`;
}


function findContract(id) {
  const contracts = readContracts();
  const index = contracts.findIndex(c => String(c.id) === String(id));
  return { contracts, index, contract: index >= 0 ? contracts[index] : null };
}



const AGENTS = [
  { id: 'ceo', name: 'وكيل الرئيس التنفيذي', title: 'رؤية وأولويات', icon: '👑' },
  { id: 'product', name: 'وكيل المنتج', title: 'تجربة المستخدم والميزات', icon: '🧭' },
  { id: 'marketing', name: 'وكيل التسويق', title: 'المحتوى والحملات', icon: '📣' },
  { id: 'sales', name: 'وكيل المبيعات', title: 'العملاء والتحويل', icon: '🤝' },
  { id: 'finance', name: 'وكيل المالية', title: 'المدفوعات والإيرادات', icon: '💰' },
  { id: 'legal', name: 'وكيل القانون', title: 'التنبيهات والمراجعات', icon: '⚖️' },
  { id: 'support', name: 'وكيل الدعم', title: 'الأسئلة والمشاكل', icon: '💬' },
  { id: 'cto', name: 'وكيل التقنية', title: 'الأخطاء والبنية', icon: '🛠️' },
  { id: 'growth', name: 'وكيل النمو', title: 'الانتشار والشراكات', icon: '🚀' },
  { id: 'designer', name: 'وكيل التصميم', title: 'قوالب الهوية والمحتوى', icon: '🎨' },
  { id: 'meeting_manager', name: 'مسؤول الاجتماعات', title: 'تنسيق المجلس والخطط الأسبوعية', icon: '🏛️' },
  { id: 'telegram_operator', name: 'مسؤول تلجرام', title: 'واجهة التواصل مع المؤسس', icon: '📲' }
];

function countBy(items, selector) {
  return items.reduce((acc, item) => {
    const key = selector(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function topContractType(contracts) {
  const counts = countBy(contracts, c => c.typeName || CONTRACT_TYPES[c.type] || c.type);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || ['لا يوجد بعد', 0];
}

function getAgentsSummary() {
  const contracts = readContracts();
  const payments = readPayments();
  const reviews = readReviews();
  const paidPayments = payments.filter(p => p.status === 'paid');
  const pendingPayments = payments.filter(p => ['pending', 'manual_review'].includes(p.status));
  const signedContracts = contracts.filter(c => c.status === 'signed');
  const partialContracts = contracts.filter(c => c.status === 'partially_signed');
  const favoriteContracts = contracts.filter(c => c.favorite);
  const topType = topContractType(contracts);
  const revenueUsd = paidPayments.reduce((sum, p) => sum + Number(p.amountUsd || 0), 0);
  return {
    date: new Date().toISOString(),
    counts: {
      contracts: contracts.length,
      payments: payments.length,
      paidPayments: paidPayments.length,
      pendingPayments: pendingPayments.length,
      reviews: reviews.length,
      pendingReviews: reviews.filter(r => r.status === 'pending').length,
      signedContracts: signedContracts.length,
      partialContracts: partialContracts.length,
      favoriteContracts: favoriteContracts.length
    },
    revenue: { usd: revenueUsd },
    topContractType: { name: topType[0], count: topType[1] },
    paymentStatus: countBy(payments, p => p.status),
    contractTypes: countBy(contracts, c => c.typeName || CONTRACT_TYPES[c.type] || c.type)
  };
}

function buildAgentReport(agentId) {
  const summary = getAgentsSummary();
  const c = summary.counts;
  const agent = AGENTS.find(a => a.id === agentId) || AGENTS[0];
  const reports = {
    ceo: {
      focus: 'تحديد أولويات اليوم ومنع التشتت.',
      insights: [
        `عدد العقود الحالي: ${c.contracts}.`,
        `المدفوعات التي تحتاج متابعة: ${c.pendingPayments}.`,
        `طلبات المراجعة المعلقة: ${c.pendingReviews}.`,
        `أكثر قالب مستخدم: ${summary.topContractType.name} (${summary.topContractType.count}).`
      ],
      tasks: ['راجع المدفوعات المعلقة أولاً.', 'انشر رسالة واحدة واضحة: لا تبدأ العمل قبل عقد واضح.', 'اجمع 5 ملاحظات من مستخدمين حقيقيين.']
    },
    product: {
      focus: 'تحسين تجربة إنشاء العقد والدفع.',
      insights: [`أكثر قالب يحتاج اهتماماً: ${summary.topContractType.name}.`, `العقود الموقعة كلياً: ${c.signedContracts}.`, `العقود ذات التوقيع الجزئي: ${c.partialContracts}.`],
      tasks: ['اختبر رحلة: إنشاء عقد ← دفع ← PDF.', 'اجعل زر الدفع أوضح داخل تفاصيل العقد.', 'اكتب ملاحظة قانونية قصيرة تحت نموذج العقد.']
    },
    marketing: {
      focus: 'جذب المستقلين دون كشف كامل الخطة.',
      insights: ['الرسالة الأساسية: لا تبدأ العمل قبل عقد واضح.', 'أفضل قناة حالياً: مجموعات واتساب المستقلين.', 'لا تسوق كل الميزات دفعة واحدة.'],
      tasks: ['انشر منشور ألم واحد اليوم.', 'اعرض PDF مجاني لأول 10 مجربين مقابل رأيهم.', 'اسأل: ما أكثر بند يخيفك في التعامل مع عميل؟']
    },
    sales: {
      focus: 'تحويل المهتمين إلى دافعين.',
      insights: [`المدفوعات المدفوعة: ${c.paidPayments}.`, `المدفوعات المعلقة: ${c.pendingPayments}.`, 'ابدأ بعرض باقة موثّق كأفضل قيمة.'],
      tasks: ['راسل 10 مستقلين برسالة شخصية.', 'اعرض سعر إطلاق لأول 100 مستخدم.', 'تابع كل من جرّب ولم يدفع بسؤال واحد فقط.']
    },
    finance: {
      focus: 'متابعة شام كاش وUSDT.',
      insights: [`إجمالي الإيراد المؤكد: ${summary.revenue.usd} USDT.`, `عمليات manual_review/pending: ${c.pendingPayments}.`, `حالات الدفع: ${JSON.stringify(summary.paymentStatus)}.`],
      tasks: ['راجع TXID والعمليات المعلقة.', 'لا تفعل الباقة إلا بعد تحقق فعلي.', 'سجل كل عملية دفع مع رقم العقد.']
    },
    legal: {
      focus: 'تقليل المخاطر القانونية.',
      insights: [`طلبات المراجعة: ${c.reviews}.`, 'يجب إبقاء عبارة: مسودات قابلة للمراجعة القانونية.', 'العقود ذات المبالغ العالية تستحق تنبيه مراجعة.'],
      tasks: ['أضف تنبيه مراجعة عند وجود مبلغ كبير.', 'لا تستخدم عبارة ضمان قانوني.', 'جهز قالب إخلاء مسؤولية مختصر.']
    },
    support: {
      focus: 'تسهيل الاستخدام وتقليل الأسئلة.',
      insights: ['أكثر أسئلة متوقعة: الدفع، PDF، التوقيع، الخصوصية.', 'ضع إجابات قصيرة داخل واجهة الدفع.', 'اجعل رسائل الأخطاء بشرية وواضحة.'],
      tasks: ['اكتب 5 أسئلة شائعة.', 'اختبر الدفع من هاتف.', 'تأكد أن الروابط تعمل على واتساب.']
    },
    cto: {
      focus: 'ثبات النسخة التجريبية.',
      insights: ['التخزين JSON مناسب للتجربة فقط.', 'راقب port 5000 وتضارب الخوادم.', 'قبل النمو نحتاج قاعدة بيانات.'],
      tasks: ['شغل npm run check قبل كل نشر.', 'انسخ مجلد data احتياطياً.', 'أخفِ أي زر تجريبي في الإنتاج.']
    },
    growth: {
      focus: 'قنوات نمو رخيصة وسريعة.',
      insights: ['مكاتب الخدمات قد تختصر الطريق.', 'المستقلون أفضل شريحة بداية.', 'التوصيات أهم من الإعلانات حالياً.'],
      tasks: ['اعرض نسخة مجانية لمكتب خدمات واحد.', 'اطلب من كل مستخدم دعوة مستقل واحد.', 'اصنع كاروسيل: 5 أخطاء عند العمل بدون عقد.']
    },
    designer: {
      focus: 'تحويل هوية ميثاق إلى قوالب ثابتة قابلة للتكرار.',
      insights: ['لا نغير الهوية كل مرة: أخضر ميثاق + ذهب + Cairo + زخرفة خفيفة.', 'القوالب الأساسية: منشور واتساب، ستوري، كاروسيل، بطاقة باقة.', 'التغيير يكون في النص والصورة/الرمز فقط، لا في النظام البصري.'],
      tasks: ['أنشئ قالب كاروسيل أسبوعي: مشكلة ← حل ← خطوات ← دعوة.', 'جهّز 7 عبارات تسويقية قصيرة للمستقلين.', 'راجع أن كل تصميم فيه شعار واضح ودعوة تجربة.']
    },
    meeting_manager: {
      focus: 'إدارة اجتماعات مجلس ميثاق وتحويل النقاش إلى قرارات.',
      insights: ['كل اجتماع يجب أن يخرج بقرارات لا بكلام عام.', 'أفضل اجتماع يومي: 5 دقائق فقط، مؤشرات + عوائق + 3 مهام.', 'عند غياب المؤسس، يرسل المجلس ملخصاً إلى تلجرام.'],
      tasks: ['أرسل تقرير مجلس ميثاق اليومي.', 'حوّل توصيات الوكلاء إلى Sprint أسبوعي.', 'رتّب الأولويات: دفع، تجربة المستخدم، تسويق.']
    },
    telegram_operator: {
      focus: 'أن يكون تلجرام هو قناة القيادة السريعة للمؤسس.',
      insights: ['الأوامر الأساسية: /summary /meeting /payments /marketing /designer.', 'لا ترسل رسائل طويلة جداً إلا عند الطلب.', 'أي مدفوعات manual_review يجب أن تظهر كتذكير واضح.'],
      tasks: ['اختبر أمر /meeting داخل الجروب.', 'جهّز رسالة صباحية مختصرة.', 'أرسل تنبيه عند وجود مدفوعات معلقة.']
    }
  };
  const report = reports[agent.id] || reports.ceo;
  return { agent, summary, report };
}


function getDesignTemplates() {
  return [
    { id: 'whatsapp_post', name: 'منشور واتساب', size: 'مربع 1080×1080', use: 'مجموعات المستقلين', structure: ['عنوان ألم مباشر', '3 فوائد', 'دعوة للتجربة'] },
    { id: 'story', name: 'ستوري سريع', size: 'عمودي 1080×1920', use: 'حالات واتساب/إنستغرام', structure: ['سؤال صادم', 'حل مختصر', 'اسحب/راسلني'] },
    { id: 'carousel', name: 'كاروسيل تعليمي', size: '4 شرائح', use: 'لينكدإن وفيسبوك', structure: ['المشكلة', 'لماذا تهم؟', 'كيف يحلها ميثاق؟', 'CTA'] },
    { id: 'pricing_card', name: 'بطاقة باقة', size: 'مربع', use: 'شرح الأسعار', structure: ['اسم الباقة', 'السعر', 'المميزات', 'زر وهمي'] }
  ];
}

function buildCouncilMeeting() {
  const summary = getAgentsSummary();
  const agenda = [
    'مراجعة مؤشرات المنصة',
    'تحديد أولويات المنتج',
    'حملة تسويق اليوم',
    'متابعة المدفوعات والمراجعات',
    'إنتاج قالب تصميم جديد'
  ];
  const decisions = [
    'التركيز التسويقي الحالي: المستقلون وأصحاب الخدمات.',
    'عدم كشف كل الخطة للمنافسين؛ التسويق يكون حول الألم الأساسي فقط.',
    'اعتماد قوالب تصميم ثابتة لهوية ميثاق وتغيير النصوص فقط.',
    'مراجعة المدفوعات اليدوية قبل تفعيل أي باقة.',
    'تحسين قالب عقد الخدمات قبل التوسع في قوالب كثيرة.'
  ];
  const weeklySprint = [
    { owner: 'marketing', task: 'نشر 5 منشورات واتساب خلال الأسبوع بعنوان: لا تبدأ العمل قبل عقد واضح.' },
    { owner: 'designer', task: 'إنتاج 4 تصاميم من قالب ميثاق: مشكلة/حل/خطوات/دعوة.' },
    { owner: 'product', task: 'اختبار رحلة إنشاء عقد خدمات من الهاتف.' },
    { owner: 'finance', task: 'تجهيز تعليمات شام كاش وUSDT بشكل أوضح.' },
    { owner: 'legal', task: 'إضافة إخلاء مسؤولية مختصر أسفل العقود وصفحة الدفع.' }
  ];
  return { summary, agenda, decisions, weeklySprint, generatedAt: new Date().toISOString() };
}

function formatCouncilMeetingText() {
  const meeting = buildCouncilMeeting();
  return [
    '🏛️ اجتماع مجلس ميثاق',
    `التاريخ: ${new Date(meeting.generatedAt).toLocaleString('ar-SY')}`,
    '',
    '📊 مؤشرات مختصرة:',
    `- العقود: ${meeting.summary.counts.contracts}`,
    `- المدفوعات المعلقة: ${meeting.summary.counts.pendingPayments}`,
    `- طلبات المراجعة: ${meeting.summary.counts.pendingReviews}`,
    `- أكثر قالب: ${meeting.summary.topContractType.name}`,
    '',
    '🧭 جدول الاجتماع:',
    ...meeting.agenda.map(x => `- ${x}`),
    '',
    '✅ قرارات المجلس:',
    ...meeting.decisions.map(x => `- ${x}`),
    '',
    '🚀 Sprint الأسبوع:',
    ...meeting.weeklySprint.map(x => `- ${x.owner}: ${x.task}`)
  ].join('\n');
}

function formatAgentReportText(agentId) {
  const { agent, summary, report } = buildAgentReport(agentId);
  return [
    `${agent.icon} ${agent.name} — ${agent.title}`,
    `التركيز: ${report.focus}`,
    '',
    '📊 المؤشرات:',
    `- العقود: ${summary.counts.contracts}`,
    `- المدفوعات المعلقة: ${summary.counts.pendingPayments}`,
    `- المدفوعات المؤكدة: ${summary.counts.paidPayments}`,
    `- طلبات المراجعة: ${summary.counts.pendingReviews}`,
    `- أكثر قالب: ${summary.topContractType.name}`,
    '',
    '💡 ملاحظات:',
    ...report.insights.map(x => `- ${x}`),
    '',
    '✅ مهام مقترحة:',
    ...report.tasks.map(x => `- ${x}`)
  ].join('\n');
}

function sendTelegramMessageTo(text, chatIdOverride) {
  return new Promise((resolve, reject) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = chatIdOverride || process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      resolve({ ok: false, configured: false, message: 'TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID غير مضبوطين.' });
      return;
    }
    const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sendTelegramMessage(text) {
  return sendTelegramMessageTo(text);
}

function buildTelegramReply(text) {
  const command = normalize(text).split(/\s+/)[0].toLowerCase();
  if (!command || command === '/start' || command === '/help') {
    return [
      '📲 مسؤول تلجرام — ميثاق',
      'الأوامر المتاحة:',
      '/summary — ملخص سريع',
      '/meeting — اجتماع مجلس ميثاق',
      '/payments — المدفوعات والمتابعة',
      '/marketing — توصيات التسويق',
      '/designer — توصيات التصميم',
      '/ceo — أولويات اليوم'
    ].join('\n');
  }
  if (command === '/summary') return formatAgentReportText('ceo');
  if (command === '/meeting') return formatCouncilMeetingText();
  if (command === '/payments') return formatAgentReportText('finance');
  if (command === '/marketing') return formatAgentReportText('marketing');
  if (command === '/designer') return formatAgentReportText('designer');
  if (command === '/ceo') return formatAgentReportText('ceo');
  if (command === '/agents') return AGENTS.map(a => `${a.icon} ${a.id} — ${a.name}`).join('\n');
  return 'لم أفهم الأمر. أرسل /help لعرض أوامر مجلس ميثاق.';
}

function getPremiumPlan(planId) {
  const plans = {
    basic: {
      id: 'basic',
      title: 'الباقة الأساسية',
      amountUsd: 5,
      amountSyp: 75000,
      features: ['PDF احترافي', 'رابط مشاركة', 'حفظ دائم']
    },
    verified: {
      id: 'verified',
      title: 'باقة موثّق',
      amountUsd: 9,
      amountSyp: 135000,
      features: ['PDF احترافي', 'رابط مشاركة', 'توقيع رقمي', 'ختم ميثاق', 'حفظ دائم']
    },
    freelancer: {
      id: 'freelancer',
      title: 'باقة المستقل',
      amountUsd: 15,
      amountSyp: 225000,
      features: ['حتى 10 عقود', 'PDF وتوقيع', 'قوالب عمل حر وخدمات', 'أرشفة']
    },
    office: {
      id: 'office',
      title: 'باقة المكاتب',
      amountUsd: 49,
      amountSyp: 735000,
      features: ['حتى 50 عقد', 'قوالب متعددة', 'أرشفة', 'دعم أسرع']
    },
    legal_review: {
      id: 'legal_review',
      title: 'مراجعة قانونية',
      amountUsd: 25,
      amountSyp: 375000,
      features: ['مراجعة البنود', 'ملاحظات قانونية', 'تعديلات مقترحة']
    }
  };
  return plans[planId] || plans.verified;
}

function createPaymentRecord({ contractId, method, planId, customerName, customerContact }) {
  const plan = getPremiumPlan(planId);
  const id = 'pay_' + newId();
  const now = new Date().toISOString();
  const payment = {
    id,
    contractId,
    method,
    planId: plan.id,
    planTitle: plan.title,
    amountUsd: plan.amountUsd,
    amountSyp: plan.amountSyp,
    currency: method === 'sham_cash' ? 'SYP' : 'USDT',
    status: 'pending',
    customerName: normalize(customerName),
    customerContact: normalize(customerContact),
    provider: method,
    checkoutUrl: '',
    walletAddress: method === 'crypto_usdt' ? (process.env.USDT_TRC20_ADDRESS || 'PUT_YOUR_USDT_TRC20_WALLET_HERE') : '',
    network: method === 'crypto_usdt' ? 'TRC20' : '',
    memo: id,
    txid: '',
    createdAt: now,
    updatedAt: now
  };
  if (method === 'sham_cash') {
    payment.providerPaymentId = 'sham_' + id;
    payment.checkoutUrl = process.env.SHAM_CASH_CHECKOUT_URL || '';
    payment.instructions = 'ادفع عبر شام كاش ثم أدخل رقم العملية أو انتظر تأكيد الربط عبر API عند تفعيله.';
  }
  if (method === 'crypto_usdt') {
    payment.instructions = 'أرسل المبلغ على شبكة TRC20 ثم أدخل رقم العملية TXID للتأكيد اليدوي.';
  }
  return payment;
}

/* عرض عام للدفعة: يخفي المعرفات الحساسة عن واجهات المستخدم العادية */
function publicPaymentView(p) {
  return {
    id: p.id, contractId: p.contractId, method: p.method, planTitle: p.planTitle,
    amountUsd: p.amountUsd, amountSyp: p.amountSyp, currency: p.currency,
    status: p.status, txid: p.txid ? String(p.txid).slice(0, 10) + '…' : '',
    createdAt: p.createdAt, confirmedAt: p.confirmedAt || null, updatedAt: p.updatedAt
  };
}

function markContractPremium(contractId, paymentId) {
  const found = findContract(contractId);
  if (!found.contract) return null;
  found.contract.premium = true;
  found.contract.premiumPaymentId = paymentId;
  found.contract.updatedAt = new Date().toISOString();
  found.contracts[found.index] = found.contract;
  writeContracts(found.contracts);
  return found.contract;
}

async function handleApi(req, res, pathname) {


  if (req.method === 'GET' && pathname === '/api/agents/council/meeting') {
    return sendJson(res, 200, { ok: true, meeting: buildCouncilMeeting(), text: formatCouncilMeetingText() });
  }

  if (req.method === 'POST' && pathname === '/api/agents/council/telegram') {
    const result = await sendTelegramMessage(formatCouncilMeetingText());
    return sendJson(res, 200, { ok: Boolean(result.ok), telegram: result });
  }

  if (req.method === 'GET' && pathname === '/api/design/templates') {
    return sendJson(res, 200, { ok: true, templates: getDesignTemplates() });
  }

  if (req.method === 'GET' && pathname === '/api/agents') {
    return sendJson(res, 200, { ok: true, agents: AGENTS, summary: getAgentsSummary() });
  }

  const agentReportMatch = pathname.match(/^\/api\/agents\/([^/]+)\/report$/);
  if (req.method === 'GET' && agentReportMatch) {
    const agentId = decodeURIComponent(agentReportMatch[1]);
    return sendJson(res, 200, { ok: true, data: buildAgentReport(agentId), text: formatAgentReportText(agentId) });
  }

  const agentTelegramMatch = pathname.match(/^\/api\/agents\/([^/]+)\/telegram$/);
  if (req.method === 'POST' && agentTelegramMatch) {
    const agentId = decodeURIComponent(agentTelegramMatch[1]);
    const result = await sendTelegramMessage(formatAgentReportText(agentId));
    return sendJson(res, result.ok ? 200 : 200, { ok: Boolean(result.ok), telegram: result });
  }


  if (req.method === 'GET' && pathname === '/api/telegram/status') {
    return sendJson(res, 200, { ok: true, configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID), hasBotToken: Boolean(process.env.TELEGRAM_BOT_TOKEN), hasChatId: Boolean(process.env.TELEGRAM_CHAT_ID) });
  }

  if (req.method === 'POST' && pathname === '/api/telegram/webhook') {
    const update = parseBody(await readBody(req));
    if (!update) return sendJson(res, 400, { ok: false, message: 'صيغة JSON غير صحيحة.' });
    const message = update.message || update.edited_message || {};
    const chatId = message.chat && message.chat.id;
    const text = message.text || '';
    if (chatId && text) {
      const reply = buildTelegramReply(text);
      await sendTelegramMessageTo(reply, chatId);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/telegram/daily-summary') {
    const text = ['📌 تقرير مجلس ميثاق اليومي', '', formatAgentReportText('ceo'), '', '—', formatAgentReportText('finance')].join('\n');
    const result = await sendTelegramMessage(text);
    return sendJson(res, result.ok ? 200 : 200, { ok: Boolean(result.ok), telegram: result });
  }


  if (req.method === 'GET' && pathname === '/api/payments/plans') {
    return sendJson(res, 200, { ok: true, plans: ['basic','verified','freelancer','office','legal_review'].map(getPremiumPlan), methods: ['sham_cash', 'crypto_usdt'] });
  }

  if (req.method === 'POST' && pathname === '/api/payments/create') {
    const body = parseBody(await readBody(req));
    if (!body) return sendJson(res, 400, { ok: false, message: 'صيغة JSON غير صحيحة.' });
    const contractId = normalize(body.contractId);
    const method = normalize(body.method);
    const planId = normalize(body.planId) || 'documentation';
    if (!contractId) return sendJson(res, 422, { ok: false, message: 'رقم العقد مطلوب.' });
    if (!['sham_cash', 'crypto_usdt'].includes(method)) return sendJson(res, 422, { ok: false, message: 'طريقة الدفع غير مدعومة حالياً.' });
    const found = findContract(contractId);
    if (!found.contract) return sendJson(res, 404, { ok: false, message: 'العقد غير موجود.' });
    const payment = createPaymentRecord({ contractId, method, planId, customerName: body.customerName, customerContact: body.customerContact });
    const payments = readPayments();
    payments.unshift(payment);
    writePayments(payments);
    return sendJson(res, 201, { ok: true, payment });
  }

  /* استثناء history و plans من الالتقاط العام :id — لهما مسارات مخصصة */
  const paymentMatch = pathname.match(/^\/api\/payments\/(?!history$|plans$)([^/]+)$/);
  if (req.method === 'GET' && paymentMatch) {
    const id = decodeURIComponent(paymentMatch[1]);
    const payment = readPayments().find(p => String(p.id) === String(id));
    return payment ? sendJson(res, 200, { ok: true, payment }) : sendJson(res, 404, { ok: false, message: 'عملية الدفع غير موجودة.' });
  }

  const proofMatch = pathname.match(/^\/api\/payments\/([^/]+)\/proof$/);
  if (req.method === 'POST' && proofMatch) {
    const id = decodeURIComponent(proofMatch[1]);
    const body = parseBody(await readBody(req));
    if (!body) return sendJson(res, 400, { ok: false, message: 'صيغة JSON غير صحيحة.' });
    const payments = readPayments();
    const index = payments.findIndex(p => String(p.id) === String(id));
    if (index < 0) return sendJson(res, 404, { ok: false, message: 'عملية الدفع غير موجودة.' });
    payments[index].txid = normalize(body.txid || body.operationId);
    payments[index].payerNote = normalize(body.note);
    payments[index].status = 'manual_review';
    payments[index].updatedAt = new Date().toISOString();
    writePayments(payments);
    return sendJson(res, 200, { ok: true, payment: payments[index], message: 'تم استلام إثبات الدفع وسيتم التحقق منه.' });
  }

  const confirmMatch = pathname.match(/^\/api\/payments\/([^/]+)\/confirm-demo$/);
  if (req.method === 'POST' && confirmMatch) {
    if (process.env.ALLOW_DEMO_CONFIRM !== 'true') return sendJson(res, 403, { ok: false, message: 'تأكيد الدفع التجريبي معطل في هذه البيئة.' });
    const id = decodeURIComponent(confirmMatch[1]);
    const payments = readPayments();
    const index = payments.findIndex(p => String(p.id) === String(id));
    if (index < 0) return sendJson(res, 404, { ok: false, message: 'عملية الدفع غير موجودة.' });
    payments[index].status = 'paid';
    payments[index].updatedAt = new Date().toISOString();
    const contract = markContractPremium(payments[index].contractId, payments[index].id);
    writePayments(payments);
    return sendJson(res, 200, { ok: true, payment: payments[index], contract });
  }

  if (req.method === 'POST' && pathname === '/api/payments/shamcash/webhook') {
    const body = parseBody(await readBody(req));
    if (!body) return sendJson(res, 400, { ok: false, message: 'صيغة JSON غير صحيحة.' });
    const providerPaymentId = normalize(body.providerPaymentId || body.payment_id || body.id);
    const status = normalize(body.status).toLowerCase();
    const payments = readPayments();
    const index = payments.findIndex(p => String(p.providerPaymentId) === providerPaymentId || String(p.id) === providerPaymentId);
    if (index < 0) return sendJson(res, 404, { ok: false, message: 'عملية الدفع غير موجودة.' });
    payments[index].status = ['paid', 'success', 'confirmed'].includes(status) ? 'paid' : status || 'pending';
    payments[index].webhookPayload = body;
    payments[index].updatedAt = new Date().toISOString();
    let contract = null;
    if (payments[index].status === 'paid') contract = markContractPremium(payments[index].contractId, payments[index].id);
    writePayments(payments);
    return sendJson(res, 200, { ok: true, payment: payments[index], contract });
  }

  /* ===== GOOGLE AUTH (GIS) ===== */
  /* إعدادات GIS العامة — يقرأها الفرونت إند لعرض زر جوجل */
  if (req.method === 'GET' && pathname === '/api/auth/config') {
    return sendJson(res, 200, { ok: true, clientId: GOOGLE_CLIENT_ID, enabled: Boolean(GOOGLE_CLIENT_ID) });
  }

  /* استلام Credential (ID Token) من زر "Sign in with Google"، تدقيقه، وإنشاء جلسة */
  if (req.method === 'POST' && pathname === '/api/auth/google') {
    const body = parseBody(await readBody(req));
    if (!body) return sendJson(res, 400, { ok: false, message: 'صيغة JSON غير صحيحة.' });
    const credential = String(body.credential || '').trim();
    if (!credential) return sendJson(res, 422, { ok: false, message: 'credential مفقود.' });
    const verifyResult = await verifyGoogleCredential(credential);
    if (!verifyResult.ok) {
      console.error('Google credential verification failed:', verifyResult.message);
      return sendJson(res, 401, { ok: false, message: verifyResult.message });
    }
    const profile = verifyResult.profile;
    const userId = 'g_' + sha256Hex(profile.sub).slice(0, 24);
    const session = createSession(userId, profile);
    return sendJson(res, 200, {
      ok: true,
      user: sanitizeSession(session),
      session: { token: session.sessionId, expiresAt: session.expiresAt }
    }, { 'Set-Cookie': sessionCookie(session.sessionId, SESSION_TTL_MS / 1000) });
  }

  /* جلسة المستخدم الحالية (من الكوكيز أو من Authorization: Bearer) */
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const session = parseSessionFromRequest(req);
    if (!session) return sendJson(res, 401, { ok: false, message: 'لا توجد جلسة نشطة.' });
    return sendJson(res, 200, { ok: true, user: sanitizeSession(session) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const session = parseSessionFromRequest(req);
    if (session) deleteSession(session.sessionId);
    return sendJson(res, 200, { ok: true, message: 'تم تسجيل الخروج.' }, { 'Set-Cookie': sessionCookie('', 0) });
  }

  /* ================= لوحة المستخدم (Dashboard APIs) ================= */
  const session = parseSessionFromRequest(req);
  const user = session ? getUserForSession(session) : null;

  /* الملف الشخصي: جلب / تحديث / حذف الحساب */
  if (req.method === 'GET' && pathname === '/api/user/profile') {
    if (!user) return sendJson(res, 401, { ok: false, message: 'سجّل الدخول أولاً.' });
    return sendJson(res, 200, { ok: true, user });
  }

  if (req.method === 'PATCH' && pathname === '/api/user/profile') {
    if (!user) return sendJson(res, 401, { ok: false, message: 'سجّل الدخول أولاً.' });
    const body = parseBody(await readBody(req));
    if (!body) return sendJson(res, 400, { ok: false, message: 'صيغة JSON غير صحيحة.' });
    const patch = {};
    if (body.name != null) patch.name = normalize(body.name).slice(0, 80);
    if (body.email != null) patch.email = normalize(body.email).toLowerCase().slice(0, 120);
    if (body.phone != null) patch.phone = normalize(body.phone).slice(0, 30);
    if (body.address != null) patch.address = normalize(body.address).slice(0, 300);
    if (body.preferences && typeof body.preferences === 'object') {
      patch.preferences = Object.assign({}, user.preferences, body.preferences);
    }
    const updated = updateUserRecord(user.userId, patch);
    logAudit('user_profile_updated', { userId: user.userId }, user.email);
    return sendJson(res, 200, { ok: true, user: updated, message: 'تم حفظ التغييرات ✓' });
  }

  if (req.method === 'DELETE' && pathname === '/api/user/account') {
    if (!user) return sendJson(res, 401, { ok: false, message: 'سجّل الدخول أولاً.' });
    /* إزالة الحساب وجلساته؛ العقود تبقى (مستندات قانونية) لكن تُفصل عن الحساب */
    const users = readUsers().filter(u => String(u.userId) !== String(user.userId));
    writeUsers(users);
    const sessions = readEncryptedList(SESSIONS_FILE).filter(s => String(s.userId) !== String(user.userId));
    writeEncryptedList(SESSIONS_FILE, sessions);
    logAudit('user_account_deleted', { userId: user.userId, email: user.email }, user.email);
    return sendJson(res, 200, { ok: true, message: 'تم حذف الحساب نهائياً.' }, { 'Set-Cookie': sessionCookie('', 0) });
  }

  /* إحصائيات لوحة المستخدم: إجمالي/موقعة/بانتظار/مسودات + آخر العقود */
  if (req.method === 'GET' && pathname === '/api/stats/dashboard') {
    if (!user) return sendJson(res, 401, { ok: false, message: 'سجّل الدخول أولاً.' });
    const all = readContracts().filter(c => c.owner && String(c.owner.userId) === String(user.userId));
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const stats = {
      total: all.length,
      signed: all.filter(c => c.status === 'signed').length,
      pending: all.filter(c => c.status === 'partially_signed').length,
      drafts: all.filter(c => !c.status || c.status === 'draft').length,
      thisMonth: all.filter(c => new Date(c.createdAt || 0).getTime() >= monthStart.getTime()).length,
      favorites: all.filter(c => c.favorite).length
    };

  if (req.method === 'GET' && pathname === '/api/health') return sendJson(res, 200, { ok: true, status: 'online', service: 'Mithaq API', time: new Date().toISOString() });
      const recent = all.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 6).map(c => ({
        id: c.id, type: c.typeName || CONTRACT_TYPES[c.type] || 'عقد', party2: c.party2 || '',
        status: c.status || 'draft', createdAt: c.createdAt, signedAt: (c.signatures && c.signatures.party2 && c.signatures.party2.signedAt) || null
      }));
      return sendJson(res, 200, { ok: true, stats, recent });
    }

  /* ===== الاشتراك والفواتير ===== */
  if (req.method === 'GET' && pathname === '/api/subscription') {
    if (!user) return sendJson(res, 401, { ok: false, message: 'سجّل الدخول أولاً.' });
    const payments = readPayments().filter(p => p.customerContact === user.email || p.payerEmail === user.email);
    return sendJson(res, 200, {
      ok: true,
      subscription: { plan: user.plan, planExpiresAt: user.planExpiresAt, autoRenew: user.autoRenew !== false },
      plans: ['basic', 'verified', 'freelancer', 'office', 'legal_review'].map(getPremiumPlan),
      payments: payments.map(publicPaymentView)
    });
  }

  if (req.method === 'POST' && pathname === '/api/subscription/cancel') {
    if (!user) return sendJson(res, 401, { ok: false, message: 'سجّل الدخول أولاً.' });
    const updated = updateUserRecord(user.userId, { plan: 'free', planExpiresAt: null, autoRenew: false });
    logAudit('subscription_cancelled', { userId: user.userId, previousPlan: user.plan }, user.email);
    return sendJson(res, 200, { ok: true, subscription: updated, message: 'تم إلغاء الاشتراك. ستبقى المزايا حتى نهاية الفترة المدفوعة إن وُجدت.' });
  }

  if (req.method === 'GET' && pathname === '/api/payments/history') {
    if (!user) return sendJson(res, 401, { ok: false, message: 'سجّل الدخول أولاً.' });
    const payments = readPayments().filter(p => p.customerContact === user.email || p.payerEmail === user.email);
    return sendJson(res, 200, { ok: true, payments: payments.map(publicPaymentView) });
  }

  /* ================= لوحة المشرف (Admin APIs) — تتطلب جلسة مشرف ================= */
  const adminMatch = pathname.match(/^\/api\/admin(\/.*)?$/);
  if (adminMatch) {
    const admin = parseSessionFromRequest(req);
    if (!isAdminSession(admin)) return sendJson(res, 403, { ok: false, message: 'صلاحيات مشرف مطلوبة.' });
    const sub = adminMatch[1] || '';
    const adminActor = admin.email || admin.userId;

    /* نظرة عامة: KPIs حقيقية من المخازن */
    if (req.method === 'GET' && (sub === '' || sub === '/')) {
      const contracts = readContracts();
      const payments = readPayments();
      const users = readUsers();
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const paid = payments.filter(p => p.status === 'paid');
      const revenue = paid.reduce((s, p) => s + (Number(p.amountUsd) || 0), 0);
      return sendJson(res, 200, {
        ok: true,
        kpis: {
          users: users.length,
          contracts: contracts.length,
          contractsToday: contracts.filter(c => new Date(c.createdAt || 0).getTime() >= dayStart.getTime()).length,
          signedRate: contracts.length ? Math.round(contracts.filter(c => c.status === 'signed').length * 100 / contracts.length) : 0,
          revenueUsd: Math.round(revenue * 100) / 100,
          pendingPayments: payments.filter(p => ['pending', 'manual_review'].includes(p.status)).length,
          activeSubscriptions: users.filter(u => u.plan && u.plan !== 'free').length
        },
        contractTypes: countBy(contracts, c => c.typeName || CONTRACT_TYPES[c.type] || 'عقد'),
        paymentStatus: countBy(payments, p => p.status)
      });
    }

    /* إدارة المستخدمين */
    if (req.method === 'GET' && sub === '/users') {
      const users = readUsers().map(u => ({
        userId: u.userId, name: u.name, email: u.email, phone: u.phone, plan: u.plan,
        planExpiresAt: u.planExpiresAt, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt,
        contracts: readContracts().filter(c => c.owner && String(c.owner.userId) === String(u.userId)).length
      }));
      return sendJson(res, 200, { ok: true, users });
    }

    const adminUserMatch = sub.match(/^\/users\/([^/]+)$/);
    if (adminUserMatch && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const uid = decodeURIComponent(adminUserMatch[1]);
      if (req.method === 'DELETE') {
        const users = readUsers().filter(u => String(u.userId) !== String(uid));
        if (users.length === readUsers().length) return sendJson(res, 404, { ok: false, message: 'المستخدم غير موجود.' });
        writeUsers(users);
        logAudit('admin_user_deleted', { userId: uid }, adminActor);
        return sendJson(res, 200, { ok: true, message: 'تم حذف المستخدم.' });
      }
      const body = parseBody(await readBody(req));
      if (!body) return sendJson(res, 400, { ok: false, message: 'صيغة JSON غير صحيحة.' });
      const patch = {};
      if (body.plan != null) { patch.plan = normalize(body.plan); patch.planExpiresAt = body.plan === 'free' ? null : new Date(Date.now() + 30 * 864e5).toISOString(); }
      if (body.name != null) patch.name = normalize(body.name);
      const updated = updateUserRecord(uid, patch);
      if (!updated) return sendJson(res, 404, { ok: false, message: 'المستخدم غير موجود.' });
      logAudit('admin_user_updated', { userId: uid, patch: Object.keys(patch) }, adminActor);
      return sendJson(res, 200, { ok: true, user: updated });
    }

    /* إدارة العقود: عرض الكل + حذف */
    if (req.method === 'GET' && sub === '/contracts') {
      const contracts = readContracts().map(c => ({
        id: c.id, type: c.typeName || CONTRACT_TYPES[c.type] || 'عقد', party1: c.party1, party2: c.party2,
        status: c.status || 'draft', createdAt: c.createdAt,
        owner: (c.owner && (c.owner.email || c.owner.name)) || ''
      }));
      return sendJson(res, 200, { ok: true, contracts });
    }

    const adminContractMatch = sub.match(/^\/contracts\/([^/]+)$/);
    if (adminContractMatch && req.method === 'DELETE') {
      const cid = decodeURIComponent(adminContractMatch[1]);
      const contracts = readContracts();
      const next = contracts.filter(c => String(c.id) !== String(cid));
      if (next.length === contracts.length) return sendJson(res, 404, { ok: false, message: 'العقد غير موجود.' });
      writeContracts(next);
      logAudit('admin_contract_deleted', { contractId: cid }, adminActor);
      return sendJson(res, 200, { ok: true, message: 'تم حذف العقد.' });
    }

    /* المدفوعات: القائمة + موافقة/رفض يدوي */
    if (req.method === 'GET' && sub === '/payments') {
      const payments = readPayments().map(p => Object.assign({}, p, {
        payer: p.customerContact || p.payerEmail || p.customerName || ''
      }));
      return sendJson(res, 200, { ok: true, payments });
    }

    const adminPayMatch = sub.match(/^\/payments\/([^/]+)\/verify$/);
    if (adminPayMatch && req.method === 'POST') {
      const pid = decodeURIComponent(adminPayMatch[1]);
      const body = parseBody(await readBody(req));
      if (!body) return sendJson(res, 400, { ok: false, message: 'صيغة JSON غير صحيحة.' });
      const action = normalize(body.action);
      const payments = readPayments();
      const index = payments.findIndex(p => String(p.id) === String(pid));
      if (index < 0) return sendJson(res, 404, { ok: false, message: 'عملية الدفع غير موجودة.' });
      if (payments[index].status === 'paid' && action === 'approve') return sendJson(res, 409, { ok: false, message: 'هذه الدفعة مؤكدة مسبقاً.' });
      if (action === 'approve') {
        payments[index].status = 'paid';
        payments[index].confirmedAt = new Date().toISOString();
        payments[index].confirmedBy = adminActor;
        /* ترقية مستخدم المنصة إن كان البريد مربوطاً بحساب، وتمييز العقد كمميز */
        const email = normalize(payments[index].customerContact || '').toLowerCase();
        if (email) {
          const users = readUsers();
          const uidx = users.findIndex(u => normalize(String(u.email || '')).toLowerCase() === email);
          if (uidx >= 0) {
            users[uidx].plan = payments[index].planId;
            users[uidx].planExpiresAt = new Date(Date.now() + 30 * 864e5).toISOString();
            writeUsers(users);
          }
        }
        writePayments(payments);
        const contract = markContractPremium(payments[index].contractId, payments[index].id);
        logAudit('payment_approved', { paymentId: pid, amountUsd: payments[index].amountUsd, txid: payments[index].txid }, adminActor);
        return sendJson(res, 200, { ok: true, payment: payments[index], contract, message: 'تم تأكيد الدفعة وتفعيل المزايا.' });
      }
      if (action === 'reject') {
        payments[index].status = 'rejected';
        payments[index].rejectionReason = normalize(body.reason || '');
        payments[index].confirmedBy = adminActor;
        writePayments(payments);
        logAudit('payment_rejected', { paymentId: pid, reason: payments[index].rejectionReason }, adminActor);
        return sendJson(res, 200, { ok: true, payment: payments[index], message: 'تم رفض الدفعة.' });
      }
      return sendJson(res, 422, { ok: false, message: 'الإجراء يجب أن يكون approve أو reject.' });
    }

    /* دفعة يدوية (USDT/شام كاش نقداً) من المشرف */
    if (req.method === 'POST' && sub === '/payments/manual') {
      const body = parseBody(await readBody(req));
      if (!body) return sendJson(res, 400, { ok: false, message: 'صيغة JSON غير صحيحة.' });
      const plan = getPremiumPlan(normalize(body.planId) || 'verified');
      const payment = createPaymentRecord({
        contractId: normalize(body.contractId) || '', method: ['sham_cash', 'crypto_usdt'].includes(body.method) ? body.method : 'crypto_usdt',
        planId: plan.id, customerName: body.customerName, customerContact: body.customerContact
      });
      payment.txid = normalize(body.txid || '');
      payment.status = 'paid';
      payment.confirmedAt = new Date().toISOString();
      payment.confirmedBy = adminActor;
      payment.notes = normalize(body.notes || '');
      const payments = readPayments();
      payments.unshift(payment);
      writePayments(payments);
      if (payment.contractId) markContractPremium(payment.contractId, payment.id);
      logAudit('payment_manual_entry', { paymentId: payment.id, amountUsd: payment.amountUsd }, adminActor);
      return sendJson(res, 201, { ok: true, payment, message: 'تم تسجيل الدفعة اليدوية.' });
    }

    /* سجل التدقيق */
    if (req.method === 'GET' && sub === '/logs') {
      return sendJson(res, 200, { ok: true, logs: readAudit().slice(0, 200) });
    }

    return sendJson(res, 404, { ok: false, message: 'مسار إداري غير معروف.' });
  }

  /* ===== واجهة التحقق JSON (تستخدمها صفحة /verify للاستعلام قبل التحويل) ===== */
  const apiVerifyMatch = pathname.match(/^\/api\/verify\/([^/]+)$/);
  if (req.method === 'GET' && apiVerifyMatch) {
    const id = decodeURIComponent(apiVerifyMatch[1]);
    const { contract } = findContract(id);
    if (!contract) return sendJson(res, 404, { ok: false, found: false, valid: false, message: 'لا يوجد عقد بهذا المعرّف.' });
    const integrity = verifyContractIntegrity(contract);
    if (integrity.resealed) {
      const all = readContracts();
      const idx = all.findIndex(c => String(c.id) === String(contract.id));
      if (idx >= 0) { all[idx].contentHash = contract.contentHash; writeContracts(all); }
    }
    /* لا تُعرض أرقام مالية ولا توقيعات — أسماء الأطراف وحالة التوقيع فقط */
    return sendJson(res, 200, {
      ok: true,
      found: true,
      valid: integrity.matched,
      contractId: contract.id,
      status: contract.status || 'draft',
      signatureStatus: contract.status === 'signed' ? 'signed' : (contract.status === 'partially_signed' ? 'partially_signed' : 'unsigned'),
      createdAt: contract.createdAt || null,
      signedAt: (contract.signatures && contract.signatures.party2 && contract.signatures.party2.signedAt) || null,
      parties: { party1: contract.party1 || '', party2: contract.party2 || '' },
      type: CONTRACT_TYPES[contract.type] || 'عقد',
      fingerprint: contractFingerprint(contract),
      expectedFingerprint: normalize(contract.contentHash || '') || null,
      verifyUrl: getBaseUrl() + contractVerifyPath(contract),
      qr: contract.qrDataUrl ? { present: true, sealedFor: contract.qrSealedFor || null } : { present: false }
    });
  }

  /* عقود المستخدم: عند وجود جلسة صالحة تُعاد عقوده فقط (مرتبطة بحسابه)، وإلا كل العقود (وضع الضيف) */
  if (req.method === 'GET' && pathname === '/api/contracts') {
    const session = parseSessionFromRequest(req);
    const all = readContracts().sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    const contracts = session ? all.filter(c => c.owner && c.owner.userId === session.userId) : all;
    return sendJson(res, 200, { ok: true, contracts, scoped: Boolean(session) });
  }

  /* بيانات زر المشاركة: رابط واتساب رسمي جاهز + حالة إعدادات تيليجرام */
  const shareInfoMatch = pathname.match(/^\/api\/contracts\/([^/]+)\/share-info$/);
  if (req.method === 'GET' && shareInfoMatch) {
    const { contract } = findContract(decodeURIComponent(shareInfoMatch[1]));
    if (!contract) return sendJson(res, 404, { ok: false, message: 'العقد غير موجود.' });
    const link = getBaseUrl() + '/share/' + encodeURIComponent(contract.id || '');
    const verifyLink = getBaseUrl() + contractVerifyPath(contract);
    return sendJson(res, 200, {
      ok: true,
      link,
      verifyLink,
      whatsappUrl: whatsappLink(buildOfficialShareMessage(contract, link)),
      fingerprint: contractFingerprint(contract),
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
    });
  }

  const idMatch = pathname.match(/^\/api\/contracts\/([^/]+)$/);
  const favMatch = pathname.match(/^\/api\/contracts\/([^/]+)\/favorite$/);
  const signMatch = pathname.match(/^\/api\/contracts\/([^/]+)\/signatures$/);

  if (req.method === 'GET' && idMatch) {
    const { contract } = findContract(decodeURIComponent(idMatch[1]));
    return contract ? sendJson(res, 200, { ok: true, contract }) : sendJson(res, 404, { ok: false, message: 'العقد غير موجود.' });
  }

  if (req.method === 'POST' && pathname === '/api/generate-contract') {
    const raw = await readBody(req).catch(() => null);
    if (raw == null) return sendJson(res, 413, { ok: false, message: 'حجم الطلب كبير جداً.' });
    const body = parseBody(raw);
    if (!body) return sendJson(res, 400, { ok: false, message: 'صيغة JSON غير صحيحة.' });
    const validation = validatePayload(body, false);
    if (!validation.ok) return sendJson(res, 422, { ok: false, message: validation.message });
    const contract = makeContract(validation.data);
    /* ربط العقد بحساب صاحبه عند وجود جلسة نشطة */
    const session = parseSessionFromRequest(req);
    if (session) contract.owner = { userId: session.userId, name: session.name, email: session.email };
    /* ختم QR التحقق داخل بيانات العقد (معرّف + بصمة + وقت + حالة) */
    refreshContractQr(contract);
    const contracts = readContracts();
    contracts.unshift(contract);
    writeContracts(contracts);
    return sendJson(res, 201, { ok: true, contract });
  }

  if (req.method === 'PUT' && idMatch) {
    const id = decodeURIComponent(idMatch[1]);
    const found = findContract(id);
    if (!found.contract) return sendJson(res, 404, { ok: false, message: 'العقد غير موجود.' });
    const body = parseBody(await readBody(req));
    if (!body) return sendJson(res, 400, { ok: false, message: 'صيغة JSON غير صحيحة.' });
    const validation = validatePayload(Object.assign({}, found.contract, body), false);
    if (!validation.ok) return sendJson(res, 422, { ok: false, message: validation.message });
    const updated = Object.assign({}, found.contract, validation.data, { typeName: CONTRACT_TYPES[validation.data.type], updatedAt: new Date().toISOString() });
    updated.content = buildContractContent(updated);
    /* إعادة ختم البصمة بعد التعديل المصرّح به من صاحب العقد */
    updated.contentHash = contractFingerprint(updated);
    refreshContractQr(updated);
    found.contracts[found.index] = updated;
    writeContracts(found.contracts);
    return sendJson(res, 200, { ok: true, contract: updated });
  }

  if (req.method === 'DELETE' && idMatch) {
    const id = decodeURIComponent(idMatch[1]);
    const contracts = readContracts();
    const next = contracts.filter(c => String(c.id) !== String(id));
    if (next.length === contracts.length) return sendJson(res, 404, { ok: false, message: 'العقد غير موجود.' });
    writeContracts(next);
    return sendJson(res, 200, { ok: true, message: 'تم حذف العقد بنجاح.' });
  }

  if ((req.method === 'POST' || req.method === 'PATCH') && favMatch) {
    const found = findContract(decodeURIComponent(favMatch[1]));
    if (!found.contract) return sendJson(res, 404, { ok: false, message: 'العقد غير موجود.' });
    found.contract.favorite = !Boolean(found.contract.favorite);
    found.contract.updatedAt = new Date().toISOString();
    found.contracts[found.index] = found.contract;
    writeContracts(found.contracts);
    return sendJson(res, 200, { ok: true, contract: found.contract });
  }

  if (req.method === 'POST' && signMatch) {
    const found = findContract(decodeURIComponent(signMatch[1]));
    if (!found.contract) return sendJson(res, 404, { ok: false, message: 'العقد غير موجود.' });
    const body = parseBody(await readBody(req));
    if (!body) return sendJson(res, 400, { ok: false, message: 'صيغة JSON غير صحيحة.' });
    const party = body.party === 'party2' ? 'party2' : 'party1';
    const name = normalize(body.name) || (party === 'party1' ? found.contract.party1 : found.contract.party2);
    const dataUrl = normalize(body.signatureData || body.dataUrl);
    if (!dataUrl.startsWith('data:image/png;base64,')) return sendJson(res, 422, { ok: false, message: 'التوقيع غير صحيح.' });
    const metadata = getRequestMetadata(req);
    found.contract.signatures = found.contract.signatures || {};
    found.contract.signatureMetadata = Array.isArray(found.contract.signatureMetadata) ? found.contract.signatureMetadata : [];
    found.contract.signatures[party] = { name, dataUrl, signedAt: metadata.timestamp, metadata };
    found.contract.signatureMetadata.push({ party, name, ...metadata });
    const becameSigned = found.contract.signatures.party1 && found.contract.signatures.party2;
    found.contract.status = becameSigned ? 'signed' : 'partially_signed';
    found.contract.updatedAt = new Date().toISOString();
    found.contract.content = buildContractContent(found.contract);
    /* إعادة ختم البصمة بعد التوقيع ليصبح التوقيع جزءاً من الوثيقة المحمية */
    found.contract.contentHash = contractFingerprint(found.contract);
    refreshContractQr(found.contract);
    found.contracts[found.index] = found.contract;
    writeContracts(found.contracts);
    /* 🔔 تنبيه فوري عبر تيليجرام لصاحب العقد عند إتمام التوقيع */
    notifyContractEvent(found.contract, becameSigned ? 'signed' : 'signing', {
      actorName: name,
      actorParty: party === 'party1' ? 'الطرف الأول' : 'الطرف الثاني'
    });
    return sendJson(res, 200, { ok: true, contract: found.contract });
  }

  if (req.method === 'POST' && pathname === '/api/review-requests') {
    const body = parseBody(await readBody(req));
    if (!body) return sendJson(res, 400, { ok: false, message: 'صيغة JSON غير صحيحة.' });
    const contractId = normalize(body.contractId);
    const name = normalize(body.name);
    const email = normalize(body.email);
    const note = normalize(body.note);
    if (!contractId || !name || !email) return sendJson(res, 422, { ok: false, message: 'رقم العقد والاسم والبريد مطلوبة.' });
    const found = findContract(contractId);
    if (!found.contract) return sendJson(res, 404, { ok: false, message: 'العقد غير موجود.' });
    const request = { id: newId(), contractId, name, email, note, status: 'pending', createdAt: new Date().toISOString() };
    const reviews = readReviews();
    reviews.unshift(request);
    writeReviews(reviews);
    found.contract.reviewStatus = 'pending';
    found.contracts[found.index] = found.contract;
    writeContracts(found.contracts);
    return sendJson(res, 201, { ok: true, request });
  }

  if (req.method === 'GET' && pathname === '/api/review-requests') return sendJson(res, 200, { ok: true, requests: readReviews() });

  return sendJson(res, 404, { ok: false, message: 'المسار غير موجود.' });
}


function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.svg': 'image/svg+xml; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8'
  };
  return types[ext] || 'application/octet-stream';
}

function serveAsset(res, assetPath) {
  const safeName = path.basename(assetPath);
  const filePath = path.join(ASSETS_DIR, safeName);
  if (!filePath.startsWith(ASSETS_DIR) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, 'الأصل غير موجود.');
    return;
  }
  const body = fs.readFileSync(filePath);
  res.writeHead(200, commonHeaders({
    'Content-Type': getMimeType(filePath),
    'Content-Length': body.length,
    'Cache-Control': 'public, max-age=86400'
  }));
  res.end(body);
}


function serveHtmlFile(res, filePath, missingMessage) {
  if (!fs.existsSync(filePath)) return sendText(res, 404, missingMessage || 'الملف غير موجود.');
  sendHtml(res, 200, fs.readFileSync(filePath, 'utf8'));
}

function serveFrontend(res) {
  if (!fs.existsSync(FRONTEND_FILE)) return sendText(res, 404, 'frontend/index.html غير موجود.');
  sendHtml(res, 200, fs.readFileSync(FRONTEND_FILE, 'utf8'));
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '/', true);
  const pathname = parsed.pathname || '/';
  if (req.method === 'OPTIONS') return handleOptions(res);
  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (req.method === 'GET' && pathname.startsWith('/assets/')) return serveAsset(res, pathname.replace('/assets/', ''));
    if (req.method === 'GET' && pathname === '/mithaq-logo.svg') return serveAsset(res, 'mithaq-logo.svg');
    if (req.method === 'GET' && pathname === '/favicon.ico') return serveAsset(res, 'favicon.svg');
    if (req.method === 'GET' && pathname === '/favicon.svg') return serveAsset(res, 'favicon.svg');
    const share = pathname.match(/^\/share\/([^/]+)$/);
    const print = pathname.match(/^\/print\/([^/]+)$/);
    const verify = pathname.match(/^\/verify\/([^/]+)$/);
    if (req.method === 'GET' && pathname === '/verify') return sendHtml(res, 200, verifyLandingHtml(''));
    if ((req.method === 'GET') && (share || print || verify)) {
      const id = decodeURIComponent((share || print || verify)[1]);
      const { contract } = findContract(id);
      if (!contract) return sendText(res, 404, 'العقد غير موجود.');
      if (share) {
        /* 🔔 تنبيه تيليجرام عند فتح العميل لرابط العقد (مع تهدئة 15 دقيقة لكل عقد) */
        if (!hasRecentIntent(contract.id, 'opened')) {
          recordIntent(contract.id, 'opened');
          notifyContractEvent(contract, 'opened', { actorName: contract.party2 });
        }
        return sendHtml(res, 200, publicContractHtml(contract, false));
      }
      if (verify) {
        /* صفحة التحقق العامة: تقارن بصمة المحتوى الحالية بالبصمة المرجعية المخزّنة.
           العقود القديمة (قبل نظام البصمة) تُختم تلقائياً في أول زيارة تحقق. */
        const integrity = verifyContractIntegrity(contract);
        if (integrity.resealed) {
          const all = readContracts();
          const idx = all.findIndex(c => String(c.id) === String(contract.id));
          if (idx >= 0) { all[idx].contentHash = contract.contentHash; writeContracts(all); }
        }
        const matched = integrity.matched;
        return sendHtml(res, 200, verifyContractHtml(contract, matched));
      }
      return sendHtml(res, 200, publicContractHtml(contract, true));
    }
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html' || pathname === '/frontend/index.html')) return serveFrontend(res);
    if (req.method === 'GET' && pathname === '/marketing') return serveHtmlFile(res, MARKETING_FILE, 'ملف التسويق غير موجود.');
    if (req.method === 'GET' && pathname === '/brand') return serveHtmlFile(res, BRAND_FILE, 'ملف الهوية غير موجود.');
    if (req.method === 'GET' && pathname === '/agents') return serveHtmlFile(res, AGENTS_FILE, 'ملف مجلس ميثاق غير موجود.');
    if (req.method === 'GET' && pathname === '/design-studio') return serveHtmlFile(res, DESIGN_STUDIO_FILE, 'ملف استوديو التصميم غير موجود.');
    if (req.method === 'GET' && pathname === '/ui-components') return serveHtmlFile(res, UI_COMPONENTS_FILE, 'ملف مكونات الواجهة غير موجود.');
    if (req.method === 'GET') return serveFrontend(res);
    return sendText(res, 404, 'الصفحة غير موجودة.');
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { ok: false, message: 'حدث خطأ داخلي في الخادم.' });
  }
});

ensureStores();
server.listen(PORT, HOST, () => console.log(`Mithaq backend is running on http://localhost:${PORT}`));
