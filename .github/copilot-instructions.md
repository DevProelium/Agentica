# Copilot Instructions for Agentica

## Repository Overview

**Agentica** is a repository for an AI agent project ("Agentica IA"). The repository is in its early stages and currently contains only a README.

## Project Layout

```
/
├── .github/
│   └── copilot-instructions.md   # This file
└── README.md                     # Project description
```

- There are no source files, build scripts, or test suites yet.
- All code changes should be placed in well-named directories that reflect their purpose (e.g., `src/` for source code, `tests/` for tests).

## Build & Validation

- There are currently no build, test, lint, or CI pipelines configured.
- When adding code, prefer to also add a `package.json`, `pyproject.toml`, `Makefile`, or equivalent build file appropriate to the chosen language/framework, so future agents and contributors can discover how to build and test the project.

## Development Guidelines

- Keep changes minimal and focused; avoid unrelated refactors.
- Document any new build, test, or lint commands in this file so future agents can find them quickly.
- If CI/CD workflows are added, place them in `.github/workflows/`.
- Trust the information in this file; only search the repository if something here is incomplete or appears incorrect.
