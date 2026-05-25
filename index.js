require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require("discord.js");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType } = require("@discordjs/voice");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Enregistre la commande /play
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

client.once("ready", async () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);

  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
    body: [
      new SlashCommandBuilder()
        .setName("play")
        .setDescription("Joue une web radio")
        .addStringOption((o) =>
          o.setName("lien").setDescription("Lien du flux radio (ex: http://...)").setRequired(true)
        )
        .toJSON(),
    ],
  });

  console.log("✅ Commande /play enregistrée");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "play") return;

  const voiceChannel = interaction.member?.voice?.channel;

  // Vérifie que l'utilisateur est dans un salon vocal
  if (!voiceChannel) {
    return interaction.reply({ content: "❌ Tu dois être dans un salon vocal !", ephemeral: true });
  }

  const lien = interaction.options.getString("lien");

  // Rejoins le salon et joue le flux
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guildId,
    adapterCreator: interaction.guild.voiceAdapterCreator,
  });

  const player = createAudioPlayer();
  const resource = createAudioResource(lien, { inputType: StreamType.Arbitrary });

  player.play(resource);
  connection.subscribe(player);

  player.on("error", (err) => {
    interaction.followUp("❌ Erreur avec ce lien radio.");
    console.error(err.message);
  });

  await interaction.reply(`✅ 📻 En train de jouer : ${lien}`);
});

client.login(process.env.DISCORD_TOKEN);
