# Gates of Okinawa App

This app follows the Hayden Brave two-mode pattern:

- `reader.html` for the EPUB reading experience
- `listen.html` for the audiobook player

The root `index.html` is a mode selector that links to both modes.

## Branch workflow

- Treat `main` as the production branch unless deployment configuration is added that explicitly points elsewhere.
- Do new feature work on short-lived branches, then merge reviewed changes back into `main`.
- Keep deployment-oriented changes deliberate so feature branches stay safe for iteration.

## File placement

- Place the EPUB at the project root as `Gates_of_Okinawa.epub`
- Place audiobook files in `/audio`
- Keep the audiobook track list in root `manifest.json`
- Keep the landing, reader, and audiobook pages at the project root
- Store cover art, branding, and bundled vendor files in `/assets`
- Use `assets/gates-of-okinawa-cover.png` for the reader and home card
- Use `assets/gates-of-okinawa-audiobook-cover.png` for the audiobook mode
- The reader loads EPUB.js dependencies from `/assets/vendor`

## Audiobook manifest

The audiobook page is driven by `manifest.json` at the project root. Supported fields:

```json
[
  {
    "id": 1,
    "title": "Chapter 1",
    "file": "chapter-01.mp3",
    "chapterLabel": "Chapter 01",
    "duration": 0
  }
]
```

- `id`, `title`, and `file` are the required fields used by the player
- `chapterLabel` is optional and lets you override the track label shown in the list
- `duration` is optional metadata if you want to store it for your own bookkeeping
- `file` is usually resolved relative to `/audio`, but direct relative or absolute paths also work if needed during migration

## Saved progress

Reading progress and listening progress are intentionally separate:

- `gatesOfOkinawa.reading.position` stores the last EPUB CFI location
- `gatesOfOkinawa.reading.theme` stores the active reader theme
- `gatesOfOkinawa.reading.fontSize` stores the last reader font size
- `gatesOfOkinawa.listening.track` stores the last selected audiobook track
- `gatesOfOkinawa.listening.speed` stores the playback speed
- `gatesOfOkinawa.listening.timestamp.<filename>` stores the saved listening position for each track
- `gatesOfOkinawa.listening.sleepTimer` stores the most recently chosen sleep timer option

Older `gatesOkinawa.reading.*` reader keys are migrated on load.

## Listening features

- Chapter list loaded from `manifest.json`
- Previous/next chapter controls
- 15-second back and 30-second forward skip controls
- Scrub bar with current and total time
- Playback speed persistence
- Per-track saved listening position
- Missing audio files render an inline status instead of crashing the player
- Sleep timer options for Off, 15, 30, 45, 60 minutes, or End of chapter
- Fixed-duration sleep timers pause while audio is paused and fade volume down during the final 10 seconds

## Local run

Serve the folder over local HTTP instead of opening pages directly by `file://` when possible:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

Some browsers restrict EPUB and media loading when opened directly from `file://`, so local HTTP serving is the most reliable way to test both modes.
