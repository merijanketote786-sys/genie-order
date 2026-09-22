# Desktop app ka "Run" popup khatam karna

## Masla
Abhi app ek ZIP ke andar `.exe` file hai. Windows internet se download ki hui ZIP/exe par har dafa double-click par **"Open File – Security Warning" (Run?)** popup dikhata hai kyun ke file "internet wali" mark hoti hai (Mark of the Web). Ye popup tab tak aata rehta hai jab tak file unblock na ho ya app properly install na ho.

## Hal: proper Windows installer banana
Abhi kaam `electron-builder` se **NSIS installer** (Setup.exe) banane ka hai — ye Windows software ka standard tareeqa hai.

### Steps
1. `electron-builder` dev dependency add karna.
2. `package.json` me build config: appId `com.hbchemicals.workspace`, productName "HB Chemicals Pakistan Workspace", Windows target **NSIS**.
3. NSIS settings:
   - One-click installer (koi Next-Next wizard nahi), per-user install — admin rights ki zaroorat nahi.
   - Desktop + Start Menu shortcut khud ban jayega.
   - App Program Files (user) me install hogi — ab "Run?" popup **kabhi nahi aayega**.
4. Icon (`public/app-icon.png` se .ico) installer aur app dono par lagana.
5. Purana plain-exe ZIP hatana; naya artifact: **HB Chemicals Workspace Setup.exe** (+ chahein to saath me portable version bhi).

### Honest note
Pehli dafa install karte waqt Windows SmartScreen ek dafa "Windows protected your PC" dikha sakta hai (kyunki app code-signed nahi — signing certificate paid hota hai, ~$200+/saal). Us par **More info → Run anyway** ek hi dafa karna hoga; install ke baad har dafa app seedha khulega — koi Run popup nahi.

## Verify
- Build ke baad installer ka size/contents check.
- Final ZIP artifact user ko dena.

## Technical
- Tools: electron-builder (NSIS target), electron/main.cjs existing.
- No backend/code changes — sirf packaging.
