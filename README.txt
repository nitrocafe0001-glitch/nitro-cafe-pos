NITRO CAFE — KITCHEN • LOUNGE
Restaurant POS with shared multi-device data

LOCAL START
1. Install Node.js 18 or newer.
2. Extract this ZIP.
3. Copy .env.example to .env.
4. Set POS_SHARED_PASSWORD to a private password of at least 8 characters.
5. Run: npm install
6. Run: npm start
7. Open http://localhost:3000

SHARED MULTI-DEVICE MODE
- The shop computer and every mobile phone must open the SAME hosted HTTPS website URL.
- Everyone signs in with the shared POS_SHARED_PASSWORD.
- Menu, prices, stock, bills, sales, expenses, customers, staff and settings are stored centrally on the server.
- Changes are checked/synchronized across signed-in devices about every 2 seconds.
- Do not run separate copies on each device. One running hosted server is the shared source of truth.
- For public hosting, use HTTPS and configure POS_SHARED_PASSWORD in the host's environment variables.
- Configure DATA_DIR to a persistent disk/folder on the hosting provider. The JSON database is stored as nitro-shared-data.json there. Without persistent storage, some hosting providers may erase data during redeploy/restart.
- Back up nitro-shared-data.json regularly and also use Export backup JSON in Settings.

IMPORTANT FIRST START / DATA MIGRATION
On the first sign-in only, if the server has no shared database yet, this browser's existing local POS data is uploaded as the starting shared data. Sign in first from the computer/browser that currently has the correct latest menu and sales. Other devices then download that same shared data.

SALES MANAGEMENT
- Normal billing, kitchen and reports screens do not show a sale delete button.
- Use the separate Sales Management page to edit a sale's customer name, total and payment method, or delete a sale.
- Deleting requires two confirmations. Deleted sales are removed from the shared database and cannot be restored unless you have a backup.
- Keep access to the shared password limited to trusted staff. This version uses one shared login password, not individual named accounts or role-based permissions.

MENU PHOTOS
All 37 default menu items include bundled photographs in assets/menu/. Custom photos can be uploaded or linked from Menu Management.

WHATSAPP
WhatsApp sending still requires your own Meta Cloud API credentials and approved templates in the server .env file. Keep tokens private.

NOTES
The server-side JSON database is suitable for a small shop deployment with persistent storage. For higher concurrency, multiple branches, per-user permissions or stronger audit history, use a managed database and individual accounts.


DEPLOYMENT WARNING — NETLIFY
This project runs an Express/Node.js server (server.js) and writes its shared database to a persistent filesystem folder.
A normal Netlify ZIP/static-site upload does NOT run server.js and does NOT provide this project's persistent disk.
Do not upload this ZIP as a normal static site expecting shared login, billing APIs or shared sales to work.
Deploy the Node.js app to a host that supports a persistent disk (for example, Render with a Persistent Disk), then set:
- POS_SHARED_PASSWORD: your private password (8+ characters)
- DATA_DIR: the mounted persistent disk path (on Render, for example /var/data)
- PORT: supplied automatically by the host; do not hardcode it
Also enable HTTPS. After deployment, all devices must use the same deployed URL.

RENDER QUICK SETUP
1. Create a new Web Service from this project repository (upload the extracted folder to a Git repository first).
2. Runtime: Node. Build command: npm install. Start command: npm start.
3. Add a Persistent Disk and mount it at /var/data.
4. Add environment variables POS_SHARED_PASSWORD and DATA_DIR=/var/data.
5. Deploy and open the HTTPS URL. Log in from the shop computer first so it initializes the shared database, then sign in on other devices.
6. Before switching from an existing shop database, use Settings > Export backup JSON and keep a safe copy.

SECURITY
- Never upload or commit .env. Use the hosting provider's private Environment Variables panel.
- The .env.example file contains placeholders only.
- Change/rotate any password or API token that may have been included in a ZIP shared outside your own computer.
- This build uses one shared password for all staff; it does not provide individual accounts or role-based permissions.
