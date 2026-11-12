from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
MEDIA_DIR = ROOT / "media"

CLAUDE_MODEL = "claude-sonnet-5-5"

CHANNEL_NAME = "The Daily Drop"

# Where every video gets posted (through Upload-Post). Each one must be connected to the
# Upload-Post profile first. Add "tiktok" and "instagram" here once they're connected.
PLATFORMS = ["youtube", "facebook"]

# Posting service: "zernio" (free for 2 accounts, unlimited posts) or "upload_post" (old one, 10 a month free).
POSTER = "zernio"
# Zernio account IDs (not secret). Listed by: curl https://zernio.com/api/v1/accounts with the API key.
ZERNIO_ACCOUNTS = {
    "youtube": "6af5e6eebe4aba17eca15bc4",
    "facebook": "6af5e73c4b972afe8c844638",
}

# Label the videos as AI-made on platforms that ask for it (the voice is AI). Protects the accounts.
AI_LABEL = True

# Video format: "story" (countdown, race with callouts, #1 reveal) or "classic" (the original one-chart video)
TEMPLATE = "story"
