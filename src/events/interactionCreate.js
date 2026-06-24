const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const {
  createEvent,
  defaultRequiredRoles,
  deleteEventByIdAndGuild,
  getEventByIdAndGuild,
  updateEventByIdAndGuild,
  upsertResponseByIdAndGuild
} = require('../database');
const { isManager } = require('../commands/event');

const roleOptions = [
  { label: 'Security', emoji: '\u{1F6E1}\uFE0F', value: 'Security' },
  { label: 'Bartender', emoji: '\u{1F378}', value: 'Bartender' },
  { label: 'Dancer', emoji: '\u{1F483}', value: 'Dancer' },
  { label: 'DJ', emoji: '\u{1F3A7}', value: 'DJ' },
  { label: 'Greeter', emoji: '\u{1F44B}', value: 'Greeter' },
  { label: 'Photographer', emoji: '\u{1F4F8}', value: 'Photographer' },
  { label: 'Entertainer', emoji: '\u{1F3A4}', value: 'Entertainer' },
  { label: 'Manager', emoji: '\u{1F4CB}', value: 'Manager' },
  { label: 'Owner', emoji: '\u{1F451}', value: 'Owner' },
  { label: 'Host', emoji: '\u2B50', value: 'Host' },
  { label: 'Other', emoji: '\u2699\uFE0F', value: 'Other' }
];

const schedulableRoles = roleOptions
  .map((role) => role.value)
  .filter((role) => role !== 'Other');

function normalizeRequiredRoles(requiredRoles = {}) {
  return {
    ...defaultRequiredRoles,
    ...requiredRoles
  };
}

function getRequiredRoleNames(event) {
  return Array.from(new Set([
    ...schedulableRoles,
    ...Object.keys(event.requiredRoles || {})
  ]));
}

const staffTimeOptions = [
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
  '21:30',
  '22:00',
  '22:30',
  '23:00',
  '23:30',
  '00:00',
  '00:30',
  '01:00',
  '01:30',
  '02:00',
  '02:30',
  '03:00'
];

function parseTimeRange(timeRange) {
  const parts = timeRange
    .split(/-|–|—|to/i)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    startTime: parts[0] || timeRange.trim(),
    endTime: parts[1] || ''
  };
}

