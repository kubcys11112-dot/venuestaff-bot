require('dotenv').config();

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

function startHealthServer() {
  const port = process.env.PORT;

  if (!port) {
    return;
  }

  http.createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        status: 'ok',
        service: 'venuestaff-bot'
      }));
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('VenueStaff Bot is running.\n');
  }).listen(port, () => {
    console.log(`Health server listening on port ${port}.`);
  });
}

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));

  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`Command ${file} is missing a data or execute export.`);
  }
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));

  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`VenueStaff Bot is online as ${readyClient.user.tag}.`);
});

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in your environment.');
  process.exit(1);
}

startHealthServer();
client.login(process.env.DISCORD_TOKEN);
