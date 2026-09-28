import { createServerClient } from './supabaseServer';
import { ApiHttpError } from './api';
import { parseLocationQuery, requireAuth } from './validation';
import { resolveLocality, type CityLike, type LocalityLike, type LocalityResolution } from './geo';
import type { LocationQuery } from './validation';
import type {
  CategorySummary,
  DurationOption,
  LandingData,
  LocationSummary,
  ServiceDetail,
  ServiceSummary,
  ServiceTaskView,
  Serviceability,
} from './catalogue';
import type { PricingType, ServiceCategory, ServiceTask } from './supabase';

/**
 * The catalogue read model (Phase 1).
 *
 * One place that knows how to answer "what can be booked, and where". Both the
 * Route Handlers and the public Server Components call into it, so a card on the
 * landing page and the same service from `GET /api/services` cannot drift.
 *
 * It runs on the service-role client, because the catalogue RLS policies admit
 * `anon` and reading it as the service role simply skips a round trip of policy
 * evaluation — it is public reference data. The two exceptions are handled
 * explicitly and are the only places a caller is identified: `addressId`
 * (somebody's private address row) and the write paths in
 * `app/api/customers/me/addresses/**`, which run on a request-scoped check.
 *
 * There is no PostgREST embedding in this project — `lib/supabase.ts` declares
 * `Relationships: []` on purpose — so every join here happens in TypeScript.
 * With twenty services and a handful of professionals per city that is the
 * right trade; it becomes a SQL aggregate in the phase where the numbers do.
 */

export interface Geography {
  cities: CityLike[];
  localities: LocalityLike[];
}

/** Cities and active localities. Small, cached for the life of a request. */
export async function getGeography(): Promise<Geography> {
  const supabase = createServerClient();

  const [citiesRes, localitiesRes] = await Promise.all([
    supabase.from('cities').select('id, name, state, time_zone, is_active').eq('is_active', true),
    supabase
      .from('localities')
      .select('id, city_id, name, lat, lng, radius_km, is_active')
      .eq('is_active', true),
  ]);

  if (citiesRes.error) throw citiesRes.error;
  if (localitiesRes.error) throw localitiesRes.error;

  return {
    cities: (citiesRes.data ?? []) as CityLike[],
    localities: (localitiesRes.data ?? []) as LocalityLike[],
  };
}

const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

/**
 * Turns a request's location parameters into one locality.
 *
 * `addressId` first, and only for the caller who owns it: an address names a
 * private row, so an unknown or unowned id is a 404 rather than a silent
 * fallback to "anywhere", which would show a stranger's neighbourhood as if it
 * were the caller's.
 */
export async function resolveRequestLocality(
  location: LocationQuery,
  opts: { customerAddresses?: { id: string; customer_id: string; locality_id: string | null }[] } = {}
): Promise<{ resolution: LocalityResolution; addressId: string | null }> {
  const geography = await getGeography();

  if (location.addressId) {
    const owned = (opts.customerAddresses ?? []).find((a) => a.id === location.addressId);
    if (!owned) {
      // Deliberately the same answer for "not yours" and "not there": an
      // address id is a small enumerable thing.
      throw new ApiHttpError('NOT_FOUND', 'That address was not found on your account.', 404);
    }
    if (owned.locality_id) {
      const locality = geography.localities.find((l) => l.id === owned.locality_id) ?? null;
      return {
        resolution: {
          locality,
          city: locality ? (geography.cities.find((c) => c.id === locality.city_id) ?? null) : null,
          matchedBy: 'area',
          distanceKm: null,
        },
        addressId: owned.id,
      };
    }
    // A saved address outside coverage has no locality; fall through to the
    // coordinates so a hand-corrected pin can still resolve one.
    return { resolution: { locality: null, city: null, matchedBy: null, distanceKm: null }, addressId: owned.id };
  }

  return {
    resolution: resolveLocality({
      localities: geography.localities,
      cities: geography.cities,
      area: location.area,
      city: location.city,
      point: location.lat != null && location.lng != null ? { lat: location.lat, lng: location.lng } : null,
    }),
    addressId: null,
  };
}

