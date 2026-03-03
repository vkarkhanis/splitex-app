# Traxettle Doctor Tool

A guided UI workflow that walks you through setting up Traxettle environments (Local → Staging → Production) for Mobile and Web platforms.

---

## What you’ll see

- **Platform tabs**: Switch between Mobile and Web workflows.
- **Environment rail**: Shows Local, Staging, Production with status badges and actions to reset or skip an environment.
- **Step list**: Action and verification steps for the selected environment. Click a step to expand it.
- **Step details**:
  - Clear instructions (“Do this”).
  - Copy‑paste commands with a single click.
  - Expected outcomes (“Expected”).
  - Buttons to mark a step **Done** or **Verified** (or skip if allowed).
- **Progress persistence**: Your progress is saved in the browser (localStorage) and restored when you reload.

---

## Quick start (layman-friendly)

### 1) Install dependencies (run this from the repo root)

```bash
rush install
```

### 2) Start the Doctor Tool UI

```bash
cd tools/doctor-tool
npm run dev
```

Next.js will print a URL like **http://localhost:3000**. Open it in your browser.

### 3) Use the workflow

1. Choose **Mobile** or **Web** at the top.
2. Follow the **Local → Staging → Production** flow using the environment rail.
3. For each step:
   - Read the instructions.
   - Copy the command and run it in your terminal.
   - Click **Done** (or **Verified**) when you’re satisfied.
   - Skip steps/environments if they don’t apply to you.

---

## Important notes

- **No automatic execution**: The tool only shows commands and tracks your confirmation. It never runs shell commands for you.
- **Commands are copy‑ready**: Click the **Copy** button next to any command to copy it to your clipboard.
- **Progress is local**: Progress is saved in your browser’s localStorage. Clearing the browser will reset the workflow.

---

## Adding or editing steps

Edit the workflow definition files:

- `src/workflows/mobileSteps.ts` — Mobile-specific steps.
- `src/workflows/webSteps.ts` — Web-specific steps.

Each step includes:
- `title`, `kind` (`action` | `verify`), `environment`, `whyThisMatters`.
- `instructions` array.
- Optional `scripts` with `label` and `command`.
- Optional `expected` outcomes.
- `skippable` flag.

---

## Development notes

- Built with **Next.js 16**, **React 19**, **TypeScript**, and **styled-components** for UI.
- Icons from **lucide-react**.
- Dark theme UI with smooth hover states and transitions.
- Rush monorepo: registered as `@traxettle/doctor-tool` in `rush.json`.
