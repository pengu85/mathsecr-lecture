# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"수학비서" (Math Secretary) AI lecture landing page and automation system for a weekly Monday night online lecture series (22:30-23:30 KST) targeting math academy instructors. The project consists of:

1. **Landing page** (`index.html`) - Registration form for the lecture series, deployed on Vercel
2. **Review page** (`review.html`) - Post-lecture review/feedback collection form
3. **Google Apps Script backend** (`gas/Code.gs`) - Handles registration, email automation, Google Meet link generation, reminders, review collection, and Solapi (KakaoTalk) notifications

## Architecture

- **Frontend**: Pure HTML/CSS/JS (no build step, no framework). Hosted on Vercel as static files.
- **Backend**: Google Apps Script (GAS) deployed as a web app. Receives POST requests from both forms via `doPost()`, which routes by `data.mode` (`'review'` vs registration).
- **Data storage**: Google Sheets with three sheets: `신청자` (registrants), `후기` (reviews), `설정` (settings/config).
- **Integrations**: Gmail (confirmation/reminder emails), Google Calendar Advanced Service (Meet link generation), Solapi API (KakaoTalk alimtalk notifications).

## Deployment

- **Vercel**: Static site deployment. `vercel.json` configures `/review` rewrite to `review.html`, security headers, and `outputDirectory: "."`.
- **GAS**: The `gas/Code.gs` file must be manually copied into the Google Apps Script editor and deployed as a web app. Config values (spreadsheet ID, API keys) are set in the `CONFIG` object at the top of the file.

## Key GAS Functions & Triggers

- `doPost(e)` - Web app entry point, routes to `handleRegistration()` or `handleReview()`
- `createWeeklyMeetEvent()` - Creates Google Calendar event with Meet link
- `sendFridayReminder()` - Trigger: every Friday 09:00 (sends preview + new Meet link)
- `sendMondayMorningReminder()` - Trigger: every Monday 09:00
- `sendMondayEveningReminder()` - Trigger: every Monday 21:30 (1hr before)
- `sendReviewRequest()` - Trigger: every Tuesday 00:00 (post-lecture review request)

## Language

All UI text, comments, and documentation are in Korean. The project targets Korean-speaking users.
