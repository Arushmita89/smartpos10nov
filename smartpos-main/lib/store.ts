import { create } from 'zustand';
import { supabase } from './supabase';

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  image_url?: string;
  available: boolean;
  preparation_time?: number;
  options?: string[];
}

export interface CartItem {
  id: string;
  key: string;
  name: string;
  price: number;
  quantity: number;
  options?: string[];
  notes?: string;
}

export interface ActiveOrder {
  id: number;
  items: { name: string; price: number; quantity: number; options?: string[]; notes?: string }[];
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  payment_method: string;
  created_at: string;
}

interface POSState {
  products: Product[];
  cart: CartItem[];
  loading: boolean;
  selectedTable: number;
  selectedTab: number;
  activeOrders: ActiveOrder[];
  activeOrdersLoading: boolean;
  lastStockAlerts: StockAlert[];
  setSelectedTable: (table: number, restaurantId?: string) => void;
  setSelectedTab: (tab: number, restaurantId?: string) => void;
  fetchActiveOrders: (restaurantId: string, tableNumber: number, tabNumber: number) => Promise<void>;
  fetchProducts: (restaurantId: string) => Promise<void>;
  refreshProducts: () => Promise<void>;
  addToCart: (product: Product, options?: string[], notes?: string) => void;
  updateCartQuantity: (key: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  settleTab: (restaurantId: string, tableNumber: number, tabNumber: number) => Promise<void>;
  settleOrdersWithPayment: (
    restaurantId: string,
    tableNumber: number,
    tabNumber: number,
    payment: { method: string; razorpayOrderId?: string; razorpayPaymentId?: string },
    excludeOrderId?: number
  ) => Promise<void>;
  createOrder: (orderData: {
    restaurant_id: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    items: { name: string; price: number; quantity: number; options?: string[]; notes?: string }[];
    subtotal: number;
    tax: number;
    total: number;
    customer_name: string;
    customer_phone: string;
    customer_email?: string | null;
    customer_address?: string | null;
    payment_method: string;
    order_type?: string;
    table_number?: number;
    tab_number?: number;
    estimated_delivery_time?: number | null;
    status?: string;
    discount_amount?: number;
    promo_code?: string | null;
    loyalty_points_redeemed?: number;
    loyalty_points_earned?: number;
  }) => Promise<any>;
  lookupCustomerByPhone: (restaurantId: string, phone: string) => Promise<{ name: string; phone: string; email: string | null; address: string | null; loyalty_points?: number | null; birthday?: string | null } | null>;
  upsertCustomer: (restaurantId: string, customer: { name: string; phone: string; email?: string; address?: string }) => Promise<void>;
  clearStockAlerts: () => void;
}

let currentRestaurantId: string | null = null;
let activeOrdersFetchGeneration = 0;

interface OrderItemLike {
  name: string;
  quantity: number;
}

export interface StockAlert {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  before: number;
  after: number;
  needed: number;
  severity: 'negative' | 'critical';
}

export interface MenuItemStockStatus {
  menuItemId: string;
  menuItemName: string;
  available: boolean;
  missingIngredients: { name: string; unit: string; needed: number; available: number }[];
}

async function deductIngredientsForOrder(
  restaurantId: string,
  items: OrderItemLike[],
  orderId: number,
  orderStatus: string
): Promise<StockAlert[]> {
  const alerts: StockAlert[] = [];
  const names = items.map((i) => i.name).filter(Boolean);
  if (names.length === 0) return alerts;

  const { data: menuRows, error: menuErr } = await supabase
    .from('menu')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .in('name', names);
  if (menuErr) throw menuErr;

  const nameToMenuId = new Map<string, string>();
  (menuRows || []).forEach((m: any) => {
    const existing = nameToMenuId.get(m.name);
    if (!existing) nameToMenuId.set(m.name, m.id);
  });

  const menuIds = Array.from(nameToMenuId.values());
  if (menuIds.length === 0) return alerts;

  const { data: recipeRows, error: recipeErr } = await supabase
    .from('recipes')
    .select('menu_item_id, ingredient_id, quantity_required')
    .in('menu_item_id', menuIds);
  if (recipeErr) throw recipeErr;

  if (!recipeRows || recipeRows.length === 0) return alerts;

  // Aggregate total ingredient qty needed across all ordered items
  const ingredientNeed = new Map<string, number>();
  items.forEach((item) => {
    const menuId = nameToMenuId.get(item.name);
    if (!menuId) return;
    recipeRows
      .filter((r: any) => r.menu_item_id === menuId)
      .forEach((r: any) => {
        const qty = Number(r.quantity_required || 0) * Number(item.quantity || 1);
        ingredientNeed.set(r.ingredient_id, (ingredientNeed.get(r.ingredient_id) || 0) + qty);
      });
  });

  if (ingredientNeed.size === 0) return alerts;

  const ingredientIds = Array.from(ingredientNeed.keys());
  const { data: ingRows, error: ingErr } = await supabase
    .from('ingredients')
    .select('id, name, unit, current_stock, critical_threshold')
    .eq('restaurant_id', restaurantId)
    .in('id', ingredientIds);
  if (ingErr) throw ingErr;

  const ingMap = new Map<string, { name: string; unit: string; current_stock: number; critical_threshold: number }>();
  (ingRows || []).forEach((i: any) => ingMap.set(i.id, i));

  // Deduct each ingredient (stock can go negative to reflect over-deduction)
  for (const [ingredientId, needed] of ingredientNeed.entries()) {
    const ing = ingMap.get(ingredientId);
    const before = ing ? Number(ing.current_stock || 0) : 0;
    const change = -Math.abs(needed);
    const after = before + change;

    const { error: mErr } = await supabase.from('stock_movements').insert({
      ingredient_id: ingredientId,
      restaurant_id: restaurantId,
      type: 'order',
      quantity_change: change,
      reason: `Order #${orderId}${orderStatus && orderStatus !== 'pending' ? ` (${orderStatus})` : ''}`,
      order_id: orderId,
      before_quantity: before,
      after_quantity: after,
    });
    if (mErr) throw mErr;

    const { error: uErr } = await supabase
      .from('ingredients')
      .update({ current_stock: after })
      .eq('id', ingredientId);
    if (uErr) throw uErr;

    // Generate alerts for negative or critical stock
    if (ing) {
      const criticalThresh = Number(ing.critical_threshold || 0);
      if (after < 0) {
        alerts.push({
          ingredientId,
          ingredientName: ing.name,
          unit: ing.unit,
          before,
          after,
          needed,
          severity: 'negative',
        });
      } else if (criticalThresh > 0 && after <= criticalThresh) {
        alerts.push({
          ingredientId,
          ingredientName: ing.name,
          unit: ing.unit,
          before,
          after,
          needed,
          severity: 'critical',
        });
      }
    }
  }

  return alerts;
}

/**
 * Check whether all menu items in an order can be fulfilled with current stock.
 * Returns per-item availability info so the UI can show unavailable items.
 */
export async function checkMenuItemsStock(
  restaurantId: string,
  items: OrderItemLike[]
): Promise<MenuItemStockStatus[]> {
  const names = items.map((i) => i.name).filter(Boolean);
  if (names.length === 0) return [];

  const { data: menuRows, error: menuErr } = await supabase
    .from('menu')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .in('name', names);
  if (menuErr) throw menuErr;

  const nameToMenuId = new Map<string, string>();
  (menuRows || []).forEach((m: any) => {
    const existing = nameToMenuId.get(m.name);
    if (!existing) nameToMenuId.set(m.name, m.id);
  });

  const menuIds = Array.from(nameToMenuId.values());
  if (menuIds.length === 0) return items.map((i) => ({ menuItemId: '', menuItemName: i.name, available: true, missingIngredients: [] }));

  const { data: recipeRows, error: recipeErr } = await supabase
    .from('recipes')
    .select('menu_item_id, ingredient_id, quantity_required')
    .in('menu_item_id', menuIds);
  if (recipeErr) throw recipeErr;

  if (!recipeRows || recipeRows.length === 0) {
    return items.map((i) => ({ menuItemId: nameToMenuId.get(i.name) || '', menuItemName: i.name, available: true, missingIngredients: [] }));
  }

  const allIngIds = [...new Set(recipeRows.map((r: any) => r.ingredient_id))];
  const { data: ingRows, error: ingErr } = await supabase
    .from('ingredients')
    .select('id, name, unit, current_stock')
    .eq('restaurant_id', restaurantId)
    .in('id', allIngIds);
  if (ingErr) throw ingErr;

  const ingMap = new Map<string, { name: string; unit: string; current_stock: number }>();
  (ingRows || []).forEach((i: any) => ingMap.set(i.id, i));

  // Track cumulative deductions so multiple orders of the same item are checked correctly
  const cumulativeDeduction = new Map<string, number>();

  return items.map((item) => {
    const menuId = nameToMenuId.get(item.name);
    if (!menuId) return { menuItemId: '', menuItemName: item.name, available: true, missingIngredients: [] };

    const itemRecipes = recipeRows.filter((r: any) => r.menu_item_id === menuId);
    const missingIngredients: { name: string; unit: string; needed: number; available: number }[] = [];

    for (const r of itemRecipes) {
      const ing = ingMap.get(r.ingredient_id);
      if (!ing) continue;
      const needed = Number(r.quantity_required || 0) * Number(item.quantity || 1);
      const alreadyDeducted = cumulativeDeduction.get(r.ingredient_id) || 0;
      const currentStock = Number(ing.current_stock || 0) - alreadyDeducted;

      if (currentStock < needed && currentStock > 0) {
        missingIngredients.push({
          name: ing.name,
          unit: ing.unit,
          needed,
          available: Math.max(0, currentStock),
        });
      } else if (currentStock <= 0) {
        missingIngredients.push({
          name: ing.name,
          unit: ing.unit,
          needed,
          available: 0,
        });
      }

      cumulativeDeduction.set(r.ingredient_id, alreadyDeducted + needed);
    }

    return {
      menuItemId: menuId,
      menuItemName: item.name,
      available: missingIngredients.length === 0,
      missingIngredients,
    };
  });
}

export const usePOSStore = create<POSState>((set, get) => ({
  products: [],
  cart: [],
  loading: false,
  selectedTable: 1,
  selectedTab: 1,
  activeOrders: [],
  activeOrdersLoading: false,
  lastStockAlerts: [],

  setSelectedTable: (table: number, restaurantId?: string) => {
    set({ selectedTable: table, selectedTab: 1 });
    if (restaurantId) {
      get().fetchActiveOrders(restaurantId, table, 1);
    }
  },

  setSelectedTab: (tab: number, restaurantId?: string) => {
    set({ selectedTab: tab });
    if (restaurantId) {
      get().fetchActiveOrders(restaurantId, get().selectedTable, tab);
    }
  },

  fetchActiveOrders: async (restaurantId: string, tableNumber: number, tabNumber: number) => {
    const generation = ++activeOrdersFetchGeneration;
    set({ activeOrdersLoading: true, activeOrders: [] });
    try {
      // Unpaid orders only: everything not yet settled and not cancelled,
      // so orders stay visible in the cart until Settle Now completes payment
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('table_number', tableNumber)
        .eq('tab_number', tabNumber)
        .not('status', 'in', '(settled,cancelled)')
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (generation !== activeOrdersFetchGeneration) return;
      set({ activeOrders: (data || []) as ActiveOrder[] });
    } catch (err) {
      console.error('Error fetching active orders:', err);
      set({ activeOrders: [] });
    } finally {
      set({ activeOrdersLoading: false });
    }
  },

  fetchProducts: async (restaurantId: string) => {
    currentRestaurantId = restaurantId;
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('menu')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('name', { ascending: true });
      if (error) throw error;
      set({ products: ((data || []) as Product[]).map((p) => ({ ...p, options: p.options || [] })) });
    } catch (err) {
      console.error('Error fetching products:', err);
      set({ products: [] });
    } finally {
      set({ loading: false });
    }
  },

  refreshProducts: async () => {
    if (currentRestaurantId) {
      await get().fetchProducts(currentRestaurantId);
    }
  },

  settleTab: async (restaurantId: string, tableNumber: number, tabNumber: number) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'settled', updated_at: new Date().toISOString() })
        .eq('restaurant_id', restaurantId)
        .eq('table_number', tableNumber)
        .eq('tab_number', tabNumber)
        .in('status', ['pending', 'in_progress']);
      if (error) throw error;
      set({ activeOrders: [], cart: [] });
    } catch (err) {
      console.error('Error settling tab:', err);
      throw err;
    }
  },

  settleOrdersWithPayment: async (restaurantId, tableNumber, tabNumber, payment, excludeOrderId) => {
    try {
      // Stamp every unpaid row (any kitchen status, including 'completed')
      let query = supabase
        .from('orders')
        .update({
          status: 'settled',
          payment_method: payment.method,
          razorpay_order_id: payment.razorpayOrderId || null,
          razorpay_payment_id: payment.razorpayPaymentId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('restaurant_id', restaurantId)
        .eq('table_number', tableNumber)
        .eq('tab_number', tabNumber)
        .not('status', 'in', '(settled,cancelled)');

      if (excludeOrderId) {
        query = query.neq('id', excludeOrderId);
      }

      const { error } = await query;
      if (error) throw error;
      set({ activeOrders: [] });
    } catch (err) {
      console.error('Error settling orders with payment:', err);
      throw err;
    }
  },

  addToCart: (product: Product, options?: string[], notes?: string) => {
    const cart = get().cart;
    const opts = (options || []).filter(Boolean);
    const key = [product.id, opts.join('|'), (notes || '').trim()].join('__');
    const existing = cart.find((i) => i.key === key);
    if (existing) {
      set({
        cart: cart.map((i) =>
          i.key === key ? { ...i, quantity: i.quantity + 1 } : i
        ),
      });
    } else {
      set({
        cart: [
          ...cart,
          {
            id: product.id,
            key,
            name: product.name,
            price: product.price,
            quantity: 1,
            options: opts.length ? opts : undefined,
            notes: notes?.trim() || undefined,
          },
        ],
      });
    }
  },

  updateCartQuantity: (key: string, quantity: number) => {
    if (quantity <= 0) {
      set({ cart: get().cart.filter((i) => i.key !== key) });
    } else {
      set({
        cart: get().cart.map((i) => (i.key === key ? { ...i, quantity } : i)),
      });
    }
  },

  clearCart: () => set({ cart: [] }),

  getCartTotal: () => {
    return get().cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  },

  createOrder: async (orderData) => {
    const { selectedTable, selectedTab } = get();
    const tableNumber = orderData.table_number ?? selectedTable;
    const tabNumber = orderData.tab_number ?? selectedTab;
    const { data, error } = await supabase
      .from('orders')
      .insert({
        restaurant_id: orderData.restaurant_id,
        razorpay_order_id: orderData.razorpay_order_id || null,
        razorpay_payment_id: orderData.razorpay_payment_id || null,
        items: orderData.items,
        subtotal: orderData.subtotal,
        tax: orderData.tax,
        total: orderData.total,
        customer_name: orderData.customer_name,
        customer_phone: orderData.customer_phone,
        customer_email: orderData.customer_email || null,
        customer_address: orderData.customer_address || null,
        payment_method: orderData.payment_method,
        status: orderData.status || 'pending',
        order_type: orderData.order_type || 'customer',
        table_number: tableNumber,
        tab_number: tabNumber,
        estimated_delivery_time: orderData.estimated_delivery_time || null,
        discount_amount: orderData.discount_amount || 0,
        promo_code: orderData.promo_code || null,
        loyalty_points_redeemed: orderData.loyalty_points_redeemed || 0,
        loyalty_points_earned: orderData.loyalty_points_earned || 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating order:', error);
      throw error;
    }

    // Auto-deduct ingredient stock based on recipe mappings
    if (orderData.restaurant_id && !orderData.status?.startsWith('settled')) {
      try {
        const stockAlerts = await deductIngredientsForOrder(orderData.restaurant_id, orderData.items, data.id, orderData.status || 'pending');
        if (stockAlerts.length > 0) {
          set({ lastStockAlerts: stockAlerts });
        }
      } catch (err) {
        console.error('Error deducting ingredients for order:', err);
      }
    }

    // After creating, refresh active orders for this tab
    if (orderData.restaurant_id) {
      get().fetchActiveOrders(orderData.restaurant_id, tableNumber, tabNumber);
    }

    return data;
  },

  lookupCustomerByPhone: async (restaurantId: string, phone: string) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('name, phone, email, address, loyalty_points, birthday')
        .eq('restaurant_id', restaurantId)
        .eq('phone', phone)
        .maybeSingle();
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error looking up customer:', err);
      return null;
    }
  },

  upsertCustomer: async (restaurantId: string, customer: { name: string; phone: string; email?: string; address?: string }) => {
    try {
      const { error } = await supabase
        .from('customers')
        .upsert(
          {
            restaurant_id: restaurantId,
            name: customer.name,
            phone: customer.phone,
            email: customer.email || null,
            address: customer.address || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'restaurant_id,phone' }
        );
      if (error) throw error;
    } catch (err) {
      console.error('Error upserting customer:', err);
    }
  },

  clearStockAlerts: () => set({ lastStockAlerts: [] }),
}));

