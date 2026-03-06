# Создание Android APK для "Попутчики"

## 📱 Вариант 1: PWA (Простейший)

Приложение уже готово как PWA - может устанавливаться как нативное:

1. Откройте сайт в Chrome на Android
2. Нажмите меню (три точки) → "Добавить на главный экран"
3. Приложение установится как нативное

## 📱 Вариант 2: Capacitor (Рекомендуется)

### Установка
```bash
# Установите Capacitor CLI
npm install -g @capacitor/cli

# В папке проекта
npm install @capacitor/core @capacitor/android

# Инициализация
npx cap init "Попутчики" "com.poputchiki.app"
```

### Настройка
```bash
# Добавьте Android платформу
npx cap add android

# Синхронизация
npx cap sync
```

### Сборка APK
```bash
# Откройте Android Studio
npx cap open android

# В Android Studio:
# 1. Build → Build Bundle(s)/APK(s) → Build APK(s)
# 2. Выберите "release"
# 3. APK будет в app/build/outputs/apk/release/
```

## 📱 Вариант 3: WebView (Минимальный)

Создайте новое Android приложение в Android Studio:

### MainActivity.java
```java
package com.poputchiki.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        webView.setWebViewClient(new WebViewClient());
        
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        
        // Загрузите ваш сайт
        webView.loadUrl("https://your-domain.com");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
```

### activity_main.xml
```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical">

    <WebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

</LinearLayout>
```

### AndroidManifest.xml (добавьте разрешения)
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

## 🔧 Настройка иконок

Создайте иконки 192x192 и 512x512 пикселей:
```bash
# Поместите в public/
icon-192.png
icon-512.png
```

## 🚀 Быстрый запуск PWA

1. Загрузите сайт на хостинг
2. Откройте в Chrome на Android
3. "Добавить на главный экран"
4. Готово!

## 📦 Результат

- **PWA**: Устанавливается как приложение, работает офлайн
- **Capacitor**: Полноценное нативное приложение с доступом к API
- **WebView**: Простое обертка над сайтом

Выберите вариант в зависимости от ваших потребностей!
