# The Daily Drop: roadmap and build specs

Written 2026-11-11. This is the working plan for whoever builds next. Read it fully before changing code.

## 1. Where things stand

- **Live pipeline:** GitHub Actions makes one video each morning (6:13 AM Toronto, backups 7:43 and 9:13) and schedules it through Upload-Post to YouTube and Facebook at the day's slot (`engine/schedule.py`).
- **Current format:** `TEMPLATE = "story"` in `config.py`. A line race with one contender hidden as "???", callouts at key moments, reveal on the chart. Topics without price history fall back to `"classic"`.
- **Honest assessment:** the line race is a commodity format with an AI voice. It keeps the channel alive while better formats are built. It is not the end state.
- **Not verified yet:** the voice fixes pushed on Nov 11 (numbers as words, neighbor context) have not been heard by anyone. Check the Nov 12 reel.

## 2. Rules for building

1. **Never break the daily run.** Every new format is a new template file plus a new value in config. The default stays on the working format until the user switches it.
2. **Test with `python run.py <topic> --no-post`** on the user's Mac before anything goes live. The sandbox cannot reach Yahoo, World Bank, Claude, ElevenLabs, Pixabay or Upload-Post, so sandbox tests use sample data and must be described that way.
3. **Deliver full files,** never line edits. Start with `git pull` in every set of commands, because GitHub commits state files daily.
4. **Every number on screen or in a script comes from data,** and the script checker must reject anything else.
5. **Ask before building.** The user validates approach first, with mock frames for anything visual.
6. **User preferences:** concise, plain chat steps, no em dashes, never "pp", French labels for Google/YouTube menus.

## 3. Strategy

**The goal is one or two signature formats nobody else runs, found by testing, not by guessing.**

- Build five candidate formats (section 5). Run them in rotation by weekday on the one channel.
- Rotation also protects against YouTube's mass-produced content policy, because consecutive videos differ in structure.
- After each format has 6 or more posts, compare in YouTube Studio: average percentage viewed, "viewed vs swiped away", and comments per 1,000 views. Keep the top two, drop the rest, then deepen the winners.
- Every format must pass three tests: something moves in the first second, the viewer has a reason to guess, and the answer is not obvious.

**Target rotation once formats exist**

| Day | Slot (Toronto) | Format |
|---|---|---|
| Mon | 12:00 PM | Texts from the future |
| Tue | 4:00 PM | Higher or lower |
| Wed | 4:00 PM | Line race |
| Thu | 4:00 PM | Two hosts |
| Fri | 5:00 PM | Texts from the future (GTA or gaming topic) |
| Sat | 11:00 AM | Money to scale |
| Sun | 9:00 AM | Higher or lower |

Implementation: `FORMAT_BY_WEEKDAY` in `config.py`, read by `run.py`. A format that is not built yet maps to the line race.

## 4. Work order

1. Topic expansion and low-stock alert (section 6)
2. GTA batch, must be live by Sunday Nov 15 (section 7)
3. Texts from the future (5.1)
4. Higher or lower (5.2)
5. Two hosts (5.3)
6. Money to scale (5.4)
7. Chat picks the portfolio (5.5), only once videos get regular comments

## 5. Format specs

### 5.1 Texts from the future

**Idea:** a phone chat between Past You and Future You. Future You drops hints, Past You doubts, the real chart arrives as an attachment, the reveal is a message.

- **No voiceover.** Typing sounds, send/receive pops, music. This removes the AI-voice tell.
- **Length:** 25 to 35 seconds, 10 to 14 messages.
- **Structure:**
  1. First frame: a notification banner already on screen ("Future You: do NOT sell that stock").
  2. Chat opens. 3 to 4 messages of setup with one joke.
  3. Future You sends the chart as an attachment. It expands full screen and the line race plays for 6 to 8 seconds, mystery still hidden.
  4. Back to chat. Past You guesses wrong. Future You reveals the name and number.
  5. Last message loops into the first ("wait, what stock?").
- **Script JSON from Claude:** `{"hook_notification", "messages": [{"from": "past"|"future", "text", "kind": "text"|"chart"|"reveal"}], "title", "description", "pinned_comment"}`.
- **Checks:** 10 to 14 messages, each 60 characters or fewer, exactly one `chart` and one `reveal`, the mystery name appears only in the reveal, all numbers from data, no swearing.
- **Timing with no voice:** each message shows after a typing indicator. Reading time is 0.9 seconds plus 0.045 seconds per character.
- **Visual:** an original chat UI in the channel theme. Do not copy iMessage or WhatsApp. Bubbles fill the safe box (x 110 to 970, y 280 to 1440). Contact header shows "Future You" with the drop logo.
- **Topics:** every investing topic, price-then-vs-now topics, and GTA ("it costs HOW much in 2026?").
- **Files:** `engine/chat.py` (script and checks), `video/src/ChatReel.tsx`, reuse `LineRaceScene` for the attachment.
- **Humor:** cheeky, no swearing, never "buy this". Past You is cocky, Future You is tired of him.

