"use client";

/**
 * Landing menu CRUD panel. Items grouped by family; each row is collapsed
 * (name · variant · price · availability) and expands into the full edit form —
 * price, availability, sort order, image/accent, tag/note/description in EN+ID.
 * "+ Add menu item" opens the same form blank. Deleting is allowed, but the
 * gentler path for retiring an item is toggling it to coming-soon.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MenuItem } from "@/lib/menuStore";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", borderRadius: 10, border: "1.5px solid var(--line)",
  fontSize: 13.5, background: "#fff", color: "var(--ink)",
};
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.03em", marginBottom: 3, display: "block" };
const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 14 };

type Draft = {
  sku: string; family: string; name: string; variant: string; unitPrice: string;
  available: boolean; sortOrder: string; image: string; accent: string;
  tag: string; tagId: string; note: string; noteId: string; description: string; descriptionId: string;
};

const emptyDraft = (): Draft => ({
  sku: "", family: "", name: "", variant: "", unitPrice: "", available: false, sortOrder: "0",
  image: "", accent: "", tag: "", tagId: "", note: "", noteId: "", description: "", descriptionId: "",
});

const toDraft = (m: MenuItem): Draft => ({
  sku: m.sku, family: m.family, name: m.name, variant: m.variant ?? "",
  unitPrice: m.unitPrice == null ? "" : String(m.unitPrice), available: m.available,
  sortOrder: String(m.sortOrder), image: m.image, accent: m.accent,
  tag: m.tag ?? "", tagId: m.tagId ?? "", note: m.note ?? "", noteId: m.noteId ?? "",
  description: m.description ?? "", descriptionId: m.descriptionId ?? "",
});

async function post(body: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/admin/ops/landing-menu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  return { ok: res.ok, error: d.error };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function EditForm({ draft, setDraft, isNew, onDone }: { draft: Draft; setDraft: (d: Draft) => void; isNew: boolean; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const save = async () => {
    setBusy(true);
    setError(null);
    const { ok, error } = await post({
      action: "upsert",
      item: {
        ...draft,
        unitPrice: draft.unitPrice === "" ? null : Number(draft.unitPrice),
        sortOrder: Number(draft.sortOrder) || 0,
        family: draft.family || draft.sku,
      },
    });
    setBusy(false);
    if (!ok) { setError(error ?? "failed"); return; }
    onDone();
    router.refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field label="SKU">
          <input style={{ ...inputStyle, background: isNew ? "#fff" : "var(--surface2)" }} value={draft.sku} disabled={!isNew}
            onChange={(e) => set({ sku: e.target.value.toLowerCase() })} placeholder="og-40" />
        </Field>
        <Field label="Family">
          <input style={inputStyle} value={draft.family} onChange={(e) => set({ family: e.target.value.toLowerCase() })} placeholder="og" />
        </Field>
        <Field label="Sort order">
          <input type="number" style={inputStyle} value={draft.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.8fr", gap: 10 }}>
        <Field label="Name">
          <input style={inputStyle} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="OG Cookies" />
        </Field>
        <Field label="Variant">
          <input style={inputStyle} value={draft.variant} onChange={(e) => set({ variant: e.target.value })} placeholder="Personal 40g" />
        </Field>
        <Field label="Price (IDR)">
          <input type="number" inputMode="numeric" min="0" style={inputStyle} value={draft.unitPrice} onChange={(e) => set({ unitPrice: e.target.value })} placeholder="20000" />
        </Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
        <input type="checkbox" checked={draft.available} onChange={(e) => set({ available: e.target.checked })} style={{ width: 16, height: 16, accentColor: "var(--choco)" }} />
        Orderable (unchecked = shown as &quot;coming soon&quot;)
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Tag (EN)"><input style={inputStyle} value={draft.tag} onChange={(e) => set({ tag: e.target.value })} placeholder="Bestseller" /></Field>
        <Field label="Tag (ID)"><input style={inputStyle} value={draft.tagId} onChange={(e) => set({ tagId: e.target.value })} placeholder="Terlaris" /></Field>
        <Field label="Note (EN)"><input style={inputStyle} value={draft.note} onChange={(e) => set({ note: e.target.value })} placeholder="Contains nuts" /></Field>
        <Field label="Note (ID)"><input style={inputStyle} value={draft.noteId} onChange={(e) => set({ noteId: e.target.value })} placeholder="Mengandung kacang" /></Field>
      </div>
      <Field label="Description (EN)">
        <textarea style={{ ...inputStyle, minHeight: 54, resize: "vertical" }} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label="Description (ID)">
        <textarea style={{ ...inputStyle, minHeight: 54, resize: "vertical" }} value={draft.descriptionId} onChange={(e) => set({ descriptionId: e.target.value })} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.8fr", gap: 10 }}>
        <Field label="Image path"><input style={inputStyle} value={draft.image} onChange={(e) => set({ image: e.target.value })} placeholder="/images/menu-og-c.png" /></Field>
        <Field label="Accent color"><input style={inputStyle} value={draft.accent} onChange={(e) => set({ accent: e.target.value })} placeholder="#f58c21" /></Field>
      </div>

      {error && <div style={{ fontSize: 12.5, color: "var(--red)", fontWeight: 700 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={busy || !draft.sku || !draft.name}
          style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
          {busy ? "Saving…" : isNew ? "Add item" : "Save changes"}
        </button>
        <button onClick={onDone} style={{ padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--line)", background: "#fff", color: "var(--soft)", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: MenuItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));
  const [busy, setBusy] = useState(false);

  const del = async () => {
    if (!confirm(`Delete "${item.name}${item.variant ? ` (${item.variant})` : ""}" from the landing menu? Consider marking it coming-soon instead.`)) return;
    setBusy(true);
    await post({ action: "delete", sku: item.sku });
    setBusy(false);
    router.refresh();
  };
  const toggleAvailable = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    await post({ action: "upsert", item: { ...toDraft(item), unitPrice: item.unitPrice, sortOrder: item.sortOrder, available: !item.available } });
    setBusy(false);
    router.refresh();
  };

  return (
    <div style={card}>
      <div onClick={() => { setDraft(toDraft(item)); setOpen(!open); }} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }}>
        <span style={{ width: 12, height: 12, borderRadius: 4, background: item.accent, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 140 }}>
          <span style={{ fontWeight: 800, fontSize: 13.5 }}>{item.name}</span>
          {item.variant && <span style={{ color: "var(--soft)", fontSize: 12.5 }}> · {item.variant}</span>}
          <span style={{ color: "var(--soft)", fontWeight: 600, fontSize: 11.5 }}> · {item.sku}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800 }}>{item.unitPrice != null ? rupiah(item.unitPrice) : "—"}</span>
        <button onClick={toggleAvailable} disabled={busy}
          style={{ padding: "4px 10px", borderRadius: 999, border: "none", fontSize: 11, fontWeight: 800, cursor: "pointer",
            background: item.available ? "var(--tint-success)" : "var(--surface2)", color: item.available ? "var(--green)" : "var(--soft)" }}>
          {item.available ? "orderable" : "coming soon"}
        </button>
        <button onClick={(e) => { e.stopPropagation(); del(); }} disabled={busy} aria-label="delete item"
          style={{ border: "none", background: "transparent", color: "var(--red)", fontSize: 15, cursor: "pointer" }}>🗑</button>
        <span style={{ color: "var(--soft)", fontSize: 12, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
      </div>
      {open && <EditForm draft={draft} setDraft={setDraft} isNew={false} onDone={() => setOpen(false)} />}
    </div>
  );
}

export default function LandingMenuPanel({ items }: { items: MenuItem[] }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  // Group by family, preserving the store's sort order.
  const families: { family: string; list: MenuItem[] }[] = [];
  for (const m of items) {
    const f = families.find((x) => x.family === m.family);
    if (f) f.list.push(m);
    else families.push({ family: m.family, list: [m] });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, borderStyle: adding ? "solid" : "dashed" }}>
        {adding ? (
          <>
            <div style={{ fontWeight: 900, fontSize: 14.5, color: "var(--choco)" }}>New menu item</div>
            <EditForm draft={draft} setDraft={setDraft} isNew onDone={() => { setAdding(false); setDraft(emptyDraft()); }} />
          </>
        ) : (
          <button onClick={() => setAdding(true)} style={{ border: "none", background: "transparent", color: "var(--choco)", fontWeight: 900, fontSize: 13.5, cursor: "pointer", width: "100%", textAlign: "left" }}>
            + Add menu item
          </button>
        )}
      </div>

      {families.map(({ family, list }) => (
        <div key={family}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8, textTransform: "uppercase" }}>
            {family} · {list.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {list.map((m) => <ItemCard key={m.sku} item={m} />)}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 11.5, color: "var(--soft)" }}>
        This menu is what the landing page shows AND what orders are priced from (server-side).
        Coming-soon items are visible but not orderable. Website SKU ↔ ops product links live in Menu links.
      </div>
    </div>
  );
}
