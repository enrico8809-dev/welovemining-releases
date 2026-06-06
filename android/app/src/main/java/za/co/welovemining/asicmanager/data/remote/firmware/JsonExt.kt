package za.co.welovemining.asicmanager.data.remote.firmware

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Forgiving JSON navigation helpers. Miner firmwares change their response
 * shapes between versions, so we read defensively and never assume a key exists.
 */

internal fun JsonElement?.obj(key: String): JsonObject? =
    (this as? JsonObject)?.get(key) as? JsonObject

internal fun JsonElement?.arr(key: String): JsonArray? =
    (this as? JsonObject)?.get(key) as? JsonArray

internal fun JsonElement?.list(key: String): List<JsonElement> = arr(key) ?: emptyList()

internal fun JsonElement?.str(key: String): String? =
    ((this as? JsonObject)?.get(key) as? JsonPrimitive)?.content

internal fun JsonElement?.num(key: String): Double? =
    ((this as? JsonObject)?.get(key) as? JsonPrimitive)?.content?.toDoubleOrNull()

internal fun JsonElement?.bool(key: String): Boolean? =
    ((this as? JsonObject)?.get(key) as? JsonPrimitive)?.content?.toBooleanStrictOrNull()

internal val JsonElement.asNum: Double? get() = (this as? JsonPrimitive)?.content?.toDoubleOrNull()
internal val JsonElement.asText: String? get() = (this as? JsonPrimitive)?.content

/** First value found among several candidate keys (handles cross-version renames). */
internal fun JsonElement?.numAny(vararg keys: String): Double? =
    keys.firstNotNullOfOrNull { num(it) }

internal fun JsonElement?.strAny(vararg keys: String): String? =
    keys.firstNotNullOfOrNull { str(it) }
