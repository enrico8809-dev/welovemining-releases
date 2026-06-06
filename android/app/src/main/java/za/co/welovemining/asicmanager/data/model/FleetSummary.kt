package za.co.welovemining.asicmanager.data.model

/** Aggregated view of the whole fleet, computed from individual [MinerStats]. */
data class FleetSummary(
    val totalMiners: Int,
    val onlineMiners: Int,
    val offlineMiners: Int,
    val totalHashrateThs: Double,
    val totalPowerW: Double,
    val avgEfficiencyJTh: Double,
    val maxTempC: Double,
    val avgTempC: Double,
    val hydroMiners: Int,
    /** Average coolant delta across hydro miners, or null if none. */
    val avgCoolantDeltaC: Double?,
) {
    companion object {
        fun from(items: List<MinerWithStats>): FleetSummary {
            val stats = items.mapNotNull { it.stats }
            val online = stats.filter { it.isOnline }
            val totalHash = online.sumOf { it.hashrateThs }
            val totalPower = online.sumOf { it.powerW }
            val temps = online.map { it.maxTempC }.filter { it > 0 }
            val hydro = online.mapNotNull { it.hydro }
            return FleetSummary(
                totalMiners = items.size,
                onlineMiners = online.size,
                offlineMiners = items.size - online.size,
                totalHashrateThs = totalHash,
                totalPowerW = totalPower,
                avgEfficiencyJTh = if (totalHash > 0) totalPower / totalHash else 0.0,
                maxTempC = temps.maxOrNull() ?: 0.0,
                avgTempC = if (temps.isNotEmpty()) temps.average() else 0.0,
                hydroMiners = hydro.size,
                avgCoolantDeltaC = if (hydro.isNotEmpty()) hydro.map { it.deltaTempC }.average() else null,
            )
        }

        val EMPTY = FleetSummary(0, 0, 0, 0.0, 0.0, 0.0, 0.0, 0.0, 0, null)
    }
}
