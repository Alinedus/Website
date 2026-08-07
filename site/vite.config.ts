import { defineConfig } from 'vite'

/**
 * `allowedHosts` is what lets a tunnel reach the local server.
 *
 * Vite rejects any Host header it does not recognise — a DNS-rebinding guard, and the right
 * default. But it means a share link through Cloudflare or ngrok returns a bare 403 saying
 * "Blocked request", which looks like the site is broken rather than the server being careful.
 *
 * A leading dot matches subdomains, so this covers whatever random name a quick tunnel is handed
 * without opening the server up to arbitrary hosts. It only ever applies to `vite dev` and
 * `vite preview` on this machine; nothing here ships to production.
 */
export default defineConfig({
  server: { port: 5173, strictPort: true, allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.loca.lt'] },
  preview: { allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.loca.lt'] },
})