### 5.2 Higher or lower

**Idea:** a game. Two things on screen, a 3-second countdown, the answer, next round. 4 rounds, a streak counter, final card "comment your score".

- **Length:** 30 to 40 seconds. Voice optional. Start with no voice.
- **Round:** 2s question, 3s countdown with a ticking sound, 1.5s reveal with the number counting up and a green or red flash.
- **Data:** pairs built from data already pulled. Good pairs are close calls or have a counterintuitive answer. Score each pair by how close the two values are and keep the closest.
- **Pair sources:** stock returns over the same period, GDP or population of two countries, launch prices in today's dollars, market values.
- **Checks:** both values from data, the two differ by at least 3% so the answer is unambiguous, no pair repeats within 60 days.
- **Files:** `engine/pairs.py`, `video/src/GameReel.tsx`, `data/pairs_used.json`.

### 5.3 Two hosts

**Idea:** the drop mascot and a second character who doubts everything argue over the chart.

- **Voices:** two distinct ElevenLabs voices with character settings, not the default narrator.
- **Script:** 8 to 12 short lines of back-and-forth, written by Claude, numbers checked as usual.
- **Visual:** the chart on top, the two characters at the bottom, the speaker bounces and has a simple open/closed mouth.
- **Risk:** this still uses AI voices. Only keep it if retention beats the line race.

### 5.4 Money to scale

**Idea:** show amounts as physical objects. $1,000 is a small stack of bills. $370,000 is a tower beside a person, a car, a house.

- **Tech:** `@remotion/three` for 3D, or a 2D physics pile with matter.js run deterministically per frame. Decide after a one-day spike on render time in GitHub Actions.
- **Structure:** start with the small stack, then each contender's pile grows in turn, biggest last, with a reference object for scale.
- **Reference objects must be generic** (a person silhouette, a house shape), never branded products.
- **Longest build,** 1 to 2 weeks. Do the spike first and report honestly if render time or look is not good enough.

### 5.5 Chat picks the portfolio

**Idea:** a running series. Viewers vote in the comments for a stock each week, the channel "buys" it on paper, and episodes track the result.

- **Paper only.** No real money. The user works in asset management and real stock picks could collide with his employer's personal trading rules. Every episode says "paper portfolio, not financial advice".
- **Needs:** reading comments through the YouTube Data API (the OAuth setup exists), a vote counter that accepts only tickers from a fixed list, and `data/portfolio.json` as the ledger.
- **Start only when** videos get at least 20 comments regularly.

## 6. Topic expansion and low-stock alert

Goal: at least 4 months of material per format.

- **Investing:** add groups (chips, airlines, retail, energy, luxury, sportswear, crypto majors, big ETFs) and start years 2005 to 2022. Check each ticker has data from the start year.
- **World Bank:** add measures beyond GDP and population: life expectancy, internet users, CO2 per person, military spending, exports, inflation. Same regions.
- **Prices then vs now:** US average prices from FRED (eggs, gas, bread, electricity, rent index, tuition index), adjusted for inflation.
- **Gaming:** console launch prices in today's dollars, from a CSV with a source URL per row, like the GTA file.
- **Filters stay on:** the interest score and `story.worth_it` (2 or more race moments).
- **Count honestly:** after building, run every topic through the filters and report how many survive, per format.
- **Low-stock alert:** in `run.py`, a Telegram warning when remaining valid topics for any format drop under 14.

## 7. GTA batch (deadline Nov 15)

GTA 6 launches Nov 19. Plan: a second daily Short at 7:00 PM, GTA only, Nov 16 to 22.

- **Topics:** launch prices in today's dollars (built), hours of minimum-wage work to buy each GTA, years between releases, launch console prices in today's dollars, $1,000 in Take-Two vs Sony, Microsoft, Nintendo, EA, Ubisoft since GTA V, best-selling GTA games, biggest entertainment launches.
- **Every figure needs a source URL in a CSV.** Verify by web search before use. Drop any topic whose numbers cannot be sourced.
- **Schedule change:** `engine/schedule.py` gets a dated extra slot, and `run.py --once-a-day` must count two videos on those days.
- **No official logos or game footage.** Use year tiles and original graphics.

## 8. Open items for the user

- Upgrade Upload-Post to Basic. The free plan allows 10 uploads a month.
- Finish TikTok and Instagram accounts, connect them in Upload-Post, then add them to `PLATFORMS` in `config.py`.
- Check the music credit lines in `data/music.json` against the Free To Use download pages.
- Pin the first comment on each video (Upload-Post can only post it).
- Apply for the YouTube API audit to drop the Upload-Post fee later.

## 9. Known weak spots

- "Skip topics with an obvious winner" is not built. There is no reliable test for it yet.
- The year counter and a callout's year can differ by one during the race, because the race pace is evened out.
- Scheduled GitHub runs were dropped once on day one. The three morning attempts cover it. Watch for a day with no Telegram message.
- TikTok and Instagram pay nothing in Canada today. They are for reach only.