export interface LocalityContext {
  id: string;
  name: string;
  cityName: string | null;
  timeZone: string;
}

/** The narrowed locality every serviceability check takes. */
export function localityContext(resolution: LocalityResolution): LocalityContext | null {
  if (!resolution.locality) return null;
  return {
    id: resolution.locality.id,
    name: resolution.locality.name,
    cityName: resolution.city?.name ?? null,
    timeZone: resolution.city?.time_zone ?? DEFAULT_TIME_ZONE,
  };
}

/**
 * Resolves the location for a public catalogue request.
 *
 * `addressId` is the one form that identifies somebody, so it is the one form
 * that needs a session — and the address row is read through the caller's own
 * `customers` row rather than by id, so an address belonging to another
 * customer is indistinguishable from one that does not exist.
 */
export async function resolveLocationForRequest(
  req: Request,
  url: URL
): Promise<{ summary: LocationSummary; locality: LocalityContext | null }> {
  const location = parseLocationQuery(url);

  let customerAddresses: { id: string; customer_id: string; locality_id: string | null }[] = [];

  if (location.addressId) {
    const auth = await requireAuth(req);
    const supabase = createServerClient();

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('profile_id', auth.userId)
      .maybeSingle();

    if (!customer) {
      throw new ApiHttpError(
        'FORBIDDEN',
        'Addresses are a customer feature. This account has no customer profile.',
        403
      );
    }

    const { data: addresses, error } = await supabase
      .from('addresses')
      .select('id, customer_id, locality_id')
      .eq('customer_id', customer.id);

    if (error) throw error;
    customerAddresses = addresses ?? [];
  }

  const { resolution, addressId } = await resolveRequestLocality(location, { customerAddresses });
  return {
    summary: describeLocation(resolution, addressId),
    locality: localityContext(resolution),
  };
}

/** The banner under the location chip on the catalogue and detail screens. */
export function describeLocation(
  resolution: LocalityResolution,
  addressId: string | null = null
): LocationSummary {
  const cityName = resolution.city?.name ?? null;
  const timeZone = resolution.city?.time_zone ?? DEFAULT_TIME_ZONE;

  if (!resolution.locality) {
    return {
      localityId: null,
      localityName: null,
      cityName,
      timeZone,
      matchedBy: addressId ? 'saved_address' : resolution.matchedBy,
      distanceKm: null,
      message: cityName
        ? `We are not in ${cityName} yet. Services will appear here once we cover your area.`
        : 'Tell us your area to see what is bookable near you.',
      addressId,
    };
  }

  return {
    localityId: resolution.locality.id,
    localityName: resolution.locality.name,
    cityName,
    timeZone,
    matchedBy: addressId ? 'saved_address' : resolution.matchedBy,
    distanceKm: resolution.distanceKm,
    message:
      resolution.matchedBy === 'coordinates' && resolution.distanceKm != null
        ? `Showing services available in ${resolution.locality.name}, ${resolution.distanceKm} km away.`
        : `Showing services available in ${resolution.locality.name}.`,
    addressId,
  };
}

// ── Catalogue reads ─────────────────────────────────────────

interface ServiceRow {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  base_price: number | string;
  pricing_type: PricingType;
  unit_label: string | null;
  unit_price: number | string | null;
  min_duration_min: number;
  max_duration_min: number;
  prep_minutes: number;
  max_active_jobs: number;
  materials_included: boolean;
  materials_note: string | null;
  requires_photo_proof: boolean;
  sort_order: number;
}

export interface ServiceContext {
  categories: Map<string, ServiceCategory>;
  services: Map<string, ServiceRow>;
  durations: Map<string, number[]>;
  areas: Map<string, { leadMinutes: number; slotCapacity: number }>;
  professionals: Map<string, { total: number; online: number; ratingSum: number; ratingCount: number }>;
}

