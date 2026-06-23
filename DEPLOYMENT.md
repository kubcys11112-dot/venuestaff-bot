# Deployment

VenueStaff Bot is ready for multi-server hosting. Slash commands are global, event data stores the Discord server ID with each event, and manager actions use Discord permissions instead of server-specific role IDs.

## Required Environment Variables

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_discord_application_client_id_here
```

Optional:

```env
DATABASE_PATH=data/database.json
```

Do not commit `.env`.

## Render

Use the included `render.yaml`.

1. Push this project to GitHub.
2. In Render, create a new Blueprint from that repository.
3. When Render asks for secret values, set:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
4. Deploy.

The Blueprint creates a Node background worker and attaches a persistent disk at `/data`. The bot stores JSON data at:

```text
/data/database.json
```

Render will run:

```bash
npm ci
npm run deploy && npm start
```

## Railway

Use the included `railway.json`.

1. Push this project to GitHub.
2. In Railway, create a new project from that repository.
3. Set:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
4. Attach a volume to the service.
5. Deploy.

When a Railway volume is attached, Railway provides `RAILWAY_VOLUME_MOUNT_PATH`. If `DATABASE_PATH` is not set, the bot stores:

```text
$RAILWAY_VOLUME_MOUNT_PATH/database.json
```

Railway will run:

```bash
npm run deploy && npm start
```

## Discord Invite

Invite the bot with:

- `bot`
- `applications.commands`

Recommended permissions:

- Send Messages
- Embed Links
- Attach Files
- Use Slash Commands
- Read Message History

## Permissions

Users can manage VenueStaff events if they have one of these Discord permissions in that server:

- Administrator
- Manage Server

Staff only need access to the channel where the dashboard is posted.
