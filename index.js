require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require("discord.js");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, AudioPlayerStatus } = require("@discordjs/voice");
const ffmpegPath = require("ffmpeg-static");
process.env.FFMPEG_PATH = ffmpegPath;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
const sessions = new Map();

client.once("ready", async () => {
  console.log(`✅ Connecté : ${client.user.tag}`);
  const commands = [
    new SlashCommandBuilder()
      .setName("play")
      .setDescription("Joue une web radio")
      .addStringOption((o) => o.setName("lien").setDescription("URL du flux radio").setRequired(true)),
    new SlashCommandBuilder()
      .setName("stop")
      .setDescription("Arrête la radio"),
    new SlashCommandBuilder()
      .setName("247")
      .setDescription("Active/désactive le mode 24/7"),
  ].map((c) => c.toJSON());
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log("✅ Commandes enregistrées !");
});

function playStream(url, voiceChannel, guildId) {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });
  const player = createAudioPlayer();
  connection.subscribe(player);

  function startResource() {
    const resource = createAudioResource(url, { inputType: StreamType.Arbitrary });
    player.play(resource);
  }
  startResource();

  player.on(AudioPlayerStatus.Idle, () => {
    console.log("🔄 Reconnexion...");
    setTimeout(startResource, 3000);
  });
  player.on("error", (err) => {
    console.error("❌", err.message);
    setTimeout(startResource, 3000);
  });

  const session = sessions.get(guildId) || {};
  sessions.set(guildId, { ...session, connection, player, url, voiceChannel });
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guildId, member } = interaction;
  const voiceChannel = member?.voice?.channel;
  const session = sessions.get(guildId);

  if (commandName === "play") {
    if (!voiceChannel) {
      return interaction.reply({ content: "❌ Rejoins un salon vocal d'abord !", ephemeral: true });
    }
    const url = interaction.options.getString("lien");
    try { await interaction.reply(`📻 En train de jouer : **${url}**`); } catch (e) {}
    playStream(url, voiceChannel, guildId);
    return;
  }

  if (commandName === "stop") {
    if (!session) return interaction.reply("Aucune radio en cours.");
    session.player.stop(true);
    session.connection.destroy();
    sessions.delete(guildId);
    return interaction.reply("⏹️ Radio arrêtée.");
  }

  if (commandName === "247") {
    if (!session) return interaction.reply("❌ Lance d'abord une radio avec /play !");
    session.stay247 = !session.stay247;
    return interaction.reply(session.stay247 ? "✅ Mode 24/7 activé !" : "⏹️ Mode 24/7 désactivé");
  }
});

client.on("voiceStateUpdate", (oldState) => {
  const guildId = oldState.guild.id;
  const session = sessions.get(guildId);
  if (!session || session.stay247) return;
  const channel = oldState.guild.channels.cache.get(session.connection.joinConfig.channelId);
  const humans = channel?.members.filter((m) => !m.user.bot).size ?? 0;
  if (humans === 0) {
    session.player.stop(true);
    session.connection.destroy();
    sessions.delete(guildId);
    console.log("👋 Salon vide, bot déconnecté.");
  }
});

client.login(process.env.DISCORD_TOKEN);