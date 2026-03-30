# Blueprint Annotation Canvas

Single-page full-stack application for blueprint measurement and annotation.

The app supports:
- image/PDF upload (multi-page PDF)
- backend PDF-to-image conversion with progress polling
- page-based navigation with thumbnails
- smooth pan/zoom canvas interaction
- line and area drawing tools
- per-page scale calibration (real-world units)
- annotation persistence with PostgreSQL + Prisma
- shape management (rename/delete)
- responsive 3-column UI (controls, canvas, annotations)

---

## Tech Stack

- **Framework**: Next.js (App Router) + React + TypeScript
- **Canvas**: `react-konva` + `konva`
- **State management**: Zustand (normalized annotation state)
- **DB**: PostgreSQL (Docker) + Prisma
- **Validation**: Zod
- **Styling/UI**: Tailwind + shadcn-style UI components

---

## Setup

### Prerequisites
- Node.js 20+
- npm or yarn
- Docker

### 1) Start PostgreSQL

```bash
docker compose up -d
```

### 2) Configure environment

Create `.env.local`:

```bash
DATABASE_URL="postgresql://blueprint_user:blueprint_pass@localhost:5432/blueprint?sslmode=disable"
```

### 3) Install and run (single command)

```bash
npm install && npm run dev
```

> Equivalent with yarn:
> `yarn install && yarn dev`

### 4) Initialize DB schema (first time only)

```bash
npm run prisma:migrate
```

App runs at [http://localhost:3000](http://localhost:3000).

---

## Available Scripts

- `npm run dev` - validate env and run dev server
- `npm run build` - validate env and build production bundle
- `npm run start` - validate env and start production server
- `npm run lint` - run ESLint
- `npm run prisma:migrate` - apply Prisma migrations
- `npm run prisma:generate` - regenerate Prisma client
- `npm run prisma:studio` - open Prisma Studio

---

## Architecture Overview

### Frontend

- `src/app/page.tsx`
  - main UI orchestration (upload flow, page switching, calibration, drawing)
  - responsive layout and adaptive canvas sizing (`stageWidth`/`stageHeight`)
  - keyboard shortcuts:
    - Cmd/Ctrl+Shift+L or Alt+L: line tool
    - Cmd/Ctrl+Shift+A or Alt+A: area tool
    - Cmd/Ctrl+Shift+C or Alt+C: calibrate tool
- `src/components/canvas/annotation-shape.tsx`
  - memoized annotation renderer
- `src/stores/canvas-store.ts`
  - normalized state:
    - `annotationsById`
    - `annotationIdsByPage`
  - helps avoid unnecessary full-list rerenders

### Backend (Route Handlers + services)

- `src/app/api/*`
  - `files`, `pages`, `annotations`, `uploads`, `health`
- `src/app/api/uploads/route.ts`
  - stores uploaded files under `public/uploads`
  - starts backend PDF conversion jobs
  - exposes conversion status endpoint (`GET /api/uploads?jobId=...`)
- `scripts/convert-pdf.mjs`
  - converts PDF pages to WebP (PNG fallback)
  - streams progress events consumed by upload jobs
- `src/services/*`
  - DB logic extracted from handlers
- `src/lib/validation/*`
  - request payload validation with Zod

### Data Model

- **File** -> uploaded source file (image or PDF)
- **Page** -> page-level metadata/calibration
- **Annotation** -> page-level shapes and measurements

Calibration is saved per page:
- `pixelsPerUnit`
- `unit`
- `calibrationPoints`

---

## Upload and Conversion Flow

### Images

1. Upload file to `POST /api/uploads`
2. Create `File` record
3. Upsert one `Page` with image dimensions and preview path

### PDFs

1. Upload file to `POST /api/uploads`
2. API stores PDF and returns `conversionJobId`
3. Frontend polls `GET /api/uploads?jobId=...`
4. UI shows progress: `Converting X of Y pages...`
5. On completion, frontend creates/updates `Page` rows using generated image paths

---

## Performance Notes

- PDF rendering is offloaded to backend conversion jobs
- converted pages are persisted as static images in `public/uploads`
- frontend receives incremental conversion progress
- annotations are loaded by `pageId`
- shape renderer is memoized and selection-aware
- tool modes prevent unnecessary stage updates while drawing

---

## Known Limitations / Trade-offs

- Uploaded files are stored locally in `public/uploads` (demo-friendly, not cloud/object storage).
- Conversion job state is currently in-memory (`Map`) in the uploads route.
- If the server restarts during conversion, active job tracking is lost.
- PDF page records are finalized after frontend observes job completion (not fully backend-finalized yet).
- Real-time collaboration is not included in this version.
- Recent uploads persist metadata and local file paths; if local files are manually removed, preview rendering will fail.

---

## What I Would Improve Next

- move file and preview storage to object storage (S3/GCS)
- use a persistent job queue (Redis/BullMQ or DB-backed workers)
- finalize file/page persistence fully on backend job completion
- richer annotation editing (vertex drag, snapping, undo/redo)
- role-based multi-user project support
- collaborative presence and conflict-safe annotation updates

