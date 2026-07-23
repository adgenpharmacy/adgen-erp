# Flutter & Firebase ProGuard Rules
# Keep Pigeon-generated method channel classes (used by firebase_core 3.x+)
-keep class dev.flutter.pigeon.** { *; }
-keepclassmembers class dev.flutter.pigeon.** { *; }

# Keep Firebase classes
-keep class com.google.firebase.** { *; }
-keepclassmembers class com.google.firebase.** { *; }

# Keep Google Play Services classes
-keep class com.google.android.gms.** { *; }
-keepclassmembers class com.google.android.gms.** { *; }

# Keep Flutter plugin classes
-keep class io.flutter.plugins.** { *; }
-keepclassmembers class io.flutter.plugins.** { *; }

# Keep GeneratedPluginRegistrant
-keep class io.flutter.plugins.GeneratedPluginRegistrant { *; }
