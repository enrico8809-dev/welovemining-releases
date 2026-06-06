package za.co.welovemining.asicmanager.data.model

import kotlinx.serialization.Serializable

/**
 * A configured miner in the fleet. This is the persisted identity of a
 * device — the live readings live in [MinerStats].
 */
@Serializable
data class Miner(
    val id: String,
    val name: String,
    /** LAN address, e.g. 192.168.1.50 — used when on the same network. */
    val lanHost: String,
    /** Optional per-miner port override for the firmware API. */
    val port: Int? = null,
    val model: String = "",
    val firmware: FirmwareType = FirmwareType.UNKNOWN,
    val cooling: CoolingType = CoolingType.AIR,
    /** Credentials for firmwares that require auth (VNish, Bitmain, Braiins web). */
    val username: String = "root",
    val password: String = "",
    val groupName: String = "Default",
)
