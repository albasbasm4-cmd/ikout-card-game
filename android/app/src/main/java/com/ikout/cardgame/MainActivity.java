package com.ikout.cardgame;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import com.ikout.cardgame.ws.WebSocketServerPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(WebSocketServerPlugin.class);
    // ضمان السماح بالاتصال بـ ws:// على الشبكة المحلية من صفحة https://localhost
    // (المحتوى المختلط). إعدادات capacitor.config.json تسمح به، وهذا تأمين إضافي
    // في حال لم تُطبَّق الإعدادات.
    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge()
          .getWebView()
          .getSettings()
          .setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
  }
}
