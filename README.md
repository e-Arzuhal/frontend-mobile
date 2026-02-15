# e-Arzuhal – Mobile App

React Native (Expo) ile geliştirilmiş mobil uygulama.

## Tech Stack

- React Native + Expo
- React Navigation (Tab + Stack)
- Expo SecureStore (token storage)

## Proje Yapısı

```
src/
├── components/
│   ├── ScreenWrapper.js      # Safe area + tema sarmalayıcı (tüm ekranlarda kullanılır)
│   ├── Header.js
│   ├── Card.js
│   ├── Badge.js
│   ├── Button.js
│   └── Input.js
├── screens/
│   ├── LoginScreen.js
│   ├── RegisterScreen.js
│   ├── DashboardScreen.js
│   ├── ContractsScreen.js
│   ├── ContractDetailScreen.js
│   ├── CreateContractScreen.js
│   ├── ApprovalsScreen.js
│   └── SettingsScreen.js
├── services/
│   ├── api.service.js        # Axios instance + interceptors
│   ├── auth.service.js       # Login/register/token management
│   └── contract.service.js   # Contract CRUD
├── styles/
│   └── tokens.js             # Design tokens (colors, fonts, radius, shadows)
└── navigation/
    └── ...                   # Tab + Stack navigator config
```

## Çalıştırma

```bash
cd frontend-mobile
npm install
npx expo start
```

## ScreenWrapper Kullanımı

`ScreenWrapper` bileşeni tüm ekranları sarmalayarak safe area insets ve arka plan rengini tutarlı uygular.

**Doğru kullanım** - Tüm ekranı sar:
```jsx
return (
  <ScreenWrapper>
    <Header ... />
    <FlatList ... />
  </ScreenWrapper>
);
```

**Yanlış kullanım** - Liste öğelerini veya tab içeriğini sarma:
```jsx
// YANLIŞ - her liste öğesini sarıyor
const renderItem = ({ item }) => (
  <ScreenWrapper>  {/* YAPMA */}
    <Card>{item.title}</Card>
  </ScreenWrapper>
);
```

## Backend Bağlantısı

Main server: `http://localhost:8080` (api.service.js'de konfigüre edilir)
