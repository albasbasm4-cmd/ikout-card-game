package com.ikout.cardgame;

import android.content.pm.ActivityInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import com.ikout.cardgame.ws.WebSocketServerPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // فرض الاتجاه الأفقي الحقيقي على مستوى النشاط بالكامل (مع دعم التبديل التلقائي بين الاتجاهين الأفقيين)
    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

    // السماح بالاستفادة الكاملة من الشاشة العرضية والتعامل مع النوتش بدون قص
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      getWindow().getAttributes().layoutInDisplayCutoutMode =
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
    }

    // يجب التسجيل قبل أن يبني Capacitor الجسر
    registerPlugin(WebSocketServerPlugin.class);
    super.onCreate(savedInstanceState);

    // السماح باتصال ws:// المحلي من صفحة https://localhost
    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().getSettings()
          .setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
  }

  @Override
  protected void onResume() {
    super.onResume();
    // تأكيد الاتجاه الأفقي الحقيقي للنشاط عند العودة للتطبيق
    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
  }
}
