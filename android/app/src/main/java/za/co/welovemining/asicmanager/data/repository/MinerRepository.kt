package za.co.welovemining.asicmanager.data.repository

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import za.co.welovemining.asicmanager.data.connection.ActiveLink
import za.co.welovemining.asicmanager.data.connection.ConnectionMode
import za.co.welovemining.asicmanager.data.mock.MockData
import za.co.welovemining.asicmanager.data.model.FirmwareType
import za.co.welovemining.asicmanager.data.model.Miner
import za.co.welovemining.asicmanager.data.model.MinerStats
import za.co.welovemining.asicmanager.data.model.MinerWithStats
import za.co.welovemining.asicmanager.data.remote.cgminer.CgminerSocketClient
import za.co.welovemining.asicmanager.data.remote.firmware.AvalonClient
import za.co.welovemining.asicmanager.data.remote.firmware.BraiinsClient
import za.co.welovemining.asicmanager.data.remote.firmware.HttpJsonClient
import za.co.welovemining.asicmanager.data.remote.firmware.MinerApiClient
import za.co.welovemining.asicmanager.data.remote.firmware.VnishClient
import za.co.welovemining.asicmanager.data.remote.gateway.GatewayClient
import za.co.welovemining.asicmanager.data.settings.AppSettings

/** Result of one fleet poll, including which transport answered. */
data class FleetResult(
    val items: List<MinerWithStats>,
    val link: ActiveLink,
)

/**
 * The brain of the data layer. Picks the right firmware adapter per miner,
 * resolves whether to go direct-on-LAN or via the tunnel gateway, and returns a
 * single normalized fleet snapshot the UI can render without caring about any
 * of it. Demo mode short-circuits to [MockData].
 */
class MinerRepository(
    httpClient: HttpJsonClient,
    cgminer: CgminerSocketClient,
) {
    private val gateway = GatewayClient(httpClient)

    private val clients: Map<FirmwareType, MinerApiClient> = mapOf(
        FirmwareType.BRAIINS to BraiinsClient(cgminer),
        FirmwareType.VNISH to VnishClient(httpClient),
        FirmwareType.AVALON to AvalonClient(cgminer),
        // Bitmain stock keeps the cgminer socket enabled on most builds.
        FirmwareType.BITMAIN to BraiinsClient(cgminer),
        // Unidentified cgminer responders are handled by the general Braiins-style
        // adapter (summary + temps + fans + tunerstatus) rather than Avalon's
        // proprietary parser — far more likely to be correct.
        FirmwareType.UNKNOWN to BraiinsClient(cgminer),
    )

    fun clientFor(firmware: FirmwareType): MinerApiClient =
        clients[firmware] ?: clients.getValue(FirmwareType.UNKNOWN)

    /** Poll the whole fleet once. [tick] only matters for the demo wave. */
    suspend fun pollFleet(settings: AppSettings, miners: List<Miner>, tick: Long): FleetResult {
        if (settings.demoMode) {
            return FleetResult(MockData.fleet(tick), ActiveLink.LAN)
        }
        return when (settings.connectionMode) {
            ConnectionMode.GATEWAY -> pollGateway(settings, miners)
            ConnectionMode.LAN -> FleetResult(pollLan(miners), ActiveLink.LAN)
            ConnectionMode.AUTO -> {
                val lan = pollLan(miners)
                val anyOnline = lan.any { it.stats?.isOnline == true }
                if (anyOnline || settings.gatewayUrl.isBlank()) {
                    FleetResult(lan, ActiveLink.LAN)
                } else {
                    pollGateway(settings, miners)
                }
            }
        }
    }

    private suspend fun pollLan(miners: List<Miner>): List<MinerWithStats> = coroutineScope {
        miners.map { miner ->
            async {
                val stats = clientFor(miner.firmware).fetchStats(miner)
                    .getOrElse { MinerStats.offline(miner.id, it.message) }
                MinerWithStats(miner, stats)
            }
        }.map { it.await() }
    }

    private suspend fun pollGateway(settings: AppSettings, miners: List<Miner>): FleetResult {
        if (settings.gatewayUrl.isBlank()) {
            return FleetResult(miners.map { MinerWithStats(it, MinerStats.offline(it.id, "No gateway configured")) }, ActiveLink.OFFLINE)
        }
        val fleet = gateway.fetchFleet(settings.gatewayUrl, settings.gatewayToken.ifBlank { null })
        return fleet.fold(
            onSuccess = { FleetResult(it, ActiveLink.GATEWAY) },
            onFailure = { e ->
                FleetResult(
                    miners.map { MinerWithStats(it, MinerStats.offline(it.id, e.message)) },
                    ActiveLink.OFFLINE,
                )
            },
        )
    }

    suspend fun reboot(settings: AppSettings, link: ActiveLink, miner: Miner): Result<Unit> {
        if (settings.demoMode) return Result.success(Unit)
        return if (link == ActiveLink.GATEWAY) {
            gateway.reboot(settings.gatewayUrl, settings.gatewayToken.ifBlank { null }, miner.id)
        } else {
            clientFor(miner.firmware).reboot(miner)
        }
    }

    suspend fun locate(settings: AppSettings, link: ActiveLink, miner: Miner, on: Boolean): Result<Unit> {
        if (settings.demoMode) return Result.success(Unit)
        return if (link == ActiveLink.GATEWAY) {
            gateway.locate(settings.gatewayUrl, settings.gatewayToken.ifBlank { null }, miner.id, on)
        } else {
            clientFor(miner.firmware).locate(miner, on)
        }
    }
}
