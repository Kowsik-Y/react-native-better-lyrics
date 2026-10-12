package com.reactnativebetterlyrics

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class BetterLyricsViewManager : SimpleViewManager<BetterLyricsView>() {
  override fun getName(): String {
    return "BetterLyricsView"
  }

  override fun createViewInstance(reactContext: ThemedReactContext): BetterLyricsView {
    return BetterLyricsView(reactContext)
  }

  @ReactProp(name = "lyricsJson")
  fun setLyricsJson(view: BetterLyricsView, json: String?) {
    view.setLyricsJson(json)
  }

  @ReactProp(name = "currentTime")
  fun setCurrentTime(view: BetterLyricsView, timeMs: Double) {
    view.setCurrentTime(timeMs.toLong())
  }

  @ReactProp(name = "textColor", customType = "Color")
  fun setTextColor(view: BetterLyricsView, color: Int?) {
    if (color != null) {
      view.setTextColor(color)
    }
  }

  @ReactProp(name = "activeColor", customType = "Color")
  fun setActiveColor(view: BetterLyricsView, color: Int?) {
    if (color != null) {
      view.setActiveColor(color)
    }
  }

  @ReactProp(name = "inactiveColor", customType = "Color")
  fun setInactiveColor(view: BetterLyricsView, color: Int?) {
    if (color != null) {
      view.setInactiveColor(color)
    }
  }

  @ReactProp(name = "textSize")
  fun setTextSize(view: BetterLyricsView, size: Float) {
    view.setTextSize(size)
  }

  @ReactProp(name = "lineSpacing")
  fun setLineSpacing(view: BetterLyricsView, spacing: Float) {
    view.setLineSpacing(spacing)
  }

  @ReactProp(name = "enableWordAnimation")
  fun setEnableWordAnimation(view: BetterLyricsView, enabled: Boolean) {
    view.setEnableWordAnimation(enabled)
  }

  @ReactProp(name = "autoScroll")
  fun setAutoScroll(view: BetterLyricsView, enabled: Boolean) {
    view.setAutoScroll(enabled)
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any>? {
    return MapBuilder.of(
      "topLinePress",
      MapBuilder.of("registrationName", "onLinePress")
    )
  }
}
