# e-Arzuhal – Mobile Frontend

e-Arzuhal Akıllı Sözleşme Sistemi — React Native / Expo Mobil Uygulaması

---

## Tech Stack

| Katman | Teknoloji |
|--------|-----------|
| Framework | React Native 0.81.5 |
| Platform | Expo SDK 54 (managed workflow) |
| Navigation | React Navigation 7 (Stack + Bottom Tabs) |
| Font | DM Sans + Playfair Display (Google Fonts) |
| Güvenli Depolama | expo-secure-store |
| PDF İndirme | expo-file-system + expo-sharing |
| NFC Okuma | react-native-nfc-manager 3.x |

---

## Proje Yapısı

```
frontend-mobile/
├── App.js                        # Navigation + auth state + disclaimer kontrolü
├── src/
│   ├── components/
│   │   ├── Button.js
│   │   ├── Card.js
│   │   ├── Input.js
│   │   ├── ScreenWrapper.js
│   │   ├── DisclaimerModal.js    # Yasal uyarı modal
│   │   └── ...
│   ├── screens/
│   │   ├── LoginScreen.js        # onLoginSuccess callback ile auth state güncelleme
│   │   ├── RegisterScreen.js
│   │   ├── DashboardScreen.js    # Nested navigation ile ContractDetail geçişi
│   │   ├── CreateContractScreen.js  # TC Kimlik lookup + PDF indirme
│   │   ├── ContractsScreen.js
│   │   ├── ContractDetailScreen.js
│   │   ├── ApprovalsScreen.js
│   │   ├── SettingsScreen.js
│   │   ├── VerificationScreen.js # NFC + Manuel kimlik doğrulama
│   │   └── ChatbotScreen.js
│   ├── services/
│   │   ├── api.service.js        # JWT wrapper + 204 guard + 401 global handler
│   │   ├── auth.service.js
│   │   └── contract.service.js   # lookupUserByTc dahil
│   ├── config/api.config.js
│   └── styles/tokens.js
└── assets/
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
- Expo Go: QR ile test (**NFC Expo Go'da çalışmaz**, EAS Build gerekir)

---

## Navigation Yapısı

```
Stack.Navigator
├── Login     (onLoginSuccess → setIsAuthenticated(true))
├── Register
└── Main → Tab.Navigator
    ├── Dashboard          (ContractDetail için nested path kullanır)
    ├── CreateContract     (TC Kimlik lookup + PDF indirme)
    ├── Contracts → ContractsStack
    │   ├── ContractsList
    │   └── ContractDetail
    ├── Approvals
    ├── Chatbot
    └── Settings → SettingsStack
        ├── SettingsHome
        └── Verification
```

---

## Önemli Düzeltmeler

### 204 No Content Güvencesi

`api.service.js` DELETE yanıtlarında `response.json()` çağrısı öncesi içerik tipi kontrolü yapar.
204 dönen yanıtlar için boş obje döner, JSON parse hatası oluşmaz.

### Cross-Tab Navigasyon

Dashboard'dan ContractDetail'e geçiş:
```js
navigation.navigate('Contracts', {
  screen: 'ContractDetail',
  params: { contractId: contract.id }
});
```

### Login Yönlendirme

`LoginScreen` başarılı girişten sonra `onLoginSuccess()` callback'ini çağırır.
`App.js` bu callback ile `isAuthenticated = true` yapar → ana ekran otomatik açılır.

---

## Sözleşme Oluşturma — TC Kimlik Lookup

`CreateContractScreen` adım 0'da karşı tarafın TC Kimlik No'su istenir.
11 hane girildiğinde otomatik `GET /api/users/lookup?tcKimlik=` çağrılır:

```js
// Kullanıcı bulunduysa:
// ✅ Karşı taraf bulundu: Ahmet Yılmaz

// Bulunamadıysa:
// ⚠️ Bu TC Kimlik No'ya ait kayıtlı kullanıcı bulunamadı.
//    Onay gönderilemeyecek, ancak sözleşmeyi yine de oluşturabilirsiniz.
```

---

## Sözleşme Oluşturma — PDF İndirme

Adım 3 (başarı ekranı) "PDF Görüntüle / İndir" butonu sunar:

```js
// expo-file-system ile auth header'lı indirme:
const result = await FileSystem.downloadAsync(pdfUrl, localUri, {
  headers: { Authorization: `Bearer ${token}` }
});
// expo-sharing ile cihazın native paylaşım menüsü açılır:
await Sharing.shareAsync(result.uri);
```

---

## VerificationScreen — NFC Kimlik Doğrulama

- **NFC Tab**: TC Kimlik Kartı okuma (ICAO 9303 / MRTD, BAC → DG1)
- **Manuel Tab**: TC No + Ad + Soyad + Doğum Tarihi form doğrulama
- NFC gerçek cihazda çalışır, Expo Go'da devre dışıdır

### EAS Build (Gerçek NFC Testi)

```bash
npm install -g eas-cli && eas login
eas build --platform android --profile development
```

---

## Disclaimer Modal

Başarılı girişten sonra `checkDisclaimerAccepted()` çağrılır.
Kabul edilmemişse `DisclaimerModal` gösterilir; kullanıcı geri tuşuyla kapatamaz.

---

## Takım

- **Enes Burak ATAY** — Lead & Mobile
- **Deniz Eren ARICI** — Frontend & UI Engineer
- **Burak DERE** — AI & Data Engineer
