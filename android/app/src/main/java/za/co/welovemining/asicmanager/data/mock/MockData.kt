package za.co.welovemining.asicmanager.data.mock

import za.co.welovemining.asicmanager.data.model.BoardStat
import za.co.welovemining.asicmanager.data.model.CoolingType
import za.co.welovemining.asicmanager.data.model.FirmwareType
import za.co.welovemining.asicmanager.data.model.HydroStat
import za.co.welovemining.asicmanager.data.model.Miner
import za.co.welovemining.asicmanager.data.model.MinerState
import za.co.welovemining.asicmanager.data.model.MinerStats
import za.co.welovemining.asicmanager.data.model.MinerWithStats
import za.co.welovemining.asicmanager.data.model.PoolStat
import kotlin.math.sin
import kotlin.random.Random

/**
 * A believable demo fleet so the dashboard is alive before any real hardware is
 * configured. Stats jitter slightly on each poll to mimic live telemetry.
 */
object MockData {

    val miners: List<Miner> = listOf(
        demo("s21h-01", "S21 Hydro #1", "Antminer S21 Hydro", FirmwareType.BRAIINS, CoolingType.HYDRO, "Hydro Row A"),
        demo("s21h-02", "S21 Hydro #2", "Antminer S21 Hydro", FirmwareType.BRAIINS, CoolingType.HYDRO, "Hydro Row A"),
        demo("s21xph-01", "S21 XP Hydro", "Antminer S21 XP Hydro", FirmwareType.VNISH, CoolingType.HYDRO, "Hydro Row A"),
        demo("s23h-01", "S23 Hydro #1", "Antminer S23 Hydro", FirmwareType.VNISH, CoolingType.HYDRO, "Hydro Row B"),
        demo("s19xp-01", "S19 XP #1", "Antminer S19 XP", FirmwareType.BRAIINS, CoolingType.AIR, "Air Shelf 1"),
        demo("s19jpro-01", "S19j Pro", "Antminer S19j Pro", FirmwareType.VNISH, CoolingType.AIR, "Air Shelf 1"),
        demo("s21-01", "S21 Air #1", "Antminer S21", FirmwareType.BRAIINS, CoolingType.AIR, "Air Shelf 2"),
        demo("avalon-01", "Avalon A1566", "AvalonMiner A1566", FirmwareType.AVALON, CoolingType.AIR, "Air Shelf 2"),
    )

    private fun demo(
        id: String, name: String, model: String,
        fw: FirmwareType, cooling: CoolingType, group: String,
    ) = Miner(
        id = id, name = name, lanHost = "192.168.1.${id.hashCode().and(0x7f) + 10}",
        model = model, firmware = fw, cooling = cooling, groupName = group,
    )

    /** Nominal TH/s by model family. */
    private fun nominal(model: String): Double = when {
        "S23" in model -> 580.0
        "S21 XP" in model -> 270.0
        "S21" in model -> 200.0
        "S19 XP" in model -> 140.0
        "S19j" in model -> 104.0
        "Avalon" in model -> 185.0
        else -> 110.0
    }

    fun fleet(tick: Long = 0): List<MinerWithStats> = miners.map { miner ->
        MinerWithStats(miner, statsFor(miner, tick))
    }

    fun statsFor(miner: Miner, tick: Long): MinerStats {
        // One miner intentionally offline to exercise the warning UI.
        if (miner.id == "s19jpro-01") return MinerStats.offline(miner.id, "No response on port 4028")

        val rnd = Random(miner.id.hashCode() + tick / 4)
        val nominalThs = nominal(miner.model)
        val wave = sin(tick / 6.0 + miner.id.hashCode().toDouble()) * 0.015
        val hashrate = nominalThs * (1.0 + wave + rnd.nextDouble(-0.01, 0.01))
        val hydro = miner.cooling == CoolingType.HYDRO
        val efficiency = if (hydro) 16.0 else 18.5
        val power = hashrate * efficiency * rnd.nextDouble(0.99, 1.01)

        val boardCount = if ("Avalon" in miner.model) 3 else 3
        val baseTemp = if (hydro) 52.0 else 68.0
        val boards = (0 until boardCount).map { i ->
            val t = baseTemp + rnd.nextDouble(-3.0, 4.0) + i
            BoardStat(
                index = i,
                hashrateThs = hashrate / boardCount,
                chipTempC = t + 6,
                boardTempC = t,
                chipsWorking = 660,
                chipsTotal = 660,
                frequencyMhz = if (hydro) 720.0 else 525.0,
                voltageMv = 13_200.0,
            )
        }
        val maxTemp = boards.maxOf { maxOf(it.chipTempC, it.boardTempC) }

        return MinerStats(
            minerId = miner.id,
            state = if (maxTemp > 88) MinerState.WARNING else MinerState.ONLINE,
            hashrateThs = hashrate,
            avgHashrateThs = nominalThs * (1.0 + wave * 0.5),
            powerW = power,
            efficiencyJTh = power / hashrate,
            maxTempC = maxTemp,
            boards = boards,
            fanRpms = if (hydro) emptyList() else List(4) { 4_200 + rnd.nextInt(-200, 200) },
            hydro = if (hydro) HydroStat(
                inletTempC = 28.0 + rnd.nextDouble(-1.0, 1.0),
                outletTempC = 41.0 + rnd.nextDouble(-1.0, 2.0),
                flowLpm = 7.0 + rnd.nextDouble(-0.4, 0.4),
                pumpRpm = 2_900 + rnd.nextInt(-100, 100),
            ) else null,
            pools = listOf(
                PoolStat(0, "stratum+tcp://btc.welovemining.co.za:3333", "wlm.${miner.id}", "Alive", 128_400 + tick, 42),
                PoolStat(1, "stratum+tcp://btc-backup.welovemining.co.za:3333", "wlm.${miner.id}", "Standby", 0, 0),
            ),
            uptimeSeconds = 3_600 * 36 + tick * 10,
            model = miner.model,
            firmwareVersion = miner.firmware.displayName,
        )
    }
}
