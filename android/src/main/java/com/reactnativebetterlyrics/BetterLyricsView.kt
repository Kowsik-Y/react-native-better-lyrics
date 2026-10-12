package com.reactnativebetterlyrics

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.PI
import kotlin.math.sin

data class WordTimestamp(
  val text: String,
  val startTimeMs: Long,
  val endTimeMs: Long
)

data class NativeLyricLine(
  val time: Long,
  val endTime: Long,
  val text: String,
  val words: List<WordTimestamp>?,
  val agent: String? = null,
  val isBackground: Boolean = false,
  val translation: String? = null,
  val romanization: String? = null
)

class BetterLyricsView(context: Context) : ScrollView(context) {
  private val contentContainer: LinearLayout
  private val linesList = mutableListOf<NativeLyricLine>()
  private val rowViews = mutableListOf<NativeLyricRowView>()

  private var currentTimeMs: Long = 0L
  private var activeColor: Int = Color.WHITE
  private var inactiveColor: Int = Color.parseColor("#70FFFFFF")
  private var baseTextSizeSp: Float = 24f
  private var lineSpacingFactor: Float = 1.15f
  private var enableWordAnimation: Boolean = true
  private var autoScrollEnabled: Boolean = true

  private var currentActiveIndex = -1
  private var isUserScrolling = false
  private val scrollResumeHandler = Handler(Looper.getMainLooper())
  private val scrollResumeRunnable = Runnable { isUserScrolling = false }

  private var baseTimeMs: Long = 0L
  private var baseTimestampMs: Long = 0L
  private var isTickerActive: Boolean = false

  private val tickerRunnable = object : Runnable {
    override fun run() {
      if (!isAttachedToWindow || linesList.isEmpty()) {
        isTickerActive = false
        return
      }
      val elapsed = android.os.SystemClock.elapsedRealtime() - baseTimestampMs
      // Smoothly extrapolate up to 2.5s after last sync
      if (elapsed in 0..2500) {
        val estimatedTime = baseTimeMs + elapsed
        currentTimeMs = estimatedTime
        updateActiveState(forceScroll = false)
        postOnAnimation(this)
      } else {
        isTickerActive = false
      }
    }
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    removeCallbacks(tickerRunnable)
    isTickerActive = false
  }

