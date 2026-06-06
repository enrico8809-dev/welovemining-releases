package za.co.welovemining.asicmanager.ui.components

import kotlin.math.abs

/** Display formatting for telemetry values. Kept locale-stable and compact. */
object Format {

    /** Hashrate: TH/s up to 1000, then PH/s. */
    fun hashrate(ths: Double): String = when {
        ths >= 1000 -> "%.2f PH/s".format(ths / 1000)
        ths >= 100 -> "%.0f TH/s".format(ths)
        else -> "%.1f TH/s".format(ths)
    }

    /** Hashrate value only (no unit) for big readouts; caller shows the unit. */
    fun hashrateValue(ths: Double): Pair<String, String> = when {
        ths >= 1000 -> "%.2f".format(ths / 1000) to "PH/s"
        ths >= 100 -> "%.0f".format(ths) to "TH/s"
        else -> "%.1f".format(ths) to "TH/s"
    }

    fun power(watts: Double): String = when {
        abs(watts) >= 1000 -> "%.2f kW".format(watts / 1000)
        else -> "%.0f W".format(watts)
    }

    fun temp(celsius: Double): String = "%.0f°".format(celsius)

    fun efficiency(jTh: Double): String = "%.1f J/TH".format(jTh)

    fun flow(lpm: Double): String = "%.1f L/min".format(lpm)

    fun uptime(seconds: Long): String {
        val d = seconds / 86_400
        val h = (seconds % 86_400) / 3_600
        val m = (seconds % 3_600) / 60
        return when {
            d > 0 -> "${d}d ${h}h"
            h > 0 -> "${h}h ${m}m"
            else -> "${m}m"
        }
    }
}
