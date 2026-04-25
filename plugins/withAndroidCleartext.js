/**
 * Local Expo config plugin that enables plaintext HTTP on Android.
 *
 * Why this exists:
 *   In Expo SDK 50+, the top-level `android.usesCleartextTraffic` key in
 *   app.json is no longer honored — it must be applied via a config
 *   plugin. Without it, Android 9+ release APKs silently drop all
 *   `http://` requests (e.g. to the backend at http://192.168.1.187:8080),
 *   producing misleading "Network request failed" errors in the client
 *   even though the device has working Wi-Fi.
 *
 * What it does:
 *   1. Sets `android:usesCleartextTraffic="true"` on <application>.
 *   2. References a `@xml/network_security_config` resource.
 *   3. Writes that XML file to android/app/src/main/res/xml/ during prebuild,
 *      explicitly permitting cleartext to 192.168.1.187 (and localhost /
 *      emulator host for dev) — this covers OEMs (Xiaomi MIUI, some Samsung)
 *      that still block cleartext to specific domains even when the global
 *      flag is true.
 *
 * Because this runs on every `expo prebuild`, `--clean` cannot wipe the
 * configuration.
 */

const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
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
    <domain includeSubdomains="true">192.168.1.187</domain>
    <domain includeSubdomains="true">10.0.2.2</domain>
    <domain includeSubdomains="true">localhost</domain>
    <domain includeSubdomains="true">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`;

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
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml'
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, 'network_security_config.xml'),
        NETWORK_SECURITY_CONFIG_XML,
        'utf8'
      );
      return cfg;
    },
  ]);

module.exports = (config) => {
  config = withApplicationCleartext(config);
  config = withNetworkSecurityXml(config);
  return config;
};