  init {
    isVerticalScrollBarEnabled = false
    overScrollMode = OVER_SCROLL_NEVER

    contentContainer = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LayoutParams(
        LayoutParams.MATCH_PARENT,
        LayoutParams.WRAP_CONTENT
      )
    }
    addView(contentContainer)
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    val verticalPadding = (h / 2) - dpToPx(32)
    contentContainer.setPadding(dpToPx(16), verticalPadding.coerceAtLeast(dpToPx(60)), dpToPx(16), verticalPadding.coerceAtLeast(dpToPx(60)))
  }

  @SuppressLint("ClickableViewAccessibility")
  override fun onTouchEvent(ev: MotionEvent): Boolean {
    when (ev.actionMasked) {
      MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
        isUserScrolling = true
        scrollResumeHandler.removeCallbacks(scrollResumeRunnable)
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        scrollResumeHandler.postDelayed(scrollResumeRunnable, 2500L)
      }
    }
    return super.onTouchEvent(ev)
  }

  fun setLyricsJson(jsonStr: String?) {
    linesList.clear()
    contentContainer.removeAllViews()
    rowViews.clear()

    if (jsonStr.isNullOrBlank()) return

    try {
      val parsedLines = mutableListOf<NativeLyricLine>()
      val jsonArray = if (jsonStr.trim().startsWith("[")) {
        JSONArray(jsonStr)
      } else {
        val rootObj = JSONObject(jsonStr)
        rootObj.optJSONArray("lines") ?: JSONArray()
      }

      for (i in 0 until jsonArray.length()) {
        val item = jsonArray.getJSONObject(i)
        val startMs = item.optLong("startMs", item.optLong("time", 0L))
        val endMs = item.optLong("endMs", startMs + 3500L)
        val text = item.optString("text", "")
        val agent = item.optString("agent", "").ifEmpty { null }
        val isBackground = item.optBoolean("isBackground", false)
        val translation = item.optString("translation", "").ifEmpty { null }
        val romanization = item.optString("romanization", "").ifEmpty { null }

        val wordsArray = item.optJSONArray("words")
        val wordsList = if (wordsArray != null && wordsArray.length() > 0) {
          val wList = mutableListOf<WordTimestamp>()
          for (w in 0 until wordsArray.length()) {
            val wObj = wordsArray.getJSONObject(w)
            val wText = wObj.optString("text", "")
            val wStart = wObj.optLong("startMs", 0L)
            val wEnd = wObj.optLong("endMs", wStart + 300L)
            wList.add(WordTimestamp(wText, wStart, wEnd))
          }
          wList
        } else null

        parsedLines.add(
          NativeLyricLine(
            time = startMs,
            endTime = endMs,
            text = text,
            words = wordsList,
            agent = agent,
            isBackground = isBackground,
            translation = translation,
            romanization = romanization
          )
        )
      }

      parsedLines.sortBy { it.time }

      // Clamp consecutive line end times so no two main lines ever overlap
      for (i in 0 until parsedLines.size - 1) {
        val cur = parsedLines[i]
        val next = parsedLines[i + 1]
        if (!cur.isBackground && cur.endTime > next.time) {
          parsedLines[i] = cur.copy(endTime = next.time)
        }
      }

      linesList.addAll(parsedLines)

      // Build views for each line
      linesList.forEachIndexed { index, line ->
        val rowView = NativeLyricRowView(context, line, index).apply {
          setActiveColor(this@BetterLyricsView.activeColor)
          setInactiveColor(this@BetterLyricsView.inactiveColor)
          setTextSizeSp(this@BetterLyricsView.baseTextSizeSp)
          setLineSpacing(this@BetterLyricsView.lineSpacingFactor)
          setEnableWordAnimation(this@BetterLyricsView.enableWordAnimation)
          setOnRowClickListener { clickedIndex, timeMs ->
            emitLinePress(clickedIndex, timeMs)
          }
        }
        rowViews.add(rowView)
        contentContainer.addView(rowView)
      }

      updateActiveState(forceScroll = true)
    } catch (e: Exception) {
      // Ignore invalid JSON payloads safely
    }
  }

  fun setCurrentTime(timeMs: Long) {
    baseTimeMs = timeMs
    baseTimestampMs = android.os.SystemClock.elapsedRealtime()
    currentTimeMs = timeMs
    updateActiveState(forceScroll = false)

    if (!isTickerActive) {
      isTickerActive = true
      postOnAnimation(tickerRunnable)
    }
  }

  fun setTextColor(color: Int) {
    activeColor = color
    rowViews.forEach { it.setActiveColor(color) }
  }

  fun setActiveColor(color: Int) {
    activeColor = color
    rowViews.forEach { it.setActiveColor(color) }
  }

  fun setInactiveColor(color: Int) {
    inactiveColor = color
    rowViews.forEach { it.setInactiveColor(color) }
  }

  fun setTextSize(size: Float) {
    baseTextSizeSp = size
    rowViews.forEach { it.setTextSizeSp(size) }
  }

  fun setLineSpacing(spacing: Float) {
    lineSpacingFactor = spacing
    rowViews.forEach { it.setLineSpacing(spacing) }
  }

  fun setEnableWordAnimation(enabled: Boolean) {
    enableWordAnimation = enabled
    rowViews.forEach { it.setEnableWordAnimation(enabled) }
  }

  fun setAutoScroll(enabled: Boolean) {
    autoScrollEnabled = enabled
  }

  private fun updateActiveState(forceScroll: Boolean = false) {
    if (linesList.isEmpty()) return

    // Find the currently singing line (exact one line)
    var newIndex = linesList.indexOfLast { it.time <= currentTimeMs }
    if (newIndex == -1) newIndex = 0

    val indexChanged = newIndex != currentActiveIndex
    currentActiveIndex = newIndex

    // Update each row with distance from current line & current time
    rowViews.forEachIndexed { i, row ->
      val distance = kotlin.math.abs(i - currentActiveIndex)
      val isActive = i == currentActiveIndex
      row.updateState(currentTimeMs, isActive, distance)
    }

    if ((indexChanged || forceScroll) && autoScrollEnabled && !isUserScrolling) {
      scrollToActiveLine(currentActiveIndex)
    }
  }

  private fun scrollToActiveLine(index: Int) {
    if (index !in rowViews.indices) return
    val row = rowViews[index]
    post {
      val targetY = row.top - (height / 2) + (row.height / 2)
      smoothScrollTo(0, targetY.coerceAtLeast(0))
    }
  }

  private fun emitLinePress(index: Int, timeMs: Long) {
    val event = Arguments.createMap().apply {
      putInt("index", index)
      putDouble("timeMs", timeMs.toDouble())
    }
    val reactContext = context as? ReactContext
    reactContext?.getJSModule(RCTEventEmitter::class.java)?.receiveEvent(
      id,
      "topLinePress",
      event
    )
  }

  private fun dpToPx(dp: Int): Int {
    return (dp * resources.displayMetrics.density).toInt()
  }
}

