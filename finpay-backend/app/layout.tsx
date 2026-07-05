import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { CartProvider } from "@/lib/cart/CartContext";
import { OrderFlowProvider } from "@/lib/order-flow/OrderFlowContext";
import { LandingProvider } from "@/lib/landing/LandingContext";
import OrderDrawer from "./_components/OrderDrawer";
import Toasts from "./_components/Toasts";

import type { Metadata, Viewport } from "next";

export const viewport: Viewport = { themeColor: "#f58c21" };

export const metadata: Metadata = {
  metadataBase: new URL("https://nobitesleft.com"),
  title: "No Bites Left | Small-Batch Cookies, Brownies & Apple Pie · Jakarta",
  description:
    "Thick soft-baked cookies, fudgy brownies and signature apple pie — baked fresh to order in Jakarta by Alfian (MasterChef Indonesia S10). Order for pickup, or via Shopee & GrabFood.",
  keywords: [
    "No Bites Left", "cookies Jakarta", "soft baked cookies", "brownies Jakarta", "apple pie Jakarta",
    "Nutella cookies", "matcha cookies", "premium cookies Jakarta", "Shopee Food", "GrabFood", "dessert Jakarta",
  ],
  authors: [{ name: "No Bites Left" }],
  alternates: { canonical: "https://nobitesleft.com/" },
  icons: { icon: "/images/mini-cookies.png", apple: "/images/mini-cookies.png" },
  openGraph: {
    type: "website",
    siteName: "No Bites Left",
    title: "No Bites Left — Small-Batch Cookies, Brownies & Apple Pie · Jakarta",
    description:
      "Thick soft-baked cookies, fudgy brownies and signature apple pie — baked fresh to order in Jakarta. Order for pickup, or via Shopee & GrabFood.",
    url: "https://nobitesleft.com/",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630 }],
    locale: "en_US",
    alternateLocale: "id_ID",
  },
  twitter: {
    card: "summary_large_image",
    title: "No Bites Left — Small-Batch Cookies, Brownies & Apple Pie · Jakarta",
    description:
      "Thick soft-baked cookies, fudgy brownies and signature apple pie — baked fresh to order in Jakarta. Order for pickup, or via Shopee & GrabFood.",
    images: ["/og-image.jpg"],
  },
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