/**
 * Check stock availability for all menu items of a restaurant.
 * Returns a Map of menu item name -> whether it can be fulfilled.
 */
export async function checkAllMenuItemsStock(
  restaurantId: string
): Promise<Map<string, boolean>> {
  const availabilityMap = new Map<string, boolean>();

  const { data: menuRows, error: menuErr } = await supabase
    .from('menu')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .eq('available', true);
  if (menuErr || !menuRows || menuRows.length === 0) return availabilityMap;

  const menuIds = menuRows.map((m) => m.id);
  const nameToMenuId = new Map<string, string>();
  menuRows.forEach((m: any) => nameToMenuId.set(m.name, m.id));

  const { data: recipeRows } = await supabase
    .from('recipes')
    .select('menu_item_id, ingredient_id, quantity_required')
    .in('menu_item_id', menuIds);

  if (!recipeRows || recipeRows.length === 0) {
    menuRows.forEach((m: any) => availabilityMap.set(m.name, true));
    return availabilityMap;
  }

  const allIngIds = [...new Set(recipeRows.map((r: any) => r.ingredient_id))];
  const { data: ingRows } = await supabase
    .from('ingredients')
    .select('id, current_stock')
    .eq('restaurant_id', restaurantId)
    .in('id', allIngIds);

  const ingStock = new Map<string, number>();
  (ingRows || []).forEach((i: any) => ingStock.set(i.id, Number(i.current_stock || 0)));

  for (const menuRow of menuRows) {
    const itemRecipes = recipeRows.filter((r: any) => r.menu_item_id === menuRow.id);
    if (itemRecipes.length === 0) {
      availabilityMap.set(menuRow.name, true);
      continue;
    }
    const canFulfill = itemRecipes.every((r: any) => {
      const stock = ingStock.get(r.ingredient_id) || 0;
      return stock >= Number(r.quantity_required || 0);
    });
    availabilityMap.set(menuRow.name, canFulfill);
  }

  return availabilityMap;
}
