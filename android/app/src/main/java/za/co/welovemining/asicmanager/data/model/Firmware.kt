package za.co.welovemining.asicmanager.data.model

/**
 * The firmware running on a miner. Each value maps to a concrete
 * [za.co.welovemining.asicmanager.data.remote.firmware.MinerApiClient] adapter.
 */
enum class FirmwareType(val displayName: String) {
    BRAIINS("Braiins OS+"),
    VNISH("VNish"),
    AVALON("Avalon / CGMiner"),
    BITMAIN("Bitmain stock"),
    UNKNOWN("Unknown");

    companion object {
        fun fromId(id: String?): FirmwareType =
            entries.firstOrNull { it.name.equals(id, ignoreCase = true) } ?: UNKNOWN
    }
}

/** Whether a miner uses fan (air) or hydro (water) cooling. */
enum class CoolingType(val displayName: String) {
    AIR("Air"),
    HYDRO("Hydro");
}
