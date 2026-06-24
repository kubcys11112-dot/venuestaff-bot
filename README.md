# VenueStaff Bot

VenueStaff Bot is a first working version of a Discord staff scheduling bot for FFXIV venue owners. Managers create a venue event with `/event create`, and staff respond through Discord buttons, select menus, modals, and embeds instead of typing chat commands.

This is a public multi-server bot. It uses global slash commands only and separates event data by the Discord server where each interaction happens.

## Features

- `/event create` slash command for owners and managers
- Event creation modal
- Public event dashboard embed
- Staff attendance buttons:
  - I can attend
  - I can't attend
  - Maybe
- Staff role select menu:
  - Security
  - Bartender
  - Dancer
  - DJ
  - Greeter
  - Photographer
  - Entertainer
  - Manager
  - Owner
  - Host
  - Other
- Start and end time dropdowns
- Optional staff notes modal
- Automatic dashboard updates
- Basic role coverage checker
- Manager controls for editing, setting required roles, locking, exporting CSV, sending reminders, and deleting
- Local JSON database
- Works on every Discord server where the bot is invited
- Multiple venues and events per server
- Render and Railway deployment config

## Requirements

- Node.js 18.17 or newer
- A Discord application and bot token
- Permission to invite the bot to your Discord server

## Setup

1. Install dependencies:

```bash
npm install
```

On Windows PowerShell, if scripts are blocked, use:

```powershell
npm.cmd install
```

2. Copy the example environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Fill in `.env`:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_discord_application_client_id_here
DATABASE_PATH=data/database.json
```

Commands are global, and events are separated by the Discord server where the interaction happens.

Members with Administrator or Manage Server permission can create and manage events.

4. Invite the bot with these scopes:

- `bot`
- `applications.commands`

Recommended bot permissions:

- Send Messages
- Embed Links
- Attach Files
- Use Slash Commands
- Read Message History

5. Deploy global slash commands:

```bash
npm run deploy
```

On Windows PowerShell:

```powershell
npm.cmd run deploy
```

Global slash commands work across every server where the bot is invited. Discord may take up to 1 hour to show global command changes everywhere.

6. Start the bot:

```bash
npm start
```

On Windows PowerShell:

```powershell
npm.cmd start
```

## Deploying

This project includes:

- `render.yaml` for Render
- `railway.json` for Railway
- `Procfile` for worker-style hosts

Use `DISCORD_TOKEN` and `CLIENT_ID` as environment variables on the host. Do not upload your `.env` file.

For Render, create a Blueprint from the repository. The included `render.yaml` creates a Node background worker in Frankfurt, runs `npm ci`, deploys global slash commands, starts the bot, and stores `data/database.json` on a persistent disk mounted at `/data`.

For Railway, create a project from the repository, set `DISCORD_TOKEN` and `CLIENT_ID`, and attach a volume. If `DATABASE_PATH` is not set, the bot automatically stores `database.json` in Railway's volume mount path.

## How It Works

Managers use:

```text
/event create
```

The bot opens a modal. Discord modals support five input fields, so this first version uses one combined field for start and end time, such as:

```text
21:00 - 01:00
```

After the manager submits the modal, the bot posts an interactive dashboard in the channel.

Staff click:

- `I can attend`
- `I can't attend`
- `Maybe`

When staff click `I can attend`, the bot opens private select menus where they choose:

- Role
- Available start time
- Available end time

The public dashboard updates after every change.

## Required Roles

New events start with these default required roles:

```text
Security: 2
Bartender: 1
Dancer: 3
DJ: 1
Greeter: 0
Photographer: 0
Entertainer: 0
Manager: 0
Owner: 0
Host: 0
```

Managers can click `Set required roles` on the dashboard to change those numbers. The modal uses one editable list, one role per line:

```text
Security: 2
Photographer: 1
Entertainer: 2
Manager: 1
Owner: 1
```

The dashboard shows coverage warnings such as:

```text
Missing 1 Security
Missing 1 DJ after 23:00
Dancer coverage full
```

## Local Database

The bot stores data in:

```text
data/database.json
```

This is intentionally simple for the first working version. For production, replace `src/database.js` with PostgreSQL or MongoDB storage.

## Project Structure

```text
src/
  commands/
    event.js
  events/
    interactionCreate.js
  database.js
  deploy-commands.js
  index.js
```

## Notes

- Staff do not need to type commands.
- Staff can only change their own attendance.
- Users with Administrator or Manage Server permission can create, edit, lock, export, send reminders, or delete events.
- Multiple venues are supported because each event stores its own venue name, dashboard message, required roles, and staff responses.
