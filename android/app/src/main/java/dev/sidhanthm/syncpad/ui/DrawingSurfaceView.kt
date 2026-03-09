package dev.sidhanthm.syncpad.ui

import dev.sidhanthm.syncpad.model.Stroke
import dev.sidhanthm.syncpad.model.StrokePoint
import dev.sidhanthm.syncpad.model.StrokeSerializer
import android.content.Context
import android.util.AttributeSet
import android.view.SurfaceHolder
import android.view.SurfaceView

class DrawingSurfaceView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : SurfaceView(context, attrs), SurfaceHolder.Callback {

    private var renderThread: RenderThread? = null
    private var isRunning = false
    private var activeStroke: Stroke? = null
    var strokeEventListener: StrokeEventListener? = null

    private val activePaint = android.graphics.Paint().apply {
        isAntiAlias = true
        style = android.graphics.Paint.Style.STROKE
        strokeJoin = android.graphics.Paint.Join.ROUND
        strokeCap = android.graphics.Paint.Cap.ROUND
        color = android.graphics.Color.WHITE
        strokeWidth = 8f
    }

    private val pathLock = Any()
    private var committedBitmap: android.graphics.Bitmap? = null
    private var committedCanvas: android.graphics.Canvas? = null
    private val activePath = android.graphics.Path()
    private var lastX = 0f
    private var lastY = 0f

    init {
        holder.addCallback(this)
        setZOrderOnTop(false)
    }

    private inner class RenderThread : Thread("SyncPad-RenderThread") {
        override fun run() {
            while (isRunning) {
                val canvas = holder.lockCanvas() ?: continue
                try {
                    drawFrame(canvas)
                } finally {
                    holder.unlockCanvasAndPost(canvas)
                }
            }
        }
    }

    private fun drawFrame(canvas: android.graphics.Canvas) {
        synchronized(pathLock) {
            committedBitmap?.let { canvas.drawBitmap(it, 0f, 0f, null) }
            canvas.drawPath(activePath, activePaint)
        }
    }

    override fun onTouchEvent(event: android.view.MotionEvent): Boolean {
        if (event.getToolType(0) == android.view.MotionEvent.TOOL_TYPE_FINGER) return false

        when (event.actionMasked) {
            android.view.MotionEvent.ACTION_DOWN -> {
                val stroke = Stroke(
                    strokeId = java.util.UUID.randomUUID().toString(),
                    pageId = "page-1",
                    color = "#FFFFFF",
                    brushSize = 8f
                )
                activeStroke = stroke
                val point = StrokePoint(event.x, event.y, event.pressure, event.eventTime)
                synchronized(pathLock) {
                    activePath.moveTo(event.x, event.y)
                }
                lastX = event.x
                lastY = event.y
                strokeEventListener?.onStrokeEvent(StrokeSerializer.serializeStart(stroke, point))
            }
            android.view.MotionEvent.ACTION_MOVE -> {
                synchronized(pathLock) {
                    for (i in 0 until event.historySize) {
                        val point = StrokePoint(
                            event.getHistoricalX(0, i),
                            event.getHistoricalY(0, i),
                            event.getHistoricalPressure(0, i),
                            event.getHistoricalEventTime(i)
                        )
                        activePath.lineTo(point.x, point.y)
                        activeStroke?.let {
                            strokeEventListener?.onStrokeEvent(StrokeSerializer.serializeMove(it, point))
                        }
                    }
                    val point = StrokePoint(event.x, event.y, event.pressure, event.eventTime)
                    activePath.lineTo(point.x, point.y)
                    activeStroke?.let {
                        strokeEventListener?.onStrokeEvent(StrokeSerializer.serializeMove(it, point))
                    }
                }
                lastX = event.x
                lastY = event.y
            }
            android.view.MotionEvent.ACTION_UP -> {
                synchronized(pathLock) {
                    activePath.lineTo(event.x, event.y)
                    committedCanvas?.drawPath(activePath, activePaint)
                    activePath.reset()
                }
                activeStroke?.let {
                    strokeEventListener?.onStrokeEvent(StrokeSerializer.serializeEnd(it, event.eventTime))
                }
                activeStroke = null
            }
        }
        return true
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        isRunning = true
        renderThread = RenderThread().also { it.start() }
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        val newBitmap = android.graphics.Bitmap.createBitmap(width, height, android.graphics.Bitmap.Config.ARGB_8888)
        val newCanvas = android.graphics.Canvas(newBitmap)
        newCanvas.drawColor(android.graphics.Color.parseColor("#1A1A1A"))
        synchronized(pathLock) {
            committedBitmap = newBitmap
            committedCanvas = newCanvas
        }
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        isRunning = false
        renderThread?.join()
        renderThread = null
    }

    interface StrokeEventListener {
        fun onStrokeEvent(json: String)
    }
}