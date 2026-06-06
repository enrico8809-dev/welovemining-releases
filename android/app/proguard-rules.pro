# Keep kotlinx.serialization generated serializers
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class **$$serializer { *; }
-keepclasseswithmembers class za.co.welovemining.asicmanager.** {
    *** Companion;
}
-keepclasseswithmembers @kotlinx.serialization.Serializable class za.co.welovemining.asicmanager.** {
    <fields>;
}

# Retrofit / OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn retrofit2.**
-keepattributes Signature, Exceptions