function parseMinutes(time) {
  const match = String(time || '').match(/(\d{1,2}):(\d{2})/);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeEndMinutes(startTime, endTime) {
  const start = parseMinutes(startTime);
  let end = parseMinutes(endTime);

  if (start === null || end === null) {
    return end;
  }

  if (end <= start) {
    end += 24 * 60;
  }

  return end;
}

function formatMinutes(minutes) {
  const normalized = minutes % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function getRoleEmoji(role) {
  return roleOptions.find((option) => option.value === role)?.emoji || '•';
}

function getResponses(event, status) {
  return Object.values(event.responses || {}).filter((response) => response.status === status);
}

function formatStaffList(responses, emptyText) {
  if (responses.length === 0) {
    return emptyText;
  }

  return responses
    .map((response) => {
      const role = response.role ? ` ${getRoleEmoji(response.role)} ${response.role}` : '';
      const time = response.startTime || response.endTime
        ? ` (${response.startTime || '?'}-${response.endTime || '?'})`
        : '';
      return `• ${response.displayName}${role}${time}`;
    })
    .join('\n')
    .slice(0, 1024);
}

function checkRoleCoverage(event) {
  const attending = getResponses(event, 'attending');
  const requiredRoles = normalizeRequiredRoles(event.requiredRoles);
  const coverageLines = [];

  for (const [role, requiredCount] of Object.entries(requiredRoles)) {
    const needed = Number(requiredCount) || 0;
    const staffForRole = attending.filter((response) => response.role === role);
    const count = staffForRole.length;
    coverageLines.push(`${getRoleEmoji(role)} ${role}: ${count}/${needed}`);
  }

  return {
    coverageText: coverageLines.length ? coverageLines.join('\n') : 'No required roles set yet.'
  };
}

function buildMissingRoles(event) {
  const attending = getResponses(event, 'attending');
  const requiredRoles = event.requiredRoles || {};
  const missingRoles = [];

  for (const [roleName, requiredCount] of Object.entries(requiredRoles)) {
    const needed = Number(requiredCount) || 0;

    if (needed <= 0) {
      continue;
    }

    const confirmedCount = attending.filter((response) => response.role === roleName).length;

    if (confirmedCount < needed) {
      missingRoles.push(`Missing ${needed - confirmedCount} ${roleName}`);
    }
  }

  console.log('[dashboard:missingRoles]', {
    eventId: event.id,
    guildId: event.guildId,
    requiredRoles,
    missingRoles
  });

  return missingRoles.length ? missingRoles.join('\n') : 'No missing roles.';
}

function buildDashboardPayload(event) {
  const attending = getResponses(event, 'attending');
  const maybe = getResponses(event, 'maybe');
  const unavailable = getResponses(event, 'unavailable');
  const coverage = checkRoleCoverage(event);
  const missingRolesText = buildMissingRoles(event);

  const embed = new EmbedBuilder()
    .setColor(event.locked ? 0x777777 : 0x5865f2)
    .setTitle(event.name)
    .setDescription(event.description || 'Staff can respond with the buttons below.')
    .addFields(
      {
        name: 'Event',
        value: [
          `Date: ${event.date}`,
          `Time: ${event.startTime || '?'}-${event.endTime || '?'}`,
          `Venue: ${event.venueName}`,
          `Status: ${event.locked ? 'Locked' : 'Open'}`
        ].join('\n')
      },
      {
        name: `Confirmed Staff (${attending.length})`,
        value: formatStaffList(attending, 'No confirmed staff yet.')
      },
      {
        name: `Maybe Staff (${maybe.length})`,
        value: formatStaffList(maybe, 'No maybe responses yet.')
      },
      {
        name: `Unavailable Staff (${unavailable.length})`,
        value: formatStaffList(unavailable, 'No unavailable responses yet.')
      },
      {
        name: 'Role Coverage',
        value: coverage.coverageText
      },
      {
        name: 'Missing Roles',
        value: missingRolesText
      }
    )
    .setFooter({ text: `VenueStaff Bot • Event ID ${event.id.slice(0, 8)}` })
    .setTimestamp(new Date(event.updatedAt || event.createdAt));

  const staffRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`event:attend:${event.id}`)
      .setLabel('I can attend')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(event.locked),
    new ButtonBuilder()
      .setCustomId(`event:unavailable:${event.id}`)
      .setLabel("I can't attend")
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(event.locked),
    new ButtonBuilder()
      .setCustomId(`event:maybe:${event.id}`)
      .setLabel('Maybe')
      .setEmoji('❔')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(event.locked),
    new ButtonBuilder()
      .setCustomId(`event:notes:${event.id}`)
      .setLabel('Add notes')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(event.locked)
  );

  const managerRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`event:edit:${event.id}`)
      .setLabel('Edit event')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`event:requirements:${event.id}`)
      .setLabel('Set required roles')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`event:lock:${event.id}`)
      .setLabel(event.locked ? 'Unlock schedule' : 'Lock schedule')
      .setStyle(ButtonStyle.Secondary)
  );

  const managerRowTwo = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`event:export:${event.id}`)
      .setLabel('Export CSV')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`event:reminders:${event.id}`)
      .setLabel('Send reminders')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`event:delete:${event.id}`)
      .setLabel('Delete event')
      .setStyle(ButtonStyle.Danger)
  );

  return {
    embeds: [embed],
    components: [staffRow, managerRow, managerRowTwo]
  };
}

async function updateDashboard(client, event, guildId) {
  if (!event) {
    return false;
  }

  if (!guildId || event.guildId !== guildId) {
    return false;
  }

  if (!event.channelId || !event.messageId) {
    return false;
  }

  const channel = await client.channels.fetch(event.channelId).catch(() => null);

  if (!channel?.messages) {
    return false;
  }

  const message = await channel.messages.fetch(event.messageId).catch(() => null);

  if (!message) {
    return false;
  }

  await message.edit(buildDashboardPayload(event));
  return true;
}

function buildStaffControls(event, userId) {
  const response = event.responses?.[userId] || {};

  const roleMenu = new StringSelectMenuBuilder()
    .setCustomId(`event:role:${event.id}`)
    .setPlaceholder('Choose your role')
    .addOptions(roleOptions.map((option) => new StringSelectMenuOptionBuilder()
      .setLabel(option.label)
      .setEmoji(option.emoji)
      .setValue(option.value)
      .setDefault(response.role === option.value)));

  const startMenu = new StringSelectMenuBuilder()
    .setCustomId(`event:start:${event.id}`)
    .setPlaceholder('Choose available start time')
    .addOptions(staffTimeOptions.map((time) => new StringSelectMenuOptionBuilder()
      .setLabel(time)
      .setValue(time)
      .setDefault(response.startTime === time)));

  const endMenu = new StringSelectMenuBuilder()
    .setCustomId(`event:end:${event.id}`)
    .setPlaceholder('Choose available end time')
    .addOptions(staffTimeOptions.map((time) => new StringSelectMenuOptionBuilder()
      .setLabel(time)
      .setValue(time)
      .setDefault(response.endTime === time)));

  return [
    new ActionRowBuilder().addComponents(roleMenu),
    new ActionRowBuilder().addComponents(startMenu),
    new ActionRowBuilder().addComponents(endMenu)
  ];
}

