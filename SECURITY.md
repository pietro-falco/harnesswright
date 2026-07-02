# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Threat model

harnesswright has zero runtime dependencies and makes no network calls of
its own (the CLI resolves `@pietro-falco/verity` through your package
manager). Three commands, three postures:

- `init` writes only the files listed in its plan (`--dry-run` shows it
  verbatim) and never overwrites existing files without `--force`.
- `gate` executes the commands declared in the target repository's
  `.verity/claims.json`, exactly as `npm test` executes that repository's
  scripts. Running `gate` on an untrusted repository executes that
  repository's commands: read the claims manifest first.
- `doctor` is read-only.

## Reporting a vulnerability

Please use GitHub private vulnerability reporting on this repository
(Security → Report a vulnerability) or email
`pietrofalco.dev@gmail.com`. Do not open public issues for security
reports. You can expect an acknowledgment within 72 hours.
