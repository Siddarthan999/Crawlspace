# Contributing to Crawlspace

Thanks for taking a look. Bug reports, ideas and pull requests are all welcome.

## Running it for development

The quickest way is the same as for users: `docker compose up --build` (see the [README](README.md)).

To work on the code with live reload instead:

```bash
# backend (uses SQLite unless DATABASE_URL is set)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# frontend, in a second terminal
cd frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev      # http://localhost:5173
```

JavaScript rendering needs Chromium (`playwright install chromium`); everything else works without it.

## Before opening a pull request

- Frontend: `npx tsc --noEmit` and `npm run build` both pass.
- Backend: `python -c "from app.main import app"` runs without error, and any new check or endpoint
  has been exercised against real data (a small local site is enough).
- UI: use the CSS variables in `frontend/src/styles.css` — don't hardcode colours.
- Keep changes focused; one feature or fix per pull request.

## Adding a check

Checks are small registered functions — see
[Extending it](docs/ADVANCED.md#extending-it). A new check appears in the UI automatically.

## Reporting bugs

Please include what you ran, what you expected, what happened, and the relevant part of
`docker compose logs backend`. Don't paste API keys or OAuth secrets.
