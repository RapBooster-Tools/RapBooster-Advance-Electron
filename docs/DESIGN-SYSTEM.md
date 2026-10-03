# RapBooster Design System

How the renderer looks and behaves, and the rules for building a screen that fits. The
customer's brief (2026-10-03): _a futuristic, user-friendly interface_ — answered as a modern
design system with light **and** dark themes that follow Windows/macOS by default, soft depth,
subtle motion, rounded cards, and a WhatsApp-style phone preview of every message.

Our users are non-technical small-business owners. **Clarity beats density.** Every control
must be obvious, every screen must say what it is for, and nothing should look like a
developer tool.

| Where                                              | What                                                |
| -------------------------------------------------- | --------------------------------------------------- |
| `renderer/app/globals.css`                         | All tokens (light + dark), base styles, keyframes   |
| `renderer/components/providers/ui-preferences.ts`  | Theme/sidebar state, the pre-paint bootstrap script |
| `renderer/components/providers/theme-provider.tsx` | `useTheme()`                                        |
| `renderer/components/layout/*`                     | App shell, sidebar groups, PageHeader, ThemeToggle  |
| `renderer/components/ui/*`                         | Primitives (below)                                  |
| `renderer/components/preview/*`                    | `PhonePreview`, `renderWhatsAppFormatting`          |
| `tests/e2e/design-system.spec.ts`                  | E7.1–E7.10                                          |

**Adoption (2026-10-03).** Every screen follows the theme through tokens, but most pages are
not yet rebuilt on these primitives (T-1439), and the phone preview is mounted only in
Settings › Appearance so far, not in the template, campaign and sequence composers (T-1440).
Decision: D145.

---

## 1. Principles

1. **One obvious next step.** A screen or dialog has at most one `primary` button. Empty
   states end in one clear action.
2. **Say it in plain words.** Every screen has a `PageHeader` description; every non-obvious
   setting has a hint (`Field hint`) or an `InfoTip`. No jargon, no codes, no raw errors
   (`error.userMessage` only).
3. **Tokens, never raw colours.** If you type `#`, `rgb(`, `white` or `black` in a class, the
   screen will break in one of the two themes.
4. **Soft depth, subtle motion.** Cards are rounded and lightly raised; things fade and lift
   in over 150–200 ms. Nothing bounces, nothing loops (except loading shimmer). Everything
   respects `prefers-reduced-motion`.
5. **Accessible by default.** Real labels, visible keyboard focus, keyboard-operable
   controls, AA contrast in both themes. The primitives do this for you — use them.

## 2. Theming

There are two themes, chosen by the user in the title bar (Light / Dark / System) or in
**Settings › Appearance**. _System_ is the default and follows Windows/macOS live.

How it works:

- `<html>` carries `data-theme="light|dark"` (what is on screen), `data-theme-preference`
  (`light|dark|system`, what the user chose) and `data-sidebar="expanded|collapsed"`.
- Every colour is a CSS variable declared in `@theme` (light values) and redefined under
  `[data-theme='dark']`. Tailwind utilities compile to `var(--color-…)`, so **a screen that
  uses tokens is dark-mode-ready with zero extra classes.**
- An inline script in `<head>` (`UI_BOOTSTRAP_SCRIPT`) reads the saved choice from
  `localStorage` and sets the attributes **before first paint** — no flash of the wrong
  theme. The CSP admits it by hash (`scripts/copy-renderer.mjs` pins every inline script),
  and E7.3 asserts that.
- `ThemeProvider` exposes `useTheme()` → `{ preference, resolved, setPreference,
sidebarCollapsed, setSidebarCollapsed }` and follows the OS change while on _System_.
- The window frame follows too: `ThemeProvider` calls `system:setThemeSource`, which sets
  Electron's `nativeTheme.themeSource` (so the OS title bar matches a forced Light or Dark)
  and the window's background colour (so a launch never flashes light in dark mode). E7.2
  asserts it.
