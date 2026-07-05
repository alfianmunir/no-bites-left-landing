/**
 * EN/ID copy dictionary for the marketing landing (ported from the design
 * prototype's STR object). One flat-ish object per language; nested groups for
 * the quiz and B2B section. Functions (shareText, thanks…) stay functions.
 */
export type Lang = "en" | "id";

export interface QuizOption { v: string; emoji: string; label: string }
export interface QuizStep { key: string; q: string; opts: QuizOption[] }

export interface Strings {
  navMenu: string; navInside: string; navStory: string; navFeedback: string; navMatch: string; navCafes: string; orderNow: string;
  authSignIn: string; authMyOrders: string; authCart: string; authSavedAddr: string; authProfile: string; authSignOut: string; authStaff: string;
  siTitle: string; siSub: string; siGoogle: string; siFine: string; siSkip: string;
  acctName: string; acctEmail: string;
  vibeLabel: string; classicMode: string; playfulMode: string; changeTheme: string;
  quiz: {
    entryKicker: string; entryTitle: string; entrySub: string; entryCta: string; start: string; of: string; back: string;
    steps: QuizStep[];
    resultKicker: string; matchIntro: string; sizeLabel: string; orderCta: string; again: string; share: string; shareCopied: string;
    copyLink: string; shareSheetTitle: string; shareWa: string; shareText: (name: string) => string;
    blurbs: Record<"apple" | "og" | "choco" | "hazel" | "matcha" | "brownies", string>;
  };
  heroBadge: string; heroT1: string; heroT2pre: string; heroT2accent: string; heroDesc: string; heroDescEnd: string;
  chip1: string; chip2: string; chip3: string; ctaBox: string; ctaMenu: string;
  stat1n: string; stat1l: string; stat2n: string; stat2l: string; stat3n: string; stat3l: string;
  servLabel: string; calLabel: string; servUnit: string; calUnit: string;
  storyCard: string; storyKicker: string; storyTitle: string; storyP1: string; storyP2: string;
  tl1k: string; tl1s: string; tl2k: string; tl3k: string; tl3s: string; tl4k: string; tl4t: string; tl4s: string;
  menuKicker: string; menuTitle: string; menuSub: string; sizeLabel: string; mostOrdered: string; priceWord: string;
  addToCart: string; added: string; viewCart: string; notifyOven: string; comingSoon: string; inOven: string;
  insideKicker: string; insideTitle: string; insideSub: string; ingTitle: string; ingList: string;
  treatKicker: string; treatTitle: string; treatDesc: string; treatNote: string;
  storeK: string; storeT: string; storeS: string; chillK: string; chillT: string; chillS: string; reviveK: string; reviveT: string; reviveS: string;
  orderKicker: string; orderTitle: string; orderSub: string; orderOn: string; orderDM: string;
  fbKicker: string; fbTitle: string; fbSub: string; fbRatingL: string; fbNameL: string; fbNameP: string; fbFlavourL: string; fbFlavourP: string; fbMsgL: string; fbMsgP: string;
  fbSend: string; fbSending: string; fbNeed: string; fbAnother: string;
  footerTag: string; footerDesc: string; footerOrderC: string; footerExplore: string; footerWholesale: string;
  rights: string; bakedJkt: string;
  pickerTitle: string; pickerSub: string; maybeLater: string;
  th: Record<"Porcelain" | "Cream" | "Sand" | "Espresso", { label: string; sub: string }>;
  menu: { tag: string; note: string; desc: string }[];
  b2b: {
    tag: string; head: string; sub: string; cta: string; valueKicker: string; valueHead: string; valuePill: string; valueBody: string; valueTasting: string;
    howTitle: string; steps: { n: string; t: string; d: string }[]; factsTitle: string; facts: { k: string; v: string; s: string }[];
    partnersTitle: string; finalTitle: string; finalSub: string; waFallback: string; waBtn: string;
    formTitle: string; formSub: string; fName: string; fRole: string; fCafe: string; fCity: string; fContact: string;
    rolePlaceholder: string; roleOptions: string[]; fVolume: string; fVolumeOpt: string; volOptions: string[];
    submit: string; sending: string; need: string; successTitle: string; successSub: string; successWa: string; another: string; close: string; errReq: string;
  };
  thanks: (n: string) => string;
  thanksSub: (r: number | string) => string;
}

