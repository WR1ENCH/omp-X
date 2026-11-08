# M3 spike: Tauri window.add_child for the isolated preview

Date: 2026-11-08

## Context

The M3 preview isolation work needs a webview that can be embedded inside a
Tauri window. Tauri window.add_child API is the candidate. This note records
the spike outcome and the decision.

## Finding

window.add_child is an unstable Tauri API. The sandbox cannot compile
omp-tauri because the glib-2.0 and WebKitGTK development files are missing,
so there is no runtime verification of add_child behavior here.

## Decision

Keep the WebviewWindow fallback currently implemented in usePreview.ts
(openPreviewWindow creates a standalone OS window). Do not adopt add_child
until it is stable and verifiable.

## Upgrade condition

Adopt window.add_child only after real-device verification on a CI Tauri
machine confirms the embedded webview behaves correctly.

## Human gate

Verifying that window.__TAURI__ === undefined inside the preview webview
(isolation proof) cannot be automated in this sandbox. A human must run that
check on a real device.