function buildNotesModal(event) {
  const modal = new ModalBuilder()
    .setCustomId(`event:notesModal:${event.id}`)
    .setTitle('Add staff notes');

  const notesInput = new TextInputBuilder()
    .setCustomId('notes')
    .setLabel('Optional notes')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(800)
    .setPlaceholder('Example: I may be 15 minutes late.');

  modal.addComponents(new ActionRowBuilder().addComponents(notesInput));
  return modal;
}

function buildEditEventModal(event) {
  const modal = new ModalBuilder()
    .setCustomId(`event:editModal:${event.id}`)
    .setTitle('Edit venue event');
  const descriptionInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(800);

  if (event.description) {
    descriptionInput.setValue(event.description);
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('eventName')
      .setLabel('Event name')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)
      .setValue(event.name || '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('eventDate')
      .setLabel('Date')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(40)
      .setValue(event.date || '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('eventTime')
      .setLabel('Start and end time')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(40)
      .setValue(`${event.startTime || ''} - ${event.endTime || ''}`.trim())),
    new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('venueName')
      .setLabel('Venue name')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)
      .setValue(event.venueName || '')),
    new ActionRowBuilder().addComponents(descriptionInput)
  );

  return modal;
}

function buildRequirementsModal(event) {
  const requiredRoles = normalizeRequiredRoles(event.requiredRoles);
  const modal = new ModalBuilder()
    .setCustomId(`event:requirementsModal:${event.id}`)
    .setTitle('Set required roles');

  const requirementsInput = new TextInputBuilder()
    .setCustomId('requirements')
    .setLabel('Required staff, one per line')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setValue(getRequiredRoleNames(event)
      .map((role) => `${role}: ${requiredRoles[role] ?? 0}`)
      .join('\n'));

  modal.addComponents(new ActionRowBuilder().addComponents(requirementsInput));

  return modal;
}

function getModalText(interaction, fieldId) {
  return interaction.fields.getTextInputValue(fieldId).trim();
}

async function handleCreateEventModal(interaction) {
  if (!isManager(interaction.member)) {
    await interaction.reply({
      content: 'Only venue owners or managers can create events.',
      ephemeral: true
    });
    return;
  }

  const timeRange = parseTimeRange(getModalText(interaction, 'eventTime'));
  const event = createEvent({
    guildId: interaction.guildId,
    guildName: interaction.guild?.name || null,
    channelId: interaction.channelId,
    messageId: null,
    createdBy: interaction.user.id,
    createdByName: interaction.member?.displayName || interaction.user.username,
    name: getModalText(interaction, 'eventName'),
    date: getModalText(interaction, 'eventDate'),
    startTime: timeRange.startTime,
    endTime: timeRange.endTime,
    venueName: getModalText(interaction, 'venueName'),
    description: getModalText(interaction, 'description')
  });

  const message = await interaction.reply({
    ...buildDashboardPayload(event),
    fetchReply: true
  });

  updateEventByIdAndGuild(event.id, interaction.guildId, {
    channelId: message.channelId,
    messageId: message.id
  });
}

function getEventForInteraction(interaction, eventId) {
  if (!interaction.guildId) {
    return null;
  }

  return getEventByIdAndGuild(eventId, interaction.guildId);
}

