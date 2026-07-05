import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { CartProvider } from "@/lib/cart/CartContext";
import { OrderFlowProvider } from "@/lib/order-flow/OrderFlowContext";
import { LandingProvider } from "@/lib/landing/LandingContext";
import OrderDrawer from "./_components/OrderDrawer";
import Toasts from "./_components/Toasts";

export const metadata = {
  title: "No Bites Left — Orders",
  description: "Order fresh hand-baked treats for pickup at No Bites Left",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <CartProvider>
            <OrderFlowProvider>
              <LandingProvider>
                {children}
                <OrderDrawer />
                <Toasts />
              </LandingProvider>
            </OrderFlowProvider>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