- Preferences live in `localStorage` on purpose: they are per-machine cosmetics, and only
  a synchronous read can beat the first paint. Losing them costs nothing but the default.

Escape hatches, for the rare case a token is not enough:

- `dark:` variant — `dark:opacity-80`. Prefer a new token over this.
- `collapsed:` variant — styles off the collapsed sidebar (`collapsed:sr-only`).
- A subtree can pin a theme with `data-theme="light"` / `"dark"` (the phone preview's
  `theme` prop does this).

## 3. Tokens

All names below are a **contract**: add new tokens freely, never rename or remove one.

### Colour

| Token (class suffix)                                            | Use                                               | Light     | Dark      |
| --------------------------------------------------------------- | ------------------------------------------------- | --------- | --------- |
| `app-bg`                                                        | Window background behind content                  | `#f3f5f7` | `#0b141a` |
| `surface`                                                       | Cards, panels, header, inputs                     | `#ffffff` | `#111b21` |
| `surface-muted`                                                 | Sub-panels inside a card, dialog footer, disabled | `#f7f9fa` | `#0e181e` |
| `surface-raised`                                                | Dialogs, popovers, selected segment               | `#ffffff` | `#1a252c` |
| `sidebar`                                                       | Sidebar                                           | `#f8fafb` | `#0e171d` |
| `line` / `line-strong`                                          | Borders, dividers / hover borders                 | `#e2e7eb` | `#24323b` |
| `overlay`                                                       | Modal backdrop                                    | 45% ink   | 60% black |
| `ink`                                                           | Primary text                                      | `#111b21` | `#e9edef` |
| `ink-muted`                                                     | Secondary text, descriptions                      | `#4f5e68` | `#aebac1` |
| `ink-subtle`                                                    | Hints, placeholders, meta (still AA)              | `#5f6e78` | `#8696a0` |
| `primary` / `primary-hover`                                     | Main actions, links, active nav, focus            | `#007561` | `#00a884` |
| `on-primary`                                                    | Text/icons **on** `bg-primary`                    | white     | `#0b141a` |
| `danger` / `danger-hover`                                       | Destructive actions, errors                       | `#c42b1c` | `#f15c6d` |
| `on-danger`                                                     | Text **on** `bg-danger`                           | white     | `#0b141a` |
| `success`, `info`                                               | Positive / informational text                     | —         | —         |
| `status-{ok,warn,idle,info}-{bg,fg}`                            | Status pills and banners                          | —         | —         |
| `focus`                                                         | Keyboard focus ring                               | `#007561` | `#2fd3a8` |
| `wa-in` / `wa-out`                                              | Inbox bubbles; `wa-in` is also the hover tint     | —         | —         |
| `wa-*` (chat, header, bubble-in/out, text, meta, link, tick, …) | Phone preview only, WhatsApp's own palettes       | —         | —         |

> **Never** put `text-white` on `bg-primary` or `bg-danger` — dark mode uses a bright primary
> that needs dark text. Use `text-on-primary` / `text-on-danger`.

Contrast (WCAG AA, 4.5:1 for text) was checked for every text/background pair in the table,
in both themes — e.g. `ink-subtle` on `app-bg` is 4.8:1 light / 6.1:1 dark, `primary` on
`surface` 5.7:1 light / 5.8:1 dark, `on-primary` on `primary` 5.7:1 / 6.1:1.

### Shape, depth, motion

| Token                     | Value / class                                 |
| ------------------------- | --------------------------------------------- |
| `rounded-control`         | 8 px — buttons, inputs, nav items             |
| `rounded-card`            | 14 px — cards, panels, toasts                 |
| `rounded-dialog`          | 18 px — dialogs                               |
| `rounded-bubble`          | 12 px — chat bubbles                          |
| `shadow-card`             | Resting cards and buttons                     |
| `shadow-raised`           | Hover lift, tooltips, toasts                  |
| `shadow-overlay`          | Dialogs, the phone preview                    |
| `var(--gradient-accent)`  | Brand gradient (logo tile, empty-state badge) |
| `var(--gradient-glow)`    | Faint corner glow behind PageHeader           |
| `animate-fade-in/out`     | 160/140 ms opacity                            |
| `animate-scale-in/out`    | Dialog panel enter/exit                       |
| `animate-slide-up`        | Toasts                                        |
| `animate-shimmer`         | Skeletons, indeterminate progress             |
| `ease-[var(--ease-soft)]` | The house easing curve                        |

