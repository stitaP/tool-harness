# Ready-made sites, headless CMS and finance tools

stitaP builds whole websites from **open-source templates** instead of writing them from scratch. A small local
model fills in names, colours and settings; the code it starts from is a maintained project that already works.

| Tool | What it does |
|---|---|
| `site_template` | `list` the catalog, `info <id>`, `create <id>` a project: downloads the upstream project at a pinned version, applies our patch, applies your branding (`site_name`, `description`, `brand_color`, `company`), writes `.env`, keeps the upstream LICENSE and writes `TEMPLATE-NOTICE.md`; `install=true` also runs `npm install` |
| `strapi_cms` | drives a Strapi project: `create_type` (content types as Strapi's own files), `types`, `setup` (first admin + API token into `.env`), `list` / `get` / `create` / `update` / `delete` entries over the REST API |
| `finance_calc` | exact loan maths: EMI, amortization schedule, flat vs reducing interest, part prepayment, eligibility (FOIR), implied rate, simple and compound interest |
| `page_check` | opens every page of a site in headless Chromium and lists broken ones (script errors, missing files, empty pages) |

`site_template`, `strapi_cms` and `finance_calc` are **on demand**: they are not sent with every model call (saves
~1,500 tokens of context per call); the agent is told they exist and finds them with `tool_search`. To always send
one, set it to *Always on* in ⚙ Settings ▸ Tools.

Ask in plain words — *"create an online store for PrakritTattva in green"*, *"set up a Strapi CMS with products and
categories"*, *"what is the EMI on ₹5 lakh at 12% for 3 years"* — or call the tools directly.

## The catalog

`agent/templates/catalog.json`. **Adapted** packs are patched and tested end to end; **listed** ones are pinned and
license-checked and used as upstream ships them.

| id | What | Stack | License | Status |
|---|---|---|---|---|
| `ecommerce-next` | Store + headless CMS: products, variants, categories, carts, orders, accounts, admin, Stripe | Next.js + Payload CMS (SQLite) | MIT | adapted |
| `ecommerce-nuxt` | Storefront: product grid, search, colour/size variants, cart, cash-on-delivery checkout into Payload orders, 4 languages | Nuxt (zackha/nuxtcommerce) on `ecommerce-next` | MIT | adapted |
| `cms-strapi` | Headless CMS: content types, REST API, media library, roles | Strapi 5 Community Edition (SQLite) | MIT* | adapted |
| `lending-portal-nuxt` | Lender / NBFC portal: portfolio per currency, loans + schedules, collections, investors, calculators, WhatsApp updates, login | Nuxt UI dashboard on Apache Fineract | MIT | adapted |
| `website-next` | Company website + CMS: layout blocks, posts, forms, SEO, search | Next.js + Payload | MIT | listed |
| `docs-next` / `docs-nuxt` | Documentation portal | Docusaurus / Nuxt UI docs | MIT | listed |
| `landing-nuxt`, `saas-nuxt`, `portfolio-nuxt` | Landing page, SaaS site (pricing, blog, auth pages), portfolio | Nuxt UI templates | MIT | listed |
| `dashboard-nuxt` | Admin dashboard (base for back-office portals) | Nuxt UI | MIT | listed |
| `chat-nuxt` | Chat app with AI assistant | Nuxt UI + AI SDK | MIT | listed |
| `streaming-homehost` | Self-hosted Netflix-like streaming | React (homehost) | MIT | listed |
| `iot-mqtt-tiles` | IoT dashboard over MQTT (watch and control devices) | Vue (MQTT-Tiles) | MIT | listed |
| `ev-chargers-ocm` | EV charger finder (Open Charge Map) | Ionic / Angular | MIT | listed |
| `lending-fineract` | Core banking / lending / NBFC backend | Apache Fineract (Java) | Apache-2.0 | listed |
| `lending-mifos-web` | Full back-office app for Fineract | Mifos X (Angular) | MPL-2.0 | listed |
| `remote-desktop-guacamole` | Remote desktop in the browser (RDP, VNC, SSH) | Apache Guacamole | Apache-2.0 | listed |

\* Strapi Community Edition is MIT as long as you do not use code under an `ee/` folder (Enterprise features) or a
Strapi Cloud account; the pack skips the cloud login.

### Example: a store with a Nuxt front-end

```text
site_template action=create id=ecommerce-next name=shop-cms site_name="PrakritTattva" company="Prakrit Pvt Ltd" install=true
site_template action=create id=ecommerce-nuxt name=shop site_name="PrakritTattva" brand_color=green backend_url=http://localhost:3000 install=true
```

Start `shop-cms` (`npm run dev`, port 3000), open `/admin` to create the admin user, add products (inventory > 0),
put that admin's email/password in `shop/.env` (`PAYLOAD_EMAIL`, `PAYLOAD_PASSWORD` — the storefront's server uses
them only to create orders) and start `shop` (`npx nuxt dev --port 3001`).

