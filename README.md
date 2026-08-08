# Techtonic

A web strategy game: grow a Stone Age settlement toward the stars. Ages run **Stone → Farming → Metal → Industrial → Atomic → Space**, with isometric building, five resources, research, age-up landmarks, and cloud saves.

## Stack

- **Web:** Vite, React, TypeScript, Phaser, Zustand
- **API:** FastAPI, SQLModel, JWT auth
- **DB:** PostgreSQL (`JSONB` save blobs)

## Quick start

One command (installs deps if needed, checks local Postgres, starts API + web):

```bash
./dev.sh
```

Then open [http://127.0.0.1:5173](http://127.0.0.1:5173). Press Ctrl+C to stop API/web.

### 1. Database (local Postgres, no Docker)

Run Postgres on your machine first (Homebrew, Postgres.app, etc.), then ensure
`apps/api/.env` points at it:

```text
DATABASE_URL=postgresql+psycopg://techtonic:techtonic@localhost:5432/techtonic
```

`./dev.sh` will try to create the `techtonic` role/database via `psql` if missing.
If your credentials differ, edit `DATABASE_URL` to match.

### 2. API

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # if needed
uvicorn app.main:app --reload --port 8000
```

API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Web

```bash
cd apps/web
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:8000
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Register, start a new game, build, research, age up, and save to a cloud slot.

### Tests

```bash
cd apps/web
npm test
```

## Core loop

1. Gather wood/stone (and later metal) and forage food via the Workers tab  
2. Build houses and production camps on the isometric map  
3. Accrue knowledge → research techs that unlock buildings and age gates  
4. Meet each age’s checklist (key tech, landmark, population, resources)  
5. Advance: Farming → Metal → Industrial → Atomic → Space  
6. Cloud save/load with email + password (3 slots, autosave every 60s)

## Controls

- **WASD** — pan  
- **Scroll** — zoom  
- **Right-drag** — pan  
- **Left-click** — place selected building  

## Project layout

```text
apps/web/src/sim/     Pure simulation (no Phaser/React)
apps/web/src/game/    Isometric Phaser view
apps/web/src/ui/      HUD, auth, menus
apps/api/app/         FastAPI auth + saves
```
