const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    EmbedBuilder,
    Events,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits
} = require('discord.js');
const express = require('express');

// --- 1. Web Server สำหรับ Render Keep-Alive ---
const app = express();
app.get('/', (req, res) => res.send('Leave Bot Status: Online 24/7'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Keep-alive web server is running on port ${PORT}`));

// --- 2. สร้าง Discord Client ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// ตัวแปรเก็บ ID ห้อง Log ชั่วคราว
let logChannelId = null;

// --- 3. ลงทะเบียน Slash Commands (/setup และ /log) ---
const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('สร้างปุ่มสำหรับยื่นเรื่องแจ้งลาออนไลน์ ( Admin )')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('log')
        .setDescription('เซ็ทห้องนี้ให้เป็นห้องส่ง Log การแจ้งลา ( Admin )')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

// เมื่อบอทเชื่อมต่อ Discord สำเร็จ
client.once(Events.ClientReady, async c => {
    console.log(`========================================`);
    console.log(`✅ SUCCESS: Logged in as ${c.user.tag}`);
    console.log(`========================================`);

    const token = process.env.DISCORD_TOKEN;
    if (!token) {
        console.error('❌ ERROR: ไม่พบค่า DISCORD_TOKEN ใน Environment Variable!');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        console.log('🔄 กำลังลงทะเบียน Slash Commands (/setup, /log)...');
        await rest.put(
            Routes.applicationCommands(c.user.id),
            { body: commands }
        );
        console.log('✅ ลงทะเบียน Slash Commands เรียบร้อยแล้ว!');
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการลงทะเบียน Slash Commands:', error);
    }
});

// --- 4. จัดการการใช้งาน ปุ่มกด และ Slash Commands ---
client.on(Events.InteractionCreate, async interaction => {
    try {
        // ------------------- Slash Commands -------------------
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            // คำสั่ง /setup
            if (commandName === 'setup') {
                const embed = new EmbedBuilder()
                    .setTitle('📝 ระบบแจ้งลาออนไลน์')
                    .setDescription('กรุณากดปุ่ม **"ยื่นเรื่องแจ้งลา"** ด้านล่างเพื่อกรอกชื่อ IC และสาเหตุการลาครับ')
                    .setColor('#2B2D31')
                    .setFooter({ text: 'AWAYG Leave System' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_leave_modal')
                        .setLabel('ยื่นเรื่องแจ้งลา')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📩')
                );

                await interaction.reply({ content: '✅ สร้างระบบแจ้งลาเรียบร้อยแล้วครับ', ephemeral: true });
                await interaction.channel.send({ embeds: [embed], components: [row] });
            }

            // คำสั่ง /log
            if (commandName === 'log') {
                logChannelId = interaction.channelId;
                await interaction.reply({ 
                    content: `✅ ตั้งค่าให้ห้อง ${interaction.channel} เป็นห้องส่ง **Log การแจ้งลา** เรียบร้อยแล้วครับ!`, 
                    ephemeral: true 
                });
            }
        }

        // ------------------- ปุ่มกด (Button) -------------------
        if (interaction.isButton() && interaction.customId === 'btn_leave_modal') {
            const modal = new ModalBuilder()
                .setCustomId('leave_modal_submit')
                .setTitle('แบบฟอร์มแจ้งลา');

            const icNameInput = new TextInputBuilder()
                .setCustomId('leave_ic_name')
                .setLabel('ชื่อ IC (พร้อมยศ/ตำแหน่ง)')
                .setPlaceholder('เช่น Koby_Brown (พี่นัท) [รองบอส]')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const reasonInput = new TextInputBuilder()
                .setCustomId('leave_reason')
                .setLabel('สาเหตุการลา')
                .setPlaceholder('เช่น ติดเรียน / ไปต่างจังหวัด / ป่วย')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const durationInput = new TextInputBuilder()
                .setCustomId('leave_duration')
                .setLabel('ระยะเวลาที่ลา (วันเริ่ม - วันสิ้นสุด)')
                .setPlaceholder('เช่น 26/09/69 - 28/09/69')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(icNameInput),
                new ActionRowBuilder().addComponents(reasonInput),
                new ActionRowBuilder().addComponents(durationInput)
            );

            await interaction.showModal(modal);
        }

        // ------------------- ส่งแบบฟอร์ม (Modal Submit) -------------------
        if (interaction.isModalSubmit() && interaction.customId === 'leave_modal_submit') {
            if (!logChannelId) {
                return await interaction.reply({ 
                    content: '❌ ยังไม่ได้ตั้งค่าห้อง Log! กรุณาให้ Admin พิมพ์ `/log` ในห้องที่ต้องการรับ Log ก่อนครับ', 
                    ephemeral: true 
                });
            }

            const icName = interaction.fields.getTextInputValue('leave_ic_name');
            const reason = interaction.fields.getTextInputValue('leave_reason');
            const duration = interaction.fields.getTextInputValue('leave_duration');

            const logEmbed = new EmbedBuilder()
                .setTitle('📌 รายงานการแจ้งลาออนไลน์')
                .setColor('#E74C3C')
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: '👤 ผู้แจ้งลา (Discord)', value: `${interaction.user}`, inline: true },
                    { name: '🆔 ชื่อ IC / ยศ', value: `\`\`\`${icName}\`\`\``, inline: false },
                    { name: '📅 ระยะเวลาที่ขอลา', value: `\`\`\`${duration}\`\`\``, inline: false },
                    { name: '💬 สาเหตุการลา', value: `\`\`\`${reason}\`\`\``, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `Discord ID: ${interaction.user.id}` });

            const targetLogChannel = interaction.guild.channels.cache.get(logChannelId);
            if (targetLogChannel) {
                await targetLogChannel.send({ embeds: [logEmbed] });
                await interaction.reply({ content: '✅ ยื่นใบลาเรียบร้อยแล้วครับ ข้อมูลถูกส่งเข้าห้อง Log แล้ว', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ ไม่พบห้อง Log กรุณาใช้คำสั่ง `/log` ในห้องที่ต้องการใหม่อีกครั้ง', ephemeral: true });
            }
        }
    } catch (err) {
        console.error('Interaction Error:', err);
    }
});

// --- 5. ตรวจสอบการ Login ---
const BOT_TOKEN = process.env.DISCORD_TOKEN;

if (!BOT_TOKEN) {
    console.error('❌ [CRITICAL ERROR] ไม่พบค่า DISCORD_TOKEN ใน Environment Variables!');
    console.error('👉 กรุณาไปที่ Render.com -> Environment -> เพิ่ม Key: DISCORD_TOKEN แล้วใส่ Bot Token ลงไปครับ');
} else {
    client.login(BOT_TOKEN).catch(err => {
        console.error('❌ [LOGIN FAILED] ไม่สามารถล็อกอินเข้า Discord ได้:', err.message);
        console.error('👉 โปรดตรวจสอบว่า Token ถูกต้อง หรือ Reset Token ใน Discord Developer Portal ใหม่อีกครั้ง');
    });
}
