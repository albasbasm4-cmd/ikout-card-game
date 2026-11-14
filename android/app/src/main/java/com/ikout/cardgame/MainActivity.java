package com.ikout.cardgame;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import com.ikout.cardgame.ws.WebSocketServerPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // يجب التسجيل قبل أن يبني Capacitor الجسر
    registerPlugin(WebSocketServerPlugin.class);
    super.onCreate(savedInstanceState);

    // السماح باتصال ws:// المحلي من صفحة https://localhost
    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().getSettings()
          .setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
  }
}
