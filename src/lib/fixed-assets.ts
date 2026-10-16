import { z } from "zod";

export const ASSET_CATEGORIES = ["Machinery", "Furniture", "Computers", "Laptops", "Vehicles", "Equipment", "Buildings", "Other"];
export const assetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Enter an asset name").max(160),
  category: z.string().trim().min(1, "Enter a category").max(80),
  quantity: z.number().finite().positive("Quantity must be greater than zero").max(1e9),
  purchase_cost: z.number().finite().min(0, "Cost cannot be negative").max(1e12),
  purchase_date: z.iso.date().nullable(),
  serial_number: z.string().trim().max(160),
  location: z.string().trim().max(200),
  notes: z.string().trim().max(2000),
  status: z.enum(["active", "repair", "retired", "archived"]),
});
export type FixedAsset = z.infer<typeof assetSchema>;
export const assetTotal = (a: Pick<FixedAsset, "quantity" | "purchase_cost">) => Math.round(a.quantity * a.purchase_cost * 100) / 100;
export const blankAsset = (): FixedAsset => ({ id: crypto.randomUUID(), name: "", category: "Other", quantity: 1, purchase_cost: 0, purchase_date: null, serial_number: "", location: "", notes: "", status: "active" });