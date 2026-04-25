/**
 * Local Expo config plugin that enables plaintext HTTP on Android.
 *
 * Why this exists:
 *   In Expo SDK 50+, the top-level `android.usesCleartextTraffic` key in
 *   app.json is no longer honored — it must be applied via a config
 *   plugin. Without it, Android 9+ release APKs silently drop all
 *   `http://` requests (e.g. to the backend at http://<LAN_IP>:8080),
 *   producing misleading "Network request failed" errors in the client
 *   even though the device has working Wi-Fi.
 *
 * What it does:
 *   1. Sets `android:usesCleartextTraffic="true"` on <application>.
 *   2. References a `@xml/network_security_config` resource.
 *   3. Writes that XML file to android/app/src/main/res/xml/ during prebuild,
 *      explicitly permitting cleartext to the backend host (read from the
 *      EXPO_PUBLIC_API_BASE_URL env var) plus localhost / emulator host.
 *      This explicit per-domain rule is required on some OEM ROMs (Xiaomi
 *      MIUI, some Samsung) that still block cleartext to specific domains
 *      even when the global flag is true.
 *
 * Configuration:
 *   Set EXPO_PUBLIC_API_BASE_URL before running `expo prebuild --clean`,
 *   e.g.
 *     EXPO_PUBLIC_API_BASE_URL=http://192.168.1.187:8080 npx expo prebuild --clean
 *   On Windows cmd:
 *     set EXPO_PUBLIC_API_BASE_URL=http://192.168.1.187:8080
 *     npx expo prebuild --clean
 *   Or place it in a .env file at the project root (Expo loads it automatically).
 *
 *   If the env var is missing, the plugin falls back to the LAN IP that
 *   was previously hardcoded (192.168.1.187), so existing build commands
 *   continue to work unchanged.
 *
 * Because this runs on every `expo prebuild`, `--clean` cannot wipe the
 * configuration.
 */

const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DEFAULT_API_HOST = '192.168.1.187';

function extractHost(urlOrHost) {
  if (!urlOrHost) return null;
  const trimmed = String(urlOrHost).trim();
  if (!trimmed) return null;
  // Allow either a bare host (192.168.1.187) or a full URL (http://192.168.1.187:8080)
  const match = trimmed.match(/^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)?([^/:?#\s]+)/);
  return match ? match[1] : null;
}

function resolveBackendHost() {
  const fromEnv =
    extractHost(process.env.EXPO_PUBLIC_API_BASE_URL) ||
    extractHost(process.env.EXPO_PUBLIC_API_HOST);
  if (fromEnv) {
    console.log(`[withAndroidCleartext] Using backend host from env: ${fromEnv}`);
    return fromEnv;
  }
  console.warn(
    `[withAndroidCleartext] EXPO_PUBLIC_API_BASE_URL not set — falling back to ${DEFAULT_API_HOST}.`
  );
  return DEFAULT_API_HOST;
}

function buildNetworkSecurityConfig(backendHost) {
  // Always allow localhost / emulator host for dev; add the backend host on top.
  const domains = new Set([backendHost, '10.0.2.2', 'localhost', '127.0.0.1']);
  const domainEntries = Array.from(domains)
    .map((d) => `    <domain includeSubdomains="true">${d}</domain>`)
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!-- Allow cleartext globally (belt) -->
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <!-- Additional explicit per-domain opt-ins (suspenders). Required on
       some OEM ROMs that enforce domain-level lockdown. -->
  <domain-config cleartextTrafficPermitted="true">
${domainEntries}
  </domain-config>
</network-security-config>
`;
}

const withApplicationCleartext = (config) =>
  withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
      application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }
    return cfg;
  });

const withNetworkSecurityXml = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const backendHost = resolveBackendHost();
      const xml = buildNetworkSecurityConfig(backendHost);
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml'
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'network_security_config.xml'), xml, 'utf8');
      return cfg;
    },
  ]);

module.exports = (config) => {
  config = withApplicationCleartext(config);
  config = withNetworkSecurityXml(config);
  return config;
};
