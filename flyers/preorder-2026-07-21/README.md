# Open Pre-Order Flyer — Cookies (21 Jul 2026)

On-brand pre-order flyer for the batch collected **Thursday, 21 July 2026**.
Built from the site's own brand assets: Gorditas + Lato fonts, the `no Bites Left`
wordmark, the four cookie photos (`hero-*-c.png`), and the brand palette
(orange `#f58c21`, red `#e24026`, matcha green `#2d9322`, choco `#54300b`).

## Files
| File | Purpose |
|------|---------|
| `no-bites-left-preorder-flyer.png` | 2382×3369 px (A4 @ ~288 DPI) — screen, social, print |
| `no-bites-left-preorder-flyer.pdf` | True A4 (210×297 mm), no margins — send to print |
| `flyer.source.html` | Self-contained source (fonts, images, QR embedded as data URIs) |

## Content
- **Headline:** Pre-Order Is Open! — Fresh batch, baked to order
- **Flavors:** Original (OG), Chocolate, Hazelnut, Matcha + Mixed Cookies box
- **Price:** Rp 15.000 per cookie
- **Ready:** Thursday · 21 July 2026
- **Order via:** WhatsApp 0817 7637 6636 · Instagram @nobitesleft.id · QR → nobitesleft.com
- Contains nuts

## Rebuild
The QR encodes `https://nobitesleft.com`. To re-render after editing the HTML:

```bash
chrome --headless --force-device-scale-factor=3 --window-size=794,1123 \
  --screenshot=flyer.png "file://$PWD/flyer.source.html"
chrome --headless --no-pdf-header-footer --print-to-pdf=flyer.pdf \
  "file://$PWD/flyer.source.html"
```
