const { Client, Events, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

// --- إعدادات البوت ---
const DISCORD_TOKEN = "MTQ2MDMzNjU2NDI2NDc2NzY0MQ.GI5-eu.d6RQkdQ6UyfcdSCJpNxf9iBiI6h7Q5Eq78zwgI";
const API_BASE = "https://scriptblox.com/api";
const usedScripts = new Set();

// --- دوال الاتصال بموقع ScriptBlox ---
async function getScriptsPage(page = 1) {
    try {
        const response = await axios.get(`${API_BASE}/script/fetch?page=${page}&max=20`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return response.data?.result || response.data;
    } catch (error) {
        console.error(`Error fetching scripts page ${page}:`, error.message);
        return null;
    }
}

async function getScriptDetails(slug) {
    try {
        const response = await axios.get(`${API_BASE}/script/${slug}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return response.data?.result || response.data;
    } catch (error) {
        console.error(`Error fetching script details for ${slug}:`, error.message);
        return null;
    }
}

async function getRawScript(slug) {
    try {
        const response = await axios.get(`${API_BASE}/script/raw/${slug}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching raw script for ${slug}:`, error.message);
        return "";
    }
}

// --- دالة إرسال السكربت ---
async function sendRandomScript(target, client) {
    try {
        let selected = null;
        const randomPages = Array.from({ length: 5 }, () => Math.floor(Math.random() * 20) + 1);

        for (const page of randomPages) {
            const data = await getScriptsPage(page);
            if (data && data.scripts && data.scripts.length > 0) {
                const validScripts = data.scripts.filter(s =>
                    (s.views || 0) >= 1000 && !usedScripts.has(s.slug)
                );
                if (validScripts.length > 0) {
                    selected = validScripts[Math.floor(Math.random() * validScripts.length)];
                    break;
                }
            }
        }

        if (!selected) {
            const data = await getScriptsPage(1);
            if (data && data.scripts && data.scripts.length > 0) {
                selected = data.scripts.find(s => !usedScripts.has(s.slug)) || data.scripts[0];
            }
        }

        if (!selected) return;

        usedScripts.add(selected.slug);
        if (usedScripts.size > 100) {
            const firstAdded = usedScripts.values().next().value;
            usedScripts.delete(firstAdded);
        }

        const slug = selected.slug;
        const details = await getScriptDetails(slug);
        const scriptData = details?.script || selected;

        const title = scriptData.title || "Unknown";
        const gameName = scriptData.game?.name || "Unknown Map";
        const views = scriptData.views || 0;
        const keySystem = scriptData.keyLink ? "نعم يوجد مفتاح" : "لا لايوجد مفتاح";
        const imageUrl = scriptData.image;

        const rawScript = await getRawScript(slug);
        const finalImageUrl = imageUrl ? (imageUrl.startsWith('http') ? imageUrl : `https://scriptblox.com${imageUrl}`) : null;

        const embed = new EmbedBuilder()
            .setTitle(`📍 الماب: ${gameName}`)
            .addFields(
                { name: '📜 السكربت', value: title, inline: true },
                { name: '👁️ المشاهدات', value: views.toString(), inline: true },
                { name: '🔑 المفتاح', value: keySystem, inline: true }
            )
            .setColor(0x2B2D31);

        if (finalImageUrl) embed.setImage(finalImageUrl);

        if (rawScript && rawScript.length > 0) {
            if (rawScript.length > 1980) {
                const buffer = Buffer.from(rawScript, 'utf-8');
                await target.send({
                    content: "📄 الكود طويل جداً، تم إرفاقه كملف:",
                    embeds: [embed],
                    files: [{ attachment: buffer, name: `${slug}.lua` }]
                });
            } else {
                await target.send({
                    content: `\`${rawScript}\``,
                    embeds: [embed]
                });
            }
        } else {
            await target.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Error in sendRandomScript:', error.message);
    }
}

// --- إعداد أوامر Slash ---
const commands = [
    new SlashCommandBuilder()
        .setName('script')
        .setDescription('البحث عن سكربت عشوائي بمشاهدات +1000'),
    new SlashCommandBuilder()
        .setName('autonotif')
        .setDescription('تفعيل إرسال سكربت عشوائي كل 10 دقائق في هذه القناة')
].map(command => command.toJSON());

// --- تشغيل البوت ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

let autoNotifChannelId = null;
let autoNotifInterval = null;

client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully registered slash commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'script') {
        await interaction.deferReply();
        await sendRandomScript(interaction.channel, client);
        await interaction.editReply("✅ تم إرسال السكربت بنجاح.");
    }

    if (interaction.commandName === 'autonotif') {
        if (autoNotifInterval) clearInterval(autoNotifInterval);
        autoNotifChannelId = interaction.channelId;
        await interaction.reply(`✅ تم تفعيل الإرسال التلقائي كل 10 دقائق في هذه القناة.`);

        autoNotifInterval = setInterval(async () => {
            if (autoNotifChannelId) {
                const channel = await client.channels.fetch(autoNotifChannelId);
                if (channel && channel.isTextBased()) {
                    await sendRandomScript(channel, client);
                }
            }
        }, 10 * 60 * 1000);
    }
});

client.login(DISCORD_TOKEN);
