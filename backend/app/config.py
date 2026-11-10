import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./dev.db")
DATA_DIR = os.getenv("DATA_DIR", "./data")
MAX_PARALLEL_CRAWLS = int(os.getenv("MAX_PARALLEL_CRAWLS", "2"))

# Optional. Without a key, PageSpeed Insights allows a modest number of requests
# per day per IP, which is plenty for occasional manual audits. Get a free key at
# https://developers.google.com/speed/docs/insights/v5/get-started if you hit the limit.
PAGESPEED_API_KEY = os.getenv("PAGESPEED_API_KEY", "")

# ---- Google Search Console (OAuth). Create these in Google Cloud Console; see docs/ADVANCED.md (Integrations setup).
GSC_CLIENT_ID = os.getenv("GSC_CLIENT_ID", "")
GSC_CLIENT_SECRET = os.getenv("GSC_CLIENT_SECRET", "")
# Must exactly match an "Authorized redirect URI" on your OAuth client.
GSC_REDIRECT_URI = os.getenv("GSC_REDIRECT_URI", "http://localhost:8080/api/gsc/callback")
# Where to send the browser after the OAuth callback. Empty = same origin (what you want behind nginx).
FRONTEND_URL = os.getenv("FRONTEND_URL", "")

# ---- Backlink providers (all free). Each one is optional; the "your own crawls" provider needs no key.
BING_WEBMASTER_API_KEY = os.getenv("BING_WEBMASTER_API_KEY", "")
OPENPAGERANK_API_KEY = os.getenv("OPENPAGERANK_API_KEY", "")