export const STR: Record<Lang, Strings> = {
  en: {
    navMenu: "Menu", navInside: "What's Inside", navStory: "Our Story", navFeedback: "Feedback", navMatch: "Find Your Match", navCafes: "For Cafes", orderNow: "Order now",
    authSignIn: "Sign in", authMyOrders: "My Orders", authCart: "Cart", authSavedAddr: "Saved addresses", authProfile: "Profile", authSignOut: "Sign out", authStaff: "Staff sign-in",
    siTitle: "Welcome back", siSub: "Sign in to track your orders and check out faster next time.", siGoogle: "Continue with Google", siFine: "No passwords, no forms. Your cart stays exactly where it is.", siSkip: "Not now",
    acctName: "Sinta Wulandari", acctEmail: "sinta.w@gmail.com",
    vibeLabel: "Vibe", classicMode: "Classic", playfulMode: "Playful", changeTheme: "Change theme",
    quiz: {
      entryKicker: "Can’t decide?", entryTitle: "Not sure what to get? Find your match.", entrySub: "Answer 3 quick questions and we’ll point you to the bite that fits your mood.", entryCta: "Find my match", start: "Start", of: "of", back: "Back",
      steps: [
        { key: "mood", q: "What’s the mood?", opts: [
          { v: "cozy", emoji: "🧶", label: "Cozy" },
          { v: "indulgent", emoji: "😌", label: "Indulgent" },
          { v: "adventurous", emoji: "🧭", label: "Adventurous" },
          { v: "pickmeup", emoji: "⚡", label: "Need a pick-me-up" },
        ] },
        { key: "craving", q: "What are you craving?", opts: [
          { v: "chocolatey", emoji: "🍫", label: "Chocolatey" },
          { v: "nutty", emoji: "🌰", label: "Nutty" },
          { v: "different", emoji: "✨", label: "Something different" },
          { v: "classic", emoji: "🍪", label: "Classic" },
        ] },
        { key: "portion", q: "Just for you, or to share?", opts: [
          { v: "me", emoji: "🙋", label: "Just for me" },
          { v: "share", emoji: "🤝", label: "To share" },
        ] },
      ],
      resultKicker: "Your match", matchIntro: "We think you’d love…", sizeLabel: "Suggested size", orderCta: "Order this", again: "Try again", share: "Share my match", shareCopied: "Link copied!",
      copyLink: "Copy link", shareSheetTitle: "Share your match", shareWa: "Share on WhatsApp", shareText: (name) => "My No Bites Left match is " + name + "! Find yours:",
      blurbs: {
        apple: "Warm spiced apples in a flaky crust — the cozy classic that started it all.",
        og: "Soft-baked with melty chocolate and toasted walnuts. You can’t go wrong.",
        choco: "Double-chocolate and proud of it — a deep cocoa hit for serious cravings.",
        hazel: "A molten Nutella centre and crunchy walnuts. Indulgence, handled.",
        matcha: "Stone-ground matcha, white chocolate and macadamia — for the curious palate.",
        brownies: "Smooth, soft and intensely fudgy. Pure chocolate joy in every bite.",
      },
    },
    heroBadge: "Premium small-batch · Jakarta",
    heroT1: "Pleasure in", heroT2pre: "every ", heroT2accent: "bite.",
    heroDesc: "Thick, soft-baked bites loaded edge to edge with real chocolate, walnuts, Nutella and stone-ground matcha — so good you'll keep craving, right down to the last crumb, until there are ",
    heroDescEnd: ".",
    chip1: "Cookies · Brownies · Apple Pie", chip2: "Order via Shopee & GrabFood", chip3: "Baked fresh daily",
    ctaBox: "Order your box", ctaMenu: "See the menu",
    stat1n: "6", stat1l: "signature bakes", stat2n: "3", stat2l: "ways to order", stat3n: "14d", stat3l: "stays fresh",
    servLabel: "Serving Size", calLabel: "Calories Inside", servUnit: "grams", calUnit: "kcal",
    storyCard: "MasterChef Indonesia Season 10 — the baker behind every bite",
    storyKicker: "Our story", storyTitle: "It began with an apple pie.",
    storyP1: 'No Bites Left started in the kitchen of <strong style="color:var(--ink)">Alfian</strong>, from <strong style="color:var(--ink)">MasterChef Indonesia Season 10</strong>. The <strong style="color:var(--ink)">Apple Pie</strong> was the very first signature — US apples, balanced cinnamon and a hint of nutmeg, baked until the crust shattered just right.',
    storyP2: "That one pie turned into a craving, and the craving turned into a menu. Cookies came next, then the fudgy brownies — and we're still just getting started.",
    tl1k: "01 · The first", tl1s: "Our signature", tl2k: "02 · Then", tl3k: "03 · Next", tl3s: "Fudgy bites", tl4k: "04 · Soon", tl4t: "More to come", tl4s: "Stay tuned",
    menuKicker: "The menu", menuTitle: "Pick your bites", menuSub: "Six recipes, baked fresh to order. Add your favourites and check out for pickup.", sizeLabel: "Available variants", mostOrdered: "Most ordered", priceWord: "Price",
    addToCart: "Add to cart", added: "%s added to cart", viewCart: "View cart", notifyOven: "In the oven", comingSoon: "Coming soon", inOven: "in the oven",
    insideKicker: "What's inside", insideTitle: "Nothing hidden, just good stuff", insideSub: "Every box lists exactly what went in — right down to the happiness mood.",
    ingTitle: "Ingredients", ingList: 'Butter, Flour, Chocolate, Choco Powder, Sugar, Egg, Salt, <span style="font-weight:900">Love</span>',
    treatKicker: "How to treat", treatTitle: "Keep them at their best", treatDesc: "Fresh out of the oven they're unbeatable — but they keep beautifully too. A quick reheat brings back that just-baked melt.", treatNote: "Contains nuts & spices",
    storeK: "Store", storeT: "Room temp", storeS: "Up to 6 days", chillK: "Chill", chillT: "Refrigerate", chillS: "Keep cold up to 14 days", reviveK: "Revive", reviveT: "Oven reheat", reviveS: "150°C · 5 min",
    orderKicker: "Order now", orderTitle: "Order your box for pickup", orderSub: "Baked fresh to order and ready to collect at our Kebagusan pickup point. Add your bites and check out — QRIS, e-wallets & bank transfer.", orderOn: "Order on", orderDM: 'Prefer to chat? DM us on Instagram <strong style="color:var(--orange)">@nobitesleft.id</strong>',
    fbKicker: "Feedback", fbTitle: "How were your bites?", fbSub: "Tell us what you loved (or what we can make even better).",
    fbRatingL: "Your rating", fbNameL: "Name", fbNameP: "Your name", fbFlavourL: "Which flavour", fbFlavourP: "Pick a flavour…", fbMsgL: "Message", fbMsgP: "Which flavour, and how was it?",
    fbSend: "Send feedback", fbSending: "Sending…", fbNeed: "Add a name & rating", fbAnother: "Leave another",
    footerTag: "Bites you won't get enough of.", footerDesc: "Premium small-batch cookies, brownies & apple pie — baked fresh to order in Jakarta by Alfian, MasterChef Indonesia S10.",
    footerOrderC: "Order & contact", footerExplore: "Explore", footerWholesale: "Wholesale",
    rights: "© 2026 No Bites Left. All rights reserved.", bakedJkt: "Baked fresh · Jakarta, Indonesia",
    pickerTitle: "Pick your vibe", pickerSub: "A look for your visit — switch it anytime from the header.", maybeLater: "Maybe later",
    th: { Porcelain: { label: "Fresh & Clean", sub: "Crisp porcelain white" }, Cream: { label: "Warm & Cozy", sub: "Soft buttery cream" }, Sand: { label: "Golden Hour", sub: "Toasted sand tones" }, Espresso: { label: "Midnight Bake", sub: "Dark roast mode" } },
    menu: [
      { tag: "Signature", note: "Contains spices", desc: "US apples, balanced cinnamon and a whisper of nutmeg in a flaky crust." },
      { tag: "Bestseller", note: "Contains nuts", desc: "The original — soft-baked with melty chocolate chunks and toasted walnuts." },
      { tag: "", note: "Contains nuts", desc: "Double chocolate. A rich cocoa cookie packed with choco chunks and walnuts." },
      { tag: "", note: "Contains nuts", desc: "Chocolate cookie with a molten Nutella centre and crunchy walnuts." },
      { tag: "", note: "Contains nuts", desc: "Stone-ground matcha with white chocolate chunks and buttery macadamia." },
      { tag: "", note: "10 bites · rich", desc: "Smooth, soft and intensely fudgy — deep chocolate in every single bite." },
    ],
    b2b: {
      tag: "For cafes · Wholesale", head: "Run a cafe? Stock our hand-baked goods on your counter.", sub: "Premium hand-baked goods your regulars can’t get anywhere else — our full range, ready to sell under your own roof.", cta: "Book a free tasting",
      valueKicker: "Why it pays", valueHead: "Strong margins for your counter.", valuePill: "Healthy markup", valueBody: "Premium, hand-baked goods that practically sell themselves — priced so every piece leaves real room on your counter.", valueTasting: "See full wholesale pricing at your tasting.",
      howTitle: "How it works", steps: [
        { n: "01", t: "Book a tasting", d: "Taste the full range first — no commitment, on us." },
        { n: "02", t: "Pick your products & volume", d: "Choose what fits your counter and your week." },
        { n: "03", t: "We deliver & restock", d: "Fresh batches on a schedule that suits your cafe." },
      ],
      factsTitle: "The practical bits", facts: [
        { k: "Minimum order", v: "20 pcs", s: "per order" },
        { k: "Restock", v: "2× / week", s: "24–48h lead time" },
        { k: "Delivery area", v: "Jabodetabek", s: "fresh, on schedule" },
        { k: "Delivery fee", v: "On invoice", s: "charged per order" },
      ],
      partnersTitle: "Already on counters at", finalTitle: "Ready to talk numbers?", finalSub: "Book a free tasting — we bring the goods, you decide.", waFallback: "Prefer to chat right now?", waBtn: "Message us on WhatsApp",
      formTitle: "Book a free tasting", formSub: "Tell us about your cafe and we’ll reach out to schedule.", fName: "Your name", fRole: "Your role", fCafe: "Cafe name", fCity: "City / area", fContact: "WhatsApp / phone",
      rolePlaceholder: "Select your role…", roleOptions: ["Owner", "Manager", "Barista", "Purchasing", "Other"], fVolume: "Expected weekly volume", fVolumeOpt: "optional", volOptions: ["Not sure yet", "Under 50 pcs / week", "50–100 pcs / week", "100+ pcs / week"],
      submit: "Request my tasting", sending: "Sending…", need: "Fill in the required fields", successTitle: "Tasting requested!", successSub: "We’ll reach out within 1×24 hours to schedule your tasting.", successWa: "Can’t wait? Message us on WhatsApp", another: "Send another", close: "Close", errReq: "Please fill in your name, role, cafe, city and contact.",
    },
    thanks: (n) => "Thank you, " + n + "!",
    thanksSub: (r) => "Your " + r + "-star note just made our day. We read every single one.",
  },
  id: {
    navMenu: "Menu", navInside: "Isi Box", navStory: "Cerita Kami", navFeedback: "Ulasan", navMatch: "Cari Match-mu", navCafes: "Untuk Kafe", orderNow: "Pesan Sekarang",
    authSignIn: "Masuk", authMyOrders: "Pesanan Saya", authCart: "Keranjang", authSavedAddr: "Alamat tersimpan", authProfile: "Profil", authSignOut: "Keluar", authStaff: "Masuk staf",
    siTitle: "Selamat datang", siSub: "Masuk untuk melacak pesanan dan checkout lebih cepat.", siGoogle: "Lanjut dengan Google", siFine: "Tanpa kata sandi, tanpa formulir. Keranjangmu tetap aman.", siSkip: "Nanti saja",
    acctName: "Sinta Wulandari", acctEmail: "sinta.w@gmail.com",
    vibeLabel: "Nuansa", classicMode: "Klasik", playfulMode: "Ceria", changeTheme: "Ganti tema",
    quiz: {
      entryKicker: "Bingung pilih?", entryTitle: "Belum tahu mau pesan apa? Cari match-mu.", entrySub: "Jawab 3 pertanyaan singkat, kami arahkan ke gigitan yang pas dengan mood-mu.", entryCta: "Cari match-ku", start: "Mulai", of: "dari", back: "Kembali",
      steps: [
        { key: "mood", q: "Lagi mood apa?", opts: [
          { v: "cozy", emoji: "🧶", label: "Hangat & nyaman" },
          { v: "indulgent", emoji: "😌", label: "Manjain diri" },
          { v: "adventurous", emoji: "🧭", label: "Pengen coba baru" },
          { v: "pickmeup", emoji: "⚡", label: "Butuh penyemangat" },
        ] },
        { key: "craving", q: "Lagi pengen apa?", opts: [
          { v: "chocolatey", emoji: "🍫", label: "Cokelat banget" },
          { v: "nutty", emoji: "🌰", label: "Kacang-kacangan" },
          { v: "different", emoji: "✨", label: "Sesuatu yang beda" },
          { v: "classic", emoji: "🍪", label: "Klasik" },
        ] },
        { key: "portion", q: "Buat sendiri atau berbagi?", opts: [
          { v: "me", emoji: "🙋", label: "Buat sendiri" },
          { v: "share", emoji: "🤝", label: "Buat berbagi" },
        ] },
      ],
      resultKicker: "Match-mu", matchIntro: "Kayaknya kamu bakal suka…", sizeLabel: "Ukuran disarankan", orderCta: "Pesan ini", again: "Coba lagi", share: "Bagikan match-ku", shareCopied: "Link tersalin!",
      copyLink: "Salin link", shareSheetTitle: "Bagikan match-mu", shareWa: "Bagikan ke WhatsApp", shareText: (name) => "Match No Bites Left-ku adalah " + name + "! Cari punyamu:",
      blurbs: {
        apple: "Apel berbumbu hangat dalam kulit renyah — klasik yang nyaman, awal dari semuanya.",
        og: "Lembut dengan lelehan cokelat dan walnut panggang. Pilihan yang nggak pernah salah.",
        choco: "Double-chocolate sepenuh hati — cokelat pekat untuk craving serius.",
        hazel: "Isian Nutella meleleh dan walnut renyah. Manjain diri, beres.",
        matcha: "Matcha pilihan, white chocolate, dan macadamia — buat lidah yang penasaran.",
        brownies: "Lembut, halus, dan sangat fudgy. Kebahagiaan cokelat di tiap gigitan.",
      },
    },
    heroBadge: "Premium small-batch · Jakarta",
    heroT1: "Nikmat di", heroT2pre: "setiap ", heroT2accent: "gigitan.",
    heroDesc: "Gigitan tebal dan lembut, penuh cokelat asli, walnut, Nutella, dan matcha pilihan dari ujung ke ujung — bikin nagih sampai remah terakhir, sampai tak tersisa, ",
    heroDescEnd: ".",
    chip1: "Cookies · Brownies · Apple Pie", chip2: "Pesan via Shopee & GrabFood", chip3: "Dipanggang fresh tiap hari",
    ctaBox: "Pesan box-mu", ctaMenu: "Lihat menu",
    stat1n: "6", stat1l: "menu andalan", stat2n: "3", stat2l: "cara pesan", stat3n: "14h", stat3l: "tetap fresh",
    servLabel: "Porsi", calLabel: "Kalori", servUnit: "gram", calUnit: "kkal",
    storyCard: "MasterChef Indonesia Season 10 — sosok di balik setiap gigitan",
    storyKicker: "Cerita kami", storyTitle: "Berawal dari sepotong apple pie.",
    storyP1: 'No Bites Left lahir di dapur <strong style="color:var(--ink)">Alfian</strong>, dari <strong style="color:var(--ink)">MasterChef Indonesia Season 10</strong>. <strong style="color:var(--ink)">Apple Pie</strong> jadi menu andalan pertama — apel US, kayu manis yang pas, dan sentuhan pala, dipanggang sampai kulitnya renyah sempurna.',
    storyP2: "Satu pie itu berubah jadi craving, dan craving itu berubah jadi menu. Cookies menyusul, lalu brownies fudgy — dan kami baru saja mulai.",
    tl1k: "01 · Pertama", tl1s: "Menu andalan", tl2k: "02 · Lalu", tl3k: "03 · Berikut", tl3s: "Fudgy bites", tl4k: "04 · Segera", tl4t: "Masih banyak", tl4s: "Nantikan",
    menuKicker: "Menu", menuTitle: "Pilih gigitanmu", menuSub: "Enam resep, dipanggang fresh per pesanan. Tambahkan favoritmu dan checkout untuk pickup.", sizeLabel: "Varian tersedia", mostOrdered: "Paling laris", priceWord: "Harga",
    addToCart: "Tambah ke keranjang", added: "%s ditambahkan", viewCart: "Lihat keranjang", notifyOven: "Sedang dipanggang", comingSoon: "Segera hadir", inOven: "sedang dipanggang",
    insideKicker: "Isi box", insideTitle: "Tanpa rahasia, semua bahan baik", insideSub: "Setiap box mencantumkan isinya — sampai ke mood bahagianya.",
    ingTitle: "Bahan", ingList: 'Mentega, Tepung, Cokelat, Bubuk Cokelat, Gula, Telur, Garam, <span style="font-weight:900">Cinta</span>',
    treatKicker: "Cara menyimpan", treatTitle: "Jaga tetap nikmat", treatDesc: "Baru keluar oven memang juara — tapi tetap enak disimpan. Panaskan sebentar dan kelembutan baru-panggang itu kembali.", treatNote: "Mengandung kacang & rempah",
    storeK: "Simpan", storeT: "Suhu ruang", storeS: "Hingga 6 hari", chillK: "Dinginkan", chillT: "Kulkas", chillS: "Tahan dingin hingga 14 hari", reviveK: "Hangatkan", reviveT: "Panggang ulang", reviveS: "150°C · 5 menit",
    orderKicker: "Pesan sekarang", orderTitle: "Pesan box untuk pickup", orderSub: "Dipanggang fresh per pesanan dan siap diambil di titik pickup Kebagusan kami. Tambahkan gigitanmu dan checkout — QRIS, e-wallet & transfer bank.", orderOn: "Pesan di", orderDM: 'Mau ngobrol? DM kami di Instagram <strong style="color:var(--orange)">@nobitesleft.id</strong>',
    fbKicker: "Ulasan", fbTitle: "Bagaimana gigitanmu?", fbSub: "Ceritakan apa yang kamu suka (atau yang bisa kami tingkatkan).",
    fbRatingL: "Rating kamu", fbNameL: "Nama", fbNameP: "Nama kamu", fbFlavourL: "Rasa apa", fbFlavourP: "Pilih rasa…", fbMsgL: "Pesan", fbMsgP: "Rasa apa, dan bagaimana rasanya?",
    fbSend: "Kirim ulasan", fbSending: "Mengirim…", fbNeed: "Isi nama & rating", fbAnother: "Tulis lagi",
    footerTag: "Gigitan yang bikin nagih.", footerDesc: "Cookies, brownies & apple pie premium small-batch — dipanggang fresh per pesanan di Jakarta oleh Alfian, MasterChef Indonesia S10.",
    footerOrderC: "Pesan & kontak", footerExplore: "Jelajahi", footerWholesale: "Grosir",
    rights: "© 2026 No Bites Left. Hak cipta dilindungi.", bakedJkt: "Dipanggang fresh · Jakarta, Indonesia",
    pickerTitle: "Pilih nuansamu", pickerSub: "Tampilan untuk kunjunganmu — bisa diganti kapan saja dari header.", maybeLater: "Nanti saja",
    th: { Porcelain: { label: "Fresh & Bersih", sub: "Putih porselen" }, Cream: { label: "Hangat & Nyaman", sub: "Krem lembut" }, Sand: { label: "Golden Hour", sub: "Nuansa pasir" }, Espresso: { label: "Midnight Bake", sub: "Mode gelap" } },
    menu: [
      { tag: "Andalan", note: "Mengandung rempah", desc: "Apel US, kayu manis seimbang, dan sedikit pala dalam kulit yang renyah." },
      { tag: "Terlaris", note: "Mengandung kacang", desc: "Sang original — lembut dengan lelehan cokelat dan walnut panggang." },
      { tag: "", note: "Mengandung kacang", desc: "Double chocolate. Cookie cokelat pekat penuh choco chunks dan walnut." },
      { tag: "", note: "Mengandung kacang", desc: "Cookie cokelat dengan isian Nutella meleleh dan walnut renyah." },
      { tag: "", note: "Mengandung kacang", desc: "Matcha pilihan dengan white chocolate dan macadamia gurih." },
      { tag: "", note: "10 bites · pekat", desc: "Lembut, halus, dan sangat fudgy — cokelat pekat di setiap gigitan." },
    ],
    b2b: {
      tag: "Untuk kafe · Grosir", head: "Punya kafe? Stok produk hand-baked kami di etalasemu.", sub: "Produk hand-baked premium yang tak bisa pelangganmu temukan di tempat lain — rangkaian lengkap kami, siap dijual di kafemu sendiri.", cta: "Jadwalkan tasting gratis",
      valueKicker: "Kenapa untung", valueHead: "Margin kuat untuk etalasemu.", valuePill: "Markup sehat", valueBody: "Produk hand-baked premium yang nyaris menjual dirinya sendiri — dihargai agar setiap pcs menyisakan untung nyata di kontermu.", valueTasting: "Harga grosir lengkap dibuka saat tasting.",
      howTitle: "Cara kerjanya", steps: [
        { n: "01", t: "Jadwalkan tasting", d: "Cicipi semua produk dulu — tanpa komitmen, gratis." },
        { n: "02", t: "Pilih produk & volume", d: "Pilih yang cocok untuk etalase dan ritme mingguanmu." },
        { n: "03", t: "Kami antar & restock", d: "Batch fresh dengan jadwal yang sesuai kafemu." },
      ],
      factsTitle: "Hal teknisnya", facts: [
        { k: "Pesanan minimum", v: "20 pcs", s: "per pesanan" },
        { k: "Restock", v: "2× / minggu", s: "lead time 24–48 jam" },
        { k: "Area pengiriman", v: "Jabodetabek", s: "fresh, sesuai jadwal" },
        { k: "Ongkos kirim", v: "Di invoice", s: "dihitung per pesanan" },
      ],
      partnersTitle: "Sudah tersedia di", finalTitle: "Siap bicara angka?", finalSub: "Jadwalkan tasting gratis — kami bawa produknya, kamu yang putuskan.", waFallback: "Mau ngobrol sekarang?", waBtn: "Chat kami di WhatsApp",
      formTitle: "Jadwalkan tasting gratis", formSub: "Ceritakan tentang kafemu, kami akan menghubungi untuk menjadwalkan.", fName: "Nama kamu", fRole: "Peran kamu", fCafe: "Nama kafe", fCity: "Kota / area", fContact: "WhatsApp / telepon",
      rolePlaceholder: "Pilih peranmu…", roleOptions: ["Pemilik", "Manajer", "Barista", "Pembelian", "Lainnya"], fVolume: "Perkiraan volume mingguan", fVolumeOpt: "opsional", volOptions: ["Belum yakin", "Di bawah 50 pcs / minggu", "50–100 pcs / minggu", "100+ pcs / minggu"],
      submit: "Ajukan tasting saya", sending: "Mengirim…", need: "Lengkapi kolom wajib", successTitle: "Tasting diajukan!", successSub: "Kami akan menghubungi dalam 1×24 jam untuk menjadwalkan tasting-mu.", successWa: "Tak sabar? Chat kami di WhatsApp", another: "Kirim lagi", close: "Tutup", errReq: "Mohon isi nama, peran, kafe, kota, dan kontak.",
    },
    thanks: (n) => "Terima kasih, " + n + "!",
    thanksSub: (r) => "Ulasan " + r + " bintangmu bikin hari kami cerah. Kami baca semuanya.",
  },
};
