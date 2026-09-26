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

// --- 1. Web Server สำหรับ Keep-Alive บน Render ---
const app = express();
app.get('/', (req, res) => res.send('Leave Bot Status: Online 24/7'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Keep-alive server is running on port ${PORT}`));

// --- 2. ตั้งค่า Discord Client ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// เก็บ ID ห้อง Log แบบ In-Memory (ชั่วคราว)
let logChannelId = null;

// --- 3. นิยามคำสั่ง Slash Commands (/setup และ /log) ---
const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('สร้างปุ่มสำหรับยื่นเรื่องแจ้งลาออนไลน์ (สำหรับ Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('log')
        .setDescription('ตั้งค่าให้ห้องนี้เป็นห้องส่ง Log การแจ้งลา (สำหรับ Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

// ลงทะเบียน Slash Commands เมื่อบอทพร้อมทำงาน
client.once(Events.ClientReady, async c => {
    console.log(`Logged in as ${c.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(c.user.id),
            { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

// --- 4. จัดการการใช้งาน Slash Commands & Interactions ---
client.on(Events.InteractionCreate, async interaction => {
    // ------------------- จัดการ Slash Commands -------------------
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // คำสั่ง /setup : สร้างปุ่มแจ้งลาในห้องปัจจุบัน
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

        // คำสั่ง /log : ตั้งค่าห้องปัจจุบันให้เป็นห้องส่ง Log
        if (commandName === 'log') {
            logChannelId = interaction.channelId;
            await interaction.reply({ 
                content: `✅ ตั้งค่าให้ห้อง ${interaction.channel} เป็นห้องส่ง **Log การแจ้งลา** เรียบร้อยแล้วครับ!`, 
                ephemeral: true 
            });
        }
    }

    // ------------------- จัดการปุ่มกด (Button) -------------------
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

    // ------------------- จัดการเมื่อกรอกแบบฟอร์มเสร็จ (Modal Submit) -------------------
    if (interaction.isModalSubmit() && interaction.customId === 'leave_modal_submit') {
        if (!logChannelId) {
            return await interaction.reply({ 
                content: '❌ ยังไม่มีการตั้งค่าห้อง Log! กรุณาให้ Admin ใช้คำสั่ง `/log` ในห้องที่ต้องการรับ Log ก่อนครับ', 
                ephemeral: true 
            });
        }

        const icName = interaction.fields.getTextInputValue('leave_ic_name');
        const reason = interaction.fields.getTextInputValue('leave_reason');
        const duration = interaction.fields.getTextInputValue('leave_duration');

        // สร้าง Embed สวยๆ สำหรับส่งเข้าห้อง Log
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
            await interaction.reply({ content: '✅ ยื่นใบลาเรียบร้อยแล้วครับ ระบบได้ส่งข้อมูลเข้าห้อง Log แล้ว', ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ หาห้อง Log ไม่พบ กรุณาใช้คำสั่ง `/log` ใหม่ในห้องที่ต้องการส่ง Log', ephemeral: true });
        }
    }
});

// อ่านค่า Bot Token จาก Environment Variable บน Render
client.login(process.env.DISCORD_TOKEN);
