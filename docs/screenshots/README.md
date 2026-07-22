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