function num(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * Everything a service card, a service detail page or an availability check
 * needs, in four indexed reads.
 *
 * The professional counts are computed here rather than in SQL because they are
 * two small tables joined in memory; a city with thousands of professionals
 * moves this to a view, and until then this is four round trips instead of
 * eight.
 */
export async function loadServiceContext(): Promise<ServiceContext> {
  const supabase = createServerClient();

  const [categoriesRes, servicesRes, durationsRes, areasRes, skillsRes, professionalsRes] =
    await Promise.all([
      supabase
        .from('service_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order'),
      supabase.from('services').select('*').eq('is_active', true).order('sort_order'),
      supabase
        .from('service_durations')
        .select('service_id, minutes, price, price_multiplier')
        .eq('is_active', true)
        .order('minutes'),
      supabase
        .from('service_areas')
        .select('locality_id, service_id, lead_minutes, slot_capacity')
        .eq('is_active', true),
      supabase.from('professional_skills').select('professional_id, service_id'),
      supabase
        .from('professionals')
        .select('id, verification_status, availability_status, rating, rating_count')
        .eq('verification_status', 'verified'),
    ]);

  for (const res of [categoriesRes, servicesRes, durationsRes, areasRes, skillsRes, professionalsRes]) {
    if (res.error) throw res.error;
  }

  const categories = new Map((categoriesRes.data ?? []).map((c) => [c.id, c]));

  const durations = new Map<string, number[]>();
  for (const row of durationsRes.data ?? []) {
    const list = durations.get(row.service_id) ?? [];
    list.push(row.minutes);
    durations.set(row.service_id, list);
  }

  const areas = new Map<string, { leadMinutes: number; slotCapacity: number }>();
  for (const row of areasRes.data ?? []) {
    areas.set(`${row.locality_id}:${row.service_id}`, {
      leadMinutes: row.lead_minutes,
      slotCapacity: row.slot_capacity,
    });
  }

  const professionals = new Map<
    string,
    { total: number; online: number; ratingSum: number; ratingCount: number }
  >();
  const proById = new Map(
    (professionalsRes.data ?? []).map((p) => [p.id, p] as const)
  );
  for (const skill of skillsRes.data ?? []) {
    const pro = proById.get(skill.professional_id);
    if (!pro) continue; // a skill held by an unverified professional does not count
    const entry = professionals.get(skill.service_id) ?? { total: 0, online: 0, ratingSum: 0, ratingCount: 0 };
    entry.total += 1;
    if (pro.availability_status === 'online' || pro.availability_status === 'busy') entry.online += 1;
    if (pro.rating != null && pro.rating_count > 0) {
      entry.ratingSum += Number(pro.rating) * pro.rating_count;
      entry.ratingCount += pro.rating_count;
    }
    professionals.set(skill.service_id, entry);
  }

  return {
    categories,
    services: new Map((servicesRes.data ?? []).map((s) => [s.id, s])),
    durations,
    areas,
    professionals,
  };
}

export function categorySummaries(ctx: ServiceContext): CategorySummary[] {
  const counts = new Map<string, number>();
  for (const service of ctx.services.values()) {
    counts.set(service.category_id, (counts.get(service.category_id) ?? 0) + 1);
  }
  return [...ctx.categories.values()]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      iconKey: c.icon_key,
      imageUrl: c.image_url,
      sortOrder: c.sort_order,
      serviceCount: counts.get(c.id) ?? 0,
    }));
}

