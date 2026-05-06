# Once Upon a Webhook — Slide Deck

A ~10 minute Slidev deck for the Storytime Slack bot talk.

## Run

From the repo root (the slides package is part of the pnpm workspace):

```bash
pnpm install   # one-time, installs root + slides deps
pnpm slides    # opens the deck in your browser
```

Or from this directory:

```bash
pnpm dev
```

## Build / export

```bash
pnpm build            # static site in ./dist
pnpm export           # PDF export (requires `playwright-chromium`)
```

## Files

- `slides.md` — the deck
- `snippets/` — extracted simplified code snippets used in magic-move blocks
- `public/` — images (copied from the project's `public/`)

## Talk flow (~10 min)

1. Title — _Once Upon a Webhook: Durable AI Agents with Workflow SDK_
2. The product — collaborative storytime bot in Slack
3. The local CLI prototype (`local.ts`)
4. The hard part of porting to Slack
5. Workflow SDK + Hook primitive primer
6. Architecture diagram
7. **The port, animated** — magic-move from `local.ts` → workflow
8. The webhook handler (resume side)
9. Takeaways + live demo
