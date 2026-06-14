package za.co.welovemining.asicmanager.data.settings

import kotlinx.serialization.Serializable
import za.co.welovemining.asicmanager.data.connection.ConnectionMode

/**
 * One mining site running a WLM Site Manager. A client configures their own
 * site; the WLM operator configures every client's site and gets a combined
 * all-sites view.
 */
@Serializable
data class Site(
    val id: String,
    val name: String,
    /** Public address of the Site Manager, e.g. https://client1.welovemining.co.za */
    val url: String,
    /** The site's app access token (shown by the Site Manager installer). */
    val token: String = "",
)

/** All persisted user configuration for the app. */
@Serializable
data class AppSettings(
    val connectionMode: ConnectionMode = ConnectionMode.AUTO,
    /** Public hostname of the Cloudflare-tunnel gateway, e.g. https://miners.example.com */
    val gatewayUrl: String = "",
    /** Bearer / Cloudflare Access token presented to the gateway. */
    val gatewayToken: String = "",
    /** CIDR used for LAN discovery, e.g. 192.168.1.0/24 */
    val lanSubnet: String = "192.168.1.0/24",
    /** Poll cadence in seconds. */
    val pollIntervalSec: Int = 10,
    /** Temperature (°C) at which a miner is flagged. */
    val tempWarnC: Int = 80,
    /** Show built-in demo fleet instead of contacting real hardware. */
    val demoMode: Boolean = true,
    /** Connected Site Managers. When non-empty these drive the whole app. */
    val sites: List<Site> = emptyList(),
) {
    companion object {
        val DEFAULT = AppSettings()
    }
}
