# e-Arzuhal – Mobile Frontend

e-Arzuhal Akıllı Sözleşme Sistemi — React Native / Expo Mobil Uygulaması

---

## Teknoloji Stack

| Katman | Teknoloji |
|--------|-----------|
| Framework | React Native 0.81.5 |
| Platform | Expo SDK 54 (managed workflow) |
| Navigation | React Navigation 7 (Stack + Bottom Tabs) |
| Font | DM Sans + Playfair Display (Google Fonts) |
| Güvenli Depolama | expo-secure-store |
| NFC Okuma | react-native-nfc-manager 3.x |

---

## Proje Yapısı

```
frontend-mobile/
├── App.js                        # Navigation container + auth state
├── package.json
├── app.json                      # Expo config
├── src/
│   ├── components/               # Yeniden kullanılabilir bileşenler
│   │   ├── Button.js
│   │   ├── Card.js
│   │   ├── Badge.js
│   │   ├── Header.js
│   │   ├── Input.js
│   │   ├── ProgressBar.js
│   │   ├── ScreenWrapper.js      # Safe area + arka plan sarmalayıcı
│   │   ├── StepIndicator.js
│   │   └── TextArea.js
│   ├── screens/                  # Ekranlar
│   │   ├── LoginScreen.js
│   │   ├── RegisterScreen.js
│   │   ├── DashboardScreen.js
│   │   ├── CreateContractScreen.js
│   │   ├── ContractsScreen.js
│   │   ├── ContractDetailScreen.js
│   │   ├── ApprovalsScreen.js
│   │   ├── SettingsScreen.js     # Kimlik Doğrulama navigasyonu içerir
│   │   └── VerificationScreen.js # NFC + Manuel TC kimlik doğrulama
│   ├── services/
│   │   ├── api.service.js        # JWT-aware HTTP wrapper
│   │   ├── auth.service.js
│   │   └── contract.service.js
│   ├── config/
│   │   └── api.config.js
│   └── styles/
│       └── tokens.js             # Design tokens (renkler, fontlar, spacing)
└── assets/
    └── (görseller, ikonlar)
```

---

## Kurulum

```bash
cd frontend-mobile
npm install
npx expo start
```