### Example: Strapi

```text
site_template action=create id=cms-strapi name=content install=true      # then: cd content && npm run develop
strapi_cms action=setup dir=content email=admin@example.com password=Str0ngPass
strapi_cms action=create_type dir=content name=product fields={"title":"string!","price":"decimal","status":"enumeration:draft,live","image":"media","category":"relation:category"}
strapi_cms action=create dir=content type=products data={"title":"Organic ghee","price":499}
strapi_cms action=list dir=content type=products
```

Field shorthand: `string`, `text`, `richtext`, `blocks`, `email`, `integer`, `decimal`, `float`, `boolean`, `date`,
`datetime`, `json`, `uid:<field>`, `enumeration:a,b,c`, `media`, `media[]` (several), `relation:<type>` (many-to-one),
`relation[]:<type>` (many-to-many); end with `!` for required.

### Example: lending portal with WhatsApp

```text
site_template action=create id=lending-portal-nuxt name=finance site_name="Prakrit Finance" admin_email=ops admin_password=<portal password> install=true
```

It runs against the public Mifos demo until you set `FINERACT_URL` / `FINERACT_USER` / `FINERACT_PASSWORD`.
Set `PORTAL_PASSWORD` (login) and `WEBHOOK_SECRET`. WhatsApp uses Meta's **official** WhatsApp Business Cloud API:
add `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`, create the message templates listed in the project's
`README-LENDING.md` (WhatsApp delivers only approved templates outside a 24-hour chat), add a Fineract *Web* hook to
`/api/webhooks/fineract?secret=…` for disbursements and repayments, and run `POST /api/notify/overdue?secret=…` daily
(`/cron add "every day at 10:00" curl -X POST …`). Without a token every update is recorded as a dry run and shown
in the portal's notifications. Investors' and collectors' numbers go in `data/contacts.json`.

## Licensing

Changing code does not change its license, so the catalog only takes sources you are free to use commercially:

- **MIT, Apache-2.0, BSD** — use, change and sell; keep the upstream `LICENSE` file (and `NOTICE` for Apache).
  `site_template` leaves it in place and records the source in `TEMPLATE-NOTICE.md`.
- **MPL-2.0** (Mifos X) — files you change stay MPL (share those files' source when you distribute them); your own
  new files can use any license.
- **Not catalogued:** repositories without a license (no permission to use them at all — most "clone" projects),
  GPL/AGPL projects (distributed changes must be open-sourced), and unofficial WhatsApp libraries (against WhatsApp's
  terms; numbers get banned).

A unit test (`agent/test/unit.test.mjs`) fails if a catalog entry is unpinned, has a non-permissive license or a missing patch.

## Adding a pack

1. Find a maintained upstream with an MIT/Apache/BSD license (check the `LICENSE` file, not just the badge).
2. Pin it: a full commit (`git ls-remote <repo> HEAD`) or a versioned generator (`npx create-x@1.2.3 …`).
3. Make your changes in a clone, then `git add -N . && git diff --binary > agent/templates/packs/<id>.patch`
   (exclude lock files; list deleted files under `remove` instead).
4. Add the entry to `catalog.json`: `source`, `patch`, `remove`, `env`, `replace` (brand settings), `defaults`,
   `install`, `dev`, `port`, `provides`, `after_create`.
5. Create it with `site_template` into a scratch folder, install, run it and check every page with `page_check`
   (static sites) or a browser before marking it `adapted`.
