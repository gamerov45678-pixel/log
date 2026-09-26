import os
import threading
from flask import Flask
import discord
from discord import app_commands
from discord.ext import commands

# ==========================================
# 1. WEB SERVER (สำหรับ Render Web Service)
# ==========================================
app = Flask('')

@app.route('/')
def home():
    return "Leave Bot Status: Web Service is Live and Running 24/7"

def run_web_server():
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port)

def keep_alive():
    t = threading.Thread(target=run_web_server)
    t.daemon = True
    t.start()

# ==========================================
# 2. DISCORD BOT SETUP
# ==========================================
intents = discord.Intents.default()
intents.guilds = True
intents.messages = True

bot = commands.Bot(command_prefix="!", intents=intents)

# ตัวแปรเก็บ ID ห้อง Log
log_channel_id = None


# --- Modal (แบบฟอร์มการแจ้งลา) ---
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
                "❌ ยังไม่ได้ตั้งค่าห้อง Log! กรุณาให้ Admin พิมพ์ `/log` ในห้องที่ต้องการรับ Log ก่อนครับ",
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

            embed.add_field(name="👤 ผู้แจ้งลา (Discord)", value=f"{interaction.user.mention}", inline=True)
            embed.add_field(name="🆔 ชื่อ IC / ยศ", value=f"```\n{self.ic_name.value}\n```", inline=False)
            embed.add_field(name="📅 ระยะเวลาที่ขอลา", value=f"```\n{self.duration.value}\n```", inline=False)
            embed.add_field(name="💬 สาเหตุการลา", value=f"```\n{self.reason.value}\n```", inline=False)
            embed.set_footer(text=f"Discord ID: {interaction.user.id}")

            await target_channel.send(embed=embed)
            await interaction.response.send_message(
                "✅ ยื่นใบลาเรียบร้อยแล้วครับ ข้อมูลถูกส่งเข้าห้อง Log แล้ว",
                ephemeral=True
            )
        else:
            await interaction.response.send_message(
                "❌ ไม่พบห้อง Log กรุณาใช้คำสั่ง `/log` ในห้องที่ต้องการใหม่อีกครั้ง",
                ephemeral=True
            )


# --- View ปุ่มกด ---
class LeaveView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)  # ปุ่มกดได้เรื่อยๆ ไม่มีวันหมดอายุ

    @discord.ui.button(label='ยื่นเรื่องแจ้งลา', style=discord.ButtonStyle.primary, emoji='📩', custom_id='btn_leave_modal')
    async def leave_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(LeaveModal())


# ==========================================
# 3. SLASH COMMANDS (/setup & /log)
# ==========================================
@bot.event
async def on_ready():
    print(f"========================================")
    print(f"✅ DISCORD BOT ONLINE: {bot.user.name} ({bot.user.id})")
    print(f"========================================")
    
    # Sync คำสั่ง Slash Commands เข้า Discord
    try:
        synced = await bot.tree.sync()
        print(f"✅ Synced {len(synced)} Slash Command(s)")
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
        f"✅ ตั้งค่าให้ห้อง {interaction.channel.mention} เป็นห้องส่ง **Log การแจ้งลา** เรียบร้อยแล้วครับ!",
        ephemeral=True
    )


# Handle Error กรณีไม่ใช่ Admin ใช้คำสั่ง
@setup.error
@log.error
async def admin_command_error(interaction: discord.Interaction, error: app_commands.AppCommandError):
    if isinstance(error, app_commands.MissingPermissions):
        await interaction.response.send_message("❌ คำสั่งนี้ใช้ได้เฉพาะ Admin เท่านั้นครับ", ephemeral=True)


# ==========================================
# 4. RUN BOT
# ==========================================
if __name__ == '__main__':
    # เปิด Web Server ก่อน
    keep_alive()

    TOKEN = os.environ.get('DISCORD_TOKEN')
    if not TOKEN:
        print("❌ [ERROR] ไม่พบค่า DISCORD_TOKEN ใน Environment Variables!")
    else:
        try:
            bot.run(TOKEN)
        except Exception as e:
            print(f"❌ [LOGIN FAILED] ไม่สามารถเชื่อมต่อบอทได้: {e}")
