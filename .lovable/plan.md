# OrderBot ko Lovable se Localhost (apne PC) pe chalane ka tareeqa

Aap ka project standard Vite + React (TanStack Start) code hai — poori tarah portable hai. Backend (database, login, data) abhi Lovable Cloud pe hosted hai; local machine pe frontend chala kar usi backend se connect kiya ja sakta hai.

## Step 1: Code apne PC pe laina (2 tareeqay)

**Tareeqa A — GitHub (recommended, free):**
1. Lovable me **Project settings → Git → GitHub** se repo connect karein.
2. Apne PC pe repo clone karein:
   ```bash
   git clone <aap-ka-repo-url>
   cd <repo-folder>
   ```

**Tareeqa B — Direct zip (paid plans):**
- Code editor me file tree ke bottom pe **Download codebase**, ya Project settings → Git → Download codebase.
- Zip unzip kar ke folder kholein.

## Step 2: Zaroori software install karein (sirf pehli dafa)

- **Node.js 20+** — nodejs.org se download karein (npm sath aata hai).
- Ya bun bun.sh se (project bun.lock rakhta hai, dono chalenge).

## Step 3: Localhost pe chalana

Project folder me terminal/CMD kholein:

```bash
npm install      # dependencies download (pehli dafa, 2-5 minute)
npm run dev      # server start
```

Browser me kholein: **http://localhost:8080** — poora OrderBot (Order, Invoice, Extract, Rates, Calculator, Admin) waisa hi chalega jaisa preview me chalta hai.

`.env` file code ke sath aati hai (Lovable ke sath GitHub sync / zip me included) — isme backend URL aur key already set hai, is liye database aur login wala data cloud se hi connect hoga. Kuch change karne ki zaroorat nahi.

## Step 4 (optional): Backend bhi apne pas rakhna

Abhi ka setup: frontend aap ke PC pe, data (orders, customers, invoices, users) Lovable Cloud pe. Agar backend bhi shift karna ho:

- **Cloud → Advanced settings → Export data** se apni database ka export le sakte hain.
- Phir apna Supabase (managed ya self-hosted) setup kar ke `.env` me uska URL/key dal kar migration karni hoti hai — ye bara step hai, zaroorat ho to alag se karwa lein.

## Zaroori baatein

- Localhost sirf **aap ke apne PC pe** chalta hai. Doosron ko dikhane ke liye published URL (genie-order.lovable.app / orderbot.hbchemicalspakistan.com) hi use hota rahega, ya Cloudflare Tunnel/ngrok lagana parta hai.
- Lovable ka editor aur AI assistant local code pe nahi chalega — wahan code VS Code jaise editor me khud edit karna hoga. Lovable project zinda rahega, dono sath chal sakte hain (GitHub sync se changes aapas me move hote rehte hain).
- Kisi bhi waqt `npm run dev` dobara chala kar app wapas on ho jayegi; aap ka saved data cloud me mehfooz rehta hai, local chalane se kuch delete nahi hota.

## Summary

1. GitHub sync ya Download codebase → code PC pe
2. Node.js install → `npm install` → `npm run dev` → http://localhost:8080
3. Backend data Lovable Cloud pe hi rahega (best/easiest); backend shift optional hai
