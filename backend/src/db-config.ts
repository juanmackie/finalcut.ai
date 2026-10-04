/**
 * Resolves the effective `pg` pool configuration from DATABASE_URL.
 *
 * Why this module exists: pg parses `connectionString` *after* the options object and
 * lets the parsed values win — `config = { ...config, ...parse(connectionString) }`.
 * pg-connection-string maps `sslmode=require|prefer|verify-ca` to `ssl: {}`, where
 * `rejectUnauthorized` falls back to its default of `true`, so the pool's own
 * `ssl: { rejectUnauthorized: false }` is silently discarded. Managed Postgres
 * (Supabase, RDS, Neon, ...) presents a self-signed chain, so that override turned
 * every query into `SELF_SIGNED_CERT_IN_CHAIN`.
 *
 * TLS is therefore resolved here and the `ssl*` query parameters are stripped, so
 * the explicit option is the one pg ends up using. Shared by the Vercel serverless
 * API (`api/index.ts`) and the Docker backend (`backend/src/db.ts`).
 */

/** Query parameters pg-connection-string would otherwise turn into an `ssl` object. */
const SSL_URL_PARAMS = new Set([
  'ssl',
  'sslmode',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'sslcrl',
  'sslpassword',
  'uselibpqcompat',
  'require_ssl',
  'channel_binding',
]);

/** Hosts that speak plaintext Postgres: loopback plus this repo's compose service names. */
const PLAINTEXT_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'host.docker.internal',
  'postgres',
  'db',
]);

export type ResolvedSsl = false | { rejectUnauthorized: boolean; ca?: string };

export interface DatabaseConfig {
  connectionString?: string;
  ssl: ResolvedSsl;
}

/**
 * Host portion of a postgres URL, used only to decide TLS on/off. Unknown hosts fail
 * closed (TLS on), so a malformed URL surfaces as a connect error rather than plaintext.
 */
const hostFromUrl = (url: string): string => {
  const afterScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0] ?? '';
  // The userinfo may itself contain '@' and ':'; the host starts after the last one.
  const hostAndPort = afterScheme.slice(afterScheme.lastIndexOf('@') + 1);
  if (hostAndPort.startsWith('[')) {
    return hostAndPort.slice(1, hostAndPort.indexOf(']')).toLowerCase();
  }
  return (hostAndPort.split(':')[0] ?? '').toLowerCase();
};

const resolveSsl = (
  requested: string | undefined,
  host: string,
  env: NodeJS.ProcessEnv,
): ResolvedSsl => {
  const mode = (requested || (host && PLAINTEXT_HOSTS.has(host) ? 'disable' : 'require'))
    .trim()
    .toLowerCase();

  if (mode === 'disable') return false;
  if (mode === 'allow' || mode === 'prefer' || mode === 'no-verify') {
    return { rejectUnauthorized: false };
  }

  // Managed providers expose their CA out of band; pin it when we have it so the
  // chain is actually verified instead of merely tolerated.
  const ca = (env.DATABASE_CA_CERT || env.PGSSLROOTCERT || '').trim().replace(/\\n/g, '\n');
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: false };
};

/**
 * Split DATABASE_URL into a connection string pg cannot re-interpret, plus the
 * sslmode it asked for. Leading/trailing whitespace (env values pasted from a
 * spreadsheet or a `.env` file carry stray CRs) is dropped here.
 */
export const resolveDatabaseConfig = (
  rawUrl: string | undefined = process.env.DATABASE_URL,
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig => {
  const url = rawUrl?.trim();
  if (!url) {
    return { ssl: resolveSsl(env.DATABASE_SSLMODE || env.PGSSLMODE, '', env) };
  }

  const queryStart = url.indexOf('?');
  const base = queryStart === -1 ? url : url.slice(0, queryStart);
  const params = queryStart === -1 ? [] : url.slice(queryStart + 1).split('&').filter(Boolean);

  const kept: string[] = [];
  let sslmode: string | undefined;

  for (const param of params) {
    const eq = param.indexOf('=');
    const key = (eq === -1 ? param : param.slice(0, eq)).trim().toLowerCase();
    if (!SSL_URL_PARAMS.has(key)) {
      kept.push(param);
    } else if (key === 'sslmode' && eq !== -1) {
      sslmode = decodeURIComponent(param.slice(eq + 1));
    }
  }

  return {
    connectionString: kept.length ? `${base}?${kept.join('&')}` : base,
    ssl: resolveSsl(env.DATABASE_SSLMODE || env.PGSSLMODE || sslmode, hostFromUrl(base), env),
  };
};