async function handleStaffButton(interaction, action, event) {
  if (event.locked) {
    await interaction.reply({
      content: 'This schedule is locked, so attendance changes are closed.',
      ephemeral: true
    });
    return;
  }

  const baseResponse = {
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username
  };

  if (action === 'attend') {
    const updatedEvent = upsertResponseByIdAndGuild(event.id, interaction.guildId, interaction.user.id, {
      ...baseResponse,
      status: 'attending'
    });

    await updateDashboard(interaction.client, updatedEvent, interaction.guildId);
    await interaction.reply({
      content: 'Marked as attending. Choose your role and available times.',
      components: buildStaffControls(updatedEvent, interaction.user.id),
      ephemeral: true
    });
    return;
  }

  if (action === 'maybe') {
    const updatedEvent = upsertResponseByIdAndGuild(event.id, interaction.guildId, interaction.user.id, {
      ...baseResponse,
      status: 'maybe'
    });

    await updateDashboard(interaction.client, updatedEvent, interaction.guildId);
    await interaction.reply({
      content: 'Marked as maybe. You can come back and change this any time before the schedule is locked.',
      ephemeral: true
    });
    return;
  }

  if (action === 'unavailable') {
    const updatedEvent = upsertResponseByIdAndGuild(event.id, interaction.guildId, interaction.user.id, {
      ...baseResponse,
      status: 'unavailable',
      role: null,
      startTime: null,
      endTime: null
    });

    await updateDashboard(interaction.client, updatedEvent, interaction.guildId);
    await interaction.reply({
      content: "Marked as can't attend. Thanks for updating the schedule.",
      ephemeral: true
    });
  }
}

