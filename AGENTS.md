# Repository Guidelines

## Project Overview
`omp-X` is a high-performance GUI for the `omp` agent system. It provides a multi-pane workspace for managing AI agent sessions, viewing transcripts, interacting with a terminal, and approving/editing code changes in real-time.

## Architecture & Data Flow
The project follows a **Client-Server** architecture bridged by **Tauri**.

- **Frontend (Client)**: A React/TypeScript SPA that handles the UI, layout state, and user interaction.
- **Backend (Server)**: A Rust-based system split into specialized crates for protocol handling, session hosting, and Tauri integration.

### Data Flow
1. **UI $\to$ Backend**: Frontend calls Rust functions via `invoke('command_name', args)`.
2. **Backend $\to$ UI**: Backend pushes updates using Tauri events or returns results from invoked commands.
3. **Host $\to$ Subprocess**: `omp-host` manages the lifecycle of agent subprocesses, handling "framing" (splitting data streams into structured blocks).
4. **State Persistence**: Layout and session preferences are persisted via `tauri-plugin-store`.

## Key Directories
- `src/`: Frontend source code.
    - `components/`: Reusable UI elements (Dock, Composer, Transcript).
    - `hooks/`: Business logic and state management (e.g., `useStore`, `useLayoutState`).
    - `types/`: TypeScript definitions for the application state and protocol.
    - `views/`: Top-level page layouts.
- `crates/`: Rust backend workspace.
    - `omp-tauri/`: Tauri commands, event handling, and app initialization.
    - `omp-host/`: Core session management and framing logic.
    - `omp-protocol/`: Shared types and protocol definitions used by both host and GUI.
    - `omp-gui/`: Rust entry point for the GUI wrapper.
- `scripts/`: E2E and utility scripts.

## Development Commands
### Frontend
- `npm run dev`: Start Vite development server.
- `npm run build`: Compile TypeScript and build the frontend.
- `npm run test`: Run unit tests via **Vitest**.
- `npm run lint`: Lint source code.

### Full Stack / Backend
- `npm run tauri dev`: Launch the full application in development mode.
- `cargo build`: Build all Rust crates in the workspace.
- `npm run e2e`: Run Playwright smoke tests (`scripts/e2e_smoke.ts`).

## Code Conventions & Common Patterns
### Frontend
- **Layout**: Uses a CSS Grid-based 4-column system managed by `useLayoutState`.
- **Styling**: Tailwind CSS with semantic tokens defined in `tokens.css`.
- **State Management**: 
    - Global layout state: `useLayoutState` hook.
    - Persistent storage: `useStore` (interacts with `tauri-plugin-store`).
    - Session-specific state: Managed via hooks passing `sessionId`.
- **Naming**: 
    - Components: PascalCase (e.g., `ThreadWorkspace.tsx`).
    - Hooks: `use` prefix (e.g., `useApproval.ts`).
    - Types: PascalCase (e.g., `LayoutState`).

### Backend (Rust)
- **Error Handling**: Uses `anyhow::Result` for high-level commands and `thiserror` for library-level errors.
- **Async**: Driven by `tokio` runtime.
- **Inter-crate communication**: `omp-tauri` $\to$ `omp-host` $\to$ `omp-protocol`.

## Important Files
- `src/views/Layout.tsx`: The root layout defining the 4-pane structure.
- `crates/omp-tauri/src/commands.rs`: Definition of the API surface available to the frontend.
- `crates/omp-host/src/session.rs`: Logic for agent session lifecycles.
- `package.json` & `Cargo.toml`: Dependency and build configurations.

## Runtime/Tooling Preferences
- **Frontend**: Bun/Node.js, Vite, React 18, TypeScript.
- **Backend**: Rust 1.90+, Tauri 2.0.
- **Package Manager**: `npm` (frontend), `cargo` (backend).

## Testing & QA
- **Unit Tests**: Vitest for frontend hooks (`src/hooks/*.test.ts`).
- **Backend Tests**: Standard Rust `#[test]` in `tests/` directories within crates.
- **E2E**: Playwright for critical paths (smoke tests).
- **Verification**: Behavioral changes SHOULD be verified by running the application and exercising the modified path.
