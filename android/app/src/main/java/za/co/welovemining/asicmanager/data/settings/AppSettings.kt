package za.co.welovemining.asicmanager.data.settings

import kotlinx.serialization.Serializable
import za.co.welovemining.asicmanager.data.connection.ConnectionMode

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
) {
    companion object {
        val DEFAULT = AppSettings()
    }
}
