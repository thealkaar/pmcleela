package expo.modules.backgroundreelupload

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.provider.OpenableColumns
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.roundToInt

class ReelUploadService : Service() {
  private val executor = Executors.newSingleThreadExecutor()
  private var activeUploadId: String? = null
  private var activeFileFieldName = "video"
  private var lastNotifiedProgress = -1

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val uploadId = intent?.getStringExtra(EXTRA_UPLOAD_ID)
    val uploadUrl = intent?.getStringExtra(EXTRA_URL)
    val fileUri = intent?.getStringExtra(EXTRA_FILE_URI)
    val fieldsJson = intent?.getStringExtra(EXTRA_FIELDS)
    val headersJson = intent?.getStringExtra(EXTRA_HEADERS)
    val fileFieldName = intent?.getStringExtra(EXTRA_FILE_FIELD_NAME) ?: "video"
    if (uploadId.isNullOrBlank() || uploadUrl.isNullOrBlank() || fileUri.isNullOrBlank() ||
      fieldsJson.isNullOrBlank() || headersJson.isNullOrBlank() ||
      (fileFieldName != "video" && fileFieldName != "audio")) {
      getSharedPreferences(PREFERENCES, 0).edit()
        .putString("status", "failed")
        .putString("error", "The upload request was incomplete.")
        .apply()
      stopSelf(startId)
      return START_NOT_STICKY
    }
    if (activeUploadId == uploadId) return START_NOT_STICKY

    activeUploadId = uploadId
    activeFileFieldName = fileFieldName
    lastNotifiedProgress = -1
    getSharedPreferences(PREFERENCES, 0).edit()
      .putString("uploadId", uploadId)
      .putString("status", "running")
      .putInt("progress", 0)
      .putInt("responseCode", 0)
      .remove("responseBody")
      .remove("error")
      .apply()

