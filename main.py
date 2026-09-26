import os
import asyncio
import threading
from flask import Flask
import discord
from discord import app_commands
from discord.ext import commands

# ==========================================
# 1. WEB SERVER FOR RENDER (Gunicorn Hook)
# ==========================================
app = Flask(__name__)

@app.route('/')
def home():
    return "Leave Bot Status: Online 24/7", 200

# ==========================================
# 2. DISCORD BOT SETUP
# ==========================================
intents = discord.Intents.default()
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)
log_channel_id = None

# --- Modal (แบบฟอร์มแจ้งลา) ---
class LeaveModal(discord.ui.Modal, title='แบบฟอร์มแจ้งลา'):
    ic_name = discord.ui.TextInput(
        label='ชื่อ IC (พร้อมยศ/ตำแหน่ง)',
        placeholder='เช่น Koby_Brown (พี่นัท) [รองบอส]',
        style=discord.TextStyle.short,
        required=True
    )
    reason = discord.ui.TextInput(
        label='สาเหตุการลา',
        placeholder='เช่น ติดเรียน / ไปต่างจังหวัด / ป่วย',
        style=discord.TextStyle.long,
        required=True
    )
    duration = discord.ui.TextInput(
        label='ระยะเวลาที่ลา (วันเริ่ม - วันสิ้นสุด)',
        placeholder='เช่น 26/09/69 - 28/09/69',
        style=discord.TextStyle.short,
        required=True
    )

    async def on_submit(self, interaction: discord.Interaction):
        global log_channel_id
        if not log_channel_id:
            await interaction.response.send_message(
                "❌ ยังไม่ได้ตั้งค่าห้อง Log! กรุณาให้ Admin พิมพ์ `/log` ก่อนครับ",
                ephemeral=True
            )
            return

        target_channel = interaction.guild.get_channel(log_channel_id)
        if target_channel:
            embed = discord.Embed(
                title="📌 รายงานการแจ้งลาออนไลน์",
                color=discord.Color.red()
            )
            if interaction.user.avatar:
                embed.set_thumbnail(url=interaction.user.avatar.url)

            embed.add_field(name="👤 ผู้แจ้งลา", value=f"{interaction.user.mention}", inline=True)
            embed.add_field(name="🆔 ชื่อ IC / ยศ", value=f"```\n{self.ic_name.value}\n```", inline=False)
            embed.add_field(name="📅 ระยะเวลาที่ขอลา", value=f"```\n{self.duration.value}\n```", inline=False)
            embed.add_field(name="💬 สาเหตุการลา", value=f"```\n{self.reason.value}\n```", inline=False)
            embed.set_footer(text=f"Discord ID: {interaction.user.id}")

            await target_channel.send(embed=embed)
            await interaction.response.send_message("✅ ยื่นใบลาเรียบร้อยแล้วครับ", ephemeral=True)
        else:
            await interaction.response.send_message("❌ ไม่พบห้อง Log กรุณาตั้งค่าด้วย `/log` ใหม่", ephemeral=True)

# --- ปุ่มกด ---
class LeaveView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label='ยื่นเรื่องแจ้งลา', style=discord.ButtonStyle.primary, emoji='📩', custom_id='btn_leave_modal')
    async def leave_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(LeaveModal())

@bot.event
async def on_ready():
    print(f"✅ DISCORD BOT ONLINE: {bot.user.name}")
    try:
        synced = await bot.tree.sync()
        print(f"✅ Synced {len(synced)} Slash Commands")
    except Exception as e:
        print(f"❌ Failed to sync commands: {e}")

@bot.tree.command(name="setup", description="สร้างปุ่มสำหรับยื่นเรื่องแจ้งลาออนไลน์ (Admin)")
@app_commands.checks.has_permissions(administrator=True)
async def setup(interaction: discord.Interaction):
    embed = discord.Embed(
        title="📝 ระบบแจ้งลาออนไลน์",
        description="กรุณากดปุ่ม **\"ยื่นเรื่องแจ้งลา\"** ด้านล่างเพื่อกรอกชื่อ IC และสาเหตุการลาครับ",
        color=discord.Color.from_rgb(43, 45, 49)
    )
    embed.set_footer(text="AWAYG Leave System")
    await interaction.response.send_message("✅ สร้างระบบแจ้งลาเรียบร้อยแล้วครับ", ephemeral=True)
    await interaction.channel.send(embed=embed, view=LeaveView())

@bot.tree.command(name="log", description="เซ็ทห้องนี้ให้เป็นห้องส่ง Log การแจ้งลา (Admin)")
@app_commands.checks.has_permissions(administrator=True)
async def log(interaction: discord.Interaction):
    global log_channel_id
    log_channel_id = interaction.channel_id
    await interaction.response.send_message(
        f"✅ ตั้งค่าให้ห้อง {interaction.channel.mention} เป็นห้องส่ง **Log การแจ้งลา** เรียบร้อยแล้ว!",
        ephemeral=True
    )

# ==========================================
# 3. RUN BOT IN BACKGROUND THREAD
# ==========================================
def start_discord_bot():
    token = os.environ.get('DISCORD_TOKEN')
    if token:
        # สร้าง Loop ใหม่สำหรับ Background Thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(bot.start(token))
    else:
        print("❌ [ERROR] Missing DISCORD_TOKEN variable")

# เริ่มรัน Discord Bot ทันทีที่โหลดไฟล์
threading.Thread(target=start_discord_bot, daemon=True).start()

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port)
