import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAddressStore } from "@/lib/addressStore";
import type { DeliveryAddress } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ addresses: [] });
  const store = getAddressStore();
  await store.init();
  const addresses = await store.list(session.id);
  return NextResponse.json({ addresses });
}

interface CreateAddressBody {
  label?: string;
  recipientName?: string;
  phone?: string;
  area?: string;
  fullAddress?: string;
  notes?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  let body: CreateAddressBody;
  try {
    body = (await req.json()) as CreateAddressBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const recipientName = (body.recipientName ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const area = (body.area ?? "").trim();
  const fullAddress = (body.fullAddress ?? "").trim();
  if (!recipientName || !phone || !area || !fullAddress) {
    return NextResponse.json({ error: "recipientName, phone, area, and fullAddress are required" }, { status: 400 });
  }

  const address: DeliveryAddress = { recipientName, phone, area, fullAddress, notes: body.notes?.trim() || undefined };
  const store = getAddressStore();
  await store.init();
  const saved = await store.create(session.id, body.label?.trim() || "Address", address);
  return NextResponse.json({ address: saved });
}
