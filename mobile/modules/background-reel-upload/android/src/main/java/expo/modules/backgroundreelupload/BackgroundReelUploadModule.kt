package expo.modules.backgroundreelupload

import android.content.Intent
import android.os.Build
import android.os.Bundle
import java.util.UUID
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BackgroundReelUploadModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BackgroundReelUpload")

    AsyncFunction("startUpload") { url: String, fileUri: String, fields: Map<String, String>, headers: Map<String, String>, fieldName: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("App context is unavailable.")
      if (fieldName != "video" && fieldName != "audio") {
        throw IllegalArgumentException("Unsupported upload file field.")
      }
      val preferences = context.getSharedPreferences(ReelUploadService.PREFERENCES, 0)
      if (preferences.getString("status", "idle") == "running") {
        throw IllegalStateException("A reel upload is already in progress.")
      }

      val uploadId = UUID.randomUUID().toString()
      preferences.edit()
        .putString("uploadId", uploadId)
        .putString("status", "running")
        .putInt("progress", 0)
        .putInt("responseCode", 0)
        .remove("responseBody")
        .remove("error")
        .apply()
      val extras = Bundle().apply {
        putString(ReelUploadService.EXTRA_UPLOAD_ID, uploadId)
        putString(ReelUploadService.EXTRA_URL, url)
        putString(ReelUploadService.EXTRA_FILE_URI, fileUri)
        putString(ReelUploadService.EXTRA_FIELDS, org.json.JSONObject(fields).toString())
        putString(ReelUploadService.EXTRA_HEADERS, org.json.JSONObject(headers).toString())
        putString(ReelUploadService.EXTRA_FILE_FIELD_NAME, fieldName)
      }
      val intent = Intent(context, ReelUploadService::class.java).putExtras(extras)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (error: Exception) {
        preferences.edit().putString("status", "failed").putString("error", error.message).apply()
        throw error
      }
      uploadId
    }

    AsyncFunction("getUploadState") {
      val context = appContext.reactContext ?: throw IllegalStateException("App context is unavailable.")
      val preferences = context.getSharedPreferences(ReelUploadService.PREFERENCES, 0)
      mapOf(
        "uploadId" to (preferences.getString("uploadId", "") ?: ""),
        "status" to (preferences.getString("status", "idle") ?: "idle"),
        "progress" to preferences.getInt("progress", 0),
        "responseCode" to preferences.getInt("responseCode", 0),
        "responseBody" to (preferences.getString("responseBody", "") ?: ""),
        "error" to (preferences.getString("error", "") ?: "")
      )
    }

    AsyncFunction("clearUploadState") {
      val context = appContext.reactContext ?: throw IllegalStateException("App context is unavailable.")
      context.getSharedPreferences(ReelUploadService.PREFERENCES, 0).edit().clear().apply()
      null
    }
  }
}
