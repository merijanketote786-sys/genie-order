# Attendance & Labour Salary (POS Settings ka advanced feature)

## Kya banega
1. **POS Settings → Attendance section**
   - Feature ON/OFF switch.
   - **Biometric machines**: machine add karein (name, type: Wi-Fi/LAN ya USB).
     - Wi-Fi/LAN machines (ZKTeco, Hikvision, Anviz waghera jo ADMS/Cloud push support karti hain): har machine ko apna secret link milega jo machine ki "Cloud Server" setting me daala jayega — punches khud aate rahenge.
     - USB / offline machines: machine se nikali hui Excel/CSV/TXT file upload — columns (Biometric ID, Date, Time) khud pehchane jayenge, mapping edit ho sakti hai.
   - **Expenses se connect**: ON/OFF switch. ON ho to salary pay karne par POS Expenses me "Salary" entry khud ban jayegi (accounting usi se chalti hai).
2. **Labour list** (multiple labour add/edit/deactivate)
   - Name, phone, Biometric ID / card no.
   - Salary type per labour: Daily wage, Weekly, Monthly.
   - Rate, Full-day hours, Half-day hours limit, paid leaves allowed, overtime rate (optional).
   - Per-labour "Expenses me post karein" ON/OFF.
3. **Mark attendance popup** — Dashboard aur POS side menu dono me "Attendance" button.
   - Date chunein, har labour ke saath: Present (Full day) / Half day / Leave / Absent, in/out time optional.
   - Ek click me "Sab ko Present" bhi.
4. **Attendance & Salary page**
   - Period (week/month) chunein → har labour ki days, half days, leaves, absents, earned salary, advance/paid, baqaya — live count.
   - "Pay salary" → payment record + (agar connect ON) Expenses entry.
   - Advance dena bhi record ho sakega aur salary me se katega.

## Salary formula
- Daily: (Full days × rate) + (Half days × rate/2) + paid leaves × rate.
- Weekly / Monthly: rate ÷ working days of period → per-day rate, phir upar wala hi hisaab; un-paid absents katenge.
- Net = Earned − advances − already paid.

## Ahem baat
"Dunya ki har machine" ka matlab: jo machine cloud push (ADMS/ICLock) karti hai wo live judegi; baqi har machine file export se judegi. Koi aisi machine jo na push kare na file de, us ka data nahi aa sakta.

## Technical details
- New tables: att_devices (token), att_labour, att_punches, att_days (status per date), att_payments; RLS by workspace + `pos_can('settings')` for config, GRANTs included.
- Public route `src/routes/api/public/attendance/iclock/*` implementing ZKTeco ADMS protocol (`/iclock/cdata`, `/iclock/getrequest`), device identified by serial + token.
- Punches → daily status via first/last punch vs labour hours.
- Salary payment calls existing expense save (category "Salary") only when workspace + labour toggle are ON; idempotent via client_ref.
- Permission tick `attendance` added to POS feature access.
