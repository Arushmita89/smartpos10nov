"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Database } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ConfirmationDialog from "@/components/ui/ConfirmationDialog";
import toast from "react-hot-toast";
import {
  Plus,
  Search,
  Package,
  RefreshCw,
  Trash2,
  AlertTriangle,
  X,
  Save,
  Pencil,
  Truck,
  BookOpen,
  History,
  ArrowDownToLine,
  ArrowUpFromLine,
  FileText,
  Download,
  Calendar,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type Restaurant = Database["public"]["Tables"]["parameters"]["Row"];
type Ingredient = Database["public"]["Tables"]["ingredients"]["Row"];
type StockMovement = Database["public"]["Tables"]["stock_movements"]["Row"];
type MenuItem = Database["public"]["Tables"]["menu"]["Row"];

interface RecipeRow {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  quantity_required: number;
}

type StockStatus = "critical" | "low" | "ok";

type ReportPeriod = "day" | "week" | "month" | "year";

interface ReportRow {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  costPerUnit: number | null;
  stockValue: number;
  consumed: number;
  restocked: number;
  wasted: number;
  status: StockStatus;
}

export const INVENTORY_CATEGORIES = [
  "Dairy",
  "Meat",
  "Vegetables",
  "Spices",
  "Beverages",
  "Packaging",
  "Other",
];

export const INVENTORY_UNITS = ["kg", "g", "L", "mL", "pcs", "bottles", "packs", "doz"];

const WASTE_REASONS = [
  "Spoilage",
  "Expired",
  "Damaged",
  "Over-production",
  "Quality",
  "Other",
];

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validUserId(id?: string | null): string | null {
  return id && UUID_REGEX.test(id) ? id : null;
}

function getStockStatus(ing: Ingredient): StockStatus {
  const stock = Number(ing.current_stock || 0);
  if (stock <= 0) return "critical";
  if (ing.critical_threshold > 0 && stock <= Number(ing.critical_threshold)) return "critical";
  if (ing.low_threshold > 0 && stock <= Number(ing.low_threshold)) return "low";
  return "ok";
}

const statusBadgeClasses: Record<StockStatus, { label: string; cls: string; dot: string }> = {
  critical: {
    label: "Critical",
    cls: "bg-red-100 text-red-700",
    dot: "bg-red-500",
  },
  low: {
    label: "Low",
    cls: "bg-yellow-100 text-yellow-700",
    dot: "bg-yellow-500",
  },
  ok: {
    label: "In Stock",
    cls: "bg-green-100 text-green-700",
    dot: "bg-green-500",
  },
};

interface IngredientModalProps {
  restaurantId: string;
  ingredient: Ingredient | null;
  onClose: () => void;
  onSaved: () => void;
}

function IngredientModal({ restaurantId, ingredient, onClose, onSaved }: IngredientModalProps) {
  const [name, setName] = useState(ingredient?.name || "");
  const [category, setCategory] = useState(ingredient?.category || "Other");
  const [unit, setUnit] = useState(ingredient?.unit || "kg");
  const [stock, setStock] = useState(String(ingredient?.current_stock ?? ""));
  const [reorder, setReorder] = useState(String(ingredient?.reorder_level ?? ""));
  const [low, setLow] = useState(String(ingredient?.low_threshold ?? ""));
  const [critical, setCritical] = useState(String(ingredient?.critical_threshold ?? ""));
  const [supplierName, setSupplierName] = useState(ingredient?.supplier_name || "");
  const [supplierContact, setSupplierContact] = useState(ingredient?.supplier_contact || "");
  const [cost, setCost] = useState(ingredient?.cost_per_unit != null ? String(ingredient.cost_per_unit) : "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Ingredient name is required");
      return;
    }
    setSubmitting(true);
    const body: any = {
      name: name.trim(),
      category,
      unit,
      reorder_level: parseFloat(reorder) || 0,
      low_threshold: parseFloat(low) || 0,
      critical_threshold: parseFloat(critical) || 0,
      supplier_name: supplierName.trim() || null,
      supplier_contact: supplierContact.trim() || null,
      cost_per_unit: cost ? parseFloat(cost) : null,
      updated_at: new Date().toISOString(),
    };

    try {
      let error: any;
      if (ingredient) {
        const res = await supabase
          .from("ingredients")
          .update(body)
          .eq("id", ingredient.id);
        error = res.error;
      } else {
        const res = await supabase.from("ingredients").insert({
          ...body,
          restaurant_id: restaurantId,
          current_stock: parseFloat(stock) || 0,
        });
        error = res.error;
      }
      if (error) throw error;
      toast.success(ingredient ? "Ingredient updated" : "Ingredient added");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save ingredient");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-lg w-full my-8">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {ingredient ? "Edit Ingredient" : "Add Ingredient"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. All-Purpose Flour"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {INVENTORY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls}>
                {INVENTORY_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!ingredient && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Initial Stock ({unit})</label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="0"
                min="0"
                className={inputCls}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
              <input
                type="number"
                value={reorder}
                onChange={(e) => setReorder(e.target.value)}
                min="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Low Threshold</label>
              <input
                type="number"
                value={low}
                onChange={(e) => setLow(e.target.value)}
                min="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Critical Threshold</label>
              <input
                type="number"
                value={critical}
                onChange={(e) => setCritical(e.target.value)}
                min="0"
                className={inputCls}
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Supplier</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Supplier Name</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="e.g. Metro Cash & Carry"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Contact</label>
                <input
                  type="text"
                  value={supplierContact}
                  onChange={(e) => setSupplierContact(e.target.value)}
                  placeholder="Phone or email"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Last Purchase Price</label>
                <input
                  type="number"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="per unit"
                  min="0"
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {submitting ? <LoadingSpinner size="sm" /> : <Save className="h-4 w-4" />}
            {ingredient ? "Save Changes" : "Add Ingredient"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface StockEntryModalProps {
  restaurantId: string;
  ingredients: Ingredient[];
  ingredient: Ingredient | null;
  mode: "receive" | "waste";
  onClose: () => void;
  onSaved: () => void;
}

function StockEntryModal({
  restaurantId,
  ingredients,
  ingredient,
  mode,
  onClose,
  onSaved,
}: StockEntryModalProps) {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState(ingredient?.id || "");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState(mode === "waste" ? "Spoilage" : "");
  const [submitting, setSubmitting] = useState(false);

  const selected = ingredients.find((i) => i.id === selectedId);
  const isReceive = mode === "receive";

  const handleSubmit = async () => {
    if (!selectedId) {
      toast.error("Select an ingredient");
      return;
    }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    setSubmitting(true);
    const before = Number(selected?.current_stock || 0);
    const after = isReceive ? before + qty : before - qty;

    try {
      const effectiveReason =
        reason.trim() ||
        (isReceive ? "Manual stock entry" : "Waste logging");

      const { error: mErr } = await supabase.from("stock_movements").insert({
        ingredient_id: selectedId,
        restaurant_id: restaurantId,
        type: isReceive ? "restock" : "waste",
        quantity_change: isReceive ? qty : -qty,
        reason: effectiveReason,
        user_id: validUserId(user?.id),
        before_quantity: before,
        after_quantity: after,
      });
      if (mErr) throw mErr;

      const { error: uErr } = await supabase
        .from("ingredients")
        .update({ current_stock: round(after), updated_at: new Date().toISOString() })
        .eq("id", selectedId);
      if (uErr) throw uErr;

      // Alert the restaurant when stock falls to/below critical threshold
      const criticalThreshold = Number(selected?.critical_threshold || 0);
      if (!isReceive && criticalThreshold > 0 && after <= criticalThreshold) {
        if (after <= 0) {
          toast.error(
            `OUT OF STOCK: ${selected?.name} is now at ${round(after)} ${selected?.unit}. Menu items using it will be marked unavailable.`,
            { duration: 7000 }
          );
        } else {
          toast(
            `⚠️ CRITICAL: ${selected?.name} fell to ${round(after)} ${selected?.unit} (threshold: ${criticalThreshold}). Please restock.`,
            { duration: 6000 }
          );
        }
      } else if (!isReceive && after < 0) {
        toast.error(
          `OUT OF STOCK: ${selected?.name} went negative to ${round(after)} ${selected?.unit}.`,
          { duration: 6000 }
        );
      }

      toast.success(
        isReceive
          ? `${qty}${selected?.unit ? ` ${selected.unit}` : ""} received`
          : `${qty}${selected?.unit ? ` ${selected.unit}` : ""} logged as waste`
      );
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to record stock movement");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            {isReceive ? (
              <>
                <ArrowDownToLine className="h-5 w-5 text-green-600" /> Receive Stock
              </>
            ) : (
              <>
                <ArrowUpFromLine className="h-5 w-5 text-red-600" /> Log Waste
              </>
            )}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ingredient</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={inputCls}>
              <option value="">Select ingredient...</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit}) — {i.current_stock} in stock
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isReceive ? "Quantity Received" : "Quantity Discarded"} ({selected?.unit || "unit"})
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="0"
              step="any"
              placeholder="0"
              autoFocus
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isReceive ? "Reason (optional)" : "Reason"}
            </label>
            {isReceive ? (
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Delivery from supplier"
                className={inputCls}
              />
            ) : (
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
                {WASTE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selected && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
              New stock will be{" "}
              <span className="font-semibold">
                {round(isReceive ? Number(selected.current_stock || 0) + (parseFloat(quantity) || 0) : Number(selected.current_stock || 0) - (parseFloat(quantity) || 0))}{" "}
                {selected.unit}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 ${
              isReceive ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {submitting ? <LoadingSpinner size="sm" /> : isReceive ? <Truck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {isReceive ? "Confirm Receive" : "Confirm Waste"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface RecipeEditorModalProps {
  menuItem: MenuItem;
  ingredients: Ingredient[];
  recipes: RecipeRow[];
  onClose: () => void;
  onSaved: () => void;
}

function RecipeEditorModal({
  menuItem,
  ingredients,
  recipes,
  onClose,
  onSaved,
}: RecipeEditorModalProps) {
  const [rows, setRows] = useState<{ id: string | null; ingredient_id: string; quantity_required: string }[]>(
    (recipes.filter((r) => r.menu_item_id === menuItem.id) || []).map((r) => ({
      id: r.id,
      ingredient_id: r.ingredient_id,
      quantity_required: String(r.quantity_required),
    }))
  );
  const [submitting, setSubmitting] = useState(false);

  const updateRow = (index: number, patch: Partial<{ ingredient_id: string; quantity_required: string }>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const handleSubmit = async () => {
    const valid = rows.filter((r) => r.ingredient_id && parseFloat(r.quantity_required) > 0);
    if (!valid.length) {
      toast.error("Add at least one ingredient to the recipe");
      return;
    }
    setSubmitting(true);
    try {
      const existingIds = valid.filter((r) => r.id).map((r) => r.id) as string[];
      if (recipes.some((r) => r.menu_item_id === menuItem.id)) {
        let delQuery = supabase.from("recipes").delete().eq("menu_item_id", menuItem.id);
        if (existingIds.length > 0) {
          delQuery = delQuery.not("id", "in", `(${existingIds.join(",")})`);
        }
        const { error: delErr } = await delQuery;
        if (delErr) throw delErr;
      }
      const newRows = valid.filter((r) => !r.id);
      if (newRows.length) {
        const { error: insErr } = await supabase.from("recipes").insert(
          newRows.map((r) => ({
            menu_item_id: menuItem.id,
            ingredient_id: r.ingredient_id,
            quantity_required: parseFloat(r.quantity_required),
          }))
        );
        if (insErr) throw insErr;
      }
      for (const row of valid) {
        if (!row.id) continue;
        const { error: upErr } = await supabase
          .from("recipes")
          .update({ quantity_required: parseFloat(row.quantity_required) })
          .eq("id", row.id);
        if (upErr) throw upErr;
      }
      toast.success("Recipe updated");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save recipe");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" /> Recipe
            </h3>
            <p className="text-sm text-gray-500">{menuItem.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {rows.map((row, index) => {
            const ing = ingredients.find((i) => i.id === row.ingredient_id);
            return (
              <div key={index} className="flex items-center gap-3">
                <select
                  value={row.ingredient_id}
                  onChange={(e) => updateRow(index, { ingredient_id: e.target.value })}
                  className={`${inputCls} flex-1`}
                >
                  <option value="">Select ingredient...</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={row.quantity_required}
                    onChange={(e) => updateRow(index, { quantity_required: e.target.value })}
                    min="0"
                    step="any"
                    className={`${inputCls} w-20 text-right`}
                  />
                  <span className="text-xs text-gray-500 w-14">{ing?.unit || "unit"}</span>
                </div>
                <button
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          <button
            onClick={() => setRows((prev) => [...prev, { id: null, ingredient_id: "", quantity_required: "" }])}
            className="w-full border-2 border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Add Ingredient
          </button>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {submitting ? <LoadingSpinner size="sm" /> : <Save className="h-4 w-4" />}
            Save Recipe
          </button>
        </div>
      </div>
    </div>
  );
}

interface InventoryProps {
  restaurant: Restaurant;
}

export default function Inventory({ restaurant }: InventoryProps) {
  const [tab, setTab] = useState<"stock" | "recipes" | "alerts" | "report">("stock");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("month");
  const [reportMovements, setReportMovements] = useState<StockMovement[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showIngredientModal, setShowIngredientModal] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [showStockEntry, setShowStockEntry] = useState<{ mode: "receive" | "waste"; ingredient: Ingredient | null } | null>(null);
  const [showRecipeEditor, setShowRecipeEditor] = useState<MenuItem | null>(null);
  const [deletingIngredient, setDeletingIngredient] = useState<Ingredient | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!restaurant.restaurant_id) return;
    setLoading(true);
    try {
      const [ingRes, menuRes, recipeRes, movRes] = await Promise.all([
        supabase
          .from("ingredients")
          .select("*")
          .eq("restaurant_id", restaurant.restaurant_id)
          .order("name", { ascending: true }),
        supabase
          .from("menu")
          .select("id, name, price, category, available")
          .eq("restaurant_id", restaurant.restaurant_id)
          .order("name", { ascending: true }),
        supabase
          .from("recipes")
          .select("*"),
        supabase
          .from("stock_movements")
          .select("*")
          .eq("restaurant_id", restaurant.restaurant_id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (ingRes.error) throw ingRes.error;
      if (menuRes.error) throw menuRes.error;
      if (recipeRes.error) throw recipeRes.error;
      if (movRes.error) throw movRes.error;

      const menuIds = new Set((menuRes.data || []).map((m) => m.id));
      const ingData = ingRes.data || [];
      setIngredients(ingData);
      setMenuItems((menuRes.data || []) as MenuItem[]);
      setRecipes((recipeRes.data || []).filter((r) => menuIds.has(r.menu_item_id)));
      setMovements(movRes.data || []);

      // Notify restaurant when stock falls below critical threshold
      const criticalAlerts = ingData.filter((ing) => getStockStatus(ing) === "critical");
      if (criticalAlerts.length > 0) {
        const outOfStock = criticalAlerts.filter((i) => Number(i.current_stock || 0) <= 0);
        const belowCritical = criticalAlerts.filter((i) => Number(i.current_stock || 0) > 0);

        if (outOfStock.length > 0) {
          toast.error(
            `OUT OF STOCK: ${outOfStock.map((i) => `${i.name} (${Number(i.current_stock)} ${i.unit})`).join(", ")}`,
            { duration: 8000 }
          );
        }
        if (belowCritical.length > 0) {
          toast(
            `CRITICAL STOCK: ${belowCritical.map((i) => `${i.name} (${Number(i.current_stock)} ${i.unit})`).join(", ")}`,
            { icon: "⚠️", duration: 6000 }
          );
        }
      }
    } catch (err: any) {
      console.error("Error fetching inventory:", err);
      if (err?.message?.includes('relation') || err?.message?.includes('does not exist')) {
        toast.error("Inventory tables missing. Run supabase/migrations/0017_inventory.sql.", { duration: 6000 });
      } else {
        toast.error("Failed to load inventory");
      }
    } finally {
      setLoading(false);
    }
  }, [restaurant.restaurant_id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const getReportDateRange = useCallback((period: ReportPeriod) => {
    const now = new Date();
    let start: Date;
    switch (period) {
      case "day":
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        break;
      case "year":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case "month":
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }
    return { start: start.toISOString(), end: now.toISOString() };
  }, []);

  useEffect(() => {
    if (!restaurant.restaurant_id || tab !== "report") return;
    let cancelled = false;
    async function loadReportMovements() {
      setReportLoading(true);
      try {
        const { start, end } = getReportDateRange(reportPeriod);
        const { data, error } = await supabase
          .from("stock_movements")
          .select("*")
          .eq("restaurant_id", restaurant.restaurant_id)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (!cancelled) setReportMovements(data || []);
      } catch (err) {
        console.error("Error fetching report movements:", err);
        if (!cancelled) setReportMovements([]);
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    }
    loadReportMovements();
    return () => {
      cancelled = true;
    };
  }, [reportPeriod, restaurant.restaurant_id, tab, getReportDateRange]);

  const ingredientById = useMemo(
    () => new Map(ingredients.map((i) => [i.id, i])),
    [ingredients]
  );

  const filteredIngredients = useMemo(() => {
    return ingredients.filter((ing) => {
      const matchesSearch =
        !searchTerm ||
        ing.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (ing.supplier_name || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === "all" || ing.category === categoryFilter;
      const matchesStatus = statusFilter === "all" || getStockStatus(ing) === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [ingredients, searchTerm, categoryFilter, statusFilter]);

  const categories = useMemo(
    () => Array.from(new Set([...INVENTORY_CATEGORIES, ...ingredients.map((i) => i.category)])).sort(),
    [ingredients]
  );

  const criticalCount = useMemo(
    () => ingredients.filter((i) => getStockStatus(i) === "critical").length,
    [ingredients]
  );
  const lowCount = useMemo(
    () => ingredients.filter((i) => getStockStatus(i) === "low").length,
    [ingredients]
  );

  const receipts = useMemo(
    () =>
      movements
        .filter((m) => m.type === "restock" || m.type === "opening")
        .reduce((sum, m) => sum + Number(m.quantity_change), 0),
    [movements]
  );
  const wasteTotal = useMemo(
    () =>
      movements
        .filter((m) => m.type === "waste")
        .reduce((sum, m) => sum + Math.abs(Number(m.quantity_change)), 0),
    [movements]
  );

  const reportRows = useMemo<ReportRow[]>(() => {
    const movementAgg: Record<string, { consumed: number; restocked: number; wasted: number }> = {};
    reportMovements.forEach((m) => {
      const agg = movementAgg[m.ingredient_id] || { consumed: 0, restocked: 0, wasted: 0 };
      const qty = Number(m.quantity_change || 0);
      if (m.type === "order") agg.consumed += Math.abs(qty);
      else if (m.type === "waste") agg.wasted += Math.abs(qty);
      else if (m.type === "restock" || m.type === "opening") agg.restocked += qty;
      movementAgg[m.ingredient_id] = agg;
    });

    return ingredients.map((ing) => {
      const agg = movementAgg[ing.id] || { consumed: 0, restocked: 0, wasted: 0 };
      const cost = ing.cost_per_unit != null ? Number(ing.cost_per_unit) : null;
      const stock = Number(ing.current_stock || 0);
      return {
        id: ing.id,
        name: ing.name,
        category: ing.category,
        unit: ing.unit,
        currentStock: stock,
        costPerUnit: cost,
        stockValue: cost != null ? round(stock * cost) : 0,
        consumed: round(agg.consumed),
        restocked: round(agg.restocked),
        wasted: round(agg.wasted),
        status: getStockStatus(ing),
      };
});
    }, [ingredients, reportMovements]);

  const reportTotals = useMemo(
    () => ({
      stockValue: round(reportRows.reduce((sum, r) => sum + r.stockValue, 0)),
      consumed: round(
        reportRows
          .filter((r) => r.costPerUnit != null)
          .reduce((sum, r) => sum + r.consumed * (r.costPerUnit as number), 0)
      ),
      wasted: round(
        reportRows
          .filter((r) => r.costPerUnit != null)
          .reduce((sum, r) => sum + r.wasted * (r.costPerUnit as number), 0)
      ),
    }),
    [reportRows]
  );

  const exportInventoryReport = () => {
    const headers = [
      "Ingredient",
      "Category",
      "Status",
      "Current Stock",
      "Unit",
      "Cost / unit",
      "Stock Value",
      "Consumed",
      "Restocked",
      "Wasted",
    ];
    const rows = reportRows.map((r) => [
      r.name,
      r.category,
      r.status,
      r.currentStock,
      r.unit,
      r.costPerUnit ?? "",
      r.stockValue,
      r.consumed,
      r.restocked,
      r.wasted,
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell);
            return value.includes(",") || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-report-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleDeleteIngredient = async () => {
    if (!deletingIngredient) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("ingredients")
        .delete()
        .eq("id", deletingIngredient.id);
      if (error) throw error;
      toast.success("Ingredient deleted");
      setDeletingIngredient(null);
      fetchAll();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete ingredient");
    } finally {
      setIsDeleting(false);
    }
  };

  const movementTypeBadge: Record<string, string> = {
    order: "bg-blue-100 text-blue-700",
    restock: "bg-green-100 text-green-700",
    opening: "bg-teal-100 text-teal-700",
    waste: "bg-red-100 text-red-700",
    adjustment: "bg-gray-100 text-gray-700",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const tabs = [
    { id: "stock" as const, label: "Ingredients", icon: Package },
    { id: "recipes" as const, label: "Recipes", icon: BookOpen },
    { id: "alerts" as const, label: "Alerts & History", icon: History },
    { id: "report" as const, label: "Report", icon: FileText },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Inventory Management</h2>
          <p className="text-sm text-gray-500">
            Track raw ingredients, receive stock, log waste, and map recipes to menu items.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingIngredient(null);
            setShowIngredientModal(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center justify-center gap-1.5 text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> Add Ingredient
        </button>
      </div>

      {/* Critical stock banner */}
      {criticalCount > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-800">
                {criticalCount} ingredient{criticalCount > 1 ? "s" : ""} below critical threshold
              </p>
              <p className="text-xs text-red-600 mt-0.5 flex flex-wrap gap-1">
                {ingredients
                  .filter((i) => getStockStatus(i) === "critical")
                  .map((i) => (
                    <span
                      key={i.id}
                      className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium"
                    >
                      {i.name}: {Number(i.current_stock)} {i.unit}
                    </span>
                  ))}
              </p>
              <p className="text-xs text-red-500 mt-1">
                {ingredients.filter((i) => Number(i.current_stock || 0) <= 0).length > 0
                  ? "Some items are out of stock and unavailable for ordering. Restock immediately."
                  : "Restock soon to avoid items becoming unavailable for ordering."}
              </p>
            </div>
          </div>
          <button
            onClick={() => setTab("alerts")}
            className="shrink-0 bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            View Alerts
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-xs text-gray-500 font-medium">Ingredients</p>
          <p className="text-2xl font-bold text-gray-900">{ingredients.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Low Stock
          </p>
          <p className="text-2xl font-bold text-amber-600">{lowCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-xs text-red-600 font-medium flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Critical
          </p>
          <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-xs text-gray-500 font-medium">Stock Received</p>
          <p className="text-2xl font-bold text-green-600">{Math.round(receipts)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 inline-flex items-center gap-1.5 ${
              tab === id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {id === "alerts" && (criticalCount + lowCount) > 0 && (
              <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 min-w-4">
                {criticalCount + lowCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ============ Stock tab ============ */}
      {tab === "stock" && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search ingredients or suppliers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              />
            </div>
            <div className="flex gap-3">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              >
                <option value="all">All Levels</option>
                <option value="critical">Critical</option>
                <option value="low">Low</option>
                <option value="ok">In Stock</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ingredient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock Level</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thresholds</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost / unit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredIngredients.map((ing) => {
                  const status = getStockStatus(ing);
                  const badge = statusBadgeClasses[status];
                  return (
                    <tr key={ing.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{ing.name}</p>
                        {wasteTotal >= 0 && (
                          <p className="text-xs text-gray-400">{ing.unit}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {ing.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                          <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${badge.dot}`} />
                          {Number(ing.current_stock)} {ing.unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        <div>Low: {Number(ing.low_threshold)}</div>
                        <div>Critical: {Number(ing.critical_threshold)}</div>
                        <div>{ing.reorder_level > 0 ? `Reorder @ ${Number(ing.reorder_level)}` : ""}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {ing.supplier_name || "—"}
                        {ing.supplier_contact && (
                          <p className="text-xs text-gray-400">{ing.supplier_contact}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {ing.cost_per_unit != null ? formatCurrency(Number(ing.cost_per_unit), restaurant.currency || "INR") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setShowStockEntry({ mode: "receive", ingredient: ing })}
                            title="Receive stock"
                            className="p-1.5 text-green-600 bg-green-50 rounded-md hover:bg-green-100 transition-colors"
                          >
                            <ArrowDownToLine className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setShowStockEntry({ mode: "waste", ingredient: ing })}
                            title="Log waste"
                            className="p-1.5 text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
                          >
                            <ArrowUpFromLine className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingIngredient(ing);
                              setShowIngredientModal(true);
                            }}
                            title="Edit"
                            className="p-1.5 text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeletingIngredient(ing)}
                            title="Delete"
                            className="p-1.5 text-gray-500 bg-gray-50 rounded-md hover:bg-red-100 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredIngredients.length === 0 && (
              <div className="text-center py-12">
                <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">
                  {ingredients.length === 0
                    ? "No ingredients yet. Add your first ingredient to get started."
                    : "No ingredients match your filters."}
                </p>
                {ingredients.length === 0 && (
                  <button
                    onClick={() => {
                      setEditingIngredient(null);
                      setShowIngredientModal(true);
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" /> Add Ingredient
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ Recipes tab ============ */}
      {tab === "recipes" && (
        <div className="bg-white rounded-xl shadow">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-lg font-medium text-gray-900">Recipe Mappings</h3>
            <p className="text-sm text-gray-500">
              Map each menu item to the ingredients it consumes. Stock is auto-deducted when orders are placed.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Menu Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ingredients</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {menuItems.map((item) => {
                  const itemRecipes = recipes.filter((r) => r.menu_item_id === item.id);
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-400">{item.category}</p>
                      </td>
                      <td className="px-4 py-3">
                        {itemRecipes.length ? (
                          <div className="flex flex-wrap gap-1">
                            {itemRecipes.slice(0, 5).map((r) => {
                              const ing = ingredientById.get(r.ingredient_id);
                              return (
                                <span
                                  key={r.id}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700"
                                >
                                  {Number(r.quantity_required)} {ing?.unit || ""} {ing?.name || "unknown"}
                                </span>
                              );
                            })}
                            {itemRecipes.length > 5 && (
                              <span className="text-xs text-gray-400 px-1">+{itemRecipes.length - 5} more</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-red-500 font-medium">No recipe mapped</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <button
                            onClick={() => setShowRecipeEditor(item)}
                            className="p-1.5 text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors inline-flex items-center gap-1 text-xs font-medium"
                          >
                            <Pencil className="h-3.5 w-3.5" /> {itemRecipes.length ? "Edit" : "Map"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {menuItems.length === 0 && (
              <div className="text-center py-12">
                <BookOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">
                  No menu items yet. Add menu items first, then map their recipes here.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ Alerts & History tab ============ */}
      {tab === "alerts" && (
        <div className="space-y-5">
          {criticalCount + lowCount > 0 ? (
            <div className="bg-white rounded-xl shadow">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" /> Stock Alerts
                </h3>
                <p className="text-sm text-gray-500">
                  Items below their stock thresholds. Receive stock to refill.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ingredient</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Level</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thresholds</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ingredients
                      .filter((i) => getStockStatus(i) !== "ok")
                      .map((ing) => {
                        const status = getStockStatus(ing);
                        const badge = statusBadgeClasses[status];
                        return (
                          <tr key={ing.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-gray-900">{ing.name}</p>
                              <p className="text-xs text-gray-400">
                                {Number(ing.current_stock)} {ing.unit} in stock
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                                <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${badge.dot}`} />
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              <div>Low: {Number(ing.low_threshold)} {ing.unit}</div>
                              <div>Critical: {Number(ing.critical_threshold)} {ing.unit}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {ing.supplier_name || "—"}
                              {ing.supplier_contact && (
                                <p className="text-xs text-gray-400">{ing.supplier_contact}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setShowStockEntry({ mode: "receive", ingredient: ing })}
                                  className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-1"
                                >
                                  <ArrowDownToLine className="h-3.5 w-3.5" /> Receive
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingIngredient(ing);
                                    setShowIngredientModal(true);
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-1"
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Edit
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow p-8 text-center">
              <RefreshCw className="h-10 w-10 text-green-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900">All stocked up</h3>
              <p className="text-sm text-gray-500">No ingredients are below their thresholds.</p>
            </div>
          )}

          <div className="bg-white rounded-xl shadow">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Stock Movement History</h3>
                <p className="text-sm text-gray-500">Latest 100 movements with before/after quantities.</p>
              </div>
              {wasteTotal > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-600 font-medium">
                  {Math.round(wasteTotal)} wasted
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ingredient</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Change</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Before</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">After</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {movements.map((m) => {
                    const ing = ingredientById.get(m.ingredient_id);
                    const change = Number(m.quantity_change);
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(m.created_at).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{ing?.name || "Deleted ingredient"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${movementTypeBadge[m.type] || "bg-gray-100 text-gray-700"}`}>
                            {m.type}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right text-sm font-medium ${change < 0 ? "text-red-600" : "text-green-600"}`}>
                          {change >= 0 ? "+" : ""}
                          {change} {ing?.unit || ""}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-500">{m.before_quantity ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-500">{m.after_quantity ?? "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{m.reason || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {movements.length === 0 && (
                <div className="text-center py-12">
                  <History className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No stock movements recorded yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ Report tab ============ */}
      {tab === "report" && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Inventory Report</h3>
              <p className="text-sm text-gray-500">
                Current stock valuation, consumption, and waste across all ingredients.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-gray-500" />
                <select
                  value={reportPeriod}
                  onChange={(e) => setReportPeriod(e.target.value as ReportPeriod)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                >
                  <option value="day">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="year">This Year</option>
                </select>
              </div>
              <button
                onClick={exportInventoryReport}
                disabled={reportLoading}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-1.5 text-sm font-medium disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-xs text-gray-500 font-medium">Total Ingredients</p>
              <p className="text-2xl font-bold text-gray-900">{reportRows.length}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-xs text-gray-500 font-medium">Inventory Value</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(reportTotals.stockValue, restaurant.currency || "INR")}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-xs text-gray-500 font-medium">
                {reportPeriod === "day" ? "Today's consumed cost" : "Consumed cost"}
              </p>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(reportTotals.consumed, restaurant.currency || "INR")}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-xs text-gray-500 font-medium">
                {reportPeriod === "day" ? "Today's waste cost" : "Waste cost"}
              </p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(reportTotals.wasted, restaurant.currency || "INR")}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-lg font-medium text-gray-900">Stock Valuation & Movement</h3>
              <div className="flex items-center gap-2">
                {reportLoading && <LoadingSpinner size="sm" />}
                <span className="text-xs text-gray-500">
                  Movements for{" "}
                  {reportPeriod === "day" ? "today" : reportPeriod === "week" ? "this week" : reportPeriod === "month" ? "this month" : "this year"} (
                  {reportMovements.length})
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ingredient</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">On hand</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost / unit</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock value</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Consumed</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Restocked</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Wasted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reportRows.map((r) => {
                    const badge = statusBadgeClasses[r.status];
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{r.name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {r.category}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                            <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${badge.dot}`} />
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-900 font-medium">
                          {r.currentStock} {r.unit}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-500">
                          {r.costPerUnit != null ? formatCurrency(r.costPerUnit, restaurant.currency || "INR") : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-green-600">
                          {formatCurrency(r.stockValue, restaurant.currency || "INR")}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-blue-600">
                          {r.consumed.toFixed(2)} {r.unit}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-green-600">
                          +{r.restocked.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-red-600">
                          {r.wasted.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-sm font-medium text-gray-900">
                      Totals
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                      {formatCurrency(reportTotals.stockValue, restaurant.currency || "INR")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-blue-600">
                      {formatCurrency(reportTotals.consumed, restaurant.currency || "INR")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500">—</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">
                      {formatCurrency(reportTotals.wasted, restaurant.currency || "INR")}
                    </td>
                  </tr>
                </tfoot>
              </table>
              {reportRows.length === 0 && (
                <div className="text-center py-12">
                  <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No inventory data available yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showIngredientModal && (
        <IngredientModal
          restaurantId={restaurant.restaurant_id}
          ingredient={editingIngredient}
          onClose={() => {
            setShowIngredientModal(false);
            setEditingIngredient(null);
          }}
          onSaved={fetchAll}
        />
      )}

      {showStockEntry && (
        <StockEntryModal
          restaurantId={restaurant.restaurant_id}
          ingredients={ingredients}
          ingredient={showStockEntry.ingredient}
          mode={showStockEntry.mode}
          onClose={() => setShowStockEntry(null)}
          onSaved={fetchAll}
        />
      )}

      {showRecipeEditor && (
        <RecipeEditorModal
          menuItem={showRecipeEditor}
          ingredients={ingredients}
          recipes={recipes}
          onClose={() => setShowRecipeEditor(null)}
          onSaved={fetchAll}
        />
      )}

      {deletingIngredient && (
        <ConfirmationDialog
          isOpen
          onClose={() => setDeletingIngredient(null)}
          onConfirm={handleDeleteIngredient}
          title="Delete ingredient"
          message={`Delete "${deletingIngredient.name}" and all its stock history and recipe mappings? This cannot be undone.`}
          confirmText="Delete"
          isLoading={isDeleting}
        />
      )}
    </div>
  );
}