const {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

function isManager(member) {
  if (!member) {
    return false;
  }

  return member.permissions?.has([
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild
  ]) || false;
}

function createEventModal() {
  const modal = new ModalBuilder()
    .setCustomId('event:create')
    .setTitle('Create venue event');

  const eventNameInput = new TextInputBuilder()
    .setCustomId('eventName')
    .setLabel('Event name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder('Starlight Lounge Friday Night');

  const dateInput = new TextInputBuilder()
    .setCustomId('eventDate')
    .setLabel('Date')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(40)
    .setPlaceholder('2026-07-18');

  const timeInput = new TextInputBuilder()
    .setCustomId('eventTime')
    .setLabel('Start and end time')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(40)
    .setPlaceholder('21:00 - 01:00');

  const venueInput = new TextInputBuilder()
    .setCustomId('venueName')
    .setLabel('Venue name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder('The Velvet Carbuncle');

  const descriptionInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(800)
    .setPlaceholder('Theme, dress code, special performers, or staff notes.');

  modal.addComponents(
    new ActionRowBuilder().addComponents(eventNameInput),
    new ActionRowBuilder().addComponents(dateInput),
    new ActionRowBuilder().addComponents(timeInput),
    new ActionRowBuilder().addComponents(venueInput),
    new ActionRowBuilder().addComponents(descriptionInput)
  );

  return modal;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Create and manage venue staff events.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) => subcommand
      .setName('create')
      .setDescription('Create a new staff signup dashboard.')),

  isManager,

  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'create') {
      await interaction.reply({
        content: 'That event action is not available yet.',
        ephemeral: true
      });
      return;
    }

    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Events can only be created inside a Discord server.',
        ephemeral: true
      });
      return;
    }

    if (!isManager(interaction.member)) {
      await interaction.reply({
        content: 'Only venue owners or managers can create events.',
        ephemeral: true
      });
      return;
    }

    await interaction.showModal(createEventModal());
  }
};
