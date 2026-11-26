# Server needs and deploy docs (design)

Date: 2026-11-26. Size: a small docs change, one branch (`docs/server-needs`).

## Intent

BinMark, CocktailRecipes and CurvyRoads will run on one VPS behind one shared edge.
server-ops-kit is the only controller of that server. This repository keeps app
knowledge only and states what the app needs from the server, so the kit can provide
and verify it. A need that is not written down does not exist on the server.

## Goals

- `docs/deploy.md` says server-ops-kit is the source of truth for the server setup and
  points at it (kit request R5). The Caddyfile snippet stays only as a note for a
  hand-run Caddy.
- `docs/deploy.md` carries a "Server needs" section (kit requests R4 and step 3), built
  from the headings of the `declaring-server-needs` skill. The catalog format lives in
  the kit; the section is a plain list flagged "catalog format pending".
- `CLAUDE.md` loses its stale wording: the work-package numbering source, the superseded
  "automatic deploys" paragraph, "package-security rows 6-9", the `@types/node` text and
  the `SESSION_TTL_DAYS=30` deploy note.

## Non-goals

- No compose, env template, edge site file or workflow change (S2 to S4).
- No domain, IP, secret or server detail in the repository: `CLIENT_ORIGIN` and
  `TRUST_PROXY_HOPS` stay placeholders until the owner decides on Cloudflare and the domain.
- The "no automated backup" wording stays until the VPS drill has passed.
- No change to BinMark. Backups depend on BinMark's kit request R1 (CocktailRecipes
  member optional).

## Approaches

One sensible way: the section lives in `docs/deploy.md`, next to the compose and env
facts it describes, so there is one place to keep current. A second copy in the spec
would drift, so this spec only points at it.

## Constraints

Public repository. Numbers are the measured ones in the compose-hardening spec; the kit
reports real values back after launch and the docs follow then.

## Handover

The Server needs section is handed to server-ops-kit by the owner; the handover is
recorded in the subject handoff.
