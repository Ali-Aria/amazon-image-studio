# Amazon Image Studio — Apple / iOS visual redesign

## Scope and design source

This branch changes only presentation and interaction polish. The Zustand store, API adapters, Amazon marketplace planning rules, prompts, persisted data shape, generation flow, and event/data flow are unchanged.

The visual system follows the project brief and the upstream [Apple UI Designer skill](https://raw.githubusercontent.com/heyman333/atelier-ui/main/skills/apple-ui-designer/SKILL.md) plus its [README](https://raw.githubusercontent.com/heyman333/atelier-ui/main/skills/apple-ui-designer/README.md). It treats the product as a desktop workbench: dense multi-panel composition remains at desktop widths; only screens at 640 px and below collapse into a single-column iOS list rhythm.

## Screen-by-screen design notes

### Global shell and header

- **Intent:** make the workbench feel like a first-party Apple web utility without disguising it as a phone app.
- **Layout:** the fixed desktop header remains compact and horizontal; its translucent material separates navigation from content without a hard rule.
- **Typography:** SF Pro is requested through the native Apple system stack, with PingFang SC and Microsoft YaHei fallbacks for Chinese.
- **Motion:** controls use a 160 ms press response and a restrained 0.97 active scale; no spring or bounce is used.
- **iOS rationale:** system typography, semantic blue, circular utility buttons, continuous radii, and material depth match Apple platform conventions while preserving desktop density.

### Amazon planner panel

- **Intent:** keep marketplace planning the primary structured task while reducing the visual noise of nested outlines.
- **Layout:** the existing Listing / A+ mode, marketplace selector, planning controls, and output hierarchy remain in their original order and width.
- **Typography:** section titles use semibold system text; supporting copy uses secondary system gray instead of additional font weights.
- **Motion:** existing state changes remain immediate; hover and focus transitions are short fades only.
- **iOS rationale:** grouped surfaces and separator rhythm replace heavy boxes, similar to grouped Settings content on Apple platforms.

### Composer / InputBar

- **Intent:** present generation as a calm, persistent command surface.
- **Layout:** desktop parameters and actions remain fully available; on narrow screens the composer starts collapsed and expands on demand, preventing it from covering the task history.
- **Typography:** the editable prompt uses the same system text metrics as other inputs; labels use compact secondary text.
- **Motion:** expansion and control feedback use the shared ease-out curve and respect reduced-motion preferences.
- **iOS rationale:** a raised material with 20 px radius, tinted secondary controls, and a single filled primary action establishes a clear action hierarchy.

### Search, filters, history, and task cards

- **Intent:** make browsing generated work feel like a native content collection rather than a form grid.
- **Layout:** all filters, history actions, selection behavior, card metadata, and context actions stay in place. Mobile history becomes a bottom material sheet.
- **Typography:** search and metadata use compact system text with muted labels; prompt content remains readable and selectable.
- **Motion:** menus fade/scale subtly; cards preserve their existing selection and swipe behavior.
- **iOS rationale:** recessed search fields, floating material menus, thin separators, and soft card elevation mirror iOS search and collection patterns.

### Settings

- **Intent:** turn the largest modal into a desktop Settings sheet with clear navigation and quiet hierarchy.
- **Layout:** all tabs and controls are unchanged; the sheet expands to a maximum 1024 px desktop width and becomes edge-to-edge at mobile width.
- **Typography:** section headings, labels, helper copy, and values map to primary, secondary, and tertiary system roles.
- **Motion:** entry is a 24 px rise with a tiny scale correction; the blurred backdrop fades independently.
- **iOS rationale:** a 26 px continuous corner, visible grabber, glass material, and wide two-pane settings organization are native-feeling without losing desktop efficiency.

### Help, size, confirmation, support, style reference, and detail sheets

- **Intent:** give every modal family one predictable presentation and dismissal model.
- **Layout:** each modal retains its original content and actions inside the shared `Sheet` shell; detail and nested raw-response views use the same surface tokens.
- **Typography:** titles and action labels use the existing semantic hierarchy on the system font stack.
- **Motion:** the shared sheet uses a calm fade/rise; backdrop click and close controls retain their previous behavior, while shared sheets additionally support a downward grabber gesture.
- **iOS rationale:** one material, one radius, one grabber, and one animation language remove modal-to-modal inconsistency.

### Lightbox and mask editor

- **Intent:** keep image inspection and editing visually focused.
- **Layout:** tools and canvas behavior are unchanged; chrome becomes glassy and images receive a softer continuous radius.
- **Typography:** editing labels stay compact to preserve canvas space.
- **Motion:** overlays fade in and avoid elastic zoom.
- **iOS rationale:** stronger backdrop blur and quiet tool materials emphasize the asset instead of the container.

### Narrow layout (≤ 640 px)

- **Intent:** provide an efficient single-column work rhythm, not a simulated phone frame.
- **Layout:** panels stack, sheets dock to the bottom, controls retain touch-safe sizing, and the collapsed composer leaves history visible.
- **Typography:** no artificial mobile font family or oversized title treatment is introduced.
- **Motion:** the same reduced motion and shared sheet rules apply.
- **iOS rationale:** bottom sheets, safe-area padding, 44 px interactive targets, and grouped lists are appropriate mobile-web translations of iOS patterns.

## Component system

| Component | Presentation | Interaction |
| --- | --- | --- |
| `Button` | `filled`, `tinted`, `plain`, `danger`; 36/44 px sizes | subtle press scale, focus ring, disabled opacity |
| `Sheet` | glass backdrop, 26 px panel radius, grabber, layered shadow | backdrop close, close action, downward drag dismiss |
| `Select` | system surface trigger and glass menu | existing value/change behavior preserved |
| `Checkbox` | 20 px rounded system check control | existing controlled state preserved |
| `SearchBar` | recessed system-gray search field | existing filtering and clear behavior preserved |
| `InputBar` | raised command material | existing prompt, upload, parameters, and generate flow preserved |
| `Header` | translucent navigation material | existing workspace, install, help, and settings actions preserved |
| Menus / toast | compact floating material | existing action handlers and timing preserved |

## Design token comparison

| Role | Before | After — light | After — dark |
| --- | --- | --- | --- |
| Font | generic Tailwind sans | `-apple-system`, BlinkMacSystemFont, SF Pro, PingFang fallbacks | same system stack |
| Canvas | slate/white page mix | system grouped gray, `240 20% 97%` | near-black system canvas, `240 5% 4%` |
| Primary text | slate scale | system label, `240 6% 10%` | system label, `240 5% 96%` |
| Secondary text | scattered gray classes | semantic muted label, `240 2% 43%` | semantic muted label, `240 5% 62%` |
| Accent | broad blue usage | iOS blue `211 100% 50%`, used selectively | iOS blue `211 100% 52%` |
| Surface | mostly opaque white/dark blocks | white / 78% glass material | charcoal / 78% glass material |
| Separator | visible slate borders | white/gray separator at 34% role opacity | white separator at 11% opacity |
| Radius | mixed `rounded-lg/xl` | 10 / 14 / 20 px; sheets 26 px | identical geometry |
| Elevation | scattered Tailwind shadows | two semantic soft-shadow levels | two deeper low-luminance shadow levels |
| Motion | mixed component transitions | 160/260 ms, `cubic-bezier(0.22, 1, 0.36, 1)` | same; disabled under reduced motion |

## Fidelity ledger

| Reference principle | Implementation check | Adjustment made |
| --- | --- | --- |
| Apple system typography | Computed font stack begins with `-apple-system` | removed non-system font assumptions and normalized form controls |
| Restrained semantic blue | primary action is blue; secondary actions are tinted or plain | replaced competing filled treatments in shared header/dialog actions |
| Material, not harsh borders | panels use translucent surfaces plus semantic separators | introduced `ios-surface`, `ios-menu`, and glass sheet tokens |
| Calm sheet presentation | settings and modal family share radius, backdrop, grabber, and rise | removed spring-like motion and added drag dismissal to shared sheets |
| Desktop workbench density | planner, history, and composer remain multi-panel at 1440 px | mobile-only collapse is scoped to 640 px and below |
| Light/dark parity | every semantic token has a media-query dark counterpart | fixed unsupported opacity utilities discovered during visual QA |
| Accessible motion | reduced-motion media query shortens animations and transitions | retained content/state changes while suppressing decorative motion |

No above-the-fold product copy or information hierarchy was intentionally changed.

## Changed files

### Design system and shared components

- `src/index.css`
- `tailwind.config.js`
- `src/components/Button.tsx`
- `src/components/Sheet.tsx`
- `src/components/Checkbox.tsx`
- `src/components/Select.tsx`
- `src/components/SearchBar.tsx`

### Screen and modal presentation

- `src/components/Header.tsx`
- `src/components/AmazonPlanner.tsx`
- `src/components/InputBar.tsx`
- `src/components/TaskCard.tsx`
- `src/components/HistoryModal.tsx`
- `src/components/ImageContextMenu.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/DetailModal.tsx`
- `src/components/HelpModal.tsx`
- `src/components/SizePickerModal.tsx`
- `src/components/ConfirmDialog.tsx`
- `src/components/SupportPromptModal.tsx`
- `src/components/StyleReferenceEditorModal.tsx`
- `src/components/Lightbox.tsx`
- `src/components/MaskEditorModal.tsx`

### Design and QA evidence

- `docs/design/*.png`
- `docs/screenshots/*.png`
- `docs/screenshots/README.md`
- `docs/ios-restyle-delivery.md`

## Verification and acceptance checklist

- [x] `npm install` completes and the Vite development server responds with HTTP 200.
- [x] `npm test` passes the full existing suite.
- [x] `npm run build` completes.
- [x] Original store, API adapters, prompts, planning logic, persistence schema, and data flow are unchanged.
- [x] Listing / A+ mode and marketplace switching were exercised in the browser.
- [x] Settings tabs, help, size picker, detail view, search, and close behavior were exercised.
- [x] Image generation was exercised end-to-end with the repository's deterministic mock API; the generated task card and detail sheet rendered without console errors.
- [x] Shared sheet downward drag and backdrop dismissal were exercised at a 390×844 viewport.
- [x] Light and dark appearances were checked at 1440×900 and 390×844.
- [x] Narrow layout is single-column, has no horizontal overflow, and keeps the history area visible above the composer.
- [x] `prefers-reduced-motion` is respected.
- [x] Before/after light and dark desktop, settings, and mobile screenshots are included.
- [x] No API key is embedded in source or documentation.

The real third-party image providers were not called because no user key was supplied or required by the brief. The repository mock verifies request submission, streamed completion, persisted task rendering, and detail inspection without changing production provider code.

