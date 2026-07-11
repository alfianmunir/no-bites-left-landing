/**
 * Ops admin EN/ID copy (PRD §7 revamp Task 6). Ported from the design prototype's
 * `T` dict. The active language lives in the `ops_lang` cookie, read server-side
 * so RSC renders localized; the header pill toggles it.
 *
 * Scope: the revamped surfaces (shell nav, Today, Orders, Board, Activity). Legacy
 * screen bodies (Stock/Receive/Recipes/Money/…) stay English this pass — only
 * their nav labels are localized. Currency stays id-ID formatted in both langs.
 */
export type OpsLang = "en" | "id";

export function opsLangFromCookie(value: string | undefined | null): OpsLang {
  return value === "id" ? "id" : "en";
}

const en = {
  // shell
  ops: "Ops",
  queue: "Queue",
  today: "Today",
  groups: { stock: "Stock", production: "Production", order: "Order", finance: "Finance", hr: "HR" },
  scr: {
    stock: "Stock", ledger: "Ledger", items: "Items", receive: "Receive", opname: "Opname", waste: "Waste",
    recipes: "Recipes", batches: "Batches", board: "Board", orders: "Orders", bake: "Bake",
    menu: "Menu", menulinks: "Menu links", money: "Money", pricing: "Pricing", forecast: "Forecast", team: "Team",
  },
  // Today
  todayTitle: "Today",
  guardrails: "Guardrails & alerts",
  allClear: "All clear — no alerts. 🎉",
  cash: "Cash position", revenue: "Revenue (mo)", grossP: "Gross profit (mo)", opP: "Operating profit (mo)",
  openBatches: "Open batches", lowStock: "Low stock items", ar: "AR outstanding", waste30: "Waste (30d)",
  reorderTitle: "Reorder needed", createPO: "Create purchase order", openStock: "Open Stock",
  marginTitle: "Margin below floor", reviewPricing: "Review pricing",
  expiryTitle: "Expiring soon", planBake: "Plan a bake",
  driftRow: (name: string, amt: string) => `Website order ${name} paid but not in finance — ${amt}`,
  overdueRow: (who: string, amt: string) => `Invoice overdue — ${who} ${amt}`,
  marginBody: (name: string, m: string, floor: string, price: string) => `${name} margin is ${m} — the floor is ${floor}. Raising the price to ${price} clears it.`,
  marginMore: (n: number) => ` +${n} more below floor.`,
  expiryBody: (item: string, left: string) => `${item} — ${left}. A bake would use it up before it turns.`,
  daysLeft: (n: number) => `${n} day${n === 1 ? "" : "s"} left`,
  expiredWord: "expired",
  prepBanner: (o: number, p: number) => `${o} order${o === 1 ? "" : "s"} in preparing · ${p} pickup${p === 1 ? "" : "s"} today`,
  openBoard: "Open board",
  // Orders
  toPrepare: "🧑‍🍳 To prepare",
  unitsAcross: "units across preparing orders",
  prepEmpty: "Nothing in preparing — all caught up. 🎉",
  newOrderTitle: "New order",
  channel: "Channel", customer: "Customer", partner: "Partner / cafe", custPh: "name / ref", orderDate: "Order date",
  itemsL: "Items", addItem: "+ Add item", productPh: "— product —", pricePh: "price",
  canteenNote: "Canteen orders are recorded as paid and delivered right away.",
  record: "Record order", recordB2B: "Record order + invoice", saving: "Saving…",
  doneOrder: "Order recorded.", doneB2B: "Order recorded + invoice raised.", doneCanteen: "Canteen order recorded — paid & delivered.",
  gross: "Gross", fee: "Fee", cogs: "COGS", net: "Net", margin: "Margin",
  allOrders: "All orders", searchPh: "Search customer, item, channel…",
  all: "All", typeWebsite: "Website", typeChannel: "Channel", paid: "Paid", unpaid: "Unpaid",
  selectAll: "Select all", deselectAll: "Deselect all", noResults: "No orders match.",
  newPaid: "NEW · PAID", pickup: "pickup", overdueWord: "overdue", expired: "EXPIRED", expiredNote: "Auto-cancelled — payment expired",
  today2: "Today", tomorrow2: "Tomorrow",
  setStage: "Set stage…", setPayment: "Set payment…", applyTo: "Apply to", selected: "selected", clear: "Clear",
  applying: "Applying…", bulkNote: "website orders move forward only · payment applies to channel orders",
  bulkPreparing: "Preparing", bulkPacked: "Packed / Baking", bulkMid: "In delivery / Ready for pickup", bulkDone: "Delivered / Picked up",
  markPaid: "Mark paid", markUnpaid: "Mark unpaid", cancel: "Cancel", cancelled: "Cancelled", stockReturned: "stock returned, cash reversed",
  cancelConfirm: "Cancel this order? This returns its stock to inventory, reverses any cash posted, and (for B2B) voids the invoice.",
  arLabel: "B2B INVOICES (AR)", open: "open", due: "due", sent: "sent", voidWord: "void", current: "current", overdueSuffix: "overdue",
  // Board
  boardTitle: "Order board",
  openOrders: "Open orders", stPreparing: "Preparing", stPacked: "Packed", stReady: "Ready for pickup",
  stDelivery: "In delivery", stDelivered: "Delivered", stPickedUp: "Picked up",
  pickupsLabel: "PICKUPS", pickupsToday: "Pickups today", byStage: "BY STAGE",
  bkOverdue: "Overdue", bkToday: "Today", bkTomorrow: "Tomorrow", bkUpcoming: "Upcoming",
  boardEmpty: "No open orders — all caught up. 🎉", recordEdit: "Record / edit orders",
  // Activity
  activity: "Activity", activitySub: "Every change is logged here", notifyVia: "Notify changes via",
  markAllRead: "Mark all read", noActivity: "No activity yet.", loadingWord: "Loading…",
  whatsapp: "WhatsApp", whatsappNote: "stubbed — no provider yet", email: "Email",
  // status labels
  chStage: { preparing: "Preparing", packed: "Packed", in_delivery: "In delivery", delivered: "Delivered" } as Record<string, string>,
  webStage: { PAID: "Preparing", BAKING: "Packed", READY_FOR_PICKUP: "Ready for pickup", PICKED_UP: "Picked up" } as Record<string, string>,
};