    ensureNotificationChannel()
    startForegroundCompat(buildNotification(
      0,
      if (fileFieldName == "audio") "Preparing selected music" else "Preparing your reel"
    ))
    executor.execute {
      performUpload(
        uploadId,
        uploadUrl,
        Uri.parse(fileUri),
        fileFieldName,
        JSONObject(fieldsJson),
        JSONObject(headersJson)
      )
      stopSelf(startId)
    }
    return START_NOT_STICKY
  }

  private fun performUpload(
    uploadId: String,
    uploadUrl: String,
    fileUri: Uri,
    fileFieldName: String,
    fields: JSONObject,
    headers: JSONObject
  ) {
    var connection: HttpURLConnection? = null
    try {
      val boundary = "----LeelaReel${UUID.randomUUID().toString().replace("-", "")}"
      val filename = getFileName(fileUri, fileFieldName)
      val mimeType = contentResolver.getType(fileUri) ?: if (fileFieldName == "audio") "audio/mpeg" else "video/mp4"
      val fileSize = getFileSize(fileUri)
      val prefix = multipartPrefix(fields, boundary)
      val fileHeader = "--$boundary\r\n" +
        "Content-Disposition: form-data; name=\"$fileFieldName\"; filename=\"${quoteHeader(filename)}\"\r\n" +
        "Content-Type: $mimeType\r\n\r\n"
      val suffix = "\r\n--$boundary--\r\n"
      val prefixBytes = prefix.toByteArray(StandardCharsets.UTF_8)
      val headerBytes = fileHeader.toByteArray(StandardCharsets.UTF_8)
      val suffixBytes = suffix.toByteArray(StandardCharsets.UTF_8)
      val contentLength = if (fileSize >= 0) prefixBytes.size.toLong() + headerBytes.size + fileSize + suffixBytes.size else -1L

      connection = (URL(uploadUrl).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        doOutput = true
        connectTimeout = 60000
        readTimeout = 960000
        setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        val headerNames = headers.keys()
        while (headerNames.hasNext()) {
          val name = headerNames.next()
          setRequestProperty(name, headers.optString(name))
        }
        if (contentLength >= 0) {
          setFixedLengthStreamingMode(contentLength)
        } else {
          setChunkedStreamingMode(BUFFER_SIZE)
        }
      }

      val input = contentResolver.openInputStream(fileUri)
        ?: throw IllegalStateException("Could not open the selected file.")
      input.use { source ->
        BufferedOutputStream(connection.outputStream, BUFFER_SIZE).use { output ->
          output.write(prefixBytes)
          output.write(headerBytes)
          val totalBytes = if (fileSize > 0) fileSize else -1L
          val buffer = ByteArray(BUFFER_SIZE)
          var sent = 0L
          BufferedInputStream(source, BUFFER_SIZE).use { video ->
            while (true) {
              val read = video.read(buffer)
              if (read < 0) break
              output.write(buffer, 0, read)
              sent += read
              if (totalBytes > 0) {
                val progress = (sent * 99.0 / totalBytes).roundToInt().coerceIn(0, 99)
                updateProgress(uploadId, progress)
              }
            }
          }
          output.write(suffixBytes)
          output.flush()
        }
      }

      val responseCode = connection.responseCode
      val responseStream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
      val responseBody = responseStream?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() } ?: ""
      if (responseCode !in 200..299) {
        throw UploadResponseException(responseCode, responseBody)
      }
      val responseJson = JSONObject(responseBody)
      if (!responseJson.optBoolean("success", false)) {
        throw IllegalStateException(responseJson.optString("message", "The server rejected the reel upload."))
      }

      getSharedPreferences(PREFERENCES, 0).edit()
        .putString("status", "completed")
        .putInt("progress", 100)
        .putInt("responseCode", responseCode)
        .putString("responseBody", responseBody)
        .remove("error")
        .apply()
      updateProgress(uploadId, 100)
      if (fileFieldName == "audio") {
        showFinishedNotification("Music ready", "Selected music is ready for your reel.", completed = true)
      } else {
        showFinishedNotification("Reel published", "Your reel is live on Leela.", completed = true)
      }
    } catch (error: Exception) {
      getSharedPreferences(PREFERENCES, 0).edit()
        .putString("status", "failed")
        .putString("error", error.message ?: "The selected file could not be uploaded.")
        .putInt("responseCode", (error as? UploadResponseException)?.responseCode ?: 0)
        .putString("responseBody", (error as? UploadResponseException)?.responseBody ?: "")
        .apply()
      showFinishedNotification(
        if (fileFieldName == "audio") "Music upload failed" else "Reel upload failed",
        if (fileFieldName == "audio") {
          "Could not upload your selected music. Open Leela and try again on a stable connection."
        } else {
          "Could not publish your reel. Open Leela and try again on a stable connection."
        },
        completed = false
      )
    } finally {
      connection?.disconnect()
      activeUploadId = null
      stopForeground(STOP_FOREGROUND_DETACH)
    }
  }

  private fun multipartPrefix(fields: JSONObject, boundary: String): String {
    val output = StringBuilder()
    val keys = fields.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val value = fields.optString(key)
      output.append("--").append(boundary).append("\r\n")
        .append("Content-Disposition: form-data; name=\"").append(quoteHeader(key)).append("\"\r\n\r\n")
        .append(value).append("\r\n")
    }
    return output.toString()
  }

  private fun getFileName(uri: Uri, fileFieldName: String): String {
    if (uri.scheme == "content") {
      contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (index >= 0) return cursor.getString(index)
        }
      }
    }
    return uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() }
      ?: if (fileFieldName == "audio") "selected-audio" else "reel.mp4"
  }

  private fun getFileSize(uri: Uri): Long {
    return try {
      contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
          if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
            val size = cursor.getLong(sizeIndex)
            if (size >= 0) return size
          }
        }
      }
      contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
    } catch (_: Exception) {
      -1L
    }
  }

  private fun quoteHeader(value: String): String =
    value.replace("\\", "_").replace("\"", "_").replace("\r", "_").replace("\n", "_")

  private fun updateProgress(uploadId: String, progress: Int) {
    getSharedPreferences(PREFERENCES, 0).edit().putInt("progress", progress).apply()
    if (progress == 100 || progress >= lastNotifiedProgress + 2) {
      lastNotifiedProgress = progress
      val manager = getSystemService(NotificationManager::class.java)
      val message = if (progress >= 99) "Finishing video processing" else "$progress% uploaded"
      manager.notify(NOTIFICATION_ID, buildNotification(progress, message))
    }
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Reel uploads", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shows progress while your reel is publishing"
        }
      )
    }
  }

  private fun buildNotification(progress: Int, message: String, title: String? = null): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = launchIntent?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val defaultTitle = if (activeFileFieldName == "audio") {
      if (progress >= 99) "Finishing music upload" else "Uploading selected music"
    } else if (progress >= 99) {
      "Finishing your reel"
    } else {
      "Publishing your reel"
    }
    builder.setSmallIcon(android.R.drawable.stat_sys_upload)
      .setContentTitle(title ?: defaultTitle)
      .setContentText(message)
      .setOnlyAlertOnce(true)
      .setOngoing(progress < 100)
      .setCategory(Notification.CATEGORY_PROGRESS)
      .setProgress(100, progress.coerceIn(0, 100), false)
      .setContentIntent(pendingIntent)
    return builder.build()
  }

  private fun showFinishedNotification(title: String, message: String, completed: Boolean) {
    val manager = getSystemService(NotificationManager::class.java)
    manager.notify(
      NOTIFICATION_ID,
      buildNotification(if (completed) 100 else 0, message.take(120), title).also {
        it.flags = it.flags and Notification.FLAG_ONGOING_EVENT.inv()
      }
    )
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  override fun onDestroy() {
    executor.shutdown()
    super.onDestroy()
  }

  private class UploadResponseException(val responseCode: Int, val responseBody: String) :
    IllegalStateException("Server returned HTTP $responseCode.")

  companion object {
    const val PREFERENCES = "leela_reel_upload"
    const val EXTRA_UPLOAD_ID = "upload_id"
    const val EXTRA_URL = "upload_url"
    const val EXTRA_FILE_URI = "file_uri"
    const val EXTRA_FILE_FIELD_NAME = "file_field_name"
    const val EXTRA_FIELDS = "fields"
    const val EXTRA_HEADERS = "headers"
    private const val CHANNEL_ID = "leela-reel-upload"
    private const val NOTIFICATION_ID = 7411
    private const val BUFFER_SIZE = 64 * 1024
  }
}
