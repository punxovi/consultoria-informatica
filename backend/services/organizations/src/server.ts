import { createServer, type Server } from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readPort } from '../../../shared/config/src/index.ts';
import { getRequestId, logEvent } from '../../../shared/observability/src/index.ts';
import { createOrganizationsApplication, type OrganizationsApplication } from './application/organizations-service.ts';
import { routeOrganizations } from './http/routes.ts';
import { createSupabaseOrganizationsRepositoryFromEnv } from './infrastructure/supabase-organizations.repository.ts';
import { createCountriesApplication, type CountriesApplication } from './application/countries-service.ts';
import { createSupabaseCountriesRepositoryFromEnv } from './infrastructure/supabase-countries.repository.ts';
import { routeCountries } from './http/countries-routes.ts';
import { createCoveragesApplication, type CoveragesApplication } from './application/coverages-service.ts';
import { createSupabaseCoveragesRepositoryFromEnv } from './infrastructure/supabase-coverages.repository.ts';
import { routeCoverages } from './http/coverages-routes.ts';

// Carga manual segura del archivo .env si no está cargado en el proceso
function loadEnvManually() {
  try {
    const envPath = path.resolve(process.cwd(), '../../.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim().replace(/['"]/g, '');
          if (key && val && !process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (e) {
    // Ignorar errores de lectura
  }
}

loadEnvManually();

export function createOrganizationsServer(
  application?: OrganizationsApplication,
  countries?: CountriesApplication,
  coverages?: CoveragesApplication,
): Server {
  const resolved = application ?? createOrganizationsApplication(createSupabaseOrganizationsRepositoryFromEnv());
  const resolvedCountries = countries ?? createCountriesApplication(createSupabaseCountriesRepositoryFromEnv());
  const resolvedCoverages = coverages ?? createCoveragesApplication(createSupabaseCoveragesRepositoryFromEnv());

  // Cliente Supabase utilizando variables de entorno de forma segura
  const supabaseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || 'https://jjarthmbasxtjfyhscai.supabase.co';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_IvS9kcTa2VxlukF7W-G0g_d1Gs2N-1';

  const supabaseClient = {
    from: (table: string) => {
      let queryParams = new URLSearchParams();
      let method = 'GET';
      let bodyData: any = null;
      let isSingle = false;

      const builder: any = {
        select: (fields = '*') => { queryParams.set('select', fields); return builder; },
        eq: (col: string, val: string) => { queryParams.set(col, `eq.${val}`); return builder; },
        gte: (col: string, val: any) => { queryParams.set(col, `gte.${val}`); return builder; },
        lte: (col: string, val: any) => { queryParams.set(col, `lte.${val}`); return builder; },
        ilike: (col: string, val: any) => { queryParams.set(col, `ilike.%${val}%`); return builder; },
        order: (column: string, options?: { ascending?: boolean }) => {
          queryParams.set('order', `${column}.${options?.ascending === false ? 'desc' : 'asc'}`);
          return builder;
        },
        range: (from: number, to: number) => {
          const limit = to - from + 1;
          queryParams.set('limit', limit.toString());
          queryParams.set('offset', from.toString());
          return builder;
        },
        insert: (data: any) => { method = 'POST'; bodyData = data; queryParams.set('select', '*'); return builder; },
        update: (data: any) => { method = 'PATCH'; bodyData = data; queryParams.set('select', '*'); return builder; },
        single: () => { isSingle = true; return builder; },
        then: async (resolve: any) => {
          try {
            const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${queryParams}`, {
              method,
              headers: {
                apikey: supabaseKey,
                authorization: `Bearer ${supabaseKey}`,
                'content-type': 'application/json',
                prefer: method !== 'GET' ? 'return=representation' : '',
              },
              body: bodyData ? JSON.stringify(bodyData) : undefined,
            });
            const json = await res.json();
            if (!res.ok) {
              resolve({ data: null, error: json });
            } else {
              const dataResult = isSingle ? (Array.isArray(json) ? json[0] : json) : json;
              resolve({ data: dataResult, error: null });
            }
          } catch (err) {
            resolve({ data: null, error: err });
          }
        },
      };
      return builder;
    },
  };

  return createServer(async (request, response) => {
    const requestId = getRequestId(request.headers['x-request-id']);
    logEvent('info', 'organizations.request', { requestId, method: request.method, path: request.url });
    const path = new URL(request.url ?? '/', 'http://organizations.local').pathname;

    if (path === '/v1/organizations/temporary-coverages' || path.startsWith('/v1/organizations/temporary-coverages/')) {
      await routeCoverages(request, response, requestId, resolvedCoverages);
      return;
    }

    if (path === '/v1/countries' || path.startsWith('/v1/countries/')) {
      await routeCountries(request, response, requestId, resolvedCountries);
    } else {
      await routeOrganizations(request, response, requestId, resolved);
    }
  });
}

export function organizationsPort(): number {
  return readPort('ORGANIZATIONS_SERVICE_PORT', 4102);
}