/**
 * Custom line row view mirroring Echo-Music's EchoMusicLyrics line behavior:
 * - Proportional word timing if words are missing
 * - Sinusoidal bounce & micro-scale
 * - Horizontal gradient karaoke wipe
 * - Glow text shadow
 * - Duet agent alignment (v1 -> left, v2 -> right, v1000/background -> center)
 * - Romanization & translation sub-labels
 */
class NativeLyricRowView(
  context: Context,
  val line: NativeLyricLine,
  val lineIndex: Int
) : LinearLayout(context) {

  private val wordsContainer: FlowLayout
  private val wordViews = mutableListOf<NativeLyricWordView>()
  private var romanizationView: TextView? = null
  private var translationView: TextView? = null

  private var onRowClickListener: ((Int, Long) -> Unit)? = null
  private var isActive = false
  private var currentAlpha = 0.35f
  private var currentScale = 0.88f

  init {
    orientation = VERTICAL
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
      setMargins(0, dpToPx(8), 0, dpToPx(8))
    }
    setPadding(dpToPx(12), dpToPx(6), dpToPx(12), dpToPx(6))

    // Determine horizontal alignment according to Echo-Music agent rules
    val gravity = when {
      line.isBackground || line.agent == "v1000" -> Gravity.CENTER_HORIZONTAL
      line.agent == "v1" -> Gravity.START
      line.agent == "v2" -> Gravity.END
      else -> Gravity.CENTER_HORIZONTAL
    }
    this.gravity = gravity

    wordsContainer = FlowLayout(context).apply {
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
      this.gravity = gravity
    }
    addView(wordsContainer)

    // Build word timestamps (exact or proportional character estimation from Echo-Music)
    val effectiveWords = line.words ?: estimateProportionalWords(line)
    effectiveWords.forEachIndexed { idx, word ->
      val wordView = NativeLyricWordView(context, word.text, word.startTimeMs, word.endTimeMs, isLast = idx == effectiveWords.lastIndex).apply {
        if (line.isBackground) {
          setIsBackground(true)
        }
      }
      wordViews.add(wordView)
      wordsContainer.addView(wordView)
    }

    // Romanization text
    if (!line.romanization.isNullOrBlank()) {
      romanizationView = TextView(context).apply {
        text = line.romanization
        setTextColor(Color.parseColor("#99FFFFFF"))
        textSize = 14f
        this.gravity = gravity
        setPadding(0, dpToPx(2), 0, 0)
      }
      addView(romanizationView)
    }

    // Translation text
    if (!line.translation.isNullOrBlank()) {
      translationView = TextView(context).apply {
        text = line.translation
        setTextColor(Color.parseColor("#CCFFFFFF"))
        textSize = 16f
        this.gravity = gravity
        setPadding(0, dpToPx(4), 0, 0)
      }
      addView(translationView)
    }

    setOnClickListener {
      onRowClickListener?.invoke(lineIndex, line.time)
    }
  }

  fun setOnRowClickListener(listener: (Int, Long) -> Unit) {
    onRowClickListener = listener
  }

  fun setActiveColor(color: Int) {
    wordViews.forEach { it.setActiveColor(color) }
  }

  fun setInactiveColor(color: Int) {
    wordViews.forEach { it.setInactiveColor(color) }
  }

  fun setTextSizeSp(sp: Float) {
    wordViews.forEach { it.setTextSizeSp(sp) }
    romanizationView?.textSize = sp * 0.65f
    translationView?.textSize = sp * 0.7f
  }

  fun setLineSpacing(factor: Float) {
    wordsContainer.lineSpacingFactor = factor
  }

  fun setEnableWordAnimation(enabled: Boolean) {
    wordViews.forEach { it.setEnableWordAnimation(enabled) }
  }

  fun updateState(currentTimeMs: Long, active: Boolean, distance: Int) {
    isActive = active
    val targetAlpha = when {
      active -> 1.0f
      distance == 1 -> 0.65f
      distance == 2 -> 0.45f
      else -> 0.35f
    }
    val targetScale = if (active) 1.0f else 0.88f

    if (currentAlpha != targetAlpha || currentScale != targetScale) {
      currentAlpha = targetAlpha
      currentScale = targetScale
      animate()
        .alpha(targetAlpha)
        .scaleX(targetScale)
        .scaleY(targetScale)
        .setDuration(250L)
        .setInterpolator(DecelerateInterpolator())
        .start()
    }

    // Only update word timers if this row is currently active or adjacent
    if (active || distance <= 1) {
      wordViews.forEach { it.updateTime(currentTimeMs, active) }
    }
  }

  private fun estimateProportionalWords(l: NativeLyricLine): List<WordTimestamp> {
    val rawWords = l.text.split(" ").filter { it.isNotEmpty() }
    if (rawWords.isEmpty()) return emptyList()

    val duration = (l.endTime - l.time).coerceAtLeast(300L)
    val activeDuration = (duration * 0.95).toLong().coerceAtLeast(300L)
    val totalChars = l.text.length
    var accumulated = 0L

    return rawWords.mapIndexed { index, word ->
      val wordLen = word.length
      val charCount = if (index < rawWords.size - 1) wordLen + 1 else wordLen
      val wordStart = accumulated
      val wordDur = if (totalChars > 0) ((activeDuration * charCount).toFloat() / totalChars).toLong() else activeDuration
      val wordEnd = wordStart + wordDur.coerceAtLeast(50L)
      accumulated += wordDur
      WordTimestamp(word, l.time + wordStart, l.time + wordEnd)
    }
  }

  private fun dpToPx(dp: Int): Int = (dp * resources.displayMetrics.density).toInt()
}

