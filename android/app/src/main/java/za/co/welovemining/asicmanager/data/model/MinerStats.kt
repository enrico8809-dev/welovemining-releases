package za.co.welovemining.asicmanager.data.model

/** Online/offline/error state for a miner at poll time. */
enum class MinerState { ONLINE, WARNING, OFFLINE, ERROR }

/** Per-hashboard readings. */
data class BoardStat(
    val index: Int,
    val hashrateThs: Double,
    val chipTempC: Double,
    val boardTempC: Double,
    val chipsWorking: Int,
    val chipsTotal: Int,
    val frequencyMhz: Double = 0.0,
    val voltageMv: Double = 0.0,
)

/** Coolant loop readings for hydro miners. */
data class HydroStat(
    val inletTempC: Double,
    val outletTempC: Double,
    val flowLpm: Double,
    val pumpRpm: Int = 0,
) {
    val deltaTempC: Double get() = outletTempC - inletTempC
}

data class PoolStat(
    val index: Int,
    val url: String,
    val user: String,
    val status: String,
    val accepted: Long,
    val rejected: Long,
)

/**
 * A normalized snapshot of one miner's live readings. Every firmware adapter
 * maps its native response into this single shape so the UI never has to care
 * which firmware produced it.
 */
data class MinerStats(
    val minerId: String,
    val state: MinerState,
    /** Real-time hashrate in TH/s. */
    val hashrateThs: Double,
    /** Averaged hashrate in TH/s (e.g. 15m / nominal). */
    val avgHashrateThs: Double,
    /** Wall power draw in watts. */
    val powerW: Double,
    /** Efficiency in J/TH (power / hashrate). */
    val efficiencyJTh: Double,
    /** Hottest chip/board temperature in °C across all boards. */
    val maxTempC: Double,
    val boards: List<BoardStat>,
    val fanRpms: List<Int>,
    val hydro: HydroStat?,
    val pools: List<PoolStat>,
    val uptimeSeconds: Long,
    /** Firmware-reported model string, when available. */
    val model: String = "",
    val firmwareVersion: String = "",
    /** Epoch millis when this snapshot was taken. */
    val timestamp: Long = System.currentTimeMillis(),
    val errorMessage: String? = null,
) {
    val isOnline: Boolean get() = state == MinerState.ONLINE || state == MinerState.WARNING

    companion object {
        fun offline(minerId: String, message: String? = null) = MinerStats(
            minerId = minerId,
            state = MinerState.OFFLINE,
            hashrateThs = 0.0,
            avgHashrateThs = 0.0,
            powerW = 0.0,
            efficiencyJTh = 0.0,
            maxTempC = 0.0,
            boards = emptyList(),
            fanRpms = emptyList(),
            hydro = null,
            pools = emptyList(),
            uptimeSeconds = 0,
            errorMessage = message,
        )
    }
}

/** A configured miner paired with its latest stats (null until first poll). */
data class MinerWithStats(
    val miner: Miner,
    val stats: MinerStats?,
)