- Android: `npx expo start --android`
- iOS: `npx expo start --ios` (macOS + Xcode gerekli)
- Expo Go: QR kodu ile test (**NFC özelliği Expo Go'da çalışmaz**, EAS Build gerekir)

---

## Navigation Yapısı

```
Stack.Navigator
├── Login  (unauthenticated)
├── Register  (unauthenticated)
└── Main → Tab.Navigator  (authenticated)
    ├── Dashboard
    ├── CreateContract
    ├── Contracts → ContractsStack
    │   ├── ContractsList
    │   └── ContractDetail
    ├── Approvals
    └── Settings → SettingsStack
        ├── SettingsHome        # Güvenlik tabı → "Kimlik Doğrulama" satırı
        └── Verification        # NFC + Manuel kimlik doğrulama ekranı
```

---

## ScreenWrapper Kullanımı

`ScreenWrapper` bileşeni tüm ekranları sararak safe area ve arka plan rengini tutarlı uygular.

```jsx
// Doğru — tüm ekranı sar
return (
  <ScreenWrapper>
    <Header ... />
    <ScrollView>...</ScrollView>
  </ScreenWrapper>
);

// Yanlış — liste öğelerini sarma
const renderItem = ({ item }) => (
  <ScreenWrapper>  {/* YAPMA */}
    <Card>{item.title}</Card>
  </ScreenWrapper>
);
```

---

## VerificationScreen — NFC Kimlik Doğrulama

### Özellikler

- **NFC Tab**: TC Kimlik Kartı NFC çipi okuma (ICAO 9303 / MRTD standardı)
- **Manuel Tab**: TC No + Ad + Soyad + Doğum Tarihi ile form tabanlı doğrulama
- Pulse animasyonu (NFC bekleme durumu görseli)
- Kimlik kartı yerleştirme rehberi
- Doğrulama durum kartı (VERIFIED / UNVERIFIED)

### TC Checksum Algoritması

```js
// 11 hane, ilk hane 0 olamaz
// d10 = (7*(d[0]+d[2]+d[4]+d[6]+d[8]) - (d[1]+d[3]+d[5]+d[7])) mod 10
// d11 = (d[0]+...+d[9]) mod 10
```

---

## NFC Entegrasyonu — Tam Kurulum Rehberi

### Paket

```bash
npm install react-native-nfc-manager
```

Paket `package.json`'a eklenmiştir (`"react-native-nfc-manager": "^3.14.14"`).

### ⚠️ Expo Go'da NFC Çalışmaz

`react-native-nfc-manager` native kod gerektirdiğinden Expo Go ile çalışmaz.
`VerificationScreen.js` paketi `try/catch` ile isteğe bağlı yükler — UI her ortamda görüntülenir:

```js
let NfcManager = null;
let NfcTech = null;
try {
  const nfcModule = require('react-native-nfc-manager');
  NfcManager = nfcModule.default;
  NfcTech = nfcModule.NfcTech;
} catch {
  // Expo Go veya paket yüklenmemiş — NFC devre dışı, UI çalışmaya devam eder
}
```

### Gerçek NFC Testi — EAS Build

**Adım 1: `app.json` güncelle**

```json
{
  "expo": {
    "android": {
      "permissions": ["android.permission.NFC"]
    },
    "plugins": [
      [
        "react-native-nfc-manager",
        {
          "nfcPermission": "TC Kimlik Kartınızı okumak için NFC gereklidir."
        }
      ]
    ],
    "ios": {
      "infoPlist": {
        "NFCReaderUsageDescription": "TC Kimlik Kartınızı doğrulamak için NFC kullanılır."
      }
    }
  }
}
```

**Adım 2: iOS — Apple Developer Console**

1. Certificates, Identifiers & Profiles → Identifiers → Uygulama Bundle ID
2. Capabilities → Near Field Communication Tag Reading → Enable
3. Provisioning profile'ı yeniden oluştur

**Adım 3: EAS Build**

```bash
npm install -g eas-cli
eas login

# Android APK (geliştirme için)
eas build --platform android --profile development

# iOS IPA (geliştirme için, fiziksel cihaz gerekir)
eas build --platform ios --profile development
```

**Not:** iOS simülatörde NFC çalışmaz. Fiziksel iPhone gerekir.

---

## TC Kimlik Kartı NFC Okuma Teknik Detayları

Türkiye TC Kimlik Kartı (2017+) ICAO 9303 standardını kullanır (MRTD — Machine Readable Travel Documents):

| Adım | Açıklama |
|------|----------|
| 1 | Karta `IsoDep` NFC teknolojisi ile bağlanılır |
| 2 | MRZ'den BAC anahtarı türetilir (belge no + doğum tarihi + son geçerlilik tarihi) |
| 3 | BAC (Basic Access Control) authentication tamamlanır |
| 4 | DG1 (kişisel bilgi grubu) okunur: ad, soyad, TC No, doğum tarihi, cinsiyet |
| 5 | DG2 (fotoğraf) opsiyonel |
| 6 | Veriler backend'e `POST /api/verification/identity` ile gönderilir |

**NFC anteni konumu:**
- Android: Genellikle arka kamera yakını (orta-üst)
- iPhone: Üst kenar

**Kart tutma şekli:** Kartı tam düz, NFC sembolü telefona bakacak şekilde, 1–3 cm mesafede tutun.

**Gelecek Geliştirme:**
- Kamera ile MRZ OCR → BAC anahtarı otomatik türetme (kullanıcı MRZ'yi manuel girmez)
- EAC (Extended Access Control) ile parmak izi verisi (opsiyonel, daha yüksek güvenlik)

---

## Backend Bağlantısı

Ana sunucu: `http://localhost:8080` (api.config.js ile konfigüre edilir)

```js
// Kimlik doğrulama gönderimi
await api.post('/api/verification/identity', {
  tcNo: '12345678901',
  firstName: 'Ali',
  lastName: 'Yılmaz',
  dateOfBirth: '1990-05-15',
  method: 'NFC',      // veya 'MANUAL' veya 'MRZ'
  mrzData: null       // NFC tag raw verisi (opsiyonel)
});

// Doğrulama durumu sorgulama
await api.get('/api/verification/status');
```

---

## Haftalık İlerleme

### Week 1–5 — Temel Altyapı
- [x] React Navigation kurulumu (Stack + Tab)
- [x] Design system ve bileşenler
- [x] Auth flow (login/register + JWT)
- [x] Sözleşme ekranları (list, detail, create)
- [x] Ayarlar ekranı (profil, şifre, bildirimler)

### Week 6 — PDF
- [x] ContractDetailScreen PDF indirme

### Week 7 — Onay Akışı
- [x] ApprovalsScreen

### Week 8 — NFC & Kimlik Doğrulama
- [x] `react-native-nfc-manager` paketi eklendi (`package.json`)
- [x] `VerificationScreen.js` — NFC UI + pulse animasyon + kimlik kartı rehberi
- [x] Manuel form — TC checksum algoritması + backend entegrasyonu
- [x] Doğrulama durumu kartı (VERIFIED / UNVERIFIED)
- [x] `SettingsScreen.js` — Güvenlik tabına "Kimlik Doğrulama" satırı
- [x] `App.js` — `SettingsStack` + `VerificationScreen` navigasyonu
- [ ] `app.json` NFC plugin yapılandırması (Enes)
- [ ] EAS Build ile gerçek cihaz NFC testi (Enes)
- [ ] MRZ OCR ile otomatik BAC anahtarı türetme (Burak)

### Week 9 — Chatbot
- [ ] Chatbot UI entegrasyonu

---

## Takım

- **Enes Burak ATAY** — Lead & Mobile + Coordinator
- **Deniz Eren ARICI** — Frontend & UI Engineer
- **Burak DERE** — AI & Data Engineer
