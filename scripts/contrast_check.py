#!/usr/bin/env python3
"""Contrast gate for src/tokens.css.

Reads the OKLCH values out of the stylesheet, converts them to sRGB and
computes WCAG 2.1 contrast ratios for the pairs documented in
docs/contrast-report.md. Exits non-zero if a text pair is below 4.5:1 or a
non-text boundary pair is below 3:1.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# OKLab <-> linear sRGB matrices (Björk et al.).
M1 = [
    [0.8189330101, 0.3618667424, -0.2986111606],
    [0.0329845436, 0.9293118715, 0.0361456387],
    [0.0482003018, 0.2643662691, 0.6338517070],
]
M2 = [
    [4.0767416621, -3.3077115913, 0.2309699292],
    [-1.2684380046, 2.6097574011, -0.3413193965],
    [-0.0041960863, -0.7034186147, 1.7076147010],
]

OKLCH_RE = re.compile(
    r"(--[\w-]+)\s*:\s*oklch\(\s*"
    r"([\d.]+)\s+([\d.]+)\s+([\d.]+)"
    r"(?:\s*/\s*([\d.]+))?\s*\)"
)


def oklch_to_linear_rgb(lightness: float, chroma: float, hue: float) -> tuple[float, float, float]:
    h = hue * 3.141592653589793 / 180.0
    a = chroma * __import__("math").cos(h)
    b = chroma * __import__("math").sin(h)

    l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
    m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
    s_ = lightness - 0.0894841775 * a - 1.2914855480 * b

    l, m, s = l_**3, m_**3, s_**3

    r = M2[0][0] * l + M2[0][1] * m + M2[0][2] * s
    g = M2[1][0] * l + M2[1][1] * m + M2[1][2] * s
    b = M2[2][0] * l + M2[2][1] * m + M2[2][2] * s

    return (
        min(1.0, max(0.0, r)),
        min(1.0, max(0.0, g)),
        min(1.0, max(0.0, b)),
    )


def relative_luminance(rgb: tuple[float, float, float]) -> float:
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def contrast(rgb_a: tuple[float, float, float], rgb_b: tuple[float, float, float]) -> float:
    la = relative_luminance(rgb_a)
    lb = relative_luminance(rgb_b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def parse_tokens(path: Path) -> tuple[dict[str, tuple[float, float, float]], dict[str, tuple[float, float, float]]]:
    text = path.read_text(encoding="utf-8")

    light_start = text.index(":root {")
    light_end = text.index("[data-theme='dark']")
    light_block = text[light_start:light_end]

    dark_start = light_end
    dark_end = text.index("@media (prefers-color-scheme: dark)")
    dark_block = text[dark_start:dark_end]

    def extract(block: str) -> dict[str, tuple[float, float, float]]:
        tokens: dict[str, tuple[float, float, float]] = {}
        for name, lightness, chroma, hue, _alpha in OKLCH_RE.findall(block):
            tokens[name] = (float(lightness), float(chroma), float(hue))
        return tokens

    return extract(light_block), extract(dark_block)


TEXT_PAIRS = [
    ("--fg-primary", "--bg-base"),
    ("--fg-secondary", "--bg-base"),
    ("--fg-tertiary", "--bg-base"),
    ("--fg-muted", "--bg-base"),
    ("--accent", "--bg-base"),
    ("--accent", "--bg-elevated"),
    ("--accent-strong", "--bg-base"),
    ("--fg-danger", "--bg-base"),
    ("--fg-warning", "--bg-base"),
    ("--info", "--bg-base"),
    ("--diff-add-fg", "--bg-base"),
    ("--diff-remove-fg", "--bg-base"),
    ("--diff-change-fg", "--bg-base"),
]

BOUNDARY_PAIRS = [
    ("--border-strong", "--bg-base"),
]


def main() -> int:
    path = Path(__file__).resolve().parent.parent / "src" / "tokens.css"
    if not path.exists():
        print(f"missing {path}", file=sys.stderr)
        return 2

    light, dark = parse_tokens(path)

    failures: list[str] = []

    for theme_name, tokens in (("light", light), ("dark", dark)):
        missing = [t for t in {p[0] for p in TEXT_PAIRS + BOUNDARY_PAIRS} | {p[1] for p in TEXT_PAIRS + BOUNDARY_PAIRS} if t not in tokens]
        if missing:
            print(f"[{theme_name}] missing tokens: {', '.join(sorted(missing))}", file=sys.stderr)
            return 2

        print(f"=== {theme_name} ===")
        for fg, bg in TEXT_PAIRS:
            ratio = contrast(
                oklch_to_linear_rgb(*tokens[fg]),
                oklch_to_linear_rgb(*tokens[bg]),
            )
            verdict = "AA" if ratio >= 4.5 else "FAIL"
            if ratio < 4.5:
                failures.append(f"{theme_name} {fg} on {bg}: {ratio:.2f} < 4.5")
            print(f"  {fg:16s} on {bg:16s} {ratio:6.2f}  {verdict}")

        for fg, bg in BOUNDARY_PAIRS:
            ratio = contrast(
                oklch_to_linear_rgb(*tokens[fg]),
                oklch_to_linear_rgb(*tokens[bg]),
            )
            verdict = "AA" if ratio >= 3.0 else "FAIL"
            if ratio < 3.0:
                failures.append(f"{theme_name} {fg} on {bg}: {ratio:.2f} < 3.0 (non-text)")
            print(f"  {fg:16s} on {bg:16s} {ratio:6.2f}  {verdict} (non-text)")

    if failures:
        print("\nFAIL", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return 1

    print("\nPASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