/**
 * Individual Word rendering view with horizontal gradient shader, bounce, and glow
 */
class NativeLyricWordView(
  context: Context,
  val wordText: String,
  val startTimeMs: Long,
  val endTimeMs: Long,
  val isLast: Boolean
) : View(context) {

  private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
  }

  private var activeColor: Int = Color.WHITE
  private var inactiveColor: Int = Color.parseColor("#70FFFFFF")
  private var textSizeSp: Float = 24f
  private var isBackground: Boolean = false
  private var enableWordAnimation: Boolean = true

  private var wordProgress: Float = 0f
  private var isWordActive: Boolean = false
  private var isLineActiveState: Boolean = false
  private val displayString = if (isLast) wordText else "$wordText "

  init {
    updatePaint()
  }

  fun setIsBackground(bg: Boolean) {
    isBackground = bg
    if (bg) {
      textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.ITALIC)
    }
    requestLayout()
  }

  fun setActiveColor(c: Int) {
    activeColor = c
    updatePaint()
    invalidate()
  }

  fun setInactiveColor(c: Int) {
    inactiveColor = c
    updatePaint()
    invalidate()
  }

  fun setTextSizeSp(sp: Float) {
    textSizeSp = sp
    updatePaint()
    requestLayout()
  }

  fun setEnableWordAnimation(enabled: Boolean) {
    enableWordAnimation = enabled
    invalidate()
  }

  private fun updatePaint() {
    val density = resources.displayMetrics.density
    val finalSp = if (isBackground) textSizeSp * 0.85f else textSizeSp
    textPaint.textSize = finalSp * density
  }

  fun updateTime(currentTimeMs: Long, isLineActive: Boolean) {
    isLineActiveState = isLineActive
    val duration = (endTimeMs - startTimeMs).coerceAtLeast(1L)
    val progress = when {
      !isLineActive -> 0f
      currentTimeMs >= endTimeMs -> 1f
      currentTimeMs < startTimeMs -> 0f
      else -> ((currentTimeMs - startTimeMs).toFloat() / duration).coerceIn(0f, 1f)
    }

    val active = isLineActive && currentTimeMs in startTimeMs until endTimeMs
    val changed = progress != wordProgress || active != isWordActive
    wordProgress = progress
    isWordActive = active

    if (changed) {
      if (active) {
        val density = resources.displayMetrics.density
        val sinVal = sin(progress * PI).toFloat()
        translationY = -4f * density * sinVal
        val s = 1f + 0.02f * sinVal
        scaleX = s
        scaleY = s
      } else {
        translationY = 0f
        scaleX = 1f
        scaleY = 1f
      }
      invalidate()
    }
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val textWidth = textPaint.measureText(displayString)
    val fontMetrics = textPaint.fontMetrics
    val textHeight = fontMetrics.bottom - fontMetrics.top
    setMeasuredDimension(
      resolveSize(textWidth.toInt() + 2, widthMeasureSpec),
      resolveSize((textHeight * 1.35f).toInt(), heightMeasureSpec)
    )
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val fontMetrics = textPaint.fontMetrics
    val baseline = -fontMetrics.top

    // Crucial: Only the currently active line can ever draw activeColor! Non-active rows ALWAYS draw inactiveColor!
    if (!isLineActiveState || !enableWordAnimation || wordProgress <= 0f) {
      textPaint.shader = null
      textPaint.color = inactiveColor
      textPaint.clearShadowLayer()
      canvas.drawText(displayString, 0f, baseline, textPaint)
      return
    }

    if (wordProgress >= 1f) {
      textPaint.shader = null
      textPaint.color = activeColor
      textPaint.clearShadowLayer()
      canvas.drawText(displayString, 0f, baseline, textPaint)
      return
    }

    // Actively singing: horizontal gradient sweep with glowing shadow
    val width = textPaint.measureText(displayString)
    val p = wordProgress
    val gradient = LinearGradient(
      0f, 0f, width, 0f,
      intArrayOf(activeColor, activeColor, inactiveColor, inactiveColor),
      floatArrayOf(0f, (p - 0.05f).coerceAtLeast(0f), (p + 0.05f).coerceAtMost(1f), 1f),
      Shader.TileMode.CLAMP
    )
    textPaint.shader = gradient

    val glowAlpha = (p * 2f).coerceAtMost(1f) * 0.45f
    if (glowAlpha > 0.05f) {
      val density = resources.displayMetrics.density
      textPaint.setShadowLayer(8f * density, 0f, 0f, activeColor)
    } else {
      textPaint.clearShadowLayer()
    }

    canvas.drawText(displayString, 0f, baseline, textPaint)
  }
}

