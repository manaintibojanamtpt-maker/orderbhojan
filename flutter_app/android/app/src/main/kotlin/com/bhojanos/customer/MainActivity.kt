package com.bhojanos.customer

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.Locale

class MainActivity : FlutterActivity(), TextToSpeech.OnInitListener {
    private val CHANNEL = "com.bhojanos.customer/platform"
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pendingSpeechResult: MethodChannel.Result? = null
    private val SPEECH_REQUEST_CODE = 0xB007

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Initialize Android Text-To-Speech engine
        tts = TextToSpeech(this, this)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "launchUpiIntent" -> {
                    val upiUrl = call.argument<String>("upiUrl")
                    if (upiUrl != null) {
                        try {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(upiUrl))
                            val chooser = Intent.createChooser(intent, "Pay using UPI App")
                            startActivity(chooser)
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("INTENT_ERROR", e.localizedMessage, null)
                        }
                    } else {
                        result.error("INVALID_URL", "UPI URL was null", null)
                    }
                }
                "speak" -> {
                    val text = call.argument<String>("text")
                    val lang = call.argument<String>("lang") ?: "en-IN"
                    if (text != null && ttsReady && tts != null) {
                        try {
                            val loc = when (lang.lowercase()) {
                                "te", "te-in" -> Locale("te", "IN")
                                "hi", "hi-in" -> Locale("hi", "IN")
                                else -> Locale("en", "IN")
                            }
                            tts?.language = loc
                            tts?.setPitch(1.02f)
                            tts?.setSpeechRate(0.96f)
                            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "OB_VOICE_AI")
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("TTS_ERROR", e.localizedMessage, null)
                        }
                    } else {
                        result.success(false)
                    }
                }
                "stopSpeaking" -> {
                    tts?.stop()
                    result.success(true)
                }
                "startListening" -> {
                    pendingSpeechResult = result
                    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak what you want to order (e.g. 2 Masala Dosa add cheyi)...")
                        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    }
                    try {
                        startActivityForResult(intent, SPEECH_REQUEST_CODE)
                    } catch (e: Exception) {
                        pendingSpeechResult?.error("STT_ERROR", e.localizedMessage, null)
                        pendingSpeechResult = null
                    }
                }
                "getCurrentLocation" -> {
                    try {
                        val finePerm = checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                        val coarsePerm = checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                        if (!finePerm && !coarsePerm) {
                            requestPermissions(arrayOf(
                                android.Manifest.permission.ACCESS_FINE_LOCATION,
                                android.Manifest.permission.ACCESS_COARSE_LOCATION
                            ), 0xC001)
                            result.error("PERMISSION_DENIED", "Location permission requested", null)
                            return@setMethodCallHandler
                        }
                        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
                        val hasGps = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                        val hasNetwork = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
                        if (!hasGps && !hasNetwork) {
                            result.error("GPS_DISABLED", "Location services are turned off", null)
                            return@setMethodCallHandler
                        }
                        val lastGps = if (hasGps && finePerm) locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER) else null
                        val lastNet = if (hasNetwork) locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) else null
                        val loc = lastGps ?: lastNet
                        if (loc != null) {
                            result.success(mapOf(
                                "lat" to loc.latitude,
                                "lng" to loc.longitude,
                                "accuracy" to loc.accuracy
                            ))
                        } else {
                            result.error("GPS_UNAVAILABLE", "Could not obtain GPS fix", null)
                        }
                    } catch (e: Exception) {
                        result.error("LOCATION_ERROR", e.localizedMessage, null)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == SPEECH_REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                val results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                val spokenText = results?.firstOrNull() ?: ""
                pendingSpeechResult?.success(spokenText)
            } else {
                pendingSpeechResult?.success("")
            }
            pendingSpeechResult = null
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale("en", "IN")
            ttsReady = true
        }
    }

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}
