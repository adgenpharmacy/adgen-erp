import axios from 'axios';

/**
 * Backend API base URL.
 *
 * `NEXT_PUBLIC_API_URL` is the single source of truth and must be set on the Vercel project
 * (e.g. https://<your-backend>.vercel.app/api). It is inlined at build time, so changing it
 * requires a redeploy.
 *
 * The production fallback below only exists so a misconfigured deploy fails visibly against a
 * named host instead of silently calling localhost from the browser.
 */
const PRODUCTION_API_FALLBACK = 'https://adgen-erp-backend.vercel.app/api';
const LOCAL_API = 'http://localhost:5000/api';

const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  const isBrowser = typeof window !== 'undefined';
  const isLocalHost =
    isBrowser && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

  if (isBrowser && !isLocalHost) {
    console.warn(
      '[AdGen ERP] NEXT_PUBLIC_API_URL is not set — falling back to ' +
        `${PRODUCTION_API_FALLBACK}. Set it in the Vercel project settings and redeploy.`
    );
    return PRODUCTION_API_FALLBACK;
  }

  return LOCAL_API;
};

export const api = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Event the maintenance overlay listens for. */
export const MAINTENANCE_EVENT = 'adgen:maintenance';

/*
 * The server answers 503 with `maintenance: true` while the database is being worked on. Without
 * this every screen would just show its own "failed to load" toast, which reads as a bug and
 * invites staff to retry — or worse, to keep writing bills on paper and enter them later into a
 * database that is about to be replaced. Announce it once, loudly, app-wide.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 503 && error.response.data?.maintenance) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(MAINTENANCE_EVENT, { detail: { message: error.response.data.error } })
        );
      }
    }
    return Promise.reject(error);
  }
);

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('adgen_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});
