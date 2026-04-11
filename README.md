# Gates of Okinawa Reader App

This project is the reading-only web app for **Gates of Okinawa**. It keeps the same reader-side architecture and interaction model as the Cereus & Limnic app while focusing only on EPUB reading for this phase.

## File placement

- Put the EPUB at the project root as `Gates_of_Okinawa.epub`
- Keep the landing and reader pages at the project root
- Store cover art, branding, and vendor files in `/assets`
- The reader loads EPUB.js dependencies from `/assets/vendor`

## Local run

Serve the folder over local HTTP instead of opening it directly with `file://`:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Phase Two intentionally left out

- Audiobook page and audio transport UI
- `listen.html`
- `listen.js`
- audiobook `manifest.json` logic
- mode selection cards for listening
