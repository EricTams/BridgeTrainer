# Tech Stack

## Platform

- **Runtime:** Browser (modern evergreen browsers)
- **Hosting:** GitHub Pages (static files only)
- **No build step:** Served directly as-is

## Languages & Modules

- **JavaScript:** ES2022+ with ES modules (`import`/`export`)
- **Type checking:** JSDoc type annotations + `jsconfig.json` (no TypeScript compiler)
- **HTML5 / CSS3:** Hand-written, no preprocessors

## Libraries & Frameworks

- **None.** Vanilla JS, HTML, CSS only.
- Dependencies are added only when a clear need arises.

## Data & State

- **localStorage** for persisting user ratings and progress
- **In-memory** state for current deal, auction, and UI

## Testing

- Manual browser testing during development
- Automated tests added as complexity warrants