/**
 * Flexible FlowLayout that arranges words horizontally and wraps across lines cleanly
 */
class FlowLayout(context: Context) : ViewGroup(context) {
  var lineSpacingFactor: Float = 1.15f
  var gravity: Int = Gravity.CENTER_HORIZONTAL

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val targetWidth = MeasureSpec.getSize(widthMeasureSpec) - paddingLeft - paddingRight
    var currentLineWidth = 0
    var currentLineHeight = 0
    var totalHeight = 0

    val childCount = childCount
    for (i in 0 until childCount) {
      val child = getChildAt(i)
      if (child.visibility == GONE) continue

      measureChild(child, widthMeasureSpec, heightMeasureSpec)
      val childWidth = child.measuredWidth
      val childHeight = child.measuredHeight

      if (currentLineWidth + childWidth > targetWidth && currentLineWidth > 0) {
        totalHeight += (currentLineHeight * lineSpacingFactor).toInt()
        currentLineWidth = childWidth
        currentLineHeight = childHeight
      } else {
        currentLineWidth += childWidth
        currentLineHeight = kotlin.math.max(currentLineHeight, childHeight)
      }
    }
    totalHeight += currentLineHeight + paddingTop + paddingBottom
    setMeasuredDimension(
      resolveSize(MeasureSpec.getSize(widthMeasureSpec), widthMeasureSpec),
      resolveSize(totalHeight, heightMeasureSpec)
    )
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val targetWidth = r - l - paddingLeft - paddingRight
    var top = paddingTop

    val lines = mutableListOf<MutableList<View>>()
    var currentLine = mutableListOf<View>()
    var currentLineWidth = 0

    for (i in 0 until childCount) {
      val child = getChildAt(i)
      if (child.visibility == GONE) continue

      val childWidth = child.measuredWidth
      if (currentLineWidth + childWidth > targetWidth && currentLine.isNotEmpty()) {
        lines.add(currentLine)
        currentLine = mutableListOf()
        currentLineWidth = 0
      }
      currentLine.add(child)
      currentLineWidth += childWidth
    }
    if (currentLine.isNotEmpty()) {
      lines.add(currentLine)
    }

    for (lineViews in lines) {
      val lineWidth = lineViews.sumOf { it.measuredWidth }
      val lineHeight = lineViews.maxOfOrNull { it.measuredHeight } ?: 0

      var left = when (gravity) {
        Gravity.START -> paddingLeft
        Gravity.END -> r - l - paddingRight - lineWidth
        else -> paddingLeft + (targetWidth - lineWidth) / 2
      }

      for (child in lineViews) {
        child.layout(left, top, left + child.measuredWidth, top + child.measuredHeight)
        left += child.measuredWidth
      }
      top += (lineHeight * lineSpacingFactor).toInt()
    }
  }
}
