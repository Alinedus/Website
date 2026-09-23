import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

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
  /**
   * Two pages, so the inputs have to be named.
   *
   * Vite builds index.html and nothing else unless told otherwise, and it does not warn about the
   * ones it left out — contact.html would work all the way through `vite dev`, which serves any
   * HTML file in the root, and then simply not exist in dist/. Naming both is what makes the
   * build match the dev server.
   *
   * rig.html stays out on purpose. It is the figure's test harness, it is reachable in dev, and
   * it has never shipped; listing the two real pages keeps it that way rather than by accident.
   */
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        contact: fileURLToPath(new URL('./contact.html', import.meta.url)),
      },
    },
  },
})
