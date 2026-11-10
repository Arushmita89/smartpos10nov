'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, Database } from '@/lib/supabase';
import { SubscriptionStatus, buildSubscriptionStatus } from '@/lib/subscription';
import { isOwner } from '@/lib/owner';

type Restaurant = Database['public']['Tables']['parameters']['Row'];

export type UserRole = 'admin' | 'kitchen' | 'attendant' | 'rider';

export interface AuthUser {
  id: string;
  restaurant_id: string | null;
  name: string;
  login_name: string;
  role: UserRole;
  active: boolean;
  phone?: string | null;
  vehicle_number?: string | null;
  rider_status?: 'available' | 'busy' | 'offline' | null;
  approval_status?: 'pending' | 'approved' | 'rejected' | null;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  kitchen: 'Kitchen',
  attendant: 'Table Attendant',
  rider: 'Delivery Rider',
};

export class SubscriptionRequiredError extends Error {
  restaurantId: string;
  email: string;

  constructor(restaurantId: string, email: string) {
    super('No active subscription. Please subscribe to continue.');
    this.name = 'SubscriptionRequiredError';
    this.restaurantId = restaurantId;
    this.email = email;
  }
}

interface AuthContextType {
  restaurant: Restaurant | null;
  user: AuthUser | null;
  subscription: SubscriptionStatus | null;
  loading: boolean;
  isAdmin: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (data: SignUpData) => Promise<void>;
  migrate: (restaurantId: string, email: string, password: string) => Promise<void>;
  resetPassword: (email: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateRestaurant: (updates: Partial<Restaurant>) => void;
  addUser: (data: NewUserData) => Promise<void>;
  updateUser: (id: string, updates: Partial<NewUserData>) => Promise<void>;
  toggleUserActive: (id: string, active: boolean) => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

export interface SignUpData {
  restaurant_name: string;
  login_name: string;
  password: string;
  gst_number?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  address_line3?: string;
  owner1?: string;
  owner2?: string;
  owner3?: string;
  owner4?: string;
  tax_rate?: number;
  mpin?: string;
  currency?: string;
  country_code?: string;
}

interface NewUserData {
  name: string;
  login_name: string;
  password?: string;
  role: UserRole;
  phone?: string | null;
  vehicle_number?: string | null;
  rider_status?: 'available' | 'busy' | 'offline' | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function generateRestaurantId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'REST';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function toAuthUser(restaurant: Restaurant): AuthUser {
  return {
    id: `${restaurant.restaurant_id}-admin`,
    restaurant_id: restaurant.restaurant_id,
    name: restaurant.owner1 || restaurant.restaurant_name,
    login_name: restaurant.login_name || '',
    role: 'admin',
    active: true,
  };
}

function isTableMissing(err: any): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const computeSubscription = useCallback(
    async (rest: Restaurant): Promise<SubscriptionStatus> => {
      if (isOwner(rest.login_name)) {
        const unlocked: SubscriptionStatus = {
          ...buildSubscriptionStatus(rest, null),
          isLocked: false,
          status: 'active',
          hasActiveSubscription: true,
        };
        setSubscription(unlocked);
        return unlocked;
      }
      try {
        const res = await fetch(
          `/api/subscription/status?restaurantId=${encodeURIComponent(
            rest.restaurant_id
          )}`
        );

        if (!res.ok) {
          throw new Error(`Status check failed (${res.status})`);
        }

        const status: SubscriptionStatus = await res.json();
        setSubscription(status);
        return status;
      } catch (err) {
        console.error(
          'Error computing subscription. If the subscriptions tables are missing, run supabase/migrations/0002_subscription_tables.sql.',
          err
        );
        const fallback: SubscriptionStatus = {
          ...buildSubscriptionStatus(rest, null),
          isLocked: false,
          status: 'none',
        };
        setSubscription(fallback);
        return fallback;
      }
    },
    []
  );

  useEffect(() => {
    const loadSession = async () => {
      try {
        const userId = localStorage.getItem('smartpos_user_id');
        const stored = localStorage.getItem('smartpos_restaurant_id');

        let loadedUser: AuthUser | null = null;
        if (userId) {
          const { data } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
          if (data) loadedUser = data as AuthUser;
        }

        if (
          loadedUser?.role === 'rider' &&
          loadedUser.approval_status &&
          loadedUser.approval_status !== 'approved'
        ) {
          localStorage.removeItem('smartpos_user_id');
          localStorage.removeItem('smartpos_restaurant_id');
          loadedUser = null;
        }

        if (stored) {
          const { data, error } = await supabase
            .from('parameters')
            .select('*')
            .eq('restaurant_id', stored)
            .maybeSingle();
          if (!error && data) {
            const rest = data as Restaurant;
            setRestaurant(rest);
            await computeSubscription(rest);
            if (!loadedUser) {
              loadedUser = toAuthUser(rest);
            }
          }
        }

        setUser(loadedUser);
      } catch (err) {
        console.error('Error loading session:', err);
      } finally {
        setLoading(false);
      }
    };
    loadSession();
  }, [computeSubscription]);

  const signInWithEmail = async (email: string, password: string) => {
    const login = email.toLowerCase().trim();

    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('login_name', login)
      .eq('password', password)
      .maybeSingle();

    if (userData) {
      if (!userData.active) {
        throw new Error('This account has been deactivated. Contact your admin.');
      }

      if (
        userData.role === 'rider' &&
        userData.approval_status &&
        userData.approval_status !== 'approved'
      ) {
        throw new Error(
          userData.approval_status === 'rejected'
            ? 'Your rider application was not approved. Contact SmartPOS support.'
            : 'Your rider account is pending approval. Please try again once the SmartPOS team approves it.'
        );
      }

      if (!userData.restaurant_id) {
        if (userData.role !== 'rider') {
          throw new Error('Restaurant not found');
        }
        localStorage.setItem('smartpos_user_id', userData.id);
        localStorage.removeItem('smartpos_restaurant_id');
        setUser(userData as AuthUser);
        setRestaurant(null);
        setSubscription(null);
        return;
      }

      const { data: restData, error: restError } = await supabase
        .from('parameters')
        .select('*')
        .eq('restaurant_id', userData.restaurant_id)
        .maybeSingle();
      if (restError || !restData) throw new Error('Restaurant not found');

      const status = await computeSubscription(restData as Restaurant);
      if (status.isLocked) {
        throw new SubscriptionRequiredError(userData.restaurant_id, login);
      }

      localStorage.setItem('smartpos_user_id', userData.id);
      localStorage.setItem('smartpos_restaurant_id', userData.restaurant_id);
      setUser(userData as AuthUser);
      setRestaurant(restData as Restaurant);
      await computeSubscription(restData as Restaurant);
      return;
    }

    const { data, error } = await supabase
      .from('parameters')
      .select('*')
      .eq('login_name', login)
      .eq('password', password)
      .maybeSingle();

    if (error) throw new Error('Failed to sign in');
    if (!data) throw new Error('Invalid email or password');

    const rest = data as Restaurant;

    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('login_name', login)
      .maybeSingle();

    let authUser: AuthUser = toAuthUser(rest);

    if (existingUser) {
      await supabase
        .from('users')
        .update({ password })
        .eq('id', existingUser.id);
      authUser = existingUser as AuthUser;
    } else {
      const { data: insertedUser, error: insertError } = await supabase
        .from('users')
        .insert({
          restaurant_id: rest.restaurant_id,
          name: rest.owner1 || rest.restaurant_name,
          login_name: login,
          password: password,
          role: 'admin',
          active: true,
        })
        .select('*')
        .single();
      if (!insertError && insertedUser) {
        authUser = insertedUser as AuthUser;
      }
    }

    const status = await computeSubscription(rest);
    if (status.isLocked) {
      throw new SubscriptionRequiredError(rest.restaurant_id, login);
    }

    localStorage.setItem('smartpos_user_id', authUser.id);
    localStorage.setItem('smartpos_restaurant_id', rest.restaurant_id);
    setUser(authUser);
    setRestaurant(rest);
    await computeSubscription(rest);
  };

  const signUp = async (data: SignUpData) => {
    let restaurantId = generateRestaurantId();
    let attempts = 0;
    while (attempts < 10) {
      const { data: existing } = await supabase
        .from('parameters')
        .select('restaurant_id')
        .eq('restaurant_id', restaurantId)
        .maybeSingle();
      if (!existing) break;
      restaurantId = generateRestaurantId();
      attempts++;
    }

    const { data: inserted, error } = await supabase
      .from('parameters')
      .insert({
        restaurant_id: restaurantId,
        restaurant_name: data.restaurant_name,
        login_name: data.login_name.toLowerCase().trim(),
        password: data.password,
        gst_number: data.gst_number || null,
        phone: data.phone || null,
        address_line1: data.address_line1 || null,
        address_line2: data.address_line2 || null,
        address_line3: data.address_line3 || null,
        owner1: data.owner1 || null,
        owner2: data.owner2 || null,
        owner3: data.owner3 || null,
        owner4: data.owner4 || null,
        tax_rate: data.tax_rate || 18,
        mpin: data.mpin || '1234',
        currency: data.currency || 'INR',
        country_code: data.country_code || 'IN',
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('An account with this email already exists');
      }
      throw new Error(error.message || 'Failed to create account');
    }

    let authUser: AuthUser = toAuthUser(inserted as Restaurant);

    const { data: insertedUser, error: insertUserError } = await supabase
      .from('users')
      .insert({
        restaurant_id: restaurantId,
        name: data.owner1 || data.restaurant_name,
        login_name: data.login_name.toLowerCase().trim(),
        password: data.password,
        role: 'admin',
        active: true,
      })
      .select('*')
      .single();

    if (!insertUserError && !isTableMissing(insertUserError) && insertedUser) {
      authUser = insertedUser as AuthUser;
    }

    const insertedRest = inserted as Restaurant;
    const status = await computeSubscription(insertedRest);
    if (status.isLocked) {
      throw new SubscriptionRequiredError(restaurantId, data.login_name.toLowerCase().trim());
    }

    localStorage.setItem('smartpos_user_id', authUser.id);
    localStorage.setItem('smartpos_restaurant_id', restaurantId);
    setUser(authUser);
    setRestaurant(insertedRest);
  };

  const migrate = async (restaurantId: string, email: string, password: string) => {
    const { data: existing } = await supabase
      .from('parameters')
      .select('restaurant_id')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (!existing) throw new Error('Restaurant ID not found');

    const { data: emailCheck } = await supabase
      .from('parameters')
      .select('restaurant_id')
      .eq('login_name', email.toLowerCase().trim())
      .maybeSingle();
    if (emailCheck) throw new Error('This email is already in use');

    const { data: updated, error } = await supabase
      .from('parameters')
      .update({
        login_name: email.toLowerCase().trim(),
        password: password,
      })
      .eq('restaurant_id', restaurantId)
      .select('*')
      .single();

    if (error) throw new Error(error.message || 'Failed to migrate account');

    const rest = updated as Restaurant;

    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('login_name', email.toLowerCase().trim())
      .maybeSingle();

    let authUser: AuthUser = toAuthUser(rest);

    if (existingUser) {
      await supabase
        .from('users')
        .update({ password, restaurant_id: restaurantId })
        .eq('id', existingUser.id);
      authUser = existingUser as AuthUser;
    } else {
      const { data: insertedUser, error: insertUserError } = await supabase
        .from('users')
        .insert({
          restaurant_id: restaurantId,
          name: rest.owner1 || rest.restaurant_name,
          login_name: email.toLowerCase().trim(),
          password: password,
          role: 'admin',
          active: true,
        })
        .select('*')
        .single();
      if (!insertUserError && !isTableMissing(insertUserError) && insertedUser) {
        authUser = insertedUser as AuthUser;
      }
    }

    const status = await computeSubscription(rest);
    if (status.isLocked) {
      throw new SubscriptionRequiredError(restaurantId, email.toLowerCase().trim());
    }

    localStorage.setItem('smartpos_user_id', authUser.id);
    localStorage.setItem('smartpos_restaurant_id', restaurantId);
    setUser(authUser);
    setRestaurant(rest);
  };

  const resetPassword = async (email: string, newPassword: string) => {
    const login = email.toLowerCase().trim();

    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('login_name', login)
      .maybeSingle();
    if (userData) {
      const { error } = await supabase
        .from('users')
        .update({ password: newPassword })
        .eq('id', userData.id);
      if (error) throw new Error(error.message || 'Failed to reset password');
      return;
    }

    const { data: existing, error: findError } = await supabase
      .from('parameters')
      .select('restaurant_id')
      .eq('login_name', login)
      .maybeSingle();

    if (findError) throw new Error(findError.message || 'Failed to verify account');
    if (!existing) throw new Error('No account found with that email');

    const { error: updateError } = await supabase
      .from('parameters')
      .update({ password: newPassword })
      .eq('login_name', login);

    if (updateError) throw new Error(updateError.message || 'Failed to reset password');
  };

  const signOut = async () => {
    localStorage.removeItem('smartpos_restaurant_id');
    localStorage.removeItem('smartpos_user_id');
    setRestaurant(null);
    setUser(null);
    setSubscription(null);
  };

  const updateRestaurant = (updates: Partial<Restaurant>) => {
    setRestaurant((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const refreshSubscription = async () => {
    if (restaurant) {
      await computeSubscription(restaurant);
    }
  };

  const addUser = async (data: NewUserData) => {
    if (!restaurant) throw new Error('No restaurant session');

    const { data: emailCheck } = await supabase
      .from('users')
      .select('id')
      .eq('login_name', data.login_name.toLowerCase().trim())
      .maybeSingle();
    if (emailCheck) throw new Error('A user with this email already exists');

    const { error } = await supabase.from('users').insert({
      restaurant_id: restaurant.restaurant_id,
      name: data.name,
      login_name: data.login_name.toLowerCase().trim(),
      password: data.password || '',
      role: data.role,
      active: true,
      phone: data.phone || null,
      vehicle_number: data.vehicle_number || null,
      rider_status:
        data.role === 'rider' ? data.rider_status || 'offline' : null,
      approval_status: data.role === 'rider' ? 'approved' : null,
    });
    if (error) throw new Error(error.message || 'Failed to add user');
  };

  const updateUser = async (id: string, updates: Partial<NewUserData>) => {
    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.login_name !== undefined) {
      patch.login_name = updates.login_name.toLowerCase().trim();
    }
    if (updates.password) patch.password = updates.password;
    if (updates.role !== undefined) patch.role = updates.role;
    if (updates.phone !== undefined) patch.phone = updates.phone || null;
    if (updates.vehicle_number !== undefined)
      patch.vehicle_number = updates.vehicle_number || null;
    if (updates.rider_status !== undefined)
      patch.rider_status = updates.rider_status;
    if (updates.role !== undefined && updates.role !== 'rider') {
      patch.rider_status = null;
    }

    if (Object.keys(patch).length === 0) return;

    const { error } = await supabase.from('users').update(patch).eq('id', id);
    if (error) {
      if (error.code === '23505') {
        throw new Error('A user with this email already exists');
      }
      throw new Error(error.message || 'Failed to update user');
    }
  };

  const toggleUserActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from('users').update({ active }).eq('id', id);
    if (error) throw new Error(error.message || 'Failed to update user');
  };

  return (
    <AuthContext.Provider
      value={{
        restaurant,
        user,
        subscription,
        loading,
        isAdmin: user?.role === 'admin',
        signInWithEmail,
        signUp,
        migrate,
        resetPassword,
        signOut,
        updateRestaurant,
        refreshSubscription,
        addUser,
        updateUser,
        toggleUserActive,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
