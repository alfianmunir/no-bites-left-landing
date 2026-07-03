"use client";

/**
 * In-progress checkout state (address → shipping → date → review), shared
 * across those pages via context (persists across client-side navigation
 * since CheckoutDraftProvider lives in the root layout) and mirrored to
 * localStorage so a full page reload doesn't lose it.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { DeliveryAddress } from "@/lib/orders";
import type { CourierOption } from "@/lib/courier";

export interface CheckoutDraft {
  address: DeliveryAddress | null;
  courier: CourierOption | null;
  deliveryDate: string | null;
}

const EMPTY_DRAFT: CheckoutDraft = { address: null, courier: null, deliveryDate: null };
const STORAGE_KEY = "nbl_checkout_draft_v1";

interface CheckoutDraftContextValue {
  draft: CheckoutDraft;
  setAddress: (address: DeliveryAddress) => void;
  setCourier: (courier: CourierOption) => void;
  setDeliveryDate: (date: string) => void;
  clearDraft: () => void;
}

const CheckoutDraftContext = createContext<CheckoutDraftContextValue | null>(null);

function readStored(): CheckoutDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as CheckoutDraft) } : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

export function CheckoutDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<CheckoutDraft>(EMPTY_DRAFT);
  const hydrated = useRef(false);

  useEffect(() => {
    setDraft(readStored());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  const value: CheckoutDraftContextValue = {
    draft,
    setAddress: (address) => setDraft((d) => ({ ...d, address })),
    setCourier: (courier) => setDraft((d) => ({ ...d, courier })),
    setDeliveryDate: (deliveryDate) => setDraft((d) => ({ ...d, deliveryDate })),
    clearDraft: () => setDraft(EMPTY_DRAFT),
  };

  return <CheckoutDraftContext.Provider value={value}>{children}</CheckoutDraftContext.Provider>;
}

export function useCheckoutDraft(): CheckoutDraftContextValue {
  const ctx = useContext(CheckoutDraftContext);
  if (!ctx) throw new Error("useCheckoutDraft() must be used within <CheckoutDraftProvider>");
  return ctx;
}