/** The `serviceability` block for one service at one locality. */
export function serviceabilityOf(
  ctx: ServiceContext,
  serviceId: string,
  locality: { id: string; name: string; cityName: string | null; timeZone: string } | null
): Serviceability | null {
  if (!locality) return null;

  const area = ctx.areas.get(`${locality.id}:${serviceId}`);
  const service = ctx.services.get(serviceId);
  if (!service) return null;

  if (!area) {
    return {
      ok: false,
      localityId: locality.id,
      localityName: locality.name,
      cityName: locality.cityName,
      timeZone: locality.timeZone,
      leadMinutes: service.prep_minutes,
      slotCapacity: 0,
      reason: 'service_not_offered',
      matchedBy: 'area',
    };
  }

  return {
    ok: true,
    localityId: locality.id,
    localityName: locality.name,
    cityName: locality.cityName,
    timeZone: locality.timeZone,
    leadMinutes: Math.max(area.leadMinutes, service.prep_minutes),
    slotCapacity: area.slotCapacity,
    reason: null,
    matchedBy: 'area',
  };
}

/** `null` when no location was supplied, so the caller can say "everywhere". */
function serviceableSummary(
  ctx: ServiceContext,
  serviceId: string,
  locality: Parameters<typeof serviceabilityOf>[2]
): Serviceability | null {
  if (!locality) return null;
  return serviceabilityOf(ctx, serviceId, locality);
}

export function toServiceSummary(
  ctx: ServiceContext,
  serviceId: string,
  locality: Parameters<typeof serviceabilityOf>[2]
): ServiceSummary | null {
  const service = ctx.services.get(serviceId);
  if (!service) return null;
  const category = ctx.categories.get(service.category_id);
  if (!category) return null;

  const pros = ctx.professionals.get(service.id);

  return {
    id: service.id,
    slug: service.slug,
    name: service.name,
    shortDescription: service.short_description,
    imageUrl: service.image_url,
    category: {
      id: category.id,
      name: category.name,
      slug: category.slug,
      iconKey: category.icon_key,
    },
    pricingType: service.pricing_type,
    basePrice: num(service.base_price),
    unitLabel: service.unit_label,
    unitPrice: service.unit_price == null ? null : num(service.unit_price),
    minDurationMinutes: service.min_duration_min,
    maxDurationMinutes: service.max_duration_min,
    prepMinutes: service.prep_minutes,
    sortOrder: service.sort_order,
    durations: ctx.durations.get(service.id) ?? [service.min_duration_min],
    professionals: { total: pros?.total ?? 0, online: pros?.online ?? 0 },
    // A service's own rating needs `ratings` rows, which are written when a
    // booking is reviewed. Until then the card shows the professional pool
    // rather than borrowing a rating that belongs to a person.
    rating: pros && pros.ratingCount > 0 ? Math.round((pros.ratingSum / pros.ratingCount) * 10) / 10 : null,
    ratingCount: pros?.ratingCount ?? 0,
    serviceable: serviceableSummary(ctx, service.id, locality),
  };
}

export interface CatalogueFilters {
  q?: string;
  category?: string;
  locality?: Parameters<typeof serviceabilityOf>[2] | null;
  /** When true, a service not offered at the locality is excluded, not flagged. */
  availableOnly?: boolean;
  limit?: number;
}

/**
 * The catalogue.
 *
 * Search matches the name, the category name and the `service_keywords` rows —
 * "leak" has to find a plumber's worth of services even when no service is
 * named "leak". It is a case-insensitive substring match rather than a full
 * text search because the corpus is twenty rows today; a pg_trgm index arrives
 * with the catalogue admin screen in Phase 6 if the catalogue ever outgrows it.
 */
