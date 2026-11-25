# InboxPilot

## Platform
Web app for a personal email automation portfolio project.

## Purpose
Organize email, clean up spam and unwanted senders, send approved replies, and interpret failed deliveries with minimal routine intervention.

## Constraints
Use recoverable Trash instead of immediate permanent deletion. Never guess recipient corrections. Keep credentials server-side. Show demo data honestly. Start live accounts in shadow mode. Live access requires owner-provided Google OAuth credentials. Accuracy is not benchmarked.

## Stack
Implementation choice: Node.js 24, native HTTP and SQLite, plain browser JavaScript. Single private account per deployment. Render web service with persistent disk. Repository confirmed: https://github.com/Adonissimo/automation.
