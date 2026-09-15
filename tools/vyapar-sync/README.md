# Vyapar → OrderBot auto rate sync (Windows)

Do tareeqe hain rates update karne ke:

1. **App me upload (asaan)** — Rates page kholein, "Vyapar rates update" card me Vyapar ki export
   ki hui Excel/CSV file choose karein aur "Rates update karein" dabayein. Bas.
2. **Computer par auto-sync (ye script)** — file export hone ke baad khud app par bhej de.

## Auto-sync setup

1. Vyapar me: Reports → Item / Stock Summary → Export to Excel. File hamesha ek hi folder me
   save karein, maslan `C:\VyaparExport`.
2. Is folder ki `vyapar-sync.ps1` file apne computer par copy karein.
3. PowerShell kholein aur ek baar test karein:

```powershell
.\vyapar-sync.ps1 -Folder "C:\VyaparExport" -ApiKey "<aapki sync key>"
```

Kaamyab hone par kitne products naye aaye aur kitne update hue, dikh jayega.

## Roz khud chalane ke liye (Task Scheduler)

1. Windows me "Task Scheduler" kholein → Create Basic Task.
2. Trigger: Daily (ya har ghanta).
3. Action: Start a program
   - Program: `powershell.exe`
   - Arguments:
     `-ExecutionPolicy Bypass -File "C:\VyaparExport\vyapar-sync.ps1" -Folder "C:\VyaparExport" -ApiKey "<aapki sync key>"`

## Zaroori baatein

- Sync key sirf aapke computer par rehti hai — app ya website me kahin save nahi hoti.
- Sync sirf product ka naam, unit, sale price aur stock update karta hai.
- Koi product kabhi delete nahi hota.
- Aapki manually customize ki hui prices (Rates page → Price Customize) sync se kabhi
  overwrite nahi hotin.
- 100g / 250g / 500g staff rates khud ba khud maujooda rules se ban jate hain.
- Endpoint: `https://orderbot.hbchemicalspakistan.com/api/public/sync/products` (header `x-api-key`).
