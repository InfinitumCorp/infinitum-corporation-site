# Infinitum product UI guidelines

**Every Infinitum product UI looks like [infinitum-corporation.vercel.app](https://infinitum-corporation.vercel.app/): clean, white, typographic.** That covers apps, dashboards, prototypes, consoles and settings screens. Values below are taken from the live site's stylesheet (`assets/one-page.css`) and computed styles. If the site changes, update this note.

## 1. Clean and white

- White page (`#fff`), near-black ink, thin grey hairlines. No dark default theme, gradients, glows, glass effects or decorative illustration.
- Structure comes from whitespace, type size and 1px rules, not from colored panels or heavy shadows.
- Square corners: buttons and inputs on the site have a `0` radius. Keep any rounding minimal.
- Blue is for links and focus only. Never use it as a fill or background.

```css
:root {
  --ink:    #111820;  /* text, borders of primary controls */
  --muted:  #52606b;  /* secondary text */
  --line:   #d6dce1;  /* hairlines, dividers, input borders */
  --accent: #2454dd;  /* links and focus rings only */
  --paper:  #ffffff;  /* background */
  color-scheme: light;
}
```

## 2. Fonts

One family, system-installed, with no web-font download:

```css
font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
```

| Role | Size | Weight | Letter-spacing |
|---|---|---|---|
| Display / H1 | ~6.4rem desktop, scales down | 400 | −0.065em, line-height ≈ 0.98 |
| H2 | ~3.6rem desktop, scales down | 400 | −0.055em |
| Body | 16px | 400 | normal |
| Nav, labels, buttons | 13px | 400 | normal |

- Headlines are **regular weight (400)** with tight negative tracking. Size carries the hierarchy, not boldness.
- Don't add a second typeface. Don't use bold in headlines.

## 3. Buttons and controls

- Primary action: transparent background, `1px solid var(--ink)` border, ink text, `13px`, padding `10px 22px`, radius `0`.
- Inputs: white, `1px solid var(--line)`, radius `0`; on focus, the border turns `--ink` or shows an `--accent` focus ring.

## 4. Product logos are text wordmarks

Each product's logo **is its name, typed in the product font**, with its exact punctuation and symbols. No image logos, icons or monograms in their place, including app headers, favicons-with-text, sidebars and login screens.

Use these spellings exactly. The symbols are part of the mark:

| Wordmark | Product |
|---|---|
| `ODIN°` | Complete suite (military) |
| `METATRON¹⁰⁰` | Consumer command center |
| `SCALVS.ai` | AI workforce platform |
| `/CNDCTR/` | AI execution workspace |
| `CONJURE` | Prediction model behind forecasts in every product |
| `+SPCTR` | Intelligent CRM |
| `>_ARGUS` | AI sensor fusion |
| `[HRVST]` | Observation capture and licensing |
| `ei·det·ic` | Identity intelligence |
| `VEIL</>` | Secure browser |
| `ÆTHER` | Secure communications and networking |
| `FABRIC` | Secure messaging |
| `E(O)N` | AI wearable |
| `Cumulus://Cloud` (identity: `Cumulus://ID`) | AI-native cloud |
| `FIRM` · `FIRM Wallet` | Nexus token and wallet |
| `Firmament Network` | Ecosystem blockchain |
| `#THRONE` | AI computers |
| `NEMESIS` · `ORBIS` · `POLLEN` · `Flower` | Drones and base station |

- Escape HTML-significant characters in markup: `VEIL&lt;/&gt;`, `&gt;_ARGUS`.
- Never restyle a wordmark: no case changes (`Scalvs`), dropped symbols (`VEIL`, `SPCTR`), or added spaces (`/ CNDCTR /`).
- Size and weight follow the surrounding type. The wordmark is text, so it stays selectable and accessible.

## 5. Trademark symbols (™ / ®)

Product wordmarks carry **™**. The Infinitum corporate mark carries **®**. Both are small superscripts, matching the site:

```html
<h4>VEIL&lt;/&gt;<sup class="tm">™</sup></h4>
```

```css
sup.tm {
  font-size: .38em;          /* .65em inside small text such as labels and footers */
  vertical-align: super;
  line-height: 0;            /* never changes line height */
  margin-left: .08em;
  letter-spacing: 0;
  font-weight: 400;
}
```

- Put ™ on the wordmark in the **app header, sign-in screen, about/legal screens and the first mention on a page**. Repeated mentions in running text and UI labels can go without it.
- Use the real character `™` (U+2122) in a `<sup class="tm">`. Never write `(TM)` or `TM`.

## 6. Checklist for a new or updated product screen

- [ ] White background, tokens from §1, no dark theme by default
- [ ] Helvetica Neue stack only; headlines at weight 400 with negative tracking
- [ ] Square-cornered outline buttons, 13px labels
- [ ] Product logo is the exact text wordmark from §4, with `™` per §5
- [ ] Works at 390px wide with no horizontal scroll
- [ ] Simulated or demo data is labeled as such

© 2026 Infinitum Corporation
