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
import za.co.welovemining.asicmanager.data.remote.firmware.CgminerClient
import za.co.welovemining.asicmanager.data.remote.firmware.HttpJsonClient
import za.co.welovemining.asicmanager.data.remote.firmware.MinerApiClient
import za.co.welovemining.asicmanager.data.remote.firmware.VnishClient
import za.co.welovemining.asicmanager.data.remote.gateway.GatewayClient
import za.co.welovemining.asicmanager.data.settings.AppSettings
import za.co.welovemining.asicmanager.data.settings.Site

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

    // One unified cgminer adapter handles Braiins / Avalon / Bitmain / unknown
    // by merging every command's output — robust to firmware mis-labelling.
    private val cgminerClient = CgminerClient(cgminer)

    private val clients: Map<FirmwareType, MinerApiClient> = mapOf(
        FirmwareType.BRAIINS to cgminerClient,
        FirmwareType.VNISH to VnishClient(httpClient),
        FirmwareType.AVALON to cgminerClient,
        FirmwareType.BITMAIN to cgminerClient,
        FirmwareType.UNKNOWN to cgminerClient,
    )

    fun clientFor(firmware: FirmwareType): MinerApiClient =
        clients[firmware] ?: clients.getValue(FirmwareType.UNKNOWN)

    /** Poll the whole fleet once. [tick] only matters for the demo wave. */
    suspend fun pollFleet(settings: AppSettings, miners: List<Miner>, tick: Long): FleetResult {
        if (settings.demoMode) {
            return FleetResult(MockData.fleet(tick), ActiveLink.LAN)
        }
        // Site Managers configured → they ARE the fleet (one site for a client,
        // every client site for the WLM operator).
        if (settings.sites.isNotEmpty()) {
            return pollSites(settings.sites)
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

    /** Fetch every configured site in parallel and merge into one fleet. */
    private suspend fun pollSites(sites: List<Site>): FleetResult = coroutineScope {
        val items = sites.map { site ->
            async {
                gateway.fetchFleet(site.url, site.token.ifBlank { null }).fold(
                    onSuccess = { list ->
                        list.map { mw ->
                            mw.copy(miner = mw.miner.copy(
                                id = "${site.id}$SITE_SEP${mw.miner.id}",
                                // Keep the source-provided group (a Hub already
                                // groups by client site); fall back to this site's name.
                                groupName = mw.miner.groupName.ifBlank { site.name },
                            ))
                        }
                    },
                    onFailure = { e ->
                        val id = "${site.id}$SITE_SEP-unreachable"
                        listOf(MinerWithStats(
                            Miner(id = id, name = "${site.name} — unreachable", lanHost = site.url, groupName = site.name),
                            MinerStats.offline(id, e.message),
                        ))
                    },
                )
            }
        }.map { it.await() }.flatten()
        val link = if (items.any { it.stats?.isOnline == true }) ActiveLink.GATEWAY else ActiveLink.OFFLINE
        FleetResult(items, link)
    }

    /** Resolve a site-prefixed miner id back to (site, original id). */
    private fun siteFor(settings: AppSettings, minerId: String): Pair<Site, String>? {
        val sep = minerId.indexOf(SITE_SEP)
        if (sep < 0) return null
        val site = settings.sites.firstOrNull { it.id == minerId.substring(0, sep) } ?: return null
        return site to minerId.substring(sep + 1)
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
        siteFor(settings, miner.id)?.let { (site, id) ->
            return gateway.reboot(site.url, site.token.ifBlank { null }, id)
        }
        return if (link == ActiveLink.GATEWAY) {
            gateway.reboot(settings.gatewayUrl, settings.gatewayToken.ifBlank { null }, miner.id)
        } else {
            clientFor(miner.firmware).reboot(miner)
        }
    }

    suspend fun locate(settings: AppSettings, link: ActiveLink, miner: Miner, on: Boolean): Result<Unit> {
        if (settings.demoMode) return Result.success(Unit)
        siteFor(settings, miner.id)?.let { (site, id) ->
            return gateway.locate(site.url, site.token.ifBlank { null }, id, on)
        }
        return if (link == ActiveLink.GATEWAY) {
            gateway.locate(settings.gatewayUrl, settings.gatewayToken.ifBlank { null }, miner.id, on)
        } else {
            clientFor(miner.firmware).locate(miner, on)
        }
    }

    companion object {
        /** Separator between site id and the site-local miner id. */
        const val SITE_SEP = "~"
    }
}
