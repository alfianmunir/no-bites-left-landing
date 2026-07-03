import type { ReactNode } from "react";
import "./globals.css";
import { CartProvider } from "@/lib/cart/CartContext";
import { CheckoutDraftProvider } from "@/lib/checkout/CheckoutDraftContext";
import CartDrawer from "./_components/CartDrawer";
import Toasts from "./_components/Toasts";

export const metadata = {
  title: "No Bites Left — Orders",
  description: "Order checkout and status for No Bites Left",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CartProvider>
          <CheckoutDraftProvider>
            {children}
            <CartDrawer />
            <Toasts />
          </CheckoutDraftProvider>
        </CartProvider>
      </body>
    </html>
  );
}