export async function getCatalogue(filters: CatalogueFilters = {}): Promise<ServiceSummary[]> {
  const ctx = await loadServiceContext();
  const supabase = createServerClient();

  let keywords: { service_id: string; keyword: string }[] = [];
  if (filters.q) {
    const { data, error } = await supabase.from('service_keywords').select('service_id, keyword');
    if (error) throw error;
    keywords = data ?? [];
  }

  const needle = filters.q?.toLowerCase();
  const categoryId = filters.category
    ? [...ctx.categories.values()].find((c) => c.slug === filters.category)?.id
    : undefined;

  const summaries: ServiceSummary[] = [];
  for (const service of ctx.services.values()) {
    if (categoryId && service.category_id !== categoryId) continue;

    const summary = toServiceSummary(ctx, service.id, filters.locality ?? null);
    if (!summary) continue;

    if (filters.availableOnly && filters.locality && summary.serviceable?.ok === false) continue;

    if (needle) {
      const matchesName = summary.name.toLowerCase().includes(needle);
      const matchesCategory = summary.category.name.toLowerCase().includes(needle);
      const matchesKeyword = keywords.some(
        (k) => k.service_id === service.id && k.keyword.toLowerCase().includes(needle)
      );
      const matchesDescription = (summary.shortDescription ?? '').toLowerCase().includes(needle);
      if (!(matchesName || matchesCategory || matchesKeyword || matchesDescription)) continue;
    }

    summaries.push(summary);
  }

  summaries.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return filters.limit ? summaries.slice(0, filters.limit) : summaries;
}

/** One service with everything the detail screen renders. */
export async function getServiceBySlug(
  slug: string,
  locality: Parameters<typeof serviceabilityOf>[2] | null = null
): Promise<ServiceDetail | null> {
  const ctx = await loadServiceContext();
  const supabase = createServerClient();

  const service = [...ctx.services.values()].find((s) => s.slug === slug);
  if (!service) return null;

  const [tasksRes, imagesRes, optionsRes, keywordsRes] = await Promise.all([
    supabase.from('service_tasks').select('*').eq('service_id', service.id).order('sort_order'),
    supabase.from('service_images').select('url, alt_text, sort_order').eq('service_id', service.id).order('sort_order'),
    supabase
      .from('service_durations')
      .select('minutes, price, price_multiplier')
      .eq('service_id', service.id)
      .eq('is_active', true)
      .order('minutes'),
    supabase.from('service_keywords').select('keyword').eq('service_id', service.id),
  ]);

  for (const res of [tasksRes, imagesRes, optionsRes, keywordsRes]) {
    if (res.error) throw res.error;
  }

  const summary = toServiceSummary(ctx, service.id, locality);
  if (!summary) return null;

  const tasks = ((tasksRes.data ?? []) as ServiceTask[]).map(
    (t): ServiceTaskView => ({ kind: t.kind as 'included' | 'excluded', label: t.label, sortOrder: t.sort_order })
  );

  return {
    ...summary,
    description: service.description,
    materialsIncluded: service.materials_included,
    materialsNote: service.materials_note,
    requiresPhotoProof: service.requires_photo_proof,
    maxActiveJobs: service.max_active_jobs,
    images: (imagesRes.data ?? []).map((i) => ({ url: i.url, altText: i.alt_text })),
    tasks,
    durationOptions: (optionsRes.data ?? []).map((d) => ({
      minutes: d.minutes,
      price: d.price == null ? null : num(d.price),
      priceMultiplier: d.price_multiplier == null ? null : num(d.price_multiplier),
    })),
    keywords: (keywordsRes.data ?? []).map((k) => k.keyword),
  };
}

/** The landing page's payload: enough to render without four round trips. */
export async function getLanding(featuredLimit = 6): Promise<LandingData> {
  const supabase = createServerClient();

  const [categories, featured, geography, verifiedRes] = await Promise.all([
    loadServiceContext().then(categorySummaries),
    getCatalogue({ limit: featuredLimit }),
    getGeography(),
    supabase.from('professionals').select('id').eq('verification_status', 'verified'),
  ]);

  if (verifiedRes.error) throw verifiedRes.error;

  const city = geography.cities[0] ?? null;
  const localities = geography.localities
    .filter((l) => !city || l.city_id === city.id)
    .map((l) => l.name)
    .sort((a, b) => a.localeCompare(b));

  return {
    categories,
    featured,
    coverage: {
      city: city?.name ?? 'Bengaluru',
      state: city?.state ?? 'Karnataka',
      localities,
    },
    verifiedProfessionals: (verifiedRes.data ?? []).length,
    servedLocalities: localities.length,
  };
}