export type OpsStrings = typeof en;

const id: OpsStrings = {
  ops: "Ops",
  queue: "Antrean",
  today: "Hari Ini",
  groups: { stock: "Stok", production: "Produksi", order: "Pesanan", finance: "Keuangan", hr: "HR" },
  scr: {
    stock: "Stok", ledger: "Buku besar", items: "Item", receive: "Terima", opname: "Opname", waste: "Terbuang",
    recipes: "Resep", batches: "Batch", board: "Papan", orders: "Pesanan", bake: "Lembar produksi",
    menu: "Menu", menulinks: "Tautan menu", money: "Uang", pricing: "Harga", forecast: "Prakiraan", team: "Tim",
  },
  todayTitle: "Hari Ini",
  guardrails: "Pengaman & peringatan",
  allClear: "Semua aman — tidak ada peringatan. 🎉",
  cash: "Posisi kas", revenue: "Pendapatan (bln)", grossP: "Laba kotor (bln)", opP: "Laba operasional (bln)",
  openBatches: "Batch berjalan", lowStock: "Stok menipis", ar: "Piutang", waste30: "Terbuang (30h)",
  reorderTitle: "Perlu pesan ulang", createPO: "Buat pesanan pembelian", openStock: "Buka Stok",
  marginTitle: "Margin di bawah batas", reviewPricing: "Tinjau harga",
  expiryTitle: "Segera kedaluwarsa", planBake: "Rencanakan produksi",
  driftRow: (name, amt) => `Pesanan situs ${name} lunas tapi belum masuk keuangan — ${amt}`,
  overdueRow: (who, amt) => `Faktur terlambat — ${who} ${amt}`,
  marginBody: (name, m, floor, price) => `Margin ${name} ${m} — batas minimal ${floor}. Naikkan harga menjadi ${price} untuk mencapainya.`,
  marginMore: (n) => ` +${n} lagi di bawah batas.`,
  expiryBody: (item, left) => `${item} — ${left}. Satu batch akan menghabiskannya sebelum kedaluwarsa.`,
  daysLeft: (n) => `sisa ${n} hari`,
  expiredWord: "kedaluwarsa",
  prepBanner: (o, p) => `${o} pesanan disiapkan · ${p} pengambilan hari ini`,
  openBoard: "Buka papan",
  toPrepare: "🧑‍🍳 Perlu disiapkan",
  unitsAcross: "unit dari pesanan disiapkan",
  prepEmpty: "Tidak ada yang disiapkan — semua beres. 🎉",
  newOrderTitle: "Pesanan baru",
  channel: "Kanal", customer: "Pelanggan", partner: "Mitra / kafe", custPh: "nama / ref", orderDate: "Tanggal",
  itemsL: "Item", addItem: "+ Tambah item", productPh: "— produk —", pricePh: "harga",
  canteenNote: "Pesanan kantin langsung tercatat lunas dan terkirim.",
  record: "Simpan pesanan", recordB2B: "Simpan + buat faktur", saving: "Menyimpan…",
  doneOrder: "Pesanan tersimpan.", doneB2B: "Pesanan tersimpan + faktur dibuat.", doneCanteen: "Pesanan kantin tersimpan — lunas & terkirim.",
  gross: "Kotor", fee: "Biaya", cogs: "HPP", net: "Bersih", margin: "Margin",
  allOrders: "Semua pesanan", searchPh: "Cari pelanggan, item, kanal…",
  all: "Semua", typeWebsite: "Situs", typeChannel: "Kanal", paid: "Lunas", unpaid: "Belum lunas",
  selectAll: "Pilih semua", deselectAll: "Batal pilih", noResults: "Tidak ada pesanan yang cocok.",
  newPaid: "BARU · LUNAS", pickup: "ambil", overdueWord: "terlambat", expired: "KEDALUWARSA", expiredNote: "Dibatalkan otomatis — pembayaran kedaluwarsa",
  today2: "Hari ini", tomorrow2: "Besok",
  setStage: "Atur tahap…", setPayment: "Atur pembayaran…", applyTo: "Terapkan ke", selected: "dipilih", clear: "Batal",
  applying: "Menerapkan…", bulkNote: "pesanan situs hanya maju · pembayaran untuk pesanan kanal",
  bulkPreparing: "Disiapkan", bulkPacked: "Dikemas", bulkMid: "Diantar / Siap diambil", bulkDone: "Terkirim / Sudah diambil",
  markPaid: "Tandai lunas", markUnpaid: "Tandai belum", cancel: "Batalkan", cancelled: "Dibatalkan", stockReturned: "stok dikembalikan, kas dibalik",
  cancelConfirm: "Batalkan pesanan ini? Stok dikembalikan ke inventaris, kas yang tercatat dibalik, dan (untuk B2B) faktur dibatalkan.",
  arLabel: "FAKTUR B2B (PIUTANG)", open: "terbuka", due: "jatuh tempo", sent: "terkirim", voidWord: "batal", current: "lancar", overdueSuffix: "terlambat",
  boardTitle: "Papan pesanan",
  openOrders: "Pesanan aktif", stPreparing: "Disiapkan", stPacked: "Dikemas", stReady: "Siap diambil",
  stDelivery: "Diantar", stDelivered: "Terkirim", stPickedUp: "Sudah diambil",
  pickupsLabel: "PENGAMBILAN", pickupsToday: "Pengambilan hari ini", byStage: "PER TAHAP",
  bkOverdue: "Terlambat", bkToday: "Hari ini", bkTomorrow: "Besok", bkUpcoming: "Mendatang",
  boardEmpty: "Tidak ada pesanan aktif — semua beres. 🎉", recordEdit: "Catat / ubah pesanan",
  activity: "Aktivitas", activitySub: "Semua perubahan dicatat di sini", notifyVia: "Kirim notifikasi via",
  markAllRead: "Tandai semua dibaca", noActivity: "Belum ada aktivitas.", loadingWord: "Memuat…",
  whatsapp: "WhatsApp", whatsappNote: "belum ada penyedia", email: "Email",
  chStage: { preparing: "Disiapkan", packed: "Dikemas", in_delivery: "Diantar", delivered: "Terkirim" },
  webStage: { PAID: "Disiapkan", BAKING: "Dikemas", READY_FOR_PICKUP: "Siap diambil", PICKED_UP: "Sudah diambil" },
};

export const OPS_STR: Record<OpsLang, OpsStrings> = { en, id };
