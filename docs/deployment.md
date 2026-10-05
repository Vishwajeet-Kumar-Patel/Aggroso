# Deployment Guide: Render & Vercel

This guide provides exact, copy-paste steps to deploy the **Aggroso Migration Workbench** to production:
- **Backend API:** Hosted as a Python Web Service on [Render](https://render.com) (Free Tier).
- **Frontend SPA:** Hosted on [Vercel](https://vercel.com) (Free Tier).

---

## 1. Backend Deployment on Render

### Prerequisites
- A GitHub repository containing the codebase.
- A free Render account at [render.com](https://render.com).

### Option A: Using Render Blueprint (`render.yaml`)
1. Log into your Render Dashboard.
2. Click **New +** → **Blueprint**.
3. Connect your GitHub repository (`Aggroso`).
4. Render will automatically detect the [`render.yaml`](../render.yaml) file in the root.
5. Click **Apply**.
6. (Optional) Set the secret environment variable `ANTHROPIC_API_KEY` if you want LLM proposal generation in production (deterministic fallback is used automatically if not provided).

### Option B: Manual Web Service Setup
If creating manually:
1. Click **New +** → **Web Service**.
2. Connect your repository.
3. Configure the following settings:
   - **Name:** `aggroso-backend`
   - **Language:** `Python 3`
   - **Region:** `Oregon (US West)` or closest to your users
   - **Branch:** `main`
   - **Root Directory:** *(leave blank)*
   - **Build Command:** `pip install -r backend/requirements.txt`
   - **Start Command:** `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. In **Environment Variables**, add:
   - `PYTHON_VERSION`: `3.11.0`
   - `ENABLE_FAULT_INJECTION`: `false`
   - `APP_DB_URL`: `sqlite:///./app.db`
   - `TARGET_DB_URL`: `sqlite:///./target.db`
   - `CORS_ORIGINS`: `https://your-frontend.vercel.app,http://localhost:5173`
   - `ANTHROPIC_API_KEY`: *(your key or leave empty for deterministic fallback)*
5. Click **Deploy Web Service**.
6. Note down your backend URL (e.g., `https://aggroso-backend.onrender.com`).

---

## 2. Frontend Deployment on Vercel

### Prerequisites
- A free Vercel account at [vercel.com](https://vercel.com).
- Your Render backend service URL.

### Steps
1. Log into your Vercel Dashboard.
2. Click **Add New…** → **Project**.
3. Import the GitHub repository (`Aggroso`).
4. Configure the project settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. In **Environment Variables**, configure:
   - **Name:** `VITE_API_BASE_URL`
   - **Value:** `https://aggroso-backend.onrender.com/api` *(replace with your Render backend URL)*
6. Click **Deploy**.
7. Vercel will build and deploy the frontend with SPA routing rewrites configured via [`frontend/vercel.json`](../frontend/vercel.json).

---

## 3. Post-Deployment Verification

Run the smoke test script against your production URLs:

```bash
./scripts/smoke_test.sh https://aggroso-backend.onrender.com https://your-frontend.vercel.app
```

### Health Check Endpoints
- Backend Health: `GET https://aggroso-backend.onrender.com/api/health`
- Backend Docs: `GET https://aggroso-backend.onrender.com/docs`
- Frontend: `GET https://your-frontend.vercel.app/`
