package za.co.welovemining.asicmanager

import android.app.Application
import za.co.welovemining.asicmanager.di.AppContainer

/** Owns the single [AppContainer] for the process. */
class WlmApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