Shadows point at `--elevation-1/2/3`, which the dark theme redefines (Tailwind would
otherwise inline a light-mode shadow at build time).

## 4. Components

Import from `@renderer/components/ui/<name>`. Every one forwards `data-testid` (as a prop or
`testId`) so specs can find it.

| Component                     | Use it for                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                      | `variant` primary/secondary/ghost/danger · `size` sm/md/lg/icon · `loading` (spinner + disabled)                                                                  |
| `Dialog`                      | Modal with title, optional `description`, scrolling body, sticky `footer`; enter/exit animation, focus trap, Escape (top-most only), focus returns to the trigger |
| `Card`, `CardHeader`          | The basic raised surface; header with icon, title, description, actions                                                                                           |
| `SectionHeader`               | A heading for a section inside a screen (`as="h3"` inside a card)                                                                                                 |
| `Field`                       | Label + control + hint + error, ids wired: `<Field label hint error>{(p) => <Input {...p} />}</Field>`                                                            |
| `Input`, `Textarea`, `Select` | Text controls; `invalid` for the error border; `controlClass` for custom controls                                                                                 |
| `Switch`                      | A setting that applies immediately (`role="switch"`)                                                                                                              |
| `Checkbox`                    | A choice applied on Save; whole row is clickable                                                                                                                  |
| `Tabs`, `TabPanel`            | Switching views on one screen; arrow keys, Home/End                                                                                                               |
| `Badge`                       | A type, tag or count                                                                                                                                              |
| `StatusPill`                  | A **state** (Connected, Running, Failed): ok/warn/idle/danger/info, with a dot                                                                                    |
| `Tooltip`, `InfoTip`          | Short help on hover **and** focus; Escape dismisses. `InfoTip` is the "?" next to a setting                                                                       |
| `Skeleton`                    | Loading placeholders shaped like the content                                                                                                                      |
| `ProgressBar`                 | Determinate (`value`/`max`) or indeterminate; always give a `label`                                                                                               |
| `Kbd`                         | Keyboard shortcut hints                                                                                                                                           |
| `EmptyState`                  | Icon badge, title, one sentence, one action (+ optional `secondaryAction`)                                                                                        |

Layout:

| Component     | Notes                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShell`    | Title bar (product name, theme toggle, `headerHelp` slot, filled by the help system's "?" button) over the grouped, collapsible sidebar. Skip-to-content link. |
| `PageHeader`  | `title` (h1, `data-testid="page-title"`), `description`, `actions`, `helpSlot`                                                                                 |
| `ThemeToggle` | `variant="compact"` (title bar) or `"cards"` (Settings); test ids `<prefix>-light`, `<prefix>-dark`, `<prefix>-system`                                         |
| `nav.ts`      | `NAV_GROUPS` (Overview · Messaging · Audience · Automation · Setup) and `ALL_NAV`                                                                              |

### Phone preview

`PhonePreview` draws messages the way the **recipient** sees them in WhatsApp (left-aligned,
the business's name in the chat header), in WhatsApp's own light or dark palette.

```tsx
import { PhonePreview } from '@renderer/components/preview/phone-preview'

;<PhonePreview
  senderName="Sharma Stores"
  messages={[
    { kind: 'text', text: 'Hi *Priya*, _20% off_ today!' },
    { kind: 'buttons', text: 'Remind you?', buttons: [{ type: 'reply', label: 'Yes' }] },
  ]}
