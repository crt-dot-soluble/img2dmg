# Deployment

## GitHub Pages

This repo uses gh-pages for deployment.

```bash
npm run deploy
```

The built site will be published to the gh-pages branch.

## Offline support

The app registers a service worker and caches the app shell. After first load, it works offline.
