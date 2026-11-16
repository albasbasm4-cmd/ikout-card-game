package com.ikout.cardgame;

import android.content.pm.ActivityInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
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

    // تطبيق وضع ملء الشاشة الحقيقي (Immersive Fullscreen)
    applyImmersiveMode();

    // السماح باتصال ws:// المحلي من صفحة https://localhost
    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().getSettings()
          .setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
  }

  @Override
  public void onResume() {
    super.onResume();
    // تأكيد الاتجاه الأفقي الحقيقي للنشاط عند العودة للتطبيق
    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    // إعادة تطبيق وضع ملء الشاشة عند استعادة النشاط
    applyImmersiveMode();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    // إعادة تطبيق وضع ملء الشاشة عند استعادة نافذة التطبيق للتركيز
    if (hasFocus) {
      applyImmersiveMode();
    }
  }

  /**
   * تفعيل وضع Immersive Fullscreen لإخفاء شريط الحالة وشريط التنقل
   * مع السماح بإظهارهما مؤقتاً بالسحب (BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE / IMMERSIVE_STICKY).
   */
  private void applyImmersiveMode() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsetsController insetsController = getWindow().getInsetsController();
      if (insetsController != null) {
        insetsController.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
        insetsController.setSystemBarsBehavior(
            WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
      }
    } else {
      View decorView = getWindow().getDecorView();
      if (decorView != null) {
        int flags = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN;
        decorView.setSystemUiVisibility(flags);
      }
    }
  }
}