async function handleManagerButton(interaction, action, event) {
  if (!isManager(interaction.member)) {
    await interaction.reply({
      content: 'Only venue owners or managers can use this control.',
      ephemeral: true
    });
    return;
  }

  if (action === 'edit') {
    await interaction.showModal(buildEditEventModal(event));
    return;
  }

  if (action === 'requirements') {
    await interaction.showModal(buildRequirementsModal(event));
    return;
  }

  if (action === 'lock') {
    const updatedEvent = updateEventByIdAndGuild(event.id, interaction.guildId, { locked: !event.locked });
    await updateDashboard(interaction.client, updatedEvent, interaction.guildId);
    await interaction.reply({
      content: updatedEvent.locked ? 'Schedule locked.' : 'Schedule unlocked.',
      ephemeral: true
    });
    return;
  }

  if (action === 'export') {
    const rows = [
      ['Event', 'Venue', 'Date', 'User', 'Status', 'Role', 'Start', 'End', 'Notes'],
      ...Object.values(event.responses || {}).map((response) => [
        event.name,
        event.venueName,
        event.date,
        response.displayName,
        response.status,
        response.role || '',
        response.startTime || '',
        response.endTime || '',
        response.notes || ''
      ])
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    const attachment = new AttachmentBuilder(Buffer.from(csv, 'utf8'), {
      name: `${event.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-staff.csv`
    });

    await interaction.reply({
      content: 'CSV export ready.',
      files: [attachment],
      ephemeral: true
    });
    return;
  }

  if (action === 'reminders') {
    await interaction.reply({
      content: `Staff reminder for **${event.name}** at **${event.venueName}**: please use the buttons on the dashboard to update your availability.`,
      allowedMentions: { parse: [] }
    });
    return;
  }

  if (action === 'delete') {
    deleteEventByIdAndGuild(event.id, interaction.guildId);
    await interaction.reply({
      content: 'Event deleted.',
      ephemeral: true
    });
    await interaction.message.delete().catch(() => null);
  }
}

async function handleSelectMenu(interaction, action, event) {
  if (event.locked) {
    await interaction.reply({
      content: 'This schedule is locked, so attendance changes are closed.',
      ephemeral: true
    });
    return;
  }

  const fieldByAction = {
    role: 'role',
    start: 'startTime',
    end: 'endTime'
  };
  const field = fieldByAction[action];

  if (!field) {
    return;
  }

  const updatedEvent = upsertResponseByIdAndGuild(event.id, interaction.guildId, interaction.user.id, {
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    status: 'attending',
    [field]: interaction.values[0]
  });

  await updateDashboard(interaction.client, updatedEvent, interaction.guildId);
  await interaction.update({
    content: 'Saved. Choose or adjust anything else you need.',
    components: buildStaffControls(updatedEvent, interaction.user.id)
  });
}

async function handleNotesModal(interaction, event) {
  if (event.locked) {
    await interaction.reply({
      content: 'This schedule is locked, so attendance changes are closed.',
      ephemeral: true
    });
    return;
  }

  const updatedEvent = upsertResponseByIdAndGuild(event.id, interaction.guildId, interaction.user.id, {
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    notes: getModalText(interaction, 'notes')
  });

  await updateDashboard(interaction.client, updatedEvent, interaction.guildId);
  await interaction.reply({
    content: 'Notes saved.',
    ephemeral: true
  });
}

async function handleEditEventModal(interaction, event) {
  if (!isManager(interaction.member)) {
    await interaction.reply({
      content: 'Only venue owners or managers can edit events.',
      ephemeral: true
    });
    return;
  }

  const timeRange = parseTimeRange(getModalText(interaction, 'eventTime'));
  const updatedEvent = updateEventByIdAndGuild(event.id, interaction.guildId, {
    name: getModalText(interaction, 'eventName'),
    date: getModalText(interaction, 'eventDate'),
    startTime: timeRange.startTime,
    endTime: timeRange.endTime,
    venueName: getModalText(interaction, 'venueName'),
    description: getModalText(interaction, 'description')
  });

  await updateDashboard(interaction.client, updatedEvent, interaction.guildId);
  await interaction.reply({
    content: 'Event updated.',
    ephemeral: true
  });
}

async function handleRequirementsModal(interaction, event) {
  if (!isManager(interaction.member)) {
    await interaction.reply({
      content: 'Only venue owners or managers can set required roles.',
      ephemeral: true
    });
    return;
  }

  const requirementsText = getModalText(interaction, 'requirements');
  const knownRoleNames = getRequiredRoleNames(event);
  const requiredRoles = Object.fromEntries(knownRoleNames.map((role) => [role, 0]));

  for (const line of requirementsText.split('\n')) {
    const match = line.trim().match(/^([^:]+):\s*(\d+)$/);

    if (!match) {
      continue;
    }

    const submittedRoleName = match[1].trim();
    const roleName = knownRoleNames.find((role) => role.toLowerCase() === submittedRoleName.toLowerCase())
      || submittedRoleName;

    if (!roleName) {
      continue;
    }

    requiredRoles[roleName] = Math.max(0, Number.parseInt(match[2], 10));
  }

  const updatedEvent = updateEventByIdAndGuild(event.id, interaction.guildId, { requiredRoles });

  if (!updatedEvent) {
    console.warn('[requiredRoles:saveFailed]', {
      eventId: event.id,
      guildId: interaction.guildId
    });
    await interaction.reply({
      content: 'Could not save required roles for this server event.',
      ephemeral: true
    });
    return;
  }

  const dashboardUpdated = await updateDashboard(interaction.client, updatedEvent, interaction.guildId);

  console.log('[requiredRoles:saved]', {
    eventId: event.id,
    guildId: interaction.guildId,
    guildName: interaction.guild?.name || event.guildName || null,
    requiredRoles,
    dashboardUpdated
  });

  if (!dashboardUpdated) {
    console.warn('[requiredRoles:dashboardRefreshFailed]', {
      eventId: event.id,
      guildId: interaction.guildId,
      channelId: updatedEvent.channelId,
      messageId: updatedEvent.messageId
    });
  }

  await interaction.reply({
    content: 'Required roles updated.',
    ephemeral: true
  });
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
          return;
        }

        await command.execute(interaction);
        return;
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId === 'event:create') {
          await handleCreateEventModal(interaction);
          return;
        }

        const [, action, eventId] = interaction.customId.split(':');
        const event = getEventForInteraction(interaction, eventId);

        if (!event) {
          await interaction.reply({
            content: 'This event could not be found.',
            ephemeral: true
          });
          return;
        }

        if (action === 'notesModal') {
          await handleNotesModal(interaction, event);
          return;
        }

        if (action === 'editModal') {
          await handleEditEventModal(interaction, event);
          return;
        }

        if (action === 'requirementsModal') {
          await handleRequirementsModal(interaction, event);
        }
        return;
      }

      if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const [, action, eventId] = interaction.customId.split(':');
        const event = getEventForInteraction(interaction, eventId);

        if (!event) {
          await interaction.reply({
            content: 'This event could not be found.',
            ephemeral: true
          });
          return;
        }

        if (interaction.isStringSelectMenu()) {
          await handleSelectMenu(interaction, action, event);
          return;
        }

        if (['attend', 'maybe', 'unavailable'].includes(action)) {
          await handleStaffButton(interaction, action, event);
          return;
        }

        if (action === 'notes') {
          if (event.locked) {
            await interaction.reply({
              content: 'This schedule is locked, so attendance changes are closed.',
              ephemeral: true
            });
            return;
          }

          await interaction.showModal(buildNotesModal(event));
          return;
        }

        await handleManagerButton(interaction, action, event);
      }
    } catch (error) {
      console.error(error);

      const response = {
        content: 'Something went wrong while handling that interaction.',
        ephemeral: true
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(response).catch(() => null);
      } else {
        await interaction.reply(response).catch(() => null);
      }
    }
  }
};
