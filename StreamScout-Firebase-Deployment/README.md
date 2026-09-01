# StreamScout

Search movies and television shows and compare current U.S. streaming availability across subscription, free, rental, and purchase options.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Add a Watchmode API key to `WATCHMODE_API_KEY`.
3. Run `npm install` and `npm run dev`.

The API key is read only by the server-side search route and is never sent to the browser.

## Firebase App Hosting

This repository is configured for Firebase project `stream-find`. Create an App Hosting backend from this repository and add `WATCHMODE_API_KEY` through Firebase Secret Manager. The backend reads the secret using the mapping in `apphosting.yaml`.
