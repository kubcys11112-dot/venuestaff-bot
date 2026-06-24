const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function resolveDatabasePath() {
  if (
    process.env.RAILWAY_VOLUME_MOUNT_PATH
    && (!process.env.DATABASE_PATH || process.env.DATABASE_PATH === 'data/database.json')
  ) {
    return path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'database.json');
  }

  if (process.env.DATABASE_PATH) {
    return path.resolve(process.cwd(), process.env.DATABASE_PATH);
  }

  return path.resolve(process.cwd(), 'data/database.json');
}

const databasePath = resolveDatabasePath();

const defaultData = {
  events: []
};

const defaultRequiredRoles = {
  Security: 2,
  Bartender: 1,
  Dancer: 3,
  DJ: 1,
  Greeter: 0,
  Photographer: 0,
  Entertainer: 0,
  Manager: 0,
  Owner: 0,
  Host: 0
};

function ensureDatabase() {
  const directory = path.dirname(databasePath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  if (!fs.existsSync(databasePath)) {
    fs.writeFileSync(databasePath, JSON.stringify(defaultData, null, 2));
  }
}

function readDatabase() {
  ensureDatabase();

  try {
    const raw = fs.readFileSync(databasePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed.events)) {
      parsed.events = [];
    }

    return parsed;
  } catch (error) {
    console.error('Could not read database. Starting with an empty database.', error);
    return structuredClone(defaultData);
  }
}

function writeDatabase(data) {
  ensureDatabase();
  const temporaryPath = `${databasePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2));
  fs.renameSync(temporaryPath, databasePath);
}

function createEvent(eventDetails) {
  const data = readDatabase();
  const event = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    locked: false,
    requiredRoles: { ...defaultRequiredRoles },
    responses: {},
    guildId: null,
    guildName: null,
    ...eventDetails
  };
  event.requiredRoles = {
    ...defaultRequiredRoles,
    ...(event.requiredRoles || {})
  };

  data.events.push(event);
  writeDatabase(data);
  return event;
}

function getEvent(eventId) {
  return readDatabase().events.find((event) => event.id === eventId) || null;
}

function getEventByIdAndGuild(eventId, guildId) {
  return readDatabase().events.find((event) => event.id === eventId && event.guildId === guildId) || null;
}

function getEventsForGuild(guildId) {
  return readDatabase().events.filter((event) => event.guildId === guildId);
}

function updateEvent(eventId, updater) {
  const data = readDatabase();
  const index = data.events.findIndex((event) => event.id === eventId);

  if (index === -1) {
    return null;
  }

  const currentEvent = data.events[index];
  const updatedEvent = typeof updater === 'function'
    ? updater(currentEvent)
    : { ...currentEvent, ...updater };

  updatedEvent.updatedAt = new Date().toISOString();
  data.events[index] = updatedEvent;
  writeDatabase(data);

  return updatedEvent;
}

function updateEventByIdAndGuild(eventId, guildId, updater) {
  const data = readDatabase();
  const index = data.events.findIndex((event) => event.id === eventId && event.guildId === guildId);

  if (index === -1) {
    return null;
  }

  const currentEvent = data.events[index];
  const updatedEvent = typeof updater === 'function'
    ? updater(currentEvent)
    : { ...currentEvent, ...updater };

  updatedEvent.updatedAt = new Date().toISOString();
  data.events[index] = updatedEvent;
  writeDatabase(data);

  return updatedEvent;
}

function deleteEvent(eventId) {
  const data = readDatabase();
  const originalLength = data.events.length;
  data.events = data.events.filter((event) => event.id !== eventId);
  writeDatabase(data);
  return data.events.length !== originalLength;
}

function deleteEventByIdAndGuild(eventId, guildId) {
  const data = readDatabase();
  const originalLength = data.events.length;
  data.events = data.events.filter((event) => event.id !== eventId || event.guildId !== guildId);
  writeDatabase(data);
  return data.events.length !== originalLength;
}

function upsertResponse(eventId, userId, response) {
  return updateEvent(eventId, (event) => ({
    ...event,
    responses: {
      ...event.responses,
      [userId]: {
        ...(event.responses[userId] || {}),
        ...response,
        updatedAt: new Date().toISOString()
      }
    }
  }));
}

function upsertResponseByIdAndGuild(eventId, guildId, userId, response) {
  return updateEventByIdAndGuild(eventId, guildId, (event) => ({
    ...event,
    responses: {
      ...event.responses,
      [userId]: {
        ...(event.responses[userId] || {}),
        ...response,
        updatedAt: new Date().toISOString()
      }
    }
  }));
}

module.exports = {
  createEvent,
  deleteEvent,
  deleteEventByIdAndGuild,
  defaultRequiredRoles,
  getEvent,
  getEventByIdAndGuild,
  getEventsForGuild,
  updateEvent,
  updateEventByIdAndGuild,
  upsertResponse,
  upsertResponseByIdAndGuild
};
