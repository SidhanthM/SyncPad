package dev.sidhanthm.syncpad.model

import org.json.JSONObject

object StrokeSerializer {

    fun serializeStart(stroke: Stroke, point: StrokePoint): String {
        return JSONObject().apply {
            put("type", "stroke")
            put("phase", "start")
            put("strokeId", stroke.strokeId)
            put("pageId", stroke.pageId)
            put("x", point.x)
            put("y", point.y)
            put("pressure", point.pressure)
            put("timestamp", point.timestamp)
            put("color", stroke.color)
            put("brushSize", stroke.brushSize)
        }.toString()
    }

    fun serializeMove(stroke: Stroke, point: StrokePoint): String {
        return JSONObject().apply {
            put("type", "stroke")
            put("phase", "move")
            put("strokeId", stroke.strokeId)
            put("x", point.x)
            put("y", point.y)
            put("pressure", point.pressure)
            put("timestamp", point.timestamp)
        }.toString()
    }

    fun serializeEnd(stroke: Stroke, timestamp: Long): String {
        return JSONObject().apply {
            put("type", "stroke")
            put("phase", "end")
            put("strokeId", stroke.strokeId)
            put("timestamp", timestamp)
        }.toString()
    }
}