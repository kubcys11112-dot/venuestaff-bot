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
  deleteEvent,
  getEvent,
  updateEvent,
  upsertResponse
} = require('../database');
const { isManager } = require('../commands/event');

const roleOptions = [
  { label: 'Security', emoji: '🛡️', value: 'Security' },
  { label: 'Bartender', emoji: '🍸', value: 'Bartender' },
  { label: 'Dancer', emoji: '💃', value: 'Dancer' },
  { label: 'DJ', emoji: '🎧', value: 'DJ' },
  { label: 'Greeter', emoji: '👋', value: 'Greeter' },
  { label: 'Photographer', emoji: '📸', value: 'Photographer' },
  { label: 'Host', emoji: '⭐', value: 'Host' },
  { label: 'Other', emoji: '⚙️', value: 'Other' }
];

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
  const requiredRoles = event.requiredRoles || {};
  const eventStart = event.startTime;
  const eventEnd = normalizeEndMinutes(eventStart, event.endTime);
  const coverageLines = [];
  const warningLines = [];

  for (const [role, requiredCount] of Object.entries(requiredRoles)) {
    const needed = Number(requiredCount) || 0;

    if (needed <= 0) {
      continue;
    }

    const staffForRole = attending.filter((response) => response.role === role);
    const count = staffForRole.length;
    coverageLines.push(`${getRoleEmoji(role)} ${role}: ${count}/${needed}`);

    if (count < needed) {
      warningLines.push(`Missing ${needed - count} ${role}`);
      continue;
    }

    if (eventEnd !== null && staffForRole.length > 0) {
      const availableAtEnd = staffForRole.filter((response) => {
        const responseEnd = normalizeEndMinutes(eventStart, response.endTime || event.endTime);
        return responseEnd === null || responseEnd >= eventEnd;
      });

      if (availableAtEnd.length < needed) {
        const earliestShortEnd = Math.min(
          ...staffForRole
            .map((response) => normalizeEndMinutes(eventStart, response.endTime || event.endTime))
            .filter((minutes) => minutes !== null && minutes < eventEnd)
        );

        warningLines.push(`Missing ${needed - availableAtEnd.length} ${role} after ${formatMinutes(earliestShortEnd)}`);
        continue;
      }
    }

    warningLines.push(`${role} coverage full`);
  }

  return {
    coverageText: coverageLines.length ? coverageLines.join('\n') : 'No required roles set yet.',
    warningText: warningLines.length ? warningLines.join('\n') : 'No coverage warnings.'
  };
}

function buildDashboardPayload(event) {
  const attending = getResponses(event, 'attending');
  const maybe = getResponses(event, 'maybe');
  const unavailable = getResponses(event, 'unavailable');
  const coverage = checkRoleCoverage(event);

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
        value: coverage.warningText
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

async function updateDashboard(client, event) {
  if (!event.channelId || !event.messageId) {
    return;
  }

  const channel = await client.channels.fetch(event.channelId).catch(() => null);

  if (!channel?.messages) {
    return;
  }

  const message = await channel.messages.fetch(event.messageId).catch(() => null);

  if (!message) {
    return;
  }

  await message.edit(buildDashboardPayload(event));
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
  const requiredRoles = event.requiredRoles || {};
  const modal = new ModalBuilder()
    .setCustomId(`event:requirementsModal:${event.id}`)
    .setTitle('Set required roles');

  for (const role of ['Security', 'Bartender', 'Dancer', 'DJ']) {
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId(role)
      .setLabel(`${role} needed`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(2)
      .setValue(String(requiredRoles[role] ?? 0))));
  }

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

  updateEvent(event.id, {
    channelId: message.channelId,
    messageId: message.id
  });
}

function getEventForInteraction(interaction, eventId) {
  const event = getEvent(eventId);

  if (!event) {
    return null;
  }

  if (event.guildId !== interaction.guildId) {
    return null;
  }

  return event;
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
    const updatedEvent = upsertResponse(event.id, interaction.user.id, {
      ...baseResponse,
      status: 'attending'
    });

    await updateDashboard(interaction.client, updatedEvent);
    await interaction.reply({
      content: 'Marked as attending. Choose your role and available times.',
      components: buildStaffControls(updatedEvent, interaction.user.id),
      ephemeral: true
    });
    return;
  }

  if (action === 'maybe') {
    const updatedEvent = upsertResponse(event.id, interaction.user.id, {
      ...baseResponse,
      status: 'maybe'
    });

    await updateDashboard(interaction.client, updatedEvent);
    await interaction.reply({
      content: 'Marked as maybe. You can come back and change this any time before the schedule is locked.',
      ephemeral: true
    });
    return;
  }

  if (action === 'unavailable') {
    const updatedEvent = upsertResponse(event.id, interaction.user.id, {
      ...baseResponse,
      status: 'unavailable',
      role: null,
      startTime: null,
      endTime: null
    });

    await updateDashboard(interaction.client, updatedEvent);
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
    const updatedEvent = updateEvent(event.id, { locked: !event.locked });
    await updateDashboard(interaction.client, updatedEvent);
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
    deleteEvent(event.id);
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

  const updatedEvent = upsertResponse(event.id, interaction.user.id, {
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    status: 'attending',
    [field]: interaction.values[0]
  });

  await updateDashboard(interaction.client, updatedEvent);
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

  const updatedEvent = upsertResponse(event.id, interaction.user.id, {
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    notes: getModalText(interaction, 'notes')
  });

  await updateDashboard(interaction.client, updatedEvent);
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
  const updatedEvent = updateEvent(event.id, {
    name: getModalText(interaction, 'eventName'),
    date: getModalText(interaction, 'eventDate'),
    startTime: timeRange.startTime,
    endTime: timeRange.endTime,
    venueName: getModalText(interaction, 'venueName'),
    description: getModalText(interaction, 'description')
  });

  await updateDashboard(interaction.client, updatedEvent);
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

  const requiredRoles = {};

  for (const role of ['Security', 'Bartender', 'Dancer', 'DJ']) {
    const value = Number.parseInt(getModalText(interaction, role), 10);
    requiredRoles[role] = Number.isNaN(value) ? 0 : Math.max(0, value);
  }

  const updatedEvent = updateEvent(event.id, { requiredRoles });
  await updateDashboard(interaction.client, updatedEvent);
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
