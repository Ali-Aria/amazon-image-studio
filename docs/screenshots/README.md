# iOS restyle screenshot matrix

All captures use the same upstream project and content. `before-*` files are from commit `dc142f0`; `after-*` files are from the `codex/ios-restyle` branch.

| View | Before | After |
| --- | --- | --- |
| Dark desktop, 1440×900 | `before-dark-desktop.png` | `after-dark-desktop.png` |
| Dark settings | `before-dark-settings-modal.png` | `after-dark-settings-sheet.png` |
| Dark mobile, 390×844 | `before-dark-mobile.png` | `after-dark-mobile.png` |
| Light desktop, 1440×900 | `before-light-desktop.png` | `after-light-desktop.png` |
| Light settings | `before-light-settings-modal.png` | `after-light-settings-sheet.png` |
| Light mobile, 390×844 | `before-light-mobile.png` | `after-light-mobile.png` |

Additional after-state evidence:

- `after-dark-generated-task-card.png`: completed image-generation task using the repository mock API.
- `after-dark-detail-sheet.png`: detail sheet opened from that generated task.

Concept references generated before implementation are stored in `../design/` and are not presented as product screenshots.

## V2 component-layer comparison

The `v2-before-*` captures are the accepted first-pass UI immediately before the component-layer improvement. The `v2-after-*` captures show the second pass on the same branch and application.

| View | V2 before | V2 after |
| --- | --- | --- |
| Dark desktop, 1440 x 900 | `v2-before-dark-desktop.png` | `v2-after-dark-desktop.png` |
| Dark Settings sheet | `v2-before-dark-settings-sheet.png` | `v2-after-dark-settings-sheet.png` |
| Dark mobile, 390 x 844 | `v2-before-dark-mobile.png` | `v2-after-dark-mobile.png` |
| Dark mobile Settings | - | `v2-after-dark-mobile-settings-sheet.png` |
| Light desktop, 1440 x 900 | `v2-before-light-desktop.png` | `v2-after-light-desktop.png` |
| Light Settings sheet | `v2-before-light-settings-sheet.png` | `v2-after-light-settings-sheet.png` |
| Light mobile, 390 x 844 | `v2-before-light-mobile.png` | `v2-after-light-mobile.png` |
| Light mobile Settings | - | `v2-after-light-mobile-settings-sheet.png` |

`v2-after-dark-menu-toast.png` records the shared floating-material computation used by menus and toast (`blur(24px)` and `blur(32px)` respectively).
