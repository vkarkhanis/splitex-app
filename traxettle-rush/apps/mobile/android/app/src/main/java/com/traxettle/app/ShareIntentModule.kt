package com.traxettle.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableNativeMap

class ShareIntentModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ShareIntentModule"

    @ReactMethod
    fun getSharedContent(promise: Promise) {
        try {
            val activity = reactContext.currentActivity
            if (activity == null) {
                promise.resolve(null)
                return
            }
            val intent: Intent? = activity.intent
            val action: String? = intent?.action
            val type: String? = intent?.type

            if (Intent.ACTION_SEND == action && type != null && type.startsWith("image/")) {
                @Suppress("DEPRECATION")
                val uri: Uri? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                } else {
                    intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
                }
                if (uri != null) {
                    val result = WritableNativeMap()
                    result.putString("uri", uri.toString())
                    result.putString("mimeType", type)
                    promise.resolve(result)
                    return
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SHARE_INTENT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun clearIntent(promise: Promise) {
        try {
            val activity = reactContext.currentActivity
            if (activity != null) {
                activity.intent = Intent(Intent.ACTION_MAIN)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLEAR_INTENT_ERROR", e.message, e)
        }
    }
}
