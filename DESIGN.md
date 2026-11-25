---
name: InboxPilot
description: A quiet personal email workspace
colors:
  ink: "#223c34"
  muted: "#64746d"
  green: "#195443"
  pale: "#e8efe6"
  line: "#e1e5dd"
  paper: "#fbfcf8"
  rail: "#f0f3eb"
  amber: "#73541d"
  amber-bg: "#f6efd9"
  red: "#9a4038"
  red-bg: "#faeae5"
typography:
  headline:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "36px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-1.2px"
  title:
    fontSize: "20px"
    fontWeight: 550
    letterSpacing: "-0.4px"
  body:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "14px"
  label:
    fontSize: "12px"
    fontWeight: 600
rounded:
  tag: "4px"
  field: "5px"
  control: "6px"
  navigation: "7px"
  surface: "8px"
  dialog: "12px"
spacing:
  compact: "12px"
  control: "16px"
  section: "24px"
  desktop-gutter: "48px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "11px 16px"
  search:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px 12px"
    width: "215px"
  mode-banner:
    backgroundColor: "{colors.pale}"
    rounded: "{rounded.surface}"
    padding: "21px 24px"
---

# Design System: InboxPilot

## Overview

A quiet personal workspace for daily inbox review. Desktop uses a fixed navigation rail and a dense, readable message table. Mobile uses horizontal navigation and a scrollable table. The primary action runs the rules; a persistent banner identifies preview versus active changes.

This document records the implemented interface, preserving the established direction rather than introducing a new identity.

**Key Characteristics:**
- Calm green surfaces and restrained borders.
- Compact rows with visible category labels.
- Explicit operation modes and recoverable actions.

## Colors

### Primary
Deep green anchors actions, branding, selected navigation, and field accents. Pale green supports the persistent mode banner.

### Secondary
Amber identifies delivery failures; red identifies junk and errors. Finance uses blue tags and newsletters lavender. Category text accompanies color.

### Neutral
Ink carries primary text, muted green-gray carries metadata, and paper forms the canvas. The rail is a slightly darker neutral. Fine lines divide rows and workspace regions.

## Typography

Segoe UI with system sans-serif fallback serves all roles. Table headers use uppercase (10px), tracking (1px), and weight (500). Table text is (12px); previews and timestamps are (11px). Paragraph line height is (1.6); message bodies use (1.8).

## Layout

Desktop uses a sticky viewport-height rail (238px), main gutters (48px), and header height (88px). The heading, mode banner, toolbar, and table form the main sequence. Tables scroll horizontally within their container.

Up to (1100px), the rail narrows to (205px), gutters to (28px), and heading to (31px). Up to (760px), navigation becomes a horizontal scrollable row in normal flow; rail notes and account details hide. Main gutters become (20px), search spans available width, heading becomes (32px), and sender avatars hide. At (1500px) and above, gutters become (70px).

## Elevation & Depth

The workspace is flat. Borders and tonal surfaces establish hierarchy. Dialogs use shadow `0 20px 80px #16251b33` and backdrop `#182b245e`. Toasts use `0 8px 35px #203b3324`.

Content reveals through a clip animation (.3s ease-out). Reduced-motion preferences disable it.

## Shapes

Controls have compact rounded corners; tags are squarer, banners softer, and dialogs rounder. Avatars are circular. Mode pills use a capsule radius (30px).

## Components

### Buttons
Primary buttons are green with white text; hover darkens to `#103c2f`. Secondary buttons are white with divider borders; subtle buttons are transparent. Secondary hover uses the rail surface. Disabled buttons have opacity (.55) and a waiting cursor. Interactive elements share a focus outline (3px solid `#67843e`, offset 4px).

### Inputs / Fields
Search uses transparent fill and divider border. Form fields use white, a stronger border (`#cad2c6`), compact corners, and padding (12px). Textareas resize vertically. Green accents identify checkbox and switch state.

### Navigation
Selected destinations use pale green (`#dfe9d8`), deep green text, and weight (650). Hover uses `#e5ebdf`. Desktop destinations stack; mobile destinations scroll horizontally. Selected category tabs use `#e8eee1`.

### Chips
Category tags pair text and semantic tone. Mode pills are compact green capsules. Status labels remain distinct from interactive filter tabs.

### Cards / Containers
The persistent banner is a flat green container with information and a right-hand mode pill. Mobile padding tightens to (17px) and content aligns to the top.

### Message Table and Dialogs
Rows separate sender, subject and preview, category, and received time. Names and previews truncate; full bodies render as plain text in dialogs. Dialogs use padding (28px), maximum width (640px), and viewport width minus (32px). Bodies scroll after (280px), or (230px) on mobile. Reply approval is explicit. Trash exposes restore and sender protection. Recipient suppression is an explicit reviewed action, with removal controls in rules.

### Feedback
Empty states center a short heading and guidance. Loading, disabled, running, paused, error, and simulated-send states have explicit text. Toasts sit at bottom right, green for routine feedback and dark red for errors.

## Do's and Don'ts

- Do keep category names visible alongside their colors.
- Do preserve keyboard focus and reduced-motion support.
- Do identify sample data, preview mode, and simulated sends honestly.
- Don't render message bodies as HTML.
- Don't imply that cleanup is permanent or sending is automatic.
