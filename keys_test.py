import os
import requests
from dotenv import load_dotenv
import anthropic

load_dotenv()

# 1. Claude
client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
msg = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=1000,
    messages=[{"role": "user", "content": "Write a 12-word YouTube Shorts hook about GTA 6's launch. Reply with the hook only."}],
)
text = "".join(b.text for b in msg.content if b.type == "text")
print("CLAUDE:", text.strip())

# 2. ElevenLabs: list voices
headers = {"xi-api-key": os.environ["ELEVENLABS_API_KEY"]}
resp = requests.get("https://api.elevenlabs.io/v1/voices", headers=headers)
resp.raise_for_status()
voices = resp.json()["voices"]
print("\nVOICES (first 10):")
for v in voices[:10]:
    print(f"  {v['name']}  |  {v['voice_id']}")

# 3. ElevenLabs: test voiceover with the first voice
vid = voices[0]["voice_id"]
r = requests.post(
    f"https://api.elevenlabs.io/v1/text-to-speech/{vid}",
    headers={**headers, "Content-Type": "application/json"},
    json={"text": "This is The Daily Drop. The numbers behind everything.", "model_id": "eleven_multilingual_v2"},
)
r.raise_for_status()
with open("test_voice.mp3", "wb") as f:
    f.write(r.content)
print("\nSaved test_voice.mp3")