package za.co.welovemining.asicmanager.data.connection

/**
 * How the app currently reaches the fleet.
 *
 *  - [LAN]     direct firmware APIs on the local network (fastest, full feature set).
 *  - [GATEWAY] through the Cloudflare-tunnel-exposed aggregator when off-site.
 *  - [AUTO]    try LAN first, fall back to gateway (the default).
 */
enum class ConnectionMode { AUTO, LAN, GATEWAY }

/** Resolved connection state surfaced to the UI. */
enum class ActiveLink { LAN, GATEWAY, OFFLINE }

/** A resolved base endpoint for talking to a single miner or the gateway. */
data class Endpoint(
    val scheme: String,
    val host: String,
    val port: Int,
) {
    val httpBase: String get() = "$scheme://$host:$port"
}
