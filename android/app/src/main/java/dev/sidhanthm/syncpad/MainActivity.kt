package dev.sidhanthm.syncpad

import android.os.Bundle
import androidx.activity.ComponentActivity
import android.widget.FrameLayout
import dev.sidhanthm.syncpad.ui.DrawingSurfaceView
import okhttp3.*

class MainActivity : ComponentActivity() {

    private val client = OkHttpClient()
    private var ws: WebSocket? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val drawingView = DrawingSurfaceView(this)
        drawingView.strokeEventListener = object : DrawingSurfaceView.StrokeEventListener {
            override fun onStrokeEvent(json: String) {
                ws?.send(json)
            }
        }
        val layout = FrameLayout(this).apply {
            addView(drawingView, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            ))
        }
        setContentView(layout)

        connectWebSocket()
    }

    private fun connectWebSocket() {
        android.util.Log.d("SyncPad", "Attempting connection...")
        val request = Request.Builder()
            .url("ws://192.168.6.9:3000")
            .build()

        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                android.util.Log.d("SyncPad", "Connected")
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                android.util.Log.d("SyncPad", "Received: $text")
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                android.util.Log.e("SyncPad", "Connection failed: ${t::class.java.simpleName}: ${t.message}")
            }
        })
    }

    override fun onDestroy() {
        super.onDestroy()
        ws?.close(1000, "Activity destroyed")
        client.dispatcher.executorService.shutdown()
    }
}