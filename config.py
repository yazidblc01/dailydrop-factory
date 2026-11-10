from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
MEDIA_DIR = ROOT / "media"

CLAUDE_MODEL = "claude-sonnet-5-5"

CHANNEL_NAME = "The Daily Drop"

# Where every video gets posted (through Upload-Post). Each one must be connected to the
# Upload-Post profile first. Add "tiktok" and "instagram" here once they're connected.
PLATFORMS = ["youtube", "facebook"]

# Label the videos as AI-made on platforms that ask for it (the voice is AI). Protects the accounts.
AI_LABEL = True
