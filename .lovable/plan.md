# Offline Excel rates import fix

## Result
The downloaded desktop app will read Vyapar Excel and CSV files locally, without login or internet, then update the saved rate list.

## Changes
- Reuse the existing Vyapar column detection for `Item Name`, `Sale Price`, unit, and stock inside the offline app.
- Replace the current “Excel sync band hai” response with local `.xlsx`, `.xls`, and `.csv` parsing.
- Preserve existing products and custom prices; only insert new products or update matching product rates and stock.
- Rebuild and package the Windows ZIP with the existing one-time installer.

## Checks
- Import a sample Excel file in the desktop build.
- Confirm product counts and sync results update.
- Confirm the app still opens directly without login.
