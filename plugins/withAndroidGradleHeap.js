/**
 * Local Expo config plugin that bumps Gradle daemon JVM heap to avoid
 * OutOfMemoryError during release dex merging.
 *
 * Why this exists:
 *   `:app:mergeExtDexRelease` (D8 dex merger) crashes with
 *   `java.lang.OutOfMemoryError: Java heap space` when the project has a
 *   lot of native modules (ml-kit, nfc-manager, expo-notifications,
 *   expo-camera, expo-secure-store, etc.). Default `org.gradle.jvmargs`
 *   in Expo's prebuild template is `-Xmx2048m`, which is too low.
 *
 * What it does:
 *   Rewrites `android/gradle.properties` (regenerated each prebuild)
 *   so the Gradle daemon gets enough heap + metaspace to merge dex
 *   archives in release builds.
 *
 * Because this runs on every `expo prebuild`, `--clean` cannot wipe it.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const HEAP_LINE =
  'org.gradle.jvmargs=-Xmx6144m -XX:MaxMetaspaceSize=1024m -XX:+UseG1GC -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

const withAndroidGradleHeap = (config) => {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const gradlePropsPath = path.join(
        cfg.modRequest.platformProjectRoot,
        'gradle.properties'
      );
      try {
        let contents = fs.readFileSync(gradlePropsPath, 'utf8');
        // org.gradle.jvmargs satırı (varsa) tek satırlık güncel ayarla
        // değiştirilir; yoksa dosyaya eklenir.
        if (/^\s*org\.gradle\.jvmargs\s*=.*$/m.test(contents)) {
          contents = contents.replace(
            /^\s*org\.gradle\.jvmargs\s*=.*$/m,
            HEAP_LINE
          );
        } else {
          contents += `\n${HEAP_LINE}\n`;
        }
        fs.writeFileSync(gradlePropsPath, contents, 'utf8');
        console.log('[withAndroidGradleHeap] Gradle JVM heap bumped to 6 GB');
      } catch (err) {
        console.warn(
          '[withAndroidGradleHeap] gradle.properties düzenlenemedi:',
          err.message
        );
      }
      return cfg;
    },
  ]);
};

module.exports = withAndroidGradleHeap;
