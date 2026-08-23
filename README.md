# ShiftMate

ShiftMate is a mobile-first roster and pay companion designed to make rotating shift work easier to manage at a glance.

This repository represents the **initial working release of ShiftMate (Version 1.0)**. Earlier internal version numbers were used during development and testing; they are not separate public releases.

## What ShiftMate does

ShiftMate combines roster entry, calendar visibility and estimated pay in one lightweight web app.

### Roster
- Enter rostered shifts by pay cycle.
- Select the line worked and use the corresponding shift codes.
- Record leave, additional hours, higher duties and relevant offline arrangements.
- Easily identify entered shifts, days with no shift, and overtime.
- Re-open an entered pay cycle from the Home screen to make roster changes.

### Calendar
- View the roster in a month-style calendar.
- Working days are visually blocked out and show the actual shift code.
- Non-working days are highlighted as available.
- The current day is clearly marked.
- Navigate across complete calendar weeks, including days that fall into adjacent months.
- Share a simplified roster for a partner, using Day / Arvo / Night descriptions rather than internal shift codes.

### Pay
- Estimate pay from entered roster information.
- View the upcoming pay and its estimated deposit.
- Identify pay cycles using the roster-office-style period-end format, for example `PE080826`.
- See the corresponding date range underneath the PE identifier.
- Review current, future and historical pay cycles.
- Store actual deposits for comparison with estimates.

### Home
- See the upcoming pay and estimated deposit.
- View the current roster week at a glance.
- Jump directly to any entered pay cycle and open it in the Roster tab for editing.

## Pay-cycle naming

ShiftMate uses the period-end convention:

`PEDDMMYY`

Example:

`PE080826`  
`26 Jul – 8 Aug`

This keeps the app's pay-cycle references easy to match with workplace roster terminology.

## Installation

ShiftMate is a web app and can be hosted as a static site.

On iPhone, open the hosted ShiftMate site in Safari and use **Add to Home Screen** for an app-like experience.

## Data

Roster and pay information is stored locally by the app in the user's browser/device storage. Users should keep their own backup where required.

## Pay estimates

ShiftMate is intended as a roster and pay-estimation tool. Estimated pay should be checked against the official payslip. Payroll rules and allowances may require further validation where they have not yet been confirmed against an actual payroll result.

## Version

**ShiftMate 1.0 — Initial Release**
