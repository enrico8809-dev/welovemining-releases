package za.co.welovemining.asicmanager.data.remote.firmware

import za.co.welovemining.asicmanager.data.model.Miner
import za.co.welovemining.asicmanager.data.model.MinerStats
import za.co.welovemining.asicmanager.data.model.PoolStat

/**
 * The seam every firmware integration implements. The repository talks only to
 * this interface, so adding LuxOS, Hiveon, Whatsminer etc. later is a matter of
 * dropping in a new adapter — nothing else in the app needs to change.
 *
 * All calls are suspend functions and are expected to be safe to call off the
 * main thread. Implementations should translate transport/parse failures into a
 * [Result.failure] rather than throwing.
 */
interface MinerApiClient {

    /** Poll a single normalized stats snapshot. */
    suspend fun fetchStats(miner: Miner): Result<MinerStats>

    /** Soft-reboot / restart the mining process. */
    suspend fun reboot(miner: Miner): Result<Unit>

    /** Pause hashing without rebooting (where supported). */
    suspend fun pause(miner: Miner): Result<Unit> =
        Result.failure(UnsupportedOperationException("pause not supported by this firmware"))

    /** Resume hashing after a pause. */
    suspend fun resume(miner: Miner): Result<Unit> =
        Result.failure(UnsupportedOperationException("resume not supported by this firmware"))

    /** Read the current pool configuration. */
    suspend fun fetchPools(miner: Miner): Result<List<PoolStat>>

    /** Replace the pool configuration. */
    suspend fun setPools(miner: Miner, pools: List<PoolConfig>): Result<Unit> =
        Result.failure(UnsupportedOperationException("pool config not supported by this firmware"))

    /** Toggle the device locator LED, where supported. */
    suspend fun locate(miner: Miner, on: Boolean): Result<Unit> =
        Result.failure(UnsupportedOperationException("locator not supported by this firmware"))
}

/** A pool entry to write back to a miner. */
data class PoolConfig(
    val url: String,
    val user: String,
    val password: String = "x",
)
