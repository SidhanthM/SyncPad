package dev.sidhanthm.syncpad.model

data class StrokePoint(
    val x: Float,
    val y: Float,
    val pressure: Float,
    val timestamp: Long
)

data class Stroke(
    val strokeId: String,
    val pageId: String,
    val color: String,
    val brushSize: Float,
    val points: MutableList<StrokePoint> = mutableListOf()
)

enum class StrokePhase { START, MOVE, END }