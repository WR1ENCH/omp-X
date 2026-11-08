# Contrast report

Measured token pairs for `src/tokens.css`, both themes. Regenerated after the
M2 token fixes; every pair now passes.

## Method

1. Each token is OKLCH. Convert to OKLab (`a = C·cos(H)`, `b = C·sin(H)`),
   then to linear sRGB via the Björk/OKLab M1→M2 matrices.
2. Relative luminance `L = 0.2126·R + 0.7152·G + 0.0722·B` on the linear
   channels (WCAG 2.1 definition).
3. Contrast ratio `(L₁ + 0.05) / (L₂ + 0.05)`, lighter over darker.

Thresholds used: **4.5:1** for normal-size text, **3:1** for large text and
for non-text UI boundaries (WCAG 1.4.11).

Reproduce with `scripts/contrast_check.py` (see the bottom of this file).

## Light theme (`:root`)

| Pair | Role | Ratio | Verdict |
| --- | --- | --- | --- |
| `--fg-primary` on `--bg-base` | body text | 18.10 | AA |
| `--fg-secondary` on `--bg-base` | secondary text | 9.21 | AA |
| `--fg-tertiary` on `--bg-base` | tertiary text | 6.54 | AA |
| `--fg-muted` on `--bg-base` | muted text | 4.85 | AA |
| `--accent` on `--bg-base` | links, accent text | 6.12 | AA |
| `--accent` on `--bg-elevated` | accent on panels | 5.86 | AA |
| `--accent-strong` on `--bg-base` | pressed / active accent | 9.52 | AA |
| `--fg-danger` on `--bg-base` | destructive text | 6.37 | AA |
| `--fg-warning` on `--bg-base` | warning text | 6.11 | AA |
| `--info` on `--bg-base` | info text | 5.59 | AA |
| `--diff-add-fg` on `--bg-base` | diff additions | 8.82 | AA |
| `--diff-remove-fg` on `--bg-base` | diff deletions | 9.68 | AA |
| `--diff-change-fg` on `--bg-base` | diff changes | 9.30 | AA |
| `--border-strong` on `--bg-base` | input / control boundary | 3.23 | AA (non-text) |

## Dark theme (`[data-theme='dark']`)

| Pair | Role | Ratio | Verdict |
| --- | --- | --- | --- |
| `--fg-primary` on `--bg-base` | body text | 18.07 | AA |
| `--fg-secondary` on `--bg-base` | secondary text | 7.83 | AA |
| `--fg-tertiary` on `--bg-base` | tertiary text | 5.74 | AA |
| `--fg-muted` on `--bg-base` | muted text | 4.88 | AA |
| `--accent` on `--bg-base` | links, accent text | 5.67 | AA |
| `--accent` on `--bg-elevated` | accent on panels | 5.61 | AA |
| `--accent-strong` on `--bg-base` | pressed / active accent | 5.20 | AA |
| `--fg-danger` on `--bg-base` | destructive text | 4.93 | AA |
| `--fg-warning` on `--bg-base` | warning text | 8.27 | AA |
| `--info` on `--bg-base` | info text | 8.16 | AA |
| `--diff-add-fg` on `--bg-base` | diff additions | 13.69 | AA |
| `--diff-remove-fg` on `--bg-base` | diff deletions | 12.36 | AA |
| `--diff-change-fg` on `--bg-base` | diff changes | 12.98 | AA |
| `--border-strong` on `--bg-base` | input / control boundary | 3.48 | AA (non-text) |

## Fixes applied

The M2 pass found three failing pairs and moved the dark accent ramp plus both
`--border-strong` values:

| Token | Theme | Before | After | Ratio after |
| --- | --- | --- | --- | --- |
| `--accent` | dark | `oklch(0.5 0.15 260)` (4.24) | `oklch(0.62 0.15 260)` | 5.67 |
| `--accent-hover` | dark | `oklch(0.45 0.15 260)` | `oklch(0.58 0.15 260)` | 4.81 |
| `--accent-strong` | dark | `oklch(0.4 0.18 260)` (2.73) | `oklch(0.6 0.17 260)` | 5.20 |
| `--border-strong` | light | `oklch(0.85 0 0)` (1.58) | `oklch(0.65 0 0)` | 3.23 |
| `--border-strong` | dark | `oklch(0.3 0 0)` (1.53) | `oklch(0.5 0 0)` | 3.48 |

The light theme's `--accent` and `--accent-strong` already passed and were left
unchanged; only the dark ramp moved.

## Reproduce

```sh
python3 scripts/contrast_check.py
```

The script reads `src/tokens.css`, extracts the OKLCH values for `:root` and
`[data-theme='dark']`, prints the same table, and exits non-zero when a text
pair is below 4.5:1 or a boundary pair is below 3:1.