/>
```

Kinds: `text`, `image`, `video`, `document`, `buttons`, `list`, `voice`, `sticker`,
`location`, `contact`, `poll`, `event`, `product` (see `preview/types.ts`; rich kinds reuse
the payload types from `shared/rich-message.ts`). Props: `perspective` (`recipient` |
`sender`), `theme` (pin light/dark), `frame={false}` for a compact chat panel, `testId`
(default `phone-preview`; each bubble is `preview-bubble` with `data-kind`).

Resolve merge tags and spintax **before** passing text in, so the preview shows what one real
recipient gets. Media `src` is only drawn for `data:`/`blob:` URLs (the renderer cannot read
disk, and the CSP blocks remote images); otherwise a placeholder of the right shape is shown.

`renderWhatsAppFormatting(text)` turns `*bold*`, `_italic_`, `~strike~`, `` `code` ``,
triple-backtick monospace blocks and `> quote` lines into React nodes — never HTML — so user text can never inject
markup. Markers follow WhatsApp's rules (`2*3*4` and `snake_case` stay literal).

## 5. Do and don't

| Do                                                                 | Don't                                    |
| ------------------------------------------------------------------ | ---------------------------------------- |
| `bg-surface text-ink border-line`                                  | `bg-white text-gray-800 border-gray-200` |
| `bg-primary text-on-primary`                                       | `bg-primary text-white`                  |
| `bg-ink/5`, `border-ink/10` for a neutral tint                     | `bg-black/5` (invisible on dark)         |
| SVG: `className="fill-ink-subtle stroke-line"`                     | `fill="#999"`                            |
| One `primary` button per view                                      | Three green buttons competing            |
| `<Field label hint>` around every control                          | A placeholder as the only label          |
| `Switch` for instant settings, `Checkbox` for Save-applied choices | A checkbox that silently saves on click  |
| `StatusPill` with a word                                           | Colour as the only signal                |
| `toast('error', result.error.userMessage)`                         | Showing `error.detail` or a stack        |
| Loading: `Skeleton` or `Button loading`                            | A blank panel or a frozen button         |
| Keep every existing `data-testid` when restyling                   | Renaming a test id "to be consistent"    |

Exceptions are deliberate and commented: the QR code stays on white (scanners need it), the
analytics chart's categorical series colours are validated mid-tones that read on both
themes, and status-post background colours are user content.

## 6. Accessibility rules

- **Labels:** every input has a `<label>` (use `Field`). Icon-only buttons need
  `aria-label`. Decorative icons get `aria-hidden`.
- **Focus:** never remove the focus outline without replacing it. The base layer draws a
  2 px `focus` outline on `:focus-visible` and a soft ring on text fields.
- **Keyboard:** everything reachable with Tab; radio groups and tabs use arrow keys; dialogs
  trap focus and close on Escape; tooltips open on focus and close on Escape.
- **Contrast:** AA in both themes. Check new token pairs before adding them.
- **Motion:** use the `animate-*` tokens; they are disabled under `prefers-reduced-motion`.
- **Status:** never colour alone — pills carry words, errors carry text with `role="alert"`.

## 7. Adding a screen

1. Add the route under `renderer/app/(app)/<segment>/page.tsx` (client component).
2. Add it to the right group in `renderer/components/layout/nav.ts` with a lucide icon and a
   `nav-<segment>` test id. Keep groups short (≤ 5 items).
3. Start the page with `<PageHeader title description actions />` — the title is what the
   E2E suite asserts, the description is one plain sentence about what the screen is for.
4. Lay content out in `Card`s on `p-6` with `gap-4`. Use `SectionHeader` inside long screens.
5. Build controls from `ui/*`; wire data with `useIpcQuery` / `useIpcEvent`; mutations show
   `error.userMessage` via `useToast()`.
6. Give it a real `EmptyState` with one action, and `Skeleton`s while loading.
7. Check it in **both** themes (title-bar toggle) and with the sidebar collapsed, then add
   the route to E7.8 in `tests/e2e/design-system.spec.ts`, which asserts every screen renders
   in dark mode with no console errors.
