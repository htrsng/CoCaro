<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e221398c-c318-4f6c-aa6f-be85fdc8611a

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Play with friends on other devices

- Start the app on the host machine with `npm run dev`
- In-game, click **Invite Friend** to copy a shareable room link
- Send that link to your friend (Windows/Mac/Linux/phone all work)
- Make sure both devices are on the same network (LAN/Wi-Fi), and allow Node.js through firewall when prompted
- Friend opens the copied link and joins the same room automatically

### If your friend is on a different network

`192.168.x.x` / `10.x.x.x` links are private LAN IPs, so users outside your Wi-Fi will get timeout.

You can now paste and save this directly in-game (Public URL input near "Share this link").

Set a public URL before starting the app:

```bash
# Windows PowerShell
$env:PUBLIC_BASE_URL="https://your-public-domain-or-tunnel"
npm run dev
```

When `PUBLIC_BASE_URL` is set, **Invite Friend** will copy that public link first.
