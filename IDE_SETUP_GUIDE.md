# Loan Management System - IDE Setup and Running Flow

This guide covers local setup, run commands, and the execution flow for developers working on the FastKwacha project.

## Prerequisites

Install the following tools:

- Node.js 18+
- npm 9+
- Git

Verify versions:

```bash
node -v
npm -v
git --version
```

## Recommended IDE (VS Code)

Suggested extensions:

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- PostCSS Language Support

Recommended editor behavior:

- Enable **Format on Save**

## Initial Project Setup

1. Open the project folder in VS Code.
2. Install dependencies:

```bash
npm install
```

3. Create local environment file:

```bash
cp .env.example .env
```

4. Fill required values in `.env`.

## Run Commands

### Development

```bash
npm run dev
```

Default URL: `http://localhost:3000`

### Build

```bash
npm run build
```

### Type Check

```bash
npm run lint
```

## High-Level Code Structure

- `src/main.tsx`: App bootstrap and provider mounting
- `src/App.tsx`: Main application state, routing by view, module composition
- `src/lib/`: Integrations and shared utilities (for example Firebase)
- `components/`: Reusable UI elements
- `app/`: Support scripts and auxiliary app logic
- `firestore.rules`: Firestore access rules

## Runtime Flow

1. App initializes from `main.tsx` and mounts `<App />`.
2. Authentication state is resolved.
3. User role controls visible modules and actions.
4. Firestore listeners load and keep data synced.
5. Domain workflows execute (clients, applications, loans, payments, reporting).
6. Automation and notifications update operational status in the UI.

## Testing Notes

- Type checks are run via `npm run lint`.
- Playwright is present for browser tests (if configured test specs exist).

## Security Notes

- Never commit `.env`.
- Keep Firebase credentials scoped to the target environment.
- Review Firestore rules before production deployment.
