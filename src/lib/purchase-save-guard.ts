/** Orders do not move stock; all actual purchase saves share these checks. */
export function purchaseSaveError(docType: string, allStores: boolean, paid: number, total: number, hasParty: boolean): string | null {
  if (docType === "order") return null;
  if (allStores) return "Select a specific store before saving a purchase";
  if (paid < total && !hasParty) return "Select a party for a credit purchase";
  return null;
}